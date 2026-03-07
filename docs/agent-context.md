# Agent Context

Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.

## Purpose

Tesseract is an inference-first compiler for QA intent.

It ingests Azure DevOps manual test cases, lowers them into scenario IR, binds them against approved screen knowledge, and emits disposable Playwright object code plus review artifacts. The goal is not to hand-author tests faster. The goal is to make executable verification a deterministic projection of upstream intent and approved knowledge.

## Fast Start

- Run `npm run context` to print this brief from live repository sources.
- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.
- operational overview: [README.md](README.md)
- product model and QA workflow: [VISION.md](VISION.md)
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
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

## Command Surface

- `npm run context` - print a generated repo brief from current sources
- `npm run agent:sync` - refresh docs/agent-context.md from current sources
- `npm run refresh` - sync -> parse -> bind -> emit -> graph -> types
- `npm run paths` - show canonical and derived artifact paths for one scenario
- `npm run surface` - inspect approved surface graph and derived capabilities
- `npm run graph` - rebuild the dependency/provenance graph
- `npm run trace` - return the scenario-centric subgraph
- `npm run impact` - return the impacted subgraph for a node id
- `npm run types` - regenerate lib/generated/tesseract-knowledge.ts
- `npm run capture` - capture or refresh ARIA snapshot knowledge
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
