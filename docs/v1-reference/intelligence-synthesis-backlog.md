# Intelligence Synthesis Backlog

> Status: Active. This document captures the deep architectural patterns, self-similar structures, missing unifications, and open feedback circuits discovered across the Tesseract codebase. It serves as both a map of what exists and a backlog of what to build next.

## Part I: Self-Implicature — The System Applies Its Own Concepts to Itself

The Tesseract codebase is intentionally Godelian. Every major concept — proposals, evidence, confidence, governance, fitness, scoring — exists at multiple scales and applies its own logic to itself. This is not accidental; the recursive self-improvement loop demands it. A system that improves itself must be able to reason about its own reasoning.

### 1.1 Proposals Propose About Proposals

`ProposalBundle.governance` is computed from its contained proposals' `trustPolicy` evaluations (`governance-validator.ts:56-63`). A bundle's blockability is an emergent property of the proposals it carries. The governance of the container is a fold over the governance of the contained. This is the Composite pattern applied to epistemic status.

### 1.2 Trust Policy Evaluates Changes to Itself

When the system proposes modifying `trust-policy.yaml`, that proposal is evaluated by the trust policy being changed (`trust-policy.ts:62-83`). This creates a deliberate bootstrap constraint: you cannot lower gates without already meeting them. The trust policy is self-enforcing. This is not a bug — it is the mechanism that prevents the system from silently weakening its own governance.

### 1.3 Bottleneck Weights Self-Calibrate

`calibrateWeightsFromCorrelations()` in `learning-bottlenecks.ts:69-101` adjusts scoring weights based on whether those weights correctly predicted improvement. The scoring function improves its own coefficients. Each bottleneck weight is used to rank failure modes, which produce correlations, which update the weights. This is gradient descent on the scoring function's own parameters — except the gradient is computed from improvement outcomes, not from a loss function.

### 1.4 The Improvement Loop Targets Itself

`improvement.ts:193-227` generates `ImprovementSignal`s with `targetPaths` pointing at `lib/application/fitness.ts` and `lib/application/improvement.ts`. The improvement system literally proposes improvements to its own source code. The signal kind is `'self-improvement-action'`. The system is aware that it is a target of its own optimization.

### 1.5 Fitness Grades the Fitness Function

`ScoringEffectiveness.bottleneckWeightCorrelations` measures whether the fitness function's weights were actually predictive (`fitness.ts:199-245`). The scorecard's Pareto frontier evaluates whether improvements to the frontier are improvements (`fitness.ts:180-211`). `paretoDominates()` is applied to the scorecard's own history — the acceptance criterion is itself subject to the acceptance criterion.

### 1.6 Confidence Gates Confidence

A proposal has `confidence: number`. It is evaluated by `TrustPolicyEvaluation`, which produces a decision. The auto-approval system (`trust-policy.ts:108-154`) then takes the evaluation and asks: "Is my confidence in this decision high enough?" Confidence is a recursive property — the system's confidence in its own confidence determines actionability.

### 1.7 The Dogfood Loop Improves Its Own Parameters

Each dogfood iteration runs with bottleneck weights, produces metrics, and those metrics update the weights for the next iteration (`dogfood.ts:89-112, 153-177`). The loop's thread state includes the parameters it modifies. `deriveIterationCorrelations()` computes how strongly each signal correlated with improvement across consecutive pairs of iterations, then feeds those correlations back into weight calibration. Iterations improve the parameters that govern iterations.

### 1.8 Resolution Precision Weights Measure Their Own Reduction

`RankingWeights.bottleneckReduction` (`pipeline-config.ts:13-78`) scores proposals based on their ability to reduce the very bottlenecks that the `BottleneckWeights` are being used to rank. The metrics measure their own reduction. This is the deepest self-referential pattern in the scoring algebra: the weight assigned to "how much does this proposal reduce bottlenecks" is itself a parameter that affects which bottlenecks are considered most important.

