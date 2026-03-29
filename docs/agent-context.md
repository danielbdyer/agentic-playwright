# Agent Context

Generated from `AGENTS.md`, `README.md`, `BACKLOG.md`, and `.github/instructions/`. Do not hand-edit; run `npm run agent:sync`.

## Purpose

Tesseract is an interface intelligence and agent workbench system for QA intent.

It still includes a deterministic preparation pipeline, a bounded translation bridge, and a knowledge-backed runtime agent, but those are now consumers of a deeper shared model: the interface graph, the selector canon, the state transition topology, typed participants and interventions, and governed improvement lineage.

Tesseract ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, harvests application reality into a shared interpretation surface, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, human oversight, and durable interface intelligence.

The authoritative architecture doctrine lives in `docs/master-architecture.md`.

Operator workflows are documented in `docs/operator-handbook.md`.

## Fast Start

- Run `npm run context` to print this brief from live repository sources.
- Use `npm run paths`, `npm run trace`, `npm run impact`, and `npm run surface` before editing scenario-specific files.
- operational overview: [README.md](README.md)
- authoritative architecture doctrine: [docs/master-architecture.md](docs/master-architecture.md)
- product model and QA workflow: [VISION.md](VISION.md)
- domain ontology and invariants: [docs/domain-ontology.md](docs/domain-ontology.md)
- authorship and knowledge design: [docs/authoring.md](docs/authoring.md)
- operator workflow and approvals: [docs/operator-handbook.md](docs/operator-handbook.md)
- planned work split by lane: [BACKLOG.md](BACKLOG.md)
- design direction and owner decisions: [docs/direction.md](docs/direction.md)
- implementation coding notes: [docs/coding-notes.md](docs/coding-notes.md)
- seams, invariants, and verification: [docs/seams-and-invariants.md](docs/seams-and-invariants.md)

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
| lib/domain/**/*.ts | `.github/instructions/domain.instructions.md` |
| dogfood/generated/**/*.ts,dogfood/generated/**/*.json,dogfood/generated/**/*.md,generated/**/*.ts,generated/**/*.json,generated/**/*.md,lib/generated/**/*.ts | `.github/instructions/generated.instructions.md` |
| dogfood/knowledge/**/*.yaml,dogfood/knowledge/**/*.ts,dogfood/scenarios/**/*.yaml,knowledge/**/*.yaml,knowledge/**/*.ts,scenarios/**/*.yaml | `.github/instructions/knowledge.instructions.md` |
| tests/**/*.ts,tests/**/*.spec.ts | `.github/instructions/tests.instructions.md` |

## Layer Rules

- domain does not depend on application, infrastructure, or runtime
- application depends on domain and application-local support only
- runtime does not depend on application or infrastructure orchestration

## Current State (as of 2026-03-29)

### What works end-to-end

1. **Resolution pipeline**: The full resolution ladder (explicit → control → approved-knowledge → patterns → translation → live-DOM → needs-human) is wired and exercised. `lib/runtime/agent/resolution-stages.ts` orchestrates all rungs.

2. **Knowledge routing in binding**: `lib/domain/binding.ts` populates `knowledgeRefs` (surface, elements) and `supplementRefs` (hints) on every `BoundStep` when a screen is referenced. The resolution context carries per-step knowledge paths so the runtime agent knows which knowledge files to consult.

3. **Proposal generation at needs-human**: When a step reaches the `needs-human` fallback (rung 10), `proposalsForNeedsHuman()` in `lib/runtime/agent/proposals.ts` generates properly-structured `ResolutionProposalDraft` entries with `{ screen, element, alias }` patches. These flow through `build-proposals.ts` → `activate-proposals.ts` → `applyHintsPatch` → knowledge YAML updates.

4. **Playwright interpreter**: `lib/runtime/program.ts` (lines 67-228) has a fully implemented `playwrightStepProgramInterpreter` with handlers for navigate, enter, invoke, and observe-structure. It is exercised in `tests/playwright-execution.spec.ts` (4 tests against the demo harness HTML).

5. **Dogfood loop**: `lib/application/dogfood.ts` runs scenarios, collects proposals, activates them into knowledge files, and re-runs. The activation pipeline works: proposals accumulate during runs and feed into `activate-proposals.ts` for YAML updates.

6. **Speedrun/fitness**: `scripts/speedrun.ts` runs clean-slate flywheel cycles, generates fitness reports, and gates pipeline changes through the scorecard. 15 tunable parameters are documented in `docs/recursive-self-improvement.md`.

### Known gaps and caveats

- **Demo scenario 10001**: Achieves 100% knowledge hit rate via control resolution files (`controls/resolution/demo-policy-search.resolution.yaml`), not via alias matching. This exercises the explicit-fields and control-resolution rungs but not the alias-matching path.

- **Synthetic scenario hit rate**: ~32% via alias matching. The gap is that the scenario generator's phrasing templates don't always match the existing alias vocabulary. This is the intended target for the Level 0 knowledge accumulation loop.

- **Speedrun convergence metric**: The `proposalsActivated` counter in `accumulateProposalTotals` may report 0 even when proposals were generated and activated, because it counts within a single iteration rather than cumulatively. The convergence FSM can trigger `no-proposals` early termination before the system has a chance to benefit from activated proposals. This is a reporting/counting issue, not a functional gap in the pipeline.

- **Pre-existing test failures**: 27 tests fail before and after these changes. Root causes: `lib/domain/doctrine-compiler.ts` and `lib/domain/emission-backends.ts` import from `@playwright/test` and `node:fs`/`node:path`, violating domain purity architecture tests. These are pre-existing and tracked.

### Deleted modules (no longer in codebase)

The following modules were removed as dead code (zero imports, zero references):

- `lib/domain/camera-choreography.ts` — unused spatial choreography model
- `lib/domain/emotional-pacing.ts` — unused pacing model
- `lib/domain/breakage-simulator.ts` — unused breakage simulation
- `lib/application/projection/index.ts` — dead 3-line barrel re-export (the real implementation is at `lib/application/projections/`)

Their tests were also removed: `tests/camera-choreography.laws.spec.ts`, `tests/emotional-pacing.laws.spec.ts`, `tests/breakage-simulator.laws.spec.ts`.

### Where to look next

- **A1 (ADR collapse)**: Partially complete. Runtime interpretation works, proposals generate, activation applies. The remaining work is improving alias coverage so synthetic scenarios resolve at higher rungs more often.
- **A2 (Confidence-gated auto-approval)**: Unblocked by A1 progress. Trust policy thresholds exist; the gating logic needs wiring.
- **A3 (Dogfood orchestrator)**: The `npm run dogfood` / speedrun commands work. Convergence detection may need tuning (see speedrun convergence caveat above).
- **Speedrun proposal counting**: The convergence FSM's proposal detection is the most impactful near-term fix for the improvement loop.

## Current Priorities

