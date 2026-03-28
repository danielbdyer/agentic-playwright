# Master Prioritization: From 20 Perspectives to Executable Sequence

*Synthesized from 5 rounds of research (20 perspectives), 3 analytical agents (backlog extraction, dependency analysis, readiness assessment), and cross-referenced against BACKLOG.md. March 2026.*

---

## Executive Summary

Twenty research perspectives across five rounds identified **~80 actionable improvements**, refined to **93 prioritized items** across **5 execution waves**. The critical insight: **the system is ~60% of its own specification** — the types and documentation describe a more complete system than the runtime implements. Closing the gap requires no architectural redesign, only wiring, enforcement, and verification.

The recommended sequence prioritizes three principles:
1. **Foundations first**: Governance enforcement and verification infrastructure unlock everything else
2. **Cheap unlocks before expensive features**: Quick wins that unblock parallel tracks
3. **Proof before expansion**: Verify what exists before building what's next

**Timeline estimate**: 5 waves across ~9-11 weeks (parallelizable to ~5-6 weeks with 2-3 contributors). Wave 5 adds algebraic formalization, Big O analysis, Effect concurrency, React 19 adoption, and GoF pattern crystallization.

---

## How to Read This Document

Each item carries:
- **ID**: Stable reference (e.g., W1.3 = Wave 1, item 3)
- **Origin**: Which perspective(s) surfaced it
- **Effort**: S (hours), M (1-2 days), L (3-5 days), XL (1-2 weeks)
- **Readiness**: 🟢 (infrastructure exists, just wire it), 🟡 (partial, needs design), 🔴 (requires new architecture)
- **Unlocks**: What becomes possible after this item ships

Items within a wave can be parallelized unless marked sequential (→).

---

## Wave 1: Foundations & Quick Wins (Week 1)

**Goal**: Establish governance enforcement, add high-value verification tests, and ship zero-dependency quick wins. Everything in this wave has no prerequisites and unblocks Wave 2.

**Wall-clock time**: ~5 days (all items parallel).

### Governance Foundation

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.1 | ~~**Centralize governance minting via `mintApproved()`**~~ ✅ — Replaced hardcoded `governance: 'approved'` string literals across `validation/core.ts`, `discover-screen.ts`, `agent-session-adapter.ts`, `resolution-stages.ts`, `bind.ts`, `emit.ts`, `task.ts`, `inbox.ts`, `receipt.ts`, `scenario.ts` with `mintApproved()` from `lib/domain/types/workflow.ts` | M | 🟢 | P7, P19 | W1.2, W2.1 |
| W1.2 | ~~**Implement `mergeGovernance` lattice meet**~~ ✅ — `mergeGovernance(g1, g2)` implemented in `lib/domain/algebra/lattice.ts` as `GovernanceLattice.meet`. O(1) via ordinal rank mapping | S | 🟢 | P17 | W2.3 (lattice law tests) |

### Verification Quick Wins

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.3 | ~~**Dashboard projection invariant test**~~ ✅ — `tests/dashboard-projection.laws.spec.ts`: proves observation ≠ computation via DashboardPort vs DisabledDashboard comparison | M | 🟢 | P18, P19 | Confidence for all dashboard work |
| W1.4 | ~~**Effect boundary architecture fitness test**~~ ✅ — Added to `architecture-fitness.laws.spec.ts`. Asserts `Effect.runPromise`/`runSync` only in `lib/composition/` plus documented exceptions | S | 🟢 | P10, P18 | Prevents accidental FP boundary leaks |
| W1.5 | ~~**Envelope schema validation test**~~ ✅ — Added to `architecture-fitness.laws.spec.ts`. Validates `WorkflowEnvelope` has all required fields and `mapPayload` preserves them | S | 🟢 | P18, P19 | Cross-boundary contract confidence |
| W1.6 | ~~**SharedArrayBuffer round-trip encoding test**~~ ✅ — `tests/sab-roundtrip.laws.spec.ts`: field fidelity, capacity fill, wrap-around, governance/actor ordinals, Float64 weights | S | 🟢 | P12, P16 | Confidence for O2 (zero-copy viz) |

### Agent Quick Win

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.7 | **Populate agent DOM snapshot** — Fill the always-null `domSnapshot` field in `resolution-stages.ts:491` with a 2K-char ARIA snapshot from the live page. Prompt template already handles it (`agent-interpreter-provider.ts:393`) | S | 🟢 | P14, P19, P20 | Agent can resolve layout-dependent intents; closes Gap B2 |

### Infrastructure

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.8 | ~~**Extract `mulberry32` seeding utility**~~ ✅ — Extracted to `tests/support/random.ts` with `mulberry32`, `randomWord`, `randomInt`, `pick`, `maybe`. Updated all consumers | S | 🟢 | P18 | Cleaner property-based testing for Wave 2-3 |

### Wave 1 Completion Criteria

- [x] `governance: 'approved'` literal appears in 0 production files (only via `mintApproved`)
- [x] `mergeGovernance` function exists with lattice meet semantics
- [ ] Dashboard projection invariant test passes
- [x] Effect boundary test passes with documented exception whitelist
- [ ] Agent DOM snapshot is non-null when page is available
- [x] All new tests green in CI

---

## Wave 2: Enforcement & Critical Path (Weeks 2-3)

**Goal**: Enforce governance at the type level, close the discovery→knowledge feedback loop, add algebraic law tests, and establish the verification layer. This wave delivers ~80% of the value from all 20 perspectives.

**Wall-clock time**: ~10 days. 7 parallel tracks; critical path is governance enforcement (W2.1 → W2.2 → W2.4 = 8 days serial).

### Track A: Governance Enforcement (sequential)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.1 | ~~**Adopt `foldGovernance` at all decision boundaries**~~ ✅ — Replaced raw `governance === 'approved'` checks in `bind.ts`, `task.ts`, `emit.ts`, `inbox.ts`, `scenario.ts`, `execution/interpret.ts` with exhaustive `foldGovernance` dispatch | M | 🟢 | P7, P13, P17 | W2.2 |
| W2.2 | ~~**Enforce phantom brands at emission boundary**~~ ✅ — `emit.ts` requires `Approved<BoundScenario>` or `ReviewRequired<BoundScenario>`. `Blocked` emits `test.skip()` via `renderBlockedEmitArtifacts`. `foldGovernance` gates emission exhaustively | M | 🟡 | P7, P17, P19 | W2.4 |