### Architectural Implication

The system creates intentional circularity that forces closure and prevents infinite regress through several mechanisms:

- **Bootstrap clarity**: The system cannot lower trust gates without meeting them (self-enforcing governance).
- **Gradient signals**: Fitness metrics measure the fitness function's own accuracy, enabling targeted weight updates.
- **Convergent recursion**: Multiple feedback loops (weights -> fitness -> proposals -> evidence -> governance) all terminate at the same gate (trust policy).
- **Self-validating improvement**: Each improvement run is itself subject to the improvement criteria it establishes.

---

## Part II: Little Engines — Compact Mechanisms That Compress Large Domain Meaning

These are the "applied macros" — small pieces of code that compress surprisingly large amounts of domain meaning into elegant, pure-function mechanisms.

### 2.1 The Convergence FSM

**File:** `lib/domain/projection/convergence-fsm.ts` (~130 lines)

A pure typed state machine encoding the entire improvement loop's lifecycle: `exploring -> narrowing -> plateau -> converged`. The `converged` state is absorbing — no event escapes it. Budget exhaustion overrides any non-terminal state. The fold pattern (`foldConvergenceState`) decomposes behavior exhaustively:

```
exploring + stall -> plateau (stalledIterations: 1)
narrowing + stall -> plateau (stalledIterations: 1)
plateau   + stall -> converged (reason: 'threshold-met')
```

These 130 lines encode a state machine that the dogfood orchestrator threads through every iteration. The system never needs explicit convergence-checking logic elsewhere — the FSM carries it.

### 2.2 The Resolution Ladder as Interpreter

**File:** `lib/domain/resolution/precedence-policy.ts` (11 rungs)

Each rung is a different "interpretation language" for expressing element identity:

| Rung | Language | Analogy |
|------|----------|---------|
| 0 (explicit) | Author said "click button#submit" | Source code |
| 3 (approved-knowledge) | "We saw this 50 times, always works" | Compiled binary |
| 5 (prior-evidence) | "Last run found it here" | Cache |
| 8 (structured-translation) | "LLM ranked these candidates" | JIT compilation |
| 9 (live-dom) | "Query the live DOM tree" | Interpretation |
| 10 (agent-interpreted) | "Claude, what element matches?" | Reflection |

`chooseByPrecedence()` walks the ladder in O(R+C). The ladder recapitulates the entire system's architecture (human intent -> deterministic derivation -> statistical inference -> agentic reasoning -> human escalation) at the granularity of a single element lookup.

### 2.3 Component Maturation

**File:** `lib/domain/projection/component-maturation.ts` (126 lines)

Saturation-weighted confidence: `successRate * (1 - 1/(1 + attempts/10))`. One success does not equal 100% confidence, but 12/12 successes yields 0.95. This Lyapunov-like saturation prevents premature certainty while rewarding consistent evidence. The entire evidence-to-proposal distillation — gather observations, deduplicate by componentType, compute saturation-weighted confidence, sort descending, emit proposals — is 126 lines of pure functions.

### 2.4 Convergence Bounds via Lyapunov Stability

**File:** `lib/domain/projection/convergence-bounds.ts` (~145 lines)

A literal Lyapunov energy function proving the improvement loop terminates. `knowledgeHitRateLyapunov()` returns an energy function where energy = `1 - knowledgeHitRate`. If energy is monotonically decreasing, the system converges to a fixed point. `deriveTerminationBound(rate, initial, target)` predicts how many iterations remain. The dogfood orchestrator uses this to decide whether to continue or stop early.

~145 lines of pure mathematics encode the entire termination proof. No loops, no approximations — just Lyapunov stability applied to the improvement loop's energy landscape.

### 2.5 The Compilation Pipeline as Phantom-Branded Fold

**Files:** `compile.ts -> parse.ts -> bind.ts -> emit.ts` (~350 lines combined)

