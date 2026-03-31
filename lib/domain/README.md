# Domain Layer — `lib/domain/`

Pure, side-effect-free domain logic. This is the core of the Tesseract compiler.

## Hard Boundaries

- **No imports** from `lib/application/`, `lib/infrastructure/`, or `lib/runtime/`.
- **No side effects**: no filesystem, network, Playwright, or Effect dependencies.
- **No `let`**, no `Array.push()`, no `for` / `for...in` — enforced by ESLint.
- All functions must be **pure and deterministic**.

## What Lives Here

| Area | Directory | What It Does |
| --- | --- | --- |
| **Type definitions** | `types/` (30 files) | All core domain types: workflow governance, resolution, execution, knowledge, interface graph, intent, projections, dashboard events |
| **Schemas** | `schemas/` (14 files) | JSON Schema validation and code generation for canonical artifacts |
| **Validation** | `validation/` (16 files) | Graph validators, constraint checks, normalization rules |
| **Algebra** | `algebra/` (7 files) | Monoids, lattices, Kleisli composition, scoring combinators |
| **Governance** | `governance/` (4 files) | Phantom branded types (`Approved<T>`, `Blocked<T>`), `foldGovernance` for exhaustive case analysis |
| **Knowledge** | `knowledge/` (6 files) | Knowledge graph construction, element candidates, step coverage analysis |
| **Resolution** | `resolution/` (4 files) | Resolution targets, proposals, translation primitives |
| **Intent** | `intent/` (4 files) | Intent models and step definitions |
| **Execution** | `execution/` (6 files) | Execution budgets, recovery policies, telemetry |
| **Projection** | `projection/` (4 files) | Benchmark projections, drift events |
| **Scenario** | `scenario/` (2 files) | Scenario explanation, tier projection |
| **Foundation** | `foundation/` (4 files) | Core foundation types and utilities |
| **Widgets** | `widgets/` (1 file) | Widget interaction contracts |

## Key Root-Level Modules

| Module | Purpose |
| --- | --- |
| `derived-graph.ts` | Optimized graph derivation with pre-indexed maps — core compiler output |
| `spec-codegen.ts` | AST-backed Playwright spec code generation |
| `discovery.ts` | DOM discovery model (raw surfaces and elements) |
| `visitors.ts` | Typed visitor (fold) functions for exhaustive case analysis on discriminated unions |
| `doctrine-compiler.ts` | Self-verification doctrine compiler — extracts structured invariants from markdown |
| `errors.ts` | Core error hierarchy (`TesseractError`, `SchemaError`, `FileSystemError`) |
| `identity.ts` | Branded identity types (`AdoId`, `ScreenId`, `ElementId`) |
| `program.ts` | `StepProgram` instruction model |
| `cold-start.ts` | Cold-start accelerator — seed packs and discovery strategy for early iterations |

## Flywheel Visualization Modules

These modules power the spatial dashboard's time-lapse replay:

| Module | Purpose |
| --- | --- |
| `scene-state-accumulator.ts` | Pure state reconstruction with checkpoint-accelerated seek |
| `convergence-finale.ts` | FSM for convergence ceremony (3 visual treatments) |
| `flywheel-entity.ts` | 12 entity types with act-specific visual profiles |
| `speed-tier-batcher.ts` | Event batching strategy per playback speed tier (0.5× to 100×) |
| `camera-choreography.ts` | 7 named camera states with cubic ease-in-out transitions |
| `emotional-pacing.ts` | 3 verbosity profiles with 15 adjustable parameters each |

## Key Design Patterns

- **Branded types** for identity (`AdoId`, `ScreenId`) and governance (`Approved<T>`, `Blocked<T>`)
- **Exhaustive matching** via `Match.discriminatorsExhaustive` and `foldGovernance`
- **Visitor/Fold** pattern for discriminated union analysis
- **Strategy** pattern for resolution ladders
- **Composite** for scoring rules
- **Interpreter** for compilation phases

## Entry Points for Common Tasks

- **Add a new domain type**: create in `types/`, export from the relevant barrel
- **Add a validation rule**: add to `validation/`
- **Modify graph derivation**: edit `derived-graph.ts`
- **Change code emission**: edit `spec-codegen.ts`
- **Understand governance**: start with `governance/` + `types/workflow.ts`

## Domain Type Ownership Map (Bounded Contexts)

The root barrel `lib/domain/types.ts` is now intentionally thin. It only re-exports bounded context barrels and shared value objects:

- `types/shared-context.ts`
- `types/intent-context.ts`
- `types/knowledge-context.ts`
- `types/resolution-context.ts`
- `types/execution-context.ts`
- `types/intervention-context.ts`
- `types/improvement-context.ts`
- `types/interface-context.ts`

### Inventory by context (leaf modules)

| Context | Leaf type modules |
| --- | --- |
| `shared` | `workflow.ts` |
| `intent` | `intent.ts`, `routes.ts`, `route-knowledge.ts` |
| `knowledge` | `knowledge.ts`, `semantic-dictionary.ts`, `contradiction.ts`, `affordance.ts`, `widgets.ts` |
| `resolution` | `resolution.ts`, `pipeline-config.ts`, `agent-interpreter.ts` |
| `execution` | `execution.ts`, `projection.ts` |
| `intervention` | `intervention.ts`, `session.ts`, `workbench.ts`, `dashboard.ts` |
| `improvement` | `improvement.ts`, `learning.ts`, `fitness.ts`, `experiment.ts`, `architecture-fitness.ts` |
| `interface` | `interface.ts` |

### Where to add a new type

1. Add the type to the owning **leaf module** listed above.
2. Re-export through the owning **context barrel** (`*-context.ts`).
3. Only add to `shared-context.ts` if it is a true cross-context value object (for example governance or envelope primitives).
4. Do **not** deep-import `lib/domain/types/<leaf-module>` from `lib/application`, `lib/runtime`, or `lib/infrastructure`; import via context barrels.
5. If ownership changes, update `tests/domain-type-barrels.spec.ts` and this map in the same PR.
