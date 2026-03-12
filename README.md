# Tesseract

Tesseract is an interface intelligence and agent workbench system for QA intent.

It still includes a deterministic preparation pipeline, a bounded translation bridge, and a knowledge-backed runtime agent, but those are now consumers of a deeper shared model: the interface graph, the selector canon, the state transition topology, the session ledger, and the learning corpus.

Tesseract ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, harvests application reality into a shared interpretation surface, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, human oversight, and durable interface intelligence.

The authoritative architecture doctrine lives in `docs/master-architecture.md`.

Operator workflows are documented in `docs/operator-handbook.md`.

## What is canonical

Approved, reviewable inputs:

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

Derived outputs. Do not hand-edit:

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

## Six workflow lanes

Tesseract exposes six explicit concern lanes so humans and agents can tune each surface independently:

- `intent`: `.ado-sync/` and `scenarios/`
- `knowledge`: `knowledge/surfaces/`, `knowledge/screens/`, `knowledge/patterns/`, `knowledge/snapshots/`
- `control`: `controls/datasets/`, `controls/resolution/`, `controls/runbooks/`
- `resolution`: `.tesseract/tasks/` plus runtime interpretation receipts
- `execution`: runtime execution receipts and run records
- `governance/projection`: generated review surfaces, graph outputs, and trust-policy gates

