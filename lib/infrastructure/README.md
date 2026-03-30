# Infrastructure Layer — `lib/infrastructure/`

Ports and adapters. Every external system dependency is isolated behind an interface defined
in the domain or application layer, with concrete implementations here.

## Boundary Rules

- **May import** from `lib/domain/` and `lib/application/`.
- **Must not import** from `lib/runtime/` (one known baseline violation: `observation/playwright-screen-observer.ts` imports a runtime type for DOM observation — tracked for refactoring).
- Each adapter should implement a port (interface) defined elsewhere.

## What Lives Here

| Area | Directory | What It Does |
| --- | --- | --- |
| **Azure DevOps** | `ado/` (2 files) | `local-ado-source.ts` — fixture-based ADO adapter; `live-ado-source.ts` — real Azure DevOps API adapter |
| **Dashboard** | `dashboard/` (4 files) | `ws-dashboard-adapter.ts` — WebSocket event streaming; `pipeline-event-bus.ts` — event bus; `journal-writer.ts` — journal persistence; `runtime-boundary.ts` — dashboard runtime boundary |
| **File System** | `fs/` (2 files) | `local-fs.ts` — local filesystem implementation; `recording-fs.ts` — recording-mode wrapper for dry-run |
| **MCP Protocol** | `mcp/` (3 files) | `dashboard-mcp-server.ts` — MCP server; `resource-provider.ts` — structured resource access; `playwright-mcp-bridge.ts` — Playwright bridge |
| **Observation** | `observation/` (1 file) | `playwright-screen-observer.ts` — DOM snapshot capture and element queries |
| **Reporting** | `reporting/` (1 file) | `tesseract-reporter.ts` — Playwright test reporter with failure classification |
| **Runtime Environment** | `runtime/` (1 file) | `local-runtime-environment.ts` — local Playwright setup and initialization |
| **Screen Registry** | `screen-registry/` (1 file) | `local-screen-registry-loader.ts` — snapshot-based screen loading |
| **Snapshots** | `snapshots/` (1 file) | `local-snapshot-template-loader.ts` — template loading from disk |
| **Tooling** | `tooling/` (5 files) | CLI utilities for screen capture, route harvesting, browser options, screen discovery, local VCS |
| **VSCode** | `vscode/` (4 files) | `copilot-participant.ts` — Copilot chat participant; `task-provider.ts` — task provider; `problem-matcher.ts` — problem matcher; `types.ts` — VSCode-specific types |

## Key Root-Level Modules

| Module | Purpose |
| --- | --- |
| `headed-harness.ts` | Browser harness for headed (visible) test execution |

## Entry Points for Common Tasks

- **Add a new adapter**: create in the appropriate subdirectory, implement the port interface, register in `lib/composition/layers.ts`
- **Modify ADO integration**: `ado/` directory
- **Change dashboard streaming**: `dashboard/` directory
- **Modify Playwright reporter**: `reporting/tesseract-reporter.ts`
