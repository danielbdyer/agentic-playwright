# Next Prioritization: From 140 Remaining Items to What Actually Matters

*Critical synthesis of all 10 research documents after completing 93/93 original items. Filtered through a hard question: does this change real behavior, or is it architecture tourism? March 28, 2026.*

---

## Executive Summary

The 93-item sprint produced strong foundations — governance enforcement, algebraic building blocks, knowledge lifecycle types, MCP surface — but an honest audit reveals a gap: **12 of 13 new modules have zero production imports**. They're tested, algebraically sound, and completely disconnected from the running pipeline.

The remaining ~140 items from the research corpus split into three buckets:
1. **~12 integration tasks** that wire existing orphan modules into production (the actual highest-leverage work)
2. **~10 features** that directly reduce `needs-human` rate or unlock new product surfaces
3. **~118 items** that range from nice-to-have to intellectual tourism

This document sequences the first two buckets honestly and names the third explicitly so it doesn't keep generating roadmap gravity.

**Timeline estimate**: 3 phases across ~6-8 weeks for the real work. Everything else is backlog, not "Wave 4-6."

---

## Phase 0: The Integration Debt (Week 1)

**The uncomfortable truth**: The following modules were built, law-tested, and marked ✅ across research docs — but have zero callers in the production pipeline. Until they're wired in, they're dead code with good test coverage.

| Module | Lines | Production imports | What wiring means |
|--------|-------|-------------------|-------------------|
| `lib/domain/algebra/lattice.ts` | 56 | 0 | `mergeGovernance()` called at every governance merge point in bind/emit/task |
| `lib/domain/algebra/lineage.ts` | 65 | 0 | `mergeLineage()` called in envelope handoffs instead of manual spread |
| `lib/domain/algebra/kleisli.ts` | 55 | 0 | Composition used in pipeline phase chaining — **or deleted if not needed** |
| `lib/domain/convergence-fsm.ts` | 128 | 0 | FSM replaces ad-hoc convergence detection in dogfood loop |
| `lib/domain/knowledge-freshness.ts` | 66 | 0 | `computeDecayedConfidence()` called during resolution to downweight stale knowledge |
| `lib/domain/component-maturation.ts` | 123 | 0 | `matureComponentKnowledge()` called after successful widget interactions |
| `lib/domain/proposal-quality.ts` | 166 | 0 | `classifyAlias()` called during proposal evaluation |
| `lib/domain/graph-queries.ts` | 282 | 0 | Graph queries available in `InterfaceResolutionContext` at runtime |
| `lib/application/agent-ab-testing.ts` | 179 | 0 | `assignVariant()` called in agent interpreter provider |
| `lib/application/pipeline-dag.ts` | 224 | 0 | DAG replaces sequential command dispatch in dogfood loop |
| `lib/runtime/agent/rung8-llm-dom.ts` | 198 | 0 | Rung 8 registered in resolution stages between Rung 7 and Rung 9 |
| `lib/runtime/agent/strategy-registry.ts` | 96 | 0 | Registry replaces hardcoded rung dispatch in resolution |

**One module is already wired**: `lib/domain/algebra/scoring.ts` (41 lines) → imported by `learning-shared.ts` → used by `agent-workbench.ts`. This is the model for what the other 12 need.

### Phase 0 Completion Criteria

- [ ] Every module above has ≥1 production call site (or is deleted with justification)
- [ ] Dogfood loop uses `ConvergenceFSM` for convergence detection
- [ ] Resolution stages use `StrategyRegistry` for rung dispatch
- [ ] Knowledge freshness decay affects resolution scoring
- [ ] Pipeline DAG orders phase execution
- [ ] `kleisli.ts` is either used in phase composition or removed

---

## Phase 1: Reduce `needs-human` Rate (Weeks 2-4)

**The metric that matters.** Every item here directly reduces the rate at which the system gives up and asks for help, or directly improves operator response time when it does.

### Track A: Better Failure Modes

