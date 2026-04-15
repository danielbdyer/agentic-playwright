# v2 Feature Delta Audit

> Status: factual audit — material deltas between the current codebase and [`docs/feature-ontology-v2.md`](feature-ontology-v2.md). Not a backlog, not a migration plan, not a recommendation set. Concrete module references accompany each delta so a reader can verify independently.

## How to read this

Each block follows a uniform shape: *what v2 describes*, *what v1 has (with module references)*, *the material delta*. "Essentially present" means the capability exists even if under a different name or envelope shape; minor implementation differences are not flagged.

The audit covers `feature-ontology-v2.md` §8 (Agent engagement, eight subsections) and §9 (Technical paths, twenty subsections). §1–§6 (primitives and levels), §7 (handshake surfaces), and §10–§12 (cross-cutting, evaluation, deferred) are not audited: §1–§7 are conceptual framings, and §10–§12 describe disciplines rather than implementable features.

Findings synthesized from three parallel agent audits (L0 data-flow, memory/drift/operator, agent ergonomics) completed 2026-04-15.

## §8 Agent engagement

### §8.1 The ROI curve

**v2:** Three-stage cost shape (α/β/γ); early authoring is expensive; deterministic wins emerge as memory accrues; Stage β arrives through pattern emergence from Stage α receipts.

**v1:** M5 (Memory Worthiness Ratio) operationalizes the same ROI claim (`lib/domain/fitness/memory-maturity.ts`, `memory-maturity-trajectory.ts`). Floors locked in `docs/alignment-targets.md` §1 (1.0 → 1.2 → 1.5 across quarters). Status: `proxy`, not `direct` — requires ≥3 cohort-comparable history points before slope can be computed honestly.

**Delta:**
- v2's α/β/γ is narrative; v1's M5 is quantified but incomplete (proxy status).
- v2 prescribes the three-stage path; v1 measures payoff asymptotically.
- v1 has no authoring-session phase boundaries to distinguish Stage α work from Stage β.

### §8.2 The authoring session as process

**v2:** Eight bounded phases — fluency intake, intent acquisition, memory consultation, world exploration, authoring, execution + evidence, memory write, closeout receipt.

**v1:** `AgentSession` (`lib/domain/handshake/session.ts`) tracks participants, interventions, and event types (`orientation`, `artifact-inspection`, `discovery-request`, `observation-recorded`, `spec-fragment-proposed`, `proposal-approved`, `proposal-rejected`, `rerun-requested`, `execution-reviewed`). Event taxonomy exists without phase-order enforcement.

**Delta:**
- Event types exist; phases do not.
- No timeout or scope-cut mechanics on exploration depth.
- Intervention receipts are not explicitly phase-bound.

### §8.3 The agent's decision surface

**v2:** Five decision classes (interpretive, navigational, affordance, compositional, governance). Every decision writes a receipt with choices presented, pick, and reversal policy.

**v1:** `InterventionHandoff` (`lib/domain/handshake/intervention.ts`) captures `unresolvedIntent`, `attemptedStrategies`, `evidenceSlice`, a `blockageType` taxonomy (`target-ambiguity`, `locator-degradation`, `route-uncertainty`, `policy-block`, `recovery-gap`, `execution-review`, `knowledge-gap`, `self-improvement`), `requiredCapabilities`, `requiredAuthorities`, `blastRadius`, `epistemicStatus`, `semanticCore`, `nextMoves`, `competingCandidates`.

**Delta:**
- v1's taxonomy is *blockage reasons* (why the agent handed off), not *decision classes* (what the agent chose among).
- Receipts record effects but do not enumerate the choices presented.
- No explicit reversal-policy field at the decision level.

### §8.4 The implementation surface

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

**v2:** Self-reversing, proposal-gated, review-gated, hard-gated (no deletion verb).

**v1:** `InterventionBlastRadius` enum (`local | review-bound | global | irreversible`) maps loosely: `local`≈self-reversing, `review-bound`≈proposal/review-gated, `irreversible`≈hard-gated with operator review.

**Delta:**
- v1's framing is *blast radius* (scope of effect), not *reversal class* (undo mechanics).
- v1 has no explicit "no deletion verb" prohibition; `irreversible` is allowed under operator review rather than disallowed.

### §8.7 How engagement becomes determinism

