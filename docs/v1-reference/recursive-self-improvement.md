# Recursive Self-Improvement

> Active design — Level 1 improvement loop specification.
>
> **Relationship to canon-and-derivation.** The 15-knob parameter
> space this document enumerates is a **Surface 1** tactic
> (hyperparameter tuning) plus some **Surface 2** tactics (algorithm
> and pattern improvements) inside the larger substrate-convergence
> program described in
> [`docs/canon-and-derivation.md`](./canon-and-derivation.md) and
> sequenced in
> [`docs/cold-start-convergence-plan.md`](./cold-start-convergence-plan.md).
> The parameter-space training loop is useful and stays valid, but
> its gradient signal is a *subset* of the doctrinal gradient, not
> the whole of it. Specifically:
>
> 1. The fitness report this document describes
>    (`lib/application/improvement/fitness.ts`) measures **pipeline
>    efficacy** — how well the runtime uses cached canonical
>    artifacts. It does not measure **cold-start efficacy** (how
>    close the discovery engine's cold-derived output is to the
>    canonical artifact store) or **intervention marginal value**
>    (whether agentic augmentations actually reduced downstream
>    ambiguity / suspension / rung-score in their attachment region).
>    Cold-start efficacy lives in the discovery-fitness L4 tree
>    introduced in `canon-and-derivation.md` § 12.2; intervention
>    marginal value lives as C6 in `docs/alignment-targets.md` and is
>    populated from the `InterventionTokenImpact` fields at
>    `lib/domain/handshake/intervention.ts:162-169`.
> 2. `knowledgeHitRate` is a useful informational metric but is
>    **not** the doctrinal acceptance gate. The gate is
>    `effectiveHitRate` with floor checks against M5 (Memory
>    Worthiness Ratio) and C6 (Intervention-Adjusted Economics) from
>    `docs/alignment-targets.md`. A change that improves
>    `knowledgeHitRate` but regresses M5 or C6 below its current
>    window's floor cannot be accepted.
> 3. The "training loop" analogy remains exact, but the forward
>    pass now runs across *two* L4 trees (pipeline efficacy and
>    discovery fitness) and the scorecard is a Pareto frontier over
>    the full alignment-targets metric set, not just knowledge
>    hit rate.
>
> When this document conflicts with `canon-and-derivation.md`,
> canon-and-derivation wins. When it conflicts with
> `cold-start-convergence-plan.md` on sequencing, the plan wins.
> The parameter space below remains the authoritative enumeration
> of Surface 1 tuning knobs.

This document describes how Tesseract enters a recursive self-improvement loop. It is the Level 1 doctrine: where [dogfooding-flywheel.md](./dogfooding-flywheel.md) describes the Level 0 loop (accumulate knowledge), this document describes how synthetic runs produce gradient signal that improves the pipeline code itself.

Use this document for the self-improvement model's parameter space and clean-room protocol. Use [`canon-and-derivation.md`](./canon-and-derivation.md) for the substrate model and the two-engine framing. Use [`cold-start-convergence-plan.md`](./cold-start-convergence-plan.md) for the sequenced execution of the substrate migration. Use [dogfooding-flywheel.md](./dogfooding-flywheel.md) for the operating model. Use [direction.md](./direction.md) for composition direction. Use [master-architecture.md](./master-architecture.md) for the north-star doctrine.

## The Two-Level Model

Tesseract has two concentric improvement loops. They share the same pipeline but differ in what they durably improve.

### Level 0: Knowledge Accumulation (dogfood loop)

```
run scenarios → generate proposals → activate into knowledge files → measure hit rate → repeat
```

The dogfood loop (`lib/application/dogfood.ts`) runs scenarios, observes where the pipeline falls back to lower-precedence resolution rungs, generates proposals for knowledge changes (new aliases, element hints, pattern entries), activates them, and re-runs. Each iteration, the knowledge hit rate rises until convergence. The durable output is **knowledge files**: `knowledge/screens/*.hints.yaml`, `knowledge/patterns/*.yaml`.

Proposal generation happens at two points in the resolution ladder:
- **Rungs 5-8** (translation, live-DOM, agent interpretation): When a step is resolved through a non-deterministic path, `proposalsFromInterpretation()` generates hint alias proposals to make future resolution deterministic.
- **Rung 10** (needs-human fallback): When a step cannot be resolved at all, `proposalsForNeedsHuman()` generates proposals describing the knowledge gap — the specific screen/element/alias that would have resolved the step. These proposals use the standard `{ screen, element, alias }` patch format so `applyHintsPatch` can activate them directly.

