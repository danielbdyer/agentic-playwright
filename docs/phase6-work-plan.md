# Phase 6 Work Plan — Learning and Evaluation

## Goal

Phase 6 closes the learning loop. The system already emits `GroundedSpecFragment`, `ReplayExample`, and `TrainingCorpusManifest` artifacts from compile and run pipelines (Phase 5). Phase 6 makes those artifacts *actionable* by adding:

1. **Replay evaluation** — re-execute captured replay examples, compare outcomes, and measure reproducibility.
2. **Corpus health and coverage analysis** — surface which runtimes, screens, and action families have adequate training signal and which are thin.
3. **Proposal ranking** — rank pending proposals by expected scorecard impact using offline evidence, not runtime inference.
4. **Knowledge bottleneck detection** — identify where additional knowledge authoring would reduce resolution cost the most.
5. **Evaluation scorecard integration** — feed learning metrics into the benchmark scorecard so the dogfood loop can measure its own improvement rate.

All Phase 6 work lives in the offline evaluation lane. It reads from existing artifacts and writes to `.tesseract/learning/`. It never writes to canonical knowledge paths and never contaminates the deterministic compiler core.

## Invariants

From `docs/seams-and-invariants.md`, four invariants must hold:

| # | Invariant | Test method |
|---|-----------|-------------|
| 1 | **Fragment provenance completeness** — every `GroundedSpecFragment` keys to `graphNodeIds` and `selectorRefs` | Validation: reject fragments without refs |
| 2 | **Corpus manifest determinism** — same run records → same manifest | Law test: deterministic derivation |
| 3 | **Replay reproducibility** — replaying an example with the same knowledge produces the same resolution receipts | Integration test: run, capture, replay, compare |
| 4 | **Learning-canon separation** — learning artifacts never write to canonical knowledge paths | Architecture test: scan learning output paths |

Every work package below must preserve all four invariants. Tests are added incrementally as each WP lands.

## Dependency map

```
WP1 (corpus health)
  └─▶ WP3 (bottleneck detection)
        └─▶ WP5 (scorecard integration)

WP2 (replay evaluation)
  └─▶ WP4 (proposal ranking)
        └─▶ WP5 (scorecard integration)

WP6 (invariant tests) runs after each WP
```

WP1 and WP2 are independent and can proceed in parallel.

---

## WP1 — Corpus Health and Coverage Analysis

### Purpose

Surface the quality, coverage, and distribution of the training corpus so operators and agents can see where signal is strong and where it is thin.

### Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `CorpusHealthReport` | `.tesseract/learning/health.json` | Per-runtime coverage metrics |
| Scorecard extension | Existing `BenchmarkScorecard` | New `learningHealth` section |

### Type additions (`lib/domain/types/learning.ts`)

```typescript
export interface CorpusHealthReport {
  readonly kind: 'corpus-health-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly manifestFingerprint: string;
  readonly runtimeCoverage: ReadonlyArray<RuntimeCoverageEntry>;
  readonly screenCoverage: ReadonlyArray<ScreenCoverageEntry>;
  readonly actionFamilyCoverage: ReadonlyArray<ActionFamilyCoverageEntry>;
  readonly thinScreens: readonly string[];
  readonly thinActionFamilies: readonly string[];
  readonly fragmentProvenanceCompleteness: number; // 0–1
}

export interface RuntimeCoverageEntry {
  readonly runtime: LearningRuntime;
  readonly fragmentCount: number;
  readonly scenarioCount: number;
  readonly uniqueScreenCount: number;
  readonly uniqueActionCount: number;
  readonly avgConfidenceDistribution: Readonly<Record<GroundedSpecFragment['confidence'], number>>;
}

export interface ScreenCoverageEntry {
  readonly screen: string;
  readonly fragmentCount: number;
  readonly runtimes: readonly LearningRuntime[];
  readonly actionFamilies: readonly string[];
  readonly thin: boolean;
}

export interface ActionFamilyCoverageEntry {
  readonly action: string;
  readonly fragmentCount: number;
  readonly screenCount: number;
  readonly avgConfidence: number;
  readonly thin: boolean;
}
```

