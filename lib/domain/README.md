# Domain Layer — `lib/domain/`

Pure, side-effect-free domain logic. This is the core of the Tesseract compiler.

## Hard Boundaries

- **No imports** from `lib/application/`, `lib/infrastructure/`, or `lib/runtime/`.
- **No side effects**: no filesystem, network, Playwright, or Effect dependencies.
- **No `let`**, no `Array.push()`, no `for` / `for...in` — enforced by ESLint.
- All functions must be **pure and deterministic**.

## Bounded Context Directory Map

| Context | Directory | What It Does |
| --- | --- | --- |
| **Types** | `types/` (32 files) | All core domain types organized by bounded context barrels |
| **Schemas** | `schemas/` (14 files) | JSON Schema validation and code generation for canonical artifacts |
| **Validation** | `validation/` (17 files) | Artifact validation by context, with `core.ts` as compatibility facade |
| **Algebra** | `algebra/` (5 files) | Monoids, lattices, scoring combinators |
| **Aggregates** | `aggregates/` (4 files) | Aggregate roots: InterfaceGraph, ScenarioRun, ImprovementRun, InterventionLedger |
| **Projection** | `projection/` (12 files) | Visualization, dashboard state, replay: scene state, convergence FSMs, timelines |
| **Governance** | `governance/` (7 files) | Trust evaluation, proposal governance, provenance, contradiction detection |
| **Knowledge** | `knowledge/` (8 files) | Screen bundles, patterns, similarity matching, intent inference, DOM discovery |
| **Resolution** | `resolution/` (5 files) | Precedence rules, comparison, execution planning, interpreter port contract |
| **Codegen** | `codegen/` (4 files) | AST-backed Playwright spec generation, type generation, graph querying |
| **Execution** | `execution/` (6 files) | Execution budgets, recovery policies, telemetry |
| **Scenario** | `scenario/` (2+ files) | Scenario explanation, tier projection, accrual policies |
| **Widgets** | `widgets/` (1 file) | Widget interaction contracts |

## Shared Kernel (Root-Level Modules)

These are imported broadly across all layers and remain at the domain root:

| Module | Purpose |
| --- | --- |
| `identity.ts` | Branded identity types (`AdoId`, `ScreenId`, `ElementId`, etc.) |
| `errors.ts` | Core error hierarchy (`TesseractError`, `SchemaError`, `FileSystemError`) |
| `hash.ts` | Content hashing and stable serialization |
| `collections.ts` | Sorted/grouped collection utilities |
| `visitors.ts` | Typed visitor (fold) functions for exhaustive discriminated union analysis |
| `derived-graph.ts` | Optimized graph derivation — core compiler output (1,759 LOC) |
| `program.ts` | `StepProgram` instruction model |
| `brand.ts` | Branding utility |
| `ids.ts` | ID construction and graph ID utilities |
| `types.ts` | Thin barrel re-exporting bounded context type barrels |
| `validation.ts` | Thin barrel re-exporting validation facade |

## Key Design Patterns

- **Branded types** for identity (`AdoId`, `ScreenId`) and governance (`Approved<T>`, `Blocked<T>`)
- **Exhaustive matching** via `Match.discriminatorsExhaustive` and `foldGovernance`
- **Visitor/Fold** pattern for discriminated union analysis
- **Strategy** pattern for resolution ladders
- **Composite** for scoring rules
- **Interpreter** for compilation phases

## Entry Points for Common Tasks

- **Add a new domain type**: create in `types/`, export from the relevant `*-context.ts` barrel
- **Add a validation rule**: add to `validation/core/` under the owning context
- **Modify graph derivation**: edit `derived-graph.ts`
- **Change code emission**: edit `codegen/spec-codegen.ts`
- **Understand governance**: start with `governance/` + `types/workflow.ts`
- **Understand resolution precedence**: see `resolution/precedence.ts` and `resolution/precedence-policy.ts`
- **Understand knowledge matching**: see `knowledge/shingles.ts` and `knowledge/inference.ts`
- **Dashboard/visualization logic**: see `projection/`

## Validation Ownership Map

Validation composition is split by context under `validation/core/`, with `validation/core.ts` as the thin compatibility facade.

| Context | Entrypoint | Representative validators |
| --- | --- | --- |
| `intent` | `validation/core/intent-validator.ts` | `validateScenarioArtifact`, `validateBoundScenarioArtifact`, `validateAdoSnapshotArtifact` |
| `knowledge` | `validation/core/knowledge-validator.ts` | `validateScreenElementsArtifact`, `validatePatternDocumentArtifact`, `validateManifestArtifact` |
| `resolution` | `validation/core/resolution-validator.ts` | `validateResolutionControlArtifact`, `validateDatasetControlArtifact`, `validateRunbookControlArtifact` |
| `execution` | `validation/core/execution-validator.ts` | `validateRunRecordArtifact`, `validateBenchmarkContextArtifact` |
| `governance` | `validation/core/governance-validator.ts` | `validateTrustPolicyArtifact`, `validateApprovalReceiptArtifact`, `validateProposalBundleArtifact` |
| `graph` | `validation/core/graph-validator.ts` | `validateDerivedGraphArtifact`, `validateSurfaceGraphArtifact` |

## Domain Type Ownership Map

The root barrel `lib/domain/types.ts` re-exports bounded context barrels:

| Context | Barrel | Leaf type modules |
| --- | --- | --- |
| `shared` | `types/shared-context.ts` | `workflow.ts` |
| `intent` | `types/intent-context.ts` | `intent.ts`, `routes.ts`, `route-knowledge.ts` |
| `knowledge` | `types/knowledge-context.ts` | `knowledge.ts`, `semantic-dictionary.ts`, `contradiction.ts`, `affordance.ts`, `widgets.ts` |
| `resolution` | `types/resolution-context.ts` | `resolution.ts`, `pipeline-config.ts`, `agent-interpreter.ts` |
| `execution` | `types/execution-context.ts` | `execution.ts`, `projection.ts` |
| `intervention` | `types/intervention-context.ts` | `intervention.ts`, `session.ts`, `workbench.ts`, `dashboard.ts` |
| `improvement` | `types/improvement-context.ts` | `improvement.ts`, `learning.ts`, `fitness.ts`, `experiment.ts`, `architecture-fitness.ts` |
| `interface` | `types/interface-context.ts` | `interface.ts` |

### Where to add a new type

1. Add the type to the owning **leaf module** listed above.
2. Re-export through the owning **context barrel** (`*-context.ts`).
3. Only add to `shared-context.ts` if it is a true cross-context value object.
4. Do **not** deep-import `lib/domain/types/<leaf-module>` from outside the domain layer; import via context barrels.
