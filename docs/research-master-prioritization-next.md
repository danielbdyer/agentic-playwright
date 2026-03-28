# Next Prioritization: From 140 Remaining Items to Executable Sequence

*Synthesized from all 10 research documents after completing 93/93 original items plus ~66 cross-doc checkoffs. This prioritization covers the ~140 remaining actionable items across expanded arcs (RX), theoretical deep-dives (T3), next-directions (R1-R5), unsaid opportunities, and dashboard vision. March 28, 2026.*

---

## Executive Summary

With the original 93-item roadmap complete, the system has crossed a threshold: **governance is enforced, algebraic foundations are verified, knowledge lifecycle is active, and the MCP surface is operational**. The remaining ~140 items fall into a different character than the first 93 — they are less about "closing gaps" and more about **compounding the system's unique advantages**.

The recommended sequence prioritizes four principles:
1. **Compound what's unique**: Items that leverage Tesseract's distinctive architecture (governed knowledge lifecycle, algebraic receipts, typed state machines) over generic improvements
2. **Close feedback loops before adding features**: The highest-leverage remaining work is wiring subsystems so knowledge flows autonomously
3. **Cheap unlocks before expensive moonshots**: Several S/M items gate entire capability families
4. **Observable before autonomous**: Make the system's behavior transparent before making it self-directed

**Timeline estimate**: 6 waves across ~14-18 weeks. Waves 1-3 are high-confidence delivery; Waves 4-6 are increasingly speculative.

---

## How to Read This Document

Each item carries:
- **ID**: `N1.3` = Next Wave 1, item 3
- **Source**: Which research doc(s) surfaced it (RX = expanded arcs, T3 = v3 theory, R1-R5 = next-directions rounds, U = unsaid, DV = dashboard vision)
- **Effort**: S (hours), M (1-2 days), L (3-5 days), XL (1-2 weeks)
- **Readiness**: 🟢 (wire existing pieces), 🟡 (partial, needs design), 🔴 (new architecture)
- **Unlocks**: What becomes possible after this ships

Items within a wave can be parallelized unless marked sequential (→).

---

## Wave 1: Loop Closure & Explainability (Week 1-2)

**Goal**: Close the three most valuable remaining feedback loops and make every major decision explainable. These are the highest-leverage items in the entire remaining backlog — each one wires existing subsystems together to create autonomous knowledge flow.

**Wall-clock time**: ~8 days. All tracks parallel.

### Track A: Explain Everything (the trust multiplier)

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N1.1 | **Explain-Your-Choice Receipts** — every fallback, escalation, and rung selection emits a concise machine-readable reason chain attached to the resolution receipt | S | 🟢 | RX2.5, R1 | N2.3 (One-Click "Why"), N3.1 (narrative reports). Transforms debugging from "read the trace" to "read the reason" |
| N1.2 | **Knowledge Half-Life Calculator** — compute empirical half-life per knowledge artifact from run history; surface in scorecard | S | 🟢 | T3.1.6 | N2.1 (contradiction detector), N3.5 (knowledge archaeology). Cheap metric that makes freshness policy evidence-based |
| N1.3 | **Console Sentinel** — monitor browser console during execution, classify messages (error/warning/info), attach to step receipts | S | 🟢 | T3.5.2 | N2.6 (multi-sensory observation). Low-effort signal source that catches app-level errors invisible to DOM inspection |

### Track B: Close the Knowledge Loop

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N1.4 | **Route Knowledge Persistence** — when harvest discovers route variants (query params → distinct UX), propose `knowledge/routes/` entries automatically | M | 🟡 | R1, BACKLOG-B1 | N2.2 (cross-screen transitions). Closes the last gap in discovery→canon flow |
| N1.5 | **Knowledge Coverage as Scorecard Metric** — elevate thin-screen and thin-action-family counts from `CorpusHealthReport` into dogfood convergence criteria | S | 🟢 | R1 | Loop actively seeks coverage instead of passively measuring it. Changes convergence behavior |
| N1.6 | **Cross-Iteration Learning Memory** — record why proposals were generated/accepted/rejected across iterations to prevent repetition and guide strategy | M | 🟡 | R1 | N3.4 (autonomous experiment mode prereq). Prevents the loop from re-discovering what it already knows |

