/**
 * mintEvidenceEnvelope — shared constructor for the WorkflowEnvelope
 * shape that recurs across every receipt + record + parity-failure
 * + snapshot site.
 *
 * ## The pattern this names
 *
 * Six (and counting) constructors hand-assemble the same shape:
 *
 *   {
 *     version: 1,
 *     stage,
 *     scope,
 *     ids: {...},
 *     fingerprints: {
 *       artifact: fingerprintFor('artifact', payload),
 *       content:  fingerprintFor('content',  payload),
 *     },
 *     lineage: { sources: [...], parents: [], handshakes: [stage] },
 *     governance: 'approved',
 *     kind,
 *     payload,
 *   }
 *
 * Sites:
 *   - workshop/probe-derivation/probe-receipt.ts:probeReceipt
 *   - workshop/probe-derivation/parity-failure.ts:parityFailureRecord
 *   - workshop/substrate-study/domain/snapshot-record.ts:snapshotRecord
 *   - workshop/compounding/application/build-hypothesis-receipt.ts
 *   - workshop/scenarios/application/build-receipt.ts
 *   - workshop/compounding/emission/compile-receipt-emitter.ts
 *
 * Each site reinvents the same envelope assembly + the same
 * artifact/content fingerprinting. mintEvidenceEnvelope
 * compresses the shape, centralizes the fingerprinting, and
 * forecloses the as-Fingerprint brand-laundering anti-pattern
 * Agent C's audit flagged at build-receipt.ts:42-43 +
 * build-hypothesis-receipt.ts:48-49 (empty-string-then-overwrite
 * bypass of the phantom-tag invariant).
 *
 * ## How it composes
 *
 * Caller supplies:
 *   - the stage literal (preparation / resolution / execution /
 *     evidence / proposal / projection)
 *   - the kind discriminator (string literal)
 *   - the scope (default 'run')
 *   - the payload (the receipt/record body)
 *   - lineage hints (sources + optional parents/handshakes)
 *   - optional ids dict
 *
 * The helper computes artifact + content fingerprints from the
 * payload (sha256 of stableStringify), assembles the envelope
 * with `version: 1` + `governance: 'approved'`, and returns
 * a typed `WorkflowEnvelope<Payload, Stage>`.
 *
 * Pure domain — no Effect, no IO. Callers that need a
 * different governance value (review-required, blocked) build
 * the envelope manually; mintEvidenceEnvelope is for the
 * approved-evidence common case (90%+ of sites).
 *
 * ## Brand-laundering elimination
 *
 * The artifact/content fingerprints are minted internally via
 * fingerprintFor; callers cannot pass empty strings or smuggle
 * other-tag fingerprints into these slots. Closes the
 * "empty-string-then-overwrite" anti-pattern by removing the
 * intermediate-mutable-state opportunity entirely.
 */

import type { WorkflowEnvelope, WorkflowStage } from './workflow-types';
import type { WorkflowScope } from './workflow-types';
import { fingerprintFor } from '../kernel/hash';

export interface MintEvidenceEnvelopeInput<
  Payload,
  Stage extends WorkflowStage,
  Kind extends string,
  Scope extends WorkflowScope = 'run',
> {
  readonly stage: Stage;
  readonly kind: Kind;
  readonly scope?: Scope;
  readonly payload: Payload;
  /** Lineage entries — sources + optional parents/handshakes.
   *  When `handshakes` is omitted, defaults to `[stage]`. */
  readonly lineage: {
    readonly sources: readonly string[];
    readonly parents?: readonly string[];
    readonly handshakes?: readonly string[];
  };
  /** Optional ids dictionary (runId, scenarioId, etc.) the
   *  envelope-axis convention expects. Defaults to {}. */
  readonly ids?: Record<string, string>;
}

/** Mint a `WorkflowEnvelope<Payload, Stage>` for an approved
 *  evidence-stage artifact. Computes artifact + content
 *  fingerprints internally from the payload via fingerprintFor;
 *  callers cannot supply or override them. Pure.
 *
 *  Generics: `Stage`, `Kind`, and `Scope` are preserved as
 *  literal types so the returned envelope's properties narrow
 *  to the caller's exact discriminator/scope values (the
 *  default scope is the literal `'run'`).
 *
 *  Camp-A semantics: artifact = content = fingerprintFor(tag,
 *  payload). For Camp-B (caller-supplied projection-based
 *  fingerprints, e.g., scenarioReceiptFingerprint over a
 *  payload subset), use `mintEvidenceEnvelopeWithFingerprint`. */
export function mintEvidenceEnvelope<
  Payload,
  Stage extends WorkflowStage,
  Kind extends string,
  Scope extends WorkflowScope = 'run',
>(
  input: MintEvidenceEnvelopeInput<Payload, Stage, Kind, Scope>,
): WorkflowEnvelope<Payload, Stage> & {
  readonly kind: Kind;
  readonly scope: Scope;
} {
  return mintEvidenceEnvelopeWithFingerprint({
    ...input,
    fingerprintSource: input.payload,
  });
}

/** Camp-B variant: caller supplies the **fingerprint source**
 *  — the value used to compute both artifact + content
 *  fingerprints. Useful when the canonical receipt identity
 *  is computed over a projection of the payload (e.g., the
 *  scenario-receipt fingerprint covers only id + scenario
 *  fingerprint + verdict, not the full trace).
 *
 *  Internally calls `fingerprintFor('artifact', source)` +
 *  `fingerprintFor('content', source)` so the brand discipline
 *  is preserved — no `as unknown as` casting at call sites.
 *
 *  Closes Agent C #5's brand-laundering finding by giving
 *  Camp-B receipts a non-laundered path: rather than
 *  initializing fingerprints to empty strings + overwriting
 *  later with `as unknown as Fingerprint<'artifact'>`, the
 *  caller passes the canonical source value once and the
 *  helper mints both fingerprints correctly. */
export function mintEvidenceEnvelopeWithFingerprint<
  Payload,
  Stage extends WorkflowStage,
  Kind extends string,
  Scope extends WorkflowScope = 'run',
>(
  input: MintEvidenceEnvelopeInput<Payload, Stage, Kind, Scope> & {
    readonly fingerprintSource: unknown;
  },
): WorkflowEnvelope<Payload, Stage> & {
  readonly kind: Kind;
  readonly scope: Scope;
} {
  const { stage, kind, payload, lineage, fingerprintSource } = input;
  const scope = (input.scope ?? 'run') as Scope;
  const ids: Record<string, string> = input.ids ?? {};
  const handshakes =
    lineage.handshakes ?? ([stage] as readonly string[]);
  const parents = lineage.parents ?? [];

  return {
    version: 1,
    stage,
    scope,
    ids,
    fingerprints: {
      artifact: fingerprintFor('artifact', fingerprintSource),
      content: fingerprintFor('content', fingerprintSource),
    },
    lineage: {
      sources: lineage.sources,
      parents,
      handshakes,
    },
    governance: 'approved',
    kind,
    payload,
  } as WorkflowEnvelope<Payload, Stage> & {
    readonly kind: Kind;
    readonly scope: Scope;
  };
}
