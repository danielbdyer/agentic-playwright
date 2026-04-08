# Tesseract Backlog

> Status: Active - canonical master execution backlog for temporal-epistemic realization.

This is the master execution backlog for realizing the temporal-epistemic specification against the repository's current substrate. It is execution-first on purpose: it tells us what to finish, normalize, harden, and prove from here, while keeping the formal north star and the live implementation truth in view.

## Current State Contract

Read these four documents together:

- [README.md](README.md) for the operational overview and public model
- [docs/current-state.md](docs/current-state.md) for implementation truth
- [docs/convergence-backlog.md](docs/convergence-backlog.md) for the detailed substrate ledger
- [docs/archive/research/temporal-epistemic-specification-addendum.md](docs/archive/research/temporal-epistemic-specification-addendum.md) for the formal north star

This file answers:

- what order we execute work in
- why each tranche matters now
- how the temporal-epistemic addendum maps onto shipped and missing capabilities

`BACKLOG.md` is the canonical master backlog. `docs/convergence-backlog.md` remains the detailed implementation ledger for code-heavy substrate work and should not be duplicated here.

## Status Legend

- `implemented`: shipped and relied on by the current codebase
- `partially implemented`: live and useful, but not yet the only or final path
- `planned`: not shipped yet
- `superseded`: replaced by a better architectural approach

## Strategic Center

The repository now needs to satisfy four obligations together:

1. present a structurally legible surface
2. preserve semantic memory in a locally repairable way
3. turn unresolvedness into governed, high-leverage continuation objects
4. bend the economics of later work through compounding reuse

The six public lanes remain the operating vocabulary:

- `intent`
- `knowledge`
- `control`
- `resolution`
- `execution`
- `governance/projection`

The three architectural spines remain the main cross-cuts:

- `interface`
- `intervention`
- `improvement`

Use the lanes as tags and coordination language, not as the primary sequencing frame. The execution order below is by substrate leverage and dependency.

## Execution Profiles

The same execution profiles still apply:

| Profile | Agent presence | Approval | Use case |
| --- | --- | --- | --- |
| `ci-batch` | None. Fully deterministic. Evidence and proposals accumulate for later use. | Never. | CI, scheduled runs, headless regression. |
| `interactive` | Agent consumes inbox, proposals, and hotspots from prior runs. | Explicit per proposal. | Workbench, Codex, VS Code, operator sessions. |
| `dogfood` | Agent orchestrates discover -> compile -> run -> propose -> approve(gated) -> rerun. | Confidence-gated auto-approval within trust-policy thresholds. | Recursive hardening, benchmark, convergence work. |

All three profiles must continue to share the same pipeline and artifact envelope.

## Already True Now

These items are already live and must be treated as starting conditions, not invention-from-zero work:

| Workstream | Status | Notes |
| --- | --- | --- |
| Vitest split and runner separation | `implemented` | `test:unit` and `test:integration` are already distinct. |
| Role-affordance table | `implemented` | Role semantics are already modeled as the canonical interaction truth. |
| Runtime role-based dispatch | `implemented` | Runtime interaction already resolves role affordances first. |
| Affordance-driven synthesis | `implemented` | Translation-gap vocabulary, workflow-archetype classification, and scenario interaction verbs now derive from role-affordance families instead of widget-era verb tables. |
| Demo route knowledge | `implemented` | Reviewed demo route canon is checked in. |
| Route knowledge lane | `partially implemented` | Schema, loading, ranking, runtime use, and MCP route-entry projections are real; hardening is still underway. |
| Proposal enrichment | `partially implemented` | Enrichment metadata is normalized in part, but broader contract/reporting hardening remains. |
| Intervention receipts with handoff | `partially implemented` | `InterventionReceipt` already carries typed `handoff` structure, including chain metadata and richer continuation surfacing. |
| Logical proof measurement | `implemented` | Fitness, benchmark, scorecard, scorecard history, improvement-intelligence, and MCP surfaces now emit measured proof obligations plus theorem-baseline coverage (`direct` / `proxy` / `missing`). Direct observability, kernel/posture separability, affordance recoverability, factorability, recoverability, actor-chain coherence, and the decomposed `M` family (`surface-compressibility`, `surface-predictability`, `surface-repairability`, `participatory-repairability`, `memory-worthiness`) are now live on the surfaces that can support them honestly, and cohort trends now track theorem groups graduating from `missing` to `proxy` to `direct`. |
| Effective hit rate | `implemented` | It already functions as the scorecard gate when present. |
| Knowledge hit rate | `implemented` | It remains a live informational and diagnostic metric. |