### Track C: Artifact Safety

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N1.7 | **Artifact Firewall** — enforce canonical/derived write boundaries with policy-aware FS adapter that prevents accidental corruption of canonical files by derived output | M | 🟡 | RX1.3 | N2.5 (replay capsule). Trust-preserving evolution — the system can't accidentally corrupt its own source of truth |
| N1.8 | **Governance Escape Analysis** — static analysis verifying no code path bypasses governance checks; produce coverage map of all governance decision points | M | 🟡 | T3.2.4 | Confidence that governance is real, not aspirational. Pairs with existing `foldGovernance` adoption |

### Track D: Intent Clarification

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N1.9 | **Intent Clarification Protocol** — when resolution is stuck, emit structured clarification request with context before escalating to `needs-human` | S | 🟡 | T3.4.6 | Reduces `needs-human` rate by giving operators actionable questions instead of opaque failures |
| N1.10 | **Performance Budget per Screen** — collect Core Web Vitals per-screen baseline during runs, alert on deviations in receipts | S | 🟢 | T3.5.5 | Free performance regression detection as a side-effect of existing test runs |

### Wave 1 Completion Criteria

- [ ] Every resolution receipt carries a reason chain (not just a rung number)
- [ ] Knowledge artifacts have empirical half-life metrics
- [ ] Route discoveries flow through proposal pipeline to canon
- [ ] Scorecard convergence considers knowledge coverage gaps
- [ ] Canonical files are write-protected from derived output paths
- [ ] `needs-human` escalations include structured clarification context

---

## Wave 2: Cognitive Runtime & Contradiction Detection (Weeks 3-5)

**Goal**: Make the runtime cognitively adaptive — able to detect contradictions in its own knowledge, produce multiple execution plans, and explain its choices through a causal chain. This wave builds on Wave 1's explainability foundation.

**Wall-clock time**: ~12 days. 4 parallel tracks; critical path is N2.1 → N2.2 → N2.3.

### Track A: Knowledge Integrity (sequential: N2.1 → N2.2)

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N2.1 | **Knowledge Contradiction Detector** — detect conflicting hints/routes/patterns; emit conflict receipts with evidence from both sides; block promotion of contradictory knowledge | M | 🟡 | RX3.3, R1 | N2.2. Prevents silent knowledge erosion — the #1 risk to long-term system reliability |
| N2.2 | **Cross-Screen Transition Modeling** — extend state transition graph from screen-scoped to cross-screen flows; model "submit search form → results screen" as first-class edges | L | 🟡 | R1 | N4.1 (UI digital twin prereq), N3.6 (app-as-formal-language). Turns the interface graph into an application topology |

### Track B: Multi-Plan Execution

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N2.3 | **Multi-Plan Resolver** — produce `Fast`, `Safe`, and `Insightful` execution plans per scenario with explicit tradeoff annotations (cost, confidence, latency) | L | 🟡 | RX2.1 | N3.2 (what-if panel), N4.3 (counterfactual runner). The single most transformative runtime change — turns execution from "one path" to "choose your adventure" |
| N2.4 | **Execution Tempo Awareness** — detect app response tempo per-screen, adapt timeouts automatically instead of using static waits | M | 🟡 | T3.4.5 | Reduces flaky failures from timing mismatches. Pairs naturally with multi-plan resolver (fast plan uses aggressive timeouts) |

### Track C: Observation Expansion

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N2.5 | **Universal Replay Capsule** — package run inputs, envelopes, key events, and knowledge snapshot into a portable replay bundle that reproduces results on another machine | M | 🟡 | RX1.4 | N4.3 (counterfactual runner needs replay). Debugging and audits become portable |
| N2.6 | **Network Conversation Tracker** — intercept API calls triggered by user actions via CDP, produce per-step `NetworkConversation` attached to receipts | M | 🟡 | T3.5.1 | N3.6 (app-as-formal-language — API calls reveal state transitions invisible in DOM). Rich signal for agent reasoning |
| N2.7 | **Accessibility Tree Differ** — snapshot a11y tree before/after each step, compute semantic diff, attach to receipts | M | 🟡 | T3.5.3 | N3.3 (semantic snapshot diffing). Catches accessibility regressions that DOM inspection misses |

