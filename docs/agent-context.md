# Agent Context

Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.

## Purpose

Tesseract is a deterministic preparation pipeline plus a knowledge-backed runtime agent for QA intent.

It ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, projects resolvable deterministic artifacts, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, and human oversight.

## Fast Start

- Run `npm run context` to print this brief from live repository sources.
- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.
- operational overview: [README.md](README.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)

## Canonical Inputs

- `.ado-sync/`
- `scenarios/`
- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

## Derived Outputs

- `.tesseract/bound/`
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
- `npm run paths` - show canonical and derived artifact paths for one scenario
- `npm run surface` - inspect approved surface graph and derived capabilities
- `npm run graph` - rebuild the dependency/provenance graph
- `npm run trace` - return the scenario-centric subgraph
- `npm run impact` - return the impacted subgraph for a node id
- `npm run types` - regenerate lib/generated/tesseract-knowledge.ts
- `npm run capture` - capture or refresh ARIA snapshot knowledge
- `npm run build` - emit runtime artifacts with the build-only TS config
- `npm run typecheck` - strict repo-wide typecheck including tests
- `npm run lint` - typed lint over hand-authored sources
- `npm run check` - quiet build + typecheck + lint + test gate for local/CI use
- `npm run knip` - maintainer-only dependency hygiene scan
- `npm test` - run compiler/runtime/documentation laws

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

1. Real Azure DevOps adapter behind `AdoSource`
2. Inference coverage expansion
3. Richer graph and trace projection
4. Locator degradation surfacing
