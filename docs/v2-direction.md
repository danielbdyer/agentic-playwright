# v2 Direction

> Status: primary strategy document for v2. The substrate (`v2-substrate.md`), the feature ontology (`feature-ontology-v2.md`), and the delta audit (`v2-delta-audit.md`) are subsidiary to this one and serve as elaboration.

This document is prescriptive. It states what v2 is, names the v1 assets v2 draws from, names what v2 leaves behind, and works backwards from the envisioned destination to a construction order. Where the subsidiary documents describe or audit, this one directs.

The working frame: **v2 is the product; v1's self-improvement machinery is the workshop.** Only a narrow surface ships to customers. Everything that measures, tunes, or validates v2 stays in the workshop — useful to the team building v2, invisible to the people paying for it.

## 1. What v2 is

v2 is a codebase that lets a single agent, given a backlog of Azure DevOps test cases against a customer's OutSystems application, author a Playwright test suite a professional QA team would call professionally authored — and do so faster over time as the agent accumulates memory of the application under test.

The **three things v2 ships** to the customer:

1. A **vocabulary manifest** the agent reads on every session, listing every verb the agent can call with stable signatures and named error families.
2. A **facet catalog** — the memory that grows from authoring work, self-describing, provenance-threaded, and consultable by intent phrase. The catalog is the compounding asset; its quality is what makes tomorrow's authoring cheaper than today's.
3. **QA-legible tests** in the customer's existing test framework (Playwright), referencing facets by name, not selectors. Tests are the visible output; the catalog is the durable one.

Everything else is implementation. The ADO adapter, the Playwright adapters, the test emitter, the envelope substrate — all are libraries v2 consumes. Only those three surfaces face the customer.

The **five primitives** the system is made of — agent, intent source, world, instruments, memory — are listed in the substrate. The **five levels** — L0 agentic authoring, L1 discovery memory, L2 operator-supplied semantics, L3 DOM-less authoring, L4 self-refinement — are the growth spine. The **ten invariants** (stable verb signatures, provenance at mint, append-only history, named error families, no silent escalation, reversible agentic writes, source vocabulary preserved, one source of truth per concern, cheap introspection, structured fallthrough) hold across every handshake. These are described elsewhere; this doc takes them as given.

What v2 is *not*: a rewrite of v1, an extension of v1, a refactor of v1, or a successor framework that carries v1's doctrinal weight. v2 stands on its own. It draws v1's aligned assets where that's the shortest path to shipping, and it refuses v1's scaffolding where v2's design doesn't require it.

## 2. The essentialization — product and workshop are different things

v1 conflates two distinct concerns. One is the **product**: the agent-facing surface that takes ADO intent and produces accepted tests. The other is the **workshop**: the measurement, tuning, and self-improvement machinery the team uses to evaluate whether the product is working.

v2 separates them.

**The product** is the narrow surface in §1: manifest, catalog, tests. It ships to customers. Its design principles are agent fluency, memory compounding, selector and data indirection, QA legibility, structured fallthrough, reversibility gated by operator review. The product's success is measured by the customer's QA team accepting the tests and the agent's time-to-working-test dropping over the corpus.

**The workshop** is everything that evaluates or tunes the product. The theorem verification scaffolding (K/L/S/V/D/R/A/C/M/H and the 19 proof obligations), the pipeline fitness scorecard with its Pareto frontier and per-version lineage, the 15-knob parameter space, the speedrun verb surface (`corpus`, `iterate`, `fitness`, `score`, `baseline`), the convergence-proof harness, the improvement ledger, the scenario corpus partition (10000 vs 20000 series), the dogfood/production distinction — these are workshop tools. They measure whether v2 is getting better over time; they do not ship with v2.

This split is not a cost-cutting move. It is a **clarity move**: once the product is small and the workshop is separate, each can be judged on its own terms. A workshop feature that doesn't move the product forward is a workshop concern, not a product feature. The anti-scaffolding gate applies to the product surface; the workshop is permitted its own kitchen sink because its consumers are the team, not the customer.

