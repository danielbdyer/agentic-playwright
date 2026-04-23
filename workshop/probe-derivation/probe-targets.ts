/**
 * Probe target derivation — converts a ProbeDerivation into the
 * `ProbeTarget[]` the compounding engine's gap-analysis + coverage-
 * ratio computations take as input.
 *
 * Per docs/v2-compounding-engine-plan.md §3.6 + §9.5 (ZC24), a
 * probe target is a (verb × facetKind × errorFamily) triple the
 * workshop expects probes to exercise. Until Z10b, the scoreboard
 * CLI passed an empty target list, which short-circuited
 * `probeCoverageRatio` to 1 whenever any passing probe receipt
 * existed — a vacuous 100%.
 *
 * This module closes that gap: targets are the deduped set of
 * cohort triples that the fixture corpus declares (one entry per
 * (verb, facetKind, errorFamily) combination mentioned by at
 * least one fixture). Coverage is then "every declared triple has
 * a passing receipt." When a verb adds a fixture with a new
 * error-family, a new target surface appears and the gate
 * tightens accordingly — substantive coverage, not vacuous.
 *
 * Pure derivation — no Effect, no IO.
 */

import type { ProbeDerivation } from './probe-ir';
import { inferCohort } from './probe-harness';

export interface ProbeTarget {
  readonly verb: string;
  readonly facetKind: string;
  readonly errorFamily: string | null;
}

/** Derive the canonical target set from the derivation's probe
 *  list. Targets are the deduped (verb, facetKind, errorFamily)
 *  triples across all derived probes. Stable sort order so callers
 *  get reproducible diffs across cycles. */
export function deriveProbeTargets(derivation: ProbeDerivation): readonly ProbeTarget[] {
  const seen = new Map<string, ProbeTarget>();
  for (const probe of derivation.probes) {
    const cohort = inferCohort(probe);
    const target: ProbeTarget = {
      verb: cohort.verb,
      facetKind: cohort.facetKind,
      errorFamily: cohort.errorFamily,
    };
    seen.set(targetKey(target), target);
  }
  return Array.from(seen.values()).sort((a, b) => targetKey(a).localeCompare(targetKey(b)));
}

function targetKey(t: ProbeTarget): string {
  return `${t.verb}|${t.facetKind}|${t.errorFamily ?? 'none'}`;
}
