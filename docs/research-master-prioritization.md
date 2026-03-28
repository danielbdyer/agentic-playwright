# Master Prioritization: From 20 Perspectives to Executable Sequence

*Synthesized from 5 rounds of research (20 perspectives), 3 analytical agents (backlog extraction, dependency analysis, readiness assessment), and cross-referenced against BACKLOG.md. March 2026.*

---

## Executive Summary

Twenty research perspectives across five rounds identified **~80 actionable improvements**, refined to **56 prioritized items** across **4 execution waves**. The critical insight: **the system is ~60% of its own specification** — the types and documentation describe a more complete system than the runtime implements. Closing the gap requires no architectural redesign, only wiring, enforcement, and verification.

The recommended sequence prioritizes three principles:
1. **Foundations first**: Governance enforcement and verification infrastructure unlock everything else
2. **Cheap unlocks before expensive features**: Quick wins that unblock parallel tracks
3. **Proof before expansion**: Verify what exists before building what's next

**Timeline estimate**: 4 waves across ~6-8 weeks (parallelizable to ~4 weeks with 2-3 contributors).

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
| W1.1 | **Centralize governance minting via `mintApproved()`** — Replace 14 hardcoded `governance: 'approved'` string literals across `validation/core.ts`, `discover-screen.ts`, `agent-session-adapter.ts`, `resolution-stages.ts` with a single auditable minting function | M | 🟢 | P7, P19 | W1.2, W2.1 |
| W1.2 | **Implement `mergeGovernance` lattice meet** — `mergeGovernance(g1, g2)` returns most restrictive. Currently implicit in `binding.ts:76-84` but not extracted as a named operation | S | 🟢 | P17 | W2.3 (lattice law tests) |

### Verification Quick Wins

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.3 | **Dashboard projection invariant test** — Run pipeline with real DashboardPort and with DisabledDashboard, assert identical output. Proves the most important architectural property: observation ≠ computation | M | 🟢 | P18, P19 | Confidence for all dashboard work |
| W1.4 | **Effect boundary architecture fitness test** — Assert `Effect.runPromise`/`runSync` only in `lib/composition/` plus 8 documented exceptions. Add to `architecture-fitness.laws.spec.ts` | S | 🟢 | P10, P18 | Prevents accidental FP boundary leaks |
| W1.5 | **Envelope schema validation test** — Walk all exported workflow envelope types, verify `{kind, version, stage, scope}` fields exist | S | 🟢 | P18, P19 | Cross-boundary contract confidence |
| W1.6 | **SharedArrayBuffer round-trip encoding test** — Encode dashboard event → write to ring buffer → read back → compare. Catches off-by-one and atomicity bugs | S | 🟢 | P12, P16 | Confidence for O2 (zero-copy viz) |

### Agent Quick Win

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.7 | **Populate agent DOM snapshot** — Fill the always-null `domSnapshot` field in `resolution-stages.ts:491` with a 2K-char ARIA snapshot from the live page. Prompt template already handles it (`agent-interpreter-provider.ts:393`) | S | 🟢 | P14, P19, P20 | Agent can resolve layout-dependent intents; closes Gap B2 |

### Infrastructure

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W1.8 | **Extract `mulberry32` seeding utility** — Identical PRNG implementation duplicated in 4+ test files. Extract to `tests/support/random.ts` | S | 🟢 | P18 | Cleaner property-based testing for Wave 2-3 |

### Wave 1 Completion Criteria

- [ ] `governance: 'approved'` literal appears in 0 production files (only via `mintApproved`)
- [ ] `mergeGovernance` function exists with lattice meet semantics
- [ ] Dashboard projection invariant test passes
- [ ] Effect boundary test passes with documented exception whitelist
- [ ] Agent DOM snapshot is non-null when page is available
- [ ] All new tests green in CI

---

## Wave 2: Enforcement & Critical Path (Weeks 2-3)