Read older roadmap language as `finish adoption`, `normalize`, `harden`, or `expand`, not as greenfield introduction.

## Execution Epics

### Epic 0 - Backlog Truth Reconciliation

**Current state:** The repository already ships runner separation, role-affordance infrastructure, route canon, partial proposal normalization, partial handoff modeling, and `effectiveHitRate` while retaining `knowledgeHitRate`.

**Gap:** The master backlog still carries older lane-first and partially greenfield framing, which makes the top-level execution story lag both the code and the formal addendum.

**Execution focus:**

- rewrite the backlog around current implementation truth and temporal-epistemic realization
- replace invention-from-zero phrasing with finish-adoption and hardening language
- state explicitly that `effectiveHitRate` is the primary acceptance gate
- state equally explicitly that `knowledgeHitRate` remains informational, diagnostic, and historically useful
- keep `docs/current-state.md` and `docs/convergence-backlog.md` as the live supporting surfaces

**Acceptance signals:**

- no backlog item describes shipped work as if it has not started
- `BACKLOG.md`, `README.md`, and `docs/current-state.md` tell the same story about what is live
- every epic is written with `Current state`, `Gap`, `Execution focus`, `Acceptance signals`, and `Lane tags`

**Lane tags:** `knowledge`, `governance/projection`, `intervention`, `improvement`

### Epic 1 - Structural Surface Completion

**Current state:** The role-affordance substrate, runtime role dispatch, route ranking and route selection, checked-in demo route canon, and affordance-driven synthesis are already live. Route knowledge hardening remains partial.

**Gap:** The repository still needs fuller structural legibility, route-entry canon, broader affordance adoption, clearer outcome and constraint observability, and stronger proof that moderate drift remains local and recoverable.

**Execution focus:**

- finish affordance-driven substrate adoption across synthesis, runtime, tests, and remaining coverage gaps
- complete route knowledge as governed dynamic-topology canon, including route-state and posture-entry coupling
- make outcome legibility, constraint manifestation, and bounded successor structure explicit workstreams
- strengthen reviewed route usage across runtime, discovery, proposal activation, and projection surfaces
- expand harness and proof coverage only where it closes real legibility, factorability, or recoverability gaps

**Acceptance signals:**

- law tests cover role derivation, affordance coverage, and route precedence
- integration tests prove direct role-based execution over the supported affordance families
- reviewed route knowledge is used as the normal navigation substrate for known demo states
- scorecards and review artifacts can distinguish route uncertainty, constraint effects, and outcome legibility failures

**Lane tags:** `knowledge`, `resolution`, `execution`, `control`, `interface`, `improvement`

### Epic 2 - Participatory Continuation and Handoff Integrity

**Current state:** `InterventionReceipt` already carries a typed `handoff`, requested participation modes exist, token-impact scaffolding exists, and proposal activation is already non-destructive for core hint semantics.

**Gap:** The handoff model is not yet fully validated as a continuation instrument. Minimal sufficient slices, status visibility, provenance retention, interpretive-boundary preservation, staleness, next-move preservation, and multi-actor drift detection still need to become first-class execution work.

**Execution focus:**

- harden handoff sufficiency, efficiency, and epistemic integrity around the addendum's `A` and `H` properties
- preserve status, provenance, requested participation, reversibility class, and semantic-core continuity across suspend -> handoff -> augmentation -> resume
- add capability and authority routing so interventions land on actors who can actually act
- preserve competing augmentations as structured candidate sets instead of accidental overwrite
- keep proposal semantics in this epic where they govern epistemic status, overwrite safety, and candidate preservation

**Acceptance signals:**

