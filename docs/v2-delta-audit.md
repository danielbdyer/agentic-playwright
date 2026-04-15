# v2 Feature Delta Audit

> Status: factual audit — material deltas between the current codebase and [`docs/feature-ontology-v2.md`](feature-ontology-v2.md). Not a backlog, not a migration plan, not a recommendation set. Concrete module references accompany each delta so a reader can verify independently.

## How to read this

Each block follows a uniform shape: *what v2 describes*, *what v1 has (with module references)*, *the material delta*. "Essentially present" means the capability exists even if under a different name or envelope shape; minor implementation differences are not flagged.

The audit covers `feature-ontology-v2.md` §8 (Agent engagement, eight subsections) and §9 (Technical paths, twenty subsections). §1–§6 (primitives and levels), §7 (handshake surfaces), and §10–§12 (cross-cutting, evaluation, deferred) are not audited: §1–§7 are conceptual framings, and §10–§12 describe disciplines rather than implementable features.

A final section — **v1-specific subsystems** — enumerates major subsystems v2 deliberately omits or reframes, grouped thematically (canon + lookup chain, envelope substrate, governance + trust, theorem families + scoreboard, recursive improvement loop, operational surfaces). Each block carries the same four-field shape and covers scaffolding load-bearing in v1 but absent from v2's ontology.

Findings synthesized from eight parallel agent audits completed 2026-04-15.

## Verdicts

Every block carries a one-word verdict that classifies the relationship between v1's implementation and v2's description. The verdict is neutral — it does not rank one as better than the other.

- **Aligned** — the capability is present in both in substantively the same form. v1's implementation and v2's description agree on both shape and substance.
- **Shape-different** — the capability is present in both, but the envelope, distribution, or expression differs. No capability gap; the reader can treat the two as equivalent for decision-making about v2 design.
- **Partial in v1** — v1 implements some of what v2 describes. The missing bits are enumerated in the block's Delta.
- **Absent in v1** — v2 describes a capability; v1 has no analogous implementation. The Delta lists what would need to exist.
- **v1-only** — v1 has a capability v2's ontology does not describe. This is not necessarily a gap; one of three sub-tags clarifies intent:
  - *(migration scaffolding)* — exists to get from v1's current state to v2's end state; retires once the transition completes.
  - *(operational scaffolding)* — dogfood, CLI, or measurement machinery that serves v1's development workflow; orthogonal to v2's product surface.
  - *(innovation)* — a finer-grained distinction or mechanism v2 could inherit under shipping pressure. Worth weighing when v2 design decisions come up.

The Summary at the end gives verdict counts and a verdict-indexed directory back into the blocks.

## §8 Agent engagement

### §8.1 The ROI curve

**Verdict:** Shape-different.

**v2:** Three-stage cost shape (α/β/γ); early authoring is expensive; deterministic wins emerge as memory accrues; Stage β arrives through pattern emergence from Stage α receipts.

**v1:** M5 (Memory Worthiness Ratio) operationalizes the same ROI claim (`lib/domain/fitness/memory-maturity.ts`, `memory-maturity-trajectory.ts`). Floors locked in `docs/alignment-targets.md` §1 (1.0 → 1.2 → 1.5 across quarters). Status: `proxy`, not `direct` — requires ≥3 cohort-comparable history points before slope can be computed honestly.

**Delta:**
- v2's α/β/γ is narrative; v1's M5 is quantified but incomplete (proxy status).
- v2 prescribes the three-stage path; v1 measures payoff asymptotically.
- v1 has no authoring-session phase boundaries to distinguish Stage α work from Stage β.

### §8.2 The authoring session as process

**Verdict:** Partial in v1.

**v2:** Eight bounded phases — fluency intake, intent acquisition, memory consultation, world exploration, authoring, execution + evidence, memory write, closeout receipt.

**v1:** `AgentSession` (`lib/domain/handshake/session.ts`) tracks participants, interventions, and event types (`orientation`, `artifact-inspection`, `discovery-request`, `observation-recorded`, `spec-fragment-proposed`, `proposal-approved`, `proposal-rejected`, `rerun-requested`, `execution-reviewed`). Event taxonomy exists without phase-order enforcement.

**Delta:**
- Event types exist; phases do not.
- No timeout or scope-cut mechanics on exploration depth.
- Intervention receipts are not explicitly phase-bound.

### §8.3 The agent's decision surface

**Verdict:** Partial in v1.

**v2:** Five decision classes (interpretive, navigational, affordance, compositional, governance). Every decision writes a receipt with choices presented, pick, and reversal policy.

**v1:** `InterventionHandoff` (`lib/domain/handshake/intervention.ts`) captures `unresolvedIntent`, `attemptedStrategies`, `evidenceSlice`, a `blockageType` taxonomy (`target-ambiguity`, `locator-degradation`, `route-uncertainty`, `policy-block`, `recovery-gap`, `execution-review`, `knowledge-gap`, `self-improvement`), `requiredCapabilities`, `requiredAuthorities`, `blastRadius`, `epistemicStatus`, `semanticCore`, `nextMoves`, `competingCandidates`.

**Delta:**
- v1's taxonomy is *blockage reasons* (why the agent handed off), not *decision classes* (what the agent chose among).
- Receipts record effects but do not enumerate the choices presented.
- No explicit reversal-policy field at the decision level.

### §8.4 The implementation surface

**Verdict:** Partial in v1.

**v2:** Four artifacts — vocabulary manifest, decision handoffs, receipt logs, candidate queues / proposal logs.

**v1:**
- **Vocabulary manifest:** Absent. `.mcp.json` declares the `tesseract-dashboard` MCP server (`dist/bin/tesseract-mcp.js`); no per-verb manifest is emitted; introspection is not cheap.
- **Decision handoffs:** `InterventionHandoff` shape matches v2's intent, with `nextMoves: InterventionNextMove[]` supplying action suggestions. Handoff is *optional* on `InterventionReceipt` — many receipts do not carry one.
- **Receipt logs:** `InterventionReceipt` is append-only but not centralized as JSONL; serialization is implicit.
- **Candidate queues / proposal logs:** `BatchDecisionState` (`lib/domain/proposal/batch-decision.ts`) with states `pending | approved | skipped | auto-approved | blocked`. Activation path in `lib/application/knowledge/activate-proposals.ts`. Not uniformly log-structured at the domain-envelope level.

**Delta:**
- All four surfaces are scattered across domain and application layers; no unified "agent engagement" protocol.
- Handoff is optional rather than guaranteed.
- Receipts and proposals are implicit rather than explicit append-only JSONL.

### §8.5 Ten invariants

**Verdict:** Partial in v1 — 4 Aligned, 3 Partial, 3 Absent. Per-invariant breakdown below.

**v1 status per invariant:**

| # | Invariant | v1 status |
|---|---|---|
| 1 | Stable verb signatures | **Absent** — no verb registry; no ban on in-place mutation |
| 2 | Provenance at mint | **Strong** — `lib/domain/governance/provenance.ts`; threaded through envelopes |
| 3 | Append-only history | **Strong** — receipt logs + evidence logs |
| 4 | Named error families | **Partial** — `lib/domain/commitment/recovery-policy.ts` with `none / precondition-failure / locator-degradation-failure / environment-runtime-failure`; no `unclassified` |
| 5 | No silent escalation | **Mostly strong** — logging present but not formally guaranteed |
| 6 | Reversible agentic writes | **Partial** — `InterventionBlastRadius` includes `irreversible`; no hard prohibition |
| 7 | Source vocabulary preserved | **Strong** — doctrine + slot-1 operator-override discipline |
| 8 | One source of truth per concern | **Partial** — manifest absent |
| 9 | Cheap introspection | **Weak** — no manifest; full catalog load required |
| 10 | Structured fallthrough | **Strong** — `InterventionHandoff` shape matches |

**Delta:** 7/10 invariants honored cleanly; 3 absent or weak (verb signatures, cheap introspection, one-source guarantee).

### §8.6 Reversibility classes

**Verdict:** Shape-different.

**v2:** Self-reversing, proposal-gated, review-gated, hard-gated (no deletion verb).

**v1:** `InterventionBlastRadius` enum (`local | review-bound | global | irreversible`) maps loosely: `local`≈self-reversing, `review-bound`≈proposal/review-gated, `irreversible`≈hard-gated with operator review.

