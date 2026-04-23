/**
 * ScenarioTrace — runtime evidence accumulated as the runner walks
 * a scenario's steps.
 *
 * Per docs/v2-scenario-corpus-plan.md §3.4, the trace is the
 * runner's accumulating record. The aggregate ScenarioReceipt
 * (sibling module) carries the trace into append-only storage.
 *
 * Pure domain.
 */

import type { ProbeOutcome } from '../../probe-derivation/probe-receipt';
import type { AssertionOutcome, SubstrateAssertion } from './assertion';
import type { StepName } from './scenario';

export interface AssertionRun {
  readonly assertion: SubstrateAssertion;
  readonly outcome: AssertionOutcome;
}

export interface StepOutcome {
  readonly stepName: StepName;
  readonly probeReceiptRef: { readonly probeId: string };
  readonly observed: ProbeOutcome['observed'];
  readonly preconditionOutcomes: readonly AssertionRun[];
  readonly postconditionOutcomes: readonly AssertionRun[];
  readonly elapsedMs: number;
  readonly completedAsExpected: boolean;
}

/** Identifies the first step that diverged from expected, with the
 *  divergence kind and a human-readable detail. */
export interface StepDivergence {
  readonly stepName: StepName;
  readonly kind:
    | 'classification-mismatch'
    | 'precondition-failed'
    | 'postcondition-failed'
    | 'harness-error';
  readonly detail: string;
}

export interface ScenarioTrace {
  readonly steps: readonly StepOutcome[];
  readonly firstDivergence: StepDivergence | null;
}

/** True iff every assertion in the list held. */
export function allAssertionsHeld(runs: readonly AssertionRun[]): boolean {
  return runs.every((r) => r.outcome.kind === 'held');
}

/** Construct an empty trace. */
export const EMPTY_TRACE: ScenarioTrace = {
  steps: [],
  firstDivergence: null,
};
