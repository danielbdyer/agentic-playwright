# Tesseract Engineering Guide

Full authorship guidance for working in this codebase. Read this before making structural changes.

For product vision, see `VISION.md`. For planned work, see `BACKLOG.md`.

## Core posture

- Treat approved artifacts as the source of truth.
- Treat generated code, derived graphs, and generated types as projections.
- Prefer deriving new representations from canonical inputs over authoring parallel truths.
- Protect domain primitives as autonomous objects with explicit contracts.
- Assume that a raw `string` standing in for a domain concept is a smell unless the boundary is truly textual.
- Treat CLI args, YAML, JSON, env vars, and generated source text as ingress or egress boundaries; convert them into branded identities or structured values immediately after validation.

## Canonical truths

Approved inputs:

| Directory | Contents |
|-----------|----------|
| `.ado-sync` | Azure DevOps snapshots |
| `scenarios` | Parsed test case scenarios |
| `knowledge/surfaces` | Screen decomposition |
| `knowledge/screens` | Element and posture definitions |
| `knowledge/snapshots` | ARIA snapshot templates |
| `.tesseract/evidence` | Evidence artifacts |
| `.tesseract/policy` | Trust policy configuration |

Derived outputs (regenerated, never hand-edited):

| Directory | Contents |
|-----------|----------|
| `.tesseract/bound` | Bound scenario artifacts |
| `.tesseract/graph` | Dependency/provenance graph |
| `lib/generated` | Generated type-safe knowledge APIs |
| `generated` | Generated Playwright specs |

## Architectural north star

Tesseract is organized around laminar grammars:

1. `ADO snapshot -> scenario IR`
2. `ARIA baseline -> SurfaceGraph`
3. `SurfaceGraph + element signatures + postures -> capabilities / effects`
4. `Bound scenario -> generated spec`
5. `Approved artifacts -> derived dependency/provenance graph`

Each stage should reduce entropy. When introducing a new abstraction, ask whether it collapses a messier surface into a smaller approved grammar.

## Why this architecture exists

The architecture is shaped by practical constraints:

- OutSystems DOM is volatile and hostile to brittle automation.
- ADO manual tests are human-authored and must remain traceable.
- Agents are useful, but only if their operating surface is narrow and reviewable.
- Generated tests should be disposable object code, not another hand-maintained truth store.

This leads to deliberate design choices:

- canonical artifacts are small and reviewable
- derivations are deterministic and reproducible
- domain logic is pushed into pure modules
- infrastructure is kept replaceable
- provenance is carried forward as a first-class concern

## First-class primitives

These are protected domain citizens and should be extended carefully:

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

- Write small pure functions that transform one well-typed value into another.
- Make invalid states hard to represent.
- Separate algebra from interpretation.
- Favor composition over inheritance and convenience wrappers.
- Prefer explicit data flow over hidden mutation.
- Prefer total functions and exhaustive branching over fallback logic.
- Prefer value objects over protocol strings.
- Prefer explicit modules over "smart" utility grab-bags.

### What this means in practice

- If a concept has structure, model it as data.
- If a concept has rules, centralize them in a domain module.
- If a concept has side effects, interpret it at the boundary.
- If a transformation can be derived, do not store it manually.
- If an output is parseable or executable, avoid building it with ad hoc string interpolation.

## DDD stance

The hard part is not browser automation. The hard part is the semantic model.

The domain is the product:

- what a screen is
- what a surface is
- what an element is
- what a posture means
- what a scenario step can become
- what provenance and impact mean

The code should reflect bounded contexts:

- ADO sync and upstream truth
- scenario normalization and binding
- screen knowledge and surface decomposition
- runtime execution and interaction
- provenance, diagnostics, and graph projections
- code generation

When a concept starts to mean different things in different places, split the context instead of overloading one type.

## Clean Architecture

Enforced layer rules:

- `lib/domain` must not depend on application, infrastructure, or runtime.
- `lib/application` must depend on domain and application-local modules only.
- `lib/runtime` must not depend on application or infrastructure orchestration.

The inner layers should not know about: filesystem layout, CLI args, Playwright APIs, ADO transport, reporter formatting, or MCP specifics.

Enforced by `tests/architecture.spec.ts`.

## Effect-TS

Use Effect for orchestration, dependency injection, and failure handling. Do not use it for pure domain logic.

- Keep `Effect.gen` in orchestration and interpreter layers.
- Keep domain modules effect-free.
- Use typed service dependencies instead of hidden globals.
- Encode expected failure in the error channel.
- Prefer structured diagnostics over thrown strings.

## Interpreters

Three execution modes share a common `StepProgram` algebra:

| Mode | Purpose | Side effects |
|------|---------|-------------|
| `playwright` | Live browser automation | Yes |
| `dry-run` | Static validation | No |
| `diagnostic` | Validation with semantic error classification | No |

One program, multiple interpretations. Define the algebra first, interpret it at the boundary.

## Anti-patterns

Avoid:

- magic strings for ids, paths, or commands
- string interpolation for generated TypeScript
- domain logic inside adapters (filesystem, CLI, Playwright, reporter)
- parallel truth stores when a canonical artifact can be extended
- "utility" layers that quietly become a second domain without contracts
- ambient state or globals that bypass Effect services

## Testability

Design so important logic is testable without filesystem, browser, or network.

- Domain laws tested without side effects.
- Application orchestration tested with in-memory or fake ports.
- Runtime interpreters tested at the boundary they own.
- Generated outputs tested for deterministic shape.

If a feature is hard to unit test, treat that as a design signal.

## Provenance

Every meaningful artifact must be traceable to: source snapshot, revision, content hash, scenario or knowledge path, confidence level.

If a new workflow cannot explain where a fact came from, it is under-modeled.

## Decision framework

When unsure how to implement something:

1. What is the canonical truth here?
2. What representation has the least entropy while preserving meaning?
3. Should this be a value object, a pure derivation, or an interpreter?
4. Can the invalid state be made unrepresentable?
5. Can this be tested without side effects?
6. Does this improve provenance, observability, and impact analysis?
7. Does this reduce or increase stringly-typed protocol surfaces?

## CLI commands

```
npm run refresh    # Full recompile from canonical inputs
npm run paths      # Show canonical artifact paths for a scenario
npm run surface    # Inspect approved screen structure
npm run graph      # Build and inspect dependency graph
npm run trace      # See what a scenario touches without executing
npm run impact     # Analyze what a knowledge change affects
npm run types      # Generate type-safe knowledge module
npm run capture    # Re-snapshot a screen section from a live page
npm run test       # Run all tests
```

## Editing guidance

- Preserve the "derive, do not duplicate" principle.
- If a change introduces a new representation, justify why it is canonical or derived.
- If generated code is being assembled by concatenating strings, route it through the AST layer.
- If a side effect is mixed with domain transformation, split it.
- If a concept crosses multiple layers, name the boundary explicitly.
