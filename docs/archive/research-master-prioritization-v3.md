# V3: The Tesseract Possibility Space — A Third Execution Plan

*A complete reimagining of the Tesseract roadmap. Same architectural DNA, entirely new execution surface. Conjured from latent opportunities in the codebase, novel use cases the system is uniquely positioned to serve, elegant simplifications hiding in plain sight, and moonshots worth reaching for. March 28, 2026.*

---

## 0) Why a third plan

**V1** (`research-master-prioritization.md`) is forensic: 20 research perspectives distilled into 93 gap-closing items across 5 waves. It asks *"what does the system declare but not yet enforce?"* and systematically wires, tests, and verifies.

**V2** (`research-master-prioritization-expanded.md`) is aspirational: 6 arcs reframe the roadmap around breakthrough opportunities — from compiler to collaborator, from observation to delight. It asks *"what could become category-defining?"*

**V3** (this document) is **generative**. It asks:

> *"What would we build if we took everything the system already knows about itself — its typed envelopes, its governance lattice, its knowledge lifecycle, its agent arbitration, its deterministic compiler core — and used those as primitive building blocks for things nobody has asked for yet?"*

This is not gap-closing. This is not aspiration-mapping. This is **invention grounded in architecture**.

### The creative mandate

- Every item must be **anchored to real code, real types, or real architectural seams** already in the codebase.
- Every item must be **novel** — not a restatement of V1/V2 items under new names.
- Every item must explain **why this system is uniquely positioned** to do it (not generic "any system could do this").
- Roughly one-third of items should be **moonshots** that might fail but would be extraordinary if they worked.
- The other two-thirds should be **elegant and achievable** — ideas that make you say "why didn't we think of that already?"

### ID scheme

Items use `T3.{arc}.{seq}` to avoid collision with W-series (V1) and RX-series (V2).

---

## 1) The organizing insight: Tesseract is a compiler that produces *understanding*, not just tests

Most test automation systems produce assertions. Tesseract already produces something richer:

- **Typed resolution receipts** that explain *how* each step was resolved
- **Governance envelopes** that explain *whether* each decision is trustworthy
- **Evidence drafts** that explain *what was observed* at runtime
- **Proposal bundles** that explain *what could be improved*
- **Provenance chains** that explain *where knowledge came from*

The insight: these artifacts are not just debugging metadata. They are a **structured understanding of application behavior** that compounds over time. The system doesn't just test an app — it *learns an app*.

V3 asks: what becomes possible when you treat that compounding understanding as a first-class product?

---

## 2) Seven arcs of invention

| Arc | Theme | Items | Character |
|-----|-------|-------|-----------|
| **Arc 1** | Temporal Intelligence | 7 | The system remembers, predicts, and time-travels |
| **Arc 2** | Adversarial Self-Knowledge | 6 | The system attacks its own assumptions |
| **Arc 3** | Cross-Boundary Composition | 7 | Artifacts become portable, tradeable, composable |
| **Arc 4** | The Interpretive Runtime | 6 | Execution becomes a conversation, not a script |
| **Arc 5** | Sensory Expansion | 7 | The system sees, hears, and feels more of the app |
| **Arc 6** | Algebraic Elegance | 7 | Hidden mathematical structure becomes named infrastructure |
| **Arc 7** | Moonshot Laboratory | 8 | High-risk, high-wonder experiments behind safety rails |

**48 items total.** Each arc is self-contained but composable with others.

---

## Arc 1 — Temporal Intelligence (the system that remembers)

**Thesis**: Tesseract already produces rich per-run artifacts. But runs are treated as independent snapshots. Arc 1 treats the *sequence* of runs as a first-class data structure — a temporal knowledge base that enables prediction, regression detection, and time-travel debugging.

The key architectural enabler: every artifact already carries `fingerprints`, `lineage`, and `version` fields in its envelope. These are the raw materials for temporal indexing.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.1.1 | **Run Archaeology Index** — Build a temporal index over `.tesseract/runs/` that maps every artifact fingerprint to its first-seen, last-seen, and mutation history. Query: "when did this locator first appear? when did it last succeed? how many times has it been repaired?" | M | `WorkflowEnvelope.fingerprints`, `.tesseract/runs/` | Knowledge provenance becomes temporal, not just structural |
| T3.1.2 | **Regression Canary System** — After each run, diff the resolution receipt distribution against a rolling N-run baseline. Alert when: a previously-stable rung starts failing, a knowledge artifact stops being exercised, or a screen's confidence drops below its historical floor | M | `ResolutionReceipt.rung`, `ConfidenceOverlay`, scorecard metrics | Regressions detected *within the system's own execution*, not just in the app under test |
| T3.1.3 | **Predictive Resolution Hints** — Before executing a step, query the temporal index: "steps like this on screens like this have historically resolved at Rung N with M% success." Pre-seed the resolution ladder starting point based on temporal evidence rather than always starting at Rung 1 | M | `ResolutionPrecedenceRung`, temporal index from T3.1.1 | Resolution becomes faster over time as temporal priors accumulate |
| T3.1.4 | **Time-Travel Trace Comparator** — Given two run IDs, produce a structural diff: which steps changed resolution strategy, which knowledge was used differently, which proposals appeared or disappeared. Render as a side-by-side timeline with divergence points highlighted | L | `.tesseract/runs/{id}.trace.json`, `ExecutionReceipt` | Debugging shifts from "what went wrong" to "what changed between then and now" |
| T3.1.5 | **Seasonal Pattern Detector** — Identify cyclic patterns in run outcomes (e.g., "this screen fails every time the dataset includes dates near month boundaries" or "resolution degrades when the app is under load"). Uses the temporal index plus data posture metadata | M | Temporal index, `DataPosture`, `ExecutionReceipt.timing` | Discovers failure patterns humans wouldn't notice because they span too many runs |
| T3.1.6 | **Knowledge Half-Life Calculator** — For each knowledge artifact, compute its empirical half-life: how many runs until it stops contributing to successful resolution? Artifacts with short half-lives are candidates for retirement or refactoring. Artifacts with infinite half-lives are foundational | S | `ConfidenceOverlay.exercisedInRuns`, temporal index | Knowledge retirement becomes data-driven, not calendar-driven |
| T3.1.7 | **Execution Déjà Vu** — During a live run, detect when the current sequence of resolution outcomes is converging toward a previously-observed failure trajectory. Emit an early warning: "this run is 73% similar to run X which failed at step 14; consider strategy switch." Uses edit-distance over receipt sequences | L | Live `ResolutionReceipt` stream, temporal index | The system develops *intuition* about runs going sideways |