Proposals flow through `build-proposals.ts` (extraction from step receipts) → `activate-proposals.ts` (trust-policy gating and YAML patch application). The binding step at `lib/domain/binding.ts` populates `knowledgeRefs` and `supplementRefs` on each `BoundStep` so the resolution context carries the right knowledge paths per step.

**Known caveat:** The convergence FSM in the speedrun counts `proposalsActivated` within a single iteration via `accumulateProposalTotals`. When proposals are generated and activated in the same iteration, the counter may report 0 for the *next* iteration (because the newly-activated aliases now resolve deterministically, producing fewer proposals). This can trigger premature `no-proposals` convergence termination before the hit rate improvement is measured.

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

### Braided Intervention — Why "Level 1" is Not Just About Knobs

The 15-knob parameter space (later in this document) is a necessary
but insufficient description of what the recursive loop optimizes.
Per `docs/canon-and-derivation.md` § 9, the system has two engines
sharing one canonical artifact store:

1. The **deterministic discovery engine** (slot 5 of the lookup
   chain; runner interface at
   `lib/application/discovery/discovery-runner.ts:88-92`).
2. The **agentic intervention engine** (writes to slot 2 as agentic
   overrides; substrate at
   `lib/domain/handshake/intervention.ts:162-226`).

The intervention engine is not "the human in the loop." It is a
**braid**: the agent forms a hypothesis from runtime evidence, the
hypothesis becomes a typed `InterventionReceipt` with a populated
`handoff.semanticCore`, the receipt writes an agentic override to
slot 2 of the canon store, and subsequent runs weave runtime
evidence back through the same receipt lineage to measure whether
the inference paid off via `InterventionTokenImpact` population.
C6 (Intervention-Adjusted Economics) in
`docs/alignment-targets.md` folds those impacts into a scoreboard
value. An intervention that cannot show its evidence ancestry
cannot participate in the braid, and therefore cannot earn C6
credit, and therefore cannot be accepted by the scorecard gate.

The upshot for this document: the "backward pass" in the training
analogy is not just "edit a constant in `lib/`." It is also "the
agent authored an intervention receipt, the receipt became canon,
the next N runs measured the impact, C6 moved." Both kinds of
backward pass converge on the same scorecard because the
scorecard gates on M5 and C6, not just on parameter deltas.

Parameter tuning (Surface 1) and intervention authoring (part of
Surface 2 in the broader taxonomy below) are peers, not
alternatives. The 15-knob space is the finest-grained tuning
surface; the intervention engine operates at the substrate level
and can produce improvements the knob space cannot reach.

## The Training Analogy

This is not a metaphor. The speedrun loop has the same structure as a machine learning training loop, and the mapping is concrete at every level.

