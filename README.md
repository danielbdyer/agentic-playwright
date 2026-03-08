# Tesseract

Tesseract is a deterministic preparation pipeline plus a knowledge-backed runtime agent for QA intent.

It ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, projects resolvable deterministic artifacts, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, and human oversight.

## What is canonical

Approved, reviewable inputs:

- `.ado-sync/`
- `scenarios/`
- `knowledge/surfaces/`
- `knowledge/screens/`
- `knowledge/patterns/`
- `knowledge/snapshots/`
- `.tesseract/evidence/`
- `.tesseract/policy/`

Derived outputs. Do not hand-edit:

- `.tesseract/bound/`
- `.tesseract/tasks/`
- `.tesseract/runs/`
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

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
- proposed new knowledge does
- `needs-human` is valid only after all non-human paths were exhausted

## Pipeline outputs

For each scenario, Tesseract projects deterministic preparation artifacts:

- `.tesseract/bound/{ado_id}.json`: bound envelope with `bound | deferred | unbound`
- `.tesseract/tasks/{ado_id}.resolution.json`: runtime task packet with intent, constraints, knowledge refs, and stable fingerprints

And it emits aligned review surfaces:

- `generated/{suite}/{ado_id}.spec.ts`: executable Playwright object code
- `generated/{suite}/{ado_id}.trace.json`: machine-readable derivation and execution trace surface
- `generated/{suite}/{ado_id}.review.md`: QA-facing review artifact
- `generated/{suite}/{ado_id}.proposals.json`: typed proposal bundle for supplemental changes

Runtime execution adds:

- `.tesseract/runs/{ado_id}/{run_id}/interpretation.json`
- `.tesseract/runs/{ado_id}/{run_id}/execution.json`
- `.tesseract/runs/{ado_id}/{run_id}/run.json`

The review artifact exists so a QA can answer:

- Did each `test.step()` preserve the original ADO wording?
- What did the deterministic preparation lane preserve or defer?
- What task packet did the runtime agent actually receive?
- Which approved files, supplements, and prior evidence were used?
- Did the agent resolve safely, resolve with proposals, or truly need a human?

## Deterministic precedence

Preparation and runtime search follow a fixed precedence order:

1. explicit scenario fields
2. approved screen knowledge and screen-local hints in `knowledge/screens/{screen}.hints.yaml`
3. promoted shared patterns in `knowledge/patterns/`
4. prior evidence and run history
5. live DOM exploration and safe degraded resolution
6. `needs-human`

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
npm run paths      # show canonical and derived artifact paths for one scenario
npm run surface    # inspect approved surface graph and derived capabilities
npm run graph      # rebuild the dependency/provenance graph
npm run trace      # return the scenario-centric subgraph
npm run impact     # return the impacted subgraph for a node id
npm run types      # regenerate lib/generated/tesseract-knowledge.ts
npm run capture    # capture or refresh ARIA snapshot knowledge
npm run build      # emit runtime artifacts with the build-only TS config
npm run typecheck  # strict repo-wide typecheck including tests
npm run lint       # typed lint over hand-authored sources
npm run check      # quiet build + typecheck + lint + test gate for local/CI use
npm run knip       # maintainer-only dependency hygiene scan
npm test           # run compiler/runtime/documentation laws
```

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
| `scenarios/{suite}/{ado_id}.scenario.yaml` | canonical scenario IR | canonical |
| `.tesseract/bound/{ado_id}.json` | bound scenario with provenance and governance | derived |
| `.tesseract/tasks/{ado_id}.resolution.json` | runtime task packet and knowledge handshake | derived |
| `.tesseract/runs/{ado_id}/{run_id}/run.json` | interpretation + execution receipts | derived |
| `generated/{suite}/{ado_id}.spec.ts` | executable object code | derived |
| `generated/{suite}/{ado_id}.trace.json` | machine derivation trace | derived |
| `generated/{suite}/{ado_id}.review.md` | QA review report | derived |
| `generated/{suite}/{ado_id}.proposals.json` | typed proposal bundle for human review | derived |
| `.tesseract/graph/index.json` | dependency and provenance graph | derived |

## What agents should inspect first

When working on a scenario, prefer this sequence:

1. `npm run paths`
2. `npm run trace`
3. `npm run impact`
4. `npm run surface`
5. `.tesseract/tasks/...resolution.json`
6. `generated/...review.md`

That sequence tells an agent:

- what is canonical
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
- resolved through live exploration with reviewable proposals
- still `unbound` because explicit structure contradicts approved knowledge
- blocked by `needs-human` after all non-human paths were exhausted

The graph, trace JSON, and review Markdown should all agree on that answer.

## Architecture summary

- `lib/domain`: pure values, validation, normalization, graph derivation, AST-backed codegen
- `lib/application`: Effect-based orchestration and port composition
- `lib/infrastructure`: filesystem, local ADO adapter, reporting adapters
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

Running `npm run refresh` on that slice should produce an `intent-only`, `deferred`, `approved` preparation state with matching task packet, spec, trace, review, graph, and generated types. Running `npm run run` should project runtime receipts, proposals, and a re-emitted review surface that shows what the agent actually resolved.

## Collaborative interface

Humans and agents should meet the system through the same typed seams:

- humans may author scenarios, explicit `resolution` overrides, hints, patterns, snapshots, and evidence
- agents may author those same canonical proposals, plus the task packets, run receipts, and generated tests that make their behavior reviewable
- a human-authored concern that fits the generated type surface should run through the same contract as an agent-authored concern
- generated specs are disposable object code, but the concern they encode should stay visible in scenario text, task packets, run receipts, and proposal bundles

The intended collaboration model is:

1. canonical intent stays human-readable
2. runtime handshakes stay machine-checkable
3. supplemental artifacts stay reviewable instead of hidden in runtime code
4. escalation stays exceptional rather than becoming the default operator path

During development, agent feedback about task granularity or missing context should also be treated as reviewable artifact material, not as hidden chat residue. If that loop is added, it should be non-blocking and scoped to unit-sized improvements to prompts, docs, or supplemental knowledge.