`foldGovernance` with phantom-branded types (`Approved<T>`, `Blocked<T>`) makes governance change the entire compilation output without conditional logic. Blocked scenarios emit `test.skip()`. The fold is exhaustive — missing a case is a type error. ~350 lines expand: high-level scenario intent -> executable test suite + governance compliance + trace artifacts.

### 2.6 The Convergence Finale FSM

**File:** `lib/domain/projection/convergence-finale.ts` (~395 lines)

Pure FSM for the visualization of convergence. Three reasons, three visual narratives:

- `threshold-met`: Triumph — full crystallization, green wave, crescendo
- `no-proposals`: Grace — amber tint, glass thins but does not dissolve
- `budget-exhausted`: Honest stopping — minimal ceremony, neutral tint

~395 lines of pure FSM encode an entire 15-second animation sequence driven by elapsed time, with no imperative scheduling. `triggerFinale`/`advanceFinale` are deterministic. Narration is computed from reason + metrics.

---

## Part III: Ontological Hierarchy — Five Projections of One Concept

The deepest unification opportunity in the codebase. Five distinct type systems all represent the same underlying question: "How confident are we in this artifact, and can we act on it?"

### 3.1 The Five Epistemic Layers

| Layer | Type | Location | Question |
|-------|------|----------|----------|
| A. Confidence (source) | `'human' \| 'agent-verified' \| 'agent-proposed' \| 'compiler-derived' \| 'intent-only' \| 'unbound'` | `workflow.ts:4` | How was this produced? |
| B. Governance (blockability) | `'approved' \| 'review-required' \| 'blocked'` | `workflow.ts:5` | Can this be acted on? |
| C. Trust Decision | `'allow' \| 'review' \| 'deny'` | `workflow.ts:263` | Should this activate? |
| D. Confidence Score | `number (0-1)` with `'learning' \| 'approved-equivalent' \| 'needs-review'` | `confidence.ts:81` | How sure numerically? |
| E. Decision Status | `'pending' \| 'approved' \| 'skipped' \| 'auto-approved' \| 'blocked'` | `batch-decision.ts:29` | What did the operator decide? |

These are not five separate concerns. They are five projections of a single `EpistemicStatus` lattice with three orthogonal dimensions:

- **Source**: `'human' | 'compiler' | 'agent'` — provenance of the artifact
- **Actionability**: `'blocked' | 'requires-review' | 'can-apply'` — what the system can do with it
- **Approval**: `'approved' | 'pending' | 'rejected'` — operator decision state

Layer A projects onto Source. Layer B projects onto Actionability. Layer C is a trust-policy-mediated view of the same Actionability. Layer D is a numeric embedding of Source + Evidence into a continuous space. Layer E tracks the Approval dimension through time.

### 3.2 The Governance Lattice Already Exists

`lib/domain/algebra/lattice.ts` defines `GovernanceLattice` with join/meet operations. This is the right algebraic structure — it just needs to be generalized from governance-only to the full epistemic status. The lattice algebra ensures that combining two statuses always produces a valid status, and that the "worst" status dominates (blocked wins over approved).

### 3.3 The Envelope Pattern Is Partially Unified

`WorkflowEnvelope<TPayload>` (`workflow.ts:175-184`) defines the universal cross-lane handoff structure: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, `payload`. Concrete types (`BoundScenario`, `ResolutionGraphRecord`, `ScenarioRunRecord`, `ProposalBundle`) all implement this pattern but redundantly re-declare the fields. The factory functions in `catalog/envelope.ts:14-178` manually reconstruct these fields for each concrete type.

### 3.4 Knowledge Nodes Have No Common Interface

Screens, surfaces, elements, patterns, and components are parallel hierarchies without a unified `KnowledgeNode` interface:

- `StepTaskScreenCandidate` (`knowledge.ts:49-77`): screen, url, elements[]
- `SurfaceDefinition` (`knowledge.ts:141-158`): explicit parent/children tree
- `StepTaskElementCandidate` (`knowledge.ts:31-47`): element, surface, role, widget
- `PatternDocument` (`knowledge.ts:309-328`): actions, postures, transitions