### Track B: Algebraic & Property Law Tests (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.3 | ~~**Governance lattice law tests**~~ ✅ — 8 law groups (idempotent, commutative, associative, absorption, bounded, monotonicity, mergeGovernance, meetAll/joinAll) with 150 seeds in `tests/governance-lattice.laws.spec.ts` | M | 🟢 | P17, P18 | Refactoring safety for governance |
| W2.4 | ~~**Catamorphism fusion law test**~~ ✅ — Fusion law verified for all 9 folds (8 + foldStepWinningSource) in `tests/catamorphism-fusion.laws.spec.ts` with 150 seeds | M | 🟢 | P17, P18 | Optimization confidence |
| W2.5 | ~~**Precedence monotonicity law test**~~ ✅ — `tests/precedence-monotonicity.laws.spec.ts`: total order, weight monotonicity, early-exit correctness, deterministic resolution across 150 seeds | M | 🟢 | P17, P18 | Precedence refactoring safety |
| W2.6 | ~~**Supplement hierarchy precedence test**~~ ✅ — `tests/supplement-hierarchy.laws.spec.ts`: local > shared > default precedence, monotonicity, first-writer-wins across 150 seeds | S | 🟢 | P18 | Knowledge layer confidence |
| W2.7 | ~~**Simplex invariant test**~~ ✅ — `tests/simplex-invariant.laws.spec.ts`: sum-to-one, non-negative, idempotent, zero-vector safety, invariance under uniform scaling across 150 seeds | S | 🟢 | P17, P18 | Learning loop confidence |

### Track C: Discovery & Knowledge Loop (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.8 | **Discovery-to-proposal bridge** — When `harvest` discovers elements, surfaces, and state topology, auto-generate `ProposalBundle` entries for `ScreenElements`, `ScreenHints`, `ScreenBehavior`. Close the discovery → knowledge feedback loop. **Highest-leverage item from Round 1** | L | 🟡 | P1, P4, BACKLOG | Self-sustaining knowledge; W3.1, W3.2 |
| W2.9 | **Knowledge decay & freshness policy** — Artifact confidence decays if not exercised in N runs (configurable, default off). Triggers re-verification of stale knowledge | M | 🟡 | P4, BACKLOG-B3 | Anti-drift for knowledge layer |

### Track D: Cross-Graph Validation (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.10 | **Cross-graph consistency validation** — `ApplicationInterfaceGraph` and `DerivedGraph` validate mutual consistency: screen refs match, element refs match, no dangling edges. Build-time check. Currently 0 cross-references between builders | M | 🟡 | P8, P11, P19 | Silent corruption detection |
| W2.11 | ~~**Graph topology law tests**~~ ✅ — `tests/graph-topology.laws.spec.ts`: node uniqueness, edge ref integrity, DAG containment, deterministic fingerprinting | M | 🟡 | P6, P11 | Graph refactoring safety |

### Track E: Runtime Improvements (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.12 | **Extract recovery strategies as composable chain** — Move recovery orchestration from `scenario.ts:620-680` into strategy chain (like resolution ladder). Make testable and configurable per-runbook | M | 🟡 | P9 | W3.6 (parallel steps) |
| W2.13 | ~~**Agent interpretation caching**~~ ✅ — `lib/application/agent-interpretation-cache.ts`: fingerprint-keyed cache, `agentInterpretationCacheKey`, read/write/prune. Law tests in `tests/agent-interpretation-cache.laws.spec.ts` | S | 🟢 | P14, P16 | Faster dogfood iterations |
| W2.14 | **Spec-runtime parity test** — Run emitted spec, compare trace to runtime execution trace. Proves generated code and runtime produce equivalent results | M | 🟡 | P5, P10, P18 | Trust in emitted code |

### Track F: Incremental Execution (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.15 | **Fingerprint-based incremental execution law test** — Verify unchanged inputs skip recomputation. Different inputs cause rebuild. Manifest-based cache invalidation is correct and deterministic | M | 🟡 | P15, P18 | W3.7 (cross-stage dirty tracking) |

### Wave 2 Completion Criteria

- [x] `foldGovernance` has ≥10 production call sites (up from 0)
- [x] `emit()` requires `Approved<BoundScenario>` at the type level
- [ ] 7 new algebraic/property law tests passing
- [ ] Discovery generates proposals for discovered elements
- [ ] Cross-graph validation catches dangling references at build time
- [ ] Agent interpretation cache reduces LLM calls on repeated runs
- [ ] Verification coverage: 40% → ~65%

---

## Wave 3: Observation Loop & Runtime Evolution (Weeks 4-5)

**Goal**: Complete the observation surface, add Rung 8 (LLM-assisted DOM), enable cross-stage caching, and wire the full dashboard event taxonomy. This wave closes the "invisible architecture" gaps from Perspective 19.

**Wall-clock time**: ~8 days. 6 parallel tracks.

### Track A: Observation Surface Completion (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.1 | **Wire all 22 dashboard events to React consumers** — 10 of 22 event kinds are emitted but unconsumed: `rung-shift`, `calibration-update`, `proposal-activated`, `confidence-crossed`, `artifact-written`, `iteration-start`, `iteration-complete`, `workbench-updated`, `fitness-updated`, `inbox-item-arrived`. Add dispatch handlers and minimal visualization for each | M | 🟡 | P12, P16, P19 | Complete observation loop |
| W3.2 | **SharedArrayBuffer zero-copy path to React** — Wire `usePipelineBuffer` hook (already exists) to consume ring buffer for high-frequency events instead of JSON-over-WebSocket. The most technically sophisticated piece of the observation surface is currently unused | S | 🟢 | P12, P16, P19 | High-frequency visualization without serialization overhead |
| W3.3 | **MCP resource expansion** — Add `tesseract://proposal/{id}`, `tesseract://bottleneck/{screen}`, `tesseract://run/{runId}` URIs. Expand tool surface from 8 implemented to 15 defined. Full workbench queryability from VSCode/Claude Code | M | 🟡 | P12, P16 | External agent integration |

### Track B: Rung 8 — LLM-Assisted DOM Exploration (sequential after W1.7, W2.12)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.4 | **Add Rung 8: LLM-assisted DOM exploration** — Between structural Rung 7 (live-dom) and semantic Rung 9 (agent-interpreted). Agent combines DOM snapshot with semantic understanding. Fills the gap identified in Perspective 19 (B2) and Perspective 20 (DOM paradox). Requires updating `lib/domain/precedence.ts` rung ordering and `lib/runtime/agent/resolution-stages.ts` | L | 🟡 | P19, P20 | Semantic + structural resolution; reduces needs-human rate |