### Implementation (`lib/application/learning-health.ts`)

Pure function:

```
projectCorpusHealth(manifest, fragments[], catalog) → CorpusHealthReport
```

- Load all fragment files indexed by the manifest.
- Group by runtime, screen (via `graphNodeIds`), and action family.
- Compute coverage rates, confidence distributions, and provenance completeness (fraction of fragments with non-empty `graphNodeIds` AND `selectorRefs`).
- Tag screens with fewer than 3 fragments as thin. Tag action families with fewer than 2 fragments as thin.
- Write to `.tesseract/learning/health.json`.

### Schema and validation

Add `CorpusHealthReportSchema` to `lib/domain/schemas/learning.ts`. Add decoder to `lib/domain/validation/learning.ts`.

### Tests

- **Law test**: same manifest + fragments → same health report (determinism).
- **Coverage completeness**: a fragment with empty `graphNodeIds` lowers `fragmentProvenanceCompleteness` below 1.0.
- **Thin detection**: a screen with exactly 2 fragments is tagged thin; one with 4 is not.

### Files touched

- `lib/domain/types/learning.ts` — add types
- `lib/domain/schemas/learning.ts` — add schema
- `lib/domain/validation/learning.ts` — add decoder
- `lib/application/learning-health.ts` — new module
- `lib/application/paths.ts` — add `learningHealthPath`
- `tests/learning-health.spec.ts` — new test file

---

## WP2 — Replay Evaluation Pipeline

### Purpose

Re-execute a captured `ReplayExample` against the current knowledge layer, compare resolution receipts to the original, and emit a structured evaluation record that measures reproducibility and drift.

### Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `ReplayEvaluationResult` | `.tesseract/learning/evaluations/{adoId}.{runId}.eval.json` | Per-replay comparison result |
| `ReplayEvaluationSummary` | `.tesseract/learning/evaluations/summary.json` | Aggregate evaluation metrics |

### Type additions (`lib/domain/types/learning.ts`)

```typescript
export interface ReplayEvaluationResult {
  readonly kind: 'replay-evaluation-result';
  readonly version: 1;
  readonly adoId: string;
  readonly runId: string;
  readonly originalRunId: string;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly originalKnowledgeFingerprint: string;
  readonly knowledgeChanged: boolean;
  readonly stepCount: number;
  readonly matchedStepCount: number;
  readonly driftedStepCount: number;
  readonly reproducibilityScore: number; // 0–1
  readonly stepResults: ReadonlyArray<ReplayStepResult>;
  readonly evaluatedAt: string;
}

export interface ReplayStepResult {
  readonly stepIndex: number;
  readonly originalWinningSource: string;
  readonly replayWinningSource: string;
  readonly originalTarget: string;
  readonly replayTarget: string;
  readonly matched: boolean;
  readonly driftFields: readonly string[];
}

export interface ReplayEvaluationSummary {
  readonly kind: 'replay-evaluation-summary';
  readonly version: 1;
  readonly generatedAt: string;
  readonly totalExamples: number;
  readonly evaluatedExamples: number;
  readonly avgReproducibilityScore: number;
  readonly knowledgeChangedCount: number;
  readonly perfectReplayCount: number;
  readonly driftedReplayCount: number;
  readonly byRuntime: ReadonlyArray<{
    readonly runtime: LearningRuntime;
    readonly count: number;
    readonly avgReproducibility: number;
  }>;
}
```

### Implementation (`lib/application/replay-evaluation.ts`)

```
evaluateReplayExample(example, paths, catalog) → Effect<ReplayEvaluationResult>
evaluateAllReplays(paths) → Effect<ReplayEvaluationSummary>
```

**`evaluateReplayExample`**:
1. Load the `ReplayExample` and its referenced receipt files (`receiptRefs`).
2. Load current knowledge catalog.
3. Re-interpret the scenario using `interpretScenarioFromPlan` (dry-run mode, no execution).
4. Compare each step's resolution receipt against the original receipt (winning source, target, governance, confidence).
5. Compute reproducibility score = matched steps / total steps.
6. Emit `ReplayEvaluationResult`.

