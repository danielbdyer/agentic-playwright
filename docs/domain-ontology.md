# Tesseract Domain Ontology

This document is the North Star reference for the domain primitives, core commitments, invariants, and architecture seams of the Tesseract system. It exists so that any agent or human contributor can understand what the system is, what it cares about, and where the boundaries are — without relying on institutional memory or scattered documentation.

For the product model, read `VISION.md`. For operational use, read `README.md`. For authoring guidance, read `docs/authoring.md`. For the proposed evolution of the parsing edge, read `docs/adr-collapse-deterministic-parsing.md`.

## What Tesseract is

Tesseract is a compiler from human verification intent to executable verification, backed by a living knowledge system that grows through use.

The source program is the Azure DevOps manual test case. The emitted object code is Playwright. The durable value is the knowledge captured between those two surfaces.

The knowledge layer is not scaffolding. It is the product.

## The fundamental domain primitives

These are the nouns of the system. Every concept in Tesseract is either one of these primitives, a relationship between them, or a derivation from them.

### Screen

A screen is a distinct interactive context in the application under test. It has a URL, a structural decomposition (surfaces), and a catalog of interactive elements.

Identity: `ScreenId` (branded string)
Canonical home: `knowledge/surfaces/{screen}.surface.yaml` and `knowledge/screens/{screen}.elements.yaml`

A screen is not a page. It is a semantic boundary. A single browser page may contain multiple screens (tabs, modals, embedded contexts). A screen is identified by what the user can interact with at that moment, not by a URL alone.

### Surface

A surface is a spatial region within a screen that groups related elements and supports specific assertion kinds. Surfaces form a hierarchical tree: a screen root contains forms, action clusters, result sets, and validation regions.

Identity: `SurfaceId` (branded string)
Kinds: `screen-root`, `form`, `action-cluster`, `validation-region`, `result-set`, `details-pane`, `modal`, `section-root`
Canonical home: `knowledge/surfaces/{screen}.surface.yaml`

Surfaces answer the question: "Where in the screen does this happen?" They are the spatial grammar of the application.

### Element

An element is a discrete interactive unit within a surface. It has an ARIA role, a name, a locator ladder for finding it in the DOM, a widget type that determines its behavioral contract, and a surface membership that locates it in the spatial hierarchy.

Identity: `ElementId` (branded string)
Canonical home: `knowledge/screens/{screen}.elements.yaml`

Elements are the nouns of interaction. Every action in a test step targets an element (or a screen, in the case of navigation). The locator ladder centralizes selector knowledge so that a single change propagates to every scenario that references the element.

### Posture

A posture is a named behavioral disposition applied to an element. It describes not what value to enter, but what kind of value: valid, invalid, empty, boundary. Each posture carries sample values and effect chains that describe what the application does in response.

Identity: `PostureId` (branded string)
Canonical home: `knowledge/screens/{screen}.postures.yaml`

Postures are the breakthrough primitive. They turn negative testing from bespoke handwritten scripts into data transformations over approved behavioral knowledge. A posture contract authored once serves every scenario that applies the same disposition to the same field.

Effects describe consequences:
- `validation-error`, `required-error` — the application rejects the input
- `disabled`, `enabled` — element state changes
- `visible`, `hidden` — element visibility changes

Effects target either `self`, another element, or a surface.

### Hint

A hint is a screen-local supplement that helps map human language to known concepts without changing the structural knowledge of the application. Hints carry aliases, default value references, parameter cues, snapshot aliases, and affordance annotations.

Canonical home: `knowledge/screens/{screen}.hints.yaml`

Hints are the disambiguation layer. They live close to the screen they serve and are the first place to encode a novel mapping between human phrasing and a known element, posture, or snapshot.

### Pattern

A pattern is a promoted cross-screen abstraction. It carries shared action alias sets and posture alias sets that have proven durable across multiple screens. Patterns are the result of deliberate generalization, not premature abstraction.

Canonical home: `knowledge/patterns/*.yaml`

