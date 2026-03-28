# Research: Where Tesseract Should Go Next

*Four independent research perspectives on the codebase's future, March 2026.*

---

## Perspective 1: Interface Intelligence Graph — From Projection to Living Surface

**Researcher focus**: How close is the `ApplicationInterfaceGraph` to being the real shared interpretation surface the architecture promises?

### Current state

The interface graph infrastructure is **architecturally complete and actively used**:

- **1,379-line builder** (`lib/application/interface-intelligence.ts`) assembles the graph from knowledge artifacts, discovery runs, and harvest manifests
- **Rich node vocabulary**: routes, route-variants, screens, sections, surfaces, targets, snapshot-anchors, harvest-runs, states, event-signatures, transitions (11 node kinds)
- **Edge vocabulary**: route-target, variant-of-route, contains, references-target, references-snapshot, discovered-by, requires-state, causes-transition, results-in-state (9 edge kinds)
- **SelectorCanon**: durable working set of ranked selector probes keyed by `CanonicalTargetRef`, with rung ordering, evidence refs, success/failure counts, and lineage
- **StateTransitionGraph**: state nodes, event signatures, transitions with pre/postconditions and observation plans
- **Incremental projection**: fingerprint-based cache invalidation means the graph rebuilds only when inputs change

### Where it should go

1. **Runtime graph queries at execution time.** The graph is built at compile/project time and consumed statically. The runtime interpreter receives `InterfaceResolutionContext` with pre-materialized screen candidates, but doesn't query the graph dynamically. Making the graph queryable at runtime (e.g., "given I'm on screen X with state Y, what transitions are available?") would turn it from a compile-time projection into a live navigation oracle.

2. **Cross-screen transition modeling.** State transitions are currently screen-scoped. The graph has routes and route-variants but doesn't model cross-screen flows (e.g., "submitting the search form transitions to the results screen"). This is the gap between "interface graph" and "application topology."

3. **Discovery-to-canon promotion pipeline.** Discovery runs produce `source: 'discovery'` nodes. There's no automated path from discovery observation → candidate knowledge → reviewed canon. Building this pipeline would close the loop between `harvest` and the knowledge layer.

4. **Graph diff as a drift signal.** When the graph changes between runs, the diff itself is a structured signal about application change. Today `graphDeltas` exist on discovery runs, but there's no cross-run graph diff that feeds into the scorecard or proposal system.

---

## Perspective 2: Runtime Interpreter & ADR Collapse — The Critical Path

**Researcher focus**: How far is the system from runtime interpretation replacing compile-time alias matching (backlog A1)?

### Current state

The runtime layer is **substantially built** but the critical ADR collapse has not yet happened:

- **Resolution engine** (`lib/runtime/` or equivalent): resolution ladder implemented with deterministic substrate → overlays → translation → agentic fallback → needs-human
- **Widget contracts** in `lib/runtime/widgets/`: typed handlers for OutSystems widget families (text input, dropdown, combobox, search input, checkbox, radio, date picker, etc.)
- **Bounded translation bridge**: structured LLM translation with typed receipts, fingerprint-based caching, and disable toggle — this is the A1 scaffolding for moving interpretation to runtime
- **Intent-only deferred binding**: steps that can't be resolved deterministically emit `confidence: intent-only`, `binding.kind: deferred` rather than blocking compilation
- **Interpreter modes**: `deterministic`, `diagnostic`, `translation-enabled` — the system can be configured to use progressively more agentic resolution

### What's missing for A1 completion

1. **Step text → intent interpretation at runtime.** The current flow is: ADO step text → compile-time alias matching → typed `StepResolution` → runtime execution. A1 wants: ADO step text → typed intent IR → runtime interpretation against live DOM + knowledge priors → typed resolution receipt. The interpreter shape exists but the "interpret novel phrasing against DOM context" path is incomplete.

2. **Screen identification from DOM context.** Runtime currently receives pre-resolved screen candidates. A1 envisions the runtime identifying which screen it's on by inspecting the DOM against the interface graph, rather than relying on compile-time screen resolution.