| ID | Item | Effort | Readiness | Source | Why it's real |
|----|------|--------|-----------|--------|---------------|
| N1.1 | **Explain-Your-Choice Receipts** — every rung selection and fallback emits a machine-readable reason chain | S | 🟢 | RX2.5 | Debugging goes from "read the trace" to "read the reason." Requires strategy-registry wiring from Phase 0 |
| N1.2 | **Intent Clarification Protocol** — when stuck, emit structured clarification request with context before escalating to `needs-human` | S | 🟡 | T3.4.6 | Directly reduces `needs-human` by giving operators actionable questions instead of opaque failures |
| N1.3 | **Console Sentinel** — capture browser console errors/warnings per step, attach to receipts | S | 🟢 | T3.5.2 | Catches app-level errors invisible to DOM. Zero dependencies, immediate signal |

### Track B: Better Resolution

| ID | Item | Effort | Readiness | Source | Why it's real |
|----|------|--------|-----------|--------|---------------|
| N1.4 | **Execution Tempo Awareness** — detect per-screen response tempo, adapt timeouts automatically | M | 🟡 | T3.4.5 | Directly reduces flaky failures from timing mismatches. Static timeouts are the #1 source of false `needs-human` |
| N1.5 | **Input Affordance Detector** — query element affordances (focusable, role, constraints) before interaction | M | 🟡 | T3.5.6 | Replaces tag-name guessing with semantic affordance matching. More robust widget interaction |
| N1.6 | **Resolution Rung Stress Test** — force execution from each rung individually; measure marginal value | S | 🟢 | T3.2.5 | Data-driven rung tuning. Reveals which rungs earn their compute cost. Informs whether Rung 8 should even exist |

### Track C: Better Knowledge Flow

| ID | Item | Effort | Readiness | Source | Why it's real |
|----|------|--------|-----------|--------|---------------|
| N1.7 | **Route Knowledge Persistence** — when harvest discovers route variants, propose `knowledge/routes/` entries automatically | M | 🟡 | R1 | Closes the last gap in discovery→canon flow. Routes are discovered and then forgotten |
| N1.8 | **Knowledge Coverage as Scorecard Metric** — thin-screen and thin-action-family counts become convergence criteria | S | 🟢 | R1 | Loop actively seeks coverage instead of passively measuring. Changes convergence behavior with one metric |
| N1.9 | **Graduated Autonomy Profiles** — "auto-approve for screens with >5 successful runs, require review for novel" | M | 🟡 | R1 | Reduces operator burden as confidence grows. The binary trust policy is the main adoption friction |

### Track D: Knowledge Integrity

| ID | Item | Effort | Readiness | Source | Why it's real |
|----|------|--------|-----------|--------|---------------|
| N1.10 | **Knowledge Contradiction Detector** — detect conflicting hints/routes/patterns; emit conflict receipts; block contradictory promotion | M | 🟡 | RX3.3 | The #1 long-term reliability risk. Contradictions silently erode resolution quality. Requires freshness wiring from Phase 0 |

### Phase 1 Completion Criteria

- [ ] `needs-human` rate decreases measurably on dogfood suite
- [ ] Every resolution receipt carries a reason chain
- [ ] Route discoveries flow through proposal pipeline
- [ ] Contradictory knowledge is detected before promotion
- [ ] Scorecard convergence considers coverage gaps
- [ ] Rung marginal value data exists for tuning decisions

---

## Phase 2: Product Surface Expansion (Weeks 5-8)

**Three real bets on what Tesseract becomes next.** Each one changes the product's identity, not just its implementation. Only pursue these after Phase 0-1 are solid.

### Bet A: Operator Intelligence

| ID | Item | Effort | Readiness | Source | Why it's a real bet |
|----|------|--------|-----------|--------|---------------------|
| N2.1 | **One-Click "Why"** — click any failure/event/proposal in dashboard to view condensed causal chain | M | 🟡 | RX4.2 | Requires N1.1 reason chains. The single most requested operator feature. Root-cause in <60 seconds |
| N2.2 | **"What Would Break" Simulator** — query interface graph with hypothetical DOM changes; show which scenarios degrade | M | 🟡 | U | 80% of the data exists in `impact.ts` and `rerun-plan.ts`. Pre-deployment risk assessment is a real use case |
| N2.3 | **Cold-Start Accelerator** — bootstrap mode with curated seed packs and sparse-discovery strategy | M | 🟡 | RX5.4 | The adoption gate. New suites take too long to reach useful baseline. This is a product problem, not a research problem |

