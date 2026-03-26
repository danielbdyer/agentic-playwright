# Tesseract Backlog

## Current framing

The repo keeps the six public concern lanes:

1. intent
2. knowledge
3. control
4. resolution
5. execution
6. governance/projection

Inside that model, the active resolution ladder is now explicit:

1. deterministic substrate from scenario, control, and approved knowledge
2. approved-equivalent confidence overlays
3. structured translation over typed ontology candidates
4. runtime agentic DOM resolution
5. `needs-human`

Prior evidence feeds overlays, translation, and the runtime agent. It is not a separate winning tier.

The offline optimization and evaluation lane remains separate and must not contaminate the deterministic compiler core.

Three architectural spines cut across those lanes:

- `interface`: shared application structure, selectors, states, transitions, and provenance
- `intervention`: participants, sessions, approvals, reruns, review actions, and codebase-touching receipts
- `improvement`: experiments, objective vectors, scorecards, acceptance decisions, and checkpointed lineage

## Agentic surface model

The backlog assumes three execution profiles that share the same pipeline and artifact surface:

| Profile | Agent presence | Approval | Use case |
|---------|---------------|----------|----------|
| `ci-batch` | None. Fully deterministic. Evidence and proposals accumulate for later consumption. | Never. | CI, scheduled runs, headless regression. |
| `interactive` | Agent consumes inbox, proposals, and hotspots from prior runs. Initiates approve/rerun workflows. | Explicit per-proposal. | VSCode extension, Copilot Chat, operator workbench. |
| `dogfood` | Agent orchestrates discover → compile → run → propose → approve(gated) → rerun loop. | Confidence-gated auto-approval within trust-policy thresholds. | Self-hardening, benchmark, recursive improvement. |

The base case is always `ci-batch`: the full pipeline runs deterministically with no agent intervention, producing structured reports. The `interactive` and `dogfood` profiles layer agentic behavior on top without changing the compiler core.

When agentic capability is needed, the primary integration surface is the VSCode extension ecosystem (Copilot Chat, task providers, problem matchers). The agent discovers work through the same inbox, proposal, and hotspot artifacts that the CLI emits. This path degrades gracefully: when no agent is present, the artifacts sit on disk for later human or agent consumption.

All agentic orchestration must be agnostic to whether the agent is:

- a chained structured-data LLM API caller
- a VSCode Copilot extension reading the inbox
- a Claude Code session running CLI commands
- absent entirely (pure deterministic pipeline)

The contract surface is the artifact envelope, not the agent runtime.

## Done in this direction-alignment slice

- shared `ExecutionPosture` with `interactive` and `ci-batch` execution profiles
- strict global no-write and baseline mode
- derived confidence overlay catalog at `.tesseract/confidence/index.json`
- bounded translation stage and typed translation receipts
- contract-driven widget/runtime diagnostics with locator rung and degraded-locator reporting
- workflow, review, inbox, graph, rerun-plan, and scorecard projection of resolution mode and overlay lineage
- operator inbox, approval flow, rerun planner, and flagship benchmark lane
- real Azure DevOps adapter behind `AdoSource` with live and fixture modes

## Next backlog by lane

### Lane A — Agentic core (highest priority)

#### A1. ADR collapse: runtime interpretation replaces alias treadmill

Reference: `docs/adr-collapse-deterministic-parsing.md`

Goal:

- move step-text → intent interpretation from compile-time alias matching to runtime resolution grounded in the live DOM and knowledge priors
- break the alias treadmill so that novel ADO phrasing does not require canonical knowledge edits before execution

What stays deterministic:

- knowledge schema, locator ladders, posture contracts, capability derivation
- governance model (approved / review-required / blocked)
- provenance tracking and code generation from bound programs

What moves to runtime:

- step text → action/screen/element/posture interpretation
- screen identification from DOM context
- element resolution from instruction + live DOM + knowledge priors

Scaffolding constraint:

- the runtime interpreter must produce the same typed receipts and evidence drafts regardless of whether it is called by an LLM API chain, a VSCode extension agent, or a deterministic fallback path
- when no agent is present, `intent-only` steps emit structured `unresolved` receipts rather than blocking compilation
- the interpreter is a pure function from (step intent, knowledge catalog, DOM context) → (resolution receipt, evidence drafts, proposal drafts)

Success criteria:

- novel ADO test cases produce executable (if degraded) runs without requiring alias authoring first
- the knowledge system grows from agent execution, not from human synonym curation
- the review surface explains runtime interpretation with the same fidelity as compile-time inference
- agent sessions become measurably cheaper over time as the knowledge layer matures
- the pipeline degrades to structured reporting when no agent is available

#### A2. Confidence-gated auto-approval

Goal:

- allow proposals that meet trust-policy thresholds to flow into canonical knowledge without explicit human approval
- enable the `dogfood` execution profile

Design:

- add `--auto-approve-above-threshold` flag to the run and approve commands
- the trust-policy thresholds per artifact type remain the tuning surface
- `forbiddenAutoHealClasses` continue to block dangerous auto-approval (assertion-mismatch, structural-mismatch)
- auto-approved proposals generate the same approval receipts and rerun plans as manual approvals
- `ci-batch` profile never auto-approves (existing guardrail)
- `dogfood` profile auto-approves by default within thresholds
- `interactive` profile requires explicit opt-in

Success criteria:

- the outer loop (run → propose → approve → rerun) can execute unattended when proposals are low-risk and high-confidence
- operators can inspect every auto-approval through the same receipt and graph surfaces
- the trust-policy remains the single tuning surface for approval gates

#### A3. Dogfood orchestrator command

Goal:

- a single `npm run dogfood` command that chains the full self-hardening loop

Behavior:

1. discover (for specified URLs, not a spider)
2. sync (if ADO source configured)
3. compile --all
4. run --runbook (selected or default)
5. inbox (evaluate proposals and hotspots)
6. auto-approve (within trust-policy thresholds)
7. recompile affected scenarios
8. rerun affected scenarios
9. emit improvement run ledger, compatibility dogfood projection, and scorecard
10. repeat steps 4-9 until convergence or budget exhaustion

The orchestrator is a thin loop over existing CLI commands. It should now produce a canonical `ImprovementRun` plus a compatibility `Dogfood Run` projection (see `docs/dogfooding-flywheel.md`) that wraps the full exposure.

Budget controls:

- `--max-iterations` (default 3)
- `--max-cost` (token or time budget, when measurable)
- `--convergence-threshold` (stop when pass-rate improvement drops below threshold)

Success criteria:

- a Claude Code session or VSCode agent can invoke the full recursive-improvement loop with one command
- the ledger explains what improved, what was auto-approved, and what still needs human attention
- the command degrades to a single compile+run+report cycle when no agent is present

### Lane B — Knowledge and discovery

#### B1. URL variant discovery and route knowledge

Goal:

- persist discovered URL-to-screen mappings as knowledge primitives
- discover intermediate structural mappings: query string parameters, hash fragments, tab indices, and route segments that produce distinct UX outcomes

This is not a general-purpose spider. The operator provides known URL entry points. The system discovers variants within those entry points.

Knowledge artifacts:

- `knowledge/routes/{app}.routes.yaml` — maps URL patterns to screen IDs, query parameters to UX outcomes, tab indices to section views
- route knowledge feeds the discover and run commands so the system knows how to navigate to a screen in a specific state

Examples:

- `/policies?id=12345` → `policy-detail` screen with entity context
- `/policies?tab=claims` → `policy-detail` screen, claims tab active
- `/search?type=advanced` → `policy-search` screen, advanced mode

Success criteria:

- discovered URL variants are persisted as reviewable knowledge
- the runtime can use route knowledge to navigate to a screen in a target state before executing steps
- route knowledge participates in the same governance model as other knowledge artifacts

#### B2. Knowledge authoring ergonomics for thin screens

Goal:

- reduce operator effort when a screen is repeatedly winning through translation or agentic fallback

Success criteria:

- workflow and inbox can point directly to missing screen-local hints, patterns, or widget contracts
- benchmark scorecards can group thin-knowledge hotspots by screen and field family
- proposal bundles stay aligned with trust-policy review targets

#### B3. Confidence threshold tuning and decay policy

Goal:

- make approved-equivalent overlays trustworthy enough to lower operator load without hiding structural drift

Success criteria:

- thresholds are configurable by artifact class
- repeated failures can lower an overlay below threshold deterministically
- time-based decay is configurable but off by default
- operators can inspect overlay lineage and trust-policy thresholds without reading code

### Lane C — Resolution and execution

#### C1. Translation cache and evaluation harness

Goal:

- harden the structured translation bridge without turning it into open-ended prompt lore

Success criteria:

- translation receipts are cached by fingerprint
- benchmark and dogfood scorecards report translation hit rate and failure classes
- translation can be disabled cleanly for deterministic reproduction