**v2:** Receipt accumulation → pattern accrual → Stage β deterministic resolution → drift pathway enriches future handoffs with prior receipts.

**v1:** Proposals can promote patterns via `lib/application/knowledge/activate-proposals.ts` and `discovery-proposal-bridge.ts`. No named "pattern promotion" mechanism; receipts are not wired to update decision tables.

**Delta:** The machinery exists but is not wired as v2 prescribes. Transition is aspirational in doctrine (CLAUDE.md, VISION.md), not operational in code.

## §9 Technical paths

### §9.1 Intent fetch

**v2:** ADO REST v7.1 + PAT; WIQL query + workitems fetch; load-bearing field extraction; revision carried for drift reconciliation.

**v1:** `lib/infrastructure/ado/live-ado-source.ts` implements the exact REST path and field extraction. Transient error classification (`AdoTransientError`) distinguishes retry-worthy failures from auth / 404. Revision is carried in the snapshot.

**Delta:** Essentially present; no material gap.

### §9.2 Intent parse

**v2:** XML regex extraction over `Microsoft.VSTS.TCM.Steps`; entity decode; per-step provenance; `intent-only` confidence at start; semantic ambiguity acknowledged at Stage α.

**v1:** `lib/infrastructure/ado/live-ado-source.ts` functions `extractStepBodies`, `parseSteps`, `extractParameterizedStrings`, `decodeXmlText`, `parseParameters`, `parseDataRows` implement the exact regex path. Snapshot shape `{ index, action, expected }` per step with lineage to ADO ID + revision.

**Delta:** Essentially present. Confidence marker is managed in a separate layer (`lib/domain/intent/types.ts`) rather than on the parse output envelope.

### §9.3 Navigate

**v2:** `page.goto(url, { waitUntil, timeout })`; idempotence check via `page.url()`; discrete return envelope `{ reachedUrl, status, timingMs }`.

**v1:** Route classification (`lib/runtime/adapters/navigation-strategy.ts`) + goto invocation (`lib/runtime/execute/program.ts`). waitUntil selection is per-URL-pattern.

**Delta:**
- Missing: explicit `page.url()` idempotence check before goto.
- Missing: discrete `{ reachedUrl, status, timingMs }` envelope; outcome is embedded in the execution result rather than returned as its own envelope.

### §9.4 Observe

**v2:** Accessibility snapshot (`interestingOnly: false`); locator ladder in priority order (role → label → placeholder → text → test-id → css); state probes; observation timestamp + ID.

**v1:** `lib/playwright/aria.ts` calls `page.accessibility.snapshot({ root, interestingOnly: false })`. Locator ladder in `lib/playwright/locate.ts` — strategy order test-id → role → css. Precondition probes (`lib/runtime/widgets/interact.ts`). Snapshot templating (`lib/runtime/observe/snapshots.ts`).

**Delta:**
- Ladder order differs: v1 places test-id before role and omits text-based rungs; v2 places role first and test-id after text. This is material for the first-match-wins rule under Playwright's best-practice recommendation.
- Missing: discrete observation timestamp / ID envelope.
- Missing: `placeholder` as an explicit ladder rung.

### §9.5 Interact