### Arc 1 "done means"
- [ ] Temporal index queryable for any artifact fingerprint across all historical runs
- [ ] Regression canary fires within 1 run of a stability change
- [ ] Resolution ladder start-point adapts to historical priors
- [ ] Two-run diff renders as navigable timeline

---

## Arc 2 — Adversarial Self-Knowledge (the system that attacks itself)

**Thesis**: The dogfood loop improves the system by running it and learning from outcomes. But improvement from *success* is slow. **Improvement from deliberate failure is fast.** Arc 2 introduces controlled adversarial pressure — the system deliberately probes its own weak points, stress-tests its assumptions, and measures how gracefully it degrades.

The key architectural enabler: the governance model already distinguishes `approved`, `review-required`, and `blocked`. Adversarial operations run in a `blocked`-equivalent sandbox lane that cannot contaminate production knowledge.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.2.1 | **Knowledge Knockout Trials** — Systematically remove one knowledge artifact at a time and re-run affected scenarios. Measure: which removals cause cascading failures? which have zero impact? Produces a "knowledge criticality map" showing which artifacts are load-bearing vs decorative | L | `KnowledgeCatalog`, `ConfidenceOverlay`, scorecard | The system discovers which knowledge actually matters |
| T3.2.2 | **Assumption Inverter** — For each deterministic binding, generate a "what if the opposite were true?" variant. If a hint says an element is a dropdown, bind it as a text input. If a route maps to screen A, pretend it maps to screen B. Measure how the runtime copes with violated assumptions | M | `BoundStep`, `ScreenHints`, `WidgetContract` | Reveals brittleness hiding behind correct assumptions |
| T3.2.3 | **Chaos Knowledge Injection** — Introduce subtly wrong knowledge artifacts (misspelled selectors, off-by-one tab indices, stale screen names) and measure: does the runtime detect the corruption? does it fall back gracefully? does it accidentally promote the bad knowledge? | M | Knowledge governance pipeline, `ProposalBundle`, trust policy | Tests the immune system, not just the happy path |
| T3.2.4 | **Governance Escape Analysis** — Statically analyze all code paths from `mintApproved()` to `emit()` and verify that no path bypasses governance checks. Produce a "governance coverage map" showing which execution paths are fully governed and which have blind spots | M | `mintApproved()`, `foldGovernance`, `emit()`, `Approved<T>` | Governance enforcement becomes provably complete, not just tested |
| T3.2.5 | **Resolution Rung Stress Test** — Force execution to start at each rung individually (skip all higher rungs) and measure success rates. Produces a "rung value curve" showing the marginal contribution of each resolution tier. If Rung 5 adds zero value over Rung 4, it might be dead code | S | `ResolutionPrecedenceRung`, `chooseByPrecedence`, resolution ladder | Every rung justifies its existence with data |
| T3.2.6 | **Adversarial Scenario Generator** — Given the current knowledge base, synthesize scenarios designed to maximize the probability of `needs-human` resolution. These are the "hardest possible tests" the system can generate for itself — the frontier of its own incompetence | L | `KnowledgeCatalog`, `ScenarioSchema`, `ResolutionReceipt` distribution | The system identifies its own skill ceiling and works to raise it |

### Arc 2 "done means"
- [ ] Knowledge criticality map ranks every artifact by removal impact
- [ ] Governance escape analysis covers 100% of emit paths
- [ ] Each rung has a measured marginal contribution score
- [ ] Adversarial scenarios push needs-human rate to its theoretical minimum

---

## Arc 3 — Cross-Boundary Composition (artifacts that travel)

**Thesis**: Tesseract artifacts are currently repo-scoped. A suite's knowledge, proposals, confidence overlays, and governance decisions live in one directory tree and serve one application. But the *structure* of these artifacts is universal — a `ScreenHints` file for an insurance app and a `ScreenHints` file for a banking app share the same schema, the same governance model, and the same lifecycle.

Arc 3 asks: what happens when artifacts become **portable, composable, and tradeable** across suite boundaries?