Each uses different tree representations. No unified traversal mechanism. A generic `KnowledgeNode<T>` with `kind`, `id`, `aliases`, `parents`, `children`, `metadata`, `payload` would unify them.

### 3.5 Scoring Rules Lack a Meta-Level

`ScoringRule<T>` (`algebra/scoring.ts:4-6`) defines `{ score: (input: T) => number }`. The learning-rankings module combines four rules with manual weights (`scenarioImpactRule`, `bottleneckReductionRule`, `trustWeightRule`, `evidenceRule`). But:

- No way to score how well each rule performs
- No detection of rule interference or correlation
- No auto-tuning of weights based on outcomes
- Missing calibration metadata (accuracy, precision, recall)

The meta-level partially exists — `BottleneckWeightCorrelation` in `fitness.ts:50-61` tracks whether signals predict improvement. But this metadata is not wired back into the `ScoringRule` type itself. The scoring algebra should be extended so that rules carry their own calibration history.

### 3.6 60+ Discriminated Unions Without a Unified Factory

The type system contains over 60 distinct `kind` discriminators across layers — domain (`knowledge.ts`, `intent.ts`), execution (`execution.ts`), and projection. All combine `kind + version` (many also `stage + scope`). No unified base type, no shared factory, no codegen. This is not necessarily a problem to solve with abstraction — the exhaustive `kind` checks are a feature — but the pattern is worth documenting as the ontological substrate.

---

## Part IV: Open Circuits — Data That Flows Nowhere

The system is a sophisticated diagnostic engine that stops at "here is what needs fixing" without closing the loop to "apply the fix." The following data channels produce signals with no downstream consumers.

### 4.1 Learning Artifacts: Written but Never Read

`projectLearningArtifacts()` (`learning.ts:184-240`) writes decomposition fragments, repair-recovery examples, and workflow fragments to `.tesseract/learning/`. The `TrainingCorpusManifest` is rebuilt and tracked. But nothing reads these fragments back. 18 write operations, 0 read operations in the application layer. The data is a write-only training corpus that nobody trains on.

### 4.2 Improvement Signals: Emitted but Never Acted Upon

`improvement.ts:176-227` emits 8+ classified signal types per improvement run, including severity, target paths, intervention kinds, and expected objective deltas. These are stored in the improvement ledger (`improvement-ledger.json`). No downstream consumer reads the signals to decide what to improve next. No feedback loop adjusts pipeline parameters based on signal severity. No automation implements the suggested candidate interventions.

### 4.3 Bottleneck Weight Calibration: Built but Disconnected

`calibrateWeightsFromCorrelations()` exists in `learning-bottlenecks.ts:69-100`. `computeBottleneckCorrelations()` exists in `fitness.ts:199-245`. Both are implemented and tested. But nobody calls the calibration function after computing correlations. The weights remain hardcoded. The self-calibration infrastructure is built end-to-end but the two ends are not wired together.

### 4.4 Fitness Failure Classification: Diagnosed but Not Automated

`classifyFailure()` in `fitness.ts:54-96` identifies 8 failure classes and `improvementTargetFor()` maps each to specific code locations (e.g., `translation-threshold-miss` -> `lib/application/translate.ts:55`). The knob-search module (`knob-search.ts`) maps failure classes to tunable parameters. But `mappingForFailureClass()` is only called manually from `evolve.ts`, never triggered automatically by the speedrun loop. The gradient signal (which knob to turn, which direction) is computed but not consumed.

### 4.5 Proposal Trust-Policy Blocking: Detected but No Retry

When `trust-policy-over-block` failure is detected (`fitness.ts:74`), the improvement signal recommends lowering confidence thresholds or widening evidence requirements. But no mechanism adjusts `.tesseract/policy/trust-policy.yaml` and reruns. Blocked proposals are never retried with an adjusted trust policy.