### Bet B: Multi-Target Emission

| ID | Item | Effort | Readiness | Source | Why it's a real bet |
|----|------|--------|-----------|--------|---------------------|
| N2.4 | **Decouple emission backend from Playwright** — the IR (`GroundedSpecFlow`) and `CanonicalTargetRef` are target-agnostic; only `spec-codegen.ts` is Playwright-specific | L | 🟡 | U | Transforms identity from "Playwright tool" to "verification compiler." The unsaid-opportunities doc is right: the last 200 lines of `spec-codegen.ts` are the only coupling. This is the highest-leverage product pivot available |

### Bet C: Cost Transparency

| ID | Item | Effort | Readiness | Source | Why it's a real bet |
|----|------|--------|-----------|--------|---------------------|
| N2.5 | **Cost OS** — unified accounting for tokens, latency, retries per pipeline phase; surface in scorecard | M | 🟡 | RX5.1 | If Rung 8/9 use LLM calls, cost visibility is table stakes. Without this, you can't make informed decisions about agent vs. deterministic resolution |

### Phase 2 Completion Criteria

- [ ] Operators can explain any major failure in <60 seconds
- [ ] "What would break if we change X?" is answerable before deployment
- [ ] New suite reaches useful baseline in materially fewer iterations
- [ ] At least one non-Playwright emission target produces valid output
- [ ] Token/compute cost per scenario is visible in scorecard

---

## The Backlog (not sequenced, not promised)

Everything below is legitimate work that doesn't justify a wave number or timeline. It lives here so it stops generating roadmap pressure.

### Worth doing if the need becomes concrete

| Item | Source | Trigger condition |
|------|--------|-------------------|
| **Artifact Firewall** (canonical/derived write boundaries) | RX1.3 | When someone actually corrupts canonical files by accident |
| **Narrative Run Reports** (auto-generated stakeholder summaries) | RX4.5 | When there are stakeholders who need summaries |
| **Universal Replay Capsule** (portable run bundles) | RX1.4 | When someone needs to reproduce a run on a different machine |
| **Cross-Screen Transition Modeling** | R1 | When the state graph's screen-scoped model actually limits resolution |
| **Run Archaeology Index** (temporal fingerprint history) | T3.1.1 | When there are enough runs to need temporal queries |
| **Regression Canary System** | T3.1.2 | When regressions are a real problem, not a theoretical risk |
| **Generative Scenario Forge** | RX6.6 | When existing scenario coverage is provably insufficient |
| **Knowledge Archaeology Mode** (evidence chain queries) | U | When operators actually ask "why does this alias exist?" |
| **Auto-Refactor for Knowledge** (merge/split overgrown files) | RX3.4 | When knowledge files are actually overgrown |
| **Tiered Storage** (hot/warm/cold artifacts) | RX5.5 | When storage is actually expensive |

### Interesting but premature

| Item | Source | Why not now |
|------|--------|-------------|
| **Multi-Plan Resolver** (Fast/Safe/Insightful plans) | RX2.1 | The existing precedence ladder works. Three plans per scenario is 3x complexity for unclear benefit. Build this when single-plan resolution demonstrably fails |
| **Counterfactual Runner** | RX2.3 | Depends on replay capsule + run archaeology + multi-plan. Three prereqs that don't exist yet |
| **Autonomous Experiment Mode** | RX6.2 | The evolve loop already does this with a human in the loop. Full automation is XL effort for uncertain value. Ship it when the evolve loop is in daily use |
| **Network Conversation Tracker** (CDP API interception) | T3.5.1 | More data in receipts ≠ better. CDP interception adds fragility. Build this when agent resolution needs API-level signal |
| **Accessibility Tree Differ** | T3.5.3 | Not core to test automation. Build this if/when accessibility testing becomes a product surface |
| **Adversarial Hardening** (knockout trials, chaos injection) | T3.2.1-3 | Validates governance robustness. Build when governance is actually load-bearing (i.e., after Phase 0) |

