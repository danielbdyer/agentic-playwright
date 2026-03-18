# Recursive Self-Improvement

This document describes how Tesseract enters a recursive self-improvement loop. It is the Level 1 doctrine: where [dogfooding-flywheel.md](./dogfooding-flywheel.md) describes the Level 0 loop (accumulate knowledge), this document describes how synthetic runs produce gradient signal that improves the pipeline code itself.

Use this document for the self-improvement model. Use [dogfooding-flywheel.md](./dogfooding-flywheel.md) for the operating model. Use [direction.md](./direction.md) for composition direction. Use [master-architecture.md](./master-architecture.md) for the north-star doctrine.

## The Two-Level Model

Tesseract has two concentric improvement loops. They share the same pipeline but differ in what they durably improve.

### Level 0: Knowledge Accumulation (dogfood loop)

```
run scenarios → generate proposals → activate into knowledge files → measure hit rate → repeat
```

The dogfood loop (`lib/application/dogfood.ts`) runs scenarios, observes where the pipeline falls back to lower-precedence resolution rungs, generates proposals for knowledge changes (new aliases, element hints, pattern entries), activates them, and re-runs. Each iteration, the knowledge hit rate rises until convergence. The durable output is **knowledge files**: `knowledge/screens/*.hints.yaml`, `knowledge/patterns/*.yaml`.

This loop improves the system's familiarity with a particular application surface. It does not improve the pipeline's ability to resolve novel intent text, score candidates, or rank proposals. It is not transferable to a new application without re-running the loop.

### Level 1: Pipeline Improvement (speedrun loop)

```
clean slate → generate synthetic scenarios → run flywheel → classify failures → change pipeline code → re-run → beat the mark? → commit or discard
```

The speedrun loop (`scripts/speedrun.ts`) wipes all synthetic artifacts, restores knowledge to git HEAD, regenerates scenarios from the knowledge model, runs the full dogfood loop from scratch, and produces a Pipeline Fitness Report that classifies every step-level failure into a taxonomy. Each failure class maps to a specific pipeline code location. The code change is the "backward pass." The scorecard (`.tesseract/benchmarks/scorecard.json`) is the monotonic high-water-mark that gates whether a code change is kept or discarded.

The durable output is **pipeline code** and the **scorecard**. Knowledge changes are ephemeral activations that exist only for the duration of the run.

### Why Level 1 Matters More

Level 0 is linear: every new application needs its own knowledge accumulation pass. Level 1 is compounding: every pipeline improvement transfers to all applications. A better translation threshold helps every future intent. A better scoring formula helps every future bottleneck detection. A better proposal ranking helps every future flywheel converge faster.

The speedrun loop is a training loop for the pipeline itself.

## The Training Analogy

This is not a metaphor. The speedrun loop has the same structure as a machine learning training loop, and the mapping is concrete at every level.