| ML Concept | Tesseract Artifact | Location |
|---|---|---|
| Model | Resolution pipeline | `lib/runtime/agent/resolution-stages.ts`, `lib/application/translate.ts`, `lib/runtime/agent/candidate-lattice.ts` |
| Parameters | 15 tunable thresholds and weights | Enumerated in [Parameter Space](#the-parameter-space) |
| Training data | Synthetic scenarios | `lib/application/synthesis/scenario-generator.ts` (regenerated each run) |
| Forward pass | Clean-slate flywheel run | `lib/application/dogfood.ts` (convergence detection, metric computation) |
| Loss function (pipeline efficacy) | L4 pipeline-efficacy metric tree via `MetricVisitor` registry | `lib/domain/fitness/metric/visitors/index.ts:42-83` (`L4_VISITORS` + `buildL4MetricTree`) |
| Loss function (cold-start efficacy) | L4 discovery-fitness metric tree via parallel visitor registry | `lib/domain/fitness/metric/visitors-discovery/` (Phase B of `docs/cold-start-convergence-plan.md`) |
| Loss function (intervention value) | C6 visitor folded over `InterventionTokenImpact` | `lib/domain/fitness/metric/visitors/intervention-marginal-value.ts` (Phase C) |
| Gradient (pipeline-efficacy) | 8 classified failure modes | `lib/domain/types/fitness.ts` (`PipelineFailureClass`) |
| Gradient (discovery) | Per-atom-class cold-vs-canon delta | Phase B of the cold-start plan |
| Gradient (intervention) | `InterventionTokenImpact` deltas before/after promotion | Phase C of the cold-start plan |
| Backward pass | Targeted code change at top failure mode | Manual or agent-driven |
| Learning rate | Per-knob change magnitude | Per-experiment decision |
| Epoch | One full speedrun cycle | `scripts/speedrun.ts` |
| Overfitting guard | Scenarios regenerated from knowledge model | Seeded RNG in `scenario-generator.ts` |
| Loss curve | Scorecard history with Pareto frontier over M5/C6/effectiveHitRate | `.tesseract/benchmarks/scorecard.json` |
| Checkpoint | Git commit of pipeline code + scorecard | Monotonic: accepted only if Pareto-undominated AND no floor regression per `docs/alignment-targets.md` |

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

### Medium-term: Improvement Ledger And Experiment Projection

Track every recursive-improvement run in the canonical improvement ledger, and project legacy `ExperimentRecord` views from it when older tooling still needs them:

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

The canonical training log is `.tesseract/benchmarks/improvement-ledger.json`. `experiments.json` remains a compatibility projection for tooling that still consumes `ExperimentRecord`.

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

The speedrun loop is an offline evaluation tool. It runs in `dogfood` execution profile with `diagnostic` interpreter mode. It does not execute against real browsers, does not push proposals to production knowledge, and does not modify the operator inbox. The only durable outputs are pipeline code changes (committed by the developer or agent), the scorecard, and the append-only improvement ledger.

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

## Clean Room Protocol

This section is the operational runbook for executing a recursive self-improvement cycle. It answers: what do I run, what do I keep, what do I discard, and how do I know I haven't been contaminated?

### Knowledge Posture

Before running the clean room, choose a **knowledge posture** — this determines what the system starts with:

| Posture | Tier 1 (problem statement) | Tier 2 (learned knowledge) | Use case |
|---|---|---|---|
| `cold-start` | Loaded | **Excluded** | "Can the system learn from scratch?" |
| `warm-start` | Loaded | Loaded | "Does the pipeline resolve correctly given known screens?" |
| `production` | Loaded | Loaded | Full deployment with version-controlled knowledge |

Set the posture in one of two ways (highest precedence first):

1. **CLI flag:** `npx tsx scripts/speedrun.ts iterate --posture cold-start`
2. **Default:** `warm-start`

Per the canon-and-derivation doctrine (`docs/canon-and-derivation.md`),
posture is configuration for HOW the loop runs, not data about the
SUT — it belongs on the command. The legacy `posture.yaml` file
concept and `postureConfigPath` field have been removed.

**Tier 1** (always present): `.ado-sync/`, `scenarios/` (problem statement fields only), `controls/`, `benchmarks/`, `fixtures/`
**Tier 2** (posture-gated): `knowledge/screens/`, `knowledge/patterns/`, `knowledge/surfaces/`, `knowledge/snapshots/`, `knowledge/components/`, `knowledge/routes/`

**Scenario tier projection:** Scenarios straddle the tier boundary — they carry both problem statement (Tier 1: intent, action_text, expected_text) and authored knowledge (Tier 2: screen, element, posture, resolution, override). In `cold-start` mode, `projectScenarioToTier1()` strips all Tier 2 fields, resetting steps to `confidence: intent-only` and `action: custom`. This ensures the self-improvement loop starts with zero prior bindings.

### Prerequisites

Before entering the loop:

1. **Working tree is clean.** `git status` shows no modifications. The scorecard (`.tesseract/benchmarks/scorecard.json`) is committed at the current high-water-mark.
2. **Pipeline version is known.** `git rev-parse --short HEAD` gives the `pipelineVersion` tag for this cycle.
3. **Architecture fitness passes.** `npx playwright test tests/architecture-fitness.laws.spec.ts` is green.
4. **Knowledge posture is set.** Via `--posture` CLI flag.

### Step 1: Wipe Synthetic State

```bash
npm run speedrun:clean
# or manually:
git checkout -- dogfood/
rm -rf .tesseract/benchmarks/experiment-registry.json
rm -rf .tesseract/runs/ .tesseract/tasks/ .tesseract/sessions/ .tesseract/learning/
rm -rf .tesseract/bound/ .tesseract/inbox/ .tesseract/interface/ .tesseract/graph/
rm -rf generated/ lib/generated/
```

**Why:** Every synthetic artifact from prior runs is a potential contamination vector. Knowledge files must start from `git HEAD`, not from a prior run's proposals. Generated specs, tasks, sessions, and learning fragments are disposable object code — they are regenerated from canonical inputs.

**What survives the wipe:**
- `lib/` (pipeline source code — the thing being improved)
- `dogfood/knowledge/` (restored to git HEAD — canonical inputs)
- `dogfood/scenarios/` (restored to git HEAD)
- `dogfood/controls/` (restored to git HEAD)
- `.tesseract/policy/trust-policy.yaml` (governance anchor)
- `.tesseract/benchmarks/scorecard.json` (monotonic high-water-mark)
- `.tesseract/benchmarks/improvement-ledger.json` (canonical recursive-improvement history)

**What is destroyed:**
- All `.tesseract/` runtime directories (runs, tasks, sessions, learning, interface, graph, bound, inbox)
- All `generated/` output
- Any knowledge modifications from prior flywheel iterations
- `experiments.json` compatibility projections when you want a fully clean-room history reset
- The experiment registry (optional — keep for history, destroy for purity)

### Step 2: Generate Synthetic Scenarios

```bash
npm run speedrun:generate -- --seed <seed>
```

The scenario generator (`lib/application/synthesis/scenario-generator.ts`) walks the knowledge model and produces synthetic scenarios using 8 phrasing templates per action type. The seed controls the RNG.

**Contamination check:** Synthetic scenarios must derive from the knowledge model *as it exists at git HEAD*, not from any prior run's proposals or evidence. The generator reads `dogfood/knowledge/` and produces `dogfood/scenarios/` — it never reads `.tesseract/` runtime artifacts.

### Step 3: Run the Dogfood Loop

```bash
npm run speedrun -- --seed <seed> [--config <config.json>]
```

The speedrun script:
1. Compiles scenarios through the resolution pipeline
2. Runs the dogfood loop (auto-approve → recompile → rerun → converge)
3. Produces a `PipelineFitnessReport` and `ScorecardComparison`
4. Records an `ImprovementRun` in the improvement ledger and refreshes the `ExperimentRecord` compatibility projection

**What the dogfood loop modifies during execution (ephemeral):**
- Knowledge files: proposals are activated into `dogfood/knowledge/` during the loop. **These modifications are ephemeral** — they exist only for the duration of the run and are discarded in Step 5.
- `.tesseract/` runtime artifacts: generated as side effects of compilation and execution.
- `generated/` specs: emitted tests, traces, reviews.

**What the dogfood loop produces (durable outputs):**
- `ImprovementRun` in `.tesseract/benchmarks/improvement-ledger.json`
- `ExperimentRecord` in `experiments.json` as a compatibility projection
- `PipelineFitnessReport` — the gradient signal
- `ScorecardComparison` — did this beat the mark?
- `ExperimentRecord` — the experiment log entry

### Step 4: Evaluate

Read the fitness report. The decision tree:

```
If scorecardComparison.improved:
  → The pipeline code (or config) change improved metrics from a clean slate
  → Accept: update scorecard, commit pipeline code + scorecard
  → The code change is the durable output of this cycle

If not improved:
  → The change did not help (or regressed)
  → Reject: discard the pipeline code change, keep the scorecard unchanged
  → The experiment record is still logged for history
```

For Pareto evaluation, "improved" means the new entry is not dominated by any existing frontier entry on all four objectives (`knowledgeHitRate`, `translationPrecision`, `convergenceVelocity`, `proposalYield`).

### Step 5: Restore Clean State

```bash
git checkout -- dogfood/
rm -rf .tesseract/runs/ .tesseract/tasks/ .tesseract/sessions/ .tesseract/learning/
rm -rf .tesseract/bound/ .tesseract/inbox/ .tesseract/interface/ .tesseract/graph/
rm -rf generated/ lib/generated/
```

**Why:** Even if the experiment was accepted, the knowledge modifications from the dogfood loop are ephemeral. They were activations of proposals specific to *this* seed and *this* config. Keeping them would contaminate the next cycle — the next run must start from the same canonical knowledge to ensure that improvement comes from the *pipeline code change*, not from residual activated knowledge.

**The only durable outputs that survive:**
- Improvement ledger entry (appended, never deleted)
- `experiments.json` compatibility projection when legacy tooling still consumes it
- Pipeline code changes (committed to git if accepted)
- Updated scorecard (committed to git if improved)
- Experiment registry entry (appended, never deleted)

### Step 6: Repeat with Varied Seeds

To guard against overfitting to a single seed:

```bash
for seed in 42 137 256 500 999; do
  npm run speedrun -- --seed $seed [--config <config.json>]
done
```

A pipeline change is robust if it improves (or at least does not regress) across 3+ seeds. If improvement holds for seed 42 but regresses for seed 137, the change is overfitting to the phrasing distribution of seed 42.

### Contamination Detection Checklist

After each cycle, verify:

| Check | How to verify | Contaminated if |
|---|---|---|
| Knowledge at HEAD | `git diff dogfood/` is empty | Any knowledge file is modified |
| No residual runtime artifacts | `.tesseract/runs/` is empty | Run records from prior cycles exist |
| Scenario text is synthetic | Scenarios use generator phrasing templates | Scenarios contain proposal-derived text |
| Fitness is deterministic | Re-run with same seed produces same report | Different metrics for same seed + same code |
| Scorecard provenance | `scorecard.pipelineVersion` matches `git rev-parse --short HEAD` | Version mismatch |
| Experiment lineage | `improvementRun.parentExperimentId` points to a valid prior entry | Orphaned improvement run with no lineage |

### What the Improvement Ledger Keeps

The improvement ledger (`.tesseract/benchmarks/improvement-ledger.json`) is the *training log* of the self-improvement loop. It is append-only and persists across cycles. It records:

- **Every recursive-improvement run**, whether accepted or rejected
- **The config delta** — exactly what parameter(s) were changed
- **The resolved config** — the full config used (delta merged onto defaults)
- **The fitness report** — full metrics and failure classification
- **The scorecard comparison** — whether it beat the mark
- **The hypothesis** — why this experiment was tried
- **The parent experiment ID** — lineage for tracking improvement chains

The ledger is a derived artifact (it lives in `.tesseract/benchmarks/`), but it is *not* wiped in Step 1 or Step 5. It accumulates across all cycles because it is the historical record that correlation computation (Phase 6) needs.

`experiments.json` can still be projected from the ledger for scripts and older views that speak in `ExperimentRecord`, but that file is compatibility output, not canonical history.

**Exception:** For a fully clean room start (e.g., evaluating a completely new approach), delete the ledger along with everything else. This resets the training history.

### When to Break the Clean Room

The clean room protocol is designed for *parameter tuning and algorithm improvement* (Surfaces 1-2). For *type surface changes* (Surface 3), *documentation changes* (Surface 4), and *information efficiency improvements* (Surface 5), the clean room protocol applies differently:

- **Surface 3 (types)**: Type changes are verified by the compiler, not by the speedrun. Run `npx tsc --noEmit` and `npx playwright test tests/architecture-fitness.laws.spec.ts`. No clean room needed — the type system is a universal invariant checker.
- **Surface 4 (docs)**: Documentation changes are verified by agent session effectiveness. No clean room needed — run the architecture fitness tests to ensure cross-reference completeness.
- **Surface 5 (information efficiency)**: Information efficiency changes *do* need the clean room, because they affect runtime behavior. Follow the full protocol with multi-seed verification.

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

## Ephemeral Artifact Management

This section is the authoritative reference for which artifacts persist and which are regenerated. If confused about whether something should be committed or cleaned, consult this section.

### The Rule

**Speedrun outputs are ephemeral. Only pipeline code and the scorecard persist.**

The speedrun loop is a training loop. Its synthetic scenarios, activated knowledge, run records, sessions, evidence, proposals, and generated specs are the equivalent of training checkpoints — useful during the run, discarded after. The only durable outputs are:

1. **Pipeline code changes** (committed if the scorecard improves)
2. **The scorecard** (`.tesseract/benchmarks/scorecard.json` — monotonic high-water-mark)
3. **Experiment records** (`.tesseract/benchmarks/runs/*.fitness.json` — audit trail)

Everything else is wiped by `cleanSlateProgram` at the start of each seed run.

### Artifact Lifecycle Table

| Directory | Created by | Wiped by | Committed? | Why |
|---|---|---|---|---|
| `dogfood/scenarios/synthetic/` | scenario generator | cleanSlate | Never | Regenerated from seed each run |
| `dogfood/knowledge/screens/*.hints.yaml` | proposal activation | cleanSlate (git restore) | Never on training branches | Ephemeral activations, not reviewed knowledge |
| `dogfood/knowledge/patterns/*.yaml` | proposal activation | cleanSlate (git restore) | Never on training branches | Same — ephemeral activations |
| `.tesseract/runs/` | dogfood loop | cleanSlate | Never | Run records are projections, not source of truth |
| `.tesseract/sessions/` | execution engine | cleanSlate + inter-iteration cleanup | Never | Session transcripts, useful only for current run |
| `.tesseract/evidence/runs/` | execution engine | cleanSlate + inter-iteration cleanup | Never | Raw evidence, captured in run records |
| `.tesseract/learning/` | execution engine | cleanSlate | Never | Learning artifacts, ephemeral |
| `.tesseract/translation-cache/` | translation pipeline | cleanSlate | Never | Cache, fully regenerable |
| `generated/synthetic/` | compiler | cleanSlate | Never | Deterministic compiler output |
| `.tesseract/benchmarks/scorecard.json` | speedrun (on improvement) | Never | Yes (governance anchor) | Monotonic high-water-mark |
| `.tesseract/benchmarks/runs/` | speedrun | Never | Optional (audit trail) | Experiment history |
| `.tesseract/policy/trust-policy.yaml` | Manual | Never | Yes (governance anchor) | Trust boundary definition |

### Gitignore Edicts

The `.gitignore` enforces these rules:

- `.tesseract/*` is bulk-ignored. Only `!.tesseract/policy/` is allowlisted.
- `dogfood/` is ignored on main. On training branches, remove the ignore line for continuity — but **never merge evolvable surfaces** (knowledge, fixtures, generated output) back to main.
- `generated/` and `lib/generated/` are always ignored. They are deterministic compiler output.
- `knowledge/screens/*.hints.yaml` at the repo root is ignored — these are auto-activated hints.

### Clean-Slate Contract

`cleanSlateProgram` (`lib/application/clean-slate.ts`) is the single authoritative cleanup function. It wipes:

1. `{scenariosDir}/synthetic/` — regenerated scenarios
2. `generated/synthetic/` — compiler output for synthetic scenarios
3. `.tesseract/evidence/runs/` — raw evidence files
4. `.tesseract/learning/` — learning artifacts
5. `.tesseract/runs/` — run records
6. `.tesseract/sessions/` — session transcripts
7. `.tesseract/translation-cache/` — translation cache
8. `knowledge/` — restored to git HEAD via `git checkout HEAD -- knowledge/`

If a new transient directory is added to the pipeline, it **must** be added to `cleanSlateProgram`. There is no other cleanup mechanism.

### Inter-Iteration Cleanup

Between dogfood loop iterations, `cleanupBetweenIterations` (in `dogfood.ts`) wipes sessions and evidence runs to cap memory growth within a single speedrun. This is a subset of clean-slate — it preserves run records and proposals needed for convergence detection.

### Test Workspace Isolation

`createTestWorkspace` (`tests/support/workspace.ts`) copies seeded demo artifacts into a temp directory and explicitly removes `scenarios/synthetic/` to prevent accumulated on-disk synthetics from inflating test scope. Tests must never depend on synthetic scenarios existing on disk.

### Common Confusion Points

1. **"I see 100+ files on disk in dogfood/scenarios/synthetic/"** — These are from a prior speedrun that crashed before clean-slate ran. Safe to delete: `rm -rf dogfood/scenarios/synthetic/`. The next speedrun regenerates them.

2. **"Should I commit knowledge changes?"** — Only if they are hand-authored or reviewed. Auto-activated hints from the speedrun are ephemeral and will be overwritten by the next run.

3. **"The speedrun is slow / processing too many scenarios"** — Check for accumulated synthetic scenarios. The dogfood loop refreshes all tag-matching scenarios. If 100+ synthetics exist from a prior crashed run, that's 100+ refreshes per iteration.

4. **"My branch has dogfood/ changes"** — On training branches, `dogfood/` is tracked for continuity. But the speedrun's `cleanSlateProgram` will wipe synthetic content at the start of each run regardless. Don't commit synthetic scenarios or auto-activated knowledge.
