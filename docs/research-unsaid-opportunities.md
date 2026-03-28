# The Unsaid: Opportunities Beyond the Roadmap

*A companion to `research-master-prioritization.md` and `research-master-prioritization-expanded.md`. This document covers what those don't — the ideas that emerge not from gap analysis but from staring at what the system already is and asking "what else could this become?" March 28, 2026.*

---

## Why this document exists

The master prioritization is thorough. 93 items across 5 waves. The expanded version adds arcs, moonshots, and sequencing. Both are excellent at closing the distance between what the system declares and what it enforces.

This document goes somewhere else entirely.

It starts from the observation that Tesseract has quietly assembled a collection of primitives that are individually impressive but whose *combinations* have not been fully explored. A deterministic compiler with provenance. A recursive self-improvement loop with a real loss function. A 15-parameter tunable pipeline with classified gradient signal. A 3D spatial dashboard with particle transport and bloom shaders. A typed state machine abstraction. An AST-backed code emitter. A governed knowledge lifecycle. A candidate lattice with ranked resolution.

These are not test infrastructure. These are the bones of something stranger and more interesting.

---

## Part 1: The system as a laboratory for program synthesis

### 1.1 The compiler already IS a program synthesizer

This tends to get lost in the QA framing. Tesseract takes natural language intent (ADO test case prose), compiles it through a multi-stage pipeline with knowledge priors, and emits executable TypeScript programs. That is program synthesis. The fact that the programs happen to be Playwright tests is an output format choice, not an identity.

The `spec-codegen.ts` module uses the TypeScript compiler API to build ASTs. The `GroundedSpecFlow` is a typed intermediate representation. The `ScenarioDecomposition` breaks prose into graph-grounded flow fragments. This is a compiler frontend, middle-end, and backend.

**The unsaid opportunity**: the same pipeline that emits `generated/{suite}/{ado_id}.spec.ts` could emit:

- **API integration tests** from the same intent, targeting REST/GraphQL endpoints instead of DOM
- **Accessibility audit scripts** that traverse the `StateTransitionGraph` and verify WCAG compliance at each state node
- **Load test scenarios** that replay the `EventSignature` sequences at scale without rendering
- **Migration verification tests** that diff the `ApplicationInterfaceGraph` between two versions of the same app and emit regression tests for every changed state transition

The IR is rich enough. The code emitter is AST-backed. The knowledge model is target-agnostic. The only thing coupling this to Playwright is the last 200 lines of `spec-codegen.ts`.

### 1.2 Intent-to-program as a service

The `ScenarioDecomposition` → `GroundedSpecFlow` → AST pipeline is general enough to be offered as a standalone capability. Given:

- a description of what a user wants to verify
- a model of the application's interface, states, and transitions
- a set of canonical targets and selector probes

...the system can emit executable verification code in any framework that has a page object model. Cypress, Selenium, Detox (mobile), even native desktop automation via Accessibility APIs.

The `CanonicalTargetRef` abstraction is the key. It separates *what* you're interacting with from *how* you find it. The selector ladder is already framework-agnostic in concept — `test-id`, `role-name`, `css` are strategies, not Playwright features.

**What this means**: Tesseract could become a multi-target verification compiler. One intent surface, N output backends. The recursive improvement loop would still work — it tunes the resolution pipeline, not the emission target.

---

## Part 2: The recursive improvement loop as a general optimization framework

### 2.1 You built a differentiable pipeline and may not have fully noticed

The `evolve.ts` + `knob-search.ts` + `speedrun.ts` triad is remarkable. It implements:

1. A **forward pass** (clean-slate flywheel producing fitness metrics)
2. A **loss function** (8-metric composite in `fitness.ts`)
3. A **gradient signal** (failure classification mapping to specific parameters)
4. A **backward pass** (knob search generating candidate configs)
5. A **checkpoint policy** (scorecard monotonic high-water-mark)
6. An **overfitting guard** (regenerated scenarios per seed)