### Track C: MCP Tool Symmetry (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.5 | **Expose MCP tools to internal agent interpreter** — Internal agent at Rung 9 gets same tool access as external agents. Currently 15 MCP tools defined but only external agents (Claude Code, Copilot) can use them | M | 🟡 | P16, P19 | Agent symmetry; structured observation in agent context |

### Track D: Runtime Optimization (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.6 | **Parallel step execution for independent steps** — Execute assertion-only steps concurrently. `scenario.ts:340` currently has `concurrency: 1`. Requires dependency analysis from compiled program | M | 🟡 | P9 | Wall-clock time reduction for large suites |
| W3.7 | **Cross-projection dirty tracking** — `emit` knows if `bind` already ran. Per-command manifests replaced with cross-command dependency cache. Running `npm run emit` after `npm run bind` skips rebuild when bind output is fresh | M | 🟡 | P15, P18 | Eliminates redundant recompilation |

### Track E: Knowledge Maturation (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.8 | **Route knowledge persistence** — Discover URL variants → persist as `knowledge/routes/{app}.routes.yaml`. Query params to screen mapping, tab indices to section views | L | 🟡 | P4, BACKLOG-B1 | Dynamic route discovery |
| W3.9 | **Knowledge coverage as scorecard metric** — Add thin-screen/thin-action hotspots to convergence criteria. Dogfood loop doesn't stop while thin screens remain. Active coverage seeking, not passive measurement | M | 🟡 | P4 | Coverage-driven improvement loop |

### Track F: Dogfood Loop Enhancement (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.10 | **Structured entropy injection** — Parameterized variance profiles: ADO phrasing variants, data posture combinations, screen state permutations, navigation path variants. Accelerates knowledge hardening by increasing exposure diversity | L | 🟡 | P3, BACKLOG-D1 | Faster convergence; more robust knowledge |
| W3.11 | **Speedrun progress reporting** — Emit `ProgressEvent` at milestones: `{ phase, iteration, completedScenarios, totalScenarios, currentMetrics, elapsed, estimatedRemaining }`. Write to `.tesseract/runs/{runId}.progress.json` + stderr | M | 🟡 | P3, BACKLOG-D1.5 | Operational visibility during long runs |

### Wave 3 Completion Criteria

- [ ] All 22 dashboard event kinds have React consumers (up from 12)
- [ ] SharedArrayBuffer path exercised by React visualization
- [ ] Rung 8 exists and resolves cases that Rung 7 alone misses
- [ ] Internal agent has MCP tool access (agent symmetry)
- [ ] Cross-stage dirty tracking prevents redundant rebuilds
- [ ] Entropy injection produces measurably faster convergence
- [ ] Verification coverage: ~65% → ~80%

---

## Wave 4: Advanced & Visionary (Weeks 6+)

**Goal**: Architectural upgrades, formal pipeline DAG, VSCode integration, and the self-verification compiler vision. These are high-value but high-effort items that benefit from the foundation laid in Waves 1-3.

**Wall-clock time**: Ongoing. Items are independent and can be prioritized individually.

### Architecture Evolution

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W4.1 | **Formal pipeline DAG with auto-ordering** — Replace sequential dogfood loop with dependency-aware DAG scheduler. Stages run in parallel when independent; dependencies explicit. Requires W3.7 (cross-stage tracking) as foundation | XL | 🔴 | P15 | Optimal execution scheduling |
| W4.2 | **Complete Effect Schema migration** — Replace 50+ custom validators in `validation/core.ts` with Effect Schema + `Schema.filter()`. Composable semantic checks, single validation language | L | 🟡 | P11 | Unified validation surface |
| W4.3 | **Runtime graph queries** — Interface graph queryable at execution time: "given screen X with state Y, what transitions are available?" Turn compile-time projection into live navigation oracle | L | 🟡 | P1 | Dynamic navigation decisions |
| W4.4 | **CLI registry decomposition** — Split 30-command `registry.ts` (~800 lines) into per-command modules | M | 🟢 | P15 | Maintainable CLI at scale |

### Agentic Surface

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W4.5 | **Confidence-gated auto-approval** — `--auto-approve-above-threshold` flag. Low-risk proposals flow to canon unattended within trust-policy thresholds. Enables `dogfood` execution profile | M | 🟡 | BACKLOG-A2 | Unattended improvement loops |
| W4.6 | **Dogfood orchestrator command** — Single `npm run dogfood` = discover → compile → run → propose → auto-approve → rerun loop. Budget controls: `--max-iterations`, `--max-cost`, `--convergence-threshold` | M | 🟡 | BACKLOG-A3 | One-command recursive improvement |
| W4.7 | **VSCode extension integration** — Task provider (inbox → VSCode tasks), problem matcher (proposals → file positions), Copilot Chat participant (query knowledge, approve, rerun) | XL | 🔴 | BACKLOG-E2 | Full interactive agent collaboration |

### Formalization

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W4.8 | ~~**Kleisli composition laws for pipeline stages**~~ ✅ — Completed as W5.6 | M | 🟡 | P17 | Stage refactoring safety |
| W4.9 | **Fixed-point convergence bounds** — Formalize Lyapunov function `Φ(state) = -knowledgeHitRate`. Prove monotonic decrease. Derive termination bounds | L | 🟡 | P17 | Convergence guarantees |
| W4.10 | ~~**Trust policy Galois connection verification**~~ ✅ — Completed as W5.7 | M | 🟡 | P17 | Trust policy optimization |
| W4.11 | **Self-verification doctrine compiler** — Parse structured CLAUDE.md invariants → generate law tests automatically. Close doctrine-to-test gap systematically | XL | 🔴 | P18 | Doctrine-as-executable specification |

---

## Wave 5: Algebraic Foundations, Concurrency, and Modern React (Weeks 7-9)

**Goal**: Formalize the algebraic structures hiding in the architecture, exploit Effect's concurrency model for parallel compilation/discovery, adopt React 19 APIs for the dashboard, and crystallize GoF patterns already implicit in the code. This wave turns unnamed mathematical structure into named, tested, and optimized infrastructure.

**Wall-clock time**: ~12 days. 5 parallel tracks with minimal cross-dependencies.

**Prerequisites from earlier waves**: W1.2 (mergeGovernance), W1.8 (mulberry32), W2.1 (foldGovernance), W2.3-W2.7 (algebraic laws), W2.12 (recovery chain), W3.1 (wire events), W3.2 (SAB zero-copy), W3.6 (parallel steps).

