# Tesseract Domain Ontology

This document is the reference for Tesseract's domain primitives, invariants, and architecture seams. It exists so a human or agent can understand what the system is optimizing and where each concern belongs without relying on repo lore.

For the product model, read `VISION.md`. For operational use, read `README.md`. For authoring guidance, read `docs/authoring.md`.

## What Tesseract is

Tesseract is a compiler from human verification intent to executable verification, backed by a living knowledge system that grows through use.

The source program is the Azure DevOps manual test case. The emitted object code is Playwright. The durable asset is the reviewed knowledge plus the typed handshakes that explain how intent was resolved.

The system exposes six public lanes:

1. `intent`
2. `knowledge`
3. `control`
4. `resolution`
5. `execution`
6. `governance/projection`

The most important internal ladder sits inside `resolution`:

1. deterministic substrate
2. approved-equivalent confidence overlays
3. structured translation
4. runtime agentic DOM resolution
5. `needs-human`

## Fundamental primitives

### Screen

A screen is a distinct interactive context in the application under test. It has a URL, a structural decomposition, and a catalog of interactive elements.

Identity: `ScreenId`
Canonical home: `knowledge/surfaces/{screen}.surface.yaml` and `knowledge/screens/{screen}.elements.yaml`

### Surface

A surface is a spatial region within a screen that groups related elements and supports specific assertion kinds.

Identity: `SurfaceId`
Canonical home: `knowledge/surfaces/{screen}.surface.yaml`

### Element

An element is a discrete interactive unit within a surface. It has an ARIA role, a name, a locator ladder, a widget type, and a surface membership.

Identity: `ElementId`
Canonical home: `knowledge/screens/{screen}.elements.yaml`

### Posture

A posture is a named behavioral disposition applied to an element. It describes the kind of value or condition to exercise, such as `valid`, `invalid`, `empty`, or `boundary`.

Identity: `PostureId`
Canonical home: `knowledge/screens/{screen}.postures.yaml`

### Hint

A hint is a screen-local supplement that maps human phrasing to known concepts without changing structural truth.

Canonical home: `knowledge/screens/{screen}.hints.yaml`

### Pattern

A pattern is a promoted cross-screen abstraction that carries reusable aliases or interaction semantics proven locally first.

Canonical home: `knowledge/patterns/*.yaml`

### Snapshot

A snapshot is an ARIA tree template for structural assertions.

Identity: `SnapshotTemplateId`
Canonical home: `knowledge/snapshots/{screen}/*.yaml`

### Scenario

A scenario is the canonical representation of one ADO manual test case lowered into structured IR.

Canonical home: `scenarios/{suite}/{ado_id}.scenario.yaml`

### Step

A step is one instruction within a scenario. It carries the original intent text plus structured action, screen, element, posture, override, and snapshot fields where available.

Actions: `navigate`, `input`, `click`, `assert-snapshot`, `custom`

### Evidence

Evidence is a record of what the runtime observed, attempted, or proposed during execution.

Canonical home: `.tesseract/evidence/`

### Widget contract

A widget contract is the behavioral contract for a class of interactive elements. It defines supported actions, required preconditions, and expected outcomes.

Canonical home: `lib/domain/widgets/contracts.ts`

### Confidence overlay

A confidence overlay is derived working knowledge built from run receipts and evidence. It records score, threshold state, lineage, and the learned aliases or targets that may participate as `approved-equivalent`.

Derived home: `.tesseract/confidence/index.json`

### Translation receipt

A translation receipt is the typed record of the structured translation stage. It captures the request, the ontology candidates considered, the winning candidate if any, and the rationale for the result.

Derived home: runtime interpretation and run receipts

## Core commitments

### 1. Approved artifacts are the source of truth

Canonical knowledge is authoritative. Generated specs, bound scenarios, run receipts, graphs, confidence overlays, and scorecards are derived projections.

### 2. Deterministic derivations are auto-approved

If a step binds from already approved artifacts through deterministic rules, it is emitted with `confidence: compiler-derived` and `governance: approved`.

### 3. Confidence is not governance

Confidence describes how strongly the system believes a working path will keep working. Governance describes whether a path is allowed to execute. Confidence overlays can become `approved-equivalent` without rewriting canon. They do not replace trust-policy review for destructive canonical changes.

### 4. Provenance is part of correctness

Every derived artifact must explain what inputs it used, which stage won, and what was exhausted before the winning path was chosen.

### 5. One change should propagate to many scenarios

Selectors live in element signatures. Postures live in posture contracts. Widget behavior lives in widget contracts. When the product changes, one durable edit should repair many scenarios.

### 6. The 50th test should cost less than the 1st

Each run should either execute cheaply from approved knowledge or leave behind evidence, overlays, or proposals that make future runs cheaper.

### 7. Bottleneck visibility is a feature

Thin knowledge, degraded locators, translation dependence, agentic fallback, and review-required proposals should all be visible in workflow, review, graph, inbox, and scorecard outputs.

### 8. The codebase should communicate its ontology

File paths, type names, and package boundaries are part of the product. The obvious path in the codebase should also be the correct conceptual path.

## Confidence, equivalence, and governance

These dimensions are related but distinct.

**Confidence** describes how a binding was produced:

- `compiler-derived`
- `human`
- `agent-verified`
- `agent-proposed`
- `unbound`

**Approval equivalence** describes whether derived working knowledge has crossed threshold:

- `learning`
- `approved-equivalent`
- `needs-review`

