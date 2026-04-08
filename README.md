# Tesseract

Tesseract is an interface intelligence and agent workbench system for QA intent.

It still includes a deterministic preparation pipeline, a bounded translation bridge, and a knowledge-backed runtime agent, but those are now consumers of a deeper shared model: the interface graph, the selector canon, the state transition topology, typed participants and interventions, and governed improvement lineage.

Tesseract ingests Azure DevOps manual test cases, preserves their wording as canonical scenario IR, harvests application reality into a shared interpretation surface, and emits disposable Playwright object code plus review surfaces. The goal is not to hand-author tests faster. The goal is to make executable verification a transparent collaboration loop between approved knowledge, runtime interpretation, human oversight, and durable interface intelligence.

The authoritative architecture doctrine lives in `docs/master-architecture.md`.

Operator workflows are documented in `docs/operator-handbook.md`.

The implementation-truth snapshot lives in `docs/current-state.md`.

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
- `knowledge/routes/`
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
- `knowledge`: `knowledge/surfaces/`, `knowledge/screens/`, `knowledge/patterns/`, `knowledge/snapshots/`, `knowledge/routes/`
- `control`: `controls/datasets/`, `controls/resolution/`, `controls/runbooks/`
- `resolution`: `.tesseract/tasks/` plus runtime interpretation receipts
- `execution`: runtime execution receipts and run records
- `governance/projection`: generated review surfaces, graph outputs, and trust-policy gates

Every cross-lane handoff is carried as a typed envelope with `kind`, `version`, `stage`, `scope`, `ids`, `fingerprints`, `lineage`, `governance`, and `payload`.

Route knowledge is part of the governed navigation substrate, not a transient discovery sidecar.

Those six lanes remain the operating vocabulary. Architecturally, three cross-cutting spines now cut through them:

- `interface`: shared application structure, targets, selectors, states, and transitions
- `intervention`: typed participants, sessions, approvals, reruns, and codebase-touching workbench receipts
- `improvement`: experiments, objective vectors, scorecards, acceptance decisions, and checkpointed lineage

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
- schema-valid runtime-acquired canonical knowledge activates immediately and is tagged `uncertified` or `certified`
- `needs-human` is valid only after all non-human paths were exhausted

## Pipeline outputs

For each scenario, Tesseract projects deterministic preparation artifacts:

- `.tesseract/bound/{ado_id}.json`: bound envelope with `bound | deferred | unbound`
- `.tesseract/tasks/{ado_id}.resolution.json`: runtime task packet with intent, constraints, knowledge refs, graph refs, selector refs, and stable fingerprints
- `.tesseract/tasks/{ado_id}.runtime.json`: runtime handoff with selected steps, resolution context, controls, fixtures, and posture

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
- `.tesseract/runs/improvement-loop-ledger.json`
- `.tesseract/confidence/index.json`
- `.tesseract/interface/index.json`
- `.tesseract/interface/selectors.json`
- `.tesseract/sessions/{sessionId}/session.json`
- `.tesseract/sessions/{sessionId}/events.jsonl`
- `.tesseract/learning/manifest.json`
- `.tesseract/benchmarks/improvement-ledger.json`
- `.tesseract/inbox/index.json`
- `.tesseract/policy/approvals/{proposal_id}.approval.json`
- `.tesseract/benchmarks/{benchmark}/{run_id}.benchmark-improvement.json`
- `.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json`

The review artifact exists so a QA can answer:

- Did each `test.step()` preserve the original ADO wording?
- What did the deterministic preparation lane preserve or defer?
- What task packet did the runtime agent actually receive?
- Which approved files, supplements, interface graph bindings, and prior evidence were used?
- Did the agent resolve safely, resolve with proposals, or truly need a human?

## Resolution ladder

Resolution precedence is the core of the system. It determines how each scenario step gets resolved from intent to executable action. The ladder has 11 rungs, walked in order — the first match wins.