The key architectural enabler: `createProjectPaths(rootDir, suiteRoot)` already resolves content paths relative to a suite root. The envelope schema (`kind`, `version`, `stage`, `scope`) already provides enough metadata for cross-suite identification.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.3.1 | **Knowledge Package Manager** — Define a `tesseract-pack` format: a versioned, signed bundle of knowledge artifacts (patterns, components, widget contracts) that can be imported into any suite. Like npm packages but for application understanding. A pack for "React date pickers" would contain widget contracts, interaction choreography, and locator patterns usable by any suite that encounters React date pickers | L | `knowledge/patterns/`, `knowledge/components/`, `WidgetContract`, envelope schema | Knowledge becomes a **shareable commodity**, not a per-suite cost |
| T3.3.2 | **Cross-Suite Pattern Diffusion** — When two suites independently discover the same pattern (e.g., "combobox with async search requires type → wait → select"), automatically detect the convergence and propose a shared pattern extraction. Uses fingerprint similarity across suite-scoped pattern files | M | `knowledge/patterns/*.yaml`, `PatternFingerprint`, `ProposalBundle` | Shared patterns emerge from independent discovery, not top-down authoring |
| T3.3.3 | **Portable Confidence Overlays** — Allow a confidence overlay earned in Suite A to contribute (at reduced weight) to resolution in Suite B when the underlying knowledge artifact is structurally identical. A widget contract proven in 200 runs against App A starts at non-zero confidence in App B | M | `ConfidenceOverlay`, `KnowledgeCatalog`, overlay fingerprinting | New suites bootstrap faster by inheriting earned confidence |
| T3.3.4 | **Suite Compatibility Matrix** — Given two suite roots, compute structural similarity: shared screen patterns, overlapping widget families, common route structures, compatible data postures. Produces a compatibility score and a recommended import list | M | `ApplicationInterfaceGraph`, `KnowledgeCatalog`, suite root comparison | Answers "how much can Suite B learn from Suite A?" before investing in transfer |
| T3.3.5 | **Envelope Lingua Franca** — Define a minimal cross-system envelope that external tools (Cypress, Selenium, Playwright raw) can emit, and that Tesseract can ingest as evidence. If another tool discovered a reliable selector for a screen element, Tesseract should be able to absorb that as a confidence overlay without re-running the discovery | M | `WorkflowEnvelope`, `EvidenceDraft`, `ConfidenceOverlay` | Tesseract becomes a knowledge hub, not just a test runner |
| T3.3.6 | **Governance Treaty Protocol** — When importing knowledge from an external pack or suite, the importing suite's trust policy decides how to treat foreign governance designations. An artifact `approved` in Suite A enters Suite B as `review-required` by default. The trust policy can define treaty rules: "artifacts from Suite A with confidence > 0.9 may enter as approved" | S | Trust policy, `GovernanceDesignation`, `foldGovernance` | Cross-boundary composition respects sovereignty |
| T3.3.7 | **Federated Scorecard** — Aggregate scorecards across multiple suites into a single organizational view. Shows: which apps are well-understood, which have thin knowledge, which are improving fastest, which share the most patterns. A fleet-level intelligence dashboard | L | `Scorecard`, `ConvergenceMetrics`, suite root enumeration | Transforms from per-app tool to organizational intelligence platform |

### Arc 3 "done means"
- [ ] At least one knowledge pack created, versioned, and successfully imported into a different suite
- [ ] Cross-suite pattern convergence detected and proposed automatically
- [ ] Portable confidence overlays measurably accelerate new suite bootstrap
- [ ] Federated scorecard renders across 2+ suites

---

## Arc 4 — The Interpretive Runtime (execution as conversation)

**Thesis**: V1 and V2 treat the runtime as an executor — it receives a bound program and runs it. Arc 4 reimagines the runtime as an **interpreter engaged in a conversation** with the application under test. Each step is not just an action to perform but a *question to ask* and an *answer to understand*.

The key architectural enabler: the ADR collapse (BACKLOG item A1) already moves interpretation from compile-time to runtime. Arc 4 takes this further — the runtime doesn't just interpret steps, it **negotiates** with the application.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.4.1 | **Negotiated Navigation** — Instead of navigating to a URL and hoping the right screen appears, the runtime *negotiates*: navigate → observe → compare to expected screen → if wrong, consult route knowledge for alternatives → retry with adjusted parameters. Each negotiation round produces a `NavigationReceipt` with the conversation history | M | `knowledge/routes/`, `ScreenIdentification`, `ResolutionReceipt` | Navigation becomes adaptive and self-correcting |
| T3.4.2 | **Speculative Execution with Rollback** — For ambiguous steps, the runtime speculatively executes the most likely interpretation while simultaneously preparing the second-most-likely. If the first fails, instant rollback to a pre-step checkpoint and re-execution with the alternative. Uses Playwright's snapshot/restore capabilities | L | `ResolutionReceipt`, Playwright `page.context()`, `BrowserContext` state | Ambiguity becomes a speed optimization, not a failure mode |
| T3.4.3 | **Conversational Step Decomposition** — When a complex step like "Add a new claim with type=Medical and amount=$500" arrives, decompose it into a micro-conversation: identify the "Add" action → find the "new claim" trigger → fill "type" → fill "amount" → confirm. Each micro-step produces its own receipt. If any micro-step fails, the receipt shows exactly where the conversation broke down | M | `BoundStep`, `ActionIntent`, `WidgetContract`, `ExecutionReceipt` | Complex steps become debuggable conversations, not opaque macro-actions |
| T3.4.4 | **Application State Assertions as Dialogue** — Instead of asserting a value equals a literal, assert the *meaning*: "the policy status should indicate active coverage." The runtime interprets "active coverage" against the screen's current vocabulary (which might be "Active", "In Force", "Current", or a green status icon). Interpretation receipts explain the semantic mapping | M | `AssertionIntent`, `ScreenHints`, knowledge vocabulary, `EvidenceDraft` | Assertions become intent-based and vocabulary-resilient |
| T3.4.5 | **Execution Tempo Awareness** — The runtime detects the application's response tempo and adapts: fast app → reduce wait times, slow app → increase them, intermittently slow → add adaptive polling with backoff. Tempo is measured per-screen and persisted as knowledge. No more hardcoded timeouts | M | `ExecutionReceipt.timing`, `knowledge/screens/`, temporal profiling | Execution speed matches application speed automatically |
| T3.4.6 | **Intent Clarification Protocol** — When the runtime cannot resolve a step with any confidence above a threshold, instead of immediately escalating to `needs-human`, it emits a structured clarification request: "I found 3 possible interpretations of 'Update the coverage details'. Which did you mean? (a) Click 'Edit' on the Coverage section, (b) Navigate to /coverage/edit, (c) Open the Coverage tab and modify fields." The clarification feeds back into knowledge | S | `ResolutionReceipt`, `ProposalBundle`, agent interpretation, `needs-human` pathway | `needs-human` becomes a last resort after the system has tried to help itself |

### Arc 4 "done means"
- [ ] Navigation produces negotiation receipts showing retry conversations
- [ ] Speculative execution measurably reduces failure-to-recovery time
- [ ] Complex steps decompose into traceable micro-conversations
- [ ] Application tempo learned per-screen and adapted automatically

