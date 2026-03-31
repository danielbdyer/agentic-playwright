# Agent Context

> Auto-generated — run `npm run agent:sync` to refresh. Skip if you already read AGENTS.md.

Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.

## Purpose

Tesseract is an interface intelligence and agent workbench system for QA intent.

It still includes a deterministic preparation pipeline, a bounded translation bridge, and a knowledge-backed runtime agent, but those are now consumers of a deeper shared model: the interface graph, the selector canon, the state transition topology, typed participants and interventions, and governed improvement lineage.

Tesseract ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, harvests application reality into a shared interpretation surface, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, human oversight, and durable interface intelligence.

The authoritative architecture doctrine lives in `docs/master-architecture.md`.

Operator workflows are documented in `docs/operator-handbook.md`.

## Fast Start

- Run `npm run context` to print this brief from live repository sources.
- Run `npm run map` to print the full module map from live repository sources.
- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.
- operational overview: [README.md](README.md)
- authoritative architecture doctrine: [docs/master-architecture.md](docs/master-architecture.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- operator workflow and approvals: [docs/operator-handbook.md](docs/operator-handbook.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)
- implementation coding notes: [docs/coding-notes.md](docs/coding-notes.md)
- seams, invariants, and verification: [docs/seams-and-invariants.md](docs/seams-and-invariants.md)
- code navigation (6-layer architecture): [lib/README.md](lib/README.md)
- auto-generated module map: [docs/module-map.md](docs/module-map.md) *(or run `npm run map`)*
- auto-generated doctrine invariants: [docs/doctrine-invariants.md](docs/doctrine-invariants.md) *(consumed by compiler, not for direct reading)*

## Codebase Structure

| Layer | Directory | Files | Description |
| --- | --- | --- | --- |
| **Domain** | `lib/domain/` | 163 | Pure domain logic — types, validation, graph derivation, code generation |
| **Application** | `lib/application/` | 145 | Effect orchestration — CLI commands, execution pipelines, fitness, improvement |
| **Runtime** | `lib/runtime/` | 46 | Playwright execution — scenario steps, agent resolution, screen identification |
| **Infrastructure** | `lib/infrastructure/` | 28 | Ports and adapters — ADO, filesystem, dashboard, MCP, VSCode |
| **Composition** | `lib/composition/` | 6 | Dependency injection — Effect Layers, service wiring |
| **Playwright** | `lib/playwright/` | 3 | ARIA capture, locator resolution, state topology |

**Total**: 391 TypeScript modules across 6 layers.

Each layer has a `README.md` with detailed module inventory and entry points.
Run `npm run map` for the full auto-generated module map, or see [`docs/module-map.md`](module-map.md).

## Canonical Inputs

- `.ado-sync/`
- `benchmarks/`
- `controls/`
- `scenarios/`
- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

## Derived Outputs

- `.tesseract/bound/`
- `.tesseract/confidence/`
- `.tesseract/benchmarks/`
- `.tesseract/inbox/`
- `.tesseract/tasks/`
- `.tesseract/runs/`
- `.tesseract/graph/`
- `.tesseract/interface/`
- `.tesseract/sessions/`
- `.tesseract/learning/`
- `generated/`
- `lib/generated/`

## Command Surface

- `npm run refresh` - full pipeline: sync → parse → bind → task → emit → graph → types
- `npm run run` - runtime pipeline: interpret → execute → evidence → proposals → re-emit → graph
- `npm run compile` - compile one scenario (parse → bind → task → emit)
- `npm run sync` - sync ADO cases to .ado-sync/snapshots/
- `npm run parse` - parse one scenario from canonical YAML
- `npm run bind` - bind scenario with knowledge (add --strict for strict mode)
- `npm run emit` - emit generated artifacts for one scenario
- `npm run generate` - generate synthetic scenarios from seed templates
- `npm run workflow` - inspect lane ownership, controls, precedence, and fingerprints
- `npm run paths` - show canonical and derived artifact paths for one scenario
- `npm run inbox` - project operator inbox from proposals, degraded locators, and needs-human steps
- `npm run trace` - return the scenario-centric subgraph from the dependency graph
- `npm run impact` - return the impacted subgraph for a node id
- `npm run surface` - inspect approved surface graph and derived capabilities
- `npm run graph` - rebuild the dependency/provenance graph
- `npm run types` - regenerate lib/generated/tesseract-knowledge.ts
- `npm run capture` - capture or refresh ARIA snapshot knowledge
- `npm run discover` - discover screen structure from a live URL (add --headed for visible browser)
- `npm run harvest` - harvest interface intelligence from execution evidence
- `npm run approve` - apply an approved proposal patch and emit a rerun plan
- `npm run rerun-plan` - compute the smallest safe rerun set for one proposal id
- `npm run benchmark` - execute flagship benchmark lane and emit scorecards
- `npm run scorecard` - reproject latest benchmark scorecard without running
- `npm run dogfood` - run the internal dogfood improvement loop
- `npm run speedrun` - rapid scenario generation + iteration with seed/substrate
- `npm run evolve` - evolutionary improvement over scenario populations
- `npm run experiments` - run experimental improvement strategies
- `npm run workbench` - interactive workbench for scenario development
- `npm run replay` - replay a previous run from stored receipts
- `npm run dashboard` - start the visual dashboard server
- `npm run dashboard:live` - dashboard with continuous speedrun (50 iterations)
- `npm run test:generated` - execute emitted specs with Playwright interpreter
- `npm run test:generated:headed` - same, with visible browser for operator follow-along
- `npm run context` - print generated repo brief from current sources
- `npm run agent:sync` - refresh docs/agent-context.md from current sources
- `npm run build` - emit runtime artifacts
- `npm run typecheck` - strict repo-wide typecheck including tests
- `npm run lint` - typed lint over hand-authored sources
- `npm run check` - quiet gate: build + typecheck + lint + test
- `npm run knip` - maintainer-only dependency hygiene scan
- `npm test` - run compiler/runtime/documentation law tests

## ADO Adapter Selection

- Default adapter: fixture (`dogfood/fixtures/ado/*.json`).
- Live adapter: set `--ado-source live` or `TESSERACT_ADO_SOURCE=live`.

Required env vars:
- `TESSERACT_ADO_ORG_URL`
- `TESSERACT_ADO_PROJECT`
- `TESSERACT_ADO_PAT`
- `TESSERACT_ADO_SUITE_PATH`

Optional env vars:
- `TESSERACT_ADO_AREA_PATH`
- `TESSERACT_ADO_ITERATION_PATH`
- `TESSERACT_ADO_TAG`
- `TESSERACT_ADO_API_VERSION` (default `7.1`)

## Scoped Guidance

| Scope | File |
| --- | --- |
| unspecified | `.github/instructions/dogfood.instructions.md` |
| lib/domain/**/*.ts | `.github/instructions/domain.instructions.md` |
| dogfood/generated/**/*.ts,dogfood/generated/**/*.json,dogfood/generated/**/*.md,generated/**/*.ts,generated/**/*.json,generated/**/*.md,lib/generated/**/*.ts | `.github/instructions/generated.instructions.md` |
| dogfood/knowledge/**/*.yaml,dogfood/knowledge/**/*.ts,dogfood/scenarios/**/*.yaml,knowledge/**/*.yaml,knowledge/**/*.ts,scenarios/**/*.yaml | `.github/instructions/knowledge.instructions.md` |
| scripts/**/*.ts,scripts/**/*.cjs | `.github/instructions/scripts.instructions.md` |
| tests/**/*.ts,tests/**/*.spec.ts | `.github/instructions/tests.instructions.md` |

## Layer Rules

- domain does not depend on application, infrastructure, or runtime
- application depends on domain and application-local support only
- runtime does not depend on application or infrastructure orchestration

## Current Priorities

