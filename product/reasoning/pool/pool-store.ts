/**
 * Pool store — the reasoning-pool's filesystem surface (Z11d.b).
 *
 * Per `docs/v2-live-adapter-plan.md §9.3`:
 *
 * ```
 * <poolDir>/
 *   pending/<fingerprint>.json    — PendingRequest envelopes
 *   filled/<fingerprint>.json     — FilledResponse envelopes
 *   rejected/<fingerprint>.json   — schema-mismatched fills (audit)
 * ```
 *
 * Disciplines:
 * - **I-AtomicWrite** — every write is temp + rename (same pattern
 *   as `product/instruments/fs/local-fs.ts`); torn reads cannot
 *   occur under concurrent fill + compile.
 * - **I-Append** — `filled/` files are never overwritten by the
 *   adapters; corrections land as new files with `supersedes`.
 *   A schema-mismatched fill is *moved* to `rejected/` (the move
 *   preserves the artifact for audit), which re-pends the prompt
 *   on the next run.
 * - **Idempotent pending writes** — recording the same fingerprint
 *   twice is a no-op; concurrent recorders race benignly (rename
 *   atomicity means one file lands; both callers proceed).
 *
 * Effect-native. The error channel is `PoolError`; adapters fold
 * it into failure-shaped receipts at the port boundary.
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Effect, Either } from 'effect';
import { parseFilledResponse, type FilledResponse } from './filled-response';
import type { PendingRequest } from './pending-request';
import { filledMalformed, poolIoFailed, type PoolError } from './errors';

export const DEFAULT_POOL_DIR = '.tesseract/reasoning-pool';

export interface PoolPaths {
  readonly pendingDir: string;
  readonly filledDir: string;
  readonly rejectedDir: string;
  readonly pendingPath: (fp: string) => string;
  readonly filledPath: (fp: string) => string;
  readonly rejectedPath: (fp: string) => string;
}

export function poolPaths(poolDir: string): PoolPaths {
  const pendingDir = path.join(poolDir, 'pending');
  const filledDir = path.join(poolDir, 'filled');
  const rejectedDir = path.join(poolDir, 'rejected');
  return {
    pendingDir,
    filledDir,
    rejectedDir,
    pendingPath: (fp) => path.join(pendingDir, `${fp}.json`),
    filledPath: (fp) => path.join(filledDir, `${fp}.json`),
    rejectedPath: (fp) => path.join(rejectedDir, `${fp}.json`),
  };
}

const isEnoent = (error: unknown): boolean =>
  (error as { code?: string } | undefined)?.code === 'ENOENT';

const ioFail = (filePath: string) => (cause: unknown): PoolError =>
  poolIoFailed(filePath, cause instanceof Error ? cause.message : String(cause));

/** Atomic write: mkdir -p, write temp, rename into place. */
const atomicWriteJson = (filePath: string, value: unknown): Effect.Effect<void, PoolError> =>
  Effect.tryPromise({
    try: async () => {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      const tmpPath = path.join(dir, `.tmp-${crypto.randomBytes(8).toString('hex')}-${path.basename(filePath)}`);
      try {
        await fs.writeFile(tmpPath, JSON.stringify(value, null, 2), 'utf8');
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        await fs.unlink(tmpPath).catch(() => {});
        throw error;
      }
    },
    catch: ioFail(filePath),
  });

/** Read + validate `filled/<fp>.json`. `null` when no fill exists
 *  (the cache-miss signal); `FilledMalformed` when the file exists
 *  but does not parse as a FilledResponse envelope. */
export function readFilledResponse(
  poolDir: string,
  fp: string,
): Effect.Effect<FilledResponse | null, PoolError> {
  const filePath = poolPaths(poolDir).filledPath(fp);
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, 'utf8'),
    catch: (cause: unknown) => cause,
  }).pipe(
    Effect.matchEffect({
      onFailure: (cause) =>
        isEnoent(cause)
          ? Effect.succeed(null)
          : Effect.fail(ioFail(filePath)(cause)),
      onSuccess: (raw) => {
        const parsed = Effect.try({
          try: () => JSON.parse(raw) as unknown,
          catch: () => filledMalformed(fp, 'filled-response: file is not valid JSON'),
        });
        return parsed.pipe(
          Effect.flatMap((json) =>
            Either.match(parseFilledResponse(json), {
              onLeft: (error: PoolError) => Effect.fail(error),
              onRight: (value: FilledResponse) => Effect.succeed<FilledResponse | null>(value),
            }),
          ),
        );
      },
    }),
  );
}

export interface WritePendingOutcome {
  readonly pendingPath: string;
  /** True when a pending file for this fingerprint already existed
   *  (this call was a no-op — idempotent re-record). */
  readonly alreadyPending: boolean;
}

