#!/usr/bin/env npx tsx
/**
 * Reasoning-pool drain CLI (Z11d.d, plan §6).
 *
 * The mechanical half of the `/reasoning-fill` skill. The *authoring*
 * half — composing a response to each pending prompt — is the Claude
 * Code session's (or its dispatched subagent's) job; this script
 * surfaces what needs authoring and gates what was authored.
 *
 * Usage:
 *   npx tsx scripts/reasoning-fill.ts list     [--pool <dir>]
 *   npx tsx scripts/reasoning-fill.ts validate [--pool <dir>]
 *
 * `list` — print every pending request (full prompt text + expected
 *   response shape) as JSON, so a fill author can walk them.
 * `validate` — for each pending fingerprint with a filled response:
 *   admit (drop the pending file) or reject (move the fill to
 *   rejected/, keep the pending file so the prompt stays visible).
 *
 * I-OneBoundary: the single `Effect.runPromise` under Z11d lives at
 * this entry point. Adapter internals stay Effect-native.
 */

import path from 'path';
import { promises as fs } from 'fs';
import { Effect, Either } from 'effect';
import {
  DEFAULT_POOL_DIR,
  listPending,
  poolPaths,
  readFilledResponse,
  rejectFilled,
  removePending,
} from '../product/reasoning/pool/pool-store';
import { parsePendingRequest, type PendingRequest } from '../product/reasoning/pool/pending-request';
import type { FilledResponse } from '../product/reasoning/pool/filled-response';
import { validateFillAgainstShape } from '../product/reasoning/pool/validate-fill';
import { foldPoolError, type PoolError } from '../product/reasoning/pool/errors';

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('--') ? args[0] : 'list';
const poolFlagIndex = args.indexOf('--pool');
const poolDir = poolFlagIndex >= 0 && args[poolFlagIndex + 1]
  ? path.resolve(args[poolFlagIndex + 1]!)
  : path.resolve(DEFAULT_POOL_DIR);

const describePoolError = (error: PoolError): string =>
  foldPoolError(error, {
    needsFill: (e) => `needs-fill: ${e.pendingPath}`,
    filledMalformed: (e) => `malformed: ${e.reason}`,
    filledSchemaMismatch: (e) => `schema-mismatch: expected ${e.expected}`,
    poolIoFailed: (e) => `io-failed: ${e.path}: ${e.cause}`,
  });

const readPending = (fp: string): Effect.Effect<PendingRequest | null, never> =>
  Effect.tryPromise({
    try: () => fs.readFile(poolPaths(poolDir).pendingPath(fp), 'utf8'),
    catch: () => null,
  }).pipe(
    Effect.map((raw) => {
      try {
        const parsed = parsePendingRequest(JSON.parse(raw) as unknown);
        return Either.isRight(parsed) ? parsed.right : null;
      } catch {
        return null;
      }
    }),
    Effect.catchAll(() => Effect.succeed(null)),
  );

interface ListEntry {
  readonly promptFingerprint: string;
  readonly op: string;
  readonly requestedAt: string;
  readonly callsite: { readonly module: string; readonly purpose: string };
  readonly expectedResponseShape: PendingRequest['expectedResponseShape'];
  readonly model: string;
  readonly temperature: number;
  readonly promptText: string;
  readonly filledAlready: boolean;
}

const listProgram = Effect.gen(function* () {
  const fingerprints = yield* listPending(poolDir).pipe(
    Effect.catchAll(() => Effect.succeed([] as readonly string[])),
  );
  const entries: ListEntry[] = [];
  for (const fp of fingerprints) {
    const pending = yield* readPending(fp);
    if (pending === null) continue;
    const filled = yield* readFilledResponse(poolDir, fp).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    entries.push({
      promptFingerprint: pending.promptFingerprint,
      op: pending.op,
      requestedAt: pending.requestedAt,
      callsite: pending.callsite,
      expectedResponseShape: pending.expectedResponseShape,
      model: pending.model,
      temperature: pending.temperature,
      promptText: pending.promptText,
      filledAlready: filled !== null,
    });
  }
  return {
    poolDir,
    pendingCount: entries.length,
    fillTarget: poolPaths(poolDir).filledDir,
    requests: entries,
  };
});

interface ValidationOutcome {
  readonly promptFingerprint: string;
  readonly outcome: 'admitted' | 'rejected' | 'unfilled';
  readonly detail?: string;
}

const validateProgram = Effect.gen(function* () {
  const fingerprints = yield* listPending(poolDir).pipe(
    Effect.catchAll(() => Effect.succeed([] as readonly string[])),
  );
  const outcomes: ValidationOutcome[] = [];
  for (const fp of fingerprints) {
    const pending = yield* readPending(fp);
    if (pending === null) {
      outcomes.push({ promptFingerprint: fp, outcome: 'rejected', detail: 'pending envelope unreadable' });
      continue;
    }
    const filled: Either.Either<FilledResponse | null, PoolError> = yield* readFilledResponse(poolDir, fp).pipe(
      Effect.map((value): Either.Either<FilledResponse | null, PoolError> => Either.right(value)),
      Effect.catchAll((error: PoolError) => Effect.succeed(Either.left(error))),
    );
    if (Either.isLeft(filled)) {
      // Filled file exists but is malformed JSON / bad envelope.
      yield* rejectFilled(poolDir, fp, describePoolError(filled.left)).pipe(
        Effect.catchAll(() => Effect.void),
      );
      outcomes.push({ promptFingerprint: fp, outcome: 'rejected', detail: describePoolError(filled.left) });
      continue;
    }
    if (filled.right === null) {
      outcomes.push({ promptFingerprint: fp, outcome: 'unfilled' });
      continue;
    }
    const verdict = validateFillAgainstShape(pending, filled.right);
    if (Either.isLeft(verdict)) {
      yield* rejectFilled(poolDir, fp, describePoolError(verdict.left)).pipe(
        Effect.catchAll(() => Effect.void),
      );
      outcomes.push({ promptFingerprint: fp, outcome: 'rejected', detail: describePoolError(verdict.left) });
      continue;
    }
    yield* removePending(poolDir, fp).pipe(Effect.catchAll(() => Effect.void));
    outcomes.push({ promptFingerprint: fp, outcome: 'admitted' });
  }
  const admitted = outcomes.filter((o) => o.outcome === 'admitted').length;
  const rejected = outcomes.filter((o) => o.outcome === 'rejected').length;
  const unfilled = outcomes.filter((o) => o.outcome === 'unfilled').length;
  return { poolDir, admitted, rejected, unfilled, outcomes };
});

async function main(): Promise<void> {
  if (command !== 'list' && command !== 'validate') {
    process.stderr.write(`reasoning-fill: unknown command '${command}' (expected list | validate)\n`);
    process.exitCode = 1;
    return;
  }
  const result = command === 'list'
    ? await Effect.runPromise(listProgram)
    : await Effect.runPromise(validateProgram);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