**`evaluateAllReplays`**:
1. Load manifest, enumerate all replay examples.
2. Run `evaluateReplayExample` for each.
3. Aggregate into `ReplayEvaluationSummary`.

This is the core Phase 6 invariant #3 (replay reproducibility) made operational.

### Tests

- **Reproducibility law**: replay with unchanged knowledge → reproducibility = 1.0, all steps matched.
- **Drift detection**: modify one hint, replay → drifted step count > 0, `knowledgeChanged = true`.
- **Summary aggregation**: N examples → correct average and counts.

### Files touched

- `lib/domain/types/learning.ts` — add types
- `lib/domain/schemas/learning.ts` — add schemas
- `lib/domain/validation/learning.ts` — add decoders
- `lib/application/replay-evaluation.ts` — new module
- `lib/application/paths.ts` — add `learningEvaluationsDir`, `replayEvaluationPath`, `replayEvaluationSummaryPath`
- `tests/replay-evaluation.spec.ts` — new test file

---

## WP3 — Knowledge Bottleneck Detection

### Purpose

Identify where additional knowledge authoring would reduce resolution cost the most, by analyzing fragment provenance gaps, thin-screen patterns, and repair-recovery hotspots.

### Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `KnowledgeBottleneckReport` | `.tesseract/learning/bottlenecks.json` | Ranked bottleneck list |

### Type additions (`lib/domain/types/learning.ts`)

```typescript
export interface KnowledgeBottleneckReport {
  readonly kind: 'knowledge-bottleneck-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly bottlenecks: ReadonlyArray<KnowledgeBottleneck>;
  readonly topScreens: readonly string[];
  readonly topActionFamilies: readonly string[];
}

export interface KnowledgeBottleneck {
  readonly rank: number;
  readonly screen: string;
  readonly element: string | null;
  readonly actionFamily: string;
  readonly signal: BottleneckSignal;
  readonly impactScore: number; // 0–1, higher = more impactful to fix
  readonly recommendedArtifacts: readonly string[];
}

export type BottleneckSignal =
  | 'thin-screen-coverage'
  | 'repair-recovery-hotspot'
  | 'low-provenance-completeness'
  | 'high-unresolved-rate'
  | 'translation-fallback-dominant';
```

### Implementation (`lib/application/learning-bottlenecks.ts`)

Pure function:

```
projectBottlenecks(healthReport, fragments[], catalog, runRecords[]) → KnowledgeBottleneckReport
```

1. Start from `CorpusHealthReport` thin screens and thin action families (WP1 output).
2. Cross-reference with repair-recovery fragments: screens with high repair-recovery fragment density are hotspots.
3. Cross-reference with run records: screens where `winningSource` is predominantly `translation` or `agentic` (not `approved-knowledge`) signal missing knowledge.
4. Score each bottleneck by `impactScore` = weighted combination of:
   - fragment gap (inverse of coverage)
   - repair-recovery density
   - translation/agentic fallback rate
   - unresolved step rate
5. Rank by impact score descending.
6. Recommend artifact types: `hints.yaml` for element gaps, `surface.yaml` for screen gaps, `pattern.yaml` for action family gaps.

### Tests

- **Ranking determinism**: same inputs → same bottleneck ordering.
- **Signal coverage**: each `BottleneckSignal` variant appears in test output given appropriate inputs.
- **Impact monotonicity**: a screen with more repair-recovery fragments ranks higher than one with fewer, all else equal.

### Files touched

- `lib/domain/types/learning.ts` — add types
- `lib/application/learning-bottlenecks.ts` — new module
- `tests/learning-bottlenecks.spec.ts` — new test file

---

## WP4 — Proposal Ranking

### Purpose

Rank pending proposals by expected scorecard impact using offline evidence. This is the E3 backlog item from `BACKLOG.md` realized through Phase 6 infrastructure.

### Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `ProposalRankingReport` | `.tesseract/learning/rankings.json` | Ranked proposal list with scores |

### Type additions (`lib/domain/types/learning.ts`)