**Delta:**
- v1's framing is *blast radius* (scope of effect), not *reversal class* (undo mechanics).
- v1 has no explicit "no deletion verb" prohibition; `irreversible` is allowed under operator review rather than disallowed.

### §8.7 How engagement becomes determinism

**Verdict:** Absent in v1.

**v2:** Receipt accumulation → pattern accrual → Stage β deterministic resolution → drift pathway enriches future handoffs with prior receipts.

**v1:** Proposals can promote patterns via `lib/application/knowledge/activate-proposals.ts` and `discovery-proposal-bridge.ts`. No named "pattern promotion" mechanism; receipts are not wired to update decision tables.

**Delta:** The machinery exists but is not wired as v2 prescribes. Transition is aspirational in doctrine (CLAUDE.md, VISION.md), not operational in code.

## §9 Technical paths

### §9.1 Intent fetch

**Verdict:** Aligned.

**v2:** ADO REST v7.1 + PAT; WIQL query + workitems fetch; load-bearing field extraction; revision carried for drift reconciliation.

**v1:** `lib/infrastructure/ado/live-ado-source.ts` implements the exact REST path and field extraction. Transient error classification (`AdoTransientError`) distinguishes retry-worthy failures from auth / 404. Revision is carried in the snapshot.

**Delta:** Essentially present; no material gap.

### §9.2 Intent parse

**Verdict:** Aligned.

**v2:** XML regex extraction over `Microsoft.VSTS.TCM.Steps`; entity decode; per-step provenance; `intent-only` confidence at start; semantic ambiguity acknowledged at Stage α.

**v1:** `lib/infrastructure/ado/live-ado-source.ts` functions `extractStepBodies`, `parseSteps`, `extractParameterizedStrings`, `decodeXmlText`, `parseParameters`, `parseDataRows` implement the exact regex path. Snapshot shape `{ index, action, expected }` per step with lineage to ADO ID + revision.

**Delta:** Essentially present. Confidence marker is managed in a separate layer (`lib/domain/intent/types.ts`) rather than on the parse output envelope.

### §9.3 Navigate

**Verdict:** Partial in v1.

**v2:** `page.goto(url, { waitUntil, timeout })`; idempotence check via `page.url()`; discrete return envelope `{ reachedUrl, status, timingMs }`.

**v1:** Route classification (`lib/runtime/adapters/navigation-strategy.ts`) + goto invocation (`lib/runtime/execute/program.ts`). waitUntil selection is per-URL-pattern.

**Delta:**
- Missing: explicit `page.url()` idempotence check before goto.
- Missing: discrete `{ reachedUrl, status, timingMs }` envelope; outcome is embedded in the execution result rather than returned as its own envelope.

### §9.4 Observe

**Verdict:** Partial in v1.

**v2:** Accessibility snapshot (`interestingOnly: false`); locator ladder in priority order (role → label → placeholder → text → test-id → css); state probes; observation timestamp + ID.

**v1:** `lib/playwright/aria.ts` calls `page.accessibility.snapshot({ root, interestingOnly: false })`. Locator ladder in `lib/playwright/locate.ts` — strategy order test-id → role → css. Precondition probes (`lib/runtime/widgets/interact.ts`). Snapshot templating (`lib/runtime/observe/snapshots.ts`).

**Delta:**
- Ladder order differs: v1 places test-id before role and omits text-based rungs; v2 places role first and test-id after text. This is material for the first-match-wins rule under Playwright's best-practice recommendation.
- Missing: discrete observation timestamp / ID envelope.
- Missing: `placeholder` as an explicit ladder rung.

### §9.5 Interact

**Verdict:** Partial in v1.