- schema and law tests cover handoff fields, status visibility, participation mode, staleness, and drift tokens
- continuation flows can resume without losing intent, exhaustion history, or provenance
- inbox, review, and MCP surfaces render the same handoff semantics without inventing alternative meanings
- conflicting augmentations for the same region persist as reviewable competing candidates

**Lane tags:** `resolution`, `execution`, `governance/projection`, `intervention`, `improvement`

### Epic 3 - Economic Compounding and Measurement

**Current state:** `effectiveHitRate` already exists as the scorecard gate when present, `knowledgeHitRate` is still emitted broadly, and fitness reporting already includes some runtime and comparison signals.

**Gap:** The repository does not yet measure the broader compounding economics described by the addendum, and most reporting is still too global to reveal where memory and intervention are actually paying off.

**Execution focus:**

- keep `effectiveHitRate` as the primary scorecard gate and operational success metric
- keep `knowledgeHitRate` as a live informational metric for convergence views, historical comparison, diagnostics, and improvement intelligence
- add first-class measures for ambiguity rate, suspension rate, target access cost, transition reuse, novelty burden, transfer value, seeded-vs-blank bootstrap cost, and intervention-adjusted impact
- partition reporting by screen, route family, affordance family, proposal category, and intervention source
- make accepted augmentations prove their value in the regions where they attach

**Acceptance signals:**

- scorecard and fitness types expose the new metrics without removing `knowledgeHitRate`
- the gate metric is consistently `effectiveHitRate` wherever acceptance is discussed
- convergence and historical views continue to expose `knowledgeHitRate` as a comparative signal
- at least one reporting surface can show regional improvement after accepted augmentations

**Lane tags:** `governance/projection`, `execution`, `knowledge`, `intervention`, `improvement`

### Epic 4 - Drift, Variance, and Recoverability Proof

**Current state:** The repository already has a structured-entropy lane, dogfood execution profiles, and early drift and route-state concepts. The proof story is still fragmented.

**Gap:** There is not yet a coherent empirical proof lane that connects replayable variance and drift exposure to the addendum's strongest falsifiers: semantic non-persistence, behavioral non-boundedness, variance explosion, opaque suspension, status collapse, economic flatness, and inert intervention.

**Execution focus:**

- recast structured entropy and dogfood variance as the empirical proving ground for recoverability and locality claims
- define replayable drift events and variance profiles that stress expression drift, affordance drift, posture drift, route drift, and bounded repair scope
- measure local repair cost against rediscovery cost under moderate non-semantic drift
- use the addendum's falsifiers as the evaluation language for benchmark and dogfood results
- keep this proof lane outside the deterministic compiler core

**Acceptance signals:**

- variance profiles are declarative, replayable, and measurable
- drift classifications and repair-scope evidence appear in receipts or scorecards
- proof runs can distinguish local repair wins from full rediscovery failures
- benchmark narratives can explain failures in the addendum's falsifier vocabulary instead of generic breakage

**Lane tags:** `control`, `execution`, `governance/projection`, `knowledge`, `improvement`

### Epic 5 - Operator, MCP, and Projection Surfaces

**Current state:** Review artifacts, inbox/workbench surfaces, MCP tools, and scorecards already exist and consume some resolution, proposal, and fitness fields.

**Gap:** The projection layer does not yet render the full temporal-epistemic payload uniformly. Status, provenance, participation mode, reversibility, drift status, staleness, token-to-impact, and competing candidates are not yet consistently visible everywhere they should be.

**Execution focus:**

- make operator, MCP, inbox, review, and scorecard surfaces consumers of the hardened substrate rather than sources of extra semantics
- render handoff-critical fields consistently across review, continuation, and recommendation surfaces
- ensure next-action recommendations and approval flows use the same status and provenance vocabulary as the core model
- position projection upgrades after substrate and metric hardening so surfaces report truth instead of compensating for missing structure

**Acceptance signals:**

- the same intervention or proposal renders with the same status, provenance, participation mode, and drift semantics across surfaces
- recommendation surfaces can explain why an item should be inspected, interpreted, verified, approved, enriched, or deferred
- no projection surface silently invents state that is not present in canonical or derived artifacts