### 4.6 Recovery Effectiveness: Tracked but Never Reorders

`recovery-effectiveness.ts` computes per-strategy success rates and identifies low-effectiveness patterns. `recovery-strategy-miss` failure is detected in `fitness.ts:69`. The recommendation is to reorder or add recovery strategies. But `lib/runtime/agent/recovery.ts` never checks effectiveness data and reorders. The recovery strategy ladder remains static.

### 4.7 Selector Health: Diagnosed but No Remediation

`selector-health.ts` computes selector degradation rates and identifies brittle locators. The `degradedLocatorRate` metric feeds the fitness report. But no downstream system generates better selectors, promotes better candidates, or flags for manual review.

### 4.8 Timing Baselines: Performance Data Unused

`timing-baseline.ts` tracks resolution time per rung, screen, and action family. Computes performance regressions. Identifies slow paths. But never triggers optimization or investigation. The metrics are computed and stored; nothing reads them to prioritize work.

### 4.9 Graph Manifest Fingerprinting: Computed but Never Compared

`graphManifestPath()` in `graph.ts:71-73` computes incremental build cache fingerprints for all input artifacts. But the fingerprints are never compared against a cached manifest. Full graph rebuild happens every time despite incremental infrastructure being in place.

### 4.10 Review Projections: Next Commands Suggested but Not Executed

`review.ts` generates review documents with `nextCommands` suggestions and improvement run metadata. These are written for human consumption. No automated system reads the review and proposes code changes. The projection system is read-only.

### Root Cause

The system is designed around human-in-the-loop improvement. The speedrun loop generates a fitness report with classified failure modes, recommends specific code changes, and stops. It waits for a human or agent to execute the "backward pass." The infrastructure for automation exists (bottleneck calibration, signal correlation, parameter mapping, proposal activation feedback) but is disconnected from decision-making. The approximately 15 KB of infrastructure built for autonomous improvement loops is never invoked, and the 10+ data channels that produce signals have no downstream consumers.

---

## Part V: Missing Cross-Module Unifications

These are domain concepts that exist in isolation but logically demand a relationship. Each represents a missing integration layer.

### 5.1 Proposal Intelligence + Improvement Intelligence Are Siblings, Not Integrated

`ProposalIntelligenceReport` (`proposal-intelligence.ts:62`) ranks proposals by bottleneck alignment. `ImprovementIntelligenceReport` (`improvement-intelligence.ts:58`) ranks improvement priorities by combined fitness failure + hotspot recurrence. They sit at the same level but never talk to each other.

You cannot ask: "Does the #1 ranked proposal address the #1 improvement priority?" or "Is a high-priority improvement screen covered by any ranked proposal?" The proposal loop and the improvement loop are completely separate.

**Build target: Strategic Intelligence Orchestrator** — compose both reports, compute proposal-priority alignment, surface gaps where high-priority improvements have no proposals and where high-ranked proposals do not address any priority.

### 5.2 Four Runtime Reports Are Never Correlated

`RungDriftReport`, `TimingRegressionReport`, `CostAnomalyReport`, and `ConsoleNoiseReport` each produce independent diagnostics. Nobody asks: "Do steps with rung drift also exhibit timing regression?" or "Are steps with console noise also high-cost?" or "Which screens manifest all four signals simultaneously?"

**Build target: Execution Coherence Report** — correlate the four runtime signal dimensions per-step and per-screen, producing a composite health score and identifying screens that are simultaneously drifting, slow, expensive, and noisy.

### 5.3 Knowledge Binding Is One-Way

`BoundStep.binding.knowledgeRefs` (`intent.ts:164-177`) references knowledge artifacts. But knowledge types (`ScreenElements`, `ScreenPostures`, `ScreenHints`) have no back-reference to which scenarios depend on them. You cannot ask: "Which scenarios use this screen hint?" or "What scenarios would break if this knowledge changed?" or "Is this screen element referenced by any bound step?"