**Goal**: Enforce governance at the type level, close the discovery→knowledge feedback loop, add algebraic law tests, and establish the verification layer. This wave delivers ~80% of the value from all 20 perspectives.

**Wall-clock time**: ~10 days. 7 parallel tracks; critical path is governance enforcement (W2.1 → W2.2 → W2.4 = 8 days serial).

### Track A: Governance Enforcement (sequential)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.1 | **Adopt `foldGovernance` at all decision boundaries** — Replace 10 raw `governance === 'approved'` string checks in `bind.ts`, `task.ts`, etc. with exhaustive `foldGovernance` dispatch. Adding a new governance variant then produces compile errors everywhere | M | 🟢 | P7, P13, P17 | W2.2 |
| W2.2 | **Enforce phantom brands at emission boundary** — `emit()` signature requires `Approved<BoundScenario>`. `Blocked<BoundScenario>` emits `test.skip()`. Thread `Approved<T>` from approval gate through compilation. Currently 0 production enforcement sites; 35 sites mint governance as plain strings | M | 🟡 | P7, P17, P19 | W2.4 |

### Track B: Algebraic & Property Law Tests (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.3 | **Governance lattice law tests** — Lattice meet is idempotent (`merge(a,a) = a`), commutative (`merge(a,b) = merge(b,a)`), associative. Flow is monotone: approved → review-required → blocked only, never reverse. Property-tested with mulberry32 seeds | M | 🟢 | P17, P18 | Refactoring safety for governance |
| W2.4 | **Catamorphism fusion law test** — `fold(f) ∘ fold(g) = fold(f ∘ g)` for all 8 fold functions in `visitors.ts`. Proves single-pass optimization is safe | M | 🟢 | P17, P18 | Optimization confidence |
| W2.5 | **Precedence monotonicity law test** — `rung(a) < rung(b) ⟹ weight(a) > weight(b)` for all resolution rungs. Validates the total order and early-exit correctness | M | 🟢 | P17, P18 | Precedence refactoring safety |
| W2.6 | **Supplement hierarchy precedence test** — Screen-local hints override shared patterns deterministically. No silent overrides from the wrong layer | S | 🟢 | P18 | Knowledge layer confidence |
| W2.7 | **Simplex invariant test** — `sum(bottleneck_weights) = 1.0 ± ε` after any calibration. Normalization preserves the simplex | S | 🟢 | P17, P18 | Learning loop confidence |

### Track C: Discovery & Knowledge Loop (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.8 | **Discovery-to-proposal bridge** — When `harvest` discovers elements, surfaces, and state topology, auto-generate `ProposalBundle` entries for `ScreenElements`, `ScreenHints`, `ScreenBehavior`. Close the discovery → knowledge feedback loop. **Highest-leverage item from Round 1** | L | 🟡 | P1, P4, BACKLOG | Self-sustaining knowledge; W3.1, W3.2 |
| W2.9 | **Knowledge decay & freshness policy** — Artifact confidence decays if not exercised in N runs (configurable, default off). Triggers re-verification of stale knowledge | M | 🟡 | P4, BACKLOG-B3 | Anti-drift for knowledge layer |

### Track D: Cross-Graph Validation (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.10 | **Cross-graph consistency validation** — `ApplicationInterfaceGraph` and `DerivedGraph` validate mutual consistency: screen refs match, element refs match, no dangling edges. Build-time check. Currently 0 cross-references between builders | M | 🟡 | P8, P11, P19 | Silent corruption detection |
| W2.11 | **Graph topology law tests** — Node uniqueness, edge ref integrity, acyclic containment hierarchy, deterministic fingerprinting under input permutation. For all three graph types | M | 🟡 | P6, P11 | Graph refactoring safety |