**Lane tags:** `governance/projection`, `resolution`, `execution`, `intervention`, `improvement`

## Addendum Traceability Matrix

| Addendum group | Primary epic home | Main validation surfaces |
| --- | --- | --- |
| `K` - kernel properties | Epic 1 | law tests, runtime receipts, integration runs, review artifacts |
| `L` - legibility | Epic 1 | harness integration tests, discovery outputs, outcome/constraint review surfaces |
| `S` - semantic persistence | Epic 1 | hints/routes/schema laws, drift repair tests, canonical artifact reviews |
| `D` - dynamic topology | Epic 1 | route precedence tests, runtime navigation tests, successor and constraint diagnostics |
| `V` - structured variance | Epic 1 and Epic 4 | role/data/phase variance harnesses, route-state proofs, replayable variance profiles |
| `R` - drift and recoverability | Epic 1 and Epic 4 | drift classification tests, repair-vs-rediscovery measures, bounded repair evidence |
| `A` - participatory agency | Epic 2 | continuation flows, intervention schema tests, resume traces, inbox/MCP actionability |
| `H` - inter-actor handoff properties | Epic 2 and Epic 5 | handoff schema tests, review rendering checks, drift-token and provenance visibility |
| `C` - compounding economics | Epic 3 | fitness reports, scorecards, convergence proof, intervention impact measures |
| `M` - meta-properties | Epic 3, Epic 4, and Epic 5 | scorecards, benchmark narratives, operator views, memory-worthiness reporting |

## Guardrails

- Keep `BACKLOG.md` execution-first. The addendum is the north star, not the formatting template.
- Keep `docs/convergence-backlog.md` as the detailed code ledger instead of duplicating file-level work here.
- Treat `knowledgeHitRate` as informational and diagnostic everywhere; do not use it as the primary acceptance gate.
- Treat `effectiveHitRate` as the primary gate wherever acceptance, scorecard success, or promotion logic is discussed.
- Keep the deterministic compiler core explicit, auditable, and separate from the empirical proof lane.
- Keep the six public lanes and three spines as shared vocabulary across all backlog entries.
- Keep offline optimization and evaluation (DSPy, GEPA, prompt tuning, ranking models) in its own lane outside the deterministic compiler core, never as an implicit shortcut around provenance, precedence, or trust policy.

---

## Appendix: Lane-anchored work index

The epics above frame the strategic direction. This appendix preserves the concrete actionable items from the previous lane-first backlog so individual work units stay discoverable and addressable. Each entry is one line: `id` — name — `status` — primary acceptance signal. Items are grouped by lane and tagged with the epic that owns them.

Status legend: `done` (shipped), `live` (live and partially adopted), `pending` (not started), `superseded` (replaced by a different mechanism).

### Lane A — Agentic core

- **A1 ADR collapse: runtime interpretation replaces alias treadmill** — `done` (Epic 1) — runtime interpreter resolves step text from live DOM + knowledge priors; alias treadmill broken; receipts carry provenance.
- **A2 Confidence-gated auto-approval** — `live` (Epic 2) — `--auto-approve-above-threshold` and trust-policy gates wired; dogfood profile auto-approves within thresholds; receipts identical to manual approvals.
- **A3 Dogfood orchestrator command** — `live` (Epic 3) — `runDogfoodLoop` chains discover → compile → run → propose → approve → recompile → rerun with budget controls; emits ImprovementLoopLedger + dogfood-ledger compatibility projection.

### Lane B — Knowledge and discovery

- **B1 URL variant discovery and route knowledge** — `live` (Epic 1) — `knowledge/routes/{app}.routes.yaml` schema, runtime route selection, and discovery proposals shipped; broader projection hardening still in progress.
- **B2 Knowledge authoring ergonomics for thin screens** — `pending` (Epic 1) — workflow/inbox should point directly to thin-screen hotspots; benchmark scorecards should group thin-knowledge by screen + field family; aligned with trust-policy review targets.
- **B3 Confidence threshold tuning and decay policy** — `pending` (Epic 2) — thresholds configurable per artifact class; repeated failures lower overlay below threshold deterministically; time-based decay configurable but off by default.