| Rung | Source | Description |
|------|--------|-------------|
| 1 | `explicit` | Explicit scenario fields that override everything |
| 2 | `control` | `controls/resolution/*.resolution.yaml` tuning overrides |
| 3 | `approved-screen-knowledge` | Approved screen elements, hints, and deterministic heuristics |
| 4 | `shared-patterns` | Cross-screen `knowledge/patterns/*.yaml` reusable patterns |
| 5 | `prior-evidence` | Prior successful evidence and runtime observations |
| 6 | `semantic-dictionary` | Learned intent→target mappings from prior resolutions (see below) |
| 7 | `approved-equivalent-overlay` | High-confidence derived overlays from `.tesseract/confidence/index.json` |
| 8 | `structured-translation` | LLM structured translation over typed ontology candidates |
| 9 | `live-dom` | Live DOM exploration and safe degraded resolution |
| 10 | `agent-interpreted` | Agent interpreter final fallback |
| 11 | `needs-human` | Explicit blocker — all non-human paths exhausted |

Rungs 1–5 use approved or pre-existing knowledge (no LLM call). Rung 6 uses learned associations. Rungs 7–10 involve active inference. Rung 11 is an explicit failure receipt.

The precedence law is defined in `lib/domain/precedence.ts` and enforced by law tests. If you change the rung order, you change compiler semantics.

### Semantic dictionary (rung 6)

The semantic dictionary is a learning flywheel that accumulates successful resolution decisions and replays them for semantically similar intents — without an LLM call.

**How it works:**

1. A scenario step like "Click Search button" reaches the resolution ladder
2. Rungs 1–5 miss (no explicit binding, no approved knowledge for this exact intent)
3. Rung 6 queries the semantic dictionary: does any prior resolution match this intent?
4. Match found → reuse the stored target (action, screen, element), bump confidence
5. Match not found → fall through to rung 8+ (structured translation via LLM)
6. After successful resolution at any rung, the decision is accrued into the dictionary
7. On execution failure, the dictionary entry's confidence decays

**Similarity engine:**

- Token-level Jaccard similarity + TF-IDF cosine scoring via a shingle index
- Inverted index maps shingles → entry IDs for O(Q) candidate lookup (not O(N) scan)
- Multi-dimensional scoring: text similarity (0.45), structural compatibility (0.25), confidence history (0.30)
- Combined score threshold: 0.35 to reuse an entry

**Promotion to approved knowledge:**

High-confidence dictionary entries (≥0.8 confidence, ≥3 successful reuses) are promoted to approved screen knowledge (`knowledge/screens/*.hints.yaml`), graduating from rung 6 to rung 3 permanently.

**Persistence:** `.tesseract/semantic-dictionary/index.json` with advisory file locking, 4096-entry cap, 90-day TTL for stale promoted entries.

See `docs/semantic-dictionary.md` for the full technical reference.

### Other precedence laws

Data resolution:

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

Route navigation:

1. explicit scenario URL
2. runbook route binding
3. approved route knowledge
4. screen canonical URL fallback

These orders are part of the product. They must stay stable and testable.

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

The repo is intentionally CLI-first. All commands go through `node dist/bin/tesseract.js <command>` (or `npm run <alias>`).

### Pipeline — compilation and execution

```powershell
npm run refresh    # full pipeline: sync → parse → bind → task → emit → graph → types
npm run run        # runtime pipeline: interpret → execute → evidence → proposals → re-emit → graph
npm run compile    # compile one scenario (parse → bind → task → emit)
npm run sync       # sync ADO cases to .ado-sync/snapshots/
npm run parse      # parse one scenario from canonical YAML
npm run bind       # bind scenario with knowledge (add --strict for strict mode)
npm run emit       # emit generated artifacts for one scenario
npm run generate   # generate synthetic scenarios from seed templates
```

### Inspection — analysis and visibility

```powershell
npm run workflow   # inspect lane ownership, controls, precedence, and fingerprints
npm run paths      # show canonical and derived artifact paths for one scenario
npm run inbox      # project operator inbox from proposals, degraded locators, and needs-human steps
npm run trace      # return the scenario-centric subgraph from the dependency graph
npm run impact     # return the impacted subgraph for a node id
npm run surface    # inspect approved surface graph and derived capabilities
npm run graph      # rebuild the dependency/provenance graph
npm run types      # regenerate lib/generated/tesseract-knowledge.ts
```

### Knowledge — discovery and capture

```powershell
npm run capture    # capture or refresh ARIA snapshot knowledge
npm run discover   # discover screen structure from a live URL (add --headed for visible browser)
npm run harvest    # harvest interface intelligence from execution evidence
```

### Approval — governance and rerun

```powershell
npm run approve    # apply an approved proposal patch and emit a rerun plan
npm run rerun-plan # compute the smallest safe rerun set for one proposal id
```