### Track D: Resolution Enhancement

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N2.8 | **Resolution Rung Stress Test** — force execution from each rung individually across a scenario corpus; measure marginal value per rung | S | 🟢 | T3.2.5 | Data-driven rung tuning. Reveals which rungs actually earn their compute cost |
| N2.9 | **Input Affordance Detector** — query element affordances (focusable, role, constraints) before interaction; replace tag-name guessing with semantic affordance matching | M | 🟡 | T3.5.6 | More robust widget interaction. Feeds into component knowledge maturation |

### Wave 2 Completion Criteria

- [ ] Contradictory knowledge is detected before promotion with conflict receipts
- [ ] State transition graph models cross-screen flows
- [ ] Runtime can produce 3 execution plans per scenario with cost/confidence tradeoffs
- [ ] Replay capsule reproduces results on a clean machine
- [ ] Network API calls are captured per-step in receipts
- [ ] Each resolution rung has measured marginal value data

---

## Wave 3: Operator Experience & Cost Intelligence (Weeks 6-8)

**Goal**: Make the system joyful to operate and economically transparent. This wave delivers the "operator delight" vision — operators can explain any event in 60 seconds, preview impact before execution, and understand cost tradeoffs.

**Wall-clock time**: ~10 days. 3 parallel tracks.

### Track A: Operator Intelligence

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N3.1 | **Narrative Run Reports** — auto-generate "what changed / why it matters" summaries for stakeholders from run receipts and reason chains (requires N1.1) | S | 🟢 | RX4.5 | Executive visibility without technical literacy. Changes adoption dynamics |
| N3.2 | **What-If Panel** — interactive controls for posture, budget, and strategy that preview expected impact using multi-plan resolver output (requires N2.3) | M | 🟡 | RX4.3, U | Operators plan before execution. Dramatic reduction in wasted runs |
| N3.3 | **One-Click "Why"** — click any failure/event/proposal in dashboard to view condensed causal chain (requires N1.1 reason chains) | M | 🟡 | RX4.2 | Root-cause lookup in <60 seconds. The single most requested operator feature |

### Track B: Cost & Scale

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N3.4 | **Cost OS** — unified accounting for tokens, latency, retries, and compute across all pipeline phases; surface in scorecard and receipts | M | 🟡 | RX5.1 | N3.2 (what-if panel shows cost impact), N4.6 (energy-aware scheduling). Budget-aware planning |
| N3.5 | **Cold-Start Accelerator** — bootstrap mode using curated seed packs and sparse-discovery strategy for new suites | M | 🟡 | RX5.4 | Faster time-to-first-value for new applications. Key adoption driver |
| N3.6 | **Tiered Storage Strategy** — hot/warm/cold artifact retention with replay guarantees; auto-archive old runs while preserving replay capability | M | 🟡 | RX5.5 | Scalable storage economics. Required before production deployment at scale |

### Track C: Knowledge Architecture

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N3.7 | **Auto-Refactor Suggestions for Knowledge** — detect overgrown pattern files and suggest merges/splits based on usage patterns and co-occurrence | L | 🟡 | RX3.4 | Maintainable knowledge architecture at scale. Prevents knowledge entropy |
| N3.8 | **Knowledge Archaeology Mode** — query "why does this screen have this alias?" and traverse the full evidence chain: discovery → proposal → activation → validation | M | 🟡 | U | Trust through transparency. Makes the knowledge lifecycle tangible to operators |
| N3.9 | **Graduated Autonomy Profiles** — replace binary trust policy with graduated model: "auto-approve for screens with >5 successful runs, require review for novel screens" | M | 🟡 | R1 | System earns trust incrementally. Reduces operator burden as confidence grows |

### Track D: Algebraic Completion

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N3.10 | **Envelope as Functor** — formalize `mapPayload` as genuine functor with identity and composition laws; replace ~15 manual spread operations | S | 🟢 | T3.6.1, U | N4.4 (monadic envelope). Small refactor with large composability payoff |
| N3.11 | **Resolution Ladder as Catamorphism** — rewrite resolution cascade as genuine catamorphism using standard fold operations | S | 🟢 | T3.6.2 | Cleaner resolution code. Pairs with existing scoring algebra |

