/**
 * RecordReasoning adapter (Z11d.b, plan §5.1).
 *
 * First-stage adapter of the file-mediated triad: every call renders
 * the op's prompt, writes a `PendingRequest` under
 * `<poolDir>/pending/<fp>.json` (idempotently — re-recording an
 * already-pending fingerprint is a no-op), and surfaces a
 * failure-shaped receipt that halts only the current step. The
 * pipeline's normal no-match path routes the step to needs-human;
 * a fill pass (`/reasoning-fill`) later authors the response and the
 * next run replays it.
 *
 * The port's error channel stays `never` (I-PortShape): like every
 * existing adapter, failures surface through the payload. The
 * `needs-fill` ReasoningError family exists for boundaries that
 * handle raw errors; this adapter does not throw it across the port.
 */

import { Effect } from 'effect';
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
import { writePendingIfAbsent, DEFAULT_POOL_DIR } from '../pool/pool-store';
import { foldPoolError } from '../pool/errors';
import {
  CLAUDE_CODE_SESSION_PROVIDER,
  buildPendingRequest,
  failurePayload,
  type PoolBridgeOptions,
} from './pool-bridge';

export interface RecordReasoningOptions {
  readonly poolDir?: string | undefined;
  readonly model?: string | undefined;
  readonly temperature?: number | undefined;
  /** Injectable clock for deterministic tests. */
  readonly now?: (() => string) | undefined;
}

export interface ResolvedPoolOptions extends PoolBridgeOptions {
  readonly poolDir: string;
  readonly now: () => string;
}

export function resolvePoolOptions(options?: RecordReasoningOptions): ResolvedPoolOptions {
  return {
    poolDir: options?.poolDir ?? DEFAULT_POOL_DIR,
    model: options?.model ?? CLAUDE_CODE_SESSION_PROVIDER,
    temperature: options?.temperature ?? 0,
    now: options?.now ?? (() => new Date().toISOString()),
  };
}

/** Record the op's prompt as pending and produce the halting
 *  receipt. Shared with the composite adapter's miss path. */
export function recordPendingReceipt<Op extends ReasoningOp>(
  op: Op,
  request: ReasoningRequestByOp[Op],
  resolved: ResolvedPoolOptions,
): Effect.Effect<ReasoningReceipt<Op>, never, never> {
  const pending = buildPendingRequest(op, request, resolved, resolved.now());
  const receiptFor = (rationale: string): ReasoningReceipt<Op> =>
    buildReceipt({
      op,
      provider: CLAUDE_CODE_SESSION_PROVIDER,
      model: resolved.model,
      tokens: ZERO_TOKENS,
      latencyMs: 0,
      promptFingerprint: pending.promptFingerprint,
      payload: failurePayload(op, rationale, pending.promptFingerprint),
      tokensSource: 'unknown',
      latencyMeasured: false,
    });

  return writePendingIfAbsent(resolved.poolDir, pending).pipe(
    Effect.map((outcome) =>
      receiptFor(
        `needs-fill: response pending at ${outcome.pendingPath}` +
          (outcome.alreadyPending ? ' (already recorded)' : ''),
      ),
    ),
    Effect.catchAll((poolError) =>
      Effect.succeed(
        receiptFor(
          foldPoolError(poolError, {
            needsFill: (e) => `needs-fill: response pending at ${e.pendingPath}`,
            filledMalformed: (e) => `needs-fill: prior fill malformed (${e.reason})`,
            filledSchemaMismatch: (e) => `needs-fill: prior fill schema-mismatched (expected ${e.expected})`,
            poolIoFailed: (e) => `pool-io-failed: ${e.path}: ${e.cause}`,
          }),
        ),
      ),
    ),
  );
}

/** Pending-only adapter: every call records and halts the step. */
export function createRecordReasoning(options?: RecordReasoningOptions): ReasoningService {
  const resolved = resolvePoolOptions(options);
  return {
    select: (request: SelectRequest) => recordPendingReceipt('select', request, resolved),
    interpret: (request: InterpretRequest) => recordPendingReceipt('interpret', request, resolved),
    synthesize: (request: SynthesisRequest) => recordPendingReceipt('synthesize', request, resolved),
  } satisfies ReasoningService;
}