`certify` is an alias for `approve`.

### Benchmarks and improvement

```powershell
npm run benchmark  # execute flagship benchmark lane and emit scorecards
npm run scorecard  # reproject latest benchmark scorecard without running
npm run dogfood    # run the internal dogfood improvement loop
npm run speedrun   # rapid scenario generation + iteration with seed/substrate
npm run evolve     # evolutionary improvement over scenario populations
npm run experiments # run experimental improvement strategies
npm run workbench  # interactive workbench for scenario development
npm run replay     # replay a previous run from stored receipts
```

### Dashboard and MCP server

```powershell
npm run dashboard       # start the visual dashboard server
npm run dashboard:live  # dashboard with continuous speedrun (50 iterations)
```

The MCP server exposes the same data as the dashboard for agent consumption:

```powershell
node dist/bin/tesseract-mcp.js          # start MCP server (stdio, JSON-RPC)
node dist/bin/tesseract-mcp.js --root-dir /path/to/project  # custom root
```

See [Agent integration](#agent-integration-mcp) below for Claude Code / VSCode setup.

### Execution — generated specs against demo harness

```powershell
npm run test:generated        # execute emitted specs with Playwright interpreter
npm run test:generated:headed # same, with visible browser for operator follow-along
```

### Meta — build, lint, test

```powershell
npm run context    # print generated repo brief from current sources
npm run agent:sync # refresh docs/agent-context.md from current sources
npm run build      # emit runtime artifacts
npm run typecheck  # strict repo-wide typecheck including tests
npm run lint       # typed lint over hand-authored sources
npm run check      # quiet gate: build + typecheck + lint + test
npm run knip       # maintainer-only dependency hygiene scan
npm test           # run compiler/runtime/documentation law tests
```

### Common flags

| Flag | Effect |
|------|--------|
| `--ado-id <id>` | Target a specific scenario (default: `10001`) |
| `--strict` | Exit code 1 on any unbound step |
| `--headed` | Keep browser visible during execution |
| `--no-write` | Compute results but keep writes in would-write ledger |
| `--baseline` | Alias for `--no-write --interpreter-mode dry-run` |
| `--ci-batch` | Headless non-interactive; allow proposals, forbid approval |
| `--interpreter-mode <mode>` | `playwright`, `dry-run`, or `diagnostic` |
| `--execution-profile <profile>` | `interactive` or `ci-batch` |
| `--disable-translation` | Skip structured translation (rung 8) |
| `--disable-translation-cache` | Skip semantic dictionary (rung 6) |
| `--posture <posture>` | Knowledge posture: `cold-start`, `warm-start`, or `production` |
| `--max-iterations <n>` | Cap iteration count for dogfood/speedrun loops |
| `--seed <name>` | Seed template for speedrun/generate |
| `--screen <name>` | Filter by screen name |
| `--tag <tag>` | Filter scenarios by tag |

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

## Agent integration (MCP)

Tesseract exposes a Model Context Protocol (MCP) server so that Claude Code, VSCode Copilot, and other MCP-aware agents can interact with the dashboard, proposals, and browser programmatically.

### Setup

The repo includes a `.mcp.json` that registers the server automatically:

```json
{
  "mcpServers": {
    "tesseract-dashboard": {
      "command": "node",
      "args": ["dist/bin/tesseract-mcp.js"],
      "env": { "TESSERACT_ROOT": "." }
    }
  }
}
```

Claude Code and VSCode Copilot discover this file automatically. Run `npm run build` first so `dist/bin/tesseract-mcp.js` exists.

### Available MCP tools

**Observation:**

| Tool | Description |
|------|-------------|
| `list_probed_elements` | List elements from workbench with screen filter and pagination |
| `get_knowledge_state` | Get graph nodes/edges from `.tesseract/graph/index.json` |
| `get_screen_capture` | Get latest screenshot from cache |

**Workflow:**

| Tool | Description |
|------|-------------|
| `get_queue_items` | Get workbench items with status filter (pending/completed) |
| `decide_work_item` | Make a decision on a pending work item |

**Metrics and proposals:**

| Tool | Description |
|------|-------------|
| `get_fitness_metrics` | Get latest benchmark scorecard |
| `get_proposal_detail` | Get specific proposal details by ID |
| `get_scenario_trace` | Get scenario-specific subgraph |
| `list_proposals` | List proposals by status with pagination |
| `approve_work_item` | Approve a pending work item |
| `skip_work_item` | Skip a pending work item |

**Browser (Playwright bridge, headed mode only):**

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL |
| `browser_click` | Click an element by selector |
| `browser_fill` | Fill a form field |
| `browser_screenshot` | Capture screenshot (capped at 5MB) |
| `browser_aria_snapshot` | Get page accessibility snapshot |

All list tools return paginated envelopes: `{ items, total, offset, limit, hasMore }`.

### The agentic loop

An agent (Claude Code or VSCode Copilot) can close the full loop:

1. **Inspect** — `tesseract inbox --status actionable` to see what needs attention
2. **Understand** — read proposal details via MCP `get_proposal_detail` or `list_proposals`
3. **Approve** — `tesseract approve --proposal-id <id>` to accept a proposal
4. **Verify** — re-run the scenario to confirm the proposal resolves deterministically
5. **Observe** — semantic dictionary accrues the decision; future similar intents resolve without LLM

## Demo harness

The dogfood demo harness is a static HTTP server that serves mock insurance application screens:

- `dogfood/fixtures/demo-harness/server.cjs` — Node.js HTTP server on port 3100
- Screens: `policy-search.html`, `policy-detail.html`, `policy-journey.html`
- Auto-started by `playwright.config.ts` via `webServer` configuration

The seeded vertical slice uses ADO case `10001` against the policy-search screen. Running the full pipeline:

```powershell
npm run refresh                    # compile the scenario
npm run run                        # execute with runtime interpretation
npm run test:generated             # run emitted spec against demo harness
npm run test:generated:headed      # same, with visible browser
```

For rapid iteration with synthetic scenarios:

```powershell
npm run speedrun -- --seed ember-seed --count 20 --max-iterations 5
npm run dogfood -- --max-iterations 3
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
| `benchmarks/*.benchmark.yaml` | canonical benchmark field catalog, drifts, and runbook expansion rules | canonical |
| `controls/**/*.yaml` | canonical tuning surfaces for datasets, runbooks, and resolution overrides | canonical |
| `scenarios/{suite}/{ado_id}.scenario.yaml` | canonical scenario IR | canonical |
| `knowledge/routes/*.routes.yaml` | canonical route and entry-state knowledge for governed navigation | canonical |
| `.tesseract/bound/{ado_id}.json` | bound scenario with provenance and governance | derived |
| `.tesseract/tasks/{ado_id}.resolution.json` | runtime task packet and knowledge handshake | derived |
| `.tesseract/runs/{ado_id}/{run_id}/run.json` | interpretation + execution receipts | derived |
| `.tesseract/runs/improvement-loop-ledger.json` | canonical recursive-improvement loop ledger | derived |
| `.tesseract/confidence/index.json` | derived confidence overlay catalog and approved-equivalent working knowledge | derived |
| `.tesseract/interface/index.json` | derived application interface graph | derived |
| `.tesseract/interface/selectors.json` | derived selector canon | derived |
| `.tesseract/sessions/{sessionId}/session.json` | derived intervention/session ledger | derived |
| `.tesseract/learning/manifest.json` | derived improvement corpora manifest | derived |
| `.tesseract/benchmarks/improvement-ledger.json` | append-only recursive-improvement ledger | derived |
| `.tesseract/inbox/index.json` | derived operator inbox surface | derived |
| `.tesseract/policy/approvals/{proposal_id}.approval.json` | durable approval receipt | derived |
| `.tesseract/benchmarks/{benchmark}/{run_id}.benchmark-improvement.json` | canonical benchmark improvement projection | derived |
| `.tesseract/benchmarks/{benchmark}/{run_id}.dogfood-run.json` | compatibility benchmark projection over recursive-improvement runs | derived |
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
- resolved from approved screen knowledge or shared patterns at runtime (rungs 3–4)
- resolved from prior evidence (rung 5)
- resolved from the semantic dictionary without LLM call (rung 6)
- resolved from approved-equivalent confidence overlays (rung 7)
- resolved through structured translation over known ontology (rung 8)
- resolved through live DOM exploration with reviewable proposals (rung 9)
- resolved through agent interpretation as final fallback (rung 10)
- still `unbound` because explicit structure contradicts approved knowledge
- blocked by `needs-human` after all non-human paths were exhausted (rung 11)

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