### Wave 3 Completion Criteria

- [ ] Stakeholders receive narrative run summaries without reading traces
- [ ] Operators can explain any major event within 60 seconds via One-Click "Why"
- [ ] Cost per scenario is visible in scorecard
- [ ] New suite reaches useful baseline in materially fewer iterations
- [ ] Knowledge evolution is queryable via archaeology mode
- [ ] Trust policy supports graduated autonomy per screen

---

## Wave 4: Temporal Intelligence & Semantic Execution (Weeks 9-12)

**Goal**: Add the time dimension to the system's intelligence and make execution semantically aware. This wave transforms Tesseract from "understands apps now" to "understands how apps change over time."

**Wall-clock time**: ~15 days. 3 parallel tracks.

### Track A: Temporal Intelligence

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N4.1 | **Run Archaeology Index** — temporal index over `.tesseract/runs/` mapping fingerprints to first-seen, last-seen, mutation history | M | 🟡 | T3.1.1 | N4.2, N4.3. The foundation for all temporal reasoning |
| N4.2 | **Regression Canary System** — diff resolution receipt distribution against baseline; alert on rung degradation or knowledge artifacts stopping contribution | M | 🟡 | T3.1.2 | Early warning before failures compound. Pairs with knowledge half-life (N1.2) |
| N4.3 | **Counterfactual Runner** — simulate alternate action paths post-run without touching live target; uses replay capsule (N2.5) and run archaeology (N4.1) | M | 🟡 | RX2.3 | N5.2 (autonomous experiment mode). "What if we'd used the other plan?" — comparative learning |
| N4.4 | **Time-Travel Trace Comparator** — structural diff between two runs: which steps changed strategy, which knowledge changed, which receipts diverged | L | 🟡 | T3.1.4 | Debugging across time. "Why did this scenario break between Tuesday and Wednesday?" |

### Track B: Semantic Execution

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N4.5 | **Negotiated Navigation** — navigate → observe → compare to expected → consult alternatives if wrong, instead of hoping the URL resolves correctly | M | 🟡 | T3.4.1 | More robust navigation. Reduces `needs-human` for route-dependent scenarios |
| N4.6 | **Conversational Step Decomposition** — break complex steps ("Add claim for $500 with effective date tomorrow") into micro-conversation with receipt per sub-step | M | 🟡 | T3.4.3 | Finer-grained receipts. Better error localization for complex interactions |
| N4.7 | **Application State Assertions as Dialogue** — assert *meaning* ("policy is active") not literals, resolve semantically against knowledge vocabulary | M | 🟡 | T3.4.4 | Assertions survive UI text changes. More resilient verification |
| N4.8 | **Speculative Execution with Rollback** — execute most likely interpretation while preparing second-most-likely for instant rollback on failure | L | 🔴 | T3.4.2 | Dramatic latency reduction for uncertain resolutions. Requires multi-plan resolver (N2.3) |

### Track C: Monadic Pipeline & State Machines

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N4.9 | **Monadic Envelope Composition** — add `flatMapPayload` and `apPayload` for chained derivations with automatic lineage/governance threading (requires N3.10) | M | 🟡 | U, T3.6.1 | Pipeline refactor into `flatMapPayload(parse) |> flatMapPayload(bind) |> flatMapPayload(emit)`. Free provenance for any new pipeline |
| N4.10 | **Pipeline Phases as Free Monad** — define dogfood pipeline as free monad interpretable by real/dry-run/cost-estimator/dependency-extractor interpreters | L | 🔴 | T3.6.4 | Multiple interpreters over same pipeline description. Cost estimation without execution |
| N4.11 | **Explicit State Machines for Discovery & Proposal Lifecycle** — make discovery crawl and proposal lifecycle explicit using `StateMachine<S,E,R>` abstraction | M | 🟡 | U | Free visualization, replay, and composition. Dashboard can show live state machine hierarchy |

### Wave 4 Completion Criteria

