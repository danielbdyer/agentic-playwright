---
applyTo: "scripts/**/*.ts,scripts/**/*.cjs"
---

# Scripts folder instructions

The `scripts/` folder is for **build tooling and infrastructure** only — not domain logic.

## What belongs in scripts/

- Build configuration (esbuild, TypeScript compilation)
- Linter and type-checker runners
- Playwright test harness wrappers
- Agent context documentation generators
- One-off profiling and diagnostic utilities

## What does NOT belong in scripts/

- Domain commands — use `tesseract <command>` via `lib/application/cli/registry.ts`
- Effect programs — these belong in `lib/application/`
- Work item processing or workbench operations — use `tesseract workbench`
- Speedrun, evolution, sensitivity analysis — use `tesseract speedrun`, `tesseract evolve`
- Scenario generation — use `tesseract generate`
- Experiment queries — use `tesseract experiments`

## The rule

If a script calls `runWithLocalServices()` with an Effect program from `lib/application/`,
it should be a `tesseract` CLI command instead. The CLI registry (`lib/application/cli/registry.ts`)
handles arg parsing, service composition, and posture resolution. Scripts should not duplicate this.

## Exceptions

Scripts that remain as thin CLI wrappers (`scripts/speedrun.ts`, `scripts/agent-speedrun.ts`)
exist for **presentation concerns** that the JSON-output CLI doesn't handle well:
real-time progress bars, regression detection display, colored terminal output.
These scripts should contain ZERO domain logic — only arg parsing and output formatting.
All domain logic must live in `lib/application/` Effect programs.

## Build scripts (.cjs)

The `.cjs` files are Node.js build tooling:
- `build.cjs` — esbuild bundler
- `typecheck.cjs` — TypeScript compilation
- `lint.cjs` — ESLint runner
- `check.cjs` — Combined check (lint + type-check)
- `run-playwright.cjs` — Playwright test runner
- `agent-context.cjs` — Agent context doc generator

These are infrastructure, not domain. They stay in scripts/ permanently.