The consequence for how v2 is built: **every line of code in v2 is justified by whether it helps the agent ship tests to the customer, or helps the team and the agent verify that shipping is working.** If a line helps the customer's QA team accept a test, it's product. If it helps the team and the agent *verify* that v2 is getting better, it's workshop — but it still ships with v2's codebase, because the agent needs it to reason about v2's performance and the team needs it to run v2 under test. The measurement substrate (§5) is the canonical "both" case: shipped *with* v2, not *to* customers. This is how v2 maintains a good batting average on small bets, which is the shipping discipline.

## 3. What v2 leverages from v1

v2 takes these v1 assets because v2 needs them and v1 has them in the right shape. Each is named with the rationale: not "it's there," but "v2 uses this because…"

### 3.1 Envelope-axis substrate — ported wholesale

**v1 assets:** `lib/domain/governance/workflow-types.ts` (WorkflowMetadata, WorkflowEnvelope), `lib/domain/kernel/hash.ts` (Fingerprint<Tag> with closed registry, stableStringify, sha256), `lib/domain/pipeline/source.ts` (PhaseOutputSource, foldPhaseOutputSource), `lib/domain/handshake/epistemic-brand.ts` (EpistemicallyTyped, foldEpistemicStatus).

**Why v2 uses it:** the four-axis phantom-typed envelope is how v2's invariants (stable verb signatures, provenance at mint, one source of truth per concern, structured fallthrough) become compile-time guarantees rather than conventions. Phase 0 of `envelope-axis-refactor-plan.md` is complete; v2 consumes the result as a library.

**Adjustments at consumption:** Phases B–E of the refactor plan are part of v2's construction order, not v1's. v2 finishes what v1 started here — not by refactoring v1, but by adopting the substrate and continuing its elaboration inside v2's codebase.

### 3.2 L0 data-flow chain — mostly ported, shape adjustments

