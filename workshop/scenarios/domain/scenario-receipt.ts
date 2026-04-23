/**
 * ScenarioReceipt — append-only evidence artifact.
 *
 * Per docs/v2-scenario-corpus-plan.md §3.4, a receipt aggregates a
 * scenario's full execution: the trace (per-step outcomes), the
 * invariant outcomes, the verdict, and provenance (which harness,
 * substrate version, timing).
 *
 * The envelope extends WorkflowMetadata<'evidence'> + carries
 * `kind: 'scenario-receipt'` + `scope: 'scenario'`. Lineage's
 * `parents` carries per-step probe-receipt artifact fingerprints;
 * `sources` carries `scenario:<id>` for traceability.
 */

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { Invariant, InvariantOutcome } from './invariant';
import type { ScenarioTrace } from './scenario-trace';
import type { ScenarioVerdict } from './scenario';

export interface ScenarioReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'scenario-receipt';
  readonly scope: 'scenario';
  readonly payload: {
    readonly scenarioId: string;
    readonly scenarioFingerprint: Fingerprint<'scenario'>;
    readonly trace: ScenarioTrace;
    readonly invariantOutcomes: readonly {
      readonly invariant: Invariant;
      readonly outcome: InvariantOutcome;
    }[];
    readonly verdict: ScenarioVerdict;
    readonly provenance: ScenarioProvenance;
  };
}

export interface ScenarioProvenance {
  readonly harness: 'scenario-dry' | 'scenario-fixture-replay' | 'scenario-playwright-live';
  readonly substrateVersion: string;
  readonly manifestVersion: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly totalElapsedMs: number;
}
