# Agent Context

Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.

## Purpose

Tesseract is a deterministic preparation pipeline plus a bounded translation bridge and a knowledge-backed runtime agent for QA intent.

It ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, projects resolvable deterministic artifacts, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, and human oversight.

Operator workflows are documented in `docs/operator-handbook.md`.

## Fast Start

- Run `npm run context` to print this brief from live repository sources.
- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.
- operational overview: [README.md](README.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- operator workflow and approvals: [docs/operator-handbook.md](docs/operator-handbook.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)
- design direction and owner decisions: [docs/direction.md](docs/direction.md)

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
- `generated/`
- `lib/generated/`

## Command Surface

- `npm run context` - print a generated repo brief from current sources
- `npm run agent:sync` - refresh docs/agent-context.md from current sources
- `npm run refresh` - sync -> parse -> bind -> task -> emit -> graph -> types
- `npm run run` - interpret -> execute -> evidence -> proposals -> re-emit -> graph
- `npm run workflow` - inspect lane ownership, controls, precedence, and fingerprints
- `npm run paths` - show canonical and derived artifact paths for one scenario
- `npm run inbox` - project the operator inbox from proposals, degraded locators, and needs-human steps
- `npm run benchmark` - execute the flagship benchmark lane and emit scorecards + variant projections
- `npm run scorecard` - reproject the latest benchmark scorecard without running scenarios
- `npm run approve` - apply an approved proposal patch and emit a rerun plan
- `npm run rerun-plan` - compute the smallest safe rerun set for one proposal id
- `npm run surface` - inspect approved surface graph and derived capabilities
- `npm run graph` - rebuild the dependency/provenance graph
- `npm run trace` - return the scenario-centric subgraph
- `npm run impact` - return the impacted subgraph for a node id
- `npm run types` - regenerate lib/generated/tesseract-knowledge.ts
- `npm run capture` - capture or refresh ARIA snapshot knowledge
- `npm run test:generated` - execute emitted specs against the demo harness with the real Playwright interpreter
- `npm run test:generated:headed` - same, but with a visible browser so an operator can follow along
- `npm run build` - emit runtime artifacts with the build-only TS config
- `npm run typecheck` - strict repo-wide typecheck including tests
- `npm run lint` - typed lint over hand-authored sources
- `npm run check` - quiet build + typecheck + lint + test gate for local/CI use
- `npm run knip` - maintainer-only dependency hygiene scan
- `npm test` - run compiler/runtime/documentation laws

## ADO Adapter Selection

- Default adapter: fixture (`fixtures/ado/*.json`).
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
| lib/domain/**/*.ts | `.github/instructions/domain.instructions.md` |
| generated/**/*.ts,generated/**/*.json,generated/**/*.md,lib/generated/**/*.ts | `.github/instructions/generated.instructions.md` |
| knowledge/**/*.yaml,knowledge/**/*.ts,scenarios/**/*.yaml | `.github/instructions/knowledge.instructions.md` |
| tests/**/*.ts,tests/**/*.spec.ts | `.github/instructions/tests.instructions.md` |

## Layer Rules

- domain does not depend on application, infrastructure, or runtime
- application depends on domain and application-local support only
- runtime does not depend on application or infrastructure orchestration

## Current Priorities