**v1 assets and their v2 role:**
- `lib/infrastructure/ado/live-ado-source.ts` — Intent fetch and intent parse. The REST v7.1 path, WIQL query, XML regex for `Microsoft.VSTS.TCM.Steps`, parameter and data-row extraction. Ported as-is; v2 wraps it behind the manifest's `intent-fetch` and `intent-parse` verbs.
- `lib/playwright/aria.ts` — accessibility snapshot capture. Ported as-is.
- `lib/playwright/locate.ts` — locator ladder. Ported with v2's ladder order (role → label → placeholder → text → test-id → css) rather than v1's (test-id → role → css). The shape adjustment is a small edit, not a rewrite.
- `lib/runtime/widgets/interact.ts` — action dispatch and precondition validation. Ported with the addition of the four named failure families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`) on the action handshake envelope.
- `lib/domain/codegen/spec-codegen.ts` — TypeScript AST emission for Playwright tests. Ported. The facade remains POM-style; v2 switches the facade from runtime-instantiated (via `lib/composition/scenario-context.ts`) to pre-generated per-screen modules regenerated from the facet catalog on every authoring pass.
- `lib/runtime/adapters/navigation-strategy.ts` — route classification and `waitUntil` selection. Ported with the addition of the `page.url()` idempotence check.

**Why v2 uses these:** the L0 chain is procedural work v1 has already done competently. Rebuilding it greenfield would waste weeks with no design gain. v2's gains live in §3.3 and §3.4, not in the data-flow chain.

### 3.3 Governance phantom brands and foldGovernance

**v1 assets:** `lib/domain/governance/workflow-types.ts` (Approved<T>, ReviewRequired<T>, Blocked<T>, foldGovernance), plus architecture law 8 enforcing zero ad-hoc governance string comparisons.

**Why v2 uses it:** invariant 10 (structured fallthrough) needs teeth. The phantom-brand pattern makes unhandled governance states a compile-time error rather than a runtime surprise, and the architecture law keeps that enforcement current. v2 inherits the law and the brands.

### 3.4 Intervention handoff shape and file-backed decision bridge

**v1 assets:** `lib/domain/handshake/intervention.ts` (InterventionHandoff fields: unresolvedIntent, attemptedStrategies, evidenceSlice, blockageType, nextMoves, competingCandidates, reversalPolicy); `lib/infrastructure/dashboard/file-decision-bridge.ts` (writeDecisionFile, watchForDecision, atomic temp-rename protocol).

**Why v2 uses them:** the InterventionHandoff shape matches v2's decision-handoff spec (substrate §9.4). v2's agent engagement calls for a structured decision handoff at every fallthrough point; v1's InterventionHandoff, constrained to be *required* rather than optional, is the shape v2 uses. The file-backed decision bridge is the cross-process transport — v1 already solved the race-safe atomic-rename protocol.

**Adjustment:** in v1 the handoff is optional on InterventionReceipt; in v2 every agentic decision produces a handoff receipt. The shape stays; the discipline around its population tightens.

### 3.5 Convergence-proof harness — leveraged into v2's measurement substrate

**v1 assets:** `lib/application/improvement/convergence-proof.ts`, `lib/domain/convergence/types.ts`.

**Why v2 uses it:** the N-trial statistical harness answers "does the loop actually converge?" — a question v2 needs answered about its own memory-compounding claim. It becomes part of v2's measurement substrate (§5), not a shipped product feature. Customers don't see it; the team and the agent use it to verify that v2's L1 and L4 claims hold.

### 3.6 Learnings that shape v2 but are not imported as code

The audit surfaced several v1 innovations v2 adopts as *ideas* without necessarily inheriting the v1 implementation:

- **Epistemic branding orthogonal to governance** — v1's insight that observation confidence and governance verdict are different axes. v2 may or may not materialize this as a separate phantom type; the discipline survives either way.
- **Scope-of-effect axis orthogonal to reversibility class** — v1's InterventionBlastRadius. v2 tracks the same concern (a drift event's scope affects how many surfaces reconsider their confidence) without necessarily the same enum.
- **Certification as distinct from activation** — the observation that "written to canon" and "trusted by an operator" are separable states. v2 structures the proposal lifecycle around this.

These are design lessons v2 learned through v1. The code may or may not carry forward; the ideas do.

## 4. What v2 does not inherit from v1

Items below split into two categories. Most are **redesigned fresh for v2** — the concept survives; v1's specific implementation does not. A smaller set is **left behind entirely** — v2 has no equivalent concern because v2's design does not require one.

The distinction matters. Redesigned-fresh items are first-class v2 concerns and v2 will build them from principles; they just don't carry v1's specific choices as a default. Left-behind items are *absent* from v2, not reshaped.

### 4A. Redesigned fresh for v2

The concepts below are first-class v2 concerns. The v1 implementations are not ported. Most of the measurement-related items are grouped under **§5, the v2 measurement substrate** — see there for how v2 handles them collectively.

- **Confidence as a derived scalar, not a named total order.** v1's `unbound < intent-only < agent-proposed < agent-verified < compiler-derived < human` is replaced by confidence derived from the per-facet evidence log. Named rungs may emerge as a byproduct of derivation; they are not part of the memory spec. This keeps §9.11's "confidence derived on read" honest.
- **Theorem claims as narrative framing, operationalized only when they earn it.** v1's K/L/S/V/D/R/A/C/M/H groups and 19 proof obligations are not inherited as shipping artifacts. v2 acknowledges the compounding-memory and intervention-payoff claims in the substrate (§8.1); specific operationalization earns its way back through §5's trust-but-verify discipline, one metric at a time.
- **Measurement over a fresh synthetic testbed, not over v1's dogfood scenarios.** The 10000-series legacy and 20000-series generated-cohort partition is not ported. v2 designs its own synthetic testbed from first principles, with verisimilitude that grows deliberately in controlled increments (§5.1). The existing v1 scenarios do not represent v2's proving ground; v2 starts the testbed over.
- **Scorecard and tuning surface redesigned through §5's evaluation cadence.** v1's Pareto frontier over M5/C6/effectiveHitRate with per-SHA lineage, and the 15-knob `PipelineConfig` driving fitness under sensitivity analysis, are not ported. v2's measurement substrate has its own evaluation cycle and its own tuning decisions; metrics earn their place rather than inheriting it.
- **A single evaluation cadence, not a five-verb speedrun surface.** The `corpus` / `iterate` / `fitness` / `score` / `baseline` verb surface and the `ImprovementRun` / `ImprovementLedger` / `learning-health` aggregates are replaced by v2's single evaluation command against its testbed, producing a token-conservative report the agent consumes (§5.3).
- **Proposal-gating discipline, not per-artifact confidence thresholds.** v1's trust-policy thresholds (element 0.95, posture 0.95, surface 0.95, snapshot 0.98, hint 0.90, pattern 0.95, route 0.95) are not inherited. The *mechanism* — proposal-gated memory writes with operator review — is v2's §8.6 invariant; specific thresholds emerge under L2+ shipping pressure against the real customer tenant.
- **Persistent surfaces named by concern, not `.tesseract/` as a bulk staging directory.** v1's twelve-subdirectory runtime engine directory is not replicated. v2 names each persistent surface explicitly: the facet catalog, the evidence log, the drift-event log, the proposal log, the receipt log, the evaluation log (§5). Each has its own location and its own owner.
- **MCP as one adapter, not the exclusive agent surface.** v1's 33-tool dashboard MCP server is not v2's source of truth. v2's source of truth is the **vocabulary manifest file**, read by the agent on every session. MCP is one adapter over that manifest; the CLI is another; direct library use is a third. The manifest is the authority.
- **Agent-facing error families, not pipeline-fitness classes.** v1's eight pipeline-level fitness classes (`translation-threshold-miss`, `normalization-gap`, and so on) are workshop-specific tuning labels. v2's error families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`, `unclassified`) are execution-level families the agent consumes at runtime for recovery decisions. The pipeline-level classification, if it reappears, lives inside §5's evaluation reporting, not on runtime envelopes.
- **Reasoning as a single port with interchangeable adapters.** v1 has LLM callsites (DSPy harnesses, prompt-engineering scaffolds, per-subsystem request shapes) but no unified port; the provider coupling is spread across the codebase. v2 declares a single `Reasoning` port with three operations — select, interpret, synthesize — and provider-specific adapters (Anthropic, OpenAI, MCP broker, Copilot, local model) behind it. The agent's cognition is reached as an instrument (substrate §2.4); provider choice becomes a composition-level `Layer.succeed(Reasoning.Tag, <adapter>)` decision, not a saga concern. Every reasoning call writes a receipt (prompt fingerprint, model identifier, choice, tokens, latency) under the same append-only discipline the receipt, evidence, and proposal logs already use.