### Lane C — Resolution and execution

- **C1 Translation cache and evaluation harness** — `live` (Epic 3) — translation receipts cached by fingerprint; benchmark/dogfood scorecards report translation hit rate and failure classes; translation can be disabled cleanly for deterministic reproduction.
- **C2 Widget family coverage expansion** — `done` (Epic 1) — replaced by role-affordance derivation. Widget contracts now derive from `lib/domain/widgets/role-affordances.ts` instead of hand-authored handlers per family.
- **C3 Runtime cost budgets and failure taxonomy** — `pending` (Epic 3) — execution receipts expose actionable timing/cost buckets; precondition and degraded-locator failures classified consistently; scorecards surface bottlenecks by runtime failure family.

### Lane D — Dogfooding and structured entropy

- **D1 Structured entropy harness for dogfooding variance** — `live` (Epic 4) — variance manifest schema and drift applicator shipped (`lib/application/drift/drift.ts`); dogfood runs parameterizable with variance profiles; each dimension produces measurable scorecard signal.
- **D1.5 Flywheel/speedrun progress reporting** — `live` (Epic 3) — `SpeedrunProgressEvent` envelope emits per-iteration metrics; sidecar `.tesseract/runs/{runId}.progress.jsonl` is tail-able; multi-seed runs report per-seed and aggregate progress.
- **D2 Benchmark expansion beyond the flagship slice** — `pending` (Epic 4) — additional benchmark apps reuse field-awareness/drift metrics; negative/posture expansions remain attributable to field family + source posture.
- **D3 Synthetic React app composer with salted drift** — `pending` (Epic 4) — controlled environment for measuring resilience against `Drift Events`; tagged + replayable; scorecard metrics comparable across drift profiles. Stays outside the deterministic compiler path.

### Lane E — Governance and projection

- **E1 Operator cockpit over existing artifacts** — `live` (Epic 5) — inbox, workflow, trace, review, graph, and scorecard projections agree on resolution mode, winning source, and overlay provenance; operators can move from hotspot → approval → rerun plan without repo lore.
- **E2 VSCode extension integration surface** — `pending` (Epic 5) — task provider for inbox items; problem matcher for proposal/hotspot file positions; Copilot Chat participant reading the same artifact files the CLI emits; degrades to read-only when no agent.
- **E3 Proposal ranking in the offline optimization lane** — `pending` (offline lane, NOT in compiler core) — locator repair ranking, supplement proposal ranking, translation candidate ranking, prompt tuning over stored trace + evidence corpora.

### Lane F — Infrastructure

- **F1 CI webhook integration for OutSystems Lifetime API** — `pending` (Epic 5) — auto-trigger `ci-batch` runs when modules are published; clean exit codes + structured reports; proposals generated but never auto-applied in CI.
- **F2 Deterministic coverage expansion** — `live` (Epic 1) — stable precedence laws for hints/patterns/heuristics/overlays/translation; explicit exhaustion diagnostics; knowledge coverage metrics in scorecard. Reframed by A1: as runtime interpretation handles novel phrasing, this shifts toward broader knowledge coverage that makes runtime interpretation cheaper.

### Cross-lane priority order (sequencing constraint)

| Order | Item | Why now |
|---|---|---|
| 1 | Phase 1 (epic-level) — MemoryMaturity, Cohort, RiskFormula | Unblocks honest measurement of every C-family obligation. |
| 2 | A2 + A3 hardening | Auto-approval and dogfood loop are the primary measurement substrate. |
| 3 | B1 + F2 finishing | Route knowledge and deterministic coverage gates. |
| 4 | D1 + D1.5 expansion | More structured entropy → more cohort comparability data. |
| 5 | B3 + C3 | Confidence decay + cost budgets close the trust loop. |
| 6 | E1 + E2 | Operator cockpit + VSCode integration. |
| 7 | D2 + D3 | Benchmark expansion + synthetic harness. |
| 8 | E3 + F1 | Offline optimization + CI webhooks (separate lane, separate cadence). |
