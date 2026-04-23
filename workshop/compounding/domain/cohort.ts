/**
 * Cohort — the closed union identifying which receipt stream a
 * hypothesis evaluates against.
 *
 * Per docs/v2-compounding-engine-plan.md §3.2, the compounding
 * engine evaluates hypotheses over two kinds of receipt streams:
 *
 *   - `probe-surface`        — wraps the existing
 *                              `ProbeSurfaceCohort` (verb ×
 *                              facet-kind × error-family) that M5
 *                              already projects over.
 *   - `scenario-trajectory`  — a specific scenario (identified by
 *                              scenarioId + topologyId) whose
 *                              ScenarioReceipts form the stream.
 *
 * `cohortKey` produces a deterministic string identity that
 * TrajectoryEntry uses to group receipts. The key is stable
 * across runs and process boundaries.
 *
 * No Effect imports — pure types + fold + key derivation.
 */

import type { ProbeSurfaceCohort } from '../../metrics/probe-surface-cohort';
import { probeSurfaceCohortKey } from '../../metrics/probe-surface-cohort';

/** Cohort variant wrapping the existing probe-surface triple. */
export interface ProbeSurfaceCohortRef {
  readonly kind: 'probe-surface';
  readonly cohort: ProbeSurfaceCohort;
}

/** Cohort variant identifying a specific scenario trajectory. */
export interface ScenarioTrajectoryCohort {
  readonly kind: 'scenario-trajectory';
  readonly scenarioId: string;
  readonly topologyId: string;
}

/** The closed Cohort union. */
export type Cohort = ProbeSurfaceCohortRef | ScenarioTrajectoryCohort;

/** Exhaustive Cohort fold. Adding a variant is a typecheck error
 *  until every call site adds the case. */
export function foldCohort<R>(
  cohort: Cohort,
  cases: {
    readonly probeSurface: (c: ProbeSurfaceCohortRef) => R;
    readonly scenarioTrajectory: (c: ScenarioTrajectoryCohort) => R;
  },
): R {
  switch (cohort.kind) {
    case 'probe-surface':       return cases.probeSurface(cohort);
    case 'scenario-trajectory': return cases.scenarioTrajectory(cohort);
  }
}

/** Deterministic string identity used for trajectory grouping.
 *  Format per variant:
 *    probe-surface       → `probe-surface:<probeSurfaceCohortKey>`
 *    scenario-trajectory → `scenario:<id>|topology:<topology>`
 *
 *  Two cohorts are comparable iff their keys are byte-equal.
 */
export function cohortKey(cohort: Cohort): string {
  return foldCohort(cohort, {
    probeSurface: (c) => `probe-surface:${probeSurfaceCohortKey(c.cohort)}`,
    scenarioTrajectory: (c) => `scenario:${c.scenarioId}|topology:${c.topologyId}`,
  });
}
