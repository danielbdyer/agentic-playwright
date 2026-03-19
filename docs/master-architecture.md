# Tesseract Master Architecture

This document is the authoritative architecture doctrine for Tesseract. It supersedes the older compiler-only framing in `VISION.md` and the directional notes in `docs/direction.md`.

Tesseract is an interface intelligence and agent workbench system that compiles executable QA projections from a shared model of application reality.

## North Star

Tesseract has three durable architectural spines:

- `Interface Intelligence`: the structural spine that harvests and preserves what the application is
- `Agent Workbench`: the intervention spine that governs how operators and agents inspect, extend, execute, review, and rerun against that application model
- `Recursive Improvement`: the optimization spine that evaluates, tunes, accepts, and checkpoints improvements to the system itself

These spines meet at one shared `Interpretation Surface`. The interpretation surface is the machine contract that planning, runtime resolution, emitted tests, review artifacts, intervention services, and improvement services all consume.

The compiler remains essential, but it is no longer the conceptual center. The compiler is one projection engine over the shared interpretation surface, not the whole product.

## Product Statement

Tesseract exists to:

- harvest application reality once
- preserve selector and state knowledge once
- decompose ADO intent into graph-grounded scenario flows
- emit ordinary human-readable Playwright tests
- execute those tests through one canonical runtime event interface
- observe change, accumulate derived knowledge, and propose canonical updates only when governance requires it

The durable asset is not the emitted test file by itself. The durable asset is the shared model of the interface, its states, its event topology, its scenario decompositions, and the provenance-rich receipts that explain how those parts interact over time.

## Architectural Spines

The six public workflow lanes remain the operator vocabulary:

- `intent`
- `knowledge`
- `control`
- `resolution`
- `execution`
- `governance/projection`

Those lanes are not the true conceptual center anymore. Three cross-cutting spines run through them:

- `interface`: approved and discovered UI structure, targets, states, selectors, transitions, and provenance
- `intervention`: typed participants, sessions, approvals, reruns, reviews, and codebase-touching receipts
- `improvement`: experiments, objective vectors, candidate interventions, acceptance decisions, checkpoints, and replay/evaluation surfaces

The six lanes tell us where a concern lives operationally. The three spines tell us what the system is really made of.

## Canonical Model

The canonical model extends the existing ontology with the following first-class contracts.

### `ApplicationInterfaceGraph`

The normalized graph of application reality. It includes:

- routes and screens
- surfaces and regions
- semantic targets
- state nodes
- state transitions
- event signatures
- snapshot anchors
- provenance to approved knowledge and discovery evidence

This is written to `.tesseract/interface/index.json`. The current serialized form may still use implementation names such as `compiled-interface-graph`, but the product contract is `ApplicationInterfaceGraph`.

### `CanonicalTargetRef`

The single semantic identity for any interactable or assertable thing.

Examples:

- the policy number input on the policy-search screen
- the open advanced filters toggle
- the validation message asserting required state
- the route transition into the search results table

Selectors do not define a target. The target defines the selectors.

### `SelectorProbe`

A concrete candidate for finding a target under a known context.

A probe records:

- selector kind
- selector value
- expected scope
- supporting evidence
- health observations

### `SelectorCanon`

The durable working set of ranked selector probes keyed by `CanonicalTargetRef`.

It is written to `.tesseract/interface/selectors.json` and carries:

- ordered selector ladders
- rung health
- drift evidence
- provenance and lineage
- promotion status back to approved knowledge

### `StateNode`

A durable named state of the interface or a semantic target.

Examples:

- advanced filters collapsed
- state dropdown disabled
- validation summary visible
- save button enabled
- edit modal open

### `StateTransitionGraph`

The durable graph of how state changes happen and how they are reused.

This graph models:

- reveal and hide
- enable and disable
- validate and invalidate
- open and close
- navigate and return
- expand and collapse
- populate and clear

Each transition is keyed and referential so many scenarios can reuse the same state knowledge without rediscovering it from scratch.

### `StateTransition`

A single typed edge in the `StateTransitionGraph`.

A transition carries:

- source state node
- triggering `EventSignature`
- target state node
- guards and preconditions
- expected observable effects
- provenance and confidence

### `EventSignature`

The canonical action and effect contract for a target in a given state context.

It answers:

- what action is legal here
- what preconditions must hold
- what effects are expected
- which state transitions may fire
- which assertions should verify success

### `ScenarioDecomposition`

The lowered representation of ADO intent before emission.

It breaks a scenario into graph-grounded flow fragments that reference:

- target refs
- state refs
- event signatures
- assertion anchors
- data bindings

### `GroundedSpecFlow`

The readable, executable-flow input for Playwright emission.

It is the last model before code generation and must stay close enough to human QA reasoning that a generated spec reads like a well-authored test rather than opaque output.

### `InterventionLedger`

The durable record of participants, sessions, and operator or agent work against the system.

Current projections live at `.tesseract/sessions/{sessionId}/` and include:

- `session.json`
- `events.jsonl`
- transcript references when available

Typed events and linked intervention receipts are authoritative. Raw transcript text is optional and referenced, not authoritative.

### `ImprovementRun`

The governed optimization aggregate for recursive improvement.

It includes:

- substrate context and clean-room lineage
- iterations and objective vectors
- classified signals and candidate interventions
- acceptance decisions and checkpoint references
- convergence state and parent lineage

The append-only ledger lives at `.tesseract/benchmarks/improvement-ledger.json`. Replay and training corpora remain derived child projections under `.tesseract/learning/`.

## Canonical and Derived Split

The governance split is explicit and must remain explicit.

Canonical artifacts:

- ADO source snapshots and scenario intent
- approved screen, surface, pattern, and snapshot knowledge
- controls and trust policy

Derived artifacts:

- `ApplicationInterfaceGraph`
- `SelectorCanon`
- observed state transition overlays
- intervention and session ledgers
- improvement ledgers plus replay and training corpora
- generated specs, traces, reviews, and proposals
- run receipts and benchmark outputs

Promotion boundary:

- derived layers may ratchet automatically during a run
- canonical truth never self-mutates
- any change that alters approved semantic meaning still flows through proposals and trust-policy review

## Interpretation Surface

The interpretation surface is the single machine boundary shared by planning, runtime, review, intervention, and improvement.

It extends the repo-wide envelope discipline and carries:

- envelope header: `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`
- scenario decomposition fragments
- graph node references
- canonical target refs
- selector refs
- state refs
- event signatures
- data bindings
- assertion anchors
- runtime knowledge slice
- receipt references

No projection is allowed to rebuild equivalent truth ad hoc from a mixed workspace catalog when the interpretation surface already carries the needed references.

`ScenarioProjectionInput` is the downstream projection boundary for:

- emitted specs
- trace JSON
- review Markdown
- inbox surfaces
- Copilot and other workbench views

## Selector Preservation

Selector duplication is forbidden by architecture, not just discouraged by style.

The preservation rules are:

1. Every semantic target gets exactly one `CanonicalTargetRef`.
2. Selector ladders attach only to `SelectorCanon`.
3. Scenarios, emitted specs, and receipts reference target refs and selector refs, never raw duplicated selector truth as their primary identity.
4. Selector drift evidence accumulates on the selector ref that already exists.
5. Promotion back into approved screen knowledge happens by proposal, not by silent mutation of scenario or spec outputs.

This is how selectors are preserved once even when 2000 scenarios reference the same control in different contexts.

## State and Event Topology

Dynamic behavior is not an execution side effect to rediscover every run. It is part of the model.

The architecture must represent cases such as:

- field A reveals field B
- selecting radio option C disables field D
- opening a modal changes the active surface and target set
- saving moves the route into a confirmation state
- validation creates a visible error region and blocks submit

Those dependencies are stored once as state transitions and event signatures, then reused everywhere they apply.

The modeling rules are:

- visibility and enabled state are explicit state nodes
- triggers are explicit event signatures
- effects are explicit state transitions
- runtime receipts record observed transition ids, not just freeform notes
- scenario decomposition references these ids directly when a step depends on them

