/**
 * ClaudeCodeSessionReasoning — the composite pool adapter
 * (Z11d.b, plan §5.1). The end-to-end useful form:
 *
 *   replay first → on cache miss, record the pending request →
 *   halt the current step with a failure-shaped receipt.
 *
 * Cache-hit flow per plan §8.2: a prompt whose fill landed under
 * `<poolDir>/filled/<fp>.json` replays deterministically with a
 * real `ReasoningReceipt` (`provider: 'claude-code-session'`);
 * a miss writes `pending/<fp>.json` for the next fill pass and
 * the step routes to needs-human through the pipeline's normal
 * no-match path. Concurrent compiles racing on the same prompt
 * land exactly one pending file (rename atomicity) and are both
 * resolved by the same fill.
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
import { foldPoolError, type PoolError } from '../pool/errors';
import { CLAUDE_CODE_SESSION_PROVIDER, failurePayload } from './pool-bridge';
import {
  recordPendingReceipt,
  resolvePoolOptions,
  type RecordReasoningOptions,
} from './record-reasoning';
import { attemptReplay, poolErrorRationale } from './replay-reasoning';

export type ClaudeCodeSessionReasoningOptions = RecordReasoningOptions;

export function createClaudeCodeSessionReasoning(
  options?: ClaudeCodeSessionReasoningOptions,
): ReasoningService {
  const resolved = resolvePoolOptions(options);

  const attempt = <Op extends ReasoningOp>(
    op: Op,
    request: ReasoningRequestByOp[Op],
  ): Effect.Effect<ReasoningReceipt<Op>, never, never> =>
    attemptReplay(op, request, resolved).pipe(
      Effect.flatMap((outcome) =>
        Either.match(outcome, {
          onLeft: (poolError: PoolError) =>
            foldPoolError(poolError, {
              // Miss → record the pending request, then halt.
              needsFill: () => recordPendingReceipt(op, request, resolved),
              // Bad fill was moved to rejected/ by the replay
              // attempt; re-pend immediately so one run suffices.
              filledMalformed: () => recordPendingReceipt(op, request, resolved),
              filledSchemaMismatch: () => recordPendingReceipt(op, request, resolved),
              // IO failure: halt without recording (recording would
              // hit the same surface).
              poolIoFailed: () =>
                Effect.succeed(
                  buildReceipt({
                    op,
                    provider: CLAUDE_CODE_SESSION_PROVIDER,
                    model: resolved.model,
                    tokens: ZERO_TOKENS,
                    latencyMs: 0,
                    promptFingerprint: '',
                    payload: failurePayload(op, poolErrorRationale(poolError), ''),
                    tokensSource: 'unknown',
                    latencyMeasured: false,
                  }),
                ),
            }),
          onRight: (receipt) => Effect.succeed(receipt),
        }),
      ),
    );

  return {
    select: (request: SelectRequest) => attempt('select', request),
    interpret: (request: InterpretRequest) => attempt('interpret', request),
    synthesize: (request: SynthesisRequest) => attempt('synthesize', request),
  } satisfies ReasoningService;
}