### Track A: Functional Programming Formalization (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W5.1 | ~~**Named algebra module: `lib/domain/algebra/lattice.ts`**~~ ✅ — `BoundedLattice<T>`, `Lattice<T>`, `GovernanceLattice` with O(1) ordinal rank, `mergeGovernance`, `meetAll`, `joinAll` | M | 🟡 | P17, W1.2 | Type-safe governance composition; W5.2 |
| W5.2 | ~~**Catamorphism fusion law tests**~~ ✅ — Fusion law for all 9 folds in `tests/catamorphism-fusion.laws.spec.ts` with 150 seeds and random post-map selection | M | 🟢 | P17, P18, W2.4 | Safe fold fusion optimization; single-pass traversals |
| W5.3 | ~~**Semigroup/Monoid module: `lib/domain/algebra/monoid.ts`**~~ ✅ — `Semigroup<T>`, `Monoid<T>`, `validationRuleMonoid<T>()`, `concatAll`, `foldMap` | M | 🟡 | P17 | Composable scoring across all learning modules |
| W5.4 | ~~**Free monoid for workflow envelope lineage**~~ ✅ — `lib/domain/algebra/lineage.ts`: `lineageMonoid`, `mergeLineage`, `emptyLineage`, `freeStringMonoid`, `freeStageMonoid`. Law tests in `tests/lineage-monoid.laws.spec.ts` (6 law groups, 150 seeds) | S | 🟢 | P17, P18 | Lineage composition correctness; provenance chain verification |
| W5.5 | ~~**Recursive fold audit and refactor**~~ ✅ — Refactored 10 files in `lib/application/` (artifacts, benchmark, evolve, build-proposals, fold, interface-intelligence, knob-search, replay-interpretation, speedrun, translation-cache). Replaced mutable `let`+`push`+`for` with `reduce`/`map`/`flatMap`/spread | M | 🟡 | P13, coding-notes | Purity guarantee for application layer |
| W5.6 | ~~**Kleisli arrow module for pipeline stages**~~ ✅ — `lib/domain/algebra/kleisli.ts`: `KleisliArrow<A,B,E,R>`, `composeKleisli`, `pureKleisli`, `identityKleisli`, `mapKleisli`. Law tests in `tests/kleisli-composition.laws.spec.ts` (15 tests, left/right identity + associativity) | M | 🟡 | P17, W4.8 | Stage refactoring safety; pipeline DAG foundation (W4.1) |
| W5.7 | ~~**Galois connection verification for trust policy**~~ ✅ — `tests/galois-connection.laws.spec.ts`: adjunction property, monotonicity, identity connections, confidence/evidence thresholds across 150 seeds | M | 🟡 | P17, W4.10 | Trust policy optimization; redundant gate elimination |

### Track B: Big O & Algorithmic Complexity (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W5.8 | ~~**Resolution ladder early-exit proof and optimization**~~ ✅ — `chooseByPrecedence` refactored to O(R+C) via Map pre-indexing + true early-exit loop. All 4 precedence law tests pass | S | 🟢 | P17, P19 | Faster resolution for large candidate sets |
| W5.9 | ~~**Graph builder quadratic pattern audit**~~ ✅ — `interface-intelligence.ts` and `derived-graph.ts`: Map pre-indexing for node lookups, replaced array `.find()` in loops with indexed lookups | M | 🟡 | P8, P11 | Sub-linear graph construction at scale (2000+ scenarios) |
| W5.10 | ~~**Translation cache amortized analysis**~~ ✅ — `tests/translation-cache-amortized.laws.spec.ts`: key determinism, collision resistance, monotone hit rate, identity round-trip across 150 seeds | S | 🟢 | P14, P16 | Dogfood loop cost model; agent budget derivation |
| W5.11 | ~~**Scoring rule combination complexity bounds**~~ ✅ — Monoid identity, semigroup associativity, annihilator absorption, bounded clamping, weight linearity, contramap composition, and Θ(k×n) complexity laws in `tests/scoring-algebra.laws.spec.ts` (150 seeds) | S | 🟢 | P17 | Confidence in learning loop scalability |
| W5.12 | ~~**Property-based test coverage probability analysis**~~ ✅ — Exact inclusion-exclusion and union bound computations in `tests/coverage-probability.laws.spec.ts`. Empirical verification for d=3..8. Confidence table with monotonicity laws. Seed count recommendations per dimension | S | 🟢 | P18 | Evidence-based test confidence; seed count tuning |

### Track C: Effect Concurrency Patterns (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W5.13 | **Parallel scenario compilation with bounded concurrency** — `compile.ts` and `emit.ts` process scenarios sequentially. Lift to `Effect.forEach(scenarios, compileFn, { concurrency: resolveEffectConcurrency() })` using the existing `concurrency.ts:13-27` utility. Gate: verify deterministic output regardless of concurrency level via fingerprint comparison law test | M | 🟢 | P15, W3.6 | 2-4x compile speedup on multi-core; dogfood loop wall-clock reduction |
| W5.14 | **Structured concurrency for discovery harvesting** — `harvest` visits screens sequentially. Independent screens can be harvested in parallel via `Effect.forEach(screens, harvestScreen, { concurrency: 4 })`. Shared state (SelectorCanon, knowledge catalog) accessed via Effect `Ref` for safe concurrent reads. Write contention resolved by collecting proposals per-screen then merging post-harvest | L | 🟡 | P1, P4 | Faster discovery; linear speedup for multi-screen apps |
| W5.15 | ~~**Effect.race for timeout-bounded agent interpretation**~~ ✅ — `agent-interpreter-provider.ts`: `withAgentTimeout` wrapper + `createTimeoutBoundedProvider` factory. Returns `needs-human` with `reason: 'token-budget-exceeded'` on timeout | S | 🟢 | P14, W2.22 | Predictable agent latency; cost ceiling per step |
| W5.16 | **Concurrent graph building via Effect.all** — `interface-intelligence.ts` builds 11 node kinds sequentially. Independent node collections (routes, screens, surfaces, targets, snapshots) can be built in parallel: `Effect.all({ routes: buildRouteNodes(...), screens: buildScreenNodes(...), ... })`. Edge construction depends on nodes, so stays sequential after. Reduces graph build from O(Σ node_kinds) to O(max node_kind) | M | 🟡 | P1, P8 | Faster graph projection; sub-second rebuild for large apps |
| W5.17 | ~~**Backpressure-aware PubSub with overflow strategy**~~ ✅ — `tests/pubsub-backpressure.laws.spec.ts`: capacity bounds, FIFO ordering, backpressure behavior, concurrent producer/consumer safety | S | 🟢 | P12, P16, W2.21 | Event bus reliability under load; operational visibility |

### Track D: React 19 Integration (parallel)