**v2:** Role-keyed primitive actions (`click`, `fill`, `selectOption`, `check`, `press`, `hover`); pre-action state validation; four named failure families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`).

**v1:** `ROLE_AFFORDANCES` table (`lib/domain/widgets/role-affordances.ts`) maps ARIA roles to Playwright methods. `interact()` in `lib/runtime/widgets/interact.ts` validates visible / enabled / editable before action.

**Delta:**
- Dispatch style: table-based (v1) vs. enumerated (v2). Substance identical.
- Missing: explicit four-family error classification; in particular, no `assertion-like` family on the action handshake envelope.

### §9.6 Test compose

**Verdict:** Shape-different.

**v2:** AST-backed emission via `@playwright/test`; generated screen facade per screen; no inline selectors or data in test body; durable edits land in intent or memory.

**v1:** `lib/domain/codegen/spec-codegen.ts` emits tests via the TypeScript AST factory. Facades realized through `lib/composition/scenario-context.ts` — POM-like `ScreenContext` with runtime locator resolution via the screen registry. Data consumed via `resolveDataValue()` from fixtures. `test.step()` wrapping implemented.

**Delta:**
- Facade is runtime-instantiated via the screen registry rather than a pre-generated module file. Substance (no inline selectors, facet-keyed addressing) is identical.
- Step-title preservation and `test.step` wrapping match v2 obligations.

### §9.7 Test execute

**Verdict:** Partial in v1.

**v2:** Playwright CLI / programmatic API; per-run record at L0; L2+ tactical batch summary with classifications and closed-set `nextSteps` verbs.

**v1:** `lib/composition/scenario-context.ts` drives execution; `lib/application/commitment/build-run-record.ts` constructs `RunRecord` with step-level evidence and timestamps. `StepExecutionReceipt` (interpretation + execution) per step.

**Delta:**
- Missing: explicit per-run `classification` field (`product-pass | product-fail | test-malformed | transient | unclassified`) on the run-record envelope. Classification is embedded in step-level execution receipts rather than summarized on the run.
- Missing at L2+: tactical batch summary and closed-set `nextSteps` verb list. (Deferred in v2 to L2+; not an L0 gap.)

### §9.8 Verb declare / Manifest introspect / Fluency check

**Verdict:** Absent in v1.

**v2:** Build-generated JSON manifest listing stable verb signatures; session-start read; fluency tests run at product-test severity.

**v1:**
- **Verb declare:** Absent. No manifest file is generated from code.
- **Manifest introspect:** Absent. No session-start read.
- **Fluency check:** Absent. No fluency tests exist.

**Delta:** All three surfaces are absent. CLAUDE.md names the concept; code does not implement it. This is the single most material agent-facing gap in the audit.

### §9.9 Facet mint

**Verdict:** Shape-different.

**v2:** Per-screen YAML + in-memory index; provenance minted atomically (`mintedAt`, `instrument`, `agentSessionId`, `runId`); immutable for the life of the facet; append-only at L1.

**v1:** Split across two YAML shapes:
- `dogfood/knowledge/screens/*.elements.yaml` — `ElementSig { role, name?, testId?, cssFallback?, locator?, surface, widget, affordance?, required? }`.
- `dogfood/knowledge/screens/*.hints.yaml` — `ScreenElementHint { aliases, role?, affordance?, locatorLadder?, source?, epistemicStatus?, activationPolicy?, acquired? }`.

The `acquired` block (`CanonicalKnowledgeMetadata` in `lib/domain/knowledge/types.ts`) carries `certification`, `activatedAt`, `certifiedAt`, `lineage { runIds, evidenceIds, sourceArtifactPaths, role, state, driftSeed }`.

**Delta:**
- v1 splits facet records across two YAML files; v2 unifies.
- v1's `acquired` block conflates provenance (who / when) with activation and certification state.
- v1 has no `instrument` or `agentSessionId` field — producer identity is implicit via run-ID backreference, not forward-threaded.
- v1 has `driftSeed` with no v2 counterpart (likely L3 / L4 responsibility).

### §9.10 Facet query

**Verdict:** Shape-different.

**v2:** In-memory index queried by parsed intent phrase (kind / role / screen / roleVisibility); matches ranked by confidence, health as tiebreaker; parsed-constraint representation logged for debugging.

**v1:** Resolution runs through the six-slot lookup chain (`lib/domain/pipeline/lookup-chain.ts`; doctrine in `docs/canon-and-derivation.md` §6): `operator-override` → `agentic-override` → `deterministic-observation` → `reference-canon` → `live-derivation` → `cold-derivation`. Address-based, not intent-phrase-based; no intra-result ranking within a single slot.

**Delta:**
- v1 has no intent-phrase query layer; chain precedence *is* the ranking.
- v2 adds intra-result ranking by confidence and health.
- v1 has no parsed-constraint logging at query time.

### §9.11 Facet enrich

**Verdict:** Shape-different.

**v2:** Append-only evidence log per facet (`<facetId>.evidence.jsonl`); confidence derived from log on read; cached summary invalidated on new evidence.

**v1:** Evidence is step-keyed at `.tesseract/evidence/runs/{adoId}/{runId}/step-{index}-{index}.json` via `lib/application/commitment/persist-evidence.ts`. No per-facet evidence log. Confidence summaries stored directly on the facet's `acquired` block; not derived.

**Delta:**
- No per-facet evidence log.
- Confidence is materialized on the facet, not derived from a log on read.
- Enrichment is implicit in proposal activation rather than a first-class append operation on the facet.

### §9.12 Locator health track

**Verdict:** Shape-different.

**v2:** Per-strategy health co-located on the facet (`locatorStrategies: [{ kind, value, health: { successCount, failureCount, lastSuccessAt, lastFailureAt } }]`).

**v1:** Health is a separate index — `SelectorHealthIndex` (`lib/application/drift/selector-health.ts`) computed from `StepExecutionReceipt` observations. Carries `successRate`, `flakiness`, `trend` (improving / stable / degrading). Keyed by strings like `"test-id:rung0"` rather than by `{ kind, value }` tuple on the facet.

**Delta:**
- Separate index vs. co-located on locator strategies.
- v1 computes additional metrics (flakiness, trend) that v2 defers to L3.
- v1 is regeneratable from execution records; v2 requires health as a primary artifact because ladder-position metadata is not preserved in run records.

### §9.13 Drift emit

**Verdict:** Shape-different.

**v2:** Drift emitted as an observational event — `{ runId, facetId, strategyKind, mismatchKind, evidence, observedAt }` — appended to `drift-events.jsonl`; emitter classifies at emit time (`ambiguous` fallback when unclear).

**v1:** Drift is a *mutation verb*, not an emitted event (`lib/application/drift/drift.ts`). Drift types are mutation classes (`label-change | locator-degradation | element-addition | alias-removal`) that rewrite `elements.yaml` / `hints.yaml`. No `drift-events.jsonl`; no central drift log for L3 gating or operator review.

**Delta:**
- v1 drift is prescriptive (what to change); v2 drift is observational (what mismatched).
- No drift event log.
- No emitter classification with `ambiguous` fallback.

### §9.14 Dialog capture, Document ingest, Candidate review

**Verdict:** Absent in v1.

**v2:** LLM-assisted extraction of domain-informative turns from chat transcripts; parser-backed extraction from operator-shared documents with region anchors; candidate review queue with approve / edit / reject and preserved rejection rationale.

**v1:** `InterventionReceipt` (`lib/domain/handshake/intervention.ts`) is a broad catch-all covering orientation, artifact-inspection, discovery-request, observation-recorded, spec-fragment-proposed, proposal-approved / rejected, rerun-requested, execution-reviewed, operator-action, self-improvement-action. MCP server (`lib/infrastructure/mcp/dashboard-mcp-server.ts`) exposes `writeHint` / `writeLocatorAlias` tools but no dialog-capture or document-ingest pipeline.

**Delta:**
- No dialog capture or document ingest layer.
- No rejection log with captured rationale; rejected proposals disappear rather than conditioning future proposals.
- No operator-wording provenance or document-region anchoring in v1's schema.

### §9.15 Confidence age, Corroborate, Revision propose

**Verdict:** Absent in v1.

**v2:** Maintenance pass for decay over uncorroborated evidence logs; post-execution hook writes positive evidence to referenced facets; revision proposal aggregates drift + decay + corroboration into a reviewable JSONL.

**v1:** `lib/application/improvement/fitness.ts` computes pipeline fitness (hit rate, precision, recovery success). `lib/application/learning/learning-health.ts` computes bottleneck rankings. `lib/application/improvement/improvement.ts` builds `ImprovementRun` with objective vectors. No confidence-decay pass, no corroboration hook, no revision-proposal aggregation.

**Delta:** All three L4 processes absent. The fitness / improvement loop and the memory / corroboration loop are not integrated in v1 as v2 describes.

### §9.16 Facet schema sketch

**Verdict:** Shape-different.

**v2:** Unified facet record (`id`, `kind`, `displayName`, `aliases`, `role`, `scope`, `locatorStrategies + health`, `confidence`, `provenance`, `evidence-log reference`) with kind-specific extensions for element, state, vocabulary, route.

**v1:** Distributed across `elements.yaml` (`ElementSig`) and `hints.yaml` (`ScreenElementHint`). Element keys are local strings (e.g., `amendmentNumber`); no stable `<screen>:<element>` facet ID. No explicit `kind` field. No evidence-log reference.

**Delta:**
- No stable facet IDs.
- No explicit `kind` field.
- Schema split rather than unified.
- No evidence-log reference on the facet.

### §9.17 Affordance extension authoring

**Verdict:** Absent in v1.

**v2:** Agent proposes a composite affordance (`name`, `surfaceShape`, `observeSignature`, `actionChoreography`, `effectState`); lands in a proposal queue; operator approves; pattern becomes a reusable codified verb.

**v1:** `InteractionCapability` enum (`lib/domain/knowledge/affordance.ts`: `clickable | typeable | selectable | toggleable | scrollable | draggable | focusable | expandable | dismissable`) and `ElementAffordance` record (selector, role, tagName, capabilities, constraints). No extension-authoring flow. Affordances are hardcoded or inferred from the DOM; not proposable through the governance layer.

**Delta:** v1 has affordance *taxonomy* but not affordance *extension authoring*. The machinery to codify novel composite patterns (multi-select with chips, autocomplete with async suggestions) does not exist.

### §9.18 Selector and test-data indirection

**Verdict:** Aligned.

**v2:** Facet catalog is the sole selector source; fixture registry is the sole test-data source; generated facade per screen; one catalog update fixes N tests without touching test source.

**v1:** Generated specs use POM-style facades (`lib/domain/codegen/spec-codegen.ts`) with screen-scoped step methods; selectors do not appear in test bodies. Tests receive `fixtures` (typed array of names) via destructuring and consume `data.<field>` references. Runtime locator resolution through screen registry.

**Delta:** Essentially present and strong. v1 implements both requirements. Facade form differs (runtime-instantiated vs. pre-generated module file), but the indirection guarantee is honored.

### §9.19 Parametric expansion and fixture composition

**Verdict:** Aligned.

**v2:** Work-item data-source rows expand into parametric iterations; named fixture registry with declared lifecycle scope (per-test, per-file, per-worker); dynamic resolution at invocation.

**v1:** Work-item data rows parsed in `lib/domain/intent/types.ts` and fed into spec composition. Tests emitted with `test(name, async ({ page, ...fixtures }) => { ... })` receiving `data` bindings. Per-row provenance preserved. Fixtures declared as `readonly string[]` names, resolved at test invocation.

**Delta:** Essentially present. Per-iteration skip / focus policies and cross-fixture dependency resolution are deferred in both v1 and v2.

### §9.20 Scale behavior at thousands of tests

**Verdict:** Partial in v1.

**v2:** Token-conservative batch summary by default; `nextSteps` as closed-set verbs from manifest; paginated + filtered queries; rerun and flakiness classification with `flake-rate` annotations; runtime partitioning by shard, date, batch.

**v1:**
- **Token-conservative emissions:** Tactical summary shape exists in `lib/domain/execution/types.ts`; `InterventionNextMove[]` is the analog to `nextSteps`. Per-run records available on demand. Not uniformly token-bounded across all agent surfaces.
- **Paginated queries:** No centralized pagination handshake. Queries into run history, drift events, and proposals are ad-hoc file reads or application-layer filters.
- **Rerun and flakiness:** Recovery policies exist (`lib/domain/commitment/recovery-policy.ts`). Flakiness classification is incipient; no formal `flake-rate` annotation on batch summaries.
- **Runtime partitioning:** Generated artifacts partition by date and batch (CLAUDE.md §6.2). Playwright workers parallelize. Per-worker fixture isolation is not formally enforced.

**Delta:**
- Batch-summary machinery exists but is not uniformly token-bounded.
- No centralized pagination handshake.
- Flakiness is informal; no `flake-rate` annotation.
- Scale guarantees are aspirational rather than enforced.

## v1-specific subsystems

Subsystems load-bearing in v1 that `feature-ontology-v2.md` deliberately omits or reframes. These are not gaps against v2's spec; they are scaffolding the v2 ontology chose not to inherit. The framing line from agent 1 captures the thrust: *these subsystems are essential for reaching v2 from v1, not for operating v2 itself.*

Grouped thematically. Overlapping findings across the five agents are merged; where multiple agents surfaced the same concept from different angles, the consolidated block cites both.

### V1.1 Canon and lookup-chain architecture

#### Six-slot lookup chain

**Verdict:** v1-only *(migration scaffolding)*.

**Module references:** `lib/domain/pipeline/lookup-chain.ts` (interface + mode predicates); `docs/canon-and-derivation.md` §6 (doctrine); `LookupMode = 'warm' | 'cold' | 'compare' | 'no-overrides'`.

**What it does:** Six-slot precedence resolver — for a request "give me phase output X" — that walks slots 1→6 and returns the resolved artifact along with which slot satisfied the request: (1) operator-override, (2) agentic-override, (3) deterministic-observation, (4) reference-canon (transitional), (5) live-derivation, (6) cold-derivation. Slots 1–3 are canonical ground truth; slot 4 is pre-gate fallback; slots 5–6 are promotion candidates. Mode flags skip different slot ranges to test discovery-engine fidelity or measure migration debt.

**What it serves in v1:** Warm-start / cold-start interop without code branching — both modes call the same phase functions and differ only in which slots are consulted. The chain is the spine of the promotion / demotion loop: when deterministic observations beat agentic overrides, demotion is proposed; when agentic overrides fill gaps the discovery engine cannot bridge, they are written with receipt lineage.

**v2 analog:** **None — deliberately omitted.** v2 replaces address-based slot-precedence with an in-memory facet index ranked by confidence and health (§9.10). The six-slot chain is a v1 operational layer for managing the transitional period; v2 describes the end state (single catalog + derived confidence) rather than the migration path.

#### Reference-canon transitional slot and demotion clock

**Verdict:** v1-only *(migration scaffolding)*.

**Module references:** `docs/canon-and-derivation.md` §3.2a (reference-canon definition + exit paths), §6.4 (why slot 4 outranks derived output), §11 (classification of current `dogfood/` content), §14.0–14.2 (graduation condition). `PhaseOutputSource` enum (`lib/domain/pipeline/source.ts:45–66`) distinguishes `'reference-canon'` so fitness reports can exclude pre-gate entries from denominators.

**What it does:** Reference canon is committed YAML at canon-shaped paths authored before the promotion-gate and intervention-receipt infrastructure existed — hand-typed or agent-typed without a real provenance chain. During the migration window, reference canon is consulted at slot 4 as fallback when canonical artifacts are sparse. The demotion clock tracks three exits: (a) agentic override lands at the same address and outranks it, (b) deterministic observation is promoted at the same address and outranks it, or (c) the entry is deleted. When slot 4 is empty over a full cohort, the transitional layer is retired.

**What it serves in v1:** The measurable form of migration debt. Without reference canon, warm-start collapses into cold-start whenever canonical artifacts are sparse and the convergence signal becomes meaningless. With it, the split between "hit real canon" vs. "hit reference canon" is a clean measurement, and the demotion queue is a first-class tracked object.

**v2 analog:** **None — deliberately omitted.** v2 describes the end state after reference canon is empty; it does not prescribe the migration-window machinery of second-class pre-gate labeling or a demotion clock.

#### Mode flags for lookup precedence toggling

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `lib/application/cli/shared.ts:62, 378` (`--posture` flag); `docs/canon-and-derivation.md` §6.5; `LookupMode` union in `lib/domain/pipeline/lookup-chain.ts:64`.

**What it does:** Five CLI flags control which slots of the lookup chain are consulted: `--mode warm` (default; walk all), `--mode cold` (skip slots 3–5; respect overrides but run discovery), `--mode compare` (walk to slot 3, *also* run discovery, report diff), `--no-reference-canon` (orthogonal skip of slot 4), `--no-overrides` (skip slots 1–2). `--posture` (cold-start / warm-start / production) maps to execution context. Combining flags stresses edge cases: `--mode cold --no-overrides --no-reference-canon` is the strongest cold-start test (zero safety nets).

**What it serves in v1:** Operators can measure discovery-engine fidelity without throwing away operator intent. Hit-rate under `--no-reference-canon` is the migration-completion signal. Compare mode reveals what the discovery engine would produce versus what the warm run actually used, pointing at stale or incorrect canonical artifacts.

**v2 analog:** **None — deliberately omitted.** v2 does not model cold-start testing or migration-debt measurement as first-class CLI concerns. Both are operational v1 needs tied to the reference-canon transition.

### V1.2 Envelope-axis substrate (phantom types)

#### Four-axis phantom-type envelope

**Verdict:** Aligned — this *is* v2's envelope axis vocabulary in code (Phase 0 complete).

**Module references:** `lib/domain/governance/workflow-types.ts:194–213` (`WorkflowMetadata<S>`, `WorkflowEnvelope<T, S>`); `lib/domain/kernel/hash.ts:128–227` (`Fingerprint<Tag>`); `lib/domain/pipeline/source.ts:44–169` (`PhaseOutputSource`, `foldPhaseOutputSource`, `SOURCE_PRECEDENCE`); `lib/domain/handshake/epistemic-brand.ts:24–91` (`EpistemicallyTyped<T, S>`, `foldEpistemicStatus`).

**What it does:** Lifts the envelope axis vocabulary from runtime strings to compile-time phantom types. Every artifact in transit is pinned to a point in (`Stage` × `Source` × `Fingerprint-tag` × `Governance`) with compiler-enforced invariants. `WorkflowMetadata<S>` parameterizes artifacts by `WorkflowStage` literal (`'preparation' | 'resolution' | 'execution' | 'evidence' | 'proposal' | 'projection'`); `Fingerprint<Tag>` brands content-addressed IDs with closed-registry phantom tags (30+ tags); `PhaseOutputSource` carries the six-slot lookup-chain precedence with exhaustive `foldPhaseOutputSource`. Phase 0a–0d complete per `docs/envelope-axis-refactor-plan.md`; phases B–E deferred.

**What it serves in v1:** Eliminates runtime string confusion at seams (wrong-slot assignments, silent type drift, untagged fingerprint transpositions). Phantom types impose zero runtime cost while making envelope leakage impossible at the type level. Architecture-law test (`tests/architecture/governance-verdict.laws.spec.ts` Law 8) enforces zero ad-hoc governance comparisons.

**v2 analog:** **Essentially present — this *is* v2's envelope-axis vocabulary in code.** `docs/envelope-axis-refactor-plan.md` explicitly reverse-engineered from v2's framing. v2's "Envelope Axis Vocabulary" and the closed-registry discipline are architectural laws in both. Phases B–E remain in-flight on the v1→v2 convergence path.

#### Concrete envelope type hierarchy with stage narrowing

**Verdict:** Aligned.

**Module references:** `lib/domain/evidence/types.ts:71–141` (`StepExecutionReceipt extends WorkflowMetadata<'execution'>`), `:209–258` (`RunRecord extends WorkflowMetadata<'execution'>`); `lib/domain/execution/types.ts:105–109` (`ProposalBundle extends WorkflowMetadata<'proposal'>`); `lib/domain/resolution/types.ts:174–191` (`ScenarioInterpretationSurface extends WorkflowMetadata<'preparation'>`), `:622–694` (`ResolutionReceipt` variants).

**What it does:** Each concrete envelope subtype extends `WorkflowMetadata<S>` with a specific stage literal, so the compiler prevents a `RunRecord` from being passed where a `ProposalBundle` is expected. `ResolutionReceipt` is a four-variant discriminated union (`resolved`, `resolved-with-proposals`, `agent-interpreted`, `needs-human`) forcing exhaustive pattern-matching.

**What it serves in v1:** Code paths expecting a specific stage cannot silently accept a different one; "no default parameter" rule on `WorkflowMetadata` — every call site declares stage explicitly or uses a pre-narrowed concrete type.

**v2 analog:** **Essentially present; narrowing discipline matches v2.** The specific envelope names differ slightly (v1: `RunRecord`; v2: `ExecutionEnvelope`-shaped), but the constraint that stage is a required type parameter with no shim form is identical.

#### Envelope header field taxonomy

**Verdict:** Aligned.

**Module references:** `lib/domain/governance/workflow-types.ts:117–165` (`WorkflowEnvelopeIds`, `WorkflowEnvelopeFingerprints`, `WorkflowEnvelopeLineage`), `:194–202` (`WorkflowMetadata` fields).

**What it does:** Standardizes the envelope header across all stage transitions: `kind`, `version`, `stage`, `scope`, `ids` (scenario/run/step/suite), `fingerprints` (six typed slots: artifact, content, knowledge, controls, surface, run), `lineage` (sources, parents, handshakes, experimentIds), `governance` (`'approved' | 'review-required' | 'blocked'`), `payload`.

**What it serves in v1:** Reproducibility and traceability — content fingerprint changes when payload changes; knowledge fingerprint invalidates when the catalog mutates; surface fingerprint links back to resolved interface state. Every field read flows through typed predicates or `foldGovernance`, making policy drift impossible.

**v2 analog:** **Essentially identical.** v2's "Interpretation Surface" specifies the exact same header. v1 is the operational realization of that spec.

#### `Fingerprint<Tag>` as content-addressed identity

**Verdict:** Aligned.

**Module references:** `lib/domain/kernel/hash.ts:65–89` (`stableStringify` with deterministic key sorting and undefined-handling), `:91–93` (`sha256`), `:128–227` (`Fingerprint<Tag>` brand, closed `FingerprintTag` registry, `fingerprintFor`, `taggedFingerprintFor`), `:242–260` (`computeAdoContentHash`).

**What it does:** Content-addressed identifiers computed as `sha256(stableStringify(value))`, branded with phantom `FingerprintTag` to prevent transposition. Closed registry lists 30+ tags across envelope-level (artifact, content, surface, knowledge, controls, run), tier-level (atom-input, composition-input, projection-input), domain-specific (ado-content, snapshot, rerun-plan, explanation), and graph (graph-node, graph-edge, interface-graph).

**What it serves in v1:** Reproducible deduplication and drift detection. Two `RunRecord`s with identical content fingerprints are byte-equivalent. Knowledge fingerprint on a `RunRecord` invalidates cached analysis when the knowledge catalog mutates.

**v2 analog:** **Essentially present.** v2's `Fingerprint<Tag>` axis and closed-registry discipline are specified identically.

#### Epistemic branding — orthogonal to governance

**Verdict:** v1-only *(innovation)*.

**Module references:** `lib/domain/handshake/epistemic-brand.ts:24–91` (`EpistemicallyTyped<T, S>` discriminated union: `Observed`, `Interpreted`, `ReviewRequired`, `Approved`, `Blocked`, `Informational`; exhaustive `foldEpistemicStatus`); `:97–155` (`ObservedSource` / `InterpretedSource` enums; audited mint functions `mintObserved`, `mintInterpreted`, `mintInformational`).

**What it does:** Mirrors governance branding but classifies observations by provenance confidence rather than policy decision. `Observed<T>` is reserved for runtime-dom / execution-receipt / evidence-record sources; synthetic and agent-derived sources cannot mint `Observed`. An artifact can be `Observed` but not yet approved, or `Interpreted` and already approved.

**What it serves in v1:** Separates observational confidence from governance verdict. Enforces the "A2 (synthetic governability)" invariant via phantom types rather than by convention.

**v2 analog:** **None — v1-specific innovation.** v2 does not separate epistemic status from governance. Per the "complexity emerges" discipline, v1 identified a finer-grained distinction v2 does not prescribe.

### V1.3 Governance and trust architecture

#### Trust policy engine

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `.tesseract/policy/trust-policy.yaml`; `lib/domain/governance/trust-policy.ts` (pure evaluation); `lib/application/governance/trust-policy.ts:L23–100` (filter + dispatch); `lib/application/knowledge/activate-proposals.ts:L46–70` (gate invocation).

**What it does:** Declarative gate evaluating whether proposed artifacts may enter canonical storage. Three gates per artifact type: confidence threshold, required evidence count/kinds, forbidden auto-heal classes. Emits `allow | review | deny`. Per-artifact thresholds: element 0.95, posture 0.95, surface 0.95, snapshot 0.98, hint 0.90, pattern 0.95, route 0.95. Does not gate compiler-derived output or schema-valid runtime-acquired canon.

**What it serves in v1:** The contract-enforcement layer between proposals and the canonical artifact store. Load-bearing for the promotion path from observations + interventions → canon.

**v2 analog:** v2 names reversibility classes (§8.6) and "operator review at or above L2" for proposal-gated / review-gated writes, but does not materialize per-artifact-type thresholds or evidence-count rules. v1's trust policy is a binding v2 defers to shipping-stage choices.

#### Governance phantom brands

**Verdict:** Aligned — materializes v2 invariant 10 (structured fallthrough) as a compile-time guarantee.

**Module references:** `lib/domain/governance/workflow-types.ts:L8–54` (`Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`; `foldGovernance`); `tests/architecture/governance-verdict.laws.spec.ts` (architecture law 8 — zero ad-hoc comparisons).

**What it does:** Encodes governance state at the type level via phantom brands with `foldGovernance` exhaustive match. `Governance` is a string union for persistence; the brands are consumed exclusively through typed API (`isApproved`, `isBlocked`, `isReviewRequired`, `foldGovernance`). Missing cases are compile-time errors.

**What it serves in v1:** Type-safe governance dispatch across every envelope. Prevents silent handling mistakes at seams.

**v2 analog:** v2 names the three-state decision surface (§8.5 invariant 10 — structured fallthrough) but does not specify phantom encoding. v1's brands materialize a v2 invariant as a compile-time guarantee.

#### Confidence lattice — orthogonal to governance

**Verdict:** v1-only *(innovation)*.

**Module references:** `lib/domain/confidence/levels.ts`; `lib/domain/governance/workflow-types.ts:L6–7` (re-export).

**What it does:** Six-level total order `unbound < intent-only < agent-proposed < agent-verified < compiler-derived < human` tracking *how a binding was produced*, independent of governance verdict. A step can be `approved` yet `intent-only` (awaiting verification), or `review-required` yet `agent-verified`.

**What it serves in v1:** Fine-grained provenance tracking across proposal activation, element resolution ranking, and evidence assessment. Orthogonality is load-bearing: confidence describes provenance (who/how), governance describes authority (allowed/blocked/review). Trust policy thresholds are per-artifact-type per-confidence level.

**v2 analog:** v2 defers the lattice explicitly (§9.11 deferred: "confidence formula emerges at L3 under gating pressure"). v1's six-level lattice is an early commitment v2 chose not to bind.

#### Certification status — dual-tracked with activation

**Verdict:** v1-only *(innovation)*.

**Module references:** `lib/domain/governance/workflow-types.ts:L68` (`CertificationStatus = 'uncertified' | 'certified'`); `lib/domain/proposal/lifecycle.ts:L20–108` (`ProposalEntry` with separate `activation` and `certification` fields).

**What it does:** Distinguishes whether a proposal has been *activated* (written to canon) from whether it has been *certified* (passed trust-policy `allow` or earned later via operator approval). A proposal activated via `review-required` path activates without certification. Downstream consumers can observe both axes independently.

**What it serves in v1:** Tracks the full trust journey — proposal → activation → certification. Enables measuring operator confidence in proposals *after* they've entered canon.

**v2 analog:** v2 does not formalize certification. Operator oversight is modeled as "non-optional at L2" without the activation-vs-certification split. v1 surfaces the split as an explicit axis.

#### InterventionBlastRadius and InterventionAuthority

**Verdict:** v1-only *(innovation)*.

**Module references:** `lib/domain/handshake/intervention.ts:L69–76` (`InterventionBlastRadius = 'local' | 'review-bound' | 'global' | 'irreversible'`; `InterventionAuthority`); `:L195–219` (`InterventionHandoff.attachmentRegion`); `docs/cold-start-convergence-plan.md §4.C` (C6 measurement).

**What it does:** Two orthogonal governance axes on every handoff. `InterventionBlastRadius` classifies scope of effect (local element, scoped runbook, global across scenarios, irreversible). `InterventionAuthority` enum (`approve-canonical-change`, `request-rerun`, `promote-shared-pattern`, `change-pipeline`, `defer-work-item`) declares the governance tier required. `attachmentRegion` field on the handoff scopes which screens/elements the intervention claims to affect, enabling C6 (Intervention-Adjusted Economics) before/after snapshot comparison.

**What it serves in v1:** Routes handoffs to the right reviewer; gates auto-approval when blast radius exceeds policy; anchors C6 measurement to the intervention's claimed region so the improvement loop can assess whether accepted overrides actually reduced ambiguity in the affected surfaces.

**v2 analog:** v2 names reversibility classes (§8.6) but not scope-of-effect. `InterventionBlastRadius` is orthogonal to reversibility; v2 leaves scope and authority tiers to shipping-stage governance.

### V1.4 Theorem families and the alignment scoreboard

#### Theorem groups K/L/S/V/D/R/A/C/M/H

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `docs/temporal-epistemic-kernel.md §2–§4`; `lib/domain/fitness/types.ts:97` (`LogicalTheoremGroup` enum), `:100–111` (`LogicalProofObligation` with `propertyRefs: readonly LogicalTheoremGroup[]`).

**What it does:** Ten formal theorem families anchor the temporal-epistemic kernel — K (posture separability, canonical continuity, bounded successors, drift locality, marginal discovery decay, suspension legibility, synthetic augmentation governability); L (target observability, outcome legibility, unresolvedness legibility, neighborhood sufficiency); S (affordance recoverability, constraint family persistence); V (role/data/phase/policy factorability); D (transition learnability, constraint manifestation, route coherence, suspension localization); R (semantic drift recoverability, drift classification, deferred repairability); A (handoff sufficiency, synthetic governability, continuation integrity, cross-actor substitutability, deterministic leverage, deferred enhancement, augmentation alignment, intervention boundary); C (compounding economics, extraction ratio, handshake density); M (memory worthiness, intervention marginal value); H (meta-properties, outcome metrics). 19 named `LogicalProofObligation` entries map back to families via `propertyRefs`.

**What it serves in v1:** Proof obligations are the falsifiable claims the fitness report tests against. `TheoremBaselineCoverage` classifies each family's status as `direct | proxy | missing`, sequencing the realization phases from heuristic to direct measurement.

**v2 analog:** v2 acknowledges the theorem families as narrative framing and ROI-curve shape (M5, C6 asymptotics) but deliberately omits concrete measurement per the anti-scaffolding gate. v1's baseline-status enum operationalizes what v2 leaves as doctrine.

#### M5 (Memory Worthiness Ratio) and C6 (Intervention-Adjusted Economics)

**Verdict:** v1-only *(innovation)* — operational definitions locked where v2 keeps them asymptotic.

**Module references:** `docs/alignment-targets.md` (operational definitions locked 2026-04-10); `lib/domain/fitness/memory-maturity.ts` + `memory-worthiness-ratio.ts` (M5: `RememberingBenefit(τ) / MemoryMaintenanceCost(τ)`, wall-clock + agentic-override maintenance in denominator); `lib/domain/fitness/intervention-marginal-value.ts` (C6 numerator); `lib/domain/attention/pipeline-config.ts:27–33` (MemoryCapacityConfig in maintenance-cost denominator).

**What it does:** Two scoreboard metrics. M5 measures whether remembering is worth more than forgetting (slope of effective-hit-rate over memory-maturity, divided by per-iteration maintenance cost). C6 measures whether agentic overrides actually reduce ambiguity / suspension / rung-score within one loop iteration (>50% acceptance-correlated improvement target). Both are trajectory-based, not point-in-time. M5 floors locked per quarter: 1.0 → 1.2 → 1.5. Cohort-comparable = same scenario IDs.

**What it serves in v1:** Gating metrics for code-change acceptance on the Pareto frontier. A change is accepted only if Pareto-undominated and non-regressing against floors.

**v2 analog:** v2's §8.1 ROI curve names M5/C6 as narrative targets but remains asymptotic; v2 does not lock operational definitions at L0/L1. v1 treats M5/C6 as immediate load-bearing gates.

#### Scorecard — append-only Pareto frontier

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `lib/application/improvement/scorecard.ts`; `.tesseract/benchmarks/scorecard.json` (append-only); `lib/application/measurement/score.ts` (`buildL4MetricTree`, `findLatestFitnessReport`); `lib/domain/fitness/types.ts` (`PipelineScorecard`, `ScorecardHistoryEntry`, `ScorecardHighWaterMark`).

**What it does:** High-water-mark over pipeline fidelity, monotonically advancing from clean-slate runs. Each speedrun produces a `PipelineFitnessReport`; the scorecard compares it against prior via Pareto frontier (M5 slope, C6 acceptance rate, effectiveHitRate). Append-only history carries `pipelineVersion` (git SHA), timestamp, and metric vector — accepted *and* rejected runs are recorded.

**What it serves in v1:** The deterministic gate preventing local-feel-good code changes that regress long-term ROI. Materializes the training-loop "checkpoint saved only if validation-loss improved" discipline.

**v2 analog:** v2 sketches the Pareto shape (recursive-self-improvement.md §8.4) but leaves per-version linking and floor enforcement to v1's pattern.

#### Fitness metrics and eight failure classes

**Verdict:** v1-only *(operational scaffolding)* — different in kind from v2's execution-step error families.

**Module references:** `lib/application/improvement/fitness.ts` (`classifyStepOutcome`, `emitFitnessReport`, `FAILURE_CLASSIFICATION_RULES`); `lib/domain/fitness/types.ts` (`PipelineFitnessMetrics`, `PipelineFitnessReport`); `lib/domain/fitness/compounding.ts` (`CompoundingTrajectory`); `lib/domain/fitness/fingerprint-stability.ts` (K0 byte-identity test).

**What it does:** Every step-level execution outcome classifies into one of eight named families: `translation-threshold-miss`, `normalization-gap`, `alias-coverage-gap`, `resolution-rung-skip`, `scoring-weight-mismatch`, `recovery-strategy-miss`, `convergence-stall`, `trust-policy-over-block`. Aggregate metrics include rung-rate distribution, bottleneck-weight correlations, proposal-ranking accuracy, and compounding-trajectory measurement class.

**What it serves in v1:** The gradient of the self-improvement loop — each failure class maps to a specific knob in the 15-knob parameter space (V1.5). Theorem-baseline coverage gates algorithm-change acceptance.

**v2 analog:** v2 names a smaller error-family set (§8.5 invariant 5 — `not-visible | not-enabled | timeout | assertion-like | navigation-* | parse-error | unclassified`) but the *pipeline-fitness* classification is different in kind — it classifies pipeline-level failure modes, not execution-step errors. v2 does not enumerate pipeline-level classes.

### V1.5 Recursive improvement loop

#### The 15-knob parameter space

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `docs/recursive-self-improvement.md §2–§5` (parameter space, sensitivity analysis), `§6` (manual runbook), `§9` (autonomous evolution path); `lib/domain/attention/pipeline-config.ts` (`PipelineConfig` interface with 15 tunable parameters).

**What it does:** Fifteen code constants across eight groups serve as the deterministic gradient of the self-improvement loop: BottleneckWeights (translation-threshold, repair-density, translation-rate, unresolved-rate, inverse-fragment-share), RankingWeights (scenario-impact, bottleneck-reduction, trust-policy, evidence), MemoryCapacityConfig (max-active-refs, staleness-ttl, max-recent-assertions, screen-confidence-floor, max-lineage-entries), DomScoringWeights (visibility, role-name, locator-quality, widget-compatibility), CandidateLimits (max-candidates, max-probes), ConfidenceScaling (compiler-derived, agent-verified, agent-proposed), IntentThresholds (element, screen), ProposalConfidenceValues (precedence-base, translation, dom, dom-shortlist), and `convergenceThreshold`. Each knob maps deterministically to one of the eight fitness failure classes.

**What it serves in v1:** Surface 1 of the five-surface improvement topology — hyperparameter tuning that changes fitness outcomes without changing code structure. Sensitivity analysis ranks knobs by fitness-report impact, making optimization priority-ordered.

**v2 analog:** v2 names the training-loop analogy (§8.1 ROI curve) but does not enumerate the parameter space. Enumeration is scaffolding v2's anti-scaffolding gate rejects at L0; v2 expects parameters to emerge under L2+ shipping pressure.

#### Speedrun verb surface

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `scripts/speedrun.ts:1–50` (CLI dispatch); `lib/application/improvement/speedrun.ts` (`generatePhase`, `compilePhase`, `iteratePhase`, `fitnessPhase`, `reportPhase`); `lib/application/synthesis/cohort-generator.ts` (`generateCohortCorpus`); `lib/application/improvement/fitness.ts` (`emitFitnessReport`); `lib/application/measurement/score.ts` (`scoreCommand`, `captureBaseline`).

**What it does:** Five verbs orchestrate the loop. `corpus [--seed S]` generates a 12-cohort synthetic reference workload, deterministic and idempotent. `iterate [--max-iterations N]` runs the dogfood substrate-growth loop against the corpus. `fitness [--seed S]` computes the pipeline fitness report. `score [--baseline LABEL|latest]` builds the L4 metric tree and diffs against a stored baseline. `baseline --label LABEL` snapshots the current L4 tree as a labeled checkpoint.

**What it serves in v1:** Operational surface of the self-improving loop — decomposes the full cycle into checkpointable phases. `corpus` and `iterate` are ephemeral (knowledge changes discarded after); `fitness`, `score`, and `baseline` produce durable outputs.

**v2 analog:** v2 describes the training-loop structure but does not name subcommands. Verb surface is dogfood-specific; v2 defers this layer to L2+.

#### Convergence-proof harness

**Verdict:** v1-only *(innovation)*.

**Module references:** `lib/application/improvement/convergence-proof.ts` (`convergenceProofProgram`, `ConvergenceProofInput`, `ConvergenceProofResult`); `lib/domain/convergence/types.ts` (`ConvergenceVerdict`, `ConvergenceTrialResult`).

**What it does:** Runs N independent trials from cold-start (each trial: `cleanSlateProgram → speedrunProgram` with unique seed → extract per-iteration metrics → `cleanSlate` again). Cross-trial aggregation builds a `ConvergenceVerdict` with statistical confidence (mean trajectory, variance, p-value estimate) answering: "does the recursive-improvement loop converge through its own proposal activation and knowledge accrual?" Hylomorphic unfold/fold — no intermediate list allocated.

**What it serves in v1:** Meta-validation of the loop's learning signal — a statistical answer to "does this system actually self-improve?"

**v2 analog:** v2 assumes convergence as an asymptotic narrative property; v1 provides a mechanism to empirically test it with confidence bounds. The harness is a v1 stronger claim.

#### Improvement run + ledger

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `lib/application/improvement/improvement.ts` (`BuildImprovementRunInput`, `buildImprovementRun`); `lib/domain/improvement/types.ts` (`ImprovementRun`, `ImprovementLedger`, `ObjectiveVector`, `ImprovementLineageEntry`); `lib/domain/aggregates/improvement-run.ts` (`checkpointRun`, `createImprovementRun`); `.tesseract/benchmarks/improvement-ledger.json` (append-only).

**What it does:** Durable record of every speedrun experiment — seed, baseline/delta config, fitnessReport, scorecard comparison, acceptance decision, metadata (startedAt, completedAt, tags, parentExperimentId). Objective vectors (`RungRate`, `BottleneckWeightCorrelations`, `ScoringEffectiveness`) capture multi-dimensional fitness. Lineage entries chain experiments into hypothesis sequences.

**What it serves in v1:** The training log of the self-improvement loop. Enables retrospective meta-learning over which hypotheses succeeded or failed.

**v2 analog:** v2 mentions an append-only improvement ledger but does not specify schema. v1 operationalizes the Pareto-frontier + lineage-chain discipline.

#### Learning-health bottleneck ranking

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `lib/application/learning/learning-health.ts` (`projectCorpusHealth`, `buildRuntimeCoverage`, `buildScreenCoverage`, `buildActionFamilyCoverage`); `lib/domain/learning/types.ts` (`CorpusHealthReport`, `RuntimeCoverageEntry`); `lib/application/improvement/hotspots.ts` (bottleneck heuristics).

**What it does:** After a speedrun, computes coverage and fragmentation metrics on the generated spec corpus. Ranks screens, action families, and runtimes by fragment count, confidence distribution, thinness (under threshold), and generalization potential.

**What it serves in v1:** Diagnostic, not gate — informs developer intuition about where to focus observation or pattern-mining effort next.

**v2 analog:** v2 defers this to §9.15 (L4 memory aging + corroboration), which requires per-facet evidence logs and confidence decay — infrastructure v1 does not yet have in the v2-shaped form. v1's bottleneck ranking is a provisional answer to v2's deferred question.

### V1.6 Operational surfaces

#### Scenario corpus partition (10000 vs 20000 series)

**Verdict:** v1-only *(migration scaffolding)*.

**Module references:** `docs/scenario-partition.md`; `dogfood/scenarios/demo/` (10000-series legacy, test-pinned); `dogfood/scenarios/reference/` (20000-series generated reference cohorts via `lib/application/synthesis/cohort-generator.ts`).

**What it does:** Partitions the scenario workload into two disjoint populations: hand-curated golden fixtures (10000-series) used by unit tests, and deterministically-generated reference cohorts (20000-series, 12 cohorts × 20 scenarios) that serve as the immutable measurement workload for the improvement loop. The partition prevents feedback loops where adding a cohort breaks unrelated unit tests.

**What it serves in v1:** Decouples measurement from test-pin fidelity. The improvement loop reads the 20000-series corpus; unit and integration tests pin against 10000-series files.

**v2 analog:** **None — deliberately omitted.** v2 assumes one corpus by definition and defers test-fixture isolation to shipping.

#### Dogfood / production suite-root abstraction

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** CLAUDE.md § "Tracking rule: production vs dogfood"; `lib/application/paths/factory.ts` (`createProjectPaths(rootDir, suiteRoot)`); `.gitignore` governance of `dogfood/` and `lib/generated/`.

**What it does:** Separates suite root (content) from repo root (engine). On main, `dogfood/` and `lib/generated/` are gitignored; the improvement loop regenerates from scratch on each clone. On training branches, the gitignore is removed so knowledge persists between runs. Production deployment targets a named suite directory at repo root; the engine works identically because path resolution is suite-root-relative.

**What it serves in v1:** Safe training-data evolution on feature branches without polluting main. Deterministic cold-start on main. Future-proof production deployment via parameterized suite location.

**v2 analog:** **None — deliberately omitted.** v2 defers production deployment models. Suite root vs. engine root is a v1 operational concern.

#### `.tesseract/` ephemeral artifact directory

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `lib/application/paths/factory.ts` (`EnginePaths` defining all subdirectories); CLAUDE.md § "Ephemeral Artifact Confusion?"; `docs/recursive-self-improvement.md` § "Ephemeral Artifact Management". Subdirectories: `.tesseract/bound/`, `benchmarks/`, `evidence/`, `graph/`, `inbox/`, `interface/`, `learning/`, `policy/`, `runs/`, `sessions/`, `tasks/`, `workbench/`.

**What it does:** Runtime engine directory holding all transient artifacts produced during speedrun execution. Twelve subdirectories partition by concern: compiled task packets (bound), run records + fitness reports (benchmarks), step-level evidence (evidence), resolution graph (graph), operator-review queue (inbox), knowledge proposal state (learning), trust policy + approval receipts (policy), per-run logs (runs), agent session transcripts (sessions), resolution task packets (tasks), file-backed decision queue (workbench). Bulk-gitignored; only governance anchors (`trust-policy.yaml`, `scorecard.json`) persist.

**What it serves in v1:** Staging layer where deterministic observations and agentic overrides are validated, ranked, and gated before promotion to canonical. Erasure is safe because the pipeline regenerates deterministically from canonical sources.

**v2 analog:** v2 subsumes evidence logs, confidence derivation, facet query, and health tracking (§9.9–§9.16) but does not distinguish ephemeral run-time staging from persistent canonical storage by directory. The `.tesseract/` discipline is v1-specific.

#### MCP server tool surface (33 tools)

**Verdict:** Shape-different — the tools exist; what's missing is the manifest enumerating them as stable verb signatures (per §9.8).

**Module references:** `lib/infrastructure/mcp/dashboard-mcp-server.ts` (`McpServerPort` implementation with 33 tool handlers); `lib/domain/observation/dashboard.ts` (`dashboardMcpTools` constant with schema + category per tool); `lib/infrastructure/dashboard/file-decision-bridge.ts` (file-backed decision protocol for `--mcp-decisions` mode).

**What it does:** Exposes 33 structured JSON-RPC-style tools grouped into three categories. *Observe* (read-only artifact inspection): `list_probed_elements`, `get_screen_capture`, `get_knowledge_state`, `get_queue_items`, `get_fitness_metrics`, `get_iteration_status`, `browser_screenshot`, `browser_query`, `browser_aria_snapshot`, `get_proposal`, `list_proposals`, `get_bottleneck`, `get_run`, `get_resolution_graph`, `get_task_resolution`, `list_screens`, `get_contribution_impact`, `get_suggested_action`, `get_convergence_proof`, `get_learning_summary`, `get_loop_status`, `get_decision_context`, `get_operator_briefing`. *Decide* (writes that resume paused fibers): `approve_work_item`, `skip_work_item`, `activate_proposal`, `suggest_hint`, `suggest_locator_alias`. *Control* (lifecycle): `start_speedrun`, `stop_speedrun`, `browser_click`, `browser_fill`, `browser_navigate`.

**What it serves in v1:** Agent-in-the-loop orchestration without tight coupling between the MCP server and the speedrun process. The dashboard's structured projection as a tool interface.

**v2 analog:** v2 §8.4 prescribes a vocabulary manifest listing verbs and their signatures; v1's tools are enumerated in code, not serialized. Introspection requires full catalog load. This is the single most material agent-facing gap captured earlier in the §9.8 block.

#### CLI script surface

**Verdict:** v1-only *(operational scaffolding)*.

**Module references:** `scripts/speedrun.ts`, `scripts/convergence-proof.ts`, `scripts/mcp-call.ts`; `package.json` scripts (`context`, `workflow`, `paths`, `trace`, `impact`, `surface`, `graph`, `types`, `test`, `run`).

**What it does:** Deterministic entry points composed through three layers: CLI args → application orchestration → Effect programs via `lib/composition/local-services.ts`. Ten package-scripts expose subsystems for diagnostics (`trace`, `impact`, `surface`, `graph`), orientation (`context`, `workflow`, `paths`), engine (`types`, `run`), and validation (`test`). Each is composable; users assemble sequences appropriate to their measurement task.

**What it serves in v1:** Reproducible speedrun execution, fitness measurement, and convergence verification without hidden coupling.

**v2 analog:** v2 does not prescribe CLI verb shapes. CLI scaffolding is dogfood-specific; v2 defers to L2+.

#### File-backed decision bridge

**Verdict:** v1-only *(innovation)* — concrete transport for the decision-handoff shape v2 specifies abstractly.

**Module references:** `lib/infrastructure/dashboard/file-decision-bridge.ts` (`writeDecisionFile`, `watchForDecision`); `.tesseract/workbench/decisions/`; `lib/infrastructure/mcp/dashboard-mcp-server.ts` (routes decide-category tools to `writeDecisionFile`).

**What it does:** Cross-process MCP ↔ speedrun coordination via atomic file operations. When speedrun runs with `--mcp-decisions`, it pauses at iteration boundaries and watches `.tesseract/workbench/decisions/` for decision files. The MCP process writes decisions via temp-file + rename; the speedrun uses `fs.watch`, reads + deletes the file atomically, and resumes the paused fiber. `decisionTimeoutMs` (default 300s) governs auto-skip fallback.

**What it serves in v1:** Agent-in-the-loop decision approval without blocking subprocess communication. No polling; no shared memory; race-safe via atomic rename and pre-existing-file check.

**v2 analog:** v2 prescribes the handoff envelope and receipt shape (§8.2, §8.3) but not the file-system transport mechanism. This is v1's concrete realization.

#### Review surface contract

**Verdict:** Shape-different — concrete proper-subset of v2's §8.4 handshake layer.

**Module references:** CLAUDE.md § "Review surface contract"; `generated/{suite}/{ado_id}.{spec.ts|trace.json|review.md|proposals.json}`; `.tesseract/tasks/{ado_id}.resolution.json`; `.tesseract/graph/index.json`.

**What it does:** Six-artifact contract that every meaningful workflow must preserve or improve. Generated spec files are disposable object code; trace + review are L0 evidence; proposals + resolution receipts are L1 governance inputs; the graph is the L2 knowledge projection. If a change cannot explain itself through these six artifacts, it is under-modeled.

**What it serves in v1:** Testable contract for pipeline outputs. Establishes a boundary between the compiler (deterministic) and the governance layer (agentic proposals, operator approvals).

**v2 analog:** v2 §8.4 (implementation surface — manifest, decision handoffs, receipt logs, candidate queues) generalizes this as the handshake layer; v1's review surface is a concrete proper-subset of v2's full engagement protocol.

## Summary

### Verdict tally

| Verdict | Count | Share |
|---|---:|---:|
| Aligned | 9 | 16% |
| Shape-different | 11 | 20% |
| Partial in v1 | 9 | 16% |
| Absent in v1 | 5 | 9% |
| v1-only | 22 | 39% |
| &nbsp;&nbsp;— migration scaffolding | 3 | |
| &nbsp;&nbsp;— operational scaffolding | 12 | |
| &nbsp;&nbsp;— innovation | 7 | |
| **Total blocks** | **56** | **100%** |

### Directory by verdict

**Aligned (9):** §9.1 Intent fetch · §9.2 Intent parse · §9.18 Selector and test-data indirection · §9.19 Parametric expansion and fixture composition · V1.2 Four-axis phantom-type envelope · V1.2 Concrete envelope type hierarchy · V1.2 Envelope header field taxonomy · V1.2 `Fingerprint<Tag>` · V1.3 Governance phantom brands.

**Shape-different (11):** §8.1 ROI curve · §8.6 Reversibility classes · §9.6 Test compose · §9.9 Facet mint · §9.10 Facet query · §9.11 Facet enrich · §9.12 Locator health track · §9.13 Drift emit · §9.16 Facet schema sketch · V1.6 MCP server tool surface · V1.6 Review surface contract.

**Partial in v1 (9):** §8.2 Authoring session phases · §8.3 Decision surface · §8.4 Implementation surface · §8.5 Ten invariants · §9.3 Navigate · §9.4 Observe · §9.5 Interact · §9.7 Test execute · §9.20 Scale behavior.

**Absent in v1 (5):** §8.7 Engagement → determinism · §9.8 Verb declare / Manifest / Fluency · §9.14 Dialog / Document / Candidate review · §9.15 Confidence age / Corroborate / Revision propose · §9.17 Affordance extension authoring.

**v1-only — migration scaffolding (3):** V1.1 Six-slot lookup chain · V1.1 Reference-canon transitional slot · V1.6 Scenario corpus partition.

**v1-only — operational scaffolding (12):** V1.1 Mode flags · V1.3 Trust policy engine · V1.4 Theorem groups K/L/S/V/D/R/A/C/M/H · V1.4 Scorecard · V1.4 Fitness metrics and eight failure classes · V1.5 The 15-knob parameter space · V1.5 Speedrun verb surface · V1.5 Improvement run + ledger · V1.5 Learning-health bottleneck ranking · V1.6 Dogfood / production suite-root abstraction · V1.6 `.tesseract/` ephemeral artifact directory · V1.6 CLI script surface.

**v1-only — innovation (7):** V1.2 Epistemic branding · V1.3 Confidence lattice · V1.3 Certification status dual-tracked with activation · V1.3 InterventionBlastRadius and InterventionAuthority · V1.4 M5 / C6 operational definitions · V1.5 Convergence-proof harness · V1.6 File-backed decision bridge.

### Shape of the overall delta

The L0 data-flow chain (§9.1–§9.7) is essentially present in v1 with envelope-shape differences rather than capability gaps. The memory layer (§9.9–§9.16) has substantial machinery in v1 but differs in shape where v2 makes structural claims — unified schema, derived confidence, emitted drift, facet-level evidence logs. The agent-ergonomics layer (§8 + §9.8 + §9.17) concentrates the Absent-in-v1 verdicts: doctrinally acknowledged, not yet assembled.

The v1-only blocks split three ways by intent. **Migration scaffolding** (3 blocks) retires once reference canon is empty. **Operational scaffolding** (12 blocks) is dogfood workflow — measurement, CLI, `.tesseract/` staging — orthogonal to v2's product surface. **Innovation** (7 blocks) names finer-grained distinctions (epistemic branding vs governance, scope-of-effect vs reversibility, confidence lattice vs narrative M5/C6, operational alignment floors, convergence-proof statistical harness, file-backed decision transport) that v2 could inherit under shipping pressure.

The single most consequential pattern: v1's envelope-axis substrate (V1.2) is v2's own specification materialized in code — four of the nine Aligned verdicts sit in this cluster. `docs/envelope-axis-refactor-plan.md` Phase 0 is complete; Phases B–E are the v1→v2 convergence path. Elsewhere, v1 is further from v2 where v2's claims are most structural (unified facet record, per-facet evidence log, drift as emitted event), and closest to v2 where v2's claims are procedural (intent fetch, test compose, parametric expansion).
