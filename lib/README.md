# Tesseract Engine — `lib/`

Six-layer architecture. Dependencies flow downward only.

## Layer Map

| Layer | Directory | Purpose | Entry Points |
|-------|-----------|---------|-------------|
| **Domain** | `domain/` | Pure types, validation, graph derivation, codegen | `domain/README.md` |
| **Application** | `application/` | Effect orchestration, CLI commands, pipelines | `application/README.md` |
| **Runtime** | `runtime/` | Playwright execution, agent resolution, widgets | `runtime/README.md` |
| **Infrastructure** | `infrastructure/` | Ports and adapters (ADO, filesystem, dashboard) | `infrastructure/README.md` |
| **Composition** | `composition/` | DI wiring, Effect Layers — only layer that imports all others | `composition/README.md` |
| **Playwright** | `playwright/` | ARIA capture, locator resolution, state topology | Direct modules |

## Dependency Rules

- `domain/` imports nothing from other layers (pure, side-effect free)
- `application/` imports from `domain/` only
- `runtime/` imports from `domain/` only
- `infrastructure/` imports from `domain/` and `application/`
- `composition/` imports from all layers (DI root)
- `playwright/` provides Playwright-specific utilities

These rules are enforced by law tests.

## Navigation

Start with the layer that matches your task:

- Changing types, schemas, or codegen: `domain/`
- Changing CLI commands or pipelines: `application/`
- Changing test execution or screen resolution: `runtime/`
- Changing external adapters (ADO, filesystem): `infrastructure/`
- Changing service wiring: `composition/`

For the full auto-generated module map: `npm run map` or see `docs/module-map.md`.