Every cross-lane handoff is carried as a typed envelope with `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.

Those six lanes remain the operating vocabulary. Architecturally, three cross-cutting spines now cut through them:

- `interface`: shared application structure, targets, selectors, states, and transitions
- `session`: provider-agnostic operator and agent lifecycle events
- `learning`: replay, training, evaluation, drift, and ratchet surfaces derived from provenance

## Governance boundary

Deterministic compiler derivations are auto-approved.

If a step binds from already approved artifacts through deterministic rules, it is emitted with:

- `confidence: compiler-derived`
- `governance: approved`

If a step preserves raw intent and waits for runtime interpretation, it is emitted with:

- `confidence: intent-only`
- `binding.kind: deferred`
- `governance: approved`

Trust policy review applies only to proposed canonical changes such as:

- `knowledge/screens/*.elements.yaml`
- `knowledge/screens/*.postures.yaml`
- `knowledge/screens/*.hints.yaml`
- `knowledge/patterns/*.yaml`
- `knowledge/surfaces/*.surface.yaml`
- `knowledge/snapshots/**/*.yaml`
- evidence-backed locator ladders and other supplement proposals

This is the operating rule for agents in this repo:

- compiler output derived from approved knowledge does not wait for human blessing
- approved-equivalent confidence overlays can participate in resolution without rewriting canon
- proposed new knowledge does
- `needs-human` is valid only after all non-human paths were exhausted

## Pipeline outputs

For each scenario, Tesseract projects deterministic preparation artifacts:

- `.tesseract/bound/{ado_id}.json`: bound envelope with `bound | deferred | unbound`
- `.tesseract/tasks/{ado_id}.resolution.json`: runtime task packet with intent, constraints, knowledge refs, graph refs, selector refs, and stable fingerprints

And it emits aligned review surfaces:

- `generated/{suite}/{ado_id}.spec.ts`: executable Playwright object code
- `generated/{suite}/{ado_id}.trace.json`: machine-readable derivation and execution trace surface
- `generated/{suite}/{ado_id}.review.md`: QA-facing review artifact
- `generated/{suite}/{ado_id}.proposals.json`: typed proposal bundle for supplemental changes

Generated specs are readable projections over the workflow facade. The task packet remains the machine contract; the emitted spec is the human-readable projection of that same handshake.

Runtime execution adds:

- `.tesseract/runs/{ado_id}/{run_id}/interpretation.json`
- `.tesseract/runs/{ado_id}/{run_id}/execution.json`
- `.tesseract/runs/{ado_id}/{run_id}/run.json`
- `.tesseract/confidence/index.json`
- `.tesseract/interface/index.json`
- `.tesseract/interface/selectors.json`
- `.tesseract/sessions/{sessionId}/session.json`
- `.tesseract/sessions/{sessionId}/events.jsonl`
- `.tesseract/learning/manifest.json`
- `.tesseract/inbox/index.json`
- `.tesseract/policy/approvals/{proposal_id}.approval.json`
- `.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json`

The review artifact exists so a QA can answer:

- Did each `test.step()` preserve the original ADO wording?
- What did the deterministic preparation lane preserve or defer?
- What task packet did the runtime agent actually receive?
- Which approved files, supplements, interface graph bindings, and prior evidence were used?
- Did the agent resolve safely, resolve with proposals, or truly need a human?

## Deterministic precedence

Precedence is concern-specific and intentionally testable.

Resolution:

1. explicit scenario fields
2. `controls/resolution/*.resolution.yaml`
3. approved knowledge priors from screens, hints, patterns, and deterministic heuristics
4. approved-equivalent confidence overlays from `.tesseract/confidence/index.json`
5. structured translation over typed ontology candidates
6. live DOM exploration and safe degraded resolution
7. `needs-human`

Prior evidence and run history feed overlays, translation, and the runtime agent. They are not a separate winning tier.

Data:

1. explicit scenario override
2. runbook dataset binding
3. dataset default
4. hint default value
5. posture sample
6. generated token

Run selection:

1. CLI flags
2. `controls/runbooks/*.runbook.yaml`
3. repo defaults

This order is part of the product. It must stay stable and testable.

## Supplement hierarchy

Use the smallest durable supplement that explains the gap.

Screen-local supplements live in:

- `knowledge/screens/{screen}.hints.yaml`

They carry:

- screen aliases
- element aliases
- default value refs
- parameter cues
- snapshot aliases
- widget affordances

Promoted cross-screen supplements live in:

- `knowledge/patterns/*.yaml`

They carry:

- reusable intent phrase sets
- posture alias sets
- shared interaction or repair patterns after promotion

Promotion rule:

- land local first
- promote only when repeated or intentionally generalized

## Locator strategy

Element signatures support ordered locator ladders.

Preferred order:

1. `test-id`
2. `role-name`
3. `css`

The runtime resolves the ladder in order. If a fallback rung succeeds, the execution outcome records degraded locator use. This keeps "green but brittle" visible in review and graph surfaces.

## Commands

The repo is intentionally CLI-first.

```powershell
npm run context    # print a generated repo brief from current sources
npm run agent:sync # refresh docs/agent-context.md from current sources
npm run refresh    # sync -> parse -> bind -> task -> emit -> graph -> types
npm run run        # interpret -> execute -> evidence -> proposals -> re-emit -> graph
npm run workflow   # inspect lane ownership, controls, precedence, and fingerprints
npm run paths      # show canonical and derived artifact paths for one scenario
npm run inbox      # project the operator inbox from proposals, degraded locators, and needs-human steps
npm run benchmark  # execute the flagship benchmark lane and emit scorecards + variant projections
npm run scorecard  # reproject the latest benchmark scorecard without running scenarios
npm run approve    # apply an approved proposal patch and emit a rerun plan
npm run rerun-plan # compute the smallest safe rerun set for one proposal id
npm run surface    # inspect approved surface graph and derived capabilities
npm run graph      # rebuild the dependency/provenance graph
npm run trace      # return the scenario-centric subgraph
npm run impact     # return the impacted subgraph for a node id
npm run types      # regenerate lib/generated/tesseract-knowledge.ts
npm run capture    # capture or refresh ARIA snapshot knowledge
npm run test:generated        # execute emitted specs against the demo harness with the real Playwright interpreter
npm run test:generated:headed # same, but with a visible browser so an operator can follow along
npm run build      # emit runtime artifacts with the build-only TS config
npm run typecheck  # strict repo-wide typecheck including tests
npm run lint       # typed lint over hand-authored sources
npm run check      # quiet build + typecheck + lint + test gate for local/CI use
npm run knip       # maintainer-only dependency hygiene scan
npm test           # run compiler/runtime/documentation laws
```

### ADO adapter selection

Sync defaults to the fixture adapter (`fixtures/ado/*.json`) so local tests remain deterministic.

Use the live Azure DevOps adapter with `--ado-source live` (or `TESSERACT_ADO_SOURCE=live`).

Required live env vars:

- `TESSERACT_ADO_ORG_URL`
- `TESSERACT_ADO_PROJECT`
- `TESSERACT_ADO_PAT`
- `TESSERACT_ADO_SUITE_PATH`

Optional live filters:

- `TESSERACT_ADO_AREA_PATH`
- `TESSERACT_ADO_ITERATION_PATH`
- `TESSERACT_ADO_TAG`
- `TESSERACT_ADO_API_VERSION` (default `7.1`)

Equivalent `sync` CLI overrides are available: `--ado-org-url`, `--ado-project`, `--ado-pat`, `--ado-suite-path`, `--ado-area-path`, `--ado-iteration-path`, and `--ado-tag-filter`.

Global operator flags for mutating commands:

- `--no-write`: compute and project results, but keep writes in the would-write ledger
- `--baseline`: alias for `--no-write --interpreter-mode dry-run`
- `--ci-batch` or `--execution-profile ci-batch`: force headless non-interactive execution, allow proposal generation, and forbid approval/apply behavior

## Quality Gate

Use Node `>=20.9.0` for local development and CI.

`npm run check` is the authoritative gate for both local work and Azure DevOps. It runs `build`, `typecheck`, `lint`, and `test` sequentially.

Output policy:

- successful `npm run check` runs emit one short line when each phase starts and passes
- failed `npm run check` runs print only the failing phase and that phase's diagnostics
- `npm run lint` ignores derived outputs such as `.ado-sync/`, `.tesseract/`, `generated/`, `lib/generated/`, `dist/`, and `test-results/`
- `npm run typecheck` includes repo tests so fixture drift fails before runtime

## Artifact map

| Artifact | Purpose | Review boundary |
|---|---|---|
| `.ado-sync/snapshots/{ado_id}.json` | upstream ADO source snapshot | canonical |
| `benchmarks/*.benchmark.yaml` | canonical benchmark field catalog, drifts, and runbook expansion rules | canonical |
| `controls/**/*.yaml` | canonical tuning surfaces for datasets, runbooks, and resolution overrides | canonical |
| `scenarios/{suite}/{ado_id}.scenario.yaml` | canonical scenario IR | canonical |
| `.tesseract/bound/{ado_id}.json` | bound scenario with provenance and governance | derived |
| `.tesseract/tasks/{ado_id}.resolution.json` | runtime task packet and knowledge handshake | derived |
| `.tesseract/runs/{ado_id}/{run_id}/run.json` | interpretation + execution receipts | derived |
| `.tesseract/confidence/index.json` | derived confidence overlay catalog and approved-equivalent working knowledge | derived |
| `.tesseract/interface/index.json` | derived application interface graph | derived |
| `.tesseract/interface/selectors.json` | derived selector canon | derived |
| `.tesseract/sessions/{sessionId}/session.json` | derived agent session ledger | derived |
| `.tesseract/learning/manifest.json` | derived learning corpus manifest | derived |
| `.tesseract/inbox/index.json` | derived operator inbox surface | derived |
| `.tesseract/policy/approvals/{proposal_id}.approval.json` | durable approval receipt | derived |
| `.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json` | benchmark execution ledger | derived |
| `generated/{suite}/{ado_id}.spec.ts` | executable object code | derived |
| `generated/{suite}/{ado_id}.trace.json` | machine derivation trace | derived |
| `generated/{suite}/{ado_id}.review.md` | QA review report | derived |
| `generated/{suite}/{ado_id}.proposals.json` | typed proposal bundle for human review | derived |
| `.tesseract/graph/index.json` | dependency and provenance graph | derived |

## What agents should inspect first

When working on a scenario, prefer this sequence:

1. `npm run workflow`
2. `npm run inbox`
3. `npm run paths`
4. `npm run trace`
5. `npm run impact`
6. `npm run surface`
7. `.tesseract/tasks/...resolution.json`
8. `generated/...review.md`

That sequence tells an agent:

- what is canonical
- what controls are active for the selected run
- what was derived
- what knowledge and prior evidence the runtime agent will see
- what changed
- what still needs a proposal instead of a code patch

## Bottleneck visibility

Bottleneck visibility is part of the product, not just diagnostics.

The system should make it obvious which steps are:

- `compiler-derived` from approved knowledge only
- `intent-only` and intentionally deferred to runtime
- resolved from approved knowledge at runtime
- resolved from approved-equivalent confidence overlays
- resolved through structured translation over known ontology
- resolved through live exploration with reviewable proposals
- still `unbound` because explicit structure contradicts approved knowledge
- blocked by `needs-human` after all non-human paths were exhausted

The graph, trace JSON, and review Markdown should all agree on that answer.

## Architecture summary

- `lib/domain`: pure values, validation, normalization, graph derivation, AST-backed codegen
- `lib/application`: Effect-based orchestration and port composition
- `lib/infrastructure`: filesystem, fixture/live ADO adapters, reporting adapters
- `lib/runtime`: task interpretation, locator resolution, widget interaction, execution interpreters
- `knowledge/components/*.ts`: procedural widget interpreters only

Boundary rules enforced by tests:

- domain does not depend on application, infrastructure, or runtime
- application depends on domain and application-local support only
- runtime does not depend on application or infrastructure orchestration

## Offline optimization lane

DSPy, GEPA, and similar systems belong outside the deterministic compiler path.

Use them for:

- proposal ranking
- supplement suggestion quality
- benchmark evaluation
- prompt and policy optimization over trace/evidence corpora

Do not use them to directly mutate canonical knowledge without evidence and review.

## Demo slice

The seeded vertical slice uses:

- ADO case `10001`
- screen `policy-search`
- shared patterns at `knowledge/patterns/core.patterns.yaml`
- local supplements at `knowledge/screens/policy-search.hints.yaml`

Running `npm run refresh` on that slice should produce a fully `compiler-derived`, `approved` scenario with matching spec, trace, review, graph, and generated types.

## Follow-along mode

For operator-visible runs, use the headed path instead of relying on hidden environment variables.

- `npm run test:generated:headed` opens the emitted demo slice in a visible browser and executes the generated spec with `TESSERACT_INTERPRETER_MODE=playwright`.
- `npm run capture -- --headed` keeps the browser visible while refreshing a snapshot section.
- `node dist/bin/tesseract.js discover --url <url> --headed` keeps the browser visible while writing discovery scaffolds for a new screen.