Promotion rule: prove value locally in hints first. Promote only after repetition or intentional standardization.

### Snapshot

A snapshot is an ARIA tree template that captures the expected structural state of a surface region. It is used for structural assertions: not "does this text match?" but "does the DOM structure match the approved template?"

Identity: `SnapshotTemplateId` (branded string)
Canonical home: `knowledge/snapshots/{screen}/*.yaml`

### Scenario

A scenario is the canonical representation of one ADO manual test case, lowered into structured IR. It preserves the original intent wording and adds resolved action, screen, element, posture, override, and snapshot references where the compiler can derive them.

Canonical home: `scenarios/{suite}/{ado_id}.scenario.yaml`

A scenario is not a test. It is a program in the verification language. The generated Playwright spec is object code — disposable and re-derivable.

### Step

A step is one instruction within a scenario. It carries the original intent text plus structured fields for action, screen, element, posture, override value, and snapshot template. Steps are the atomic unit of binding and provenance tracking.

Actions: `navigate`, `input`, `click`, `assert-snapshot`, `custom`

### Evidence

Evidence is a record of what an agent observed, discovered, or attempted during execution. It supports proposed canonical changes by grounding them in observed facts rather than speculation.

Canonical home: `.tesseract/evidence/`

### Widget

A widget is a behavioral contract for a class of interactive elements. It defines what actions are supported (click, fill, clear, get-value), what preconditions are required (visible, enabled, editable), and what effects each action produces.

Identity: `WidgetId` (branded string)
Canonical home: `lib/domain/widgets/contracts.ts`

Widgets bridge the structural domain (what an element is) and the behavioral domain (what you can do with it).

## Core commitments

These are the invariants that any change to the system must preserve. They are not aspirational — they are load-bearing.

### 1. Approved artifacts are the source of truth

The knowledge layer is canonical. Generated specs, bound scenarios, graph projections, and type files are derived artifacts — disposable projections of canonical inputs. Hand-editing derived outputs is always wrong.

### 2. Deterministic derivations are auto-approved

If a step binds from already-approved artifacts through deterministic rules, it is emitted with `confidence: compiler-derived` and `governance: approved`. No human in the loop for deterministic work. Human review is reserved for durable facts that will shape future derivations.

### 3. The knowledge layer is an API surface

The knowledge layer is not passive storage. It is a queryable interface that agents and the compiler call. Its coverage, specificity, and accuracy directly determine the cost and reliability of every downstream operation. Improving the knowledge layer is the highest-leverage activity in the system.

### 4. Provenance is part of correctness

Every derived artifact must explain where it came from: what knowledge was used, what rules fired, what was deterministic, what was supplemented by hints or patterns, what is still unresolved. If an output cannot explain itself, the model is incomplete.

### 5. One change propagates to many scenarios

Selectors live in element signatures, not in test files. Postures live in posture contracts, not in assertions. Surface structure lives in surface graphs, not in page objects. When the DOM changes, one canonical edit should fix every affected scenario.

### 6. The 50th test costs less than the 1st

The system should exhibit decreasing marginal cost. Each new test scenario benefits from the knowledge accumulated by all previous scenarios. If the 50th test requires as much manual curation as the 1st, the knowledge layer is failing.

### 7. Bottleneck visibility is a feature

The system should make it obvious where it still needs help: missing screen knowledge, missing hints, missing patterns, missing snapshots, unmodeled widget affordances, review-required proposals. This is product-level observability, not error reporting.

### 8. The codebase communicates its own ontology

The structure, naming, types, and file paths of the codebase are themselves a communication surface for future agents and contributors. Domain primitives should be transparent in the code. An agent should be able to read the types and understand what the system cares about. File paths should encode the knowledge hierarchy. The codebase should make the valuable action the obvious action.

## The confidence and governance model

These two dimensions are orthogonal and must not be conflated.

**Confidence** describes how a binding was produced:
- `compiler-derived` — deterministic derivation from approved artifacts
- `human` — explicit human authoring
- `agent-verified` — agent confirmed against live DOM
- `agent-proposed` — agent proposed, not yet verified
- `unbound` — not resolved