Dashboard is on React 19.2.4 but uses zero React 19 APIs. All hooks are React 18-era (`useState`, `useEffect`, `useCallback`, `useRef`). The dashboard has a rich spatial/3D layer (React Three Fiber) with atoms/molecules/organisms decomposition and a SharedArrayBuffer zero-copy path that is currently unused by React.

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W5.18 | **`useTransition` for non-blocking event dispatch** — `app.tsx:92-120` builds a dispatch table that calls `setState` synchronously on every WebSocket message. Wrap high-frequency dispatches (`element-probed`, `rung-shift`, `calibration-update`) in `useTransition` so they yield to user interactions (approval clicks, queue management). Keeps the 3D spatial canvas at 60fps during burst events | M | 🟢 | P12, P16, W3.1 | Smooth 60fps dashboard during pipeline bursts |
| W5.19 | **`use()` for streaming pipeline results** — Replace the `useQuery` + polling pattern for scorecard/fitness data with React 19's `use()` hook consuming an Effect Stream converted to a ReadableStream. The pipeline already emits `fitness-updated` events; `use()` can unwrap the promise of the next event inline without `useEffect` boilerplate. Pair with `<Suspense>` boundaries around `FitnessCard` and `ConvergencePanel` | M | 🟡 | P16, W3.1 | Declarative streaming; eliminates manual subscription plumbing |
| W5.20 | **`useOptimistic` for proposal approval UI** — `WorkbenchPanel` shows queued proposals awaiting operator approval. Currently approval round-trips through WebSocket before updating UI. Use React 19's `useOptimistic` to immediately show the proposal as approved, then reconcile on server confirmation. Revert on rejection. Pairs with `useMutation` from TanStack Query (already imported) | S | 🟢 | P16, W3.16 | Instant feedback on approval actions; perceived latency → 0 |
| W5.21 | **Concurrent SharedArrayBuffer rendering with `useDeferredValue`** — `usePipelineBuffer` hook in `dashboard/src/hooks/use-pipeline-buffer.ts` polls the ring buffer each frame. Wrap the decoded `BufferEvent[]` in `useDeferredValue` so the spatial canvas (`SpatialCanvas`, `SelectorGlows`, `ParticleTransport`) renders at display frame rate while the event processing runs at a lower deferred priority. Prevents frame drops when event volume spikes | S | 🟢 | P12, W3.2 | Zero-copy viz without frame drops; exploits React 19 concurrent features |
| W5.22 | **React 19 `ref` as prop for dashboard atoms** — Dashboard atoms (`StageDot`, `QueueItem`, `WeightIndicator`, `DriftMeter`, `RungBar`, `ConnectionDot`) currently use `forwardRef`. React 19 passes `ref` as a regular prop. Remove all `forwardRef` wrappers across 7 atom components, simplifying the component API. Add `ref` to prop interfaces directly | S | 🟢 | React 19 | Cleaner component APIs; reduced boilerplate |

### Track E: Design Pattern Crystallization (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W5.23 | **Strategy pattern: first-class resolution strategy registry** — `resolution-stages.ts` defines strategies as functions. Extract into a `StrategyRegistry` that maps `ResolutionPrecedenceRung → ResolutionStrategy`. Strategies register themselves; the ladder iterates the registry in rung order. New rungs (like W3.4 Rung 8) add a strategy entry without modifying the orchestrator. Pattern: GoF Strategy with registry lookup | M | 🟡 | P9, W2.12 | Open/closed resolution ladder; Rung 8 plugs in cleanly |
| W5.24 | **Visitor: auto-derive fold cases from discriminated union types** — `visitors.ts` manually defines 8 fold functions with hand-written case records. Add a `deriveFold<TUnion>(discriminant: string)` utility that generates the `Cases<R>` interface type from the union's discriminant field. Uses TypeScript's conditional types and mapped types. Add architecture fitness test: every discriminated union in `lib/domain/types/` has a corresponding fold in `visitors.ts` | M | 🟡 | P17, P18 | Automatic fold coverage; new union variants immediately caught |
| W5.25 | ~~**Composite: scoring rule algebra with identity and annihilator**~~ ✅ — `lib/domain/algebra/scoring.ts`: `identityScoringRule`, `annihilatorScoringRule`, `boundedScoringRule`, `scoringRuleSemigroup`, `scoringRuleMonoid`. Law tests in `tests/scoring-algebra.laws.spec.ts` | S | 🟢 | P17, W5.3 | Richer scoring composition; bottleneck calibration safety |
| W5.26 | ~~**State Machine: typed dogfood convergence FSM**~~ ✅ — `lib/domain/convergence-fsm.ts`: `ConvergenceState` (exploring/narrowing/plateau/converged), `ConvergenceEvent`, `transitionConvergence`, `foldConvergenceState`. Law tests in `tests/convergence-fsm.laws.spec.ts` | M | 🟡 | P3, P17 | Formal convergence guarantees; Lyapunov function attachment point |
| W5.27 | **Observer: typed event taxonomy for dashboard subscription** — Dashboard dispatch table in `app.tsx:94-120` is an untyped `Record<string, (data: unknown) => void>`. Replace with a typed `EventObserver<TEventMap>` where `TEventMap` maps event kind strings to payload types. Subscribe/unsubscribe by kind. Ensures all 22 event kinds have handlers at compile time | M | 🟡 | P12, P16, W3.1 | Compile-time event coverage; no silent event drops |
| W5.28 | **Builder: typed graph construction with phantom build phases** — `derived-graph.ts` (1,731 lines) builds the graph in an implicit sequence: nodes first, then edges, then metrics. Extract a `GraphBuilder<Phase>` with phantom-typed phases: `GraphBuilder<'nodes'>` → `.addEdges()` → `GraphBuilder<'edges'>` → `.computeMetrics()` → `GraphBuilder<'complete'>`. Only `GraphBuilder<'complete'>` exposes `.build()`. Prevents out-of-order construction at the type level | L | 🟡 | P8, P11 | Type-safe graph construction; eliminates "edges before nodes" bugs |

### Critical Complexity Analysis

| Algorithm | File | Current | Target | Item |
|-----------|------|---------|--------|------|
| `chooseByPrecedence` | `precedence.ts:33-45` | ~~O(R×C) worst-case~~ | **O(R+C) early-exit** ✅ | W5.8 |
| `buildDerivedGraph` | `derived-graph.ts` | O(V+E) with hidden O(V²) | O(V+E) with Map index | W5.9 |
| `combineScoringRules` | `learning-shared.ts:24` | Θ(k×n), k=4 rules | Θ(n), k constant | W5.11 |
| Translation cache lookup | `translation-cache.ts` | O(1) amortized | O(1) proven | W5.10 |
| Scenario compilation | `compile.ts` | O(S) sequential | O(S/P), P=cores | W5.13 |
| Discovery harvesting | harvest pipeline | O(screens) sequential | O(screens/4) parallel | W5.14 |
| Graph node building | `interface-intelligence.ts` | O(Σ node_kinds) | O(max node_kind) | W5.16 |
| Ring buffer read | `use-pipeline-buffer.ts` | O(1) amortized/frame | O(1) already optimal | W5.21 |