### Track E: Runtime Improvements (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.12 | **Extract recovery strategies as composable chain** — Move recovery orchestration from `scenario.ts:620-680` into strategy chain (like resolution ladder). Make testable and configurable per-runbook | M | 🟡 | P9 | W3.6 (parallel steps) |
| W2.13 | **Agent interpretation caching** — Cache agent interpretations by `(stepText, screenId, elementId)` fingerprint, same pattern as `translation-cache.ts` (136 lines). Cold-start speedruns skip LLM for identical steps | S | 🟢 | P14, P16 | Faster dogfood iterations |
| W2.14 | **Spec-runtime parity test** — Run emitted spec, compare trace to runtime execution trace. Proves generated code and runtime produce equivalent results | M | 🟡 | P5, P10, P18 | Trust in emitted code |

### Track F: Incremental Execution (parallel)

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.15 | **Fingerprint-based incremental execution law test** — Verify unchanged inputs skip recomputation. Different inputs cause rebuild. Manifest-based cache invalidation is correct and deterministic | M | 🟡 | P15, P18 | W3.7 (cross-stage dirty tracking) |

### Wave 2 Completion Criteria

- [ ] `foldGovernance` has ≥10 production call sites (up from 0)
- [ ] `emit()` requires `Approved<BoundScenario>` at the type level
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
| W4.8 | **Kleisli composition laws for pipeline stages** — Left/right identity, associativity for stage composition. Proves stage chaining respects monad laws | M | 🟡 | P17 | Stage refactoring safety |
| W4.9 | **Fixed-point convergence bounds** — Formalize Lyapunov function `Φ(state) = -knowledgeHitRate`. Prove monotonic decrease. Derive termination bounds | L | 🟡 | P17 | Convergence guarantees |
| W4.10 | **Trust policy Galois connection verification** — Formal adjunction property: `f(x) ⊑ y ⟺ x ⊑ g(y)` | M | 🟡 | P17 | Trust policy optimization |
| W4.11 | **Self-verification doctrine compiler** — Parse structured CLAUDE.md invariants → generate law tests automatically. Close doctrine-to-test gap systematically | XL | 🔴 | P18 | Doctrine-as-executable specification |

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

| BACKLOG Lane | Wave 1 | Wave 2 | Wave 3 | Wave 4 |
|-------------|--------|--------|--------|--------|
| **A — Agentic core** | W1.7 (DOM snapshot) | W2.13 (agent cache) | W3.4 (Rung 8), W3.5 (MCP symmetry) | W4.5 (auto-approval), W4.6 (dogfood cmd) |
| **B — Knowledge** | — | W2.8 (discovery→proposal), W2.9 (decay) | W3.8 (routes), W3.9 (coverage metric) | — |
| **C — Resolution/execution** | — | W2.12 (recovery chain), W2.14 (parity test) | W3.6 (parallel steps) | W4.3 (runtime graph) |
| **D — Dogfooding** | — | — | W3.10 (entropy), W3.11 (progress) | W4.6 (orchestrator) |
| **E — Projection** | W1.3 (dashboard test) | W2.10 (cross-graph) | W3.1 (events), W3.2 (SAB), W3.3 (MCP) | W4.7 (VSCode) |
| **Governance** | W1.1, W1.2 | W2.1, W2.2, W2.3 | — | — |
| **Verification** | W1.4-W1.6, W1.8 | W2.3-W2.7, W2.11, W2.15 | — | W4.8-W4.11 |

---

## Metrics Dashboard

Track these across waves to measure progress:

| Metric | Before | After Wave 1 | After Wave 2 | After Wave 3 | After Wave 4 |
|--------|--------|-------------|-------------|-------------|-------------|
| Governance mint sites (untyped) | 35 | 0 | 0 | 0 | 0 |
| `foldGovernance` production call sites | 0 | 0 | ≥10 | ≥10 | ≥10 |
| Phantom brand enforcement sites | 1 | 1 | ≥3 | ≥3 | ≥5 |
| Law test suites | 20 | 24 | 31 | 31 | 35+ |
| Law assertions | 192 | 210 | 260 | 260 | 300+ |
| Declared invariants verified | 40% | 48% | 65% | 80% | 90%+ |
| Dashboard events consumed | 12/22 | 12/22 | 12/22 | 22/22 | 22/22 |
| Agent DOM snapshot | null | populated | populated | populated | populated |
| Cross-graph validation | none | none | build-time | build-time | build-time |
| Resolution rungs | 10 | 10 | 10 | 11 (Rung 8) | 11 |