/** Record a pending request, idempotently: if `pending/<fp>.json`
 *  already exists it is left untouched (the earlier `requestedAt`
 *  wins; re-recording must not churn the file). */
export function writePendingIfAbsent(
  poolDir: string,
  pending: PendingRequest,
): Effect.Effect<WritePendingOutcome, PoolError> {
  const filePath = poolPaths(poolDir).pendingPath(pending.promptFingerprint);
  return Effect.tryPromise({
    try: () => fs.access(filePath).then(() => true, () => false),
    catch: ioFail(filePath),
  }).pipe(
    Effect.flatMap((exists): Effect.Effect<WritePendingOutcome, PoolError> =>
      exists
        ? Effect.succeed<WritePendingOutcome>({ pendingPath: filePath, alreadyPending: true })
        : atomicWriteJson(filePath, pending).pipe(
            Effect.as<WritePendingOutcome>({ pendingPath: filePath, alreadyPending: false }),
          ),
    ),
  );
}

export interface WriteFilledOutcome {
  readonly filledPath: string;
  /** True when a filled file already existed for this fingerprint
   *  (I-Append: the existing fill wins; this call was a no-op). */
  readonly alreadyFilled: boolean;
}

/** Write a filled response, append-only (I-Append): an existing
 *  `filled/<fp>.json` is never overwritten — corrections land as a
 *  new file under a new fingerprint carrying `supersedes`. */
export function writeFilledIfAbsent(
  poolDir: string,
  filled: FilledResponse,
): Effect.Effect<WriteFilledOutcome, PoolError> {
  const filePath = poolPaths(poolDir).filledPath(filled.promptFingerprint);
  return Effect.tryPromise({
    try: () => fs.access(filePath).then(() => true, () => false),
    catch: ioFail(filePath),
  }).pipe(
    Effect.flatMap((exists): Effect.Effect<WriteFilledOutcome, PoolError> =>
      exists
        ? Effect.succeed<WriteFilledOutcome>({ filledPath: filePath, alreadyFilled: true })
        : atomicWriteJson(filePath, filled).pipe(
            Effect.as<WriteFilledOutcome>({ filledPath: filePath, alreadyFilled: false }),
          ),
    ),
  );
}

/** Move a bad fill from `filled/` to `rejected/` (audit-preserving;
 *  the next compile run re-pends the prompt). The rejected envelope
 *  is wrapped with the rejection reason + timestamp. */
export function rejectFilled(
  poolDir: string,
  fp: string,
  reason: string,
): Effect.Effect<void, PoolError> {
  const paths = poolPaths(poolDir);
  const from = paths.filledPath(fp);
  const to = paths.rejectedPath(fp);
  return Effect.tryPromise({
    try: async () => {
      const raw = await fs.readFile(from, 'utf8').catch((error: unknown) => {
        if (isEnoent(error)) return null;
        throw error;
      });
      if (raw === null) return;
      await fs.mkdir(paths.rejectedDir, { recursive: true });
      const original = JSON.parse(raw) as unknown;
      const wrapped = { rejectedAt: new Date().toISOString(), reason, original };
      const tmpPath = path.join(paths.rejectedDir, `.tmp-${crypto.randomBytes(8).toString('hex')}-${fp}.json`);
      await fs.writeFile(tmpPath, JSON.stringify(wrapped, null, 2), 'utf8');
      await fs.rename(tmpPath, to);
      await fs.unlink(from).catch((error: unknown) => {
        if (!isEnoent(error)) throw error;
      });
    },
    catch: ioFail(from),
  });
}

/** Remove a consumed pending file (fill passes call this after
 *  writing the filled envelope; missing file is a no-op). */
export function removePending(
  poolDir: string,
  fp: string,
): Effect.Effect<void, PoolError> {
  const filePath = poolPaths(poolDir).pendingPath(fp);
  return Effect.tryPromise({
    try: () => fs.unlink(filePath).catch((error: unknown) => {
      if (!isEnoent(error)) throw error;
    }),
    catch: ioFail(filePath),
  }).pipe(Effect.asVoid);
}

/** List pending fingerprints (fill passes + autotelic triggers). */
export function listPending(poolDir: string): Effect.Effect<readonly string[], PoolError> {
  const { pendingDir } = poolPaths(poolDir);
  return Effect.tryPromise({
    try: () => fs.readdir(pendingDir).catch((error: unknown) => {
      if (isEnoent(error)) return [] as string[];
      throw error;
    }),
    catch: ioFail(pendingDir),
  }).pipe(
    Effect.map((entries) =>
      entries
        .filter((entry) => entry.endsWith('.json') && !entry.startsWith('.tmp-'))
        .map((entry) => entry.slice(0, -'.json'.length)),
    ),
  );
}