| ML Concept | Tesseract Artifact | Location |
|---|---|---|
| Model | Resolution pipeline | `lib/runtime/agent/resolution-stages.ts`, `lib/application/translate.ts`, `lib/runtime/agent/candidate-lattice.ts` |
| Parameters | 15 tunable thresholds and weights | Enumerated in [Parameter Space](#the-parameter-space) |
| Training data | Synthetic scenarios | `lib/application/synthesis/scenario-generator.ts` (regenerated each run) |
| Forward pass | Clean-slate flywheel run | `lib/application/dogfood.ts` (convergence detection, metric computation) |
| Loss function | Composite of 8 metrics | `lib/application/fitness.ts` (`buildFitnessReport`) |
| Gradient | 8 classified failure modes | `lib/domain/types/fitness.ts` (`PipelineFailureClass`) |
| Backward pass | Targeted code change at top failure mode | Manual or agent-driven |
| Learning rate | Per-knob change magnitude | Per-experiment decision |
| Epoch | One full speedrun cycle | `scripts/speedrun.ts` |
| Overfitting guard | Scenarios regenerated from knowledge model | Seeded RNG in `scenario-generator.ts` |
| Loss curve | Scorecard history | `.tesseract/benchmarks/scorecard.json` |
| Checkpoint | Git commit of pipeline code + scorecard | Monotonic: only committed if improved |

### Why This Is Not Metaphorical

In a neural network, the forward pass computes a loss from training data through the model, the gradient tells you which parameters to adjust and in which direction, and the backward pass updates parameters to reduce loss. The checkpoint is saved only if validation loss improved.

In Tesseract, the forward pass runs synthetic scenarios through the resolution pipeline from a clean slate and computes fitness metrics. The fitness report classifies failures into categories that each implicate specific parameters. A code change adjusts those parameters. The speedrun re-runs from scratch. The scorecard is updated only if knowledge hit rate improved.

The structural correspondence is exact. The difference is that "parameters" in Tesseract are source code constants, not floating-point weights, and "gradient descent" is a targeted code change rather than automatic differentiation. This means the loop currently requires human or agent judgment for the backward pass, but the gradient signal (failure classification) is already machine-readable.

### The Overfitting Guard

In ML, overfitting occurs when the model memorizes training data instead of learning generalizable patterns. In Tesseract, the equivalent risk is that pipeline changes improve hit rate for specific phrasings in the current synthetic corpus but fail on novel phrasings.

The guard is structural: synthetic scenarios are regenerated from the knowledge model each run using a seeded RNG. The generator (`lib/application/synthesis/scenario-generator.ts`) walks screen elements and picks from 8 phrasing templates per action type. Changing the seed produces different phrasings. If a pipeline change only works for one seed, it is overfitting.

To strengthen this guard over time: vary the seed across speedrun epochs and require improvement to hold across multiple seeds.

## The Parameter Space

The resolution pipeline has 15 concrete tunable parameters. These are the "weights" of the model.

### 1. Translation Overlap Threshold

**Value:** `0.34` | **File:** `lib/application/translate.ts:55`

The minimum token-overlap score for a translation candidate to be included in the ranked list. The overlap formula is `intersection / max(queryTokens, aliasTokens)`. A score of 0.34 means at least 34% of the larger token set must overlap.

**Sensitivity:** Lowering this increases recall (more candidates pass) but decreases precision (more false positives). The fitness report detects near-miss candidates in the 0.15-0.34 range as `translation-threshold-miss`.

### 2. Bottleneck Scoring Weights

**Values:** `0.30 / 0.25 / 0.25 / 0.20` | **File:** `lib/application/learning-bottlenecks.ts:43-48`

```
bottleneckScoring = 0.30 * repairDensity
                  + 0.25 * translationRate
                  + 0.25 * unresolvedRate
                  + 0.20 * (1 - screenFragmentShare)
```

These weights determine which screens and action families the bottleneck detector prioritizes. Repair density (how often recovery was needed) gets the highest weight. Fragment share (how well-covered the screen is in the learning corpus) gets the lowest.

**Sensitivity:** These weights determine which proposals get ranked highest by the proposal ranking system (which uses the top bottleneck). Misweighted signals lead to `scoring-weight-mismatch` failures.

### 3. Proposal Ranking Weights

**Values:** `0.30 / 0.30 / 0.20 / 0.20` | **File:** `lib/application/learning-rankings.ts:38-43`

```
proposalScoring = 0.30 * min(affectedScenarios / 10, 1)
                + 0.30 * bottleneckReduction
                + 0.20 * trustPolicyWeight
                + 0.20 * (hasEvidence ? 0.8 : 0.3)
```

These weights determine which proposals the system activates first. Scenario impact and bottleneck reduction share the highest weight. Trust policy alignment and evidence presence share the lower weight.

**Sensitivity:** These weights control convergence velocity. If high-impact proposals are ranked low, the loop stalls (`convergence-stall` failure).

### 4. Memory Staleness TTL

**Value:** `5` steps | **File:** `lib/runtime/agent/index.ts:31`

How many steps before the agent's screen memory is considered stale and cleared. Dynamic override: `min(10, max(3, round(stepCount * 0.3)))`.

**Sensitivity:** Too low causes unnecessary re-resolution. Too high causes stale screen references to persist into unrelated steps.

### 5. Screen Confidence Floor

**Value:** `0.35` | **File:** `lib/runtime/agent/index.ts:33`

Below this confidence, the current screen reference is cleared from agent memory. Dynamic override: `0.25` for complex graphs (>20 state nodes), `0.30` for medium (>10), `0.35` otherwise.

**Sensitivity:** Lower floors allow weaker screen references to persist, potentially improving continuity at the cost of accuracy.

### 6. Max Active Refs

**Value:** `8` | **File:** `lib/runtime/agent/index.ts:30`

Maximum number of active state, target, and assertion references in agent working memory. Dynamic override: `min(32, max(8, round(stateNodeCount * 0.5)))`.

**Sensitivity:** Higher limits let the agent carry more context but increase noise in candidate matching.

### 7. DOM Scoring Weights

**Values:** `0.35 / 0.25 / 0.20 / 0.20` | **File:** `lib/runtime/agent/dom-fallback.ts:93-96`

```
domScore = 0.35 * visibilityScore
         + 0.25 * roleNameScore
         + 0.20 * locatorQualityScore
         + 0.20 * widgetCompatibilityScore
```

These weights determine which DOM candidate wins when live exploration is needed. Visibility gets the highest weight.

**Sensitivity:** Affects only the `live-dom` resolution rung. If the pipeline is working well at higher rungs, these weights rarely matter. They become critical when deterministic resolution fails.

### 8. Alias Matching Algorithm

**Algorithm:** Longest substring match | **File:** `lib/runtime/agent/shared.ts:35-47`

`bestAliasMatch` normalizes text, then finds the alias whose normalized form appears as a substring in the intent text. The score is the alias length (longer = more specific = better).

**Sensitivity:** Length-based scoring means short aliases ("search") are deprioritized relative to long aliases ("policy number search field"). This can miss valid short matches. Alternative: token-count scoring, fuzzy matching, or TF-IDF.

### 9. Candidate List Limits

**Values:** `maxCandidates: 3`, `maxProbes: 12` | **File:** `lib/runtime/agent/dom-fallback.ts:36-40`

Maximum number of DOM candidates to consider and probes to perform during live DOM exploration.

**Sensitivity:** Higher limits increase recall but slow down resolution and increase cost.

### 10. Confidence Scaling

**Values:** `1.0` compiler-derived, `0.8` agent-verified, `0.65` agent-proposed | **File:** `lib/runtime/agent/index.ts:125`

When computing memory carry scores, the confidence of the winning source is scaled by these factors. Compiler-derived wins get full weight; agent-proposed wins are discounted.

**Sensitivity:** Lower scaling for proposed sources makes the agent less trusting of its own proposals, requiring stronger evidence before a proposal influences future resolution.

### 11. Intent Interpretation Thresholds

**Values:** `6` element, `4` screen | **File:** `lib/runtime/agent/interpret-intent.ts:91-96`

Heuristic confidence scoring: score >= threshold*2 is "high", >= threshold is "medium", below is "low". Low confidence triggers translation fallback.

**Sensitivity:** These thresholds control when the system falls back from deterministic alias matching to structured translation. Lower thresholds keep more resolution deterministic.

### 12. Precedence Weight Base

**Value:** `100` per rung | **File:** `lib/domain/precedence.ts:49`

The base weight multiplier for resolution precedence scoring: `weight(rung) = (law.length - index) * base`. Higher-precedence rungs get higher weights.

**Sensitivity:** This is a multiplier, so the relative ordering is what matters, not the absolute value. Changing the base only matters if other scoring factors compete at similar magnitudes.

### 13. Trust Policy Confidence Floors

**Values:** `0.95` elements, `0.95` postures, `0.90` hints, `0.98` snapshots, `0.95` patterns | **File:** `.tesseract/policy/trust-policy.yaml:4-34`

Minimum confidence required for a proposal to be auto-approved. Below this, proposals are flagged for review. These floors gate the Level 0 loop's ability to activate proposals.

**Sensitivity:** Lower floors activate more proposals per iteration, increasing convergence velocity but potentially admitting lower-quality knowledge. The fitness report detects over-blocking as `trust-policy-over-block`.

### 14. Proposal Confidence Values

**Values:** `0.85` translation proposals, `0.9` DOM proposals, `0.5` DOM shortlist fallback | **File:** `lib/runtime/agent/resolution-stages.ts:345,452,492`

The confidence score assigned to proposals generated by different resolution sources. Higher confidence is more likely to pass trust policy.

**Sensitivity:** If these are too low relative to trust policy floors, proposals never activate (`trust-policy-over-block`). If too high, weak proposals are auto-approved.

### 15. Convergence Threshold

**Value:** `0.01` (1% improvement) | **File:** `scripts/speedrun.ts:121`

The dogfood loop converges when the knowledge hit rate delta between iterations falls below this threshold. Also used for max-iterations (5) and budget-exhausted detection.

**Sensitivity:** Lower thresholds allow more iterations before convergence, potentially extracting more improvement but costing more compute.

## The Loss Function

The Pipeline Fitness Report (`lib/application/fitness.ts`) computes 8 metrics that together form the loss function. The primary signal is knowledge hit rate; the secondary metrics provide diagnostic depth.

### Primary: Knowledge Hit Rate

**Formula:** Average across scenarios of `(steps resolved via approved-knowledge) / (total steps)`

**Computation:** `lib/application/dogfood.ts:80-107` — iterates run records, counts steps where `interpretation.provenanceKind === 'approved-knowledge'`, divides by total steps per scenario, averages across scenarios.

**What improvement means:** More steps resolve via deterministic knowledge lookup without falling back to translation, DOM exploration, or `needs-human`. The pipeline "knows" more from the start.

### Translation Precision

**Formula:** `(translation attempts that matched) / (total translation attempts)`

**What improvement means:** When translation is invoked, it makes fewer false positive matches. The tokenization and scoring are more discriminating.

### Translation Recall

**Formula:** `(steps where translation contributed) / (total steps)`

**What improvement means:** Translation covers more of the step space. Useful when the goal is to reduce `needs-human` outcomes.

### Convergence Velocity

**Formula:** Number of completed iterations before the dogfood loop converges.

**What improvement means:** Fewer iterations needed to reach saturation. The pipeline converges faster because proposals are higher-quality and higher-impact from the start.

### Proposal Yield

**Formula:** `(proposals not blocked by trust policy) / (total proposals)`

**What improvement means:** More proposals pass trust policy on the first attempt. The pipeline generates proposals with appropriate confidence levels.

### Degraded Locator Rate

**Formula:** `(steps using fallback/degraded locators) / (total steps)`

**What improvement means:** Fewer steps rely on brittle locator strategies. The selector canon and locator ladders are more complete.

### Recovery Success Rate

**Formula:** `(recovery attempts that succeeded) / (total recovery attempts)`

**What improvement means:** When the pipeline encounters failures, its recovery strategies are more effective. The right strategy fires first.

### Resolution By Rung

**Formula:** Distribution of winning sources across the resolution precedence ladder.

**What improvement means:** More wins concentrate at higher-precedence rungs (explicit, approved-knowledge) and fewer at lower rungs (translation, live-dom, needs-human). The pipeline resolves more deterministically.

## The Gradient Signal

The Pipeline Fitness Report classifies step-level failures into 8 categories. Each category implicates specific parameters and maps to a specific code location. This is the "gradient" — it tells you what to change and roughly in which direction.

### translation-threshold-miss

**Detection:** Translation candidate scored between 0.15 and 0.34 (near-miss below threshold). `lib/application/fitness.ts:classifyFailure`

**Parameters implicated:** Translation overlap threshold (param #1)

**Code to change:** `lib/application/translate.ts:55` — the `0.34` floor in `.filter(candidate => candidate.score >= 0.34)`

**Experiment:** Binary search on [0.25, 0.40] with fixed seed, measure hit rate at each threshold.

### translation-normalization-gap

**Detection:** Translation found zero candidates for a step (score null or zero), and no higher rung matched.

**Parameters implicated:** Tokenization rules in `normalizeIntentText`

**Code to change:** `lib/domain/inference.ts` — the normalization function that lowercases, strips punctuation, and splits tokens.

**Experiment:** Add stemming or lemmatization to `normalizeIntentText`, measure whether previously zero-scoring candidates now score above threshold.

### alias-coverage-gap

**Detection:** Translation found zero candidates AND the step eventually resolved via `none` (unresolved).

**Parameters implicated:** Alias generation heuristics, hint file coverage

**Code to change:** `lib/runtime/agent/resolution-stages.ts` — the lattice builder that matches against known aliases.

**Experiment:** Auto-generate aliases from camelCase element IDs (e.g., `policyNumberInput` generates "policy number input", "policy number", "number input"). Measure reduction in alias-coverage-gap count.

### resolution-rung-skip

**Detection:** Step won via `structured-translation` or `live-dom` when a higher rung could have resolved it.

**Parameters implicated:** Strategy chain ordering, confidence thresholds for higher rungs

**Code to change:** `lib/runtime/agent/resolution-stages.ts` — stage ordering and gating conditions.

**Experiment:** Inject an overlay check before translation in the strategy chain. Measure whether steps that previously fell to translation now resolve at the overlay rung.

### scoring-weight-mismatch

**Detection:** Inferred from correlation analysis — bottleneck signals that don't correlate with actual improvement.

**Parameters implicated:** Bottleneck scoring weights (param #2)

**Code to change:** `lib/application/learning-bottlenecks.ts:43-48`

**Experiment:** Grid search the 4-weight space in 0.05 increments (bounded to sum=1.0). For each configuration, run a speedrun and record which bottleneck signal best predicted actual improvement.

### recovery-strategy-miss

**Detection:** Recovery was attempted (attempts > 0) but failed (no strategy produced `recovered`).

**Parameters implicated:** Recovery strategy ordering, strategy selection logic

**Code to change:** `lib/runtime/agent/strategy.ts` — the `runStrategyChain` recursive fold.

**Experiment:** Reorder recovery strategies based on historical success rates from prior fitness reports. Measure recovery success rate improvement.

### convergence-stall

**Detection:** Proposals were generated and activated in iteration N, but knowledge hit rate in iteration N didn't improve over N-1.

**Parameters implicated:** Proposal ranking weights (param #3), convergence threshold (param #15)

**Code to change:** `lib/application/learning-rankings.ts:38-43`

**Experiment:** Add a diversity bonus to proposal ranking: penalize proposals targeting the same screen as already-activated proposals. Measure whether convergence velocity improves.

### trust-policy-over-block

**Detection:** All proposals for a step were blocked by trust policy.

**Parameters implicated:** Trust policy confidence floors (param #13), proposal confidence values (param #14)

**Code to change:** `.tesseract/policy/trust-policy.yaml` or `lib/runtime/agent/resolution-stages.ts`

**Experiment:** Lower hints confidence floor from 0.9 to 0.7 for synthetic runs. Measure proposal yield increase and whether activated proposals are correct.

## Concrete Experiments

Each experiment is a single-knob variation with a clear hypothesis, measurement, and risk assessment.

### Experiment 1: Translation Threshold Search

**Hypothesis:** The 0.34 threshold is conservative. Lowering to 0.28-0.30 will increase knowledge hit rate by 3-5% by admitting near-miss candidates that are actually correct.

**Change:** `lib/application/translate.ts:55` — vary threshold from 0.25 to 0.40 in 0.02 increments.

**Measurement:** Primary: knowledgeHitRate. Secondary: translationPrecision (must not drop below 0.70).

**Risk:** False positive matches degrade precision. Guard: reject any threshold where precision drops more than 10 points.

### Experiment 2: Stemming in Text Normalization

**Hypothesis:** Adding Porter stemming to `normalizeIntentText` will allow "searching" to match "search", "navigating" to match "navigate", reducing translation-normalization-gap count by 20%.

**Change:** `lib/domain/inference.ts` — add stemming step after lowercasing and punctuation stripping.

**Measurement:** Primary: translation-normalization-gap count. Secondary: translationPrecision (stemming should not introduce false matches).

**Risk:** Stemming can conflate unrelated words ("policy" and "police"). Mitigation: use a conservative stemmer that only handles common suffixes (-ing, -ed, -s, -tion).

### Experiment 3: Synthetic Alias Generation from Element IDs

**Hypothesis:** Auto-generating aliases from camelCase element IDs (e.g., `policyNumberInput` → "policy number input") will reduce alias-coverage-gap by 40% without human authoring.

**Change:** `lib/runtime/agent/resolution-stages.ts` — in the lattice builder, add auto-generated aliases alongside hints-file aliases.

**Measurement:** Primary: alias-coverage-gap count. Secondary: knowledgeHitRate (should increase as more elements match).

**Risk:** Low — auto-generated aliases are additive. If they're wrong, they'll score low and be outranked by real aliases.

### Experiment 4: Bottleneck Weight Grid Search

**Hypothesis:** The current 0.30/0.25/0.25/0.20 weights may not reflect actual impact correlations. A grid search will find weights where bottleneck signals better predict improvement.

**Change:** `lib/application/learning-bottlenecks.ts:43-48` — test all combinations where weights are multiples of 0.05 and sum to 1.0.

**Measurement:** Primary: `scoringEffectiveness.bottleneckWeightCorrelations` (currently placeholder zeros — this experiment would populate them). Secondary: convergenceVelocity.

**Risk:** Medium — wrong weights could deprioritize important bottlenecks. Guard: always keep repairDensity weight >= 0.15.

### Experiment 5: Proposal Ranking Diversity Bonus

**Hypothesis:** When multiple proposals target the same screen, activating only the highest-ranked one and penalizing the rest will improve convergence velocity by focusing each iteration on diverse improvements.

**Change:** `lib/application/learning-rankings.ts` — add a `diversityRule` that penalizes proposals targeting screens that already have a higher-ranked proposal.

**Measurement:** Primary: convergenceVelocity (should decrease). Secondary: knowledgeHitRate (should be equal or higher).

**Risk:** Low — diversity bonus only reorders proposals within an iteration, doesn't remove them.

### Experiment 6: Memory Decay Parameter Sweep

**Hypothesis:** The default memory parameters (stalenessTtl=5, screenConfidenceFloor=0.35, maxActiveRefs=8) may not be optimal for synthetic scenarios with 4-6 steps.

**Change:** `lib/runtime/agent/index.ts` — test matrix: stalenessTtl [3,5,7,10] x screenConfidenceFloor [0.25,0.30,0.35].

**Measurement:** Primary: knowledgeHitRate across the matrix. Secondary: resolution-rung-skip count (stale memory causes unnecessary fallbacks).

**Risk:** Low — these parameters affect per-run behavior, not durable state.

### Experiment 7: DOM Scoring Weight Rebalance

**Hypothesis:** Role-name matching (currently 0.25 weight) is more predictive of correct element identification than visibility (currently 0.35) for enterprise UIs where most elements are visible.

**Change:** `lib/runtime/agent/dom-fallback.ts:93-96` — swap visibility (0.35 → 0.25) and roleNameScore (0.25 → 0.35).

**Measurement:** Primary: recovery success rate (DOM resolution is recovery-adjacent). Secondary: degradedLocatorRate.

**Risk:** Medium — visibility is currently the strongest signal. Monitor for regression in basic element finding.

### Experiment 8: Trust Policy Relaxation for Hints

**Hypothesis:** The 0.90 confidence floor for hints blocks useful alias proposals. Lowering to 0.70 will increase proposal yield by 20% without admitting incorrect knowledge.

**Change:** `.tesseract/policy/trust-policy.yaml:28` — change hints minimumConfidence from 0.90 to 0.70.

**Measurement:** Primary: proposalYield. Secondary: knowledgeHitRate (should improve faster per iteration).

**Risk:** More low-confidence aliases enter the knowledge layer during Level 0 runs. Guard: only apply during speedrun (synthetic), not production.

### Experiment 9: Overlay Before Translation

**Hypothesis:** The current strategy chain tries approved-knowledge → overlay → translation. Some steps that fall to translation could be caught by the overlay rung if it ran with a wider search.

**Change:** `lib/runtime/agent/resolution-stages.ts` — widen overlay candidate set or relax confidence threshold for overlay matching.

**Measurement:** Primary: resolution-rung-skip count (should decrease). Secondary: resolutionByRung distribution (should shift from translation to overlay).

**Risk:** Low — overlay resolution uses governed overlays that have already been evaluated.

### Experiment 10: Candidate List Expansion

**Hypothesis:** The current top-3 screens and top-8 elements limits may prune correct candidates. Expanding to top-5 and top-12 will increase translation recall.

**Change:** DOM policy `maxCandidates` (`lib/runtime/agent/dom-fallback.ts:37`) and translation candidate limits.

**Measurement:** Primary: translationRecall. Secondary: translationPrecision (must not drop significantly).

**Risk:** Marginal cost increase. More candidates means more scoring work per step.

## The Recursive Architecture

The speedrun loop is functional today but manual. The codebase direction should be to make self-improvement progressively more autonomous. Here is the evolution path, ordered from near-term to long-horizon.

### Near-term: Extract PipelineConfig

Currently, the 15 tunable parameters are scattered across 10+ files as magic numbers. Extract them into a single typed configuration:

```typescript
interface PipelineConfig {
  readonly translationThreshold: number;           // currently 0.34
  readonly bottleneckWeights: BottleneckWeights;    // currently {0.30, 0.25, 0.25, 0.20}
  readonly proposalRankingWeights: RankingWeights;  // currently {0.30, 0.30, 0.20, 0.20}
  readonly memoryCapacity: MemoryCapacity;          // currently {staleness: 5, floor: 0.35, maxRefs: 8}
  readonly domScoringWeights: DomWeights;           // currently {0.35, 0.25, 0.20, 0.20}
  readonly candidateLimits: CandidateLimits;        // currently {maxCandidates: 3, maxProbes: 12}
  readonly confidenceScaling: ConfidenceScaling;    // currently {verified: 0.8, proposed: 0.65}
  readonly intentThresholds: IntentThresholds;      // currently {element: 6, screen: 4}
  readonly precedenceBase: number;                  // currently 100
  readonly convergenceThreshold: number;            // currently 0.01
}
```

This makes the parameter space explicit and the speedrun harness can vary parameters without editing source files.

### Medium-term: Experiment Registry

Track every experiment with its input configuration, output metrics, and whether the scorecard improved:

```typescript
interface ExperimentRecord {
  readonly id: string;
  readonly runAt: string;
  readonly pipelineVersion: string;
  readonly configDelta: Partial<PipelineConfig>;     // what changed from baseline
  readonly fitnessReport: PipelineFitnessReport;     // full results
  readonly scorecardComparison: ScorecardComparison;  // did it beat the mark?
  readonly accepted: boolean;                         // was the change committed?
}
```

This creates a searchable history of what was tried, what worked, and what didn't — the training log.

### Medium-term: Parameter Sensitivity Analysis

Before running a full experiment, measure which parameters are most sensitive:

```
for each parameter P in PipelineConfig:
  run speedrun with P + 10%
  run speedrun with P - 10%
  compute sensitivity = |deltaHitRate| / |deltaParameter|
  rank parameters by sensitivity
```

This tells the improvement loop where to spend its budget. High-sensitivity parameters warrant careful tuning; low-sensitivity parameters can be left alone.

### Medium-term: Multi-Objective Scorecard

Currently the scorecard's improvement gate is a single metric (knowledgeHitRate). This risks improving hit rate at the cost of precision or velocity. Evolve to a Pareto frontier:

```
improved = no existing scorecard entry Pareto-dominates the new entry
```

Where Pareto domination means the existing entry is better on ALL of {hitRate, precision, velocity, yield}. This allows accepting trade-offs (slightly lower precision for much higher hit rate) while rejecting regressions.

### Long-term: Automatic Knob Search

Automate the backward pass:

1. Read the fitness report's top failure mode
2. Map it to the implicated parameter(s)
3. Generate a set of candidate configurations (grid search or Bayesian optimization)
4. Run speedrun for each candidate
5. Accept the best configuration that beats the mark

This is the step that makes the loop fully autonomous. The `npm run speedrun` command becomes `npm run evolve`, and the codebase improves itself.

### Long-term: Real Correlation Computation

The `scoringEffectiveness.bottleneckWeightCorrelations` field in the fitness report is currently populated with placeholder zeros. Compute actual correlations:

```
for each bottleneck signal S:
  for each iteration pair (N, N+1):
    if S was the top signal in iteration N:
      correlation(S) = hitRateDelta(N, N+1)
```

This makes the bottleneck scoring weights self-calibrating: the system learns which signals actually predict improvement.

## Invariants

The self-improvement loop must preserve these invariants at all times.

### Clean-Slate Invariant

After a speedrun completes, no knowledge files in the git working tree are modified. The speedrun restores `knowledge/` to `git HEAD` state on both entry and exit. Synthetic artifacts exist only in gitignored paths.

### Monotonic Scorecard

The `highWaterMark` in the scorecard only advances forward. If a code change produces a lower hit rate than the current mark, the scorecard is not updated and the change is discarded. The scorecard history records every run (including failures) as an append-only log.

### Overfitting Guard

Synthetic scenarios are regenerated from the knowledge model each run, not loaded from prior runs. The seeded RNG ensures reproducibility within a seed but the generator's phrasing templates ensure variety. No scenario text is derived from prior proposals or evidence.

### Determinism

Same seed + same pipeline version = same fitness report. The entire pipeline is deterministic: the RNG is seeded, the resolution precedence is a static law, the scoring rules are pure functions, and the dogfood loop is a recursive fold. Non-determinism (wall-clock timestamps in evidence) is excluded from fitness metric computation.

### Provenance

Every scorecard entry carries the `pipelineVersion` field (git short SHA). Every fitness report carries the same. This creates an unambiguous link from a metric observation to the exact pipeline code that produced it. When the scorecard history shows a jump in hit rate, you can `git diff` the two pipeline versions to see what code change caused it.

### Governance Boundary

The speedrun loop is an offline evaluation tool. It runs in `dogfood` execution profile with `diagnostic` interpreter mode. It does not execute against real browsers, does not push proposals to production knowledge, and does not modify the operator inbox. The only durable outputs are pipeline code changes (committed by the developer or agent) and the scorecard.

## The North Star

The end state is a codebase that can:

1. Run `npm run speedrun` to measure its own pipeline fitness from a clean slate
2. Read the fitness report to identify the top failure mode
3. Map the failure mode to a specific parameter and code location
4. Generate candidate parameter values
5. Re-run the speedrun with each candidate
6. Accept the candidate that beats the high-water-mark
7. Commit the pipeline code change and updated scorecard
8. Repeat

At that point, the scorecard is the objective function for an agent operating on its own source code. The agent doesn't need to understand "what the pipeline should do" — it only needs to understand "this metric went up, keep the change; this metric went down, discard it."

This is not general AGI. It is narrow, bounded, law-driven self-improvement within a well-defined parameter space. The invariants (clean-slate, monotonic, deterministic, provenance, governance) ensure the loop stays safe. The failure taxonomy ensures the loop stays targeted. The scorecard ensures the loop stays honest.

The prize is a pipeline that gets better at resolving novel interface intent every time it runs — not because it memorized more aliases, but because its resolution, scoring, and ranking mechanics improved.

## Five Tuning Surfaces

The recursive improvement loop described above optimizes Surface 1 (hyperparameters). But the full optimization landscape has five surfaces, each with different granularity, feedback latency, and leverage characteristics. All five are in scope for the self-improvement system.

### Surface 1: Hyperparameters (weights and thresholds)

The 15 tunable constants in `PipelineConfig`. These are the traditional "model parameters" — numeric values that control scoring, ranking, translation, and convergence behavior without changing code structure. Tuning is fast (single speedrun), reversible (restore the config), and measurable (scorecard delta). This is the surface the speedrun loop already targets.

**Feedback latency:** One speedrun cycle (seconds to minutes).
**Leverage:** Moderate — bounded by the expressiveness of the algorithms that consume them.

### Surface 2: Code structure (algorithms, patterns, abstractions)

The resolution ladder stages, the candidate lattice algorithm, the harvest algorithm, the strategy chain composition, the scoring rule combinators — these are the *functions* that hyperparameters flow through. A better algorithm renders parameter sensitivity moot: if the resolution ladder can skip directly to the right rung because the information is preserved in a form that makes the answer obvious, the individual rung weights don't matter.

Code structure improvements include:

- **Visitor pattern coverage**: replacing ad-hoc switch/if chains with exhaustive typed folds (see `lib/domain/visitors.ts`). Each fold call site is a compile-time contract that new union variants cannot be silently ignored.
- **Layer integrity**: maintaining the `domain → application → runtime → infrastructure` dependency direction. Layer violations leak side effects into pure code, making the domain untestable and the optimization surface noisy.
- **Composable abstractions**: `ScoringRule` with `combine`/`contramap`, `PipelinePhase` with fold, `StateMachine` with pure transitions. Each abstraction decomposes a monolithic algorithm into independently tunable, independently testable components.
- **Pure function ratio**: the percentage of domain-layer functions that are side-effect free. Higher purity means more functions are amenable to law-style testing and deterministic optimization.
- **Envelope discipline**: the percentage of cross-boundary artifacts that carry full `WorkflowEnvelope` headers. Gaps in envelope coverage are gaps in provenance, which are gaps in the system's ability to explain itself.

**Feedback latency:** One development cycle (the architecture fitness report measures structural properties).
**Leverage:** High — a structural improvement transfers to all future parameter tuning and all future applications.

### Surface 3: Knowledge representation (type surfaces, data schemas)

The type system itself is a compression scheme. `CanonicalTargetRef` compresses "the policy number input on the policy-search screen" into a branded string. `LocatorStrategy` compresses three families of DOM lookup into a three-variant union. `ResolutionReceipt` compresses an entire resolution pipeline execution into a typed envelope.

Type surface improvements include:

- **Discriminated union completeness**: are all possible states of a concept represented as variants, or are some hidden in string fields? Every untyped string is a compression loss.
- **Phantom brand coverage**: are governance states, confidence levels, and certification states carried at the type level, or only at runtime? Phantom brands are zero-cost compression that makes invalid states unrepresentable.
- **Schema evolution**: when a new concept emerges (e.g., `ParetoObjectives`), does it compose with existing types or require parallel truth? Every parallel representation is information duplication.
- **Readonly enforcement**: mutable fields are implicit state machines. Marking fields `readonly` compresses the state space by eliminating mutation as a concern.

**Feedback latency:** One development cycle (type-check + law tests).
**Leverage:** Very high — type-level improvements propagate to every consumer and every future extension. A well-typed interface prevents entire classes of bugs at compile time.

### Surface 4: Documentation and authorial leverage

The CLAUDE.md, `docs/coding-notes.md`, `docs/master-architecture.md`, and domain ontology are not passive references — they are *training data for agent sessions*. An agent session that correctly applies the supplement hierarchy on the first attempt (because `docs/coding-notes.md` explains it clearly) saves an entire debug cycle. An agent session that violates layer integrity (because the documentation doesn't show a concrete negative example) costs a review cycle.

Documentation improvements include:

- **Worked examples**: concrete before/after code samples for each coding convention. Assertions like "prefer recursive folds" are weaker than a side-by-side comparison with line-by-line annotation.
- **Anti-pattern galleries**: explicit "do NOT do this" sections with the *specific* failure mode that results. An agent reading "avoid `let`" may comply; an agent reading "avoid `let` because it breaks determinism in the scoring fold, which causes the bottleneck detector to produce unstable rankings" understands *why*.
- **Decision records**: when a design choice is non-obvious, a 3-sentence ADR (context, decision, consequence) prevents future agents from re-deriving the same reasoning. `docs/adr-collapse-deterministic-parsing.md` is the existing pattern.
- **Cross-reference completeness**: every concept should be reachable from the CLAUDE.md start-here list within two hops. Orphan documentation is undiscoverable documentation, which is equivalent to absent documentation for agent sessions.

**Feedback latency:** One agent session (does the agent apply the convention correctly?).
**Leverage:** Multiplicative — documentation quality multiplies the effectiveness of every agent session, every human review, and every onboarding. It is the highest-leverage surface for systems that are primarily agent-developed.

### Surface 5: Information-theoretic efficiency (lossless compression of domain signal)

This is the meta-surface. Every code construct, type surface, algorithm, and documentation artifact is a compression of domain reality. The question is: how much signal survives the compression?

The translation pipeline normalizes intent text into tokens — every normalization step is a lossy compression. If "navigate to the policy search page" and "go to policy search" produce different token sets, the compression is losing shared meaning. The harvest algorithm decides what to retain from DOM exploration — every discarded attribute is a compression loss. The supplement hierarchy promotes screen-local hints to shared patterns — if the promotion loses context (which screen originated the pattern, under what conditions it was observed), the compression is lossy.

Information efficiency improvements include:

- **Translation loss rate**: what fraction of intent text meaning is destroyed by normalization? Measured as the gap between raw phrasing diversity and post-normalization candidate set size.
- **Supplement reuse factor**: how often is a promoted pattern actually exercised across multiple screens? Low reuse suggests premature promotion (the compression was wrong) or poor generalization (the pattern is too specific).
- **Resolution path entropy**: how many different resolution paths lead to the same correct answer? High entropy means the system is doing redundant work. Low entropy means the compression is efficient — the right answer follows from the data structure itself.
- **Alias redundancy rate**: what fraction of aliases are strict subsets of other aliases? Redundant aliases waste matching time and create false-match risk without adding information.
- **Algorithm tuning surface density**: how many independently tunable parameters does each algorithm expose per unit of output variance? High density means fine-grained control. Low density means the algorithm is either well-optimized (can't improve further) or under-parameterized (can't express the right behavior).

**Feedback latency:** Multiple speedrun cycles (statistical measurement over varied inputs).
**Leverage:** Foundational — information efficiency improvements make all other surfaces more effective. A lossless compression of domain signal means parameters tune faster, code changes have clearer effects, and documentation is easier to write because the concepts are crisper.

### The Overfitting Concern Across Surfaces

The user correctly identified that dogfood optimization risks overfitting to synthetic data. This risk exists on all five surfaces but has different mitigation strategies:

- **Surface 1** (parameters): Vary the scenario generator seed across speedrun epochs. Require improvement to hold across 3+ seeds before accepting.
- **Surface 2** (code): Architecture fitness metrics are application-independent — layer integrity, purity, visitor coverage don't change with the test suite.
- **Surface 3** (types): Type-level improvements are verified by the compiler, not by runtime data. They can't overfit.
- **Surface 4** (docs): Agent session effectiveness is measurable across different tasks, not just one task type.
- **Surface 5** (information): Information efficiency metrics require large sample sizes by definition. Widen the scenario generator's phrasing templates, increase `variantsPerField`, and diversify `driftEvents` to increase variance. The Pareto frontier (4 objectives) provides regularization — a change that helps one metric at the expense of three is rejected.

The key insight: **Surfaces 2-5 are inherently more robust to overfitting than Surface 1** because they measure structural properties, not behavioral outcomes. A codebase with better layer integrity, more exhaustive type safety, clearer documentation, and more efficient information compression will perform better on *any* application, not just the current dogfood suite.

### The Production-Free Advantage

Without production data, we cannot overfit to production. But we can still measure generalization capacity: the ability to handle wider classes of inputs. Structural improvements (Surfaces 2-4) are testable right now because they are measured by architecture fitness, type-checking, and agent session effectiveness — none of which require production targets.

Surface 5 (information efficiency) can be measured synthetically by generating adversarial scenarios: phrasings that stress normalization, drift events that stress the harvest algorithm, state topologies that stress the resolution ladder. The structured entropy harness (D1 in the backlog) is the tool for this.

The architecture fitness report (`lib/domain/types/architecture-fitness.ts`) provides the measurement infrastructure for Surfaces 2-5. It measures layer violations, visitor coverage, provenance completeness, knowledge compression, purity, envelope discipline, and parameter exposure. Each metric has a direction of improvement (fewer violations, higher coverage, more completeness) that is independent of any particular application.

## Architecture Fitness Report

The `ArchitectureFitnessReport` is the structural analog of the `PipelineFitnessReport`. Where the pipeline report measures *how well the system resolves intent* (runtime behavior), the architecture report measures *how well the codebase supports improvement* (structural health).

### Metrics

| Metric | What it measures | Direction |
|---|---|---|
| Layer violations | Imports crossing `domain → application → runtime → infrastructure` boundaries in the wrong direction | Fewer is better |
| Visitor coverage | % of discriminated union consumers using exhaustive fold/visitor vs raw switch/if | Higher is better |
| Provenance completeness | % of derived artifacts carrying full lineage, fingerprints, and governance | Higher is better |
| Knowledge compression | Ratio of scenarios served per knowledge artifact | Higher is better |
| Domain purity | % of domain-layer functions that are pure (no `let`, no mutation, no side effects) | Higher is better |
| Envelope discipline | % of cross-boundary artifacts using `WorkflowEnvelope` vs raw objects | Higher is better |
| Parameter exposure | % of tunable constants surfaced in `PipelineConfig` | Higher is better |

### Implementation

The types live in `lib/domain/types/architecture-fitness.ts`. The report is a domain-layer data structure — it describes what was measured, not how. The measurement itself (static analysis, AST scanning, grep-based counting) can be implemented as a script or application-layer module.

### Relationship to Pipeline Fitness

The two reports are complementary:

- **Pipeline fitness** answers: "How well does the system perform?" (loss function)
- **Architecture fitness** answers: "How improvable is the system?" (learning rate)

A system with good pipeline fitness but poor architecture fitness has hit a ceiling — it works today but is resistant to further improvement. A system with poor pipeline fitness but good architecture fitness has headroom — it doesn't work well yet, but its structure supports rapid improvement.

The recursive improvement loop should optimize both: pipeline fitness is the primary objective, architecture fitness is the regularization term.