**v2:** Role-keyed primitive actions (`click`, `fill`, `selectOption`, `check`, `press`, `hover`); pre-action state validation; four named failure families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`).

**v1:** `ROLE_AFFORDANCES` table (`lib/domain/widgets/role-affordances.ts`) maps ARIA roles to Playwright methods. `interact()` in `lib/runtime/widgets/interact.ts` validates visible / enabled / editable before action.

**Delta:**
- Dispatch style: table-based (v1) vs. enumerated (v2). Substance identical.
- Missing: explicit four-family error classification; in particular, no `assertion-like` family on the action handshake envelope.

### §9.6 Test compose

**v2:** AST-backed emission via `@playwright/test`; generated screen facade per screen; no inline selectors or data in test body; durable edits land in intent or memory.

**v1:** `lib/domain/codegen/spec-codegen.ts` emits tests via the TypeScript AST factory. Facades realized through `lib/composition/scenario-context.ts` — POM-like `ScreenContext` with runtime locator resolution via the screen registry. Data consumed via `resolveDataValue()` from fixtures. `test.step()` wrapping implemented.

**Delta:**
- Facade is runtime-instantiated via the screen registry rather than a pre-generated module file. Substance (no inline selectors, facet-keyed addressing) is identical.
- Step-title preservation and `test.step` wrapping match v2 obligations.

### §9.7 Test execute

**v2:** Playwright CLI / programmatic API; per-run record at L0; L2+ tactical batch summary with classifications and closed-set `nextSteps` verbs.

**v1:** `lib/composition/scenario-context.ts` drives execution; `lib/application/commitment/build-run-record.ts` constructs `RunRecord` with step-level evidence and timestamps. `StepExecutionReceipt` (interpretation + execution) per step.

**Delta:**
- Missing: explicit per-run `classification` field (`product-pass | product-fail | test-malformed | transient | unclassified`) on the run-record envelope. Classification is embedded in step-level execution receipts rather than summarized on the run.
- Missing at L2+: tactical batch summary and closed-set `nextSteps` verb list. (Deferred in v2 to L2+; not an L0 gap.)

### §9.8 Verb declare / Manifest introspect / Fluency check

**v2:** Build-generated JSON manifest listing stable verb signatures; session-start read; fluency tests run at product-test severity.

**v1:**
- **Verb declare:** Absent. No manifest file is generated from code.
- **Manifest introspect:** Absent. No session-start read.
- **Fluency check:** Absent. No fluency tests exist.

**Delta:** All three surfaces are absent. CLAUDE.md names the concept; code does not implement it. This is the single most material agent-facing gap in the audit.

### §9.9 Facet mint

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

**v2:** In-memory index queried by parsed intent phrase (kind / role / screen / roleVisibility); matches ranked by confidence, health as tiebreaker; parsed-constraint representation logged for debugging.

**v1:** Resolution runs through the six-slot lookup chain (`lib/domain/pipeline/lookup-chain.ts`; doctrine in `docs/canon-and-derivation.md` §6): `operator-override` → `agentic-override` → `deterministic-observation` → `reference-canon` → `live-derivation` → `cold-derivation`. Address-based, not intent-phrase-based; no intra-result ranking within a single slot.

**Delta:**
- v1 has no intent-phrase query layer; chain precedence *is* the ranking.
- v2 adds intra-result ranking by confidence and health.
- v1 has no parsed-constraint logging at query time.

### §9.11 Facet enrich

**v2:** Append-only evidence log per facet (`<facetId>.evidence.jsonl`); confidence derived from log on read; cached summary invalidated on new evidence.

**v1:** Evidence is step-keyed at `.tesseract/evidence/runs/{adoId}/{runId}/step-{index}-{index}.json` via `lib/application/commitment/persist-evidence.ts`. No per-facet evidence log. Confidence summaries stored directly on the facet's `acquired` block; not derived.

**Delta:**
- No per-facet evidence log.
- Confidence is materialized on the facet, not derived from a log on read.
- Enrichment is implicit in proposal activation rather than a first-class append operation on the facet.

### §9.12 Locator health track

**v2:** Per-strategy health co-located on the facet (`locatorStrategies: [{ kind, value, health: { successCount, failureCount, lastSuccessAt, lastFailureAt } }]`).

**v1:** Health is a separate index — `SelectorHealthIndex` (`lib/application/drift/selector-health.ts`) computed from `StepExecutionReceipt` observations. Carries `successRate`, `flakiness`, `trend` (improving / stable / degrading). Keyed by strings like `"test-id:rung0"` rather than by `{ kind, value }` tuple on the facet.

**Delta:**
- Separate index vs. co-located on locator strategies.
- v1 computes additional metrics (flakiness, trend) that v2 defers to L3.
- v1 is regeneratable from execution records; v2 requires health as a primary artifact because ladder-position metadata is not preserved in run records.

### §9.13 Drift emit

**v2:** Drift emitted as an observational event — `{ runId, facetId, strategyKind, mismatchKind, evidence, observedAt }` — appended to `drift-events.jsonl`; emitter classifies at emit time (`ambiguous` fallback when unclear).

**v1:** Drift is a *mutation verb*, not an emitted event (`lib/application/drift/drift.ts`). Drift types are mutation classes (`label-change | locator-degradation | element-addition | alias-removal`) that rewrite `elements.yaml` / `hints.yaml`. No `drift-events.jsonl`; no central drift log for L3 gating or operator review.

**Delta:**
- v1 drift is prescriptive (what to change); v2 drift is observational (what mismatched).
- No drift event log.
- No emitter classification with `ambiguous` fallback.

### §9.14 Dialog capture, Document ingest, Candidate review

**v2:** LLM-assisted extraction of domain-informative turns from chat transcripts; parser-backed extraction from operator-shared documents with region anchors; candidate review queue with approve / edit / reject and preserved rejection rationale.

**v1:** `InterventionReceipt` (`lib/domain/handshake/intervention.ts`) is a broad catch-all covering orientation, artifact-inspection, discovery-request, observation-recorded, spec-fragment-proposed, proposal-approved / rejected, rerun-requested, execution-reviewed, operator-action, self-improvement-action. MCP server (`lib/infrastructure/mcp/dashboard-mcp-server.ts`) exposes `writeHint` / `writeLocatorAlias` tools but no dialog-capture or document-ingest pipeline.

**Delta:**
- No dialog capture or document ingest layer.
- No rejection log with captured rationale; rejected proposals disappear rather than conditioning future proposals.
- No operator-wording provenance or document-region anchoring in v1's schema.

### §9.15 Confidence age, Corroborate, Revision propose

**v2:** Maintenance pass for decay over uncorroborated evidence logs; post-execution hook writes positive evidence to referenced facets; revision proposal aggregates drift + decay + corroboration into a reviewable JSONL.

**v1:** `lib/application/improvement/fitness.ts` computes pipeline fitness (hit rate, precision, recovery success). `lib/application/learning/learning-health.ts` computes bottleneck rankings. `lib/application/improvement/improvement.ts` builds `ImprovementRun` with objective vectors. No confidence-decay pass, no corroboration hook, no revision-proposal aggregation.

**Delta:** All three L4 processes absent. The fitness / improvement loop and the memory / corroboration loop are not integrated in v1 as v2 describes.

### §9.16 Facet schema sketch

**v2:** Unified facet record (`id`, `kind`, `displayName`, `aliases`, `role`, `scope`, `locatorStrategies + health`, `confidence`, `provenance`, `evidence-log reference`) with kind-specific extensions for element, state, vocabulary, route.

**v1:** Distributed across `elements.yaml` (`ElementSig`) and `hints.yaml` (`ScreenElementHint`). Element keys are local strings (e.g., `amendmentNumber`); no stable `<screen>:<element>` facet ID. No explicit `kind` field. No evidence-log reference.

**Delta:**
- No stable facet IDs.
- No explicit `kind` field.
- Schema split rather than unified.
- No evidence-log reference on the facet.

### §9.17 Affordance extension authoring

**v2:** Agent proposes a composite affordance (`name`, `surfaceShape`, `observeSignature`, `actionChoreography`, `effectState`); lands in a proposal queue; operator approves; pattern becomes a reusable codified verb.

**v1:** `InteractionCapability` enum (`lib/domain/knowledge/affordance.ts`: `clickable | typeable | selectable | toggleable | scrollable | draggable | focusable | expandable | dismissable`) and `ElementAffordance` record (selector, role, tagName, capabilities, constraints). No extension-authoring flow. Affordances are hardcoded or inferred from the DOM; not proposable through the governance layer.

**Delta:** v1 has affordance *taxonomy* but not affordance *extension authoring*. The machinery to codify novel composite patterns (multi-select with chips, autocomplete with async suggestions) does not exist.

### §9.18 Selector and test-data indirection

**v2:** Facet catalog is the sole selector source; fixture registry is the sole test-data source; generated facade per screen; one catalog update fixes N tests without touching test source.

**v1:** Generated specs use POM-style facades (`lib/domain/codegen/spec-codegen.ts`) with screen-scoped step methods; selectors do not appear in test bodies. Tests receive `fixtures` (typed array of names) via destructuring and consume `data.<field>` references. Runtime locator resolution through screen registry.

**Delta:** Essentially present and strong. v1 implements both requirements. Facade form differs (runtime-instantiated vs. pre-generated module file), but the indirection guarantee is honored.

### §9.19 Parametric expansion and fixture composition

**v2:** Work-item data-source rows expand into parametric iterations; named fixture registry with declared lifecycle scope (per-test, per-file, per-worker); dynamic resolution at invocation.

**v1:** Work-item data rows parsed in `lib/domain/intent/types.ts` and fed into spec composition. Tests emitted with `test(name, async ({ page, ...fixtures }) => { ... })` receiving `data` bindings. Per-row provenance preserved. Fixtures declared as `readonly string[]` names, resolved at test invocation.

**Delta:** Essentially present. Per-iteration skip / focus policies and cross-fixture dependency resolution are deferred in both v1 and v2.

### §9.20 Scale behavior at thousands of tests

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

## Summary

### Capabilities in v2 absent or partial in v1

1. Vocabulary manifest + fluency checks (§9.8) — entirely absent.
2. Pattern emergence from receipt accumulation (§8.7) — wired aspirationally, not operationally.
3. Authoring session phases (§8.2) — event taxonomy without phase enforcement.
4. Explicit decision classes (§8.3) — v1's blockage taxonomy covers different territory.
5. Unified agent engagement surface (§8.4) — surfaces exist but scattered.
6. Stable verb signatures (§8.5 invariant 1) — no registry.
7. Cheap introspection (§8.5 invariant 10) — no manifest; catalog load required.
8. Per-run classification field on run-record envelope (§9.7).
9. L2+ batch summary + closed-set `nextSteps` (§9.7, §9.20) — deferred in both.
10. Unified facet record with stable ID + evidence-log reference (§9.9, §9.16).
11. Intent-phrase query layer (§9.10) — replaced by six-slot chain.
12. Per-facet evidence log with derived confidence (§9.11).
13. Health co-located on facet (§9.12) — separate index in v1.
14. Drift as emitted observational event (§9.13) — drift is a mutation verb in v1.
15. Dialog / document ingest + rejection log (§9.14).
16. Confidence decay, corroboration hook, revision-proposal aggregation (§9.15).
17. Affordance extension authoring (§9.17) — taxonomy present, extension flow absent.
18. Uniformly token-bounded emissions (§9.20) — partial.

### Capabilities in v1 not described by v2

1. Six-slot lookup-chain precedence (operator-override / agentic-override / deterministic-observation / reference-canon / live-derivation / cold-derivation) — doctrinally load-bearing per `docs/canon-and-derivation.md` §6.
2. Confidence lattice (`unbound < intent-only < agent-proposed < agent-verified < compiler-derived < human`).
3. `InterventionReceipt` as a unified receipt for both agent and operator actions.
4. Flakiness and trend scores on locator health (v2 defers these to L3).
5. `epistemicStatus` and `activationPolicy` as facet-level metadata.
6. `driftSeed` as a lineage field.
7. `InterventionBlastRadius` as a scope-of-effect axis orthogonal to reversibility class.

### Shape differences without capability gap

1. Envelope distribution: v1 spreads concerns across domain / application / runtime boundaries; v2 unifies under handshake surfaces.
2. Provenance: v1 implicit in lineage backreference; v2 explicit and forward-threaded from mint.
3. Confidence: v1 materialized on the facet; v2 derived from evidence log.
4. Health: v1 separate index; v2 co-located on locator strategies.
5. Drift: v1 mutation verb; v2 observational event.
6. Facade: v1 runtime-instantiated via screen registry; v2 pre-generated module — substance identical.
7. Error families: v1 four families on execution receipt (`none / precondition-failure / locator-degradation-failure / environment-runtime-failure`); v2 overlaps but adds `assertion-like` and `unclassified`.

### Strongest alignments (v1 already honors)

- §9.1 Intent fetch
- §9.2 Intent parse
- §9.18 Selector and test-data indirection
- §9.19 Parametric expansion and fixture composition
- §9.6 Test compose (envelope shape differs; substance identical)
- §8.5 invariants 2 (provenance), 3 (append-only history), 7 (source vocabulary preserved), 10 (structured fallthrough)

### Shape of the overall delta

The L0 data-flow chain (§9.1–§9.7) is essentially present in v1, with envelope-shape differences rather than capability gaps. The memory layer (§9.9–§9.16) has substantial v1 machinery but differs in shape on the axes where v2 makes structural claims — unified schema, derived confidence, emitted drift, facet-level evidence logs. The agent-ergonomics layer (§8 and §9.8) is the most material gap: the codebase doctrinally acknowledges this layer but has not assembled it (no manifest, no fluency checks, no phase enforcement, receipts not wired to pattern emergence). Selector and test-data indirection (§9.18) and parametric expansion (§9.19) are strengths the v2 ontology carries forward without modification.