### 4B. Left behind entirely

v2 has no equivalent concern because v2's design does not require one.

- **The six-slot lookup chain and reference-canon transitional slot.** v1's `operator-override` → `agentic-override` → `deterministic-observation` → `reference-canon` → `live-derivation` → `cold-derivation` precedence resolver exists to manage a transition from pre-gate knowledge to gate-earned canonical artifacts. v2 has no such transition to manage. The facet catalog starts empty; it grows through gate-earned canonical artifacts only; ranking within the catalog is by confidence and health, not by slot.
- **Dogfood / production split as a structural axis.** v1's `createProjectPaths(rootDir, suiteRoot)` indirection and gitignore governance of `dogfood/` exist because v1 is evolving through dogfood content. v2 runs against the customer's tenant and application; its synthetic testbed (§5) is a separate, deliberate measurement surface, not a dogfood shadow. There is no "dogfood mode" in v2.

## 5. The v2 measurement substrate — v2 measures itself with its own primitives

The measurement substrate is not a parallel apparatus. It is **v2 applied to v2** — the same primitives (agent, intent source, world, instruments, memory), the same handshakes, the same invariants. Everything about measurement falls out of a single addition: a synthetic intent source committed alongside v2's code. Testbed runs go through v2's normal authoring flow; metrics are derivations over v2's existing run-record log; hypotheses are proposals under the same review discipline memory uses.

This is the functional aesthetic: no new primitives, no parallel code paths, measurement expressed in the vocabulary v2 already has. The substrate is thin because it reuses v2's primitives rather than inventing its own.

The operating frame is unchanged: **trust, but verify**, small bets with a good batting average, "can't improve what you don't measure." What changed between the first draft of this section and now is how much machinery those disciplines need. The answer turned out to be: very little, if the primitives are designed well.