This is a training loop. The document `recursive-self-improvement.md` already says so explicitly. But the implications haven't been fully drawn out.

### 2.2 The loop could optimize things other than resolution thresholds

The 15 tunable parameters are currently all resolution-pipeline knobs: translation thresholds, scoring weights, confidence floors, staleness TTLs. But the `PipelineConfig` type and the `FailureParameterMapping` structure are generic enough to accommodate:

- **Emission strategy parameters** — how aggressively to inline assertions vs. extract helpers, how to batch navigation steps, when to emit explicit waits vs. auto-waiting
- **Knowledge promotion thresholds** ✅ — decay rates and freshness now tunable via `knowledge-freshness.ts` (exponential decay with configurable `decayRate`, `maxRunsWithoutExercise`, `minimumConfidence`); contradiction sensitivity remains open
- **Agent orchestration parameters** — working memory depth, screen confidence floor, max active refs — these are already parameters #4-6 but they're not yet wired into the evolve loop
- **Discovery strategy parameters** ✅ — `entropy-injection.ts` (deterministic variant generation with tunable `VarianceProfile`) and `parallel-harvest.ts` (bounded-concurrency harvesting with configurable concurrency)

The failure classification taxonomy (`PipelineFailureClass`) would need new categories. But `knob-search.ts` already has the `FailureParameterMapping` pattern — adding new mappings is a data change, not an architecture change.

**The moonshot**: a single `npm run evolve` command that tunes the entire system — not just resolution, but emission quality, knowledge promotion velocity, discovery thoroughness, and agent behavior — against a composite fitness function that balances all of them.

### 2.3 Multi-objective Pareto optimization

The fitness report already tracks 8 metrics. The scorecard comparison uses a primary metric (knowledge hit rate) as the acceptance criterion. But the data for multi-objective optimization is already there.

Imagine the evolve loop maintaining a Pareto frontier across:
- Knowledge hit rate (correctness)
- Convergence velocity (efficiency)
- Degraded locator rate (robustness)
- Token cost per scenario (economics)

A candidate config that improves hit rate at the cost of 10x token spend would be visible as a Pareto tradeoff, not silently accepted or rejected. The operator could choose their position on the frontier.

The `ScoringRule` semigroup in `learning-shared.ts` already supports weighted combination with `combineScoringRules` and `contramapScoringRule`. A Pareto frontier is just a different composition strategy for the same algebraic structure.

---

## Part 3: The knowledge model as a living application ontology

### 3.1 Beyond QA: the interface graph as a product model

The `ApplicationInterfaceGraph` is quietly one of the most valuable artifacts in the system. It contains:

- Routes and screens (the app's information architecture)
- Surfaces and regions (the visual hierarchy)
- Semantic targets (every interactable and assertable thing)
- State nodes and transitions (dynamic behavior)
- Event signatures (action/effect contracts)
- Selector probes with health observations (concrete DOM grounding)

This is not just test infrastructure. This is a machine-readable model of the application itself. Most organizations don't have this. Their app knowledge lives in Figma mockups, Confluence pages, developer memory, and scattered Storybook stories.

**Novel use cases for the interface graph**:

- **Onboarding accelerator**: new developers get a queryable map of the app's states, transitions, and entry points instead of reading code
- **Change impact analysis** ✅: `lib/application/impact.ts` + `lib/domain/graph-query.ts` — query impacted subgraph by node ID, exposed as `npm run impact`
- **Design system drift detector**: compare the `SelectorCanon` against the intended design system tokens and flag components that diverge
- **Product analytics grounding**: map analytics event names to `CanonicalTargetRef` identities so product and QA share a vocabulary
- **Contractual API between frontend teams**: the `EventSignature` contracts define what actions are legal in which states — this is an executable interface contract

### 3.2 The knowledge lifecycle as organizational memory

The `knowledge/` directory structure — `surfaces/`, `screens/`, `patterns/`, `snapshots/`, `components/` — is a taxonomy of interface knowledge. The promotion rules (local hints → shared patterns) and the governance boundary (proposals → trust policy → canonical) create a curated, versioned, evidence-backed organizational memory about how the application behaves.

Most teams lose this knowledge when people leave. Tesseract externalizes it into reviewable YAML with provenance.

**The elegant extension**: connect the knowledge lifecycle to team topology. When a team owns a set of screens, their knowledge files are their contract. When screens change ownership, the knowledge transfers with them — complete with confidence scores, evidence counts, and known contradictions.

### 3.3 Snapshot-driven visual regression without pixel diffing

The `knowledge/snapshots/` and the ARIA snapshot system (`lib/domain/aria-snapshot.ts`, `lib/runtime/snapshots.ts`) capture the semantic structure of the DOM at named anchor points. This is richer than a screenshot and more stable than pixel diffing.

A visual regression system built on ARIA snapshots would detect:

- Structural changes (elements added/removed/reordered) that pixel diff misses when colors stay the same
- Accessibility regressions (roles removed, names changed) that pixel diff can't see at all
- State-dependent regressions by replaying snapshots at each `StateNode` in the transition graph

The `computeNormalizedSnapshotHash` function in `hash.ts` already normalizes snapshots for comparison. The diff is semantic, not visual.

---

## Part 4: The state machine abstraction as a universal execution substrate

### 4.1 Fifteen lines that deserve to be famous

`lib/application/state-machine.ts` is 15 lines:

```typescript
export interface StateMachine<S, E, R> {
  readonly initial: S;
  readonly step: (state: S) => Effect.Effect<{ readonly next: S; readonly done: boolean }, E, R>;
}

export function runStateMachine<S, E, R>(machine: StateMachine<S, E, R>): Effect.Effect<S, E, R> {
  const loop = (state: S): Effect.Effect<S, E, R> =>
    Effect.gen(function* () {
      const result = yield* machine.step(state);
      return result.done ? result.next : yield* loop(result.next);
    });
  return loop(machine.initial);
}
```

This is a universal recursive Effect executor parameterized by state type. The dogfood loop already uses it. But it could run *anything* that has the shape "start here, step, check if done, repeat."

### 4.2 State machines all the way down

Currently the system has several implicit state machines that could be made explicit using this abstraction:

- **Convergence detection** ✅: `lib/domain/convergence-fsm.ts` — typed FSM with four states (`exploring → narrowing → plateau → converged`), pure transition function, absorbing converged state. Replaces implicit convergence logic.
- **Discovery crawl**: `exploring → found-surfaces → harvested-elements → proposed-knowledge → done`
- **Proposal lifecycle**: `draft → evaluated → approved | rejected → activated | discarded`
- **Selector health**: `healthy → degraded → broken → repaired → healthy`
- **Agent working memory**: `empty → screen-identified → element-focused → action-resolved → step-complete`

Making these explicit gets you free visualization in the dashboard, free replay/debugging, and free composition — run a discovery state machine *inside* the dogfood state machine inside the evolve state machine, each with its own convergence criterion and checkpoint policy.

### 4.3 Hierarchical state machines for complex workflows

The 15-line abstraction supports nesting naturally because `step` returns an `Effect`. One machine's step can run an entire inner machine:

```
evolve-loop
  └─ speedrun-epoch
       └─ dogfood-loop
            └─ iteration
                 └─ scenario-execution
                      └─ step-resolution
```

Each level has its own state type, convergence criterion, and checkpoint. The `runStateMachine` combinator handles the recursion. This is already how the system works — the elegance is in making the nesting explicit and composable rather than ad hoc.

**The fun extension**: a "state machine debugger" in the dashboard that shows the live hierarchy — which evolve epoch, which speedrun, which dogfood iteration, which scenario, which step — as a zoomable tree. Click any node to see its state. Replay from any checkpoint.

---

## Part 5: The dashboard as a medium for understanding computation

### 5.1 The spatial canvas is underexploited

The dashboard already has a 3D spatial visualization layer with React Three Fiber, bloom postprocessing, and a remarkable layout:

- **Left**: ScreenPlane — live DOM texture from screenshots
- **Center**: GlassPane — frosted separator where proposals either pass through or reflect
- **Right**: KnowledgeObservatory — knowledge nodes crystallizing from observations

With `SelectorGlows` highlighting probed elements, `ParticleTransport` arcing from DOM to knowledge space, `DecisionBurst` on approval, and `ArtifactAurora` flashing on writes.

This is already beautiful. But it's currently a visualization *of* the pipeline. It could become a visualization *as* the pipeline — an interactive control surface where the operator sees computation happening in space and can intervene mid-flight.

### 5.2 The spatial canvas as an operator control room

Imagine extending the spatial layout:

- **Drag a proposal** from the GlassPane to the knowledge side to approve it
- **Pinch-zoom** into a screen on the ScreenPlane to see its selector ladder and health
- **Tap a ParticleTransport arc** to see the evidence chain it represents
- **Rotate the KnowledgeObservatory** to see knowledge nodes colored by lifecycle state (candidate → observed → stable → aging → retired)
- **Watch the IterationPulse** slow down as convergence approaches, like a heartbeat calming

The `usePipelineBuffer` hook already has the SharedArrayBuffer zero-copy path. The MCP tools already expose structural data. The `WorkbenchPanel` already has the approval workflow. The pieces exist — the interaction layer is the missing skin.

### 5.3 Computation as choreography

The particle transport system (`particle-transport.tsx`) already animates arcs from DOM space to knowledge space. Extend this:

- **Resolution particles**: when a step resolves, a particle traces the winning path through the rung ladder — bright and direct for `compiler-derived`, wandering and exploratory for `live-dom`, red and pulsing for `needs-human`
- **Convergence waves** ✅: `iteration-pulse.tsx` modulates ambient scene lighting per iteration cycle; `convergence-ribbon.tsx` shows rung distribution tightening over time
- **Knowledge crystallization** ✅: `decision-burst.tsx` fires green particle arcs through glass pane on approval; `knowledge-observatory.tsx` grows node sphere radius and brightness with confidence
- **Failure constellations**: cluster `needs-human` steps spatially by their failure fingerprint; similar failures drift together

This isn't decoration. Spatial pattern recognition is one of the fastest human cognitive channels. An operator who sees a cluster of red particles in one region of the screen knows *instantly* where the bottleneck is — faster than reading any log.

---

## Part 6: Elegant refactors that create new capabilities

### 6.1 The envelope as a monad ✅ (algebraic foundation)

Every cross-boundary artifact carries a `WorkflowEnvelope` with `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`. The `mapPayload` function transforms the payload while preserving the envelope.

This is a functor. `mapPayload(envelope, f)` is `fmap f envelope`. If you add `flatMapPayload` (where the function returns a new envelope and the lineage is concatenated), you get a monad. If you add `apPayload` (applying an envelope of functions to an envelope of values, merging governance by lattice meet), you get an applicative.

> **Status**: The algebraic building blocks are now implemented: `lib/domain/algebra/lattice.ts` (GovernanceLattice with O(1) meet/join), `lib/domain/algebra/lineage.ts` (lineage product monoid), `lib/domain/algebra/scoring.ts` (ScoringRule semigroup/monoid with identity and annihilator), `lib/domain/algebra/kleisli.ts` (Kleisli arrow composition with category laws). The `flatMapPayload`/`apPayload` surface refactor remains.

**Why this matters**: monadic envelope composition would let you express multi-step derivations as chains:

```typescript
const result = pipe(
  sourceEnvelope,
  flatMapPayload(parse),
  flatMapPayload(bind),
  flatMapPayload(ground),
  flatMapPayload(emit),
);
```

Each step preserves lineage, merges governance, and threads fingerprints. The provenance chain builds itself. Error in any step preserves the envelope context for debugging.

This is not hypothetical — the pipeline already does this imperatively. The refactor makes it composable and gives you free provenance tracking for any new pipeline you build.

### 6.2 Resolution as a search problem with pruning ✅ (scoring algebra + strategy registry)

The resolution ladder currently runs stages sequentially: explicit → control → approved-knowledge → confidence-overlay → translation → live-dom → agent → needs-human. Each stage either resolves or passes to the next. The `ScoringRule` semigroup/monoid is now a first-class algebra in `lib/domain/algebra/scoring.ts` (with identity, annihilator, bounded clamping, and contramap). The `lib/runtime/agent/strategy-registry.ts` provides O(1) rung lookup and total-function verification. `lib/runtime/agent/rung8-llm-dom.ts` adds a new LLM-assisted DOM exploration rung between structural and semantic agent resolution.

But the `candidate-lattice.ts` already ranks candidates within a rung. The lattice has `rankScreenCandidates`, `rankElementCandidates`, `rankActionCandidates`, `rankPostureCandidates`, `rankSnapshotCandidates`. This is a multi-dimensional ranking.

**The refactor**: model resolution as **beam search** across the candidate lattice. Instead of committing to one rung's result before trying the next, maintain a beam of K top candidates across all rungs, scored by a composite of precedence weight, confidence, and evidence. The beam naturally handles the case where a lower-precedence rung has a much higher-confidence candidate than a higher-precedence rung with a marginal match.

The `ScoringRule` semigroup already supports the composition. The `chooseByPrecedence` function in `precedence.ts` would become the default beam-width-1 case. Beam width becomes a tunable parameter — another knob for the evolve loop.

### 6.3 The validation layer as a constraint solver

`lib/domain/validation/` has a rich set of validators organized by concern: `knowledge.ts`, `intent.ts`, `execution.ts`, `resolution.ts`, `projection.ts`, etc. The `ValidationRule<T>` type is a composable monoid.

Currently validation is binary: valid or invalid with diagnostic issues. But the structure supports something richer — **constraint propagation**. If an element must have a test-id but doesn't, instead of just reporting the failure, the system could:

1. Check if a test-id exists in the `SelectorCanon` from a prior run
2. Check if a test-id was observed in a discovery crawl
3. Propose adding the test-id to the element knowledge
4. Grade the proposal's confidence based on evidence

This turns validation from a gate into a **repair engine**. The `ValidationRule` monoid already composes — add a `repair` field alongside the existing `validate` field, and you get composable validation-with-repair for free.

---

## Part 7: Fun features that are also serious infrastructure

### 7.1 "Speedrun mode" as a spectator sport

The speedrun loop already has progress events (`SpeedrunProgressEvent`), iteration metrics, and a convergence detection state machine. The dashboard already has convergence ribbons and fitness cards.

Wire them together and you get a live spectator view of the system improving itself:

- A **speedrun leaderboard** showing the best scorecard per seed, with history
- A **live convergence graph** that updates in real-time as the dogfood loop iterates
- A **failure class waterfall** showing which failure modes are being eliminated epoch by epoch
- A **parameter trajectory plot** showing how the 15 knobs drift across evolve epochs

This is fun to watch. It is also the single most effective way to build intuition about the system's behavior. An operator who has watched 50 speedruns understands the pipeline better than one who has read every line of documentation.

### 7.2 Knowledge archaeology

The provenance chain tracks which runs justified which hints, which discoveries led to which proposals, which proposals were activated or rejected. Over time this builds a rich history.

**Knowledge archaeology mode**: query the system with "why does this screen have this alias?" and get back the full evidence chain — the discovery run that first observed the element, the phrasing variants that triggered translation misses, the proposal that added the alias, the speedrun that validated it improved hit rate.

The `lineage` field in the envelope already carries `sources`, `parents`, and `handshakes`. The graph already has provenance edges. The archaeology tool is a traversal query, not a new system.

### 7.3 The "what would break" simulator

Given the interface graph and selector canon, simulate the effect of a DOM change *before* it ships:

- "What if we remove the `data-testid` from the policy search input?" → show which scenarios degrade, which selectors fall to lower rungs, how the fitness report would change
- "What if we rename the route from `/search` to `/find`?" → show which screen identifications break, which knowledge files need updating
- "What if we add a confirmation modal before save?" → show which `StateTransition` edges gain a new intermediate node, which scenarios need a new step

The `impact.ts` module already computes impacted subgraphs for a node ID. The `rerun-plan.ts` already computes the smallest safe rerun set for a change. The simulator extends this from "what changed" to "what would change."

---

## Part 8: Moonshots that the architecture uniquely enables

### 8.1 The app as a formal language ✅ (graph queries)

The `StateTransitionGraph` + `EventSignature` contracts define a formal language: the set of all valid action sequences the application accepts. Each `StateNode` is a state in a finite automaton. Each `StateTransition` is a labeled edge. The language accepted by this automaton is the set of all valid user journeys.

This enables:

- **Completeness checking** ✅: `lib/domain/graph-queries.ts` — `queryReachableScreens` computes the full reachable set from any screen; dead-state detection follows directly
- **Equivalence testing**: do two versions of the app accept the same language? If not, what sequences are newly accepted or newly rejected?
- **Minimal test suite generation** ✅: `queryShortestPath` (BFS) computes shortest paths between screens; combined with `queryAvailableTransitions` enables transition-coverage path planning
- **Property-based journey generation**: instead of hand-writing scenarios, generate random walks through the automaton and check that the app accepts them

The `graph-query.ts` module already supports graph traversal. The state transition graph already has the topology. The formal language interpretation is a view, not a rebuild.

### 8.2 Collaborative multi-agent resolution

The current architecture has one agent per step resolution. But the `AgentInterpretationRequest` type and the provider abstraction (`agent-interpreter-provider.ts`) are clean enough to support multiple agents collaborating:

- **Specialist agents**: one agent knows forms, another knows tables, another knows modals. Route steps to the specialist based on the `CanonicalTargetRef` type
- **Adversarial verification**: two agents resolve independently; if they agree, high confidence; if they disagree, flag for human review
- **Teacher-student**: a high-capability agent resolves and explains; a lightweight agent learns from the explanation and attempts similar steps solo

The `provider-registry.ts` already supports registering multiple providers. The `agent-decider.ts` already has dual-mode logic (agent vs. human). Extend to N-mode with routing.

### 8.3 Cross-application knowledge transfer

The `knowledge/patterns/` layer carries reusable intent phrases, posture aliases, and interaction patterns that are not screen-specific. Some of these are genuinely universal:

- "Click the Save button" → click action on element with role button, name containing "save"
- "Enter {value} in the {field} field" → fill action on element with role textbox
- "Verify the {message} is displayed" → assert visibility of element containing text

A **pattern marketplace** where teams share and consume universal patterns would let a new application start with 80% of its resolution pipeline pre-trained. The `knowledge-posture.ts` system already gates what knowledge is available. A `shared-patterns` posture that loads community patterns before falling back to local knowledge is a natural extension.

### 8.4 The system as its own documentation

The review artifacts (`generated/{suite}/{ado_id}.review.md`) already explain what the compiler derived, what the runtime did, and where governance intervention is needed. Extend this:

- **Living architecture documentation**: generate `docs/` content from the interface graph, showing the app's screens, transitions, and target inventory — always in sync with reality
- **Runbook authoring from observation**: after N successful runs with consistent resolution paths, auto-generate a `controls/runbooks/` file that codifies the observed pattern
- **Test plan projection**: given the state transition graph and current scenario coverage, project a "recommended test plan" showing which transitions are uncovered and what scenarios would cover them

The `trace.ts` and `review.ts` projection machinery already exists. The `projections/runner.ts` has the incremental projection framework. New documentation surfaces are new projections over the same interpretation surface.

---

## Part 9: The deepest architectural insight

### 9.1 Tesseract is a compiler for *understanding*, not for *tests*

The emitted Playwright spec is the least interesting artifact the system produces. The interesting artifacts are:

1. **The interface graph** — a machine-readable model of the application
2. **The selector canon** — a ranked, health-tracked, evidence-backed map from semantic targets to concrete DOM
3. **The state transition graph** — a formal model of dynamic behavior
4. **The resolution receipts** — a provenance-rich explanation of every decision
5. **The improvement ledger** — a versioned history of how the system's understanding evolved
6. **The fitness report** — a quantified measure of how well the system understands the application

These artifacts compose into something that doesn't have a standard name yet. It's not a test suite. It's not a design system. It's not an API contract. It's a **living, governed, evidence-backed model of what an application is and how it behaves**, maintained by a self-improving pipeline that gets better at understanding the application with every run.

The test is just the proof that the understanding is correct.

### 9.2 The real product is the interpretation surface

The `Interpretation Surface` — defined in `master-architecture.md` as the single machine boundary shared by planning, runtime, review, intervention, and improvement — is the actual product. Everything else is a projection.

The spec is a human-readable projection. The review markdown is a QA-facing projection. The dashboard is a spatial projection. The inbox is an operator-facing projection. The MCP tools are an agent-facing projection.

**The unsaid opportunity**: every new consumer of the interpretation surface creates a new product surface without requiring new computation. A Slack integration that posts bottleneck summaries, a Jira integration that creates tickets for `needs-human` steps, a Grafana datasource that exposes fitness metrics, a VS Code extension that highlights selector health inline ✅ (`vscode/task-provider.ts`, `problem-matcher.ts`, `copilot-participant.ts`) — these are all projections, and the projection framework (`projections/runner.ts` + `projections/cache.ts`) already handles incremental recomputation and fingerprint-based invalidation.

The system's value grows linearly with each new projection, but the cost of each projection is constant — they all read from the same interpretation surface.

---

## Part 10: What I'd build first

If I had to pick five items from this document that I find most compelling, in order of "this should exist":

1. **Multi-target emission** (1.2) — decouple the last mile and let the same intent surface target any automation framework. Highest leverage-to-effort ratio. The IR is ready; the codegen abstraction is clean.

2. **The "what would break" simulator** (7.3) — query the interface graph with hypothetical DOM changes and see which scenarios degrade. The impact analysis and rerun planner are already 80% of this.

3. **Speedrun spectator mode** (7.1) ✅ — `pipeline-event-bus.ts` (Effect PubSub + SAB ring buffer) wires progress events to the dashboard; `convergence-ribbon.tsx`, `fitness-card.tsx`, and `iteration-pulse.tsx` render live.

4. **The app as a formal language** (8.1) — treat the state transition graph as a finite automaton and derive coverage properties, minimal test suites, and completeness checks. The graph is there; the formal interpretation is free.

5. **Monadic envelope composition** (6.1) — refactor the pipeline into a chain of `flatMapPayload` operations that automatically thread lineage, governance, and fingerprints. This is the "makes everything else easier" refactor.

---

## Closing note

The two existing research documents ask "what gaps need closing?" and "what could become category-defining?" This document asks a different question: **what has the system already become that we haven't named yet?**

The answer, I think, is that Tesseract is a *governed intelligence accumulator* for application interfaces. It harvests understanding, preserves it with provenance, improves it with a real optimization loop, and projects it into whatever surface is needed. The test is just the most visible projection. The understanding is the durable asset.

Everything in this document flows from that observation.