### 5.4 The Graph Surface Cannot Navigate to Reports

`DerivedGraph` (`projection.ts:159-196`) defines node kinds for scenarios, steps, elements, screens, improvement runs, evidence, and policy decisions. But it has no node kinds for drift reports, timing anomalies, cost reports, bottleneck rankings, or improvement priorities. The graph can navigate from scenario to step to element, but cannot navigate from scenario to "what reports mention it" to "what improvements would help it."

### 5.5 Interpretation Receipts Do Not Connect to Derived Intelligence

The system records `ResolutionReceipt` (what was interpreted), `InterpretationDriftRecord` (how interpretation changed), and `RungDriftReport` (resolution degradation). These are three separate tracking systems for what is fundamentally one question: "Is the system's understanding of this element stable?" An "Interpretation Coherence" concept should unify them.

### 5.6 Scenario Explanation Does Not Reference Proposals

`explanation.ts:229` counts proposals in a run but does not correlate with `ProposalRankingReport` or `KnowledgeBottleneckReport`. You cannot ask: "This scenario revealed 3 proposals; here is how they rank and what bottlenecks they target."

### 5.7 Nine Projections in `lib/domain/projection/` Are Barely Consumed

`scene-state-accumulator`, `speed-tier-batcher`, `act-indicator`, `iteration-timeline`, `summary-view`, `surface-overlay`, `component-maturation`, `binding-distribution`, and `speedrun-statistics` are defined. Several have zero external callers. No orchestrator asks: "What does the convergence FSM predict about timing regression?" or "Does component maturation correlate with proposal acceptance?"

### 5.8 Contradiction and Architecture Fitness Reports Are Isolated

`ContradictionReport` (`contradiction.ts:32`) detects conflicting knowledge. `ArchitectureFitnessReport` (`architecture-fitness.ts:18`) measures layer purity and dependency violations. Neither is correlated with fitness failure modes, referenced in improvement suggestions, connected to bottleneck detection, or used in proposal ranking.

---

## Part VI: The Evidence Lifecycle — A Cycle That Almost Closes

The most important structural observation: the evidence lifecycle is a cycle with one missing link.

### 6.1 The Cycle As-Is

1. **Execution produces evidence.** `persist-evidence.ts:23-52` writes evidence drafts to `.tesseract/evidence/runs/{adoId}/{runId}/step-*.json`.

2. **Evidence feeds learning.** `learning-state.ts` aggregates evidence into indices: timing baselines, selector health, recovery effectiveness, console patterns, cost baselines, rung drift.

3. **Learning produces proposals.** `component-maturation.ts:110-125` distills component evidence into proposals. `learning-bottlenecks.ts` identifies knowledge gaps. `learning-rankings.ts` ranks proposals by impact.

4. **Proposals feed approval.** `activate-proposals.ts` evaluates trust policy and activates approved proposals as YAML knowledge updates.

5. **Approval feeds execution.** Approved proposals become new `approved-screen-knowledge` at rung 3, raising resolution precedence for the next iteration.

### 6.2 The Missing Link

Step 2 is partially open-circuited. The learning artifacts written to `.tesseract/learning/` (decomposition fragments, repair-recovery examples, workflow fragments) are never read back. The `TrainingCorpusManifest` is metadata-only — it describes the corpus but nothing consumes the corpus. The intelligence modules (timing, recovery, selector, console, cost, rung drift) read from `StepExecutionReceipt[]` directly, not from persisted learning artifacts.

This means the evidence lifecycle closes through ephemeral in-memory data (receipts passed to intelligence modules within a single run) but does not close through persisted artifacts (fragments written to disk and read back in later runs). Cross-run learning depends on the LearningState being persisted and loaded, which is the integration layer we just built. But the training corpus itself — the grounded spec fragments that describe what the system learned in narrative form — remains write-only.