### 5.1 The testbed is an intent-source variant

`intent-fetch` is polymorphic over its source. A work item returned by the Azure DevOps adapter and a work item returned by the testbed adapter have the same shape — `{ id, source, title, preconditions, actions, expected, parameters }`. The only distinguishing field is `source`, which for testbed items names the testbed version (`testbed:v0`, `testbed:v1`, …).

The testbed itself is committed alongside v2's code as YAML files under `testbed/v<N>/`. Each version is a stable snapshot — version 0 is the simplest possible case; version N+1 adds one named, committed increment in verisimilitude (a new role, a new state transition, a new vocabulary variant, a new workflow complexity). Testbed version history is a first-class artifact; regressions at higher-complexity versions surface cleanly because each version is independently runnable.

Downstream of the adapter, no handshake distinguishes testbed from real. Test compose, test execute, facet query, drift emit — all the same. If v2 can't author tests against the testbed, it can't author against real customers either.

### 5.2 Evaluation is authoring, not a separate runner

To evaluate v2, run v2's normal authoring flow against a testbed version as its intent source. Same agent session, same memory consultation, same test compose, same test execute. The difference is only that the testbed ships with expected outcomes, so the run-record log — already kept by v2 as its memory of what happened — becomes an evaluation log when filtered to testbed work items.

There is no separate evaluation runner. There is v2, invoked with `--source=testbed:v<N>`. The session receipt is functionally identical to a customer-backlog receipt; only the `source` field differs. One code path, two audiences.

### 5.3 Metrics are manifest-declared derivations over run records

A metric is a named, manifest-declared derivation over the run-record log. `metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-memory-corroboration-rate`. Each is a verb declared in the vocabulary manifest (§9.8) with a frozen signature once published. Adding a metric is adding a verb; retiring a metric is deprecating a verb; the same discipline verb declaration already enforces applies.

Metric computation is pure given the run log: filter run records by window and testbed version, aggregate, return the scalar plus the run subset the scalar was derived from (so the derivation is auditable). Computation is itself a run event — a metric-compute record appends to the log — so the history of metric values over time is queryable through the same pagination rules §9.20 applies to everything else.

The starting set is deliberately small — three metrics, listed above. Additional metrics are proposed under the same proposal-gated reversibility rules memory uses (§8.6). A metric earns its place by predicting something actionable; if it doesn't, the review rejects it.

### 5.4 Hypotheses are proposals; verification is the next evaluation

A hypothesis is a specific kind of proposal: `{ kind: "hypothesis", proposedChange, predictedDelta: { metric, direction, magnitude }, rationale }`. It enters the same proposal log revisions use (§9.15), with a discriminator on `kind`. Operator review gates it like any other proposal.

If accepted, the code change lands; the next evaluation produces new run records; the agent reads the delta and appends a verification receipt: `{ hypothesis, predictedDelta, actualDelta, confirmed }`. The receipt log is append-only (invariant 3); contradicting a hypothesis never overwrites its receipt — confirmations and contradictions stack into history.

That history is itself queryable. A metric like `metric-hypothesis-confirmation-rate` is a derivation over the receipt log — the batting average, computed the same way every other metric is computed, readable by the agent through the same manifest verbs.

### 5.5 Trust-but-verify in one sentence

Every code change carries a hypothesis; the next evaluation confirms or contradicts it; the receipt log is append-only; the agent reads it to propose the next change. Small bets, reviewed, measured, receipted — and the batting average is a derivation the agent can pull at any time.

### 5.6 What this substrate is not

- **Not a parallel apparatus.** The testbed runs through v2's normal authoring flow. There is no separate evaluation pipeline.
- **Not a metric store.** Metrics are derivations over existing run records, not entries in a sibling database.
- **Not a new primitive.** The testbed is an intent-source variant; every verb it touches is already declared.
- **Not a replica of v1's scorecard with new names.** Metrics start from zero (three) and accrue only through earned predictive value under proposal review.
- **Not a theorem-verification system.** v2's compounding claims stay narrative; operationalization pays its way.
- **Not customer-facing.** The testbed and the evaluation output ship *with* v2's codebase for the team and the agent. They do not ship *to* customers as a product feature.