- [ ] Run history is temporally indexed and queryable
- [ ] Regression canary alerts before failures compound
- [ ] Counterfactual analysis shows "what would have happened" for alternate plans
- [ ] Complex steps decompose into micro-conversations with per-sub-step receipts
- [ ] Pipeline can be interpreted in dry-run mode without execution
- [ ] Discovery and proposal lifecycle are explicit, composable state machines

---

## Wave 5: Robustness & Knowledge Federation (Weeks 13-16)

**Goal**: Harden the system through adversarial testing and enable cross-suite knowledge sharing. This wave prepares Tesseract for multi-team, multi-application deployment.

**Wall-clock time**: ~15 days. 3 parallel tracks.

### Track A: Adversarial Hardening

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N5.1 | **Knowledge Knockout Trials** — systematically remove knowledge artifacts, re-run, measure cascading failures; produce criticality map showing which artifacts are load-bearing | L | 🟡 | T3.2.1 | Identifies single points of failure in knowledge base. Informs backup and redundancy strategy |
| N5.2 | **Chaos Knowledge Injection** — introduce subtly wrong knowledge and measure governance system's immune response time and accuracy | M | 🟡 | T3.2.3 | Validates that governance actually catches bad knowledge. Trust through adversarial proof |
| N5.3 | **Assumption Inverter** — generate "what if the opposite" binding variants to reveal brittleness in resolution assumptions | M | 🟡 | T3.2.2 | Finds hidden assumptions the test suite doesn't cover |
| N5.4 | **Adversarial Scenario Generator** — synthesize scenarios that maximize `needs-human` probability to stress-test resolution coverage | L | 🟡 | T3.2.6 | N6.1 (generative scenario forge). Active weakness discovery |

### Track B: Knowledge Federation

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N5.5 | **Cross-Suite Pattern Diffusion** — detect when two suites independently discover same pattern, propose extraction to shared layer | M | 🟡 | T3.3.2, RX3.5 | N5.7 (knowledge package manager). Compounding benefit across suites |
| N5.6 | **Portable Confidence Overlays** — allow confidence earned in Suite A to bootstrap Suite B at reduced weight | M | 🟡 | T3.3.3 | Faster onboarding for related applications |
| N5.7 | **Knowledge Package Manager** — define `tesseract-pack` format for versioned, signed knowledge bundles (like npm for app understanding) | L | 🔴 | T3.3.1 | Organizational knowledge sharing. The "npm for interface understanding" vision |
| N5.8 | **Governance Treaty Protocol** — define how importing suites treat foreign governance designations | S | 🟡 | T3.3.6 | Required for N5.7 to work across trust boundaries |
| N5.9 | **Federated Scorecard** — aggregate scorecards across multiple suites into organizational intelligence view | L | 🟡 | T3.3.7 | Executive-level visibility across the entire testing portfolio |

### Track C: Dashboard Enrichment

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N5.10 | **Delight Features** — animated confidence transitions, milestone badges, quality improvement "streaks" | S | 🟢 | RX4.6 | Sustained adoption through joy. Not cosmetic — drives engagement |
| N5.11 | **Failure Constellation View** — cluster similar failures visually by fingerprint family; spatial pattern recognition for bottleneck identification | M | 🟡 | DV, U | Instant visual bottleneck identification faster than any log |
| N5.12 | **Confidence Weather Map** — heatmap of screens/routes by confidence volatility | M | 🟡 | DV | At-a-glance system health. Shows where attention is needed |
| N5.13 | **Evolution Scrapbook** — timeline of key knowledge promotions with before/after impact | M | 🟡 | DV | Makes the system's learning visible and celebratable |

### Wave 5 Completion Criteria

- [ ] Knowledge base has a criticality map from knockout trials
- [ ] Governance immune response validated through chaos injection
- [ ] Two suites can share patterns through diffusion
- [ ] Knowledge packs can be exported, signed, and imported
- [ ] Dashboard shows failure constellations and confidence weather

---

## Wave 6: Moonshots & Autonomous Intelligence (Weeks 17+)

**Goal**: The speculative frontier — items that could be category-defining but carry high risk. Each moonshot runs in an isolated evaluation lane with strict promotion gates. No moonshot bypasses governance.

**Wall-clock time**: Ongoing. Each item is independently scoped.