### Cut (not worth building)

| Item | Source | Why not |
|------|--------|---------|
| **Envelope as Functor / Resolution as Catamorphism** | T3.6.1-2 | Renaming working code with category theory vocabulary. `mapPayload` works. Calling it a functor doesn't make it work better |
| **Monadic Envelope Composition** (`flatMapPayload`) | U | The pipeline works imperatively. Monadifying it adds abstraction without changing behavior. The `kleisli.ts` module (0 imports) is the proof |
| **Pipeline Phases as Free Monad** | T3.6.4 | Academic exercise. The pipeline doesn't need multiple interpreters. Cost estimation doesn't require a free monad; it requires a cost counter |
| **Knowledge Federation** (package manager, treaty protocol, federated scorecard) | T3.3.1-7 | There is ONE suite. Building npm-for-knowledge for a single consumer is speculative infrastructure |
| **Proof-Carrying Runs** | RX6.4 | Who checks the proofs? Regulated environments have their own assurance frameworks |
| **UI Digital Twin** | RX6.3 | XL effort, 🔴 readiness. A PhD thesis, not a backlog item |
| **App as Formal Language / Chinese Postman** | U | Cool graph theory. Not a product feature |
| **Execution Choreography Language** (widget DSL) | T3.7.5 | DSLs are maintenance burdens. Component knowledge in TypeScript is fine |
| **Multi-Agent Debate Resolution** | T3.7.3 | 3x cost for marginal quality improvement over single-agent |
| **Speculative Execution with Rollback** | T3.4.2 | 2x cost, 🔴 readiness, for latency reduction that's not the bottleneck |
| **Time-Travel Trace Comparator** | T3.1.4 | Diffing two JSON run files. `git diff` on the receipts directory works fine |
| **Explicit State Machines for Everything** | U | The `StateMachine<S,E,R>` abstraction is elegant. Making everything a state machine is abstraction for its own sake |
| **Delight Features** (badges, streaks, animations) | RX4.6 | Fun, but the dashboard isn't in production use. Polish what's used |
| **Confidence Weather Map / Evolution Scrapbook / Failure Constellations** | DV | Dashboard visualization features for a dashboard that needs users first |
| **Seasonal Pattern Detector** | T3.1.5 | Requires years of run history to detect seasonality |
| **Execution Deja Vu** (predictive failure trajectory) | T3.1.7 | Requires deep run history + ML. Premature |
| **Performance Budget per Screen** | T3.5.5 | Scope creep. Tesseract is test automation, not performance monitoring |
| **Self-Authoring Test Suites** | T3.7.1 | "Give me a URL and make a test suite" is a product, not a feature. Build the product when the engine is proven |
| **What-If Panel** (posture/budget preview) | RX4.3 | Depends on multi-plan resolver, which is itself questionable |
| **Conversational Step Decomposition** | T3.4.3 | Complex steps should be decomposed at scenario authoring time, not runtime |
| **Application State Assertions as Dialogue** | T3.4.4 | The resolution ladder already handles semantic matching |
| **Governance Escape Analysis** | T3.2.4 | Architecture fitness tests already check this. Defense-in-depth for a solved problem |
| **Cross-Iteration Learning Memory** | R1 | Sounds smart. But the scorecard's monotonic high-water-mark already prevents regression. What would "remembering why a proposal was rejected" actually change? |
| **Knowledge Half-Life Calculator** | T3.1.6 | `knowledge-freshness.ts` already has configurable decay. Computing a "half-life" metric is a number you'd look at once |

---

## The Meta-Observation

The research corpus (10 documents, ~140 items) has generated more roadmap than the system has production users. The 93-item sprint built strong type-level foundations but left most of them unconnected. The highest-leverage next step isn't item 94 — it's making items 1-93 load-bearing.

**Phase 0** is integration debt. **Phase 1** is the product metric that matters. **Phase 2** is three honest bets on product direction. **Everything else** is backlog that should earn its place through concrete need, not roadmap momentum.

The next document to write isn't another prioritization. It's a production deployment log.