When a field toggle reveals another field, the relationship lives in the `StateTransitionGraph`, not separately in emitted waits, scenario prose, and recovery code.

## Harvesting Lifecycle

Tesseract uses a hybrid harvesting lifecycle.

### Phase 1: Baseline App Harvest

Recursive discovery establishes the shared application model before scenario scale work begins.

Discovery emits:

- crawl receipts
- route and surface coverage
- selector candidates
- affordance observations
- graph deltas
- snapshot anchors

The output feeds the derived interface graph and selector canon.

### Phase 2: Scenario Deepening

ADO scenarios do not rediscover the full app. They deepen only the surfaces they exercise.

Scenario-driven execution may:

- confirm selector health
- observe new state transitions
- discover missing assertions
- propose new targets or hints
- strengthen the improvement corpora

### Phase 3: Canonical Promotion

Only reviewable, evidence-backed improvements are promoted into approved knowledge.

This keeps the baseline model durable while still letting derived layers move quickly.

## Scenario Compilation

Scenario compilation turns ADO prose into graph-grounded executable intent.

The end-to-end lowering path is:

1. ADO scenario text and metadata enter as canonical intent
2. `ScenarioDecomposition` lowers that prose into flow fragments
3. fragments bind against `ApplicationInterfaceGraph`, `CanonicalTargetRef`, `StateTransitionGraph`, and `EventSignature`
4. the grounded result becomes `GroundedSpecFlow`
5. the machine truth is projected into `.tesseract/tasks/{ado_id}.resolution.json`
6. readable code emission projects the same flow into Playwright

Every step target, assertion anchor, and fallback path must point to graph node ids and selector refs explicitly.

## Readable Test Emission

The emitted surface stays standard Playwright.

The user-facing output should look like an experienced QA wrote it:

- ordinary `test(...)`
- readable `test.step(...)`
- stable helper names
- domain-language assertions

Under the surface, those helpers all map to one canonical runtime event pipeline:

1. resolve `CanonicalTargetRef`
2. select the best `SelectorProbe` from `SelectorCanon`
3. enforce preconditions from the current `StateNode`
4. dispatch the `EventSignature`
5. observe `StateTransition` effects
6. record provenance-rich receipts

This preserves readability without allowing behavioral logic to fragment across many special-case helper implementations.

## Agent Workbench

The agent workbench is the operational counterpart to interface intelligence.

It standardizes how operators and agent hosts interact with the system through:

- provider-agnostic session adapters
- durable intervention/session ledgers
- review and intervention surfaces
- replay surfaces
- benchmark and evaluation actions

The flagship workbench host may be GitHub Copilot in VS Code, but Copilot is an adapter target, not the domain model.

Agent hosts must map onto the same typed event vocabulary, including:

- orientation
- artifact inspection
- discovery request
- observation recorded
- spec fragment proposed
- proposal approved
- proposal rejected
- rerun requested
- execution reviewed
- benchmark action
- replay action

An operator talking to an agent is not outside the system. That conversation is one more typed workbench workflow against shared truth.

## Recursive Improvement and Ratchet

Tesseract must improve without blurring governance.

Immediate derived updates are allowed for:

- selector health
- selector drift observations
- observed state transitions
- intervention and session artifacts
- replay examples
- decomposition, repair, and workflow corpora
- benchmark and evaluation surfaces

Proposal review is still required for:

- new canonical targets
- changed semantic meaning of an existing target
- promoted shared patterns
- approved screen knowledge edits
- snapshot template changes
- surface model changes that alter approved truth

The generative learning runtimes land in fixed order:

1. `decomposition`
2. `repair-recovery`
3. `workflow`

All learning outputs must remain traceable back to target refs, state transitions, event signatures, and emitted flows.

## Scale and Change Detection

The architecture must support 2000 or more ADO scenarios without collapsing into duplicated selector logic or repeated DOM rediscovery.

The scale strategy is:

- one shared interface model
- many scenario projections
- bounded incremental recomputation by affected graph fingerprints
- selector and state knowledge reused across scenarios
- discovery focused only on impacted or thin-knowledge surfaces

The system should measure:

- interface graph drift
- selector degradation
- state transition churn
- scenario decomposition instability
- knowledge bottlenecks by route, surface, and widget family
- coverage of baseline harvest versus scenario-driven deepening

A new screen, control, or state should become available to future scenarios by entering the shared model once, not by relying on repo lore or duplicative scenario-local patches.

## Transitional Mapping to the Current Repo

The current repo already contains several surfaces that map cleanly into this doctrine.

| Current surface | Role in the new doctrine |
|---|---|
| `knowledge/screens/*.elements.yaml`, `*.postures.yaml`, `*.hints.yaml` | canonical target and state knowledge inputs |
| `knowledge/patterns/*.yaml` | canonical promoted shared knowledge |
| `.tesseract/interface/index.json` | derived `ApplicationInterfaceGraph` |
| `.tesseract/interface/selectors.json` | derived `SelectorCanon` |
| `.tesseract/tasks/{ado_id}.resolution.json` | scenario-scoped interpretation surface projection |
| `generated/{suite}/{ado_id}.spec.ts` | readable Playwright projection |
| `generated/{suite}/{ado_id}.trace.json` | machine-readable provenance projection |
| `generated/{suite}/{ado_id}.review.md` | QA-facing explanation layer |
| `.tesseract/runs/{ado_id}/{run_id}/run.json` | execution and interpretation receipt ledger |
| `.tesseract/sessions/{sessionId}/` | `InterventionLedger` projection |
| `.tesseract/benchmarks/improvement-ledger.json` | append-only `ImprovementRun` ledger |
| `.tesseract/learning/manifest.json` | improvement corpora manifest |

Transitional code names are acceptable for implementation continuity, but new design work should target the contracts in this document.

## Phased Program

The rollout order is fixed.

### Phase 0: Doctrine

- publish this architecture as the north star
- align README, vision, direction, and agent onboarding surfaces
- mark transitional implementation names explicitly

### Phase 1: Interface Graph and Selector Canon

- make `ApplicationInterfaceGraph` and `SelectorCanon` deterministic and law-tested
- formalize baseline harvest and recursive discovery receipts
- eliminate selector duplication across scenario, spec, and run surfaces

### Phase 2: State and Event Modeling

- introduce `StateNode`, `StateTransitionGraph`, and `EventSignature`
- model reveal, enablement, validation, modal, and route transitions once
- reuse them across many scenarios

### Phase 3: Scenario Decomposition

- lower ADO cases into `ScenarioDecomposition`
- bind to graph refs, selector refs, and state transitions explicitly
- prove replayable grounded flow output

### Phase 4: Readable Emission

- emit QA-grade Playwright from `GroundedSpecFlow`
- keep all behavior routed through one canonical event runtime
- prove parity between readable emission and machine truth

### Phase 5: Agent Workbench

- standardize the intervention/session ledger
- support provider-agnostic adapters with Copilot as a flagship conformance target
- unify review, rerun, replay, and intervention workflows

### Phase 6: Improvement and Evaluation

- emit replay and training corpora from real provenance
- evaluate decomposition, repair, and workflow runtimes
- use DSPy, GEPA, and related tooling only in the offline optimization lane

### Phase 7: Scale Operations

- support 2000+ scenarios through incremental recomputation
- surface change detection, knowledge bottlenecks, and degradation hotspots
- ratchet the shared model without weakening governance

## Acceptance Criteria

This architecture is only complete if it makes the following true:

- an implementer cannot duplicate selectors across scenarios, emitted tests, and receipts without clearly violating the documented model
- a dynamic UI dependency is represented once and reused across many scenarios
- a newly discovered screen, control, or state becomes available to future scenarios through the shared model without hidden repo lore
- 2000+ ADO scenarios can compile against one shared interface model with bounded incremental recomputation
- emitted tests remain human-readable while all execution routes through one canonical runtime event interface
- baseline app harvest, state transition modeling, grounded decomposition, readable emission parity, session parity across hosts, and replay quality at scale each have explicit proof points

If any new workflow cannot explain itself through the interpretation surface and the existing review artifacts, it is under-modeled.