3. **Evidence-to-knowledge feedback without human curation.** When the runtime successfully resolves a novel phrase, it produces evidence drafts. But flowing those drafts back into proposals and eventually into canon requires the full A1 → A2 → A3 chain.

### Recommended next step

The smallest viable A1 slice: implement a `RuntimeIntentInterpreter` that takes `(stepText, InterfaceResolutionContext, liveDomSnapshot)` and returns a `StepResolution` + evidence draft. Wire it as a new rung in the resolution ladder, above translation but below needs-human. This lets novel phrasing hit the DOM directly when all deterministic paths exhaust.

---

## Perspective 3: Recursive Improvement Loop — Mostly Built, Needs Activation Energy

**Researcher focus**: What's built vs. aspirational in the self-hardening dogfood loop?

### Current state — remarkably complete

The dogfood infrastructure is the most production-ready part of the system:

- **Full state machine loop** (`lib/application/dogfood.ts`, 645 lines): compile → run → propose → auto-approve → rerun, with convergence detection
- **Convergence criteria**: `no-proposals`, `threshold-met`, `budget-exhausted`, `max-iterations`
- **Confidence-gated auto-approval** (A2): trust policy evaluation with per-artifact-type thresholds, forbidden auto-heal classes, evidence minimums
- **Self-calibrating bottleneck weights**: correlation-based weight tuning across iterations — signals that correlate with improvement get amplified
- **Agent workbench**: scored work items (interpret-step, approve-proposal, investigate-hotspot, author-knowledge, validate-calibration) ready for agent consumption
- **Agent decider integration**: MCP tool interface for external agent decision-making
- **Progress reporting**: `SpeedrunProgressEvent` with JSONL sidecar and stderr emission
- **Improvement run model**: full `ImprovementLoopLedger` with iteration tracking, signal extraction, candidate interventions, acceptance decisions, lineage

### Where it should go

1. **Structured entropy injection (D1).** The loop runs but always with the same inputs. The `SpeedrunProgressEvent` has a `seed` field suggesting multi-seed was planned. Implementing variance profiles — ADO phrasing variants, data posture combinations, screen state permutations — would accelerate knowledge hardening by orders of magnitude.

2. **Cross-iteration learning memory.** Each iteration starts fresh from the updated knowledge layer. There's no mechanism for the loop to remember *why* a particular proposal was generated or rejected across iterations. Adding a structured "iteration journal" that persists reasoning (not just metrics) would help the loop avoid repeating mistakes.

3. **Graduated autonomy profiles.** The trust policy is binary per artifact type. A graduated model — e.g., "auto-approve element knowledge for screens with >5 successful runs, require review for novel screens" — would let the system earn trust incrementally.

4. **Parallel scenario execution.** The loop runs scenarios sequentially. For large suites, parallel execution with shared knowledge accumulation would dramatically reduce wall-clock time.

---

## Perspective 4: Knowledge Layer Density & Discovery — The Long Game

**My own research focus**: How rich is the knowledge surface, and what would make discovery self-sustaining?

### Current state

The knowledge layer is **deeply modeled** but **manually seeded**:

- **Five knowledge artifact types**: `ScreenElements` (structural identity), `ScreenHints` (aliases, defaults, affordances), `ScreenPostures` (state/value effects), `ScreenBehavior` (state nodes, event signatures, transitions), `PatternDocument` (shared action/posture aliases)
- **Surface graphs**: hierarchical surface → section → element decomposition per screen
- **Supplement hierarchy**: screen-local hints first, promoted shared patterns second — well-designed promotion rule
- **Confidence overlays**: `ArtifactConfidenceRecord` with success/failure counts, evidence lineage, and approval-equivalence status
- **Learning types**: `GroundedSpecFragment`, `ReplayExample`, `TrainingCorpusManifest`, `CorpusHealthReport`, `KnowledgeBottleneck`, `RankedProposal` — the full Phase 6 learning infrastructure

### Discovery pipeline

Three discovery tools exist:

- **`discover`** (`discover-screen.ts`, 515 lines): launches Chromium, navigates to URL, inspects ARIA tree, builds `DiscoveryRun` with surfaces, elements, targets, selector probes, and review notes
- **`harvest`** (`harvest-routes.ts`, 662 lines): iterates over `HarvestManifest` routes, discovers each variant, observes state topology (state refs, transitions, event candidates), writes discovery runs with fingerprint-based skip logic
- **`capture`** (`capture-screen.ts`): captures section snapshots via Playwright for snapshot-based assertions

Discovery runs feed into the interface graph as `source: 'discovery'` nodes. But **discovery doesn't write knowledge** — it writes evidence that the interface intelligence projection consumes.

### The gap: discovery → knowledge is manual

The critical missing piece is the **discovery-to-knowledge promotion pipeline**:

1. `harvest` discovers that screen X has element Y with role `textbox`, name `"Policy Number"`, accessible via `getByRole('textbox', { name: 'Policy Number' })`
2. This becomes a `DiscoveryRun` artifact and a graph node with `source: 'discovery'`
3. **Nothing automatically proposes** `ScreenElements` or `ScreenHints` entries from this discovery
4. An operator must manually author `knowledge/screens/x.elements.yaml` and `knowledge/screens/x.hints.yaml`

The proposal system exists and works for *runtime evidence* (when execution produces evidence drafts). But discovery runs don't generate proposals.

### Where it should go

1. **Discovery-to-proposal bridge.** When `harvest` discovers elements, surfaces, and state topology, it should generate candidate `ProposalBundle` entries for the corresponding knowledge artifacts. These would flow through the same trust-policy gating as runtime proposals. This is the single highest-leverage addition to the knowledge layer — it would make discovery self-sustaining rather than requiring human authoring.

2. **Route knowledge persistence (B1).** The `HarvestManifest` is manually authored. When the system navigates to URLs and discovers route variants (query parameters → distinct UX outcomes), those discoveries should be proposed as `knowledge/routes/` entries. The type system is ready (`lib/domain/types/routes.ts`) but the feedback loop isn't closed.

3. **Knowledge decay and freshness.** `ArtifactConfidenceRecord` tracks success/failure counts and `lastSuccessAt`/`lastFailureAt`. But there's no time-based decay (B3). Knowledge that hasn't been exercised in N runs should lose confidence, triggering re-verification. This prevents stale knowledge from silently drifting.

4. **Component knowledge maturation.** `knowledge/components/*.ts` holds widget choreography (procedural knowledge). Today these are hand-authored TypeScript. As the system accumulates runtime evidence of successful widget interactions, it could propose component knowledge updates — e.g., "this combobox requires a click, type, wait-for-options, select sequence based on 47 successful observations."

5. **Knowledge coverage as a first-class scorecard metric.** The `CorpusHealthReport` identifies thin screens and thin action families. Elevating these into the dogfood loop's convergence criteria — "don't stop iterating while there are thin screens that discovery could populate" — would make the loop actively seek coverage rather than just passively measuring it.

---

## Cross-cutting synthesis: The four moves that matter most

Across all four research perspectives, the same structural pattern emerges: **the system's internal contracts are remarkably well-typed and the machinery is built, but the feedback loops between subsystems aren't fully closed.** Here are the four highest-leverage moves, ranked:

| Rank | Move | Connects | Unblocks |
|------|------|----------|----------|
| 1 | **Discovery-to-proposal bridge** | discovery → proposal → knowledge | Self-sustaining knowledge growth without human authoring |
| 2 | **Runtime intent interpreter** (minimal A1 slice) | step text → DOM → resolution receipt | Novel ADO phrasing works without alias tending |
| 3 | **Structured entropy injection** (D1) | variance profiles → dogfood loop → scorecard | Knowledge hardens faster through diverse exposure |
| 4 | **Runtime graph queries** | interface graph → execution-time navigation | The graph becomes a live oracle, not just a compile-time projection |

The common theme: **close the loops**. The types are defined, the envelopes are standardized, the governance model is principled. What remains is wiring the subsystems so knowledge flows autonomously from discovery through execution back into canon, with human oversight at governance boundaries rather than at every step.
