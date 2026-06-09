/**
 * ReplayReasoning adapter (Z11d.b, plan §5.1).
 *
 * Second-stage adapter of the file-mediated triad: cache hits
 * against `<poolDir>/filled/<fp>.json` synthesize a real
 * `ReasoningReceipt<Op>` with `provider: 'claude-code-session'`,
 * token counts lifted from the fill's estimate (`tokensSource:
 * 'estimated'`) and `latencyMeasured: false` — session cadence is
 * not API cadence (plan §1.2).
 *
 * Read-only: a cache miss does NOT write a pending file (that is
 * RecordReasoning's job; the composite stitches them). A fill that
 * exists but violates the op's response contract is moved to
 * `rejected/` (audit-preserving), which re-pends the prompt on the
 * next recording run — self-healing per plan §9.3.
 */

import { Effect, Either } from 'effect';
import {
  buildReceipt,
  type InterpretRequest,
  type ReasoningOp,
  type ReasoningReceipt,
  type ReasoningRequestByOp,
  type ReasoningService,
  type SelectRequest,
  type SynthesisRequest,
  ZERO_TOKENS,
} from '../reasoning';
import { poolPaths, readFilledResponse, rejectFilled } from '../pool/pool-store';
import { foldPoolError, needsFill, type PoolError } from '../pool/errors';
import { promptFingerprint } from '../pool/fingerprint';
import {
  CLAUDE_CODE_SESSION_PROVIDER,
  buildPendingRequest,
  failurePayload,
  parseFillIntoPayload,
} from './pool-bridge';
import {
  resolvePoolOptions,
  type RecordReasoningOptions,
  type ResolvedPoolOptions,
} from './record-reasoning';

export type ReplayReasoningOptions = RecordReasoningOptions;

/** One replay attempt: Right(receipt) on cache hit, Left(PoolError)
 *  on miss / malformed / mismatch. Shared with the composite, which
 *  folds Left(needs-fill) into a recording pass. */
export function attemptReplay<Op extends ReasoningOp>(
  op: Op,
  request: ReasoningRequestByOp[Op],
  resolved: ResolvedPoolOptions,
): Effect.Effect<Either.Either<ReasoningReceipt<Op>, PoolError>, never, never> {
  // Rendering the pending envelope (pure) is the one source of truth
  // for the fingerprint; replay recomputes it rather than persisting.
  const pending = buildPendingRequest(op, request, resolved, resolved.now());
  const fp = promptFingerprint(op, pending.promptText, resolved.model, resolved.temperature, pending.closedParams);

  const program: Effect.Effect<Either.Either<ReasoningReceipt<Op>, PoolError>, PoolError, never> =
    Effect.gen(function* () {
      const filled = yield* readFilledResponse(resolved.poolDir, fp);
      if (filled === null) {
        return Either.left(needsFill(fp, poolPaths(resolved.poolDir).pendingPath(fp)));
      }
      const parsed = parseFillIntoPayload(op, request, filled);
      if (Either.isLeft(parsed)) {
        // Bad fill: move to rejected/ so the next recording run
        // re-pends; surface the mismatch to this caller.
        yield* rejectFilled(
          resolved.poolDir,
          fp,
          foldPoolError(parsed.left, {
            needsFill: () => 'unexpected needs-fill during parse',
            filledMalformed: (e) => e.reason,
            filledSchemaMismatch: (e) => e.expected,
            poolIoFailed: (e) => e.cause,
          }),
        ).pipe(Effect.catchAll(() => Effect.void));
        return Either.left(parsed.left);
      }
      return Either.right(
        buildReceipt({
          op,
          provider: CLAUDE_CODE_SESSION_PROVIDER,
          model: resolved.model,
          tokens: {
            prompt: filled.estimatedTokens.prompt,
            completion: filled.estimatedTokens.response,
            total: filled.estimatedTokens.prompt + filled.estimatedTokens.response,
          },
          latencyMs: 0,
          promptFingerprint: fp,
          payload: parsed.right,
          tokensSource: filled.estimatedTokens.source,
          latencyMeasured: false,
        }),
      );
    });

  return program.pipe(
    Effect.catchAll((poolError: PoolError) => {
      const left: Either.Either<ReasoningReceipt<Op>, PoolError> = Either.left(poolError);
      return Effect.succeed(left);
    }),
  );
}

export function poolErrorRationale(poolError: PoolError): string {
  return foldPoolError(poolError, {
    needsFill: (e) => `needs-fill: no filled response for ${e.promptFingerprint}; fill pass pending at ${e.pendingPath}`,
    filledMalformed: (e) => `needs-fill: fill for ${e.promptFingerprint} was malformed (${e.reason}); moved to rejected/`,
    filledSchemaMismatch: (e) => `needs-fill: fill for ${e.promptFingerprint} schema-mismatched (${e.expected}); moved to rejected/`,
    poolIoFailed: (e) => `pool-io-failed: ${e.path}: ${e.cause}`,
  });
}

/** Read-only adapter: cache hits proceed; misses halt the step
 *  without recording. */
export function createReplayReasoning(options?: ReplayReasoningOptions): ReasoningService {
  const resolved = resolvePoolOptions(options);

  const attempt = <Op extends ReasoningOp>(
    op: Op,
    request: ReasoningRequestByOp[Op],
  ): Effect.Effect<ReasoningReceipt<Op>, never, never> =>
    attemptReplay(op, request, resolved).pipe(
      Effect.map((outcome) =>
        Either.match(outcome, {
          onLeft: (poolError: PoolError): ReasoningReceipt<Op> =>
            buildReceipt({
              op,
              provider: CLAUDE_CODE_SESSION_PROVIDER,
              model: resolved.model,
              tokens: ZERO_TOKENS,
              latencyMs: 0,
              promptFingerprint: foldPoolError(poolError, {
                needsFill: (e) => e.promptFingerprint,
                filledMalformed: (e) => e.promptFingerprint,
                filledSchemaMismatch: (e) => e.promptFingerprint,
                poolIoFailed: () => '',
              }),
              payload: failurePayload(op, poolErrorRationale(poolError), ''),
              tokensSource: 'unknown',
              latencyMeasured: false,
            }),
          onRight: (receipt) => receipt,
        }),
      ),
    );

  return {
    select: (request: SelectRequest) => attempt('select', request),
    interpret: (request: InterpretRequest) => attempt('interpret', request),
    synthesize: (request: SynthesisRequest) => attempt('synthesize', request),
  } satisfies ReasoningService;
}
