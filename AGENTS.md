# Tesseract Agent Guide

This repository is not a generic automation project. It is a compiler with a growing domain model. Agents working here should optimize for semantic collapse, deterministic derivation, and architectural clarity over local convenience.

The purpose of this guide is not trivia. It exists to preserve the reasons behind the architecture so that future changes continue to improve:

- performance
- scalability
- observability
- correctness
- testability
- maintainability
- agent usability

## Core posture

- Treat approved artifacts as the source of truth.
- Treat generated code, derived graphs, and generated types as projections.
- Prefer deriving new representations from canonical inputs over authoring parallel truths.
- Protect domain primitives as autonomous objects with explicit contracts.
- Assume that a raw `string` standing in for a domain concept is a smell unless the boundary is truly textual.

- Treat CLI args, YAML, JSON, env vars, and generated source text as ingress or egress boundaries; convert them into branded identities or structured values immediately after validation.

## Canonical truths

The approved inputs are:

- `.ado-sync`
- `scenarios`
- `knowledge/surfaces`
- `knowledge/screens`
- `knowledge/snapshots`
- `.tesseract/evidence`

Derived outputs are:

- `.tesseract/bound`
- `.tesseract/graph`
- `lib/generated`
- `generated`

Agents should not hand-edit derived artifacts unless the task is explicitly about code generation internals.

## Architectural north star

Tesseract is organized around laminar grammars:

1. `ADO snapshot -> scenario IR`
2. `ARIA baseline -> SurfaceGraph`
3. `SurfaceGraph + element signatures + postures -> capabilities / effects`
4. `Bound scenario -> generated spec`
5. `Approved artifacts -> derived dependency/provenance graph`

Each stage should reduce entropy. When introducing a new abstraction, ask whether it collapses a messier surface into a smaller approved grammar.

## Why this architecture exists

The architecture is shaped by a few practical constraints:

- OutSystems DOM is volatile and hostile to brittle automation.
- ADO manual tests are human-authored and must remain traceable.
- Agents are useful, but only if their operating surface is narrow and reviewable.
- Generated tests should be disposable object code, not another hand-maintained truth store.

This leads to a few deliberate design choices:

- canonical artifacts are small and reviewable
- derivations are deterministic and reproducible
- domain logic is pushed into pure modules
- infrastructure is kept replaceable
- provenance is carried forward as a first-class concern

The result should be a system that is easier to inspect, easier to regenerate, easier to repair, and easier to trust.

## First-class primitives

These are emerging as protected domain citizens and should be extended carefully:

- `RefPath`
- `SurfaceGraph`
- `StepProgram`
- `ValueRef`
- `DerivedCapability`
- `DerivedGraph`
- AST-backed code generation modules

When a change touches one of these, prefer:

- smart constructors over free-form object literals
- exhaustive pattern matching over fallback branching
- total validation at ingress
- law-style unit tests for round-trips, determinism, and invariants

## Programming style

Preferred style in this repository:

- write small pure functions that transform one well-typed value into another
- make invalid states hard to represent
- separate algebra from interpretation
- favor composition over inheritance and convenience wrappers
- prefer explicit data flow over hidden mutation
- prefer total functions and exhaustive branching over fallback logic
- prefer value objects over protocol strings
- prefer explicit modules over “smart” utility grab-bags

The code should feel like a compiler and a knowledge system, not a pile of helpers.

### What this means in practice

- if a concept has structure, model it as data
- if a concept has rules, centralize them in a domain module
- if a concept has side effects, interpret it at the boundary
- if a transformation can be derived, do not store it manually
- if an output is parseable or executable, avoid building it with ad hoc string interpolation

## DDD stance

This repository benefits from Domain-Driven Design because the hard part is not browser automation. The hard part is the semantic model.

The domain is the product here:

- what a screen is
- what a surface is
- what an element is
- what a posture means
- what a scenario step can become
- what provenance and impact mean

DDD is useful because it forces us to preserve a ubiquitous language and explicit boundaries. The code should increasingly reflect bounded contexts such as:

- ADO sync and upstream truth
- scenario normalization and binding
- screen knowledge and surface decomposition
- runtime execution and interaction
- provenance, diagnostics, and graph projections
- code generation

When a concept starts to mean different things in different places, split the context instead of overloading one type.

## Clean Architecture stance

Use Clean Architecture here for one reason: it preserves autonomy of the domain.

The inner layers should not know:

- filesystem layout details
- CLI argument formats
- Playwright APIs
- Azure DevOps transport concerns
- reporter formatting
- MCP transport specifics

Why this matters:

- tests become fast and cheap
- interpreters become replaceable
- agent tooling can grow without infecting the domain
- side effects stay observable and constrained
- new runtime surfaces can be added without rewriting core logic

Current enforced rules:

- `lib/domain` must not depend on application, infrastructure, or runtime
- `lib/application` must depend on domain and application-local support modules, not infrastructure or runtime
- `lib/runtime` must not depend on application or infrastructure orchestration

When adding new modules, preserve or strengthen these boundaries. Prefer moving toward:

- `lib/domain`
- `lib/application`
- `lib/infrastructure`

without doing a cosmetic directory rewrite before the boundaries are real.

## Effect-TS stance

Use Effect because it gives us explicit control over three things that matter here:

- effects
- dependencies
- failure

That is not aesthetic preference. It directly improves:

- composability of compiler stages
- typed dependency injection for ports and services
- explicit error channels instead of ambient exceptions
- structured concurrency and resource safety
- traceability of multi-stage workflows
- testability of orchestration logic without mocking everything globally

Use Effect where the code is orchestrating work, acquiring resources, sequencing side effects, or composing failure-aware programs.

Do not use Effect to obscure straightforward pure code. Pure domain logic should stay plain TypeScript functions until effects are actually needed.

### Effect guidelines

- keep `Effect.gen` in orchestration and interpreter layers
- keep domain modules mostly effect-free
- use typed service dependencies instead of hidden globals
- encode expected failure in the error channel where practical
- prefer explicit return values over logging as control flow
- prefer structured diagnostics over thrown strings

## Sagas and interpreters

The codebase is moving toward a higher-order execution model.

Preferred sequence:

1. define a small domain algebra
2. validate and normalize into that algebra
3. interpret it in one or more runtimes

This means future work should favor:

- `StepProgram` or similar instruction algebra
- Playwright interpreter
- pure dry-run / trace interpreter
- diagnostic interpreter
- eventually compensating or rollback-aware workflows where needed

Why this matters:

- one semantic program can be executed multiple ways
- orchestration becomes inspectable and testable
- side effects can be traced or simulated before they are run
- retry/rollback logic can live above raw browser or filesystem code
- agent tooling can reason about intent rather than raw imperative steps

Do not jump directly to generator-heavy runtime code unless the domain algebra is already clean enough to justify it.

## Strong preferences

- Prefer pure domain functions in `lib/domain`.
- Prefer Effect-based orchestration in application services.
- Prefer interpreters over inline side-effect choreography.
- Prefer typed value objects over protocol strings.
- Prefer TypeScript AST construction over source-string splicing for generated code.
- Prefer explicit import boundaries over convenience imports.
- Prefer deterministic ordering, fingerprints, and stable serialization everywhere.

## Explicit anti-patterns

Avoid introducing:

- new magic strings for ids, paths, commands, or executable references
- ad hoc string interpolation for generated TypeScript or parseable surfaces
- domain logic inside filesystem, CLI, Playwright, or reporter adapters
- new parallel truth stores when an existing canonical artifact can be extended
- runtime dependence on legacy textual conventions when a structured value exists
- “utility” layers that quietly become a second domain without contracts
- hidden ambient state, singleton mutation, or convenience globals that bypass Effect services

## Unit-testability standard

Default to designing new code so that the important logic is testable without filesystem, browser, or network access.

Every new domain primitive should ideally have tests for:

- validation failure modes
- deterministic output
- round-trip behavior where applicable
- graph or lowering invariants
- contract-level behavior under edge cases