---

## Arc 5 — Sensory Expansion (the system that perceives more)

**Thesis**: Tesseract currently perceives the application through two channels: the DOM (structure) and screenshots (pixels, used for evidence but not resolution). Arc 5 expands the system's sensory repertoire — not by adding exotic new capabilities, but by extracting more signal from what Playwright and the browser already provide.

The key architectural enabler: Playwright exposes network interception, console events, accessibility trees, coverage data, and performance metrics. The runtime currently uses almost none of these.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.5.1 | **Network Conversation Tracker** — Intercept API calls during step execution. Map each user action to the network requests it triggers. Produce a `NetworkConversation` artifact per step: "clicking 'Save' triggers POST /api/claims → 201, then GET /api/claims/123 → 200". This becomes knowledge about what the app *does*, not just what it *shows* | M | Playwright `page.route()`, `page.on('request')`, `ExecutionReceipt` | The system understands application behavior at the API layer |
| T3.5.2 | **Console Sentinel** — Monitor browser console during execution. Classify messages: React warnings → potential component instability, unhandled promise rejections → async bugs, deprecation warnings → drift signals. Attach console classification to execution receipts. Knowledge: "this screen emits 3 React key warnings during table render" | S | Playwright `page.on('console')`, `EvidenceDraft`, `ScreenHints` | The system hears what the app is complaining about |
| T3.5.3 | **Accessibility Tree Differ** — Before and after each step, snapshot the accessibility tree (not just the DOM). Diff the trees to understand *semantic* changes: "after clicking Submit, a new alert landmark appeared with role=status." Accessibility tree diffs are more meaningful than DOM diffs because they reflect user-facing changes, not implementation details | M | Playwright `page.accessibility.snapshot()`, `EvidenceDraft` | Resolution and assertion operate on semantic structure, not DOM soup |
| T3.5.4 | **Visual Regression as Knowledge Signal** — Take before/after screenshots per step. Compute perceptual hash difference. When the visual delta is large but the DOM delta is small, flag: "this step caused a significant visual change through CSS/animation, not DOM mutation." When the DOM delta is large but the visual delta is small, flag: "this DOM change is cosmetic (class names, attributes) not functional" | M | Playwright `page.screenshot()`, perceptual hashing, `EvidenceDraft` | The system distinguishes meaningful changes from noise |
| T3.5.5 | **Performance Budget per Screen** — During execution, collect Playwright's `page.metrics()` (JS heap, layout count, style recalc count, DOM node count). Persist per-screen baselines as knowledge. Alert when a screen's performance profile deviates significantly from its baseline — the app might be degrading even if tests pass | S | Playwright `page.metrics()`, `knowledge/screens/`, `ScreenHints` | The system detects performance regressions alongside functional ones |
| T3.5.6 | **Input Affordance Detector** — Before interacting with an element, query its full affordance profile: is it focusable? what ARIA role? does it have a listbox popup? is it part of a form? does it have validation constraints (required, pattern, min/max)? Persist as component knowledge. This replaces guessing widget type from tag name with knowing widget type from its declared affordances | M | DOM attribute inspection, ARIA role queries, `WidgetContract`, `knowledge/components/` | Widget resolution becomes affordance-based, not tag-name-based |
| T3.5.7 | **State Topology Mapper** — During discovery, systematically explore state transitions: which buttons become enabled after which fields are filled? which tabs become visible after which actions? which validation messages appear under which conditions? Build a per-screen state transition graph as knowledge | L | Discovery pipeline, Playwright interaction, `knowledge/screens/`, `ApplicationInterfaceGraph` | The system maps app behavior, not just app structure |

### Arc 5 "done means"
- [ ] Network conversations attached to execution receipts
- [ ] Console warnings classified and persisted as screen knowledge
- [ ] Accessibility tree diffs available for every step
- [ ] Performance budgets established and monitored per-screen
- [ ] State topology graphs generated for discovered screens

---

## Arc 6 — Algebraic Elegance (naming the mathematics)

**Thesis**: The codebase is full of unnamed algebraic structure. V1/W5 begins naming some of it (lattices, monoids, Kleisli arrows). Arc 6 goes further — it finds structures that V1 missed and uses them to **simplify code**, not just formalize it. Every item here should result in fewer lines of code, not more.

The key insight: when you name an algebraic structure, you inherit its laws for free. A `Monoid` gives you `fold` for free. A `Functor` gives you `map` for free. A `Profunctor` gives you `dimap` for free. The codebase is manually reimplementing these operations everywhere.

