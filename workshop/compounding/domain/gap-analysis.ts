/**
 * GapReport — per-cycle coverage analysis.
 *
 * Per docs/v2-compounding-engine-plan.md §3.6, the Z5 gap-analysis
 * derivation reads the current receipt set + the manifest's verb
 * catalog and emits two parallel gap lists:
 *
 *   - probeGaps    — (verb, facetKind, errorFamily?) triples with
 *                    no passing probe receipt this cycle.
 *   - scenarioGaps — topologies whose authored invariants have no
 *                    passing scenario receipt this cycle.
 *
 * The `tesseract compounding improve` CLI (Z8) ranks these gaps
 * by graduation distance and suggests authoring priorities.
 *
 * No Effect imports.
 */

/** A missing (verb, facetKind[, errorFamily]) probe surface. */
export interface ProbeGap {
  readonly verb: string;
  readonly facetKind: string;
  /** Null when the gap targets a no-error-family surface. */
  readonly errorFamily: string | null;
}

/** A topology whose authored invariants have no passing receipts. */
export interface ScenarioGap {
  readonly topologyId: string;
  readonly uncoveredInvariants: readonly string[];
}

/** The full gap report carried by the scoreboard. */
export interface GapReport {
  readonly probeGaps: readonly ProbeGap[];
  readonly scenarioGaps: readonly ScenarioGap[];
  /** ISO-8601 timestamp of the scoreboard computation. */
  readonly generatedAt: string;
}
