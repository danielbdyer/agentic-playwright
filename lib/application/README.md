# Application Layer — `lib/application/`

Effect-based orchestration layer. Owns the CLI command surface, execution pipelines, fitness
reports, improvement loops, and workspace catalog management.

## Boundary Rules

- **May import** from `lib/domain/` only.
- **Must not import** from `lib/runtime/` or `lib/infrastructure/` (one known baseline violation: `agent-interpreter-provider.ts` imports a runtime type for the pluggable interpreter strategy — tracked for refactoring).
- All side effects are modeled through **Effect** services and layers.

## What Lives Here

| Area | Directory | What It Does |
| --- | --- | --- |
| **CLI Commands** | `cli/commands/` (31 files) | One file per `tesseract` CLI command — `approve`, `benchmark`, `bind`, `capture`, `compile`, `discover`, `dogfood`, `emit`, `evolve`, `experiments`, `generate`, `graph`, `harvest`, `impact`, `inbox`, `parse`, `paths`, `refresh`, `replay`, `rerun-plan`, `run`, `scorecard`, `speedrun`, `surface`, `sync`, `trace`, `types`, `workbench`, `workflow` |
| **CLI Infrastructure** | `cli/` | `registry.ts` (command registry), `shared.ts` (shared argument parsing) |
| **Execution Pipeline** | `execution/` (11 files) | `planner` → `interpret` → `execute-steps` → `persist-evidence` → `build-proposals` → `build-run-record` → `validate-step-results` → `fold` |
| **Catalog** | `catalog/` (7 files) | Workspace catalog loading, envelope creation, screen bundles |
| **Projections** | `projections/` (3 files) | Projection artifact generation |
| **Synthesis** | `synthesis/` (2 files) | Synthetic scenario generation and interface fuzzing |
| **Pipeline** | `pipeline/` (3 files) | Pipeline staging and execution coordination |
| **Inspection** | `inspection/` (1 file) | Introspection utilities |
| **Intake** | `intake/` (1 file) | Ingestion workflows |
| **Preparation** | `preparation/` (1 file) | Preparation workflows |
| **Cache** | `cache/` (1 file) | Translation cache management |

## Key Root-Level Modules

| Module | Purpose |
| --- | --- |
| `compile.ts` | Full compilation pipeline: parse → bind → task → emit |
| `emit.ts` | Scenario emission — generates proposals, review materials, spec code, and trace artifacts |
| `run.ts` | Run orchestration — scenario selection, execution, graph building, result processing |
| `task.ts` | Task execution with step-by-step resolution |
| `graph.ts` | DerivedGraph building — compiles knowledge, patterns, routes, controls into unified graph |
| `dogfood.ts` | Dogfood core — programmatic forward pass of the self-improving loop |
| `speedrun.ts` | Speedrun core — multi-seed runs, fitness aggregation, scorecard comparison |
| `benchmark.ts` | Benchmark orchestration with improvement projections |
| `fitness.ts` | Pipeline fitness report emission and scorecard comparison |
| `interface-intelligence.ts` | Pre-indexed screen catalog with O(1) lookups and dynamic targeting |
| `improvement.ts` | Improvement run building with intervention lineage tracking |
| `agent-workbench.ts` | Agent workbench — projection from iteration data to structured work items |
| `agent-interpreter-provider.ts` | Strategy pattern for pluggable agent interpretation backends |
| `paths.ts` | `ProjectPaths` — defines all artifact paths in the workspace structure |
| `surface.ts` | Surface inspection — approved surface graph and capabilities for a screen |
| `workflow.ts` | Workflow inspection — lane ownership, controls, precedence, fingerprints |
| `rerun-plan.ts` | Rerun planning with dependency tracking |

## Execution Pipeline Flow

```
planner.ts          → Builds execution plan from run context
interpret.ts        → Intent interpretation and resolution
execute-steps.ts    → Step-by-step execution
persist-evidence.ts → Evidence persistence
build-proposals.ts  → Proposal generation from step resolutions
build-run-record.ts → Run record compilation
validate-step-results.ts → Result validation
fold.ts             → Result folding and aggregation
```

## Adding a New CLI Command

1. Create `lib/application/cli/commands/{name}.ts`
2. Export a command definition following the pattern in existing commands
3. Register it in `lib/application/cli/commands/index.ts`
4. The command becomes available as `tesseract {name}`

## Entry Points for Common Tasks

- **Full pipeline**: `compile.ts` → `emit.ts` → `graph.ts`
- **Scenario execution**: `run.ts` → `execution/` pipeline
- **Inspection**: `paths.ts`, `surface.ts`, `workflow.ts`, `trace.ts`, `impact.ts`
- **Improvement**: `dogfood.ts`, `speedrun.ts`, `benchmark.ts`, `fitness.ts`