### 6.3 The Dogfood Loop as Self-Reference

`dogfood.ts:43-44` shows the self-reference most clearly: the dogfood loop tests the system on its own outputs. Scenarios compiled in iteration N run in iteration N+1, and their evidence feeds iteration N+2's proposals. The loop's own parameters (bottleneck weights) are adjusted by the loop's own outcomes (fitness metrics). This is the structural pattern the user described as "self-implicature that is inherently hierarchical and ontological yet still semantically purposeful."

---

## Part VII: Execution Backlog — What to Build

The following items are ordered by impact and dependency. Each produces a pure-function module with 10 law tests.

### 7.1 Strategic Intelligence Orchestrator (Highest Impact)

**File:** `lib/application/strategic-intelligence.ts`
**Test:** `tests/strategic-intelligence.laws.spec.ts`

Compose `ProposalIntelligenceReport` + `ImprovementIntelligenceReport` into a unified strategic view. Core questions answered:

- Does the #1 ranked proposal address the #1 improvement priority?
- Which improvement priorities have no proposals targeting them?
- Which ranked proposals do not address any improvement priority?
- What is the overall strategic alignment score?

**Types:**

```typescript
interface StrategicIntelligenceReport {
  readonly kind: 'strategic-intelligence-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly proposalIntelligence: ProposalIntelligenceReport;
  readonly improvementIntelligence: ImprovementIntelligenceReport;
  readonly strategicAlignments: readonly ProposalPriorityAlignment[];
  readonly uncoveredPriorities: readonly ImprovementPriority[];
  readonly unalignedProposals: readonly RankedProposal[];
  readonly strategicAlignmentScore: number;
  readonly topPriorityAddressed: boolean;
}

interface ProposalPriorityAlignment {
  readonly priorityRank: number;
  readonly priorityScreen: string;
  readonly matchingProposals: readonly RankedProposal[];
  readonly coverageStrength: number;
}
```

**Functions:** `buildStrategicIntelligence()`, `extractStrategicGaps()`, `computeStrategicEfficiency()`.

### 7.2 Execution Coherence Report (High Impact)

**File:** `lib/application/execution-coherence.ts`
**Test:** `tests/execution-coherence.laws.spec.ts`

Correlate the four runtime signal dimensions (rung drift, timing regression, cost anomaly, console noise) per-step and per-screen. Core questions answered:

- Which screens manifest multiple signal types simultaneously?
- Does rung drift predict timing regression?
- Are high-cost steps also noisy?
- What is the per-screen composite health score?

**Types:**

```typescript
interface ExecutionCoherenceReport {
  readonly kind: 'execution-coherence-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly screenHealth: readonly ScreenHealthProfile[];
  readonly signalCorrelations: readonly SignalCorrelation[];
  readonly compositeHealthScore: number;
  readonly hotScreens: readonly string[];
}

interface ScreenHealthProfile {
  readonly screen: string;
  readonly rungDriftScore: number;
  readonly timingScore: number;
  readonly costScore: number;
  readonly consoleScore: number;
  readonly compositeScore: number;
  readonly signalCount: number;
}

interface SignalCorrelation {
  readonly signalA: string;
  readonly signalB: string;
  readonly coOccurrenceRate: number;
  readonly strength: number;
}
```

**Functions:** `buildExecutionCoherence()`, `extractHotScreens()`, `computeSignalCorrelations()`.

### 7.3 Bottleneck Weight Wiring (Circuit Closure)

**File:** Modify `lib/application/dogfood.ts` (or new `lib/application/weight-calibration.ts`)

Close the open circuit: after `computeBottleneckCorrelations()` produces correlations, call `calibrateWeightsFromCorrelations()` and thread the updated weights into the next iteration. This is not a new module — it is wiring two existing endpoints together.

### 7.4 Governance Intelligence (Domain Unification)

**File:** `lib/application/governance-intelligence.ts`
**Test:** `tests/governance-intelligence.laws.spec.ts`

