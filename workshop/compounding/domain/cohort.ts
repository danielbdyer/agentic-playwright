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
 * Step 11 Z11a adds a third variant:
 *
 *   - `customer-compilation` — a customer-backlog corpus slice (one
 *                              of `'resolvable'` or `'needs-human'`)
 *                              whose CompilationReceipts form the
 *                              stream. The two sub-corpuses test
 *                              complementary invariants: the
 *                              resolvable corpus probes the
 *                              happy-path resolution rate; the
 *                              needs-human corpus probes the
 *                              intervention-fidelity rate.
 *
 * `cohortKey` produces a deterministic string identity that
 * TrajectoryEntry uses to group receipts. The key is stable
 * across runs and process boundaries.
 *
 * No Effect imports — pure types + fold + key derivation.
 */

import type { ProbeSurfaceCohort } from '../../metrics/probe-surface-cohort';
import {
  probeSurfaceCohortKey,
  parseProbeSurfaceCohort,
} from '../../metrics/probe-surface-cohort';

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

/** Cohort variant identifying a customer-compilation corpus slice.
 *  The corpus tag discriminates the two evidence shapes Z11a
 *  authors:
 *    - `'resolvable'`    cases whose steps resolve fully under the
 *                        lookup chain; tested against
 *                        confirmation-rate.
 *    - `'needs-human'`   cases whose steps force the 7th lookup
 *                        slot; tested against intervention-fidelity.
 */
export interface CustomerCompilationCohort {
  readonly kind: 'customer-compilation';
  readonly corpus: 'resolvable' | 'needs-human';
}

/** The closed Cohort union. */
export type Cohort =
  | ProbeSurfaceCohortRef
  | ScenarioTrajectoryCohort
  | CustomerCompilationCohort;

/** Exhaustive Cohort fold. Adding a variant is a typecheck error
 *  until every call site adds the case. */
export function foldCohort<R>(
  cohort: Cohort,
  cases: {
    readonly probeSurface: (c: ProbeSurfaceCohortRef) => R;
    readonly scenarioTrajectory: (c: ScenarioTrajectoryCohort) => R;
    readonly customerCompilation: (c: CustomerCompilationCohort) => R;
  },
): R {
  switch (cohort.kind) {
    case 'probe-surface':         return cases.probeSurface(cohort);
    case 'scenario-trajectory':   return cases.scenarioTrajectory(cohort);
    case 'customer-compilation':  return cases.customerCompilation(cohort);
  }
}

/** Deterministic string identity used for trajectory grouping.
 *  Format per variant:
 *    probe-surface         → `probe-surface:<probeSurfaceCohortKey>`
 *    scenario-trajectory   → `scenario:<id>|topology:<topology>`
 *    customer-compilation  → `customer-compilation:corpus:<corpus>`
 *
 *  Two cohorts are comparable iff their keys are byte-equal.
 */
export function cohortKey(cohort: Cohort): string {
  return foldCohort(cohort, {
    probeSurface: (c) => `probe-surface:${probeSurfaceCohortKey(c.cohort)}`,
    scenarioTrajectory: (c) => `scenario:${c.scenarioId}|topology:${c.topologyId}`,
    customerCompilation: (c) => `customer-compilation:corpus:${c.corpus}`,
  });
}

/** Parse a cohort key back into a Cohort, returning null when
 *  the string isn't in the canonical format. Together with
 *  `cohortKey`, forms a partial Iso<Cohort, string>:
 *
 *    cohortKey(cohort) → string             (total)
 *    parseCohortKey(s) → Cohort | null      (partial)
 *
 *  Round-trip law (verified by tests/compounding/cohort-iso):
 *
 *    parseCohortKey(cohortKey(c)) ≡ c        for every Cohort c
 *
 *  The reverse round-trip is partial: not every string is a
 *  valid cohort key (the inverse parser returns null on
 *  malformed input). The total⇔partial asymmetry is the
 *  canonical "structural-projection-with-defensive-reader"
 *  pattern — same as ado-content fingerprints, snapshot
 *  signatures, and other structurally-projected identities. */
export function parseCohortKey(key: string): Cohort | null {
  if (key.startsWith('probe-surface:')) {
    const inner = parseProbeSurfaceCohort(key.slice('probe-surface:'.length));
    if (inner === null) return null;
    return { kind: 'probe-surface', cohort: inner };
  }
  if (key.startsWith('scenario:')) {
    const match = /^scenario:([^|]+)\|topology:(.+)$/.exec(key);
    if (match === null) return null;
    return {
      kind: 'scenario-trajectory',
      scenarioId: match[1]!,
      topologyId: match[2]!,
    };
  }
  if (key.startsWith('customer-compilation:corpus:')) {
    const corpus = key.slice('customer-compilation:corpus:'.length);
    if (corpus !== 'resolvable' && corpus !== 'needs-human') return null;
    return { kind: 'customer-compilation', corpus };
  }
  return null;
}