```typescript
export interface ProposalRankingReport {
  readonly kind: 'proposal-ranking-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly rankings: ReadonlyArray<RankedProposal>;
  readonly totalPending: number;
  readonly totalRanked: number;
}

export interface RankedProposal {
  readonly rank: number;
  readonly proposalId: string;
  readonly adoId: string;
  readonly artifactType: string;
  readonly expectedImpact: ProposalImpactEstimate;
  readonly overallScore: number; // 0–1
  readonly rationale: readonly string[];
}

export interface ProposalImpactEstimate {
  readonly affectedScenarioCount: number;
  readonly affectedScreens: readonly string[];
  readonly bottleneckReduction: number; // 0–1, how much this reduces top bottleneck
  readonly expectedReproducibilityDelta: number; // 0–1 improvement
  readonly trustPolicyDecision: string;
}
```

### Implementation (`lib/application/learning-rankings.ts`)

Pure function:

```
rankProposals(proposals[], bottleneckReport, healthReport, catalog) → ProposalRankingReport
```

1. Filter proposals to `pending` activation status.
2. For each proposal, compute impact estimate:
   - `affectedScenarioCount`: count scenarios that reference the proposal's target screen/element.
   - `bottleneckReduction`: if the proposal targets a bottleneck screen, estimate the coverage improvement.
   - `expectedReproducibilityDelta`: based on whether the target screen/element appears in drifted replay results.
   - `trustPolicyDecision`: from the proposal's existing trust-policy evaluation.
3. Score = weighted sum of impact dimensions, with trust-policy-allowed proposals weighted higher than review-required.
4. Rank by score descending.
5. Generate rationale strings explaining the ranking.

### Guardrails

- This module is strictly read-only. It does not activate, approve, or mutate any proposal.
- It does not call any LLM or external service.
- It operates over stored artifacts only.

### Tests

- **Ranking determinism**: same inputs → same ranking.
- **Trust-policy weighting**: an allowed proposal outranks a review-required proposal with equal impact.
- **Bottleneck correlation**: a proposal targeting the #1 bottleneck screen ranks higher than one targeting a well-covered screen.

### Files touched

- `lib/domain/types/learning.ts` — add types
- `lib/application/learning-rankings.ts` — new module
- `tests/learning-rankings.spec.ts` — new test file

---

## WP5 — Evaluation Scorecard Integration

### Purpose

Wire WP1–WP4 outputs into the benchmark scorecard, operator inbox, and dogfood loop so the learning layer's health and proposals are visible through the same surfaces operators already use.

### Scorecard extensions (`BenchmarkScorecard`)

Add a `learning` section to the existing scorecard:

```typescript
learning: {
  corpusFragmentCount: number;
  replayExampleCount: number;
  avgReproducibilityScore: number;
  fragmentProvenanceCompleteness: number;
  thinScreenCount: number;
  thinActionFamilyCount: number;
  topBottleneckScreen: string | null;
  topBottleneckImpact: number;
  rankedProposalCount: number;
  topProposalId: string | null;
  topProposalScore: number;
} | null;
```

### Implementation

1. **`lib/application/benchmark.ts`**: extend `scorecardForBenchmark` to accept optional `CorpusHealthReport`, `ReplayEvaluationSummary`, `KnowledgeBottleneckReport`, and `ProposalRankingReport`. Populate the `learning` section when available. Return `null` when not.

2. **`lib/application/learning.ts`**: add a top-level orchestrator:
   ```
   projectLearningEvaluation(paths) → Effect<LearningEvaluationResult>
   ```
   This calls WP1–WP4 in dependency order:
   - `projectCorpusHealth` → `evaluateAllReplays` → `projectBottlenecks` → `rankProposals`
   Returns all four reports.

3. **`lib/application/dogfood.ts`**: after each iteration, call `projectLearningEvaluation` and include learning metrics in the dogfood ledger.

4. **Scorecard markdown**: add a "Learning" section to `renderScorecardMarkdown` showing key metrics.

5. **Operator inbox**: add a new inbox item kind `learning-bottleneck` that surfaces the top 3 bottlenecks as actionable items.

### Tests