| ID | Initiative | Effort | Anchor | Outcome |
|----|------------|--------|--------|---------|
| T3.6.1 | **Envelope as Functor** — The `WorkflowEnvelope<T>` is a functor: `mapPayload(envelope, f)` already exists. Formalize it: prove `mapPayload(e, id) = e` and `mapPayload(mapPayload(e, f), g) = mapPayload(e, g ∘ f)`. Then use it everywhere envelopes are manually destructured-and-reassembled. Audit shows 15+ sites doing `{ ...envelope, payload: transform(envelope.payload) }` that should be `mapPayload(envelope, transform)` | S | `mapPayload` in envelope utilities, `WorkflowEnvelope<T>` | 15+ manual spread operations replaced with law-tested functor map |
| T3.6.2 | **Resolution Ladder as a Catamorphism** — The resolution ladder (`chooseByPrecedence`) is a fold over a list of strategies with early exit. Rewrite it as a genuine catamorphism over `ReadonlyArray<ResolutionStrategy>` with an algebra that produces `Option<Resolution>`. Early exit becomes `Effect.findFirst` — a standard library operation. The current implementation manually manages `winner` state through a reduce | S | `chooseByPrecedence` in `precedence.ts`, `ResolutionStrategy[]` | Resolution becomes a one-liner using standard library operations |
| T3.6.3 | ~~**Scoring as a Contravariant Functor**~~ ✅ — `contramapScoringRule` formalized in `lib/domain/algebra/scoring.ts` with `scoringRuleSemigroup`, `scoringRuleMonoid`, `identityScoringRule`, `annihilatorScoringRule`. Contravariant functor laws verified in `tests/scoring-algebra.laws.spec.ts` (150 seeds, V1 W5.11 + W5.25) | S | `contramapScoringRule` in `learning-shared.ts`, `ScoringRule<T>` | Scoring rules become universally reusable via contramap |
| T3.6.4 | **Pipeline Phases as a Free Monad** — The dogfood pipeline phases (discover → compile → run → propose → approve → rerun) form a free monad over a base functor of `PipelineInstruction`. Interpreting the free monad with different interpreters gives you: (a) real execution, (b) dry-run simulation, (c) cost estimation, (d) dependency extraction — all from the same pipeline definition. Currently these are separate code paths | L | `runPipelinePhases` in `dogfood.ts`, pipeline phase types | One pipeline definition, four interpreters. Currently four separate implementations |
| T3.6.5 | ~~**Governance as a Bounded Lattice with Galois Connection to Trust**~~ ✅ — `GovernanceLattice` as `BoundedLattice<Governance>` in `lib/domain/algebra/lattice.ts` (V1 W5.1). Galois connection adjunction + monotonicity verified in `tests/galois-connection.laws.spec.ts` (150 seeds, V1 W5.7). Safety property proven | M | `GovernanceDesignation`, trust policy, `foldGovernance` | Safety property proven: loosening thresholds never accidentally tightens gates |
| T3.6.6 | **Evidence Accumulation as a Commutative Monoid** — Evidence drafts accumulate across runs. The accumulation is commutative (order doesn't matter) and associative (grouping doesn't matter), with empty evidence as identity. Formalizing this means evidence from parallel runs can be merged without ordering constraints — enabling truly parallel evidence collection with provably correct aggregation | M | `EvidenceDraft`, evidence accumulation in proposal pipeline | Parallel evidence collection becomes provably correct |
| T3.6.7 | ~~**Convergence Detection as a Lyapunov Function**~~ ✅ — `LyapunovFunction` interface in `lib/domain/convergence-bounds.ts` with `knowledgeHitRateLyapunov()`, `compositeLyapunov()`, `deriveTerminationBound` (V1 W4.9). Typed convergence FSM in `lib/domain/convergence-fsm.ts` (V1 W5.26). Tests in `tests/convergence-bounds.laws.spec.ts` + `tests/convergence-fsm.laws.spec.ts` | M | `ConvergenceMetrics` in dogfood loop, scorecard pass-rate trend | The system predicts when it will converge, not just whether it has |

### Arc 6 "done means"
- [ ] `mapPayload` replaces all manual envelope spreading (15+ sites)
- [ ] Resolution ladder implemented as standard library `findFirst`
- [ ] Free monad pipeline supports at least 2 interpreters (real + dry-run)
- [ ] Convergence prediction accurate within 20% of actual iterations needed
- [ ] Evidence accumulation formally commutative (parallel collection safe)

---

## Arc 7 — Moonshot Laboratory (high-risk, high-wonder)

**Thesis**: Some ideas are too speculative for a roadmap but too exciting to forget. Arc 7 is the sandbox. Every item runs behind strict isolation: separate evaluation lane, no canonical mutation, promotion requires evidence + review. The difference from V2's moonshots: these are grounded in *specific architectural seams* already present in the codebase.

| ID | Moonshot | Effort | Risk | Anchor | Why it could be extraordinary |
|----|----------|--------|------|--------|-------------------------------|
| T3.7.1 | **Self-Authoring Test Suites** — Given only a URL and a plain-language goal ("verify that a user can file a claim"), the system discovers the app, builds knowledge, synthesizes scenarios, compiles them, runs them, and iterates until the suite is stable. No ADO sync. No human-authored scenarios. Pure intent-to-execution | XL | High | Discovery pipeline, `ScenarioSchema`, dogfood orchestrator, knowledge lifecycle | Collapses the entire authoring workflow to a single sentence |
| T3.7.2 | **Application Digital Twin** — From accumulated knowledge (routes, screens, state topology, widget contracts, network conversations), synthesize an offline simulacrum of the app that the system can plan against without touching the real thing. Not pixel-perfect — structurally faithful. Use for: strategy pre-evaluation, knowledge validation, "what would happen if I tried X?" | XL | High | `ApplicationInterfaceGraph`, `knowledge/routes/`, `knowledge/screens/`, state topology (T3.5.7), network tracker (T3.5.1) | Execution planning becomes instant because it runs against a model, not a browser |
| T3.7.3 | **Multi-Agent Debate Resolution** — When the runtime reaches `needs-human`, instead of escalating, spawn 3 independent micro-agents with different strategy biases (conservative, exploratory, creative). Each proposes a resolution. A deterministic arbiter selects the best based on evidence quality and confidence. Disagreement itself becomes signal | L | Medium | Agent interpreter, `ResolutionReceipt`, `AgentSession`, trust policy arbitration | `needs-human` rate drops because three heads are better than one |
| T3.7.4 | **Proof-Carrying Artifacts** — Each knowledge artifact carries a machine-checkable proof of how it was derived: which runs contributed evidence, which governance gates it passed, which trust policy version approved it. The proof is verifiable without access to the original runs. Inspired by proof-carrying code in formal methods | XL | High | `WorkflowEnvelope.lineage`, governance pipeline, `EvidenceDraft`, trust policy | Regulated industries get tamper-evident knowledge provenance |
| T3.7.5 | **Execution Choreography Language** — Define a small DSL for widget interaction choreography that compiles to Playwright operations. Instead of imperative `click → type → wait → select`, declare `combobox.choose("value")` and let the choreography compiler emit the right sequence for the detected widget variant. The DSL is the new authoring surface for `knowledge/components/` | L | Medium | `knowledge/components/*.ts`, `WidgetContract`, `WidgetChoreography` | Widget interaction becomes declarative and variant-adaptive |
| T3.7.6 | **Semantic Snapshot Diffing** — Instead of comparing screenshots pixel-by-pixel, extract the semantic content (text, layout structure, color regions, interactive elements) and diff *meaning*. "The 'Submit' button moved from bottom-left to bottom-right" is more useful than "427 pixels changed." Uses the accessibility tree + visual segmentation | L | Medium | Playwright screenshots, `page.accessibility.snapshot()`, `EvidenceDraft` | Visual regression becomes semantic regression |
| T3.7.7 | **Knowledge Distillation Network** — As the knowledge base grows, periodically "distill" it: find the minimal set of knowledge artifacts that reproduce 95% of successful resolutions. The distilled set is faster to load, easier to audit, and reveals the essential structure hidden in accumulated noise | L | Medium | `KnowledgeCatalog`, `ConfidenceOverlay`, resolution receipt analysis | Knowledge base stays lean no matter how much the system learns |
| T3.7.8 | **Cross-Temporal Regression Oracle** — Given a proposed app change (before/after URLs or deployments), predict which test scenarios will break *before running them*, based on the knowledge graph's understanding of which screens, elements, and routes are affected. Uses the interface graph + knowledge dependency edges | XL | High | `ApplicationInterfaceGraph`, `DerivedGraph`, knowledge dependency edges, `ScreenSurface` | Test selection becomes predictive, not exhaustive |