### Tier A: High-Value Moonshots (justified by existing architecture)

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N6.1 | **Generative Scenario Forge** — synthesize edge-case scenarios from known weak signals, failure motifs, and adversarial patterns (requires N5.4) | L | 🟡 | RX6.6, T3.2.6 | Finds bugs humans didn't think to write. Leverages existing failure fingerprints |
| N6.2 | **Autonomous Experiment Mode** — bounded self-experimentation with safety rails: the system proposes config changes, runs them in isolation, promotes winners via evidence + review | XL | 🔴 | RX6.2 | Compounding optimization without constant prompting. The "evolve loop evolves itself" vision |
| N6.3 | **Multi-Agent Debate Resolution** — spawn 3 micro-agents with different biases (precision, recall, speed), select best resolution via deterministic arbiter | L | 🟡 | T3.7.3 | Quality improvement through diversity. Leverages existing A/B testing infrastructure |
| N6.4 | **The "What Would Break" Simulator** — query the interface graph with hypothetical DOM changes; show which scenarios degrade, which selectors fall to lower rungs | M | 🟡 | U | Pre-deployment risk assessment. 80% of the data already exists in impact analysis |
| N6.5 | **App as Formal Language** — treat state transition graph as finite automaton; derive coverage properties, minimal test suites (Chinese Postman), completeness checks | L | 🟡 | U | Provably complete test suites. Requires cross-screen transitions (N2.2) |

### Tier B: Ambitious Moonshots (require new architecture)

| ID | Item | Effort | Readiness | Source | Unlocks |
|----|------|--------|-----------|--------|---------|
| N6.6 | **Intent-to-Playbook Synthesis** — generate candidate runbooks from plain-language goals + prior evidence | XL | 🔴 | RX6.1 | Collapses authoring time dramatically. The "describe what you want, get a test suite" dream |
| N6.7 | **UI Digital Twin** — synthesize offline simulacrum of app from accumulated knowledge for planning and predictive execution | XL | 🔴 | RX6.3, T3.7.2 | Changes execution from reactive to anticipatory. Requires deep state transition model |
| N6.8 | **Proof-Carrying Runs** — each run ships lightweight machine-checkable proof of key invariants held | XL | 🔴 | RX6.4, T3.7.4 | Trust upgrade for regulated environments. The "verified QA" positioning |
| N6.9 | **Self-Authoring Test Suites** — given only URL + goal, discover app → build knowledge → synthesize → compile → run → iterate to stable suite | XL | 🔴 | T3.7.1 | The ultimate expression of the system's identity. Requires most of Waves 1-5 |
| N6.10 | **Multi-Target Emission** — decouple the last mile; same intent surface targets Playwright, Cypress, Selenium, Detox, or accessibility APIs | L | 🟡 | U | Transforms Tesseract from "Playwright tool" to "verification compiler." The IR is ready |
| N6.11 | **Execution Choreography Language** — DSL for widget interaction that compiles to Playwright operations | L | 🔴 | T3.7.5 | Declarative widget choreography. Replaces procedural component knowledge |

### Moonshot Guardrails

- Moonshots only run in isolated evaluation lanes
- No moonshot bypasses governance policy
- Promotion from moonshot lane requires evidence + review contracts
- 70/20/10 capacity split: core reliability / high-value features / moonshots

### Wave 6 Completion Criteria

- [ ] At least one moonshot completes evaluation with measurable impact data
- [ ] Autonomous experiment mode operates within safety rails for >100 iterations
- [ ] "What would break" simulator answers DOM-change queries in <5 seconds

---

## Dependency Graph (Critical Paths)