The aesthetic win is that measurement disappears into v2's own primitives. The substrate is thin because the primitives are good.

## 6. Construction order — backwards from v2

The destination dictates the sequence. Everything below is ordered by "what must exist for the next step to ship."

### Step 0 — scaffolding that must exist before L0 can even run

- **Repository seed**: new v2 package. `lib/` structure aligned to the substrate's five primitives (agent / intent / world / instruments / memory), with `composition/` for wiring and `generated/` for emitter output.
- **Envelope-axis substrate import**: port `lib/domain/governance/workflow-types.ts`, `lib/domain/kernel/hash.ts`, `lib/domain/pipeline/source.ts`, `lib/domain/handshake/epistemic-brand.ts` from v1. Architecture law 8 (no ad-hoc governance comparisons) comes with them.
- **Reasoning port declaration**: declare the `Reasoning` port (`select` / `interpret` / `synthesize`) as a Context.Tag with no adapter wired yet. The manifest lists `reason-select`, `reason-interpret`, `reason-synthesize` with frozen signatures and the named error families. One stub adapter — Anthropic direct or OpenAI direct — lands at Step 3 when L0 sagas need to call it.
- **Build harness**: TypeScript, Effect, Playwright test runner, a minimal CI-equivalent build step that runs locally.

This is not v2 work in a designed sense; it is the starting line.

### Step 1 — the vocabulary manifest and fluency test harness

**Why first:** the manifest is how every other handshake becomes callable by the agent. Without it, the agent cannot orient, and nothing else can be written without embedding assumptions the agent cannot verify.

**What ships at this step:**
- `manifest.json` (or equivalent) generated at build time from code-declared verbs. Each entry has `{ name, category, inputs, outputs, errorFamilies, sinceVersion }`.
- A build check that fails when the manifest and the code diverge.
- A fluency test fixture: canonical agent tasks, one per verb, asserting the agent dispatches correctly.
- Agent session-start reads the manifest once. No session-time reflection over code.

**What this closes:** §9.8 Absent, §8.5 invariant 1 (stable verb signatures), §8.5 invariant 10 (cheap introspection). The two v1 invariants that were Absent in the audit now have teeth.

### Step 2 — the unified facet schema with stable IDs

**Why second:** the facet schema is the shape every memory handshake depends on. Writing facet-mint, facet-query, facet-enrich, or locator-health-track before the schema is settled means reworking all of them when the schema lands.

**What ships at this step:**
- Facet record with `{ id: "<screen>:<elementOrConcept>", kind, displayName, aliases, role, scope, locatorStrategies (with per-strategy health), confidence, provenance (mintedAt / instrument / agentSessionId / runId), evidence (pointer to append-only log) }`.
- Kind-specific extensions for `element`, `state`, `vocabulary`, `route`.
- Storage as per-screen YAML files with in-memory index on load. Atomic temp-then-rename writes.

**What this closes:** §9.9 Shape-different, §9.16 Shape-different. The split-across-two-files pattern collapses into one facet record.

### Step 3 — L0 data-flow chain ported with shape adjustments

**Why third:** L0 is the first shipping claim. Everything above Step 3 is agent substrate; Step 3 is when the agent authors its first test.

**What ships at this step:**
- Intent fetch and intent parse from v1, wrapped behind manifest verbs.
- Navigate with the `page.url()` idempotence check and the `{ reachedUrl, status, timingMs }` envelope.
- Observe with the v2 ladder order (role → label → placeholder → text → test-id → css) and a timestamped observation envelope.
- Interact with the four-family error classification.
- Test compose: ADO intent + (empty) facet catalog → facet minting on the fly during composition → Playwright test file that references the generated per-screen facade, no inline selectors, no inline data.
- Test execute: CLI invocation of Playwright's test runner, `--reporter=json`, per-run record with `classification` on the envelope.

**What this closes:** §9.1 through §9.7 promoted from Partial/Shape-different to Aligned within v2's codebase. The L0 shipping claim becomes runnable against the customer's backlog.

### Step 4 — ship L0 against the customer backlog