#### C2. Widget family coverage expansion

Goal:

- grow runtime capability through widget contracts instead of ad hoc string checks

Success criteria:

- missing widget families are modeled as contracts before new handlers are added
- handlers in `lib/runtime/widgets/` stay thin and Playwright-only
- execution receipts remain typed and comparable across widget families

#### C3. Runtime cost budgets and failure taxonomy

Goal:

- make CI and batch execution easier to reason about at scale

Success criteria:

- execution receipts expose actionable timing and cost buckets
- precondition failures and degraded-locator failures are classified consistently
- scorecards surface bottlenecks by runtime failure family

### Lane D — Dogfooding and structured entropy

#### D1. Structured entropy harness for dogfooding variance

Goal:

- increase the diversity and value of dogfood exposures by injecting controlled variance into the system's inputs, not just into the DOM

The more structured entropy the system encounters, the faster its knowledge layer hardens. Variance should be deliberately introduced at multiple levels:

Input variance (what the system sees):

- ADO step phrasing variants for the same intent (synonym injection, passive voice, abbreviated forms)
- data posture combinations that exercise boundary conditions
- screen state permutations (empty, populated, error, loading)
- navigation path variants to the same screen (direct URL, breadcrumb, menu, deep link)

Structural variance (what the DOM looks like):

- salted accessible-name changes
- layout changes without semantic changes
- widget swaps that preserve user intent (dropdown → combobox, text input → search input)
- validation-flow timing changes
- result-grid shape changes (column reorder, pagination changes)

Execution variance (how the system runs):

- runbook variant selection (different subsets of the same suite)
- interpreter mode toggles (deterministic-only vs translation-enabled vs full-agentic)
- confidence threshold sweeps (strict vs permissive trust policy)
- resolution precedence overrides (force fallback to lower rungs)

Each variance dimension is a `Drift Event` (see `docs/dogfooding-flywheel.md`). Drift events are tagged, replayable, and measured through the same scorecard surface.

Success criteria:

- dogfood runs can be parameterized with variance profiles
- each variance dimension produces measurable signal in the scorecard (not just pass/fail, but resolution cost, knowledge churn, and proposal volume)
- the system demonstrably hardens faster with diverse exposure than with repeated identical runs
- variance profiles are declarative artifacts, not code changes

#### D1.5. Flywheel/speedrun progress reporting

Goal:

- emit structured, incremental progress events during long-running flywheel and speedrun processes so that operators and agents can monitor execution without waiting for final output

Currently the dogfood loop, speedrun, and evolve scripts emit output only at the start and end of a run. A 100-scenario, 5-iteration cold-start speedrun can run for 30+ minutes with no intermediate signal. Both human operators and agentic sessions need visibility into where the process is and what it has accomplished so far.

Design:

- define a `ProgressEvent` envelope: `{ kind: 'progress', phase, iteration, completedScenarios, totalScenarios, currentMetrics, elapsed, estimatedRemaining }`
- emit progress events at natural milestones: iteration start/end, scenario batch completion (every 10-25 scenarios), convergence check, knowledge activation, proposal generation
- write progress to a well-known sidecar file (e.g., `.tesseract/runs/{runId}.progress.json`) that can be tailed or polled
- emit the same events to stderr as human-readable lines when running in a terminal
- for multi-seed runs, report per-seed progress and aggregate progress
- include current fitness metrics (hit rate, resolution distribution, failure mode counts) in each progress event so partial results are visible before completion

Success criteria:

- an agent or operator can determine the current phase, iteration, and approximate completion percentage of any running flywheel/speedrun/evolve process
- progress events include enough metric detail to decide whether to wait, cancel, or adjust parameters
- progress reporting adds no measurable overhead to the pipeline
- the sidecar file is a valid JSON array that can be consumed programmatically at any point during execution

#### D2. Benchmark expansion beyond the flagship slice

Goal:

- broaden the synthetic benchmark lane once the current scorecard is stable

Success criteria:

- additional benchmark apps can reuse the same field-awareness and drift metrics
- negative/posture expansions remain attributable to field family and source posture
- benchmark results stay comparable across runs and execution profiles

#### D3. Synthetic React app composer with salted drift

Goal:

- compose discoverable application contexts on demand, then inject replayable change over time

This is a future benchmark harness, not a core product dependency. It is the controlled environment for measuring resilience against `Drift Events`.

Success criteria:

- drift events are tagged and replayable
- scorecard metrics are comparable across drift profiles
- the composer stays outside the deterministic compiler path