**Governance** describes whether a binding is executable:
- `approved` — deterministic or already-approved, execute normally
- `review-required` — depends on unapproved knowledge, needs human review
- `blocked` — do not execute

A step can be `compiler-derived` and `approved` (the common case for well-known screens). It can be `agent-proposed` and `review-required` (the common case for novel interactions). It cannot be `unbound` and `approved`.

## The deterministic precedence order

When resolving a step, the system tries sources in this order:

1. **Explicit scenario fields** — already-bound steps override everything
2. **Screen hints** — local supplemental knowledge for this screen
3. **Shared patterns** — promoted cross-screen abstractions
4. **Deterministic heuristics** — humanized identifiers, carry-forward from previous screen
5. **Unbound** — no resolution available

This order is part of the product semantics. Changing it changes compiler behavior. It is tested and enforced.

## The supplement hierarchy

Knowledge flows from specific to general:

1. **Screen-local hints** (`knowledge/screens/{screen}.hints.yaml`) — first discovery, most specific
2. **Promoted shared patterns** (`knowledge/patterns/*.yaml`) — proven generalizations

Promotion rule: local first, shared second. A hint stays local until repetition or deliberate standardization justifies promotion. This keeps the knowledge base grounded instead of turning it into abstract prompt lore.

## Architecture seams

The codebase is organized into four layers with strict dependency rules.

### Domain (`lib/domain/`)

Pure value objects, validation, inference rules, graph derivation, AST-backed codegen. No side effects. No external dependencies. The domain layer is the computational core of the compiler.

Key modules:
- `types.ts` — all domain type definitions
- `identity.ts` — branded identity types
- `inference.ts` — step inference from knowledge (the module this ADR proposes to thin)
- `binding.ts` — step validation and binding
- `program.ts` — step program compilation (IR → AST)
- `grammar.ts` — capability derivation from widget contracts
- `hash.ts` — text normalization and content hashing
- `provenance.ts` — provenance kind derivation
- `posture-contract.ts` — posture validation
- `effect-target.ts` — effect target resolution
- `derived-graph.ts` — graph construction
- `knowledge/` — knowledge loading and merging (patterns, screen bundles)
- `widgets/contracts.ts` — widget capability contracts

**Invariant**: Domain does not depend on application, infrastructure, or runtime.

### Application (`lib/application/`)

Effect-based orchestration and port composition. Owns the workflow: sync → parse → bind → emit → graph → types. Coordinates domain operations and infrastructure ports.

Key modules:
- `parse.ts` — ADO snapshot → scenario IR
- `inference.ts` — knowledge catalog loading for inference
- `bind.ts` — scenario → bound scenario orchestration
- `emit.ts` — bound scenario → generated spec/trace/review

**Invariant**: Application depends on domain and application-local support only.

### Runtime (`lib/runtime/`)

Locator resolution, widget interaction, execution interpreters. This is where programs meet the browser. The runtime resolves locator ladders against the live DOM, executes widget actions, and captures execution outcomes.

**Invariant**: Runtime does not depend on application or infrastructure orchestration.

### Infrastructure (`lib/infrastructure/`)

Filesystem, ADO adapter, reporting adapters. Ports and adapters for external systems.

**Invariant**: Infrastructure implements ports defined by application. It does not leak into domain or runtime.

### Widget choreography (`knowledge/components/*.ts`)

Procedural widget interpreters for specific widget families. This is the only place where genuinely procedural interaction logic belongs. Everything else should be declarative knowledge.

## The knowledge-as-API contract

The knowledge layer serves three consumers:

### 1. The compiler

The compiler reads knowledge at build time to produce bound scenarios, programs, and generated specs. It uses knowledge deterministically: same inputs, same outputs.

### 2. The runtime agent

The agent reads knowledge at execution time as a first resort before exploring the live DOM. The knowledge layer is persistent memory that makes the agent's first move cheap and grounded. The agent should prefer knowledge reads over DOM exploration whenever possible.