- **Scorecard round-trip**: scorecard with learning section serializes and deserializes correctly.
- **Dogfood integration**: dogfood loop iteration includes learning metrics.
- **Inbox integration**: bottleneck inbox items appear when bottleneck report has entries.

### Files touched

- `lib/domain/types/projection.ts` — extend `BenchmarkScorecard`
- `lib/application/benchmark.ts` — consume learning reports
- `lib/application/learning.ts` — add `projectLearningEvaluation`
- `lib/application/dogfood.ts` — integrate learning evaluation
- `lib/application/operator.ts` — add bottleneck inbox items
- `tests/learning-integration.spec.ts` — new test file

---

## WP6 — Phase 6 Invariant Tests

### Purpose

Prove all four Phase 6 invariants hold after the full work plan is complete.

### Tests (`tests/learning-invariants.spec.ts`)

1. **Fragment provenance completeness** (Invariant 1):
   - Generate fragments from a known scenario.
   - Assert every fragment has non-empty `graphNodeIds` OR the test rejects it.
   - Assert `fragmentProvenanceCompleteness` = 1.0 for a valid corpus.
   - Assert fragments with empty `graphNodeIds` produce completeness < 1.0.

2. **Corpus manifest determinism** (Invariant 2):
   - Build a manifest from a fixed set of fragment files.
   - Rebuild the manifest from the same files in a different order.
   - Assert both manifests are identical (after normalizing `generatedAt`).

3. **Replay reproducibility** (Invariant 3):
   - Compile and run a scenario to produce a replay example.
   - Replay with the same knowledge.
   - Assert `reproducibilityScore = 1.0` and zero drifted steps.

4. **Learning-canon separation** (Invariant 4):
   - Run `projectLearningEvaluation` on a test corpus.
   - Scan all file writes.
   - Assert no writes to canonical paths (`knowledge/`, `controls/`, `scenarios/`, `.ado-sync/`).
   - Assert all writes are under `.tesseract/learning/`.

### Files touched

- `tests/learning-invariants.spec.ts` — new test file

---

## Execution order and milestones

| Order | WP | Milestone | Key deliverable |
|-------|-----|-----------|-----------------|
| 1a | WP1 | Corpus health visible | `health.json` with coverage metrics |
| 1b | WP2 | Replay evaluation operational | `evaluations/summary.json` with reproducibility scores |
| 2 | WP3 | Bottleneck detection | `bottlenecks.json` with ranked action items |
| 3 | WP4 | Proposal ranking | `rankings.json` with scored proposals |
| 4 | WP5 | Scorecard integration | Learning metrics in benchmark scorecard and dogfood ledger |
| 5 | WP6 | Invariant proof | All four invariants passing in CI |

## Architectural constraints

- **Pure domain**: all new types go in `lib/domain/types/learning.ts`. No side effects.
- **Effect orchestration**: all I/O through `Effect.gen` and `FileSystem` port. No `runPromise` outside composition root.
- **Immutable data**: `readonly` on all new interface fields. No mutable accumulation.
- **Envelope convention**: new artifacts follow the standard envelope header (`kind`, `version`, `generatedAt`, etc.).
- **No LLM calls**: Phase 6 is offline evaluation over stored artifacts. DSPy/GEPA integration is future work that builds on this foundation.
- **No canonical writes**: the learning layer reads canon but never writes to it. Proposals flow through existing trust-policy gates.

## Pre-existing test failures

The current suite has 11 pre-existing failures in `compiler.spec.ts` (run/harvest/replay tests that depend on runtime schema changes). Phase 6 work should not increase this count. WP6 invariant tests are additive and independent of these failures.

## Success criteria

Phase 6 is complete when:

1. An operator can run `npm run learning` (or equivalent) and get a corpus health report, replay evaluation summary, bottleneck list, and proposal rankings.
2. The benchmark scorecard includes a `learning` section with reproducibility, coverage, and bottleneck metrics.
3. The dogfood loop measures its own learning improvement rate per iteration.
4. All four Phase 6 invariants pass as automated tests.
5. No learning artifact writes to canonical knowledge paths.