The agent authors its first tests. QA reviews them. Acceptance is the signal v2 is on track. Expect Stage α costs: every work item is expensive. Memory is empty; the facet catalog is growing by a few facets per test.

This is a **shipping milestone**, not a coding milestone. Do not skip it.

### Step 5 — stand up the v2 measurement substrate

**Why now:** L0 is running and producing real work. There is now something stable to measure. Because the substrate reuses v2's own primitives (§5), this step is small — a testbed adapter, a few YAML files, two or three manifest verb declarations. The aesthetic pays off by making the lift tiny.

**What ships at this step:**
- **Testbed version 0**: a handful of synthetic work items under `testbed/v0/` as YAML, with known expected outcomes. Deliberately simple — one screen, one affordance, one assertion.
- **An `intent-fetch` adapter** that reads testbed YAML when `source: testbed:v<N>` is specified, and returns the same parsed-intent shape as the ADO adapter. No other handshake changes.
- **Two metric verbs declared in the manifest**: `metric-test-acceptance-rate`, `metric-authoring-time-p50`. Both are pure derivations over the run-record log; both carry the same verb-declare discipline as every other manifest entry. (`metric-memory-corroboration-rate` lights up at Step 6 when L1 makes it meaningful.)
- **A `kind: hypothesis` discriminator on the proposal lifecycle.** Hypothesis proposals flow through the same proposal log §9.15 revisions use, with the discriminator distinguishing code-change proposals from memory-revision proposals. Verification receipts append to the receipt log after each evaluation.

**What this closes:** §5 is operational. Every subsequent step commits a testbed-version increment and names a hypothesis before landing. Trust-but-verify is now a running loop.

**What this does not close:** testbed verisimilitude is low. Growth happens incrementally at Steps 6–9 and continuously after. Version 0 is honest about being a shallow model of the customer's reality — that's the point of committing version history as a first-class artifact.

**What this is explicitly *not* doing:** building a separate evaluation runner, a separate metric store, or a separate scorecard. All three would violate the functional aesthetic; all three turn out to be unnecessary given v2's primitives.

### Step 6 — L1 memory layer with per-facet evidence log

**Why after L0 ships:** L1 optimizes the repeat-authoring case. Without L0 running, there's no repeat authoring to optimize.

**What ships at this step:**
- Per-facet evidence log as append-only JSONL.
- Confidence derived from the log on read, with cached summary invalidated on new evidence.
- Locator health co-located on the facet's locator strategies (moving from v1's separate `SelectorHealthIndex`).
- Memory-backed authoring: test compose consults the catalog before reaching for live observation.
- Facade regeneration on every catalog change.

**What this closes:** §9.11 Shape-different, §9.12 Shape-different. The scale claim in §9.18 ("one catalog update fixes N tests") becomes real.

### Step 7 — L2 operator-supplied semantics

**What ships at this step:**
- Dialog capture instrument: chat transcripts → candidate facets with operator wording preserved.
- Document ingest instrument: shared documents → candidate facets with region anchors.
- Candidate review queue: operator approves / edits / rejects; rejections preserved with rationale.

**What this closes:** §9.14 Absent becomes implemented. The memory starts picking up non-DOM semantics.

### Step 8 — L3 drift detection and DOM-less authoring

**What ships at this step:**
- Drift-emit as an observational event, not a mutation. `drift-events.jsonl` append-only log.
- Confidence-gated authoring policy: when memory confidence about a surface exceeds a threshold, author without fresh observation.
- Drift event surfacing to the agent and operator.

**What this closes:** §9.13 Shape-different to Aligned within v2. §9.17 (affordance extension authoring) becomes possible once drift infrastructure exists — the encounter-propose-review pathway matches the drift pathway in shape.

### Step 9 — L4 self-refinement

**What ships at this step:**
- Confidence aging over the evidence log.
- Corroboration hook on passing runs.
- Revision-proposal aggregation from accumulated drift + decay + corroboration.
- Review-gated activation of revisions.

**What this closes:** §9.15 Absent becomes implemented. The compounding-memory claim becomes measurable in the workshop.

### Workshop extensions — grown from the same primitives