### Moonshot guardrails
- All moonshots run in isolated evaluation lanes with `blocked` governance
- No moonshot writes to canonical knowledge without explicit promotion
- Promotion requires: measurable improvement on benchmarks + trust policy review
- Moonshots that miss impact thresholds after 2 evaluation cycles are archived, not deleted

---

## 3) Novel use cases unlocked by this plan

These are scenarios that neither V1 nor V2 explicitly enables but that fall naturally out of V3's arcs:

1. **Zero-Author QA**: A product owner types a sentence. The system discovers the app, builds knowledge, generates scenarios, and produces a passing suite. No test engineer required for the first draft. (T3.7.1 + T3.4.3 + T3.4.4)

2. **Fleet Intelligence**: An organization running Tesseract across 10 apps sees a single federated dashboard showing which apps are well-understood, which are degrading, and which patterns transfer between them. (T3.3.7 + T3.3.2 + T3.1.2)

3. **Predictive Test Selection**: Before a deployment, the system predicts which scenarios will break based on which screens and routes changed — without running anything. (T3.7.8 + T3.5.7 + T3.1.1)

4. **Immune System QA**: The system continuously attacks its own knowledge base, discovers its weak points, generates adversarial scenarios for those weak points, and hardens itself. No human in the loop. (T3.2.1 + T3.2.6 + T3.2.3)

5. **Knowledge Marketplace**: Teams publish reusable knowledge packs ("React Material UI v5 widgets", "OutSystems form patterns") that other teams import to skip months of discovery. (T3.3.1 + T3.3.6 + T3.3.3)

6. **Tempo-Adaptive Execution**: Test suites that automatically run faster against fast environments and slower against slow ones, with no configuration. Execution time matches application reality. (T3.4.5 + T3.5.5)

7. **Semantic Assertion Language**: QA writes "the policy status should indicate active coverage" instead of `expect(text).toBe('Active')`. The system figures out what "active coverage" looks like on this particular screen. (T3.4.4 + T3.5.3)

8. **Time-Travel Debugging**: "This test started failing Tuesday. Show me what changed between Monday's run and Tuesday's run." Instant structural diff with divergence points highlighted. (T3.1.4 + T3.1.1)

---

## 4) Elegant refactors that pay for themselves

Unlike V2's refactors (which are about cleanliness), these refactors **unlock new capability** as a side effect of simplification.

### Refactor A — Envelope as Functor (T3.6.1)
- **Current cost**: 15+ sites manually destructure envelopes, spread fields, and reassemble. Each site is a potential bug (forgot a field, wrong spread order).
- **After**: `mapPayload(envelope, transform)` everywhere. The functor laws guarantee correct transformation.
- **Unlocked capability**: Envelope transformations become composable. You can build envelope pipelines (`mapPayload(e, f) |> mapPayload(_, g)`) that provably equal single-pass transforms (`mapPayload(e, g ∘ f)`). This is the foundation for Arc 3's cross-boundary envelope translation.

### Refactor B — Free Monad Pipeline (T3.6.4)
- **Current cost**: The dogfood loop, the CI batch path, the dry-run simulation, and the cost estimator are four separate code paths that encode similar logic differently.
- **After**: One pipeline definition interpreted four ways. Add a fifth interpreter (e.g., "dependency graph extractor") with zero changes to the pipeline definition.
- **Unlocked capability**: The Application Digital Twin (T3.7.2) becomes a fifth interpreter. Planning against the twin uses the same pipeline definition as real execution.

### Refactor C — Resolution as Catamorphism (T3.6.2)
- **Current cost**: `chooseByPrecedence` manually manages `winner` state through a `reduce` with early-exit simulation. Adding a new rung requires understanding the fold mechanics.
- **After**: `Effect.findFirst(strategies, tryResolve)` — a one-liner. New rungs are just new entries in the strategy array.
- **Unlocked capability**: The Multi-Agent Debate (T3.7.3) plugs in as a strategy. The Temporal Prediction (T3.1.3) plugs in as a strategy ordering modifier. Neither requires touching resolution internals.

### Refactor D — Affordance-Based Widget Resolution (T3.5.6)
- **Current cost**: Widget type is inferred from element tag name and a cascade of heuristics. Adding a new widget family means adding new heuristic branches.
- **After**: Widget type is queried from the element's declared affordances (ARIA role, popup attributes, validation constraints). The heuristic cascade becomes a lookup table.
- **Unlocked capability**: The Execution Choreography Language (T3.7.5) compiles against affordances, not tag names. Widget interaction becomes portable across UI frameworks.

