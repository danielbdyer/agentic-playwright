# Tesseract

Tesseract is an inference-first compiler for QA intent.

It ingests Azure DevOps manual test cases, lowers them into scenario IR, binds them against approved screen knowledge, and emits disposable Playwright object code plus review artifacts. The goal is not to hand-author tests faster. The goal is to make executable verification a deterministic projection of upstream intent and approved knowledge.

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
- `.tesseract/graph/`
- `generated/`
- `lib/generated/`

## Governance boundary

Deterministic compiler derivations are auto-approved.

If a step binds from already approved artifacts through deterministic rules, it is emitted with:

- `confidence: compiler-derived`
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

## Compiler outputs

For each scenario, Tesseract emits three aligned review surfaces:

- `generated/{suite}/{ado_id}.spec.ts`: executable Playwright object code
- `generated/{suite}/{ado_id}.trace.json`: machine-readable derivation and execution trace surface
- `generated/{suite}/{ado_id}.review.md`: QA-facing review artifact

The review artifact exists so a QA can answer:

- Did each `test.step()` preserve the original ADO wording?
- Did the compiler infer the right action, screen, element, posture, and snapshot?
- Which approved files were used?
- Which steps were purely deterministic, and which depended on local hints or promoted patterns?

## Deterministic precedence

Binding and inference follow a fixed precedence order:

1. explicit scenario fields
2. screen-local hints in `knowledge/screens/{screen}.hints.yaml`
3. promoted shared patterns in `knowledge/patterns/`
4. deterministic heuristics over approved knowledge
5. `unbound`

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
npm run refresh    # sync -> parse -> bind -> emit -> graph -> types
npm run paths      # show canonical and derived artifact paths for one scenario
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
| `generated/{suite}/{ado_id}.spec.ts` | executable object code | derived |
| `generated/{suite}/{ado_id}.trace.json` | machine derivation trace | derived |
| `generated/{suite}/{ado_id}.review.md` | QA review report | derived |
| `.tesseract/graph/index.json` | dependency and provenance graph | derived |

## What agents should inspect first

When working on a scenario, prefer this sequence:

1. `npm run paths`
2. `npm run trace`
3. `npm run impact`
4. `npm run surface`
5. `generated/...review.md`

That sequence tells an agent:

- what is canonical
- what was derived
- what knowledge was used
- what changed
- what still needs a proposal instead of a code patch

## Bottleneck visibility

Bottleneck visibility is part of the product, not just diagnostics.

The system should make it obvious which steps are:

- `compiler-derived` from approved knowledge only
- dependent on screen-local hints
- dependent on promoted shared patterns
- still `unbound`
- blocked by missing canonical knowledge

The graph, trace JSON, and review Markdown should all agree on that answer.

## Architecture summary

- `lib/domain`: pure values, validation, inference rules, graph derivation, AST-backed codegen
- `lib/application`: Effect-based orchestration and port composition
- `lib/infrastructure`: filesystem, local ADO adapter, reporting adapters
- `lib/runtime`: locator resolution, widget interaction, execution interpreters
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