Because the substrate is v2 applied to v2, "extending it" is the same motion as extending v2 itself: commit new testbed work items, declare new metric verbs, propose new hypotheses. Each subsequent step grows the testbed and the metric catalog by the scope of the layer it introduces:

- **At Step 6 (L1 memory):** testbed grows to include repeat-authoring scenarios — the same affordance hit twice, three times. `metric-memory-hit-rate` and `metric-memory-corroboration-rate` are declared as new metric verbs. The L1 claim "repeat work is cheaper" is now measurable.
- **At Step 7 (L2 operator semantics):** testbed fixtures gain synthetic dialog transcripts and synthetic documents. New metric verbs track vocabulary alignment and operator-wording survival through to test output.
- **At Step 8 (L3 drift detection):** testbed adds surface-change scenarios where the synthetic world is perturbed between runs. Drift-detection metric verbs verify the emitter classifies correctly. The convergence claim — "does the loop settle under repeated perturbation?" — becomes a metric derivation over receipts across testbed-version increments, adapting the statistical shape of v1's `convergence-proof.ts` into the metric-verb vocabulary rather than carrying it in as a separate harness.
- **At Step 9 (L4 self-refinement):** the receipt log is mature enough to derive the batting average. `metric-hypothesis-confirmation-rate` — the proportion of hypothesis receipts where `confirmed === true` — is itself a metric verb the agent can query. This closes the trust-but-verify loop: v2 measures its own batting average at improving itself.

None of this ships to customers. All of it ships with v2's codebase. Testbed, metric verbs, and receipt log are the shared working surface between the team and the agent; the audit trail is the product of their collaboration.

## 7. How the subsidiary documents relate

This document is first in line. The other four are read in service of this one.

- **`v2-substrate.md`** defines the five primitives, the five levels, the handoff boundary between agent-authored artifacts and human-editable ones, the anti-scaffolding gate, and the list of deliberately deferred decisions. Read it when you need to verify that a proposed design fits v2's primitives or to check whether a concern belongs to a level v2 has or hasn't reached.
- **`feature-ontology-v2.md`** enumerates the handshakes, technical paths, agent-engagement flows, invariants, and reversibility classes. Read it when you are about to design or implement a specific handshake and need the per-feature contract.
- **`v2-delta-audit.md`** measures v1 against v2. Read it when you need to decide whether a v1 asset is ready to port, needs shape adjustment, or should be left behind. The verdict tally there feeds the "leverage" and "leave behind" decisions in §§3–4 of this document.
- **`v2-transmogrification.md`** is the execution plan: the cathedral (§9), the highway map with six arteries including Reasoning (§10), the saga gallery of fifteen composed flows (§10.5), the runtime composition including the Layer cake, CLI entry points, and fiber tree (§11), and the harvesting flywheel that names how sessions compound across time (§11.7). Read it when you need to trace how a feature in the ontology actually runs — which sagas call it, which highway carries its traffic, and which runtime surfaces it touches.

If there is ever a conflict between this document and the other four, **this document wins**. The subsidiary docs describe; this one directs. If a contradiction appears, either this document is wrong and should be corrected, or the subsidiary document is stale. Do not act on the subsidiary version without resolving the contradiction here first.

## 8. What success looks like for this document

A reader who finishes this document should be able to answer, without consulting the others:

- What is v2? (§1)
- What ships to customers, and what ships with v2 for the team and the agent? (§2)
- Which parts of v1 does v2 draw from, and why those specifically? (§3)
- Which parts of v1 does v2 redesign fresh, and which does v2 leave behind entirely? (§4)
- How does v2 measure whether it is getting better? (§5)
- What is built first, second, third? (§6)

If any of those is unclear on a reading of this document alone, this document has failed and should be revised. The other four documents elaborate what this one names; they do not substitute for the clarity this document is expected to provide.

The destination is small enough to hold in one head: an agent, three shipped surfaces (manifest, catalog, tests), five primitives, five levels, ten invariants, a measurement substrate that verifies progress, and a clean line between what ships to customers and what ships with v2. Trust, but verify. Small bets, good batting average. If that holds, v2 is on course.