---

## 5) Suggested sequencing

V3's arcs are designed to be more independent than V1's waves or V2's phases. The sequencing below reflects true dependencies, not arbitrary ordering.

### Phase I — Foundations of Memory (weeks 1-2)
**Items**: T3.1.1, T3.1.2, T3.1.6, T3.6.1, T3.6.2, T3.6.3

Build the temporal index and ship the algebraic simplifications. These are low-risk, high-payoff items that make everything else easier. The temporal index (T3.1.1) is the most important single item — it's the substrate for half of Arc 1 and several moonshots.

**Exit criteria**: Temporal index queryable. Regression canary operational. Envelope functor, resolution catamorphism, and scoring contravariant all shipped.

### Phase II — Adversarial and Sensory (weeks 2-4)
**Items**: T3.2.1, T3.2.4, T3.2.5, T3.5.1, T3.5.2, T3.5.3, T3.5.5, T3.5.6

Two parallel tracks: the adversarial system (knowledge knockouts, governance escape analysis, rung stress tests) and sensory expansion (network tracker, console sentinel, a11y tree differ, performance budgets, affordance detector). These are independent and can be staffed separately.

**Exit criteria**: Knowledge criticality map produced. Governance escape analysis clean. Network conversations attached to receipts. Affordance-based widget resolution operational.

### Phase III — Composition and Conversation (weeks 4-6)
**Items**: T3.3.1, T3.3.2, T3.3.3, T3.3.6, T3.4.1, T3.4.3, T3.4.5, T3.4.6, T3.6.4, T3.6.6

The knowledge package system and the interpretive runtime. These transform the system's external surface (how it relates to other suites and to the applications it tests). The free monad pipeline refactor (T3.6.4) belongs here because it enables the dry-run interpreter needed for negotiated navigation.

**Exit criteria**: One knowledge pack published and imported. Negotiated navigation producing receipts. Step decomposition traceable. Free monad pipeline with real + dry-run interpreters.

### Phase IV — Temporal Mastery (weeks 6-7)
**Items**: T3.1.3, T3.1.4, T3.1.5, T3.1.7, T3.6.5, T3.6.7

The advanced temporal features that build on the Phase I index: predictive resolution hints, time-travel comparator, seasonal patterns, execution déjà vu. Plus the Galois connection proof and convergence prediction from Arc 6.

**Exit criteria**: Resolution start-point adapts to temporal priors. Two-run diff navigable. Convergence predicted within 20%.

### Phase V — Fleet and Federation (weeks 7-8)
**Items**: T3.3.4, T3.3.5, T3.3.7, T3.5.4, T3.5.7

The cross-suite features that turn Tesseract from a per-app tool into an organizational platform: compatibility matrix, envelope lingua franca, federated scorecard. Plus visual regression semantics and state topology mapping.

**Exit criteria**: Federated scorecard renders across 2+ suites. State topology graphs generated.

### Phase Omega — Moonshot Evaluation (ongoing)
**Items**: T3.7.1–T3.7.8, T3.2.2, T3.2.3, T3.2.6, T3.4.2, T3.4.4

All moonshots plus the more speculative items from other arcs. Run in isolated evaluation lanes with strict promotion gates.

**Exit criteria**: Each moonshot has a measurable evaluation report. Promoted items meet evidence + review contracts.

---

## 6) Metrics that matter in V3

V1 measures verification coverage. V2 measures operational throughput. V3 measures **compounding intelligence**.

| Metric | Baseline | 90-day target | 180-day target |
|--------|----------|---------------|----------------|
| Temporal index depth (runs indexed) | 0 | 50+ | 200+ |
| Regression canary mean detection latency | ∞ (manual) | < 2 runs | < 1 run |
| Resolution start-rung accuracy (temporal prediction) | N/A | 60% | 85% |
| Knowledge artifacts with criticality scores | 0% | 80% | 100% |
| Governance escape paths (unverified emit routes) | unknown | 0 | 0 |
| Rung marginal value — rungs with measured contribution | 0/10 | 10/10 | 10/10 |
| Sensory channels active (DOM, network, console, a11y, perf, visual) | 1 | 4 | 6 |
| Cross-suite knowledge packs published | 0 | 1 | 5+ |
| Portable confidence overlays transferred | 0 | 10+ | 100+ |
| Mean step decomposition depth (micro-conversation steps) | 1 (flat) | 2.5 | 3.5 |
| Application tempo learned per-screen | 0 | 50% of screens | 90% of screens |
| Manual envelope spreads remaining (functor refactor) | 15+ | 0 | 0 |
| Pipeline interpreters (free monad) | 1 (real) | 2 (real + dry-run) | 4 |
| Convergence prediction accuracy | N/A | ±40% | ±20% |
| Moonshots evaluated | 0 | 3 | 6 |
| Moonshots promoted to production | 0 | 0-1 | 1-3 |

---

## 7) Risk posture and controls

### Primary risks

1. **Temporal index storage growth** — indexing every run indefinitely is expensive. Mitigation: tiered retention (hot: last 20 runs, warm: last 100, cold: archived).
2. **Adversarial mode escaping sandbox** — chaos injection or assumption inversion accidentally corrupts production knowledge. Mitigation: adversarial runs use `blocked` governance; no write path to canonical exists without explicit promotion.
3. **Cross-suite knowledge poisoning** — a bad knowledge pack introduces wrong patterns. Mitigation: governance treaty protocol (T3.3.6); all foreign artifacts enter as `review-required` by default.
4. **Free monad abstraction overhead** — algebraic refactors increase indirection without proportional benefit. Mitigation: every refactor must reduce line count or eliminate a bug class. If it adds lines, it doesn't ship.
5. **Moonshot energy displacing core work** — too much excitement about speculative items. Mitigation: 70/20/10 capacity split (core / sensory+temporal / moonshots).