---

## Appendix A: Items Caught in Final Audit

A cross-check of all 20 perspectives against this document surfaced **12 additional items** that were missing or underrepresented. They are incorporated here by wave, with the original perspective cited.

### Added to Wave 2

| ID | Item | Effort | Readiness | Origin | Unlocks |
|----|------|--------|-----------|--------|---------|
| W2.16 | **Cross-iteration rejection memory ("iteration journal")** — Persist reasoning across dogfood iterations: why a proposal was generated, why it was rejected, what alternative was tried. Without this, the loop is vulnerable to proposal thrashing — reconsidering and rejecting the same proposals repeatedly | M | 🟡 | P3 | Stable convergence; prevents thrashing in dogfood loop |
| W2.17 | **Knowledge promotion governance contract laws** — Law tests for the proposal → canonical transition: what state transitions are valid (proposed → approved → canonical), what preconditions are required (evidence count, confidence threshold, human review), what is forbidden (direct skip from proposed → canonical without evaluation) | M | 🟡 | P6 | Trust boundary formalization; W2.8 completion |
| W2.18 | **Evidence sufficiency laws** — Law tests for when evidence is "sufficient" to promote a proposal. Certification state machine transitions: `uncertified → sufficient-evidence → certified` must be monotone and auditable | S | 🟡 | P6 | Certification contract completeness |
| W2.19 | **Selector canon ranking laws** — Law tests for specificity ordering and determinism under alias expansion in the `SelectorCanon`. Incorrect ranking could cause stale selectors to be preferred over fresh ones | S | 🟡 | P6 | Resolution precedence correctness |

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

### Revised Item Count

With the audit additions, the master plan now contains:

| Wave | Original Items | Added Items | Total |
|------|---------------|-------------|-------|
| Wave 1 | 8 | 0 | 8 |
| Wave 2 | 15 | 4 | 19 |
| Wave 3 | 11 | 5 | 16 |
| Wave 4 | 11 | 2 | 13 |
| **Total** | **45** | **11** | **56** |

---

## Final Note

This document is itself a projection — derived from 20 canonical research perspectives, cross-checked by 5 analytical agents, and audited for completeness against every source document. It should be treated as a living plan: update priorities as items ship, collapse completed waves, and promote Wave 4 items when their prerequisites are met.

The single most important takeaway: **the system already knows what it should be**. The types are 90% there. The runtime wiring is 40% there. The gap is the work — and it's 56 well-defined items, not open-ended research.

### Document Lineage

| Artifact | Content | Status |
|----------|---------|--------|
| `docs/research-next-directions.md` | Round 1: Interface graph, runtime interpreter, dogfood loop, knowledge density (P1-P4) | Complete |
| `docs/research-next-directions-round2.md` | Round 2: Emission surface, law tests, governance boundary, dual graphs (P5-P8) | Complete |
| `docs/research-next-directions-round3.md` | Round 3: Execution engine, Effect boundary, schema validation, infrastructure ports (P9-P12) | Complete |
| `docs/research-next-directions-round4.md` | Round 4: Domain purity, agent interpreter, pipeline/CLI, dashboard (P13-P16) | Complete |
| `docs/research-next-directions-round5.md` | Round 5: Algebra, self-verification, invisible architecture, information theory (P17-P20) | Complete |
| `docs/research-master-prioritization.md` | **This document** — 56 items across 4 waves, dependency graph, risk matrix, metrics | Complete |