Unify `ContradictionReport` + `ArchitectureFitnessReport` + trust-policy evaluation outcomes + auto-approval statistics into one governance health view. Core questions answered:

- Are knowledge contradictions causing fitness failures?
- Is the trust policy blocking high-quality proposals?
- What is the auto-approval success rate?
- Which artifact types have the most governance friction?

### 7.5 Knowledge Dependency Graph (Bidirectional Binding)

**File:** `lib/application/knowledge-dependencies.ts`
**Test:** `tests/knowledge-dependencies.laws.spec.ts`

Build a reverse index from knowledge artifacts to the scenarios that depend on them. Core questions answered:

- Which scenarios use this screen hint?
- What scenarios would break if this knowledge changed?
- Which knowledge artifacts are unused by any scenario?
- What is the blast radius of a knowledge change?

### 7.6 Interpretation Coherence (Triple Unification)

**File:** `lib/application/interpretation-coherence.ts`
**Test:** `tests/interpretation-coherence.laws.spec.ts`

Unify `ResolutionReceipt` + `InterpretationDriftRecord` + `RungDriftReport` into a single coherence view per intent. Core questions answered:

- Is the system's understanding of this element stable?
- Is interpretation drift explaining rung drift?
- Which intents have the most interpretation variance?

---

## Part VIII: What Was Already Built

The following modules were built in this session and are committed on branch `claude/plan-missing-feature-d4bih`:

| Commit | Module | File | Tests |
|--------|--------|------|-------|
| `a8fa8c6` | Timing Baseline | `lib/application/timing-baseline.ts` | `tests/timing-baseline.laws.spec.ts` (10) |
| `a8fa8c6` | Recovery Effectiveness | `lib/application/recovery-effectiveness.ts` | `tests/recovery-effectiveness.laws.spec.ts` (10) |
| `a8fa8c6` | Selector Health | `lib/application/selector-health.ts` | `tests/selector-health.laws.spec.ts` (10) |
| `a8fa8c6` | HAR Network Intelligence | `lib/application/har-network.ts` | `tests/har-network.laws.spec.ts` (10) |
| `a8fa8c6` | Fixture Extractor | `lib/application/fixture-extractor.ts` | `tests/fixture-extractor.laws.spec.ts` (10) |
| `e96af60` | Console Intelligence | `lib/application/console-intelligence.ts` | `tests/console-intelligence.laws.spec.ts` (10) |
| `e96af60` | Execution Cost Tracker | `lib/application/execution-cost.ts` | `tests/execution-cost.laws.spec.ts` (10) |
| `e96af60` | Rung Drift Detector | `lib/application/rung-drift.ts` | `tests/rung-drift.laws.spec.ts` (10) |
| `e96af60` | LearningState Orchestrator | `lib/application/learning-state.ts` | `tests/learning-state.laws.spec.ts` (10) |
| `564db32` | Proposal Intelligence | `lib/application/proposal-intelligence.ts` | `tests/proposal-intelligence.laws.spec.ts` (10) |
| `564db32` | Improvement Intelligence | `lib/application/improvement-intelligence.ts` | `tests/improvement-intelligence.laws.spec.ts` (10) |

Total: 11 new modules, 110 law tests, all passing.

## Part IX: Execution Order

1. **Strategic Intelligence Orchestrator** (7.1) — highest impact, unifies the two sibling reports
2. **Execution Coherence Report** (7.2) — correlates four runtime signals
3. **Governance Intelligence** (7.4) — unifies governance health
4. **Knowledge Dependency Graph** (7.5) — bidirectional binding
5. **Interpretation Coherence** (7.6) — triple unification
6. **Bottleneck Weight Wiring** (7.3) — circuit closure, modifies existing code

Items 1-2 are independent and can be built in parallel. Items 3-5 are independent and can be built in parallel. Item 6 depends on understanding the dogfood loop threading, which benefits from items 1-2 being in place.