### 3. Future agent sessions

The knowledge layer accumulates value across sessions. An agent that authored a hint in session 1 saves every agent in sessions 2 through N the cost of rediscovering that mapping. The knowledge layer is a shared memory that compounds.

## The agentic flywheel

The system's long-term value depends on a virtuous cycle:

1. **Agent reads knowledge** — cheap, token-efficient, local-first
2. **Agent executes with knowledge as priors** — constrained, grounded, faster
3. **Agent encounters gaps** — knowledge is incomplete or stale
4. **Agent explores live DOM** — expensive but self-correcting
5. **Agent proposes knowledge additions** — new hint, element, pattern, posture
6. **Review gates the proposal** — governance ensures quality
7. **Knowledge layer improves** — next session is cheaper
8. **Agent assesses its own experience** — measures cost, coverage, legibility
9. **Agent proposes codebase improvements** — adjusts directives, knowledge structure, abstractions
10. **The 50th test costs less than the 1st** — the flywheel compounds

The agent is not just a consumer of the codebase. It is a steward. Its responsibility extends beyond executing tests to noticing where the knowledge layer is thin, where the domain primitives are opaque, where the codebase could better communicate its own ontology to future agents.

## The graph as provenance backbone

The dependency graph (`DerivedGraph`) connects every concept to its sources and consumers:

Node kinds: `snapshot`, `screen`, `screen-hints`, `pattern`, `section`, `surface`, `element`, `posture`, `capability`, `scenario`, `step`, `generated-spec`, `generated-trace`, `generated-review`, `evidence`, `policy-decision`

Edge kinds: `derived-from`, `contains`, `references`, `uses`, `affects`, `asserts`, `emits`, `observed-by`, `proposed-change-for`, `governs`

The graph answers: What depends on what? What would break if this changed? What knowledge was used to derive this step? What evidence supports this proposal? What policy decision governs this change?

Graph IDs encode the hierarchy: `element:policy-search:policyNumberInput`, `step:10001:2`, `posture:policy-search:policyNumberInput:valid`. An agent can parse the ID to understand the entity without querying the graph.

## The trust policy boundary

Trust policy governs proposed canonical changes:
- **Elements** — new or changed element signatures
- **Postures** — new or changed behavior partitions
- **Hints** — new or changed screen-local supplements
- **Patterns** — new or changed promoted abstractions
- **Surfaces** — new or changed structural decompositions
- **Snapshots** — new or changed ARIA templates

Trust policy does not block compiler output derived from already-approved artifacts. The boundary is clear: deterministic derivation flows freely; proposed canonical changes are gated.

## What does not belong in this ontology

- **Prompt strategies** — these are optimization concerns, not domain primitives
- **Model-specific behavior** — the domain is model-agnostic
- **Runtime performance tuning** — belongs in the offline evaluation lane
- **UI/UX of tooling** — belongs in CLI and reporting, not in the domain model
- **Third-party framework internals** — Playwright, Effect, etc. are infrastructure, not domain

## How to use this document

- **When adding a new concept**: Check whether it is a new primitive, a relationship between existing primitives, or a derivation. If it is none of these, it may not belong in the domain layer.
- **When changing existing behavior**: Verify that the core commitments are preserved. If a change violates an invariant, either the change is wrong or the invariant needs explicit revision with a new ADR.
- **When orienting in the codebase**: Use this document as a map. The domain primitives correspond to branded types in `lib/domain/identity.ts` and `lib/domain/types.ts`. The architecture seams correspond to directory boundaries. The knowledge hierarchy corresponds to the `knowledge/` file structure.
- **When proposing knowledge additions**: Follow the supplement hierarchy. Local hints first, promoted patterns second. Evidence before proposals. Review before execution.
- **When assessing codebase quality**: Ask whether the domain primitives are transparent in the code, whether the knowledge layer is queryable and well-covered, and whether the review surfaces explain every decision. If any of these are lacking, that is the highest-leverage improvement.
