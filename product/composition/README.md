# Composition Layer — `lib/composition/`

Dependency injection and service wiring. This is the only layer that may import from all others.
It assembles Effect Layers, reads environment configuration, and provisions services for the
CLI and test harnesses.

## Boundary Rules

- **May import** from all layers (`domain`, `application`, `infrastructure`, `runtime`).
- This is the **composition root** — the single place where concrete implementations are wired to their abstract ports.
- No domain logic or business rules belong here.

## Modules

| Module | Purpose |
| --- | --- |
| `env.ts` | Centralized environment variable reads (`TESSERACT_CONCURRENCY`, `TESSERACT_AGENT_PROVIDER`, etc.) |
| `layers.ts` | Effect Layer definitions for `FileSystem`, `AdoSource`, `RuntimeScenarioRunner`, `ExecutionContext` |
| `local-services.ts` | Full service provisioning: ADO source, filesystem, dashboard, version control |
| `local-runtime-scenario-runner.ts` | Local runtime scenario runner with caching translator and recovery strategies |
| `load-run-plan.ts` | Synchronous/async run plan loading with local services provisioning |
| `scenario-context.ts` | Playwright test context with POM-style step execution (used by code-generated specs) |

## Entry Points for Common Tasks

- **Wire a new service**: add Layer definition in `layers.ts`, provide implementation in `local-services.ts`
- **Change environment config**: edit `env.ts`
- **Modify test context**: edit `scenario-context.ts`