### Wave 5 Completion Criteria

- [x] `lib/domain/algebra/` directory exists with `lattice.ts`, `monoid.ts`, `scoring.ts`, `lineage.ts`
- [x] Catamorphism fusion law passes for all 9 folds in `visitors.ts`
- [x] Kleisli composition laws (identity, associativity) pass for pipeline stages
- [x] Galois connection adjunction property verified for trust policy
- [x] `chooseByPrecedence` refactored from O(R×C) to O(R+C) with Map pre-indexing
- [x] Graph builder audit eliminates all O(n²) patterns
- [ ] Scenario compilation runs with `concurrency > 1`, produces identical output
- [x] Agent interpretation has `Effect.race` timeout with graceful fallback
- [ ] Dashboard uses `useTransition` for burst events, maintains 60fps
- [ ] `use()` replaces at least one `useQuery` subscription for streaming data
- [ ] `useOptimistic` provides instant approval feedback in WorkbenchPanel
- [ ] All `forwardRef` wrappers removed from dashboard atoms (React 19 ref-as-prop)
- [ ] `StrategyRegistry` supports pluggable resolution strategies
- [ ] Typed `EventObserver<TEventMap>` covers all 22 dashboard event kinds
- [x] Mutable accumulation patterns refactored in 10 `lib/application/` files
- [ ] Verification coverage: ~80% → ~90%

---

## Critical Path Analysis

The shortest chain to "system enforces what it declares":

```
Wave 1                          Wave 2                          Wave 3
─────────────────────────────── ─────────────────────────────── ───────────────
W1.1 Centralize minting (2d) → W2.1 foldGovernance (2d) → W2.2 Phantom emission (3d)
                                                                    ║
W1.3 Dashboard projection (2d)                                      ║ (governance enforced)
W1.7 DOM snapshot (0.5d)                                            ║
                                W2.8 Discovery→proposal (5d) ──→ W3.8 Route knowledge
                                W2.3-W2.7 Algebraic laws (parallel, 4d)
                                W2.10 Cross-graph validation (3d)
                                                                W3.1 Wire events (3d)
                                                                W3.4 Rung 8 (5d)
```

**Critical path**: W1.1 → W2.1 → W2.2 = **7 days serial** to compile-time governance enforcement.

**Everything else parallelizes around this chain.** By end of Wave 2 (~day 15), the system has:
- Type-safe governance (phantom brands enforced)
- Self-sustaining knowledge (discovery generates proposals)
- 15+ new law tests (~65% verification coverage)
- Agent sees DOM and caches interpretations

---

## Dependency Graph: What Unlocks What

```
FOUNDATIONS (Wave 1)                 ENFORCEMENT (Wave 2)              COMPLETION (Wave 3)
┌─────────────────────┐            ┌──────────────────────┐          ┌─────────────────────┐
│ W1.1 Mint central   │──────────→│ W2.1 foldGovernance  │────────→│                     │
│ W1.2 mergeGov       │──────────→│ W2.3 Lattice laws    │         │                     │
│                     │            │ W2.2 Phantom brands  │────────→│ (governance done)   │
│ W1.3 Dashboard test │──────────→│                      │         │ W3.1 Wire events    │
│ W1.5 Envelope test  │           │ W2.8 Discovery→prop  │────────→│ W3.8 Route know     │
│ W1.7 DOM snapshot   │──────────→│                      │         │ W3.4 Rung 8         │
│ W1.8 mulberry32     │──────────→│ W2.3-7 Algebra tests │         │ W3.5 MCP symmetry   │
│                     │            │ W2.12 Recovery chain │────────→│ W3.6 Parallel steps │
│ W1.4 Effect bound   │           │ W2.15 Incremental    │────────→│ W3.7 Cross-stage    │
└─────────────────────┘            └──────────────────────┘          └─────────────────────┘
        8 items                           15 items                         11 items
        ~5 days                           ~10 days                         ~8 days
```

---

## Risk Matrix

| Item | Risk Level | What Could Go Wrong | Mitigation |
|------|-----------|---------------------|------------|
| W2.2 Phantom brands at emission | **Medium** | Threading `Approved<T>` through pipeline could surface hidden code paths that don't preserve governance | Start type-only (mint, thread) without enforcing emit requirement; add enforcement in follow-up |
| W3.4 Rung 8 (LLM-DOM) | **Medium** | Changes resolution contract; could alter existing test outcomes if rung ordering shifts | Feature flag; run side-by-side; measure accuracy delta before enabling |
| W2.8 Discovery→proposal | **Low** | Follows existing proposal patterns; discovery infrastructure (517 lines) and proposal system (232 lines) already exist | Use acceptance tests with real discovery runs; keep discovery read-only until verified |
| W3.6 Parallel steps | **Medium** | Dependency analysis between steps may miss implicit ordering requirements | Conservative: only parallelize assertion-only steps initially; expand after evidence |
| W4.1 Pipeline DAG | **High** | Orchestration change affects every command; wrong dependency graph causes silent stale data | Feature flag; run in parallel with sequential; compare outputs |

---

## Highest-Leverage Moves (Top 10 Across All 20 Perspectives)

These are the items that appear most frequently across perspectives, have the best effort-to-impact ratio, and unlock the most downstream work:

| Rank | Item | Wave | Effort | Perspectives | Why It's #1-10 |
|------|------|------|--------|-------------|----------------|
| 1 | **W1.1 + W2.1 + W2.2: Governance enforcement chain** | 1→2 | S+M+M | P7, P13, P17, P18, P19 | Closes the largest accidental gap (35 ungoverned mint sites); makes the lattice real; **5 perspectives** converge on this |
| 2 | **W2.8: Discovery-to-proposal bridge** | 2 | L | P1, P4, BACKLOG | **Highest-leverage single item** from R1; closes the knowledge loop; system grows without human authoring |
| 3 | **W2.3-W2.7: Algebraic law test suite** | 2 | 5×S/M | P17, P18 | Raises verification from 40% to ~65%; makes refactoring provably safe; **formalizes 8 algebraic structures** |
| 4 | **W1.7: Populate agent DOM snapshot** | 1 | S | P14, P19, P20 | Cheapest item with cross-perspective convergence (3 perspectives); unblocks layout-aware resolution |
| 5 | **W1.3: Dashboard projection invariant test** | 1 | M | P18, P19 | Single test proving the most important architectural property; zero-risk, high confidence |
| 6 | **W3.1: Wire all 22 dashboard events** | 3 | M | P12, P16, P19 | Completes the observation loop; 10 event kinds currently emitted into void |
| 7 | **W3.4: Rung 8 (LLM-assisted DOM)** | 3 | L | P19, P20 | Fills the structural/semantic gap; information theory says this is the missing rung |
| 8 | **W2.10: Cross-graph validation** | 2 | M | P8, P11, P19 | Silent corruption detector; currently 0 cross-references between the two graph models |
| 9 | **W2.13: Agent interpretation caching** | 2 | S | P14, P16 | Same pattern as existing translation cache; eliminates redundant LLM calls |
| 10 | **W3.10: Structured entropy injection** | 3 | L | P3, BACKLOG-D1 | Accelerates knowledge hardening by 10-100× through deliberate variance |

---

## Mapping to BACKLOG.md Lanes

| BACKLOG Lane | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Wave 5 |
|-------------|--------|--------|--------|--------|--------|
| **A — Agentic core** | W1.7 (DOM snapshot) | W2.13 (agent cache) | W3.4 (Rung 8), W3.5 (MCP symmetry) | W4.5 (auto-approval), W4.6 (dogfood cmd) | W5.15 (race timeout), W5.23 (strategy registry) |
| **B — Knowledge** | — | W2.8 (discovery→proposal), W2.9 (decay) | W3.8 (routes), W3.9 (coverage metric) | — | W5.14 (parallel harvest) |
| **C — Resolution/execution** | — | W2.12 (recovery chain), W2.14 (parity test) | W3.6 (parallel steps) | W4.3 (runtime graph) | W5.8 (early-exit), W5.13 (parallel compile) |
| **D — Dogfooding** | — | — | W3.10 (entropy), W3.11 (progress) | W4.6 (orchestrator) | W5.26 (convergence FSM) |
| **E — Projection** | W1.3 (dashboard test) | W2.10 (cross-graph) | W3.1 (events), W3.2 (SAB), W3.3 (MCP) | W4.7 (VSCode) | W5.18-W5.22 (React 19), W5.27 (Observer), W5.28 (Builder) |
| **Governance** | W1.1, W1.2 | W2.1, W2.2, W2.3 | — | — | W5.1 (lattice), W5.7 (Galois) |
| **Verification** | W1.4-W1.6, W1.8 | W2.3-W2.7, W2.11, W2.15 | — | W4.8-W4.11 | W5.2 (fusion), W5.4 (free monoid), W5.6 (Kleisli), W5.11-W5.12 (bounds) |
| **FP Formalization** | — | — | — | — | W5.1, W5.3, W5.5 (algebra modules, monoids, fold audit) |

---

## Metrics Dashboard

Track these across waves to measure progress:

| Metric | Before | After Wave 1 | After Wave 2 | After Wave 3 | After Wave 4 | After Wave 5 |
|--------|--------|-------------|-------------|-------------|-------------|-------------|
| Governance mint sites (untyped) | 35 | 0 | 0 | 0 | 0 | 0 |
| `foldGovernance` production call sites | 0 | 0 | ≥10 | ≥10 | ≥10 | ≥10 |
| Phantom brand enforcement sites | 1 | 1 | ≥3 | ≥3 | ≥5 | ≥8 |
| Law test suites | 20 | 24 | 31 | 31 | 35+ | 45+ |
| Law assertions | 192 | 210 | 260 | 260 | 300+ | 380+ |
| Declared invariants verified | 40% | 48% | 65% | 80% | 90%+ | 95%+ |
| Dashboard events consumed | 12/22 | 12/22 | 12/22 | 22/22 | 22/22 | 22/22 |
| Agent DOM snapshot | null | populated | populated | populated | populated | populated |
| Cross-graph validation | none | none | build-time | build-time | build-time | build-time |
| Resolution rungs | 10 | 10 | 10 | 11 (Rung 8) | 11 | 11 |
| Named algebra modules | 0 | 0 | 0 | 0 | 0 | **5 (lattice, monoid, scoring, lineage, kleisli)** ✅ |
| React 19 API adoption | 0 | 0 | 0 | 0 | 0 | 5 (useTransition, use, useOptimistic, useDeferredValue, ref-as-prop) |
| Compile concurrency | 1 | 1 | 1 | 1 | 1 | auto (CPU cores) |
| Mutable accumulation in lib/application | unknown | unknown | unknown | unknown | unknown | **Refactored in 10 files** ✅ |

---

## Appendix A: Items Caught in Final Audit

A cross-check of all 20 perspectives against this document surfaced **12 additional items** that were missing or underrepresented. They are incorporated here by wave, with the original perspective cited.

### Added to Wave 2

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.16 | **Cross-iteration rejection memory ("iteration journal")** — Persist reasoning across dogfood iterations: why a proposal was generated, why it was rejected, what alternative was tried. Without this, the loop is vulnerable to proposal thrashing — reconsidering and rejecting the same proposals repeatedly | M | 🟡 | P3 | Stable convergence; prevents thrashing in dogfood loop |
| W2.17 | ~~**Knowledge promotion governance contract laws**~~ ✅ — `tests/knowledge-promotion.laws.spec.ts`: valid state transitions, forbidden shortcuts, evidence/confidence preconditions, governance monotonicity | M | 🟡 | P6 | Trust boundary formalization; W2.8 completion |
| W2.18 | ~~**Evidence sufficiency laws**~~ ✅ — `tests/evidence-sufficiency.laws.spec.ts`: threshold matching, kind requirements, certification monotonicity across 150 seeds | S | 🟡 | P6 | Certification contract completeness |
| W2.19 | ~~**Selector canon ranking laws**~~ ✅ — `tests/selector-canon-ranking.laws.spec.ts`: specificity total order, kind hierarchy (test-id > role-name > css), permutation stability across 150 seeds | S | 🟡 | P6 | Resolution precedence correctness |