### Lane E — Governance and projection

#### E1. Operator cockpit over existing artifacts

Goal:

- turn inbox, workflow, trace, review, graph, and scorecards into one coherent operational surface

Success criteria:

- all projections agree on resolution mode, winning source, and overlay provenance
- operators can move from hotspot to approval to rerun plan without repo lore
- next-command recipes are emitted consistently

#### E2. VSCode extension integration surface

Goal:

- expose the inbox, proposals, hotspots, and rerun plans through VSCode extension APIs so that Copilot Chat or a custom extension can discover and act on them

Design:

- task provider that surfaces inbox items as VSCode tasks
- problem matcher that maps proposal and hotspot locations to file positions
- Copilot Chat participant that can query the knowledge layer, inspect proposals, and invoke approve/rerun commands
- all integration reads from the same artifact files the CLI produces

Success criteria:

- a Copilot Chat session can orient itself through artifacts without running the full CLI
- the extension degrades to a read-only artifact viewer when no agentic capability is available
- the extension does not introduce new domain concepts or artifact types

#### E3. Proposal ranking in the offline optimization lane

Guardrails:

- outside the deterministic compiler path
- no direct canonical mutation
- must operate over stored trace and evidence corpora

Potential targets:

- locator repair ranking
- supplement proposal ranking
- translation candidate ranking
- benchmark-driven prompt tuning for bounded operator tasks

### Lane F — Infrastructure

#### F1. CI webhook integration for OutSystems Lifetime API

Goal:

- auto-trigger `ci-batch` runs when modules are published

Success criteria:

- clean exit codes and structured reports
- proposals generated but never auto-applied in CI
- run receipts, evidence, and confidence overlays accumulate for later operator review
- no realtime approval or apply behavior during CI execution

#### F2. Deterministic coverage expansion

Goal:

- increase `compiler-derived` and approved-knowledge resolution wins while keeping `lib/domain/inference.ts` closed-set and auditable
- this item is reframed by A1: as runtime interpretation takes over, the deterministic coverage goal shifts from "broader alias matching" to "broader knowledge layer coverage that makes runtime interpretation cheaper"

Success criteria:

- stable precedence laws for hints, patterns, heuristics, overlays, and translation
- explicit exhaustion diagnostics when coverage runs out
- knowledge coverage metrics in the scorecard

## Priority order

The primary sequencing constraint is that A1 (ADR collapse) unblocks A2 and A3, which together enable the dogfood loop. Everything else can proceed in parallel.

| Priority | Item | Depends on | Unblocks |
|----------|------|------------|----------|
| 1 | A1 — ADR collapse | — | A2, A3, D1, F2 |
| 2 | A2 — Confidence-gated auto-approval | A1 | A3 |
| 3 | A3 — Dogfood orchestrator | A1, A2 | D1, D2 |
| 4 | B1 — URL variant discovery | — | D1 |
| 5 | D1 — Structured entropy harness | A3, B1 | D1.5, D2, D3 |
| 5.5 | D1.5 — Flywheel/speedrun progress reporting | — | — |
| 6 | B3 — Confidence decay | — | A2 refinement |
| 7 | E2 — VSCode extension surface | — | interactive profile |
| 8 | B2 — Thin-screen ergonomics | — | — |
| 9 | C1 — Translation cache | — | — |
| 10 | C2 — Widget family expansion | — | — |
| 11 | C3 — Cost budgets and failure taxonomy | — | — |
| 12 | E1 — Operator cockpit | — | — |
| 13 | E3 — Proposal ranking | A3 | — |
| 14 | D2 — Benchmark expansion | A3 | D3 |
| 15 | D3 — Synthetic React composer | D2 | — |
| 16 | F1 — CI webhook | — | — |
| 17 | F2 — Deterministic coverage | A1 | — |

## Offline optimization and evaluation

This remains a distinct lane outside the deterministic compiler core. It is the right place for proposal ranking, translation scoring, prompt tuning, and benchmark analysis, but it must never become an implicit shortcut around provenance, precedence, or trust policy.

## Guardrails

- keep the deterministic substrate explicit and testable
- keep translation bounded and typed
- keep the runtime agent as the last non-human resolution stage, not the first
- treat confidence overlays as derived working knowledge, not canon
- keep CI batch mode non-interactive and approval-free
- the agent integration surface is the artifact envelope, not the agent runtime
- all execution profiles share the same pipeline and artifact types
- agentic orchestration must degrade gracefully to deterministic reporting