If a feature is hard to unit test, treat that as a design signal.

The desired layering is:

- domain laws tested without side effects
- application orchestration tested with in-memory or fake ports
- runtime interpreters tested at the boundary they actually own
- generated outputs tested for deterministic shape and behavior

## Observability and provenance

Provenance is not metadata garnish. It is part of correctness.

Every meaningful artifact should be traceable back to:

- source snapshot
- revision
- content hash
- scenario or knowledge path
- confidence and diagnostic context where relevant

Why this matters:

- failures become classifiable
- impacts become queryable
- drift becomes localized
- agent proposals become reviewable
- green runs can produce trustworthy structural observations

If a new workflow cannot explain where a fact came from, it is under-modeled.

## Performance and scalability philosophy

Performance in this system should come from semantic compression and determinism, not from clever caching alone.

Preferred path:

- small canonical files
- stable hashes and fingerprints
- incremental regeneration from provenance-aware dependencies
- narrow graph queries instead of global scans where possible
- AST-backed codegen instead of reparsing brittle source templates
- pure transforms that can be parallelized or memoized later without semantic risk

Scalability should come from explicit boundaries and representations, not from adding more helper layers.

## Agent workflow

When starting work, prefer these commands:

- `npm run refresh`
- `npm run paths`
- `npm run surface`
- `npm run graph`
- `npm run trace`
- `npm run impact`
- `npm run types`

An agent should be able to discover what changed, what is impacted, and what artifacts are canonical without relying on repo lore.

## Decision framework

When unsure how to implement something, ask these questions in order:

1. what is the canonical truth here?
2. what representation has the least entropy while preserving meaning?
3. should this be a value object, a pure derivation, or an interpreter?
4. can the invalid state be made unrepresentable?
5. can this be tested without side effects?
6. does this improve provenance, observability, and impact analysis?
7. does this reduce or increase stringly-typed protocol surfaces?

If a proposal fails most of these questions, it is probably the wrong layer or the wrong abstraction.

## Product vision

Tesseract exists to let QA teams on OutSystems projects work at the level they already work — writing manual test cases in Azure DevOps — and have those test cases automatically become executable Playwright specs.

### The bet

If a manual test case is well-written enough for a human QA to follow step by step, it is well-written enough for an agent to infer executable intent against. The ADO test case is not a loose suggestion; it is a structured document with steps, expected results, and implicit data requirements. Tesseract treats it as a source program.

### Single source of truth for selectors and data

Every selector, element identity, posture, fixture reference, and snapshot template lives in one canonical place under `knowledge/`. When a selector breaks in one test out of thirty, the fix happens in one element definition, the compiler regenerates all affected specs, and the regression is resolved everywhere at once.

This is the central scalability property. Without it, selector drift silently poisons test suites. With it, a single agent-driven repair cycle can:

1. Detect the selector failure in a test run.
2. Re-snapshot the affected screen section to capture the current DOM/ARIA state.
3. Propose a hardened selector in the element definition, optionally keeping the old selector as a fallback in a ladder strategy.
4. Regenerate all affected specs.
5. Rerun the impacted tests to confirm the regression is fixed.
6. Submit the knowledge update with evidence for trust policy review.

### QA readability contract

Generated specs must be transparent projections of the ADO test case. A QA reviewing a generated spec should be able to read it top to bottom and confirm:

- The ADO test case ID and revision are visible.
- Each step in the spec maps 1:1 to a step in the ADO case.
- Each step carries the semantic intent string from the ADO case (e.g., "Enter policy number in search field") as a visible label in the test body.
- The function calls within each step correspond to what the step semantically describes — navigating, entering data, clicking, asserting.

The generated spec is disposable object code. The QA's review target is the mapping fidelity between the ADO case and the spec's step sequence, not the implementation details of locators or runtime helpers.

### Agent interaction model

QAs interact with agents (GitHub Copilot, Claude, or similar) through the Tesseract CLI. The agent's operating surface is:

- `npm run refresh` to recompile everything from canonical inputs.
- `npm run surface` to inspect what the system knows about a screen.
- `npm run trace` to see what a scenario touches without executing it.
- `npm run impact` to understand what a knowledge change affects.
- `npm run capture` to re-snapshot a screen section from a live page.

The agent does not need to understand Playwright APIs, DOM structure, or test framework internals. It works at the level of screens, elements, postures, scenarios, and evidence. The compiler handles the translation to executable code.

### Escape hatches and persistent overrides

Not every ADO step maps cleanly to the deterministic grammar. An agent may encounter:

- An interaction pattern the knowledge layer has never seen (a combobox, date picker, multi-step modal).
- A DOM structure that does not fit the current surface decomposition.
- A step whose intent is clear but whose mechanical execution requires domain-specific logic.

The current `custom-escape-hatch` instruction kind marks these gaps. The interpreter classifies them as `semantic-gap`. But the design intent is that escape hatches should not remain as dead code in generated specs. Instead:

- The agent should encode the discovered pattern as a **persistent override** in the knowledge layer — not a hardcoded function, but a reusable pattern contract.
- Pattern contracts describe the interaction mechanics of a widget type (how to select from a combobox, how to navigate a date picker) in a way the compiler can bind against in future scenarios.
- When the same pattern appears in a different scenario, it resolves deterministically through the knowledge layer rather than requiring another escape hatch.
- The trust policy governs promotion of agent-proposed patterns, requiring evidence and review before they become approved knowledge.

This creates a ratchet: every escape hatch the agent encounters is an opportunity to extend the knowledge layer, reducing future escape hatches. The system gets more deterministic over time as pattern coverage grows.

### Locator strategy and fallback ladders

Element definitions should evolve to support a locator strategy rather than a single flat selector. The preferred approach:

1. **Primary**: `data-testid` (most stable in OutSystems apps where test IDs are explicitly added).
2. **Fallback**: ARIA role + accessible name (semantic, survives cosmetic refactors).
3. **Last resort**: CSS selector (fragile, but sometimes necessary for OutSystems-generated DOM).

When an agent hardens a selector, it proposes an updated strategy with the new primary and optionally retains the previous selector as a fallback rung. The runtime tries the ladder in order. The evidence record captures which rung succeeded, feeding back into confidence scoring.

### Trust policy and the governance boundary

Agents can propose freely. Promotion to approved knowledge requires evidence.

The trust policy (`.tesseract/policy/trust-policy.yaml`) enforces:

- Minimum confidence thresholds per artifact type.
- Required evidence kinds and counts (DOM snapshots, ARIA snapshots, runtime observations, assertion runs).
- Forbidden auto-heal classes (assertion mismatches, structural mismatches) that must always go through human review.

Policy decisions are graph nodes with full provenance. The system can always answer: "Why was this element definition approved? What evidence supported it? What policy version governed the decision?"

This is what makes the agent workflow safe at scale. The agent is a proposal engine. The trust policy is the review gate. The QA remains the approver for semantic changes.

## Near-term priorities

The next high-value structural changes are:

1. extend branded ids deeper into node and path-level value objects where it buys real safety
2. strengthen the execution algebra plus interpreters
3. further separation of application services from infrastructure adapters
4. more law-style tests around primitives and projections
5. surface intent strings as visible step labels in generated specs for QA readability
6. introduce locator strategy and fallback ladder support in element definitions
7. design the pattern contract schema for persistent escape-hatch overrides
8. build the agent-driven selector hardening workflow (detect → re-snapshot → propose → rerun → confirm)

## Editing guidance

- Preserve the “derive, do not duplicate” principle.
- If a change introduces a new representation, justify why it is canonical or why it is derived.
- If a raw string is introduced for a domain concept, look for a better value object.
- If generated code is being assembled by concatenating strings, stop and route it through the AST layer.
- If a side effect is mixed with domain transformation, split it.
- If a module is doing orchestration and domain mutation together, separate them.
- If a concept crosses multiple layers, name the boundary explicitly.

The repository should feel increasingly like a small compiler and knowledge system, not a collection of helper scripts.