**Governance** describes whether a path is executable:

- `approved`
- `review-required`
- `blocked`

An overlay can be `approved-equivalent` and still remain derived working knowledge rather than canon. A proposal can be `review-required` even when supported by strong evidence.

## Resolution precedence

When resolving a step, the system uses this precedence order:

1. explicit scenario fields
2. resolution controls
3. approved knowledge priors from screens, hints, patterns, and deterministic heuristics
4. approved-equivalent confidence overlays
5. structured translation over typed ontology candidates
6. runtime agentic DOM resolution
7. `needs-human`

Prior evidence is input to overlays, translation, and the runtime agent. It is not a separate winning source.

This order is part of the product semantics. Changing it changes behavior and requires updated law tests.

## Supplement hierarchy

Knowledge flows from specific to general:

1. screen-local hints in `knowledge/screens/{screen}.hints.yaml`
2. promoted shared patterns in `knowledge/patterns/*.yaml`

Promotion rule:

- land local first
- promote only after repetition or deliberate generalization

## Architecture seams

### Domain

`lib/domain/` owns pure values, validation, deterministic inference, widget contracts, graph derivation, and AST-backed code generation.

Invariant:

- domain does not depend on application, infrastructure, or runtime

### Application

`lib/application/` owns orchestration, catalog loading, translation, confidence projection, planning, and reporting.

Invariant:

- application depends on domain and application-local support only

### Runtime

`lib/runtime/` owns locator resolution, widget execution, runtime interpretation, and typed execution receipts.

Invariant:

- runtime does not depend on application or infrastructure orchestration

### Infrastructure

`lib/infrastructure/` owns filesystem, external adapters, and runtime environment plumbing.

Invariant:

- infrastructure implements application ports and does not leak into domain semantics

## Knowledge as an API

The knowledge layer serves four consumers:

1. the deterministic compiler
2. the structured translation bridge
3. the runtime agent
4. future operator and agent sessions through persisted canon, evidence, and overlays

The same knowledge should be queryable by all four surfaces through typed seams.

## Graph as provenance backbone

The dependency graph connects canonical knowledge, derived projections, evidence, and confidence overlays.

Representative node kinds:

- `screen`
- `surface`
- `element`
- `posture`
- `scenario`
- `step`
- `evidence`
- `confidence-overlay`
- `generated-spec`
- `generated-trace`
- `generated-review`

Representative edge kinds:

- `derived-from`
- `references`
- `uses`
- `observed-by`
- `proposed-change-for`
- `governs`
- `learns-from`

The graph answers:

- what depends on this artifact
- which evidence taught this overlay
- which scenarios or runbooks a proposal or overlay should rerun
- whether a green run came from durable knowledge or a fallback path

## Trust policy boundary

Trust policy governs proposed canonical changes to elements, postures, hints, patterns, surfaces, and snapshots.

Trust policy does not block:

- deterministic output derived from approved artifacts
- approved-equivalent overlay growth inside threshold policy

## The Three Dragons

The system has three co-equal architectural concerns (the "three dragons") that cut across all six lanes:

1. **Interface Intelligence** (the Noun Engine) — models what the UI *is*: routes, screens, surfaces, targets, selectors, states, transitions, affordances. Its aggregate is `ApplicationInterfaceGraph`. Lives primarily in `lib/domain/types/interface.ts` and `lib/application/interface-intelligence.ts`.

2. **Agent Workbench** (the Verb Engine) — models what agents *do*: discover, resolve, execute, observe, propose, approve, replay, learn. Its aggregate is `RunRecord`. Lives primarily in `lib/domain/types/execution.ts` and `lib/runtime/agent/`.

3. **Recursive Self-Improvement** (the Meta Engine) — models how the system *improves itself*: the dogfood loop, fitness classification, knob search, Pareto frontier tracking, convergence detection. Its aggregate is `DogfoodLedger`. Lives primarily in `lib/application/dogfood.ts`, `lib/application/fitness.ts`, and `lib/domain/types/fitness.ts`.

## Concepts added by the domain audit

- **Dragon** — one of three co-equal architectural concerns (see above)
- **Fitness Report** — the "gradient" of the self-improving loop; classifies step-level resolution outcomes into failure modes that map to tunable parameters
- **Knob Search** — the "backward pass" of the self-improving loop; maps failure classes to tunable parameters and generates candidate `PipelineConfig` perturbations
- **Pareto Frontier** — the multi-objective acceptance surface; a candidate config is accepted iff it is not dominated by any point already on the frontier
- **Agent Participant** — an external agent (AI, CI, operator) modeled as a first-class session participant with typed capabilities and interactive callbacks
- **GraphAccumulator** — the immutable value object pattern for building `DerivedGraph` from pure phase functions composed via sequential fold
- **Pipeline Config Validation** — pure function `validatePipelineConfig` that enforces weight-sum ~1.0, scalar bounds, and well-formedness invariants on the hyper-parameter space

## Out of scope for the ontology

- prompt strategies
- model-specific behavior
- UI chrome for tools
- third-party framework internals
- opaque runtime heuristics that cannot explain themselves through receipts

## How to use this document

- When adding a concept, decide whether it is canonical knowledge, derived working knowledge, runtime receipt, or projection.
- When changing behavior, verify that precedence, provenance, and governance remain explicit.
- When orienting in the codebase, map the concept to a lane first and then to the owning package.
- When proposing knowledge changes, follow the supplement hierarchy and keep evidence attached.