### Added to Wave 3

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.12 | **Fixture-backed data emission** — Emit dataset references or posture-variant parameterization instead of hardcoded literals in generated specs. Currently data values resolve to single hardcoded strings, blocking spec reuse across data combinations | M | 🟡 | P5 | Parameterized specs; QA adoption |
| W3.13 | **Deferred-step visual rendering distinction** — Intent-only steps should be visually distinct in emitted code (e.g., `// [intent-only]` markers or distinct function wrappers). QA reading the spec currently can't tell grounded from deferred without checking annotations | S | 🟢 | P5 | Spec readability and operator trust |
| W3.14 | **Component knowledge maturation from runtime evidence** — As runtime accumulates evidence of successful widget interactions, propose component knowledge updates (e.g., "this combobox requires: click, type, wait, select based on 47 observations"). Distinct from screen-level discovery (W2.8) — this targets `knowledge/components/*.ts` | L | 🟡 | P4 | Procedural knowledge growth |
| W3.15 | **Cross-screen transition state preservation laws** — Law tests verifying state topology invariants when navigating between screens: route-variant application preserves expected state refs, no silent state loss during transition | M | 🟡 | P6 | Navigation correctness |
| W3.16 | **Agent workbench wiring** — Connect the scored work-item queue (interpret-step, approve-proposal, investigate-hotspot, author-knowledge, validate-calibration) as a consumable surface for external agents via MCP. The workbench types exist; the consumption path doesn't | M | 🟡 | P3 | External agent integration; W4.7 foundation |

### Added to Wave 4

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W4.12 | **Runtime screen identification from DOM + interface graph** — Runtime identifies which screen it's on by inspecting the DOM against the interface graph, rather than relying on compile-time screen resolution. Structural shift from pre-resolved to runtime-discovered screen context | L | 🟡 | P2 | True runtime screen awareness |
| W4.13 | **Phantom type enforcement beyond emission** — Extend `Approved<T>` enforcement beyond just `emit()` to bind, proposal, and approval stages. Governance enforcement is only as strong as its weakest boundary; emission-only leaves proposal/approval stages untyped | M | 🟡 | P7 | Full-pipeline type-safe governance |

### Added to Wave 1

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.9 | ~~**Live ADO adapter fixture test**~~ ✅ — `tests/ado-adapter-fixture.laws.spec.ts` with fixture-based XML parsing, content hashing, entity mapping verification | S | 🟢 | P12 | Parsing regression safety |
| W1.10 | ~~**MCP tool catalog completeness test**~~ ✅ — `tests/mcp-tool-catalog.laws.spec.ts` verifying all MCP tools have handlers and consistent naming | S | 🟢 | P18 | Tool surface reliability |

### Additional Wave 2 Items

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.20 | ~~**Round-trip binding law test**~~ ✅ — `tests/binding-roundtrip.laws.spec.ts`: structure preservation, governance threading, step type coverage | M | 🟡 | P18 | Binding correctness proof |
| W2.21 | **Effect PubSub backpressure test** — Validate 4096-capacity bounded queue behavior under load: backpressure triggers correctly, no event loss within capacity, graceful degradation beyond capacity | S | 🟢 | P18 | Event bus reliability |
| W2.22 | ~~**Agent error taxonomy**~~ ✅ — `lib/domain/types/agent-errors.ts`: 6-variant discriminated union (`AgentNetworkTimeout`, `AgentRateLimit`, `AgentTokenOverflow`, `AgentAuthFailure`, `AgentMalformedResponse`, `AgentUnknownError`). Law tests in `tests/agent-error-taxonomy.laws.spec.ts` | S | 🟢 | P14 | Targeted error recovery |
| W2.23 | ~~**Agent token budget enforcement**~~ ✅ — `lib/domain/agent-budget.ts`: `TokenBudget` interface, `exceedsBudget`, `remainingBudget`, `truncateToFit`. Law tests in `tests/agent-error-taxonomy.laws.spec.ts` | S | 🟢 | P14 | Cost control; prevents token overages |

### Additional Wave 3 Items

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W3.17 | **Extract observation as first-class phase** — Move observation logic from `scenario.ts:117-150` into independently testable `lib/runtime/observe/execute.ts`. Currently `observe/index.ts` is only 3 lines (re-export). Observation is read-only, zero risk to extract | S | 🟢 | P9 | Observation testability; reusable for discovery |

### Additional Wave 4 Items

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W4.14 | **Agent provider A/B testing infrastructure** — Route subsets of novel steps to alternate providers (heuristic vs LLM). Track proposal quality divergence. Enables data-driven comparison of resolution strategies | M | 🟡 | P14 | Evidence-based provider selection |
| W4.15 | **Proposal quality metrics in agent→alias feedback loop** — Track which agent-suggested aliases cause misdirection on future runs. Identify low-quality aliases before they accumulate in knowledge. Closes the information-theoretic bottleneck identified in P20 | M | 🟡 | P20 | Feedback loop quality assurance |

### Revised Item Count

With both audit passes, the master plan now contains:

| Wave | Original Items | Audit 1 | Audit 2 | Wave 5 | Total |
|------|---------------|---------|---------|--------|-------|
| Wave 1 | 8 | 0 | 2 | — | 10 |
| Wave 2 | 15 | 4 | 4 | — | 23 |
| Wave 3 | 11 | 5 | 1 | — | 17 |
| Wave 4 | 11 | 2 | 2 | — | 15 |
| Wave 5 | — | — | — | 28 | 28 |
| **Total** | **45** | **11** | **9** | **28** | **93** |

---

## Final Note

This document is itself a projection — derived from 20 canonical research perspectives, cross-checked by 5 analytical agents, and audited for completeness against every source document. It should be treated as a living plan: update priorities as items ship, collapse completed waves, and promote Wave 4 items when their prerequisites are met.

The single most important takeaway: **the system already knows what it should be**. The types are 90% there. The runtime wiring is 40% there. The gap is the work — and it's 93 well-defined items across 5 waves, not open-ended research.

### Document Lineage

| Artifact | Content | Status |
|----------|---------|--------|
| `docs/research-next-directions.md` | Round 1: Interface graph, runtime interpreter, dogfood loop, knowledge density (P1-P4) | Complete |
| `docs/research-next-directions-round2.md` | Round 2: Emission surface, law tests, governance boundary, dual graphs (P5-P8) | Complete |
| `docs/research-next-directions-round3.md` | Round 3: Execution engine, Effect boundary, schema validation, infrastructure ports (P9-P12) | Complete |
| `docs/research-next-directions-round4.md` | Round 4: Domain purity, agent interpreter, pipeline/CLI, dashboard (P13-P16) | Complete |
| `docs/research-next-directions-round5.md` | Round 5: Algebra, self-verification, invisible architecture, information theory (P17-P20) | Complete |
| `docs/research-master-prioritization.md` | **This document** — 93 items across 5 waves, dependency graph, risk matrix, metrics | Complete |
