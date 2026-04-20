/**
 * Probe IR — the intermediate representation the workshop derives
 * from `product/manifest/manifest.json` plus per-verb fixture
 * specifications.
 *
 * Per `docs/v2-direction.md §6 Step 5` and `docs/v2-substrate.md
 * §6a`, a `Probe` is a synthetic work item whose shape derives
 * from a `TestableSurface` — the tuple `(verb, inputShape,
 * outputShape, errorFamilies, compositionPath)`. Each probe
 * carries enough information to run through `product/`'s normal
 * authoring flow and to be checked against an expected
 * run-record shape afterward.
 *
 * Pure types — no Effect, no IO. Consumers: the probe-derivation
 * walker and the spike coverage harness.
 */

/** Classification a probe expects when the verb completes. */
export type ProbeClassification = 'matched' | 'failed' | 'ambiguous';

/** Expectation shape for a probe. */
export interface ProbeExpectation {
  readonly classification: ProbeClassification;
  /** Named error family for `failed` / `ambiguous` probes; `null`
   *  for `matched` probes that expect no error. */
  readonly errorFamily: string | null;
}

/** Lightweight coverage tag used by the workshop's
 *  probe-coverage metric. Attached to a fixture via the
 *  `exercises[]` list and collected by the coverage report. */
export interface ProbeExercise {
  /** Optional rung identifier (for verbs that walk a ladder). */
  readonly rung?: string;
  /** Optional error-family the probe exercises. */
  readonly errorFamily?: string | null;
}

/** One fixture entry parsed from a `<verb>.probe.yaml` file. */
export interface ProbeFixture {
  /** Slug unique within the file — composes into the probe ID. */
  readonly name: string;
  /** Prose description read by humans and the agent. */
  readonly description: string;
  /** The parsed-intent shape the verb expects. Validated against
   *  the manifest's input descriptor at derivation time. */
  readonly input: unknown;
  /** Optional pre-conditions the probe wants before the verb runs.
   *  For the Step 5 spike, world-setup is carried as opaque data. */
  readonly worldSetup?: unknown;
  readonly expected: ProbeExpectation;
  readonly exercises?: readonly ProbeExercise[];
}

/** A fixture file: one verb, ≥1 fixture. */
export interface ProbeFixtureDocument {
  /** Manifest verb name — must match an entry in
   *  `product/manifest/manifest.json`. */
  readonly verb: string;
  readonly schemaVersion: number;
  readonly fixtures: readonly ProbeFixture[];
  /** When true, this verb is hard to fixture mechanically and the
   *  workshop should skip probe synthesis. Unfixturable verbs do
   *  not count against the 100% coverage gate but they count as a
   *  risk surface. */
  readonly syntheticInput?: boolean;
  /** Path the document was loaded from, repo-rooted. Added by the
   *  loader; not present in the YAML itself. */
  readonly declaredIn: string;
}

/** One probe synthesized from a (manifest verb × fixture) pair. */
export interface Probe {
  /** Stable identity — `probe:<verb>:<fixture-name>`. */
  readonly id: string;
  /** The verb this probe exercises. */
  readonly verb: string;
  /** The fixture the probe was derived from. */
  readonly fixtureName: string;
  /** Path to the declaring fixture file (repo-rooted). */
  readonly declaredIn: string;
  /** Classification the probe expects. */
  readonly expected: ProbeExpectation;
  /** Parsed-intent input the probe submits. */
  readonly input: unknown;
  /** World-setup preconditions, if declared. */
  readonly worldSetup: unknown;
  /** Exercises this probe ticks on the coverage report. */
  readonly exercises: readonly ProbeExercise[];
}

/** Result of the probe derivation pass. */
export interface ProbeDerivation {
  readonly probes: readonly Probe[];
  /** Verbs whose manifest entry has NO fixture document — they
   *  surface on the coverage report as uncovered. */
  readonly uncoveredVerbs: readonly string[];
  /** Verbs explicitly flagged `syntheticInput: true`. These do
   *  NOT count as uncovered but DO count against the risk surface. */
  readonly unfixturableVerbs: readonly string[];
}

/** Spike coverage verdict. Produced by running the probes and
 *  reducing the run records. */
export interface SpikeCoverageReport {
  readonly totalDeclaredVerbs: number;
  readonly coveredVerbs: number;
  readonly uncoveredVerbs: readonly string[];
  readonly unfixturableVerbs: readonly string[];
  readonly totalProbes: number;
  /** How many of the synthesized probes match their declared
   *  expectation when run. In the Step 5 spike the harness stubs
   *  the run; the real metric wires through at Step 6+. */
  readonly probesCompletingAsExpected: number;
  /** Coverage percentage = coveredVerbs / totalDeclaredVerbs. */
  readonly coveragePercentage: number;
  /** Pass gate = 80% per `docs/v2-substrate.md §6a`. */
  readonly passesGate: boolean;
}

/** The coverage-gate threshold per the spike protocol. */
export const COVERAGE_PASS_THRESHOLD = 0.8;

/** Compute a coverage report from a derivation pass plus the
 *  per-probe completion outcomes. Pure. */
export function summarizeCoverage(input: {
  readonly derivation: ProbeDerivation;
  readonly totalDeclaredVerbs: number;
  readonly probesCompletingAsExpected: number;
}): SpikeCoverageReport {
  const { derivation, totalDeclaredVerbs, probesCompletingAsExpected } = input;
  const coveredVerbs =
    totalDeclaredVerbs - derivation.uncoveredVerbs.length - derivation.unfixturableVerbs.length;
  const coveragePercentage =
    totalDeclaredVerbs === 0 ? 0 : coveredVerbs / totalDeclaredVerbs;
  return {
    totalDeclaredVerbs,
    coveredVerbs,
    uncoveredVerbs: derivation.uncoveredVerbs,
    unfixturableVerbs: derivation.unfixturableVerbs,
    totalProbes: derivation.probes.length,
    probesCompletingAsExpected,
    coveragePercentage,
    passesGate: coveragePercentage >= COVERAGE_PASS_THRESHOLD,
  };
}
