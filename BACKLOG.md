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

## Done in this direction-alignment slice

- shared `ExecutionPosture` with `interactive` and `ci-batch` execution profiles
- strict global no-write and baseline mode
- derived confidence overlay catalog at `.tesseract/confidence/index.json`
- bounded translation stage and typed translation receipts
- contract-driven widget/runtime diagnostics with locator rung and degraded-locator reporting
- workflow, review, inbox, graph, rerun-plan, and scorecard projection of resolution mode and overlay lineage
- operator inbox, approval flow, rerun planner, and flagship benchmark lane

## Next backlog by lane

### Intent and knowledge

1. Real Azure DevOps adapter behind `AdoSource`

Goal:

- keep the local fixture adapter for development and tests
- add the live ADO adapter as a replaceable infrastructure port

Success criteria:

- `sync` can pull real test cases deterministically
- local tests still run without network access
- snapshot content hashes remain stable across adapters

2. Knowledge authoring ergonomics for thin screens

Goal:

- reduce operator effort when a screen is repeatedly winning through translation or agentic fallback

Success criteria:

- workflow and inbox can point directly to missing screen-local hints, patterns, or widget contracts
- benchmark scorecards can group thin-knowledge hotspots by screen and field family
- proposal bundles stay aligned with trust-policy review targets

3. Confidence threshold tuning and decay policy

Goal:

- make approved-equivalent overlays trustworthy enough to lower operator load without hiding structural drift

Success criteria:

- thresholds are configurable by artifact class
- repeated failures can lower an overlay below threshold deterministically
- operators can inspect overlay lineage and trust-policy thresholds without reading code

### Resolution

4. Translation cache and evaluation harness

Goal:

- harden the structured translation bridge without turning it into open-ended prompt lore

Success criteria:

- translation receipts are cached by fingerprint
- benchmark and dogfood scorecards report translation hit rate and failure classes
- translation can be disabled cleanly for deterministic reproduction

5. Deterministic coverage expansion

Goal:

- increase `compiler-derived` and approved-knowledge resolution wins while keeping `lib/domain/inference.ts` closed-set and auditable

Success criteria:

- broader action phrase coverage
- more deterministic screen and element disambiguation
- stable precedence laws for hints, patterns, heuristics, overlays, and translation
- explicit exhaustion diagnostics when coverage runs out

6. Minimal rerun planning over overlay lineage

Goal:

- keep refresh, run, approve, and benchmark reruns as small as safely possible

Success criteria:

- planner consumes graph lineage, proposal lineage, and confidence overlay lineage
- output explains why each scenario, runbook, and projection was selected
- rerun sets stay stable and testable

### Execution

7. Widget family coverage expansion

Goal:

- grow runtime capability through widget contracts instead of ad hoc string checks

Success criteria:

- missing widget families are modeled as contracts before new handlers are added
- handlers in `lib/runtime/widgets/` stay thin and Playwright-only
- execution receipts remain typed and comparable across widget families

8. CI webhook integration for OutSystems Lifetime API

Goal:

- auto-trigger `ci-batch` runs when modules are published

Success criteria:

- clean exit codes and structured reports
- proposals generated but never auto-applied in CI
- run receipts, evidence, and confidence overlays accumulate for later operator review
- no realtime approval or apply behavior during CI execution

9. Runtime cost budgets and failure taxonomy

Goal:

- make CI and batch execution easier to reason about at scale

Success criteria:

- execution receipts expose actionable timing and cost buckets
- precondition failures and degraded-locator failures are classified consistently
- scorecards surface bottlenecks by runtime failure family

### Governance and projection

10. Operator cockpit over existing artifacts

Goal:

- turn inbox, workflow, trace, review, graph, and scorecards into one coherent operational surface

Success criteria:

- all projections agree on resolution mode, winning source, and overlay provenance
- operators can move from hotspot to approval to rerun plan without repo lore
- next-command recipes are emitted consistently

11. Proposal ranking in the offline optimization lane

Guardrails:

- outside the deterministic compiler path
- no direct canonical mutation
- must operate over stored trace and evidence corpora

Potential targets:

- locator repair ranking
- supplement proposal ranking
- translation candidate ranking
- benchmark-driven prompt tuning for bounded operator tasks

12. Benchmark expansion beyond the flagship slice

Goal:

- broaden the synthetic benchmark lane once the current scorecard is stable

Success criteria:

- additional benchmark apps can reuse the same field-awareness and drift metrics
- negative/posture expansions remain attributable to field family and source posture
- benchmark results stay comparable across runs and execution profiles

## Offline optimization and evaluation

This remains a distinct lane outside the deterministic compiler core. It is the right place for proposal ranking, translation scoring, prompt tuning, and benchmark analysis, but it must never become an implicit shortcut around provenance, precedence, or trust policy.

## Guardrails

- keep the deterministic substrate explicit and testable
- keep translation bounded and typed
- keep the runtime agent as the last non-human resolution stage, not the first
- treat confidence overlays as derived working knowledge, not canon
- keep CI batch mode non-interactive and approval-free
