# Runtime Layer — `lib/runtime/`

Playwright execution layer. Owns scenario step execution, agent resolution, screen identification,
locator resolution, recovery strategies, and ARIA snapshot handling.

## Boundary Rules

- **May import** from `lib/domain/` only.
- **Must not import** from `lib/application/` or `lib/infrastructure/` (one known baseline violation: `scenario.ts` imports an application-layer type for execution context — tracked for refactoring).
- Direct Playwright API usage is concentrated here and in `lib/playwright/`.

## What Lives Here

| Area | Directory | What It Does |
| --- | --- | --- |
| **Agent resolution** | `agent/` (17 files) | Rung 9 of the resolution ladder — strategy registry, candidate lattice, DOM fallback, LLM-based resolution, MCP bridge, translation |
| **Interpreters** | `interpreters/` (5 files) | Interpretation strategies: execute, dry-run, diagnostic, evaluator |
| **Widgets** | `widgets/` (4 files) | Widget-specific interaction handlers (button, input, table) |
| **Execute** | `execute/` (1 file) | Step execution coordinator |
| **Resolve** | `resolve/` (1 file) | Resolution coordination |
| **Observe** | `observe/` (2 files) | Observation utilities for runtime monitoring |
| **Adapters** | `adapters/` (1 file) | `playwright-dom-resolver.ts` — DOM resolution adapter |

## Key Root-Level Modules

| Module | Purpose |
| --- | --- |
| `scenario.ts` | Runtime scenario execution coordinator with recovery strategies and budget management |
| `program.ts` | `StepProgramInterpreter` — instruction-by-instruction execution of compiled step programs |
| `screen-identification.ts` | Runtime screen identification from DOM + interface graph |
| `recovery-strategies.ts` | Composable recovery strategies (retry, wait, re-identify, degrade) |
| `parallel-steps.ts` | Dependency analysis and independent step detection for parallel execution |
| `engage.ts` | Element engagement — focus, scroll, interaction preparation |
| `interact.ts` | Step interaction execution (click, fill, input, custom actions) |
| `locate.ts` | Locator resolution with fallback strategies |
| `data.ts` | Data value resolution from context and environment |
| `agent.ts` | Agent resolution at rung 9 of the resolution ladder |
| `aria.ts` | ARIA snapshot utilities |
| `snapshots.ts` | Snapshot template handling and caching |
| `console-sentinel.ts` | Console message interception for diagnostics |

## Resolution Ladder (Agent Module)

The `agent/` directory implements rung 9 of the 7-rung resolution ladder:

```
strategy-registry.ts  → Registers available resolution strategies
resolution-stages.ts  → Executes resolution stages in order
candidate-lattice.ts  → Builds candidate lattice from DOM observations
resolve-target.ts     → Target resolution from semantic identity
resolve-action.ts     → Action resolution from intent
dom-fallback.ts       → DOM-based fallback when knowledge is insufficient
rung8-llm-dom.ts      → LLM-based DOM resolution (rung 8)
interpret-intent.ts   → Intent interpretation at runtime
translation.ts        → Translation to ontology vocabulary
mcp-bridge.ts         → Model Context Protocol bridge for structured tool access
proposals.ts          → Proposal generation from resolution outcomes
select-controls.ts    → Control selection for resolution context
```

## Entry Points for Common Tasks

- **Modify step execution**: `scenario.ts` → `program.ts` → `interact.ts`
- **Change resolution strategy**: `agent/strategy-registry.ts` + `agent/resolution-stages.ts`
- **Add a widget handler**: `widgets/` directory
- **Modify screen identification**: `screen-identification.ts`
- **Change locator resolution**: `locate.ts`