```
Wave 1                    Wave 2                   Wave 3                Wave 4              Wave 5           Wave 6
───────                   ───────                  ───────               ───────             ───────          ───────
N1.1 (explain) ──────────────────────────→ N3.3 (one-click why)
                          N2.3 (multi-plan) ─────→ N3.2 (what-if panel)
N1.7 (artifact FW) ─────→ N2.5 (replay capsule) ─────────────────────→ N4.3 (counterfactual)
                                                                        N4.1 (run archaeology) → N4.2 (canary) ──→ N5.1 (knockout)
N1.4 (route knowledge) ─→ N2.2 (cross-screen) ──────────────────────→ N4.5 (negotiated nav) ──────────────→ N6.5 (formal lang)
N1.2 (half-life) ────────→ N2.1 (contradiction) ─→ N3.7 (auto-refactor)
N1.5 (coverage metric) ──────────────────────────→ N3.9 (graduated autonomy)
                                                   N3.10 (functor) ───→ N4.9 (monadic envelope) → N4.10 (free monad)
                                                                                                    N5.5 (diffusion) → N5.7 (pkg mgr)
                                                                        N5.4 (adversarial gen) ──→ N6.1 (scenario forge)
                                                                                                    N6.2 (autonomous experiments)
```

---

## Strategic Themes

### Theme 1: "The Loops Must Close" (Waves 1-2)
The highest-leverage remaining work. Every subsystem produces data that another subsystem could consume but doesn't. Route discovery → knowledge proposals. Failure reasons → operator clarity. Run history → temporal intelligence. Closing these loops transforms the system from "pipeline with good types" to "intelligence accumulator."

### Theme 2: "Trust Through Transparency" (Waves 1-3)
Explain-your-choice receipts → one-click why → narrative reports → knowledge archaeology. This is a single thread: make every decision legible. The system already *makes* good decisions. It needs to *explain* them.

### Theme 3: "Economics of Intelligence" (Waves 3-4)
Cost OS → what-if panel → energy-aware scheduling. The system currently optimizes for correctness. Adding cost-awareness turns it into an economic agent that can reason about tradeoff frontiers.

### Theme 4: "Hardening Through Adversity" (Wave 5)
Knowledge knockout → chaos injection → adversarial scenarios. Trust through proof, not hope. The governance system claims to catch bad knowledge — validate that claim.

### Theme 5: "The Compiler Becomes the Product" (Wave 6)
Multi-target emission → self-authoring suites → UI digital twin. The deepest architectural insight from `research-unsaid-opportunities.md`: Tesseract is a compiler for *understanding*, not for *tests*. Wave 6 fully realizes that identity.

---

## Item Cross-Reference to Source Documents

| Wave | Items | RX (Expanded) | T3 (Theory) | R1-R5 (Directions) | U (Unsaid) | DV (Dashboard) |
|------|-------|----------------|-------------|---------------------|-------------|----------------|
| W1 | 10 | RX1.3, RX2.5 | T3.1.6, T3.2.4, T3.4.6, T3.5.2, T3.5.5 | R1 ×3 | — | — |
| W2 | 9 | RX1.4, RX2.1, RX2.3, RX3.3 | T3.2.5, T3.4.5, T3.5.1, T3.5.3, T3.5.6 | R1 | U | — |
| W3 | 11 | RX3.4, RX4.2, RX4.3, RX4.5, RX5.1, RX5.4, RX5.5 | T3.6.1, T3.6.2 | R1 | U | — |
| W4 | 11 | RX2.3 | T3.1.1-4, T3.4.1-4, T3.6.4 | — | U | — |
| W5 | 13 | RX3.5, RX4.6 | T3.2.1-3, T3.2.6, T3.3.1-3, T3.3.6-7 | — | U | DV ×4 |
| W6 | 11 | RX6.1-4, RX6.6 | T3.7.1-5 | — | U ×3 | — |
| **Total** | **65** | **19** | **29** | **4** | **8** | **4** |

*Note: 65 items are explicitly sequenced above. The remaining ~75 items from the full inventory are either subsumed by these (e.g., R2-R5 items already completed or covered by RX equivalents), are dashboard visualization details (DV features that compose naturally once their data sources exist), or are lower-priority variants of sequenced items. They are not dropped — they become implementation details within the sequenced items or follow-on work within a wave.*

---

## Closing Note

The first 93 items built the skeleton. These 65 items grow the nervous system.

The skeleton is about correctness: types check, governance enforces, receipts flow. The nervous system is about intelligence: knowledge compounds, failures explain themselves, the system learns from its own history, and operators *enjoy* using it.

The most important insight from the research corpus is this: **Tesseract already does sophisticated things. The remaining work is making those things legible, composable, and self-improving.** Every wave above serves that goal.