### Controls

- Moonshots run in isolated evaluation lanes only.
- Cross-suite imports require trust policy treaty rules.
- Adversarial operations cannot write to canonical knowledge.
- Algebraic refactors must pass law tests *and* reduce code size.
- Temporal index has configurable retention and automatic pruning.
- Every item has a named architectural anchor — no "generic good idea" items.

---

## 8) Dependency graph

```
Phase I (Memory + Algebra)              Phase II (Adversarial + Sensory)
┌────────────────────────┐             ┌──────────────────────────┐
│ T3.1.1 Temporal Index  │────────────→│ T3.2.1 Knowledge KO     │
│ T3.1.2 Regression      │             │ T3.2.4 Escape Analysis   │
│ T3.1.6 Half-Life       │             │ T3.2.5 Rung Stress       │
│ T3.6.1 Envelope Functor│             │ T3.5.1 Network Tracker   │
│ T3.6.2 Resolution Cata │             │ T3.5.2 Console Sentinel  │
│ T3.6.3 Scoring Contra  │             │ T3.5.3 A11y Tree Differ  │
└────────────────────────┘             │ T3.5.5 Perf Budgets      │
         │                              │ T3.5.6 Affordance Det    │
         │                              └──────────────────────────┘
         │                                          │
         ▼                                          ▼
Phase III (Composition + Conversation)  Phase IV (Temporal Mastery)
┌────────────────────────┐             ┌──────────────────────────┐
│ T3.3.1 Knowledge Packs │             │ T3.1.3 Predictive Hints  │
│ T3.3.2 Pattern Diffuse │             │ T3.1.4 Time-Travel Diff  │
│ T3.3.3 Portable Conf   │             │ T3.1.5 Seasonal Patterns │
│ T3.3.6 Gov Treaty      │             │ T3.1.7 Déjà Vu           │
│ T3.4.1 Negotiated Nav  │             │ T3.6.5 Galois Connection │
│ T3.4.3 Step Decomp     │             │ T3.6.7 Lyapunov Conv     │
│ T3.4.5 Tempo Aware     │             └──────────────────────────┘
│ T3.4.6 Clarification   │                         │
│ T3.6.4 Free Monad      │                         │
│ T3.6.6 Evidence Monoid │                         ▼
└────────────────────────┘             Phase V (Fleet + Federation)
         │                              ┌──────────────────────────┐
         └─────────────────────────────→│ T3.3.4 Compat Matrix    │
                                        │ T3.3.5 Envelope Lingua   │
                                        │ T3.3.7 Federated Score   │
                                        │ T3.5.4 Visual Regression │
                                        │ T3.5.7 State Topology    │
                                        └──────────────────────────┘
                                                    │
                                                    ▼
                                        Phase Omega (Moonshots)
                                        ┌──────────────────────────┐
                                        │ T3.7.1–T3.7.8           │
                                        │ (isolated eval lanes)    │
                                        └──────────────────────────┘
```

**Critical path**: T3.1.1 (temporal index) → T3.1.3 (predictive hints) → T3.1.7 (déjà vu). This is 3 items deep and can start on day 1.

**Everything else parallelizes** around the temporal index. The adversarial, sensory, composition, and algebraic tracks are fully independent of each other.

---

## 9) How V3 relates to V1 and V2

V3 is not a replacement. The three plans are complementary layers:

| Concern | V1 | V2 | V3 |
|---------|----|----|-----|
| **Question** | What does the system declare but not enforce? | What could become category-defining? | What would we invent if we took the architecture seriously? |
| **Character** | Forensic. Gap-closing. Verification-heavy. | Aspirational. Opportunity-driven. Delight-seeking. | Generative. Invention-grounded. Surprise-seeking. |
| **Risk profile** | Low — wiring and testing existing code | Medium — new product surfaces | High in moonshots, low in algebra/refactors |
| **Overlaps** | Governance enforcement (W1-W2) | Operator delight (RX4), Cost OS (RX5) | Temporal intelligence, adversarial testing, cross-suite composition |
| **Unique contributions** | 93 specific wiring items, algebraic law tests, React 19 adoption | Mission control UI, experiment mode, multi-plan resolver | Knowledge packs, execution conversation, sensory expansion, self-attack |

**Recommended integration**: Execute V1 Waves 1-2 first (governance foundations). Then interleave V2 and V3 items by opportunity cost, using the 70/20/10 capacity split across core/features/moonshots.

---

## 10) Final call: build the system that surprises you

V1 builds the system that *works correctly*.
V2 builds the system that *delights operators*.
V3 builds the system that *discovers things nobody asked it to find*.

The temporal index will surface patterns humans can't see across hundreds of runs. The adversarial mode will find weaknesses humans wouldn't think to test. The knowledge packs will let teams share understanding the way they share code. The interpretive runtime will turn brittle scripts into adaptive conversations.

And the moonshots — self-authoring test suites, application digital twins, multi-agent debate resolution — these are the kind of ideas that, if even one of them works, change what people think is possible.

The architecture is ready. The typed envelopes, the governance lattice, the knowledge lifecycle, the evidence pipeline — these aren't just good engineering. They're **building blocks for invention**. V3 is what happens when you use them.

---

### Document lineage

| Artifact | Role | Relationship |
|----------|------|-------------|
| `docs/research-master-prioritization.md` | V1 — forensic gap-closing plan | 93 items, 5 waves, verification-focused |
| `docs/research-master-prioritization-expanded.md` | V2 — opportunity-driven reinvention | 36 items, 6 arcs, delight-focused |
| `docs/research-master-prioritization-v3.md` | **V3 — this document** | 48 items, 7 arcs, invention-focused |
| `BACKLOG.md` | Active backlog | Canonical work items by lane |
| `docs/master-architecture.md` | Architecture doctrine | Authoritative structural constraints |
| `VISION.md` | Product model | QA workflow and product thesis |
