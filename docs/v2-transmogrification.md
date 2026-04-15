# v2 Transmogrification

> Status: the plan to turn v1 into v2. First-in-class execution document; the other four v2 docs (`v2-direction.md`, `v2-substrate.md`, `feature-ontology-v2.md`, `v2-delta-audit.md`) describe the destination, the principles, the features, and the delta. This one is the actual route.

## 1. The shape

v1 does not evolve into v2. v2 is constructed alongside v1 as its own codebase — in a new directory, on a construction branch — and draws v1 in as a library of aligned assets (the envelope-axis substrate, the L0 data-flow chain, the governance brands, the intervention-handoff shape, the file-backed decision bridge). The rest of v1 stays where it is, keeps running for whoever still needs it, and is retired by measurable decision when v2 sustains its shipping claim.

There are ten construction steps, one shipping inflection, one measurement inflection, and one cut-over event. The steps are from `v2-direction.md §6`; the two inflections and the cut-over are what make this plan a plan rather than a checklist.

**The shape in one paragraph:**

Start with a clean `lib-v2/` directory on branch `claude/v2-construction-TKkRI`. Port the envelope-axis phantom substrate (Phase 0 complete in v1) as the first act; v2 inherits it whole and takes over elaboration of Phases B–E from there. Build the vocabulary manifest and fluency harness (the surface v1 never had) before writing any verbs. Commit the unified facet schema before writing the memory layer that uses it. Port the L0 data-flow chain — six instruments, parallelizable — with specific shape adjustments audited in `v2-delta-audit.md`. Ship L0 against the real customer backlog. Only then stand up the measurement substrate: a tiny committed testbed, a polymorphic `intent-fetch` adapter, two manifest-declared metric verbs, and a `kind: hypothesis` discriminator on the existing proposal log. From that point, every subsequent step — L1 memory, L2 operator semantics, L3 drift, L4 self-refinement — commits its testbed-version increment and names the hypothesis the step is betting on. The cut-over moment is a sustained metric floor, not a calendar date.

**The discipline in one paragraph:**

Trust, but verify. Small bets with a good batting average. No line of v2 code is justified without pointing at either a customer-facing capability or a measurement that verifies v2 is improving. No irreversible decision lands without the proposal-gated reversibility the rest of v2 uses. Every hypothesis receipt is append-only; contradictions never overwrite. The envelope-axis substrate enforces what the invariants demand at compile time. Fluency regression fails the build at the same severity as a broken product test. The plan is executable because its primitives are few, its sequencing is explicit, and its checkpoints are measurable.

**The payoff in one paragraph:**

When the cut-over fires, v2 is a small agent-facing surface — vocabulary manifest, facet catalog, QA-accepted tests — shipping against a real customer's OutSystems backlog. The measurement substrate runs alongside, producing hypothesis receipts the agent reads to propose the next change. v1's operational scaffolding (speedrun verbs, theorem groups, 15-knob parameter space, `.tesseract/` runtime directory, dogfood/production split) is archived. v1's aligned modules are owned by v2. The codebase is the size of the problem, not the size of the history. Subsequent evolution is by hypothesis receipt and measurement delta, not by doctrine drift.

The rest of this document is the route.

## 2. Choreography: how v1 becomes v2 mechanically

Six decisions frame how the transmogrification executes. Each is named, decided, and justified once. These are not technical-path choices (those live in §3); they are the *mechanics* of the transition.

### 2.1 Repo and package boundary

**Decision:** v2 lives in a new top-level directory — `lib-v2/` — inside the existing repository, with an internal structure mirroring v1's (`domain/`, `infrastructure/`, `application/`, `composition/`, `generated/`). v1's `lib/` stays untouched until cut-over.

**Why this over a separate repository:** the v1→v2 imports during the construction period are numerous and tight (the envelope-axis substrate, governance brands, intervention-handoff shape, file-backed decision bridge). Managing those across repository boundaries adds operational friction — submodules, npm-published intermediates, cross-repo CI — that outweighs the clean-slate appeal. A sibling directory is boring in the right way.

**Why this over carving `lib/` in place:** carving risks envelope-axis skew. If v1 and v2 share phantom types and v1 keeps evolving them in response to its own pressure, v2 inherits drift silently. Keeping v1's `lib/` frozen and v2's `lib-v2/` evolving independently is cheap to do and cheap to reason about.

**Why this over a long-lived branch with main-rename at cut-over:** a directory lives inside the same working tree alongside v1. Developers and the agent can see both at once, move code between them deliberately, and diff across the boundary. A long-lived branch loses that immediacy.

**Build harness:** `package.json` gains a `build:v2` script alongside `build:v1`. A `tsconfig-v2.json` references `lib-v2/**`. CI runs both. When cut-over fires, `lib-v2/` becomes `lib/` and the v1 variants are removed as one commit.

### 2.2 Freeze discipline — when v1 stops moving

**Decision:** v1 enters *stabilization mode* the moment Step 4 (ship L0 against customer backlog) completes. Stabilization means: bug fixes only, and only for defects that block v2's adoption path or customer production incidents. No new features, no schema changes, no tuning of the 15-knob parameter space, no additions to the theorem-coverage matrix, no evolution of the envelope-axis Phases B–E inside `lib/`.

**Before Step 4:** v1 continues to operate normally. Agent contributions during Steps 0–3 land in `lib-v2/` but v1 customers continue to get the v1 they're already using.

**Between Step 4 and cut-over:** v1 is a stable reference. The four aligned module classes v2 ports from v1 are *owned by v2* inside `lib-v2/` (see §2.3); v1's originals do not change. If a customer production issue forces a v1 fix, it lands in `lib/` as a v1-only change and is mirrored forward into `lib-v2/` only if it affects a ported module.

**After cut-over:** v1 is archived (§6). No further changes to `lib/`; the directory is deleted in the same commit that renames `lib-v2/` to `lib/`.

**Team capacity:** one engineer holds the v1 maintenance lane. The rest of the team works in `lib-v2/`. The agent's contributions go to `lib-v2/` except for the narrow freeze-compatible bug fixes to `lib/`. Parallelism is *temporal* (v1 runs, v2 builds), not *concurrent* (no one works in both at once).

### 2.3 Asset extraction mechanics

Four classes of v1 asset flow into v2. Each has a specific extraction mechanism.

**Class A — Envelope-axis substrate.** `lib/domain/governance/workflow-types.ts`, `lib/domain/kernel/hash.ts`, `lib/domain/pipeline/source.ts`, `lib/domain/handshake/epistemic-brand.ts`.

*Mechanism: port-and-own.* Copy these four files into `lib-v2/domain/` at Step 0. Do not import them from v1. Freeze v1's copies; v2's copies evolve independently via Phases B–E. These are foundational phantom types; divergence would silently break compile-time invariants across the codebase. Ownership means v2 controls the elaboration surface.

**Class B — L0 data-flow chain.** ADO adapter, Playwright adapters (ARIA, locate, interact), navigation strategy, codegen spec emitter, scenario-context facade.

*Mechanism: import initially from v1 path, port-into-`lib-v2/`-on-earn.* In Step 1 the agent needs these verbs callable; the cheapest way is to `import` them from `../lib/...` relative paths. As Step 3 needs shape adjustments (ladder reorder, idempotence check on Navigate, four-family error classification on Interact, pre-generated-module facade shape on Test Compose), each module is ported into `lib-v2/` with the adjustment and the import redirect is updated. By end of Step 3, all Class-B modules live in `lib-v2/`.

**Class C — Governance brands and architecture law 8.** `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`, `foldGovernance`, plus the test-suite law that forbids ad-hoc governance string comparisons.

*Mechanism: port-and-own.* Copy into `lib-v2/domain/governance/` at Step 0 alongside Class A. Port the architecture law as part of `lib-v2/`'s test suite. v2's structured-fallthrough invariant (§8.5 invariant 10 of the ontology) depends on this pattern holding; inheriting the law keeps the enforcement current.

**Class D — InterventionHandoff shape and file-backed decision bridge.** `lib/domain/handshake/intervention.ts` (the handoff fields), `lib/infrastructure/dashboard/file-decision-bridge.ts` (the atomic temp-rename transport).

*Mechanism: port-with-adaptation.* Copy both into `lib-v2/` at Step 1 (the manifest needs the handoff shape to declare verb error families). Adapt the handoff to make it *required* on every agent-side decision, not optional as it was in v1. Preserve the atomic-rename protocol in the decision bridge — it is the race-safe transport v2's agent-in-the-loop depends on.

**Class E — Convergence-proof harness.** `lib/application/improvement/convergence-proof.ts`, `lib/domain/convergence/types.ts`.

*Mechanism: leave in v1, reimplement in v2.* Do not port. At Step 8 (L3) and Step 9 (L4), v2 reimplements the statistical shape as metric-verb derivations over the receipt log — `metric-convergence-delta-p50` and similar, declared through the manifest, reading from `testbed:v<N>` increments rather than stateful trials. v1's harness is tightly coupled to v1's `ImprovementRun` and `ImprovementLedger`, neither of which v2 inherits. Reimplementation in v2's primitives yields a smaller, more composable surface.

### 2.4 Parallel-operation window

**Decision:** v1 and v2 coexist as working codebases through Steps 1–9 of the construction order. The window opens the moment Step 0 commits to `lib-v2/` and closes at the cut-over moment (§6). During that window v1 runs in stabilization mode (§2.2) and v2 is under construction.

**Regression policy:** v2 does not need to reach v1's feature surface before the window closes. v2 is smaller by design (§4 of the direction doc). The gate is the *shipping claim* (customer QA accepts tests v2 authored), not feature parity. If v2 does not do something v1 did and no customer needs it, that is not a regression — it is the `v1 → v2 delta` working as designed.

If v2 does not do something v1 did *and a customer needs it*, the decision tree is: (a) can the need be served by a v1 maintenance release? — if yes, v1 ships a bug fix; (b) if no, the need is a v2 backlog item the team prioritizes before cut-over.

The window does not close on time. It closes on evidence (§6).

### 2.5 Team continuity and the agent's role

**Decision:** all v2 construction work lands on branch `claude/v2-construction-TKkRI`. Merges to `main` happen only at cut-over. Until then, `main` tracks v1 stabilization; the construction branch tracks v2.

**Where the agent works:** the agent reads from `lib/` for reference and writes to `lib-v2/` for construction. From Step 3 onward, every substantive code change the agent proposes carries a hypothesis: "this change will move `metric-X` by direction D, magnitude M." The hypothesis lands in the proposal log (same one revisions use, with `kind: hypothesis`). Operator review gates it. The next evaluation run produces a verification receipt: confirmed or contradicted. The receipt log is append-only; the batting average is itself a declared metric.

**Review discipline:** every pull request to `claude/v2-construction-TKkRI` includes two links — to the hypothesis that motivated the change and to the receipt (once the next evaluation runs). Review checks three things: (a) does the code match the hypothesis design; (b) does the receipt corroborate the predicted delta; (c) does the change respect the ten invariants from `v2-substrate.md §4`. If any of the three fails, the PR does not merge.

**When does the agent self-propose?** Once the measurement substrate is live (Step 5), the agent can read the receipt log, identify where metrics have plateaued or regressed, and propose follow-up hypotheses. Before Step 5, agent contributions are team-directed. The shift in the agent's autonomy happens at the §5 inflection.

### 2.6 Cut-over moment

**Decision:** cut-over is a *metric milestone*, not a calendar date. Three metric floors must be sustained for a full two-week window of customer-backlog work without intervention resets:

- `metric-test-acceptance-rate ≥ 0.85` on the current testbed version (expected: `testbed:v3`, mid-fidelity with role diversity and state transitions) *and* on a 5-item sample of real customer work items reviewed by QA.
- `metric-authoring-time-p50 ≤ 45 min` at L0 stage (memory-free baseline; this is the Stage α cost ceiling v2 commits to ship at).
- `metric-hypothesis-confirmation-rate ≥ 0.70` across the last 30 hypothesis receipts — the agent and team are predicting what helps, not guessing.

Once the floors are sustained, the team executes the cut-over in one atomic change (§6 details the mechanics).

**Why metric, not shipping:** a shipping milestone ("QA accepts N tests") makes N arbitrary and defers to review capacity rather than product quality. A metric milestone makes the decision a consequence of the evidence v2 has already committed to producing.

**Why metric, not coverage:** v2 is intentionally smaller than v1. Feature-parity is the wrong question. Acceptance-rate and batting-average are the right ones.

**Why metric, not calendar:** a calendar creates pressure to cut over before the metrics are sustainable. Calendar is an input to planning, not to gating.

## 3. Phase-by-phase plan

Ten phases, keyed to the construction order in `v2-direction.md §6`. Each phase names what ships, what it depends on, the per-module work involved, the hypothesis the phase is betting on (where Step 5 is live), and the definition of done.

Before Phase 0 begins — and at zero cost — the team can prepare. Agent 2's analysis surfaces five pieces of zero-cost exploratory work that feed directly into Steps 0–2 without touching the critical path:

- Module-level audit of v1 salvage candidates (the audit is already written; the team can review).
- Dependency-graph modeling for the ten-step construction order.
- Build-harness prototyping (TypeScript + Effect + Playwright + test runner on a scratch project).
- Manifest schema exploration — what the agent needs to read on session start.
- Facet schema mockups — YAML structures, field naming, extensions.

These can happen in parallel with the scaffolding phases below.

### Phase 0 — Scaffolding and substrate import

**What ships:**
- New directory `lib-v2/` with internal structure (`domain/`, `infrastructure/`, `application/`, `composition/`, `generated/`).
- Envelope-axis substrate ported wholesale into `lib-v2/domain/` (Class A assets from §2.3): `workflow-types.ts`, `hash.ts`, `source.ts`, `epistemic-brand.ts`.
- Governance brands and `foldGovernance` ported into `lib-v2/domain/governance/` (Class C).
- Architecture law 8 ported into `lib-v2/`'s test suite.
- Build harness: `tsconfig-v2.json`, `package.json` scripts (`build:v2`, `test:v2`), CI config.
- Branch `claude/v2-construction-TKkRI` created, `lib-v2/` committed.

**Hard dependencies:** none. This is the starting line.

**Parallel work streams within the step:**
- (a) TypeScript + Effect + Playwright build harness.
- (b) Class A envelope-axis port (four files; mechanical copy).
- (c) Class C governance brand port.
- (d) Architecture law 8 port into test suite.

All four can happen concurrently; (a) is mildly blocking only in the sense that without the tsconfig, (b) through (d) cannot type-check. In practice (a) lands in a day and the rest follows.

**Hypothesis carried:** none yet — Step 5 is not live. This phase is judgment.

**Definition of done:**
- `npm run build:v2` and `npm run test:v2` both succeed.
- `lib-v2/` imports from `lib/` cleanly for Class A + C (or rather, does not — they're copied, not imported).
- A smoke test that constructs a trivial `WorkflowEnvelope<'execution'>` and runs `foldGovernance` on an `Approved<string>` passes.
- Architecture law 8 runs green against `lib-v2/` (which has no governance string comparisons by construction, since `lib-v2/` has almost no code yet).

### Phase 1 — Vocabulary manifest and fluency harness

**What ships:**
- Manifest schema (`lib-v2/manifesting/manifest-schema.ts`) defining the shape of a verb entry: `{ name, category, inputs, outputs, errorFamilies, sinceVersion }`.
- Manifest generator that runs at build time, scans verb-declaring code, and emits `manifest.json` at a fixed path.
- Build-time check: if the emitted manifest diverges from the last committed manifest in a non-additive way (i.e., a verb signature changed instead of a new verb being added), the build fails.
- Fluency test harness (`lib-v2/composition/fluency-harness.ts`): canonical agent tasks, one per declared verb, asserting the agent dispatches correctly.
- Class D (InterventionHandoff shape + file-backed decision bridge) ported into `lib-v2/domain/handshake/` and `lib-v2/infrastructure/handshake/` with the handoff discipline tightened (handoff becomes mandatory on every agentic decision, not optional).

**Hard dependencies:**
- Step 0 (build harness must exist to generate the manifest).
- Class D is dragged forward here because the manifest needs to declare handoff-carrying verbs with their error families.

**Parallel work streams within the step:**
- (a) Manifest schema and generator.
- (b) Build-time sync check (drift detection).
- (c) Fluency test fixtures (one per verb — but the verb set is tiny at this phase; fixtures accumulate across later phases).
- (d) Class D port with the mandatory-handoff adjustment.

**Hypothesis carried:** none yet.

**Definition of done:**
- Any attempt to change an existing verb's `inputs` or `outputs` in-place fails the build.
- A fresh agent session reads `manifest.json` and runs its canonical task fixtures green.
- A hand-crafted regression — a verb added in code but not declared in the manifest — causes the build to fail with a clear message.

This step closes `feature-ontology-v2.md §9.8` (Absent in v1 in the audit). After this, invariant 1 (stable verb signatures) and invariant 10 (cheap introspection) both have teeth.

### Phase 2 — Unified facet schema with stable IDs

**What ships:**
- Facet schema (`lib-v2/memory/facet-schema.ts`): unified record with `id = "<screen>:<elementOrConcept>"`, `kind` (element | state | vocabulary | route), `displayName`, `aliases`, `role`, `scope`, `locatorStrategies: [{ kind, value, health }]`, `confidence`, `provenance: { mintedAt, instrument, agentSessionId, runId }`, `evidence: <pointer>`.
- Kind-specific extensions as declared in `feature-ontology-v2.md §9.16`.
- Facet store (`lib-v2/memory/facet-store.ts`): per-screen YAML files under `lib-v2/catalog/`, loaded into an in-memory index on startup, atomic temp-then-rename writes.
- Manifest entries for the memory verbs that will fire in later phases: `facet-mint`, `facet-query`, `facet-enrich`, `locator-health-track`. Signatures are committed; implementations land in Step 6 (L1).

**Hard dependencies:**
- Step 1 (manifest must exist to declare the memory verbs).

**Parallel work streams within the step:**
- (a) Schema definition and TypeScript types.
- (b) YAML storage and atomic-write protocol.
- (c) In-memory index keyed by stable ID.
- (d) ID generation and stability rules (what happens if a screen is renamed? — the ID does not change, but `scope.screen` can be updated by proposal).

**Hypothesis carried:** none yet.

**Definition of done:**
- A facet can be round-tripped through YAML and in-memory index without loss.
- A crash mid-write leaves the previous file intact.
- Two concurrent writes to different facets do not corrupt each other.
- Manifest declares the four memory verbs with their signatures frozen.

This step is a *forcing function* (see §5). The facet schema committed here shapes every downstream read and write. A late change forces catalog rewrites.

### Phase 3 — L0 data-flow chain ported with shape adjustments

**What ships:** the six L0 instruments, ported from v1 with per-module adjustments from the delta audit. Each is now callable behind a manifest-declared verb.

Per-module work (Class B from §2.3; target paths are in `lib-v2/`):

| v1 source | v2 target | Action | Specific adjustments |
|---|---|---|---|
| `lib/infrastructure/ado/live-ado-source.ts` | `lib-v2/infrastructure/intent/ado-source.ts` | port-asis | REST v7.1 + WIQL + XML regex unchanged; wrap behind manifest `intent-fetch` and `intent-parse` verbs |
| `lib/playwright/aria.ts` | `lib-v2/instruments/observation/aria.ts` | port-asis | Accessibility snapshot call unchanged |
| `lib/playwright/locate.ts` | `lib-v2/instruments/observation/locator-ladder.ts` | port-with-adjustments | Reorder ladder from v1 (test-id → role → css) to v2 (role → label → placeholder → text → test-id → css) per `v2-delta-audit.md §9.4` |
| `lib/runtime/widgets/interact.ts` | `lib-v2/instruments/action/interact.ts` | port-with-adjustments | Keep role-affordances dispatch table; add four named failure families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`) plus `unclassified` fallback on the action envelope |
| `lib/runtime/adapters/navigation-strategy.ts` | `lib-v2/instruments/navigation/strategy.ts` | port-with-adjustments | Keep route classification and `waitUntil` selection; add `page.url()` idempotence check before `goto`; return discrete `{ reachedUrl, status, timingMs }` envelope |
| `lib/domain/codegen/spec-codegen.ts` | `lib-v2/instruments/codegen/spec-codegen.ts` | port-with-adjustments | TypeScript AST emission unchanged; swap facade from runtime-instantiated (via `scenario-context.ts`) to pre-generated per-screen modules regenerated from facet catalog on every authoring pass; no inline selectors or data |

**Hard dependencies:**
- Step 1 (manifest verbs must be declared before the instruments can be wired).
- Step 2 (facet schema must be committed before the codegen emitter can reference facet IDs).

**Parallel work streams within the step:** six instrument sub-tracks, each largely independent — intent fetch/parse, ARIA capture, locator ladder, interact, navigation, codegen. Integration work at the end of the phase wires them together behind the test-compose and test-execute verbs. This is where wall-time parallelism pays off most.

**Hypothesis carried:** still none — Step 5 is not live. This phase is judgment, but the judgment is constrained: every adjustment is traceable to a specific `v2-delta-audit.md` Partial-in-v1 or Shape-different verdict.

**Definition of done:**
- All six instruments respond to their manifest-declared verbs.
- A single hand-crafted work item (an ADO fixture in `lib-v2/fixtures/`) flows through the full L0 chain and produces a Playwright test file that references facets (minted on the fly during composition) by ID, with no inline selectors or data.
- The Playwright test, when executed, runs against a local fixture application and produces a run record with the new `classification` field populated.
- Fluency checks added at Step 1 pass against the new verbs.

### Phase 4 — Ship L0 against the customer backlog

**What ships:** nothing new in code. The agent authors tests from real ADO work items against the customer's OutSystems application. QA reviews the tests. Acceptance is the signal.

**Hard dependencies:**
- Step 3 complete; all six L0 instruments working against a local fixture.
- Customer ADO tenant access configured for the v2 adapter.
- A small initial batch of work items selected by the team (5–10 items that are representative but not the most complex).

**Parallel work streams within the step:**
- (a) Agent sessions against the first batch (one work item at a time, receipted in session logs).
- (b) QA review of emitted tests (parallel with agent work; reviews come back asynchronously).
- (c) Facets minted on the fly during composition populate `lib-v2/catalog/` organically.

**Hypothesis carried:** still none. This is the first shipping milestone. Expect Stage α costs — every work item is expensive; every test is bespoke; memory is empty.

**This phase is an inflection point (the first of four, per §5).** Before Step 4, v2 is substrate-building without shipping feedback. After Step 4, every decision is measurable against QA acceptance. v1 enters stabilization mode (§2.2) at the moment this phase completes.

**Definition of done:**
- At least three tests v2 authored are reviewed by QA and either accepted into the suite or rejected with explicit feedback that the agent records in a handoff receipt.
- A first *Stage α cost baseline* is captured: the median time-to-completion (authoring start to test passing under review) for the initial batch. This is the number `metric-authoring-time-p50` will be calibrated against at Step 5.
- `lib-v2/catalog/` contains ≥ 20 minted facets with provenance blocks populated correctly.

### Phase 5 — Stand up the measurement substrate

**What ships:** the measurement stance from `v2-direction.md §5` and `feature-ontology-v2.md §9.21–§9.23`, implemented as a thin layer over v2's existing primitives.

Per-module work (all greenfield):

| v2 target | What it produces | Effort |
|---|---|---|
| `testbed/v0/` | Handful of synthetic work items as YAML under `testbed/v0/` with known expected outcomes. Deliberately simple — one screen, one affordance, one assertion. | small |
| `lib-v2/measurement/testbed-adapter.ts` | Polymorphic branch in `intent-fetch` that reads testbed YAML when `source: testbed:v<N>` is specified; returns the same parsed-intent shape as the ADO adapter | small |
| `lib-v2/measurement/metrics.ts` | Two manifest-declared metric verbs: `metric-test-acceptance-rate`, `metric-authoring-time-p50`. Each is a pure derivation over the run-record log. | medium |
| `lib-v2/measurement/receipt-log.ts` | Append-only log of `{ hypothesis, predictedDelta, actualDelta, confirmed, computedAt }` verification receipts | small |
| `lib-v2/memory/proposal-lifecycle.ts` | Extend the existing proposal log's `kind` discriminator to accept `kind: hypothesis`; same proposal-gated review flow applies | small |

**Hard dependencies:**
- Step 4 (L0 must be running and producing real run records, or metrics have nothing to derive from).
- Steps 1, 2, 3 (manifest, facet schema, L0 chain — all needed for metric verb declarations and for run records to exist in the expected shape).

**Parallel work streams within the step:**
- (a) Testbed v0 YAML authoring.
- (b) Testbed adapter wiring.
- (c) Metric verb declaration + computation.
- (d) Receipt log storage.
- (e) Hypothesis kind discriminator on proposal lifecycle.

All five are independent and small. This phase is *deliberately lightweight* because the aesthetic of the measurement stance is that it reuses existing primitives. There is no new evaluation runner. There is no metric store. There is only a new intent-source variant, a few new verbs, and a discriminator on an existing log.

**Hypothesis carried:** the *first* hypothesis v2 records. A possible candidate: "Running the L0 chain against `testbed:v0` (synthetic) will produce `metric-test-acceptance-rate >= 0.95` since expected outcomes are hand-committed." If contradicted, the L0 chain has an integration bug the customer backlog's noise was hiding.

**This phase is the second inflection point (§5).** Before Step 5, decisions are judgment. After Step 5, every substantive code change carries a hypothesis and a receipt. The agent's role shifts from directed-only to partially self-proposing (§2.5).

**Definition of done:**
- `npm run evaluate --source=testbed:v0` runs the L0 chain against the synthetic testbed and produces a batch summary.
- The two metric verbs compute correctly from the run-record log; their outputs are logged as metric-compute records.
- A first hypothesis-carrying proposal lands in the proposal log, is reviewed, accepted, implemented, and its verification receipt appears in the receipt log.
- `metric-hypothesis-confirmation-rate` (declared as a future-facing verb, computed over zero receipts) returns a sensible zero-receipts-yet response.

### Phase 6 — L1 memory layer with per-facet evidence log

**What ships:** the memory layer that makes L0's "every work item bespoke" shift toward "repeat work is cheap."

Per-module work (all greenfield, target `lib-v2/memory/`):

| v2 target | What it produces | Effort |
|---|---|---|
| `lib-v2/memory/evidence-log.ts` | Per-facet append-only JSONL (`<facetId>.evidence.jsonl`). Each entry: `{ timestamp, runId, instrument, outcome, context }` | medium |
| `lib-v2/memory/confidence.ts` | Confidence derivation on read from the evidence log; cached summary invalidated on new evidence | medium |
| `lib-v2/memory/health-track.ts` | Per-strategy locator health co-located on the facet's `locatorStrategies` array (not a separate index as in v1's `SelectorHealthIndex`) | small |
| `lib-v2/memory/query.ts` | Intent-phrase parser + ranked query over the in-memory facet index; matches ranked by confidence, health as tiebreaker | medium |
| `lib-v2/instruments/codegen/facade-regenerator.ts` | Regenerates per-screen facade modules from the facet catalog on every authoring pass | small |
| `lib-v2/measurement/metrics.ts` | Adds `metric-memory-hit-rate` and `metric-memory-corroboration-rate` metric verbs | small |

**Hard dependencies:**
- Step 4 (real customer work items have produced the initial catalog population).
- Step 5 (receipt log exists; the L1 claim needs a hypothesis).

**Soft dependencies:**
- Step 3's codegen emitter — the facade regenerator extends it.

**Parallel work streams within the step:**
- (a) Evidence log storage + confidence derivation.
- (b) Locator health co-location (data migration from v1's separate index if used; otherwise greenfield).
- (c) Facet query implementation.
- (d) Memory-backed authoring (test compose consults catalog before observation).
- (e) Facade regeneration pipeline.
- (f) Two new metric verbs.

**Hypothesis carried:** *L1's foundational claim.* Candidate: "Once memory contains ≥ 50 facets from Stage α work, authoring time on a repeat surface drops by ≥ 30% compared to the L0 baseline captured at end of Step 4." The verification receipt — confirmed or contradicted — is the first real evidence of the compounding-memory claim.

**Definition of done:**
- Testbed `testbed/v1` (new, added at this phase) includes repeat-authoring scenarios. Authoring them exercises the memory query path.
- `metric-memory-hit-rate` and `metric-memory-corroboration-rate` compute correctly from run records.
- At least one real customer work item authored after Step 6 ships reuses ≥ 1 facet without live re-observation; the run record carries the `memory-backed: true` flag for that step.
- The hypothesis receipt for the L1 claim is appended to the receipt log.

### Phase 7 — L2 operator-supplied semantics

**What ships:** the instruments that let operator dialog and shared documents enter the catalog as candidate facets.

Per-module work (greenfield):

| v2 target | What it produces | Effort |
|---|---|---|
| `lib-v2/instruments/operator/dialog-capture.ts` | Reads chat transcripts, extracts candidate facets with operator wording preserved | medium |
| `lib-v2/instruments/operator/document-ingest.ts` | Parses operator-shared documents (Markdown initially; richer formats deferred), extracts candidates with region anchors | medium |
| `lib-v2/memory/candidate-review.ts` | Queue with approve / edit / reject operations; rejected candidates preserved with rationale | small |
| `lib-v2/measurement/metrics.ts` | Adds `metric-operator-wording-survival-rate` and `metric-vocabulary-alignment-score` | small |

**Hard dependencies:**
- Step 6 (candidate facets land in the same facet records L1's memory layer owns).

**Soft dependencies:**
- Step 5 (the L2 claim needs measurement to verify, but the implementation does not strictly block on metrics being live).

**Parallel work streams within the step:** four — dialog capture, document ingest, candidate review queue, two new metric verbs.

**Hypothesis carried:** candidate: "Authoring tests for work items whose domain semantics are explained in an operator-shared document produces tests whose step language is ≥ 80% vocabulary-aligned with the document, as scored by the new `metric-vocabulary-alignment-score`."

**Definition of done:**
- Testbed `testbed/v2` (new) includes synthetic dialog transcripts and synthetic documents as fixtures.
- At least one candidate facet minted from an operator dialog and one from a document ingest are reviewed by an operator and either approved into the catalog or rejected with rationale.
- The two new metric verbs compute correctly from test output.
- Operator review discipline holds: no candidate enters memory without explicit approval; rejected candidates are retained in the rejection log.

### Phase 8 — L3 drift detection and DOM-less authoring

**What ships:** the confidence-gated authoring policy, drift-as-emitted-event, and drift event surfacing.

Per-module work (greenfield):

| v2 target | What it produces | Effort |
|---|---|---|
| `lib-v2/observation/drift-emit.ts` | Appends drift events to `drift-events.jsonl` with `{ runId, facetId, strategyKind, mismatchKind, evidence, observedAt }` shape. Emitter classifies at emit time; `ambiguous` fallback when unclear. | medium |
| `lib-v2/instruments/codegen/confidence-gate.ts` | Authoring policy: when memory confidence about a surface exceeds threshold, author without fresh observation. Threshold is proposal-gated. | small |
| `lib-v2/measurement/metrics.ts` | Adds `metric-drift-event-rate`, `metric-dom-less-authoring-share`, `metric-convergence-delta-p50` (the convergence-proof statistical shape, reimplemented as a metric verb per §2.3 Class E) | medium |

**Hard dependencies:**
- Step 6 (locator health must be populated; L3 consumes it).

**Soft dependencies:**
- Step 7 (richer memory from L2 raises confidence thresholds faster, but L3 works on L1-only memory).

**Parallel work streams within the step:** drift emit, confidence gate, metric verbs.

**Hypothesis carried:** candidate: "At `metric-memory-hit-rate ≥ 0.60` per surface, DOM-less authoring for that surface produces `metric-test-acceptance-rate` within 5 percentage points of the same surface authored with live observation — i.e., memory is faithful enough to skip observation."

**This phase is the third inflection point (§5).** Before Step 8, agent always observes before authoring. After Step 8, the agent has a confidence-gated skip policy and drift is a first-class observational event rather than a silent test failure.

**Definition of done:**
- Testbed `testbed/v3` (new) includes surface-change scenarios where the synthetic world is perturbed between runs. Drift emits classify the perturbations correctly.
- `metric-convergence-delta-p50` — the v2 equivalent of v1's convergence proof — is computed as a metric verb over testbed-version increments and returns a sensible value.
- At least one real customer work item authored after Step 8 is authored DOM-less for at least one step; the run record flags which steps were memory-only.
- A deliberately-injected drift (a test fixture with a changed `name` attribute) emits a drift event and surfaces to operator review.

### Phase 9 — L4 self-refinement

**What ships:** the maintenance passes and proposal flows that let memory improve between authoring sessions.

Per-module work (greenfield):

| v2 target | What it produces | Effort |
|---|---|---|
| `lib-v2/memory/confidence-age.ts` | Idempotent maintenance pass that decays confidence on uncorroborated evidence logs | small |
| `lib-v2/memory/corroborate.ts` | Post-execution hook: passing test runs append positive evidence to every referenced facet | small |
| `lib-v2/memory/revision-propose.ts` | Aggregates drift events + decay + corroboration into revision proposals; landing in the proposal log with `kind: revision` | medium |
| `lib-v2/measurement/metrics.ts` | Adds `metric-hypothesis-confirmation-rate` (derives the batting average from the receipt log) — the final closure of the trust-but-verify loop | small |

**Hard dependencies:**
- Step 6 (evidence logs are the substrate).
- Step 8 (drift events feed into revision proposals).

**Parallel work streams within the step:** aging, corroboration, proposal generation, the final metric verb.

**Hypothesis carried:** *the closure claim.* Candidate: "Across rolling 30-receipt windows, `metric-hypothesis-confirmation-rate` holds ≥ 0.70 — the agent and team are predicting what helps, not guessing." If this holds for a two-week window, the cut-over floors (§2.6) are within reach.

**Definition of done:**
- The three maintenance passes (age, corroborate, propose) run as scheduled or on-demand without requiring manual intervention.
- Revision proposals surface to operator review with cited evidence; rejections are preserved.
- `metric-hypothesis-confirmation-rate` computes over the receipt log and returns a running average.
- The trust-but-verify loop closes: v2 is now measuring its own batting average at improving itself.

After Phase 9, v2 is feature-complete relative to the level spine. The remaining work is sustaining the metrics (§2.6) until cut-over fires.

## 4. Dependency graph and parallelization map

The critical path is linear across the ten phases. Where wall time is won or lost is *within* each phase, through the parallel work streams named in §3 and through two multi-phase parallel tracks that span the construction order. This section names the DAG, the critical path, and the parallelization opportunities that collapse the most of it.

### 4.1 The DAG

Each phase depends hard on the phase before it, with two exceptions noted below.

```
    Phase 0 ── Scaffolding + substrate import
        │
        ▼
    Phase 1 ── Vocabulary manifest + fluency harness
        │
        ▼
    Phase 2 ── Unified facet schema
        │
        ▼
    Phase 3 ── L0 data-flow chain (six parallel instrument tracks)
        │
        ▼
    Phase 4 ── Ship L0  ◀── First inflection
        │
        ▼
    Phase 5 ── Measurement substrate  ◀── Second inflection
        │
        ▼
    Phase 6 ── L1 memory layer
        │
        ▼
    Phase 7 ── L2 operator semantics
        │
        ▼
    Phase 8 ── L3 drift + DOM-less  ◀── Third inflection
        │
        ▼
    Phase 9 ── L4 self-refinement
        │
        ▼
    Cut-over (metric floor sustained for 2 weeks)
```

**Critical path:** Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → Cut-over. Ten phases, each hard-blocking the next. The length of this chain is the minimum wall time to ship; no architectural shortcut exists.

### 4.2 Soft dependencies (not on the critical path)

Two soft dependencies are worth naming because they modulate when later phases become *useful* even though they don't block the code:

- **Phase 7 soft-depends on Phase 5.** L2 instruments can ship without metrics, but the L2 claim ("memory reflects vocabulary operators actually use") is unfalsifiable without measurement. In practice, Phase 7's hypothesis cannot be receipted if Phase 5 is not live.
- **Phase 8 soft-depends on Phase 7.** Richer memory from L2 raises confidence thresholds faster and makes DOM-less authoring reach its shipping claim earlier. L3 works on L1-only memory, but the convergence claim tightens with L2 semantics in place.

### 4.3 Parallel tracks

Five named tracks run through the construction order. Three are within-phase (tightening the phase-internal wall time); two are cross-phase (collapsing the overall critical path where they overlap with the phase structure).

**Track A — Scaffolding and substrate port (Phases 0–2).**
Within Phase 0: build harness, Class A port, Class C port, architecture law port — four sub-streams, concurrent. Within Phase 1: manifest schema, drift check, fluency fixtures, Class D port — four sub-streams. Within Phase 2: schema types, YAML store, in-memory index, ID rules — four sub-streams. The team can cover Phases 0–2 without serializing any sub-stream within them.

**Track B — L0 instruments (Phase 3).**
The six L0 instruments are independent of each other during implementation; they compose at integration. Running them as six concurrent sub-tracks collapses Phase 3's wall time by roughly 3–4× compared to sequential implementation. This is the single largest wall-time win in the plan.

**Track C — Customer validation (Phase 4).**
Agent sessions (a), QA review (b), and organic catalog population (c) run concurrently. Phase 4's wall time is dominated by QA reviewer availability, not by coding.

**Track D — Measurement layers (Phases 5–9).**
Each of Phases 5–9 grows the testbed by one version (v0 → v1 → v2 → v3 → v4) and adds a small set of metric verbs. These phases *can pipeline*: the testbed-version-N+1 increment for Phase K+1 can be authored and committed while Phase K's implementation completes, so that when Phase K ships, the next testbed version is ready to light up immediately. This collapses serial wall time on the measurement-plus-layer stretch by roughly 30–40%.

**Track E — Pre-Phase 0 zero-cost exploration.**
Five pieces of work that can happen before Phase 0 starts and feed directly into Phases 0–2:
- Module-level audit of v1 salvage candidates (already written; review is the remaining work).
- Dependency-graph modeling (this section is one realization; deeper module-level graphs can follow).
- Build-harness prototyping on a scratch project (validates TypeScript + Effect + Playwright + test runner combination).
- Manifest schema exploration (what fields a verb entry carries; what the agent reads on session start).
- Facet schema mockups (YAML structures, field naming, extensions — informs Phase 2).

Track E is free wall time — it happens before the critical path even begins and removes uncertainty from Phases 0–2.

### 4.4 Highest-leverage parallelization

Three opportunities dominate. Pursuing them reduces end-to-end wall time significantly; neglecting them adds roughly the same amount.

1. **Parallelize the six L0 instruments in Phase 3.** Six concurrent sub-tracks instead of six sequential ones. Biggest single win; often the difference between a quarter and two.
2. **Pipeline the measurement layers across Phases 5–9.** Testbed-version-N+1 authoring begins during Phase K, not after. Metric-verb declaration can happen slightly ahead of the implementation it will measure, so Phase K ships with its verification hypothesis ready.
3. **Exploit Track E before Phase 0 begins.** Every uncertainty that's resolved before Phase 0 is wall time that does not appear on the critical path. The team should treat Track E as the starting line, not as "premature optimization."

### 4.5 What the critical-path structure implies for team shape

The critical path is linear, which means there is no escape from the ten-phase sequence. But the parallel tracks imply the team's shape:

- **Phases 0–2:** one engineer can run most of it; the agent does the mechanical copies and the schema authoring. Two weeks feasible.
- **Phase 3:** the six-parallel-instrument opportunity is the first place broader team capacity pays off. One engineer per instrument (or one agent per instrument, coordinated) collapses the phase to the longest-single-instrument wall time.
- **Phase 4:** one engineer plus QA; this phase is bottlenecked on customer review, not on code.
- **Phases 5–9:** pipeline-enabled; two or three engineers plus the agent working across testbed growth, metric verbs, and memory-layer implementation.

The plan is feasible for a small team (2–4 people) plus the agent. Scaling the team beyond that does not linearly collapse the critical path because most of the dependencies between phases are hard.

## 5. Forcing functions, inflection points, cascade risks

Four classes of named concern. Each has a mitigation handle. None are optional to read; the plan's survival depends on the team tracking each class explicitly.

### 5.1 Forcing functions

Decisions whose early form constrains everything downstream. Once committed, late changes force cascading rework.

| Forcing function | Committed in phase | What it constrains | Mitigation handle |
|---|---|---|---|
| **Facet schema shape** (ID format, required fields, provenance block) | Phase 2 | Every memory read and write in Phases 3, 6, 7, 8, 9 | Commit schema before Phase 3 integration begins. Build-time schema validator forbids unsigned shape changes. Treat schema additions as new fields (backward-compatible); forbid field removal during the construction period. |
| **Vocabulary manifest format** (verb entry shape, signature schema) | Phase 1 | Every verb declaration in Phases 1–9; invariant 1 (stable verb signatures) is materialized here | Finalize format before any verb is published. Once a verb with a given signature ships in `manifest.json`, treat that signature as immutable: deprecate-and-replace, never change in place. `sinceVersion` field on every entry to enable deprecation tracking. |
| **Testbed directory layout** (`testbed/v<N>/` convention, per-version immutability) | Phase 5 | The path convention for every subsequent testbed version; metric verbs that reference testbed versions | Fix `testbed/v<N>/` layout and version-increment protocol in Phase 5 before shipping v0. Version N, once committed, never mutates; increments create v1, v2, etc. Version-rollback is forbidden after public announcement. |
| **Repo and package boundary** (`lib-v2/` sibling vs. carve-in-place vs. separate repo) | Phase 0 | Import paths, build config, CI pipelines, for all subsequent phases | Resolve in Phase 0 before any `import` is written. Recommendation is `lib-v2/` per §2.1; runner-up is a separate repo (rejected for friction). Once committed, relocation is a one-time cost that happens only at cut-over. |
| **Envelope-axis phantom type shape** (inherited from v1's Phase 0-complete refactor) | Phase 0 | The compile-time invariants that hold across all ten phases | Port Class A as-is from v1 in Phase 0; do not modify during construction. Phases B–E (inherited from v1's in-flight refactor plan) elaborate in `lib-v2/` only after the basic port stabilizes. Cross-module integration tests confirm v1-imported types and v2-used types agree in shape. |

The common thread: **every forcing function is committed in Phases 0–2**. That is by design. These three phases commit the substrate; the other seven phases compose on top of it. Team discipline during Phases 0–2 disproportionately determines the cost of everything downstream.

### 5.2 Inflection points

Four moments where the transmogrification's character changes. Each has prerequisites and tell-tale signs that indicate it has been crossed.

**Inflection 1 — First L0 ship (end of Phase 4).**

*What changes:* substrate-building becomes measurable shipping. The team has its first signal from customer QA.

*Prerequisites:* Phases 0–3 complete; at least one end-to-end authoring flow works against a hand-crafted fixture.

*Tell-tale signs the inflection has passed:*
- First customer work item is authored by the agent and surfaces to QA.
- QA reviews at least three tests and returns acceptance / rejection verdicts.
- A Stage α cost baseline is captured and recorded.
- v1 enters stabilization mode per §2.2.

**Inflection 2 — Measurement substrate live (end of Phase 5).**

*What changes:* design decisions stop being pure judgment and start carrying hypothesis receipts. The agent's autonomy shifts from directed to partially self-proposing.

*Prerequisites:* Phase 4 shipped; testbed v0 committed; two metric verbs declared; `kind: hypothesis` discriminator live on the proposal lifecycle.

*Tell-tale signs:*
- `npm run evaluate --source=testbed:v0` produces a batch summary.
- Metric verbs compute correctly from run records.
- The first hypothesis-carrying proposal lands in the proposal log, is reviewed, lands in code, and its verification receipt appears.
- The agent can read the receipt log to summarize "what has moved since last evaluation."

**Inflection 3 — L3 drift + DOM-less authoring live (end of Phase 8).**

*What changes:* the agent gains the confidence-gated skip policy; drift becomes a first-class observational event rather than a silent test failure. The character of failure changes from "red test" to "classified drift event with recovery options."

*Prerequisites:* Phases 1–7 complete; at least 50 facets in the catalog with locator health populated across multiple runs; confidence threshold value approved by operator review.

*Tell-tale signs:*
- At least one real customer work item is authored with a DOM-less step (memory confidence ≥ threshold skips fresh observation), runs, and either passes or emits a drift event.
- A deliberately-injected drift emits and surfaces to operator review.
- `metric-convergence-delta-p50` (the v2 adaptation of v1's convergence proof) computes over testbed-version increments.

**Inflection 4 — Cut-over (three metric floors sustained).**

*What changes:* v1-primary becomes v2-primary. `lib-v2/` becomes `lib/`; `main-v1-archive` tag preserves v1.

*Prerequisites:* Phase 9 shipped; `metric-test-acceptance-rate ≥ 0.85`, `metric-authoring-time-p50 ≤ 45 min`, `metric-hypothesis-confirmation-rate ≥ 0.70` all sustained for a two-week window.

*Tell-tale signs:* see §6 below.

### 5.3 Cascade risks

Choices that, if wrong, force rework across multiple phases. Severity reflects how many phases would need rework.

| Risk | Severity | Affected phases | Mitigation handle |
|---|---|---|---|
| **Facet schema proves inadequate when customer complexity arrives** | High | 3, 4, 6 (3 phases) | Phase 3 L0 authoring runs an explicit "expected facet shape" assertion per real work item. Before Phase 6 ships, conduct a facet-shape adequacy review against actual L0 output. Gate L1 shipping on zero required-field retrofits. |
| **Verb signature proves wrong after real usage** | High | 3, 5, 6, 7, 8, 9 (6 phases) | Phase 4 real-world testing logs "verbs that failed to classify real errors" as a separate handoff category. In Phase 5, before declaring metrics, review the handoff log and proposal-gate any verb deprecations discovered. Deprecation with a new verb costs a manifest entry; in-place change violates invariant 1. |
| **Confidence-derivation rule skew between L1 and L3** | Medium | 4, 5, 6, 7, 8 (5 phases) | Before Phase 6 ships, author the confidence-derivation rule as a named proposal. Gate L1 shipping on operator approval of the rule, even though enforcement fires at Phase 8. This aligns L1's evidence collection with L3's consumption. |
| **Run-record log schema drift between Phase 3 and Phase 5** | Medium | 4, 5, 6, 7, 8, 9 (6 phases) | In Phase 3, commit the run-record schema to code and embed a `logVersion` field on every record. In Phase 5, metric verb signatures name their expected `logVersion`. Forbid run-record schema changes without deprecating affected metric verbs and issuing new ones. |
| **Proposal-gating mechanism not live before Phase 6 depends on it** | Medium | 6, 7 (2 phases, but blocking) | Implement proposal-log infrastructure (append-only JSONL + review queue CLI) in Phase 5 alongside the testbed, not in Phase 6. Treat proposal-log as a prerequisite, not a Phase 6 feature. Dry-run a proposal cycle in Phase 5 to validate the mechanism before L1 depends on it. |
| **L0 ladder order lock-in cost** | Medium | 3, 4, 6, 8 (4 phases) | Phase 3 tests measure locator-match quality per-rung on real customer surfaces. Phase 5 testbed v0 exercises each rung explicitly. Before Phase 6 L1 ships, a ladder-order adequacy review gates whether the chosen order stays or a reorder is proposal-gated before locator health commits. |
| **Agent fluency regression undetected across phases** | Medium | 1, 3, 4, 5, 6, 7, 8, 9 (8 phases) | Embed fluency checks in the build at Phase 1, not as optional tests. Any PR that touches manifest, verb implementation, or handshake signatures must pass fluency checks to merge. Fluency regression is treated at the same severity as a broken product test. |

### 5.4 Measurement dependencies — Phases 1–4 carry unmeasured choices

The plan has a structural awkwardness: Phases 1–4 commit design choices before Phase 5 is live to verify them. This is unavoidable — you cannot build the measurement substrate before you have something to measure — but it is not unmanaged.

Three specific choices carry forward into Phase 5 as things to *verify once measurement lights up*:

- **Phase 1's verb signatures and error families** — did the chosen set classify real L0 failures adequately, or do handoffs frequently land in `unclassified`? Phase 5 reviews the Phase 4 handoff log and proposal-gates any deprecations.
- **Phase 2's facet schema adequacy** — did the required fields cover real customer surfaces, or do Phase 4 facets frequently carry retrofits? Phase 6's shipping gate includes a schema adequacy review.
- **Phase 3's L0 ladder order and error classification** — did the adjustments (role-first ladder, four-family error classification) improve real outcomes vs. v1's order and classification? Phase 5 testbed includes ladder-rung exercises; Phase 4 run records feed a comparison analysis.

The plan does not pretend these choices are risk-free. It names them, flags them for Phase 5 review, and makes the review *mechanical*: the handoff log and run-record log together provide the evidence; the metric verbs declared at Phase 5 are the lens.

## 6. Cut-over and v1 retirement

Cut-over is a single commit. Everything that leads up to it is accumulated; everything that happens after it is irreversible. This section names what the commit contains.

### 6.1 Gating the moment

The three metric floors from §2.6:

- `metric-test-acceptance-rate ≥ 0.85` on the current testbed version (expected `testbed:v3`) *and* on a 5-item sample of real customer work items reviewed by QA, sustained for **two consecutive weeks** of customer-backlog work without intervention resets.
- `metric-authoring-time-p50 ≤ 45 min` at L0 stage across the same window.
- `metric-hypothesis-confirmation-rate ≥ 0.70` across the rolling window of the last 30 hypothesis receipts.

"Sustained" means: every daily evaluation run inside the two-week window reports all three metrics at or above their floors. A single dip below the floor resets the window to day zero.

The team reviews the three-metric floor weekly during Phase 9 and the stretch beyond it. When the two-week window closes green, the cut-over commit is staged.

### 6.2 The cut-over commit

One atomic change. Six actions in one commit or a tight sequence of commits landed together:

1. **Archive v1.** `git tag main-v1-archive` at the current `main` HEAD. This preserves v1 for historical inspection; the tag does not get garbage-collected.
2. **Delete v1's `lib/`** in the v2 branch. The archive tag keeps it recoverable; the working tree loses it.
3. **Rename `lib-v2/` to `lib/`.** Import paths across `lib-v2/` update in the same commit.
4. **Promote the testbed location.** `testbed/v<N>/` stays at repo root; the `dogfood/` directory is removed (if it still exists) alongside the `lib/` removal.
5. **Update the build harness.** `package.json`'s `build:v2` becomes `build`; `build:v1` is removed; `tsconfig-v2.json` replaces `tsconfig.json`.
6. **Merge `claude/v2-construction-TKkRI` into `main`.** Tag the merge commit `v2.0`.

The commit is a single reviewable change. The team reviews it; the agent reviews it; both sign off. QA is notified that v2 is now the primary target.

### 6.3 What lives on after cut-over

- The envelope-axis substrate in `lib/domain/` — ported from v1's Class A, now owned by v2.
- The L0 data-flow chain in `lib/instruments/` — ported from v1's Class B with shape adjustments.
- The governance brands and `foldGovernance` in `lib/domain/governance/` — Class C.
- The InterventionHandoff shape and file-backed decision bridge — Class D, with the mandatory-handoff adjustment.
- The facet catalog in `lib/catalog/` — populated organically during Phases 4–9 plus whatever the first real customer work produced.
- The evidence log, receipt log, drift-event log, proposal log — all append-only, all preserved from their Phase-5-through-Phase-9 contents.
- The testbed versions v0 through v3 (or whichever is current) — committed; their run records remain queryable.
- `main-v1-archive` tag — v1's final state, recoverable by `git checkout main-v1-archive`.

### 6.4 What is gone after cut-over

- `lib/` with v1's operational scaffolding: speedrun verbs, theorem-group proof obligations, 15-knob parameter space, scorecard JSON, improvement ledger, learning-health ranking, `.tesseract/` ephemeral directory definitions.
- The dogfood / production distinction as a structural axis. v2 runs against customer tenants; the synthetic testbed is a deliberate measurement surface, not a training shadow.
- The six-slot lookup chain and reference-canon transitional slot — retired because the transition they managed is now complete.

v1's CLI surface (`context`, `workflow`, `paths`, `trace`, `impact`, `surface`, `graph`, `types`) is removed from `package.json`. v2's CLI is narrower: `build`, `test`, `evaluate --source=testbed:v<N>`, and whatever manifest-declared verb invocations the team exposes as scripts.

### 6.5 The post-cut-over first week

One week of active watching. If any of the three metric floors dips, the team investigates but does not revert — the floors were sustained for two weeks before cut-over; transient dips are expected noise.

Real test is whether v2 can handle a real customer issue in production: a surface change that requires a test update, a new work-item type that requires a new intent-parse path, a vocabulary request from an operator. v2's first week post-cut-over is observed; by end of that week, the team has a quiet confidence that v2 is holding its shipping claim without the v1 safety net.

## 7. Definition of done

Three layers, in order of increasing commitment.

### 7.1 "v2 has shipped" — when the cut-over commit lands

- All ten phases complete per the definition-of-done in each phase.
- Three metric floors sustained for two weeks prior to cut-over.
- `main-v1-archive` tag exists; `main` now points at the v2.0 merge commit.
- `lib/` contains v2's code; `lib-v2/` no longer exists.
- `testbed/v<N>/` versions v0 through current are committed.
- The four supporting docs (`v2-substrate.md`, `feature-ontology-v2.md`, `v2-delta-audit.md`, `v2-direction.md`) are updated where references to "v1" or "v2" are stale in light of the cut-over.

### 7.2 "v2 is sustaining" — one month post-cut-over

- Three metric floors hold across the month.
- At least one new metric verb has been proposed, reviewed, and declared — the metric catalog grows as v2's shipping reveals what's worth measuring.
- At least five hypothesis receipts have appended to the receipt log since cut-over; the batting average is still ≥ 0.70.
- No customer escalation has required a revert or a hot-fix branched off `main-v1-archive`.
- The agent can read the receipt log and summarize v2's trajectory coherently without human-authored interpretation.

### 7.3 "v2 is the system" — the transmogrification is fully past

- Six months post-cut-over (or whenever the team agrees).
- v1's archive tag has not been touched (nobody has needed to check out v1 for operational reasons).
- The three metric floors have moved upward (e.g., acceptance rate now ≥ 0.90, authoring time ≤ 30 min p50, confirmation rate ≥ 0.75) — v2 has earned its way past the initial floors.
- New capabilities have shipped under the proposal-gated hypothesis discipline, not as architectural overhauls.
- The team considers v2 "the codebase" and v1 "historical reference."

At this point, transmogrification is no longer a word the team uses for itself. It is a thing that happened once, and the system now measures its own evolution through the substrate v2 shipped with.

## 8. What is deferred to execution

The plan commits to what it needs to commit to. A number of decisions are explicitly *not* settled here and will be made during execution with evidence on the table. Each is named so its absence is not a surprise.

- **Exact metric formulae for the first three metric verbs.** `metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-hypothesis-confirmation-rate` are named with their semantics; the exact window lengths, aggregation functions, and outlier handling emerge at Phase 5 shipping.
- **Confidence-derivation rule from the evidence log.** Aging half-life, corroboration weight, decay shape — all deferred to Phase 6 and made proposal-gated at that time.
- **Drift classification thresholds.** What counts as `ambiguous` vs. a concrete mismatch; per-mismatch-kind confidence adjustments. Deferred to Phase 8.
- **Testbed version increment protocol.** How often new versions are cut; what "controlled increment in verisimilitude" means concretely (add one new role? one new state? one new workflow?). Calibrated during Phases 5–8.
- **Operator review UI.** JSONL queue plus a CLI is sufficient for the construction period per `feature-ontology-v2.md §9.14`. Richer surfaces, if needed, emerge under customer pressure after cut-over.
- **The specific L2 document parser.** Markdown is the first format; richer formats (PDF, Confluence exports, images) defer to Phase 7 shipping pressure against real customer material.
- **Who (or what) triggers the weekly metric-floor review.** Could be a scheduled CI job, an operator ritual, a chat bot; decided in Phase 9 as the metric floors become load-bearing for the cut-over decision.
- **v1 archive retention policy.** The `main-v1-archive` tag is permanent by default, but the policy for ever deleting or pruning v1's history is an operational decision the team takes once v2 has proven out.

These deferrals are not gaps in the plan. They are decisions whose right time is when the plan's execution has produced the evidence to inform them. Committing them earlier would be choosing in ignorance; committing them later is what the anti-scaffolding gate calls for.

---

v1 becomes v2 through ten phases, five parallel tracks, four inflection points, a handful of forcing functions named and gated, and one cut-over commit fired on a sustained three-metric floor. The plan is the route. The discipline is trust-but-verify. The end state is a codebase the size of the problem, producing tests a real customer accepts, measured by an agent that reads its own receipts. Execute.

## 9. The cathedral — the architecture as a unified whole

What follows is not a plan section. The plan ends with §8. What follows is the view from the finished cathedral, looking at its own structure.

Many patterns and disciplines converge in v2 — Effect's composition calculus, functional programming's purity discipline, hexagonal architecture's ports and adapters, clean architecture's dependency direction, domain-driven design's bounded contexts and ubiquitous language, the Gang-of-Four visitor and strategy patterns, event sourcing's append-only logs. None of them is arbitrary; none of them is v2's primary frame. They are the same structure viewed from different angles, and v2 sits at their intersection because v2's primitives are the common ground they all arrive at.

The parallel work streams named throughout §3 compose cleanly because the architecture has this property. A work stream is independent when the primitive it operates on is bounded, the port it crosses is narrow, the Effect program it contributes is typed, and the invariants it depends on are compile-enforced. Parallelism is an emergent property of discipline, not a scheduling trick. This section names the discipline.

### 9.1 One vocabulary, many angles

The five primitives — agent, intent source, world, instruments, memory — are DDD bounded contexts. Each owns its ubiquitous language. Each publishes its verbs through the manifest. Each is implemented as a hexagonal module with a pure domain core and a layer of adapters around it. Clean architecture's dependency rule holds: the domain depends on nothing; the application orchestrates through Effect; the infrastructure adapters implement the ports the domain declares.

These are the same commitment, worded four ways. DDD says: name the bounded contexts so the language is shared. Hexagonal architecture says: push the domain to the center so the adapters are replaceable. Clean architecture says: depend inward so the outer rings can change without disturbing the core. Functional programming says: make the domain pure so reasoning is compositional. Each vocabulary captures the same truth from its own angle. v2 commits to the truth, not to the angle.

The manifest is the visible artifact of this convergence. When a verb lands in `manifest.json`, it enters the ubiquitous language of the whole system. The agent can call it. The tests can exercise it. The team can reason about it without reading implementation. One entry in one file is DDD's vocabulary, hexagonal architecture's public port, clean architecture's use case boundary, and Effect's typed operation all at once. The economy is not coincidence; it is what happens when vocabularies align on the same underlying shape.

The facet catalog is the other visible artifact. It is DDD's aggregate root (the memory context's durable identity layer); it is hexagonal architecture's domain entity (sitting in the center, referenced by every adapter); it is clean architecture's domain model (innermost, owned by no outer layer). The operator edits it; the agent queries it; the runtime resolves against it. One catalog, many relationships, one identity discipline — stable `<screen>:<element>` IDs threaded with provenance from mint.

### 9.2 The laws — what the compiler enforces

v2's invariants are not runtime assertions. They are compile-time constraints where possible and test-enforced constraints where not. This is the difference between a well-intentioned codebase and a well-structured one: the structure does the reminding.

The envelope-axis phantom types (Stage × Source × Verdict × Fingerprint) are the primary law. Any artifact crossing a seam is tagged with its stage literal, its source slot, its governance verdict, and its fingerprint tag. A function that expects a `WorkflowEnvelope<'execution'>` will not accept a `WorkflowEnvelope<'proposal'>`; the compiler refuses. A `Fingerprint<'content'>` cannot be passed where a `Fingerprint<'knowledge'>` is expected. Misuse is a type error, not a runtime bug; the refactor that broke the invariant never compiles.

The fold family — `foldGovernance`, `foldEpistemicStatus`, `foldPhaseOutputSource` — enforces exhaustivity. This is the Gang-of-Four visitor pattern with the property the original lacked: forgetting to handle a new case is not optional. Add a state to the governance union and every call site that folds across it becomes a compile error until the new case is handled. The visitor becomes a type-system law.

Architecture law 8 forbids ad-hoc governance string comparisons in a test that runs alongside the build. Combined with the phantom brands (`Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`), the law makes policy dispatch compile-checkable. A line that reads a governance field as a string and branches on its value is rejected by the tests; a line that routes through `foldGovernance` is accepted. Policy cannot drift because policy cannot be written ad hoc.

Invariant 1 (stable verb signatures) is enforced by the manifest-generator build check: if the emitted manifest diverges from the committed one in a non-additive way, the build fails. Invariant 3 (append-only history) is enforced by write adapters that refuse in-place updates on log files. Invariant 10 (structured fallthrough) is enforced by the handoff-shape requirement on every agentic decision — the fold over decision states cannot be shortened by throwing instead of emitting.

The laws hold because the code cannot compile or pass tests if they are broken. Discipline is delegated to the compiler and the test suite. The team's attention is free for what only humans can decide.

### 9.3 Effect as the composition calculus

Effect is v2's composition calculus. The application layer is Effect programs all the way down. `Effect.gen` with `yield*` composes small programs into larger ones; `Effect.all` parallelizes independent branches (this is where §3's "parallel work streams within the step" become compile-time guarantees rather than scheduling wishes); `Effect.catchTag` discriminates errors by their typed tag without runtime `if (error instanceof ...)` gymnastics.

Every handshake in §7 of the feature ontology is a small Effect program. `intent-fetch` is a program that takes a work-item ID and yields a parsed work item. `facet-query` is a program that takes an intent phrase and yields ranked facets. `test-compose` is a program that takes intent plus facets and yields a test file. Authoring a test against a real work item is the composition of these programs; each `yield*` is a handoff across a bounded-context boundary; each composition is associative; each failure carries a typed tag the next combinator can route.

The measurement substrate is the same composition aimed at a different intent source. Testbed runs compose the same Effect programs the customer-backlog runs do. One code path, two audiences. No parallel runner — the runner is Effect itself, invoked against a different leaf in the intent-source dispatch.

The ports — hexagonal architecture's narrow seams — become Effect service tags. `AdoSource.Tag`, `PlaywrightAria.Tag`, `FacetStore.Tag`. The domain code requires the tag; the composition layer provides the implementation. Testing replaces the implementation without touching the domain. Clean architecture's dependency rule, hexagonal architecture's port/adapter split, and Effect's service pattern are three names for the same mechanism, and the mechanism holds because all three agree on what shape it has.

### 9.4 Motion — sagas, streams, and the flow of time

A handshake is the smallest saga. Authoring a test from one work item is a medium saga. The measurement loop — propose, land, evaluate, receipt, read, propose again — is the longest saga. Each is expressible as an Effect program; each program is a composition of smaller programs; the whole is a composition of Effect programs that interleave in deterministic ways.

Time in v2 flows through event streams. The evidence log is an event stream: every facet observation appends a record; confidence is a fold over the stream read on demand. The drift log is an event stream. The receipt log is an event stream. The run-record log is an event stream that feeds all three. Metrics are structured folds over streams; the metric catalog is a set of fold functions declared in the manifest.

Append-only is the temporal discipline. Nothing overwrites; nothing rewrites history. Confidence changes by appending new evidence. Drift fires by appending an event. Hypotheses resolve by appending verification receipts. The past is a record of what happened; the present is a derivation over the past; the future is a hypothesis appended to the present. This is event sourcing's structural commitment, and in v2 it arises because the constraints demand it — invariant 3 combined with derivable confidence combined with manifest-declared metric verbs yields event sourcing by accumulation, not by decree.

Sagas compose without orchestration. An authoring saga that hits a drift event flows naturally into a drift-emit saga; a drift-emit saga feeds the receipt log that a future self-refinement saga will read. The programs are small; the composition is deep; the system handles its own choreography because the primitives agree on their event shape. Orchestration frameworks exist to compensate for systems that disagree. v2 does not need them because v2 does not disagree.

### 9.5 The mirror — v2 measures itself with its own primitives

The measurement substrate is the cathedral catching its own reflection. The testbed is an intent-source variant; evaluation is authoring against the testbed; metrics are derivations over the run-record log declared as manifest verbs; hypotheses are proposals under the same proposal-gated reversibility memory uses. No new primitives. No parallel apparatus.

The aesthetic pays off here most visibly. A system that requires a separate scorecard with its own schema, its own storage, its own runner, its own review workflow has doubled its surface for no structural reason. A system whose measurement reuses every primitive it already has — and composes them behind a synthetic intent source — is structurally thinner and operationally more coherent. The measurement layer in v2 is a testament to the primitives above it: if measurement required new primitives, the primitives were wrong.

The loop closes. The agent reads the receipt log, proposes a code change with a predicted metric delta, the operator reviews the proposal, the code lands, the next evaluation produces run records, the metric verb computes the actual delta, the verification receipt appends, the agent reads the receipt log. `metric-hypothesis-confirmation-rate` is itself a manifest verb — the batting average is a derivation over the receipt log the agent can query at any time. The agent's feedback loop is a derivation over its own history. Trust, but verify, is not a slogan; it is an Effect program composed of manifest verbs operating on append-only logs gated by proposal-review.

### 9.6 The view from outside

Three views on v2, each simple in its own way because the substrate is consistent.

The customer's QA engineer sees Playwright test files that read like professionally-authored work. Named screen facades. Business-vocabulary step titles. Facets referenced by name, not by selector. Tests that run, pass, and are extensible by editing the intent or the memory layer. The QA engineer never sees the manifest, the facet catalog's YAML, or the receipt log; they see the tests and the HTML report, and the tests read well because the vocabulary comes from the catalog the agent populated with care.

The operator sees a catalog of facets with provenance, a queue of candidate proposals awaiting review, a log of receipts pairing hypotheses with outcomes, a view of metrics trending over testbed versions and code versions. Review surfaces are lightweight; decisions propagate through logs; nothing they approve can be silently undone. The operator's muscle memory works on CLI verbs that map to manifest entries; their authority is typed by the phantom brands that gate proposal-activation.

The agent sees a vocabulary manifest read once per session; typed verbs to call; structured decision handoffs when determinism exhausts; a receipt log to learn from. Fluency is the default, not an optimization. The agent spends its reasoning budget on genuine ambiguities, not on rediscovering contracts each session. The agent's session begins with a single `fs.readFile` and ends with a closeout receipt; everything in between is v2 serving the agent serving the customer.

Each view is simple because the substrate is consistent. The complexity lives in the *composition*, where it belongs. The parts are small, named, typed, and few; the composition is deep and does v2's work; and the composition is itself a structure the reader can reason about because each level of abstraction shares vocabulary with the levels above and below it.

### 9.7 Why this is a cathedral

A cathedral is structural commitment at every scale. The vault holds because every arch pushes against the next. The foundation holds because every stone is placed to distribute the load. Pull a stone and the cathedral does not collapse — but neither does it become simpler. Every part is where it is because the whole depends on it.

v2's architecture has this property. The five primitives hold because the envelope axes encode their invariants at compile time. The envelope axes hold because the folds demand exhaustivity. The folds hold because Effect programs carry their error types. Effect programs hold because the handshakes are small. The handshakes are small because the primitives are bounded. The bounded contexts hold because the manifest names them. The manifest holds because invariant 1 forbids silent mutation. Invariant 1 holds because the build check enforces it. The build check holds because architecture law 8 is runnable.

Pull any of these and another breaks. Effect without phantom types gives you composability without compile-time law. Phantom types without Effect give you law without orchestration. DDD without ports gives you contexts without extensibility. Ports without clean dependencies give you extensibility without discipline. Clean architecture without purity gives you discipline without reasoning. Purity without event sourcing gives you reasoning without history. Event sourcing without the manifest gives you history without vocabulary.

The cathedral holds because each stone carries weight the others need. Remove any pattern named in this section and another pattern named in this section becomes unable to discharge its role. The patterns are not stacked; they are interlocked.

What v2 ships, as product, is three surfaces: a manifest, a catalog, tests. What v2 is, as architecture, is a cathedral whose structure makes those three surfaces simple to write, simple to read, and simple to verify. The transmogrification plan is the act of raising that cathedral on the ground v1 prepared. When cut-over fires and the agent works inside it, every part is there for a reason and every reason serves the shipping claim. That is what the plan ships, and that is where it ends.

## 10. The highway map — how everything connects

§9 named the stones. This section draws the highways. Six major arteries move information through v2; they meet at five interchanges; the whole flows as one loop over append-only time. This is the map you put on the wall — the macro view that tells you where any piece of the system sits and how anything you do ripples through the rest.

### 10.1 The six highways

**Intent highway.** From an intent source to the agent's workbench. Sources are polymorphic — Azure DevOps work items, synthetic testbed work items, operator dialog turns, operator-shared documents. They all arrive at the agent through `intent-fetch` and `intent-parse`, shaped identically, tagged with `source`. The highway runs one-way: inbound.

**World highway.** Between the agent and the system under test. Runs both directions. Outbound are navigation, observation, and interaction requests mediated by Playwright; inbound are snapshots, state probes, and action outcomes. The only two-way highway in the map.

**Memory highway.** Between the agent and the facet catalog plus the evidence log. Outbound are queries (by intent phrase) and writes (mints, enrichments, health updates). Inbound are ranked facets, derived confidence, drift classifications. The highway carries no raw data — just facet identifiers, structured records, and derivations.

**Verb highway.** From the vocabulary manifest to every call site in the codebase. A single file, read once per session by the agent, declares every verb with a frozen signature. No code writes to this highway at runtime; it is published at build time and consumed at session start. It is the shortest and most-used highway in the system.

**Reasoning highway.** From every decision point in v2 to the LLM service that answers it. This is the agent's inner voice — the cognition behind every "agent chooses," every "agent interprets," every "agent synthesizes" referenced throughout the sagas. Like the Verb highway, it runs many-to-one: every saga that needs disambiguation, candidate extraction, step phrasing, drift classification (when rule-based classification is inconclusive), or hypothesis synthesis calls into this port; a single Reasoning adapter serves them all. The specific provider — direct Anthropic or OpenAI API, MCP-brokered, VSCode Copilot, or a local model — is a `Layer.succeed` choice at runtime composition (§11), not a saga concern. Every saga site that yields from `Reasoning.Tag` is abstraction-safe over the provider; swapping providers is a configuration change, not a saga rewrite.

**Truth highway.** The measurement loop. Run records feed metric derivations; metric derivations plus drift events plus evidence accumulation feed proposals; proposals feed operator review; approved changes land in code or memory; the next evaluation produces new run records; verification receipts append; the agent reads the receipt log to propose the next change. This highway is circular — it closes back on itself, and the cycle is how v2 learns.

### 10.2 The macro map

```
                        ┌──────────────────────────┐
                        │   VOCABULARY MANIFEST    │
                        │   (verbs + signatures    │
                        │    + error families)     │
                        └────────────┬─────────────┘
                                     │
                                     │ read once
                                     │ per session
                                     ▼
 ┌──────────────┐           ╔════════════════════╗           ┌──────────────┐
 │   INTENT     │           ║                    ║           │              │
 │   SOURCE     │──fetch───▶║       AGENT        ║◀─observe──│    WORLD     │
 │              │   parse   ║                    ║  interact │              │
 │  ADO       ──│           ║  (authoring,       ║           │  Playwright  │
 │  Testbed   ──│           ║   decision         ║           │  + SUT       │
 │  Dialog    ──│           ║   handoffs,        ║           │              │
 │  Document  ──│           ║   receipts)        ║           │              │
 └──────────────┘           ╚══╤══════════╤══════╝           └──────────────┘
                               │          │
                    decisions  │          │  query / mint / enrich
                               │          │
                         ▲     │          │
                         │choices         ▼
                         │rationale   ╔═══════════════════════════╗
                ┌────────┴─────────┐  ║         MEMORY            ║
                │   REASONING      │  ║                           ║
                │   (LLM service)  │  ║   facet catalog           ║
                │                  │  ║   evidence log            ║  ◀── append-only
                │  • Anthropic API │  ║   drift log               ║      (invariant 3)
                │  • OpenAI API    │  ║   proposal log            ║
                │  • MCP broker    │  ║   receipt log             ║
                │  • VSCode        │  ║   run-record log          ║
                │    Copilot       │  ╚═══════════╤═══════════════╝
                │  • Local model   │              │
                └──────────────────┘              │  metric verbs
                                                  │  (manifest-declared
                                                  │   derivations)
                                                  ▼
                                      ┌───────────────────────────┐
                                      │   EVALUATION OUTPUTS      │
                                      │                           │
                                      │   batch summary           │
                                      │   metric values           │
                                      │   batting average         │
                                      └───────────┬───────────────┘
                                                  │
                                        proposals │ (kind: revision |
                                                  │   hypothesis | candidate)
                                                  ▼
                                      ┌───────────────────────────┐
                                      │     OPERATOR REVIEW       │
                                      │                           │
                                      │     accept / reject       │
                                      │     (proposal-gated       │
                                      │      reversibility)       │
                                      └───────────┬───────────────┘
                                                  │
                                                  │ approved changes land:
                                                  │   • memory revisions → catalog/evidence
                                                  │   • code hypotheses  → next build
                                                  │   • candidate facets → catalog
                                                  │
                                                  └──▶ next authoring run generates new
                                                       run records; verification receipts
                                                       append; agent reads; loop closes
```

Legend:
- Double borders `╔═══╗` mark the three primitives that hold state (Agent, Memory).
- Single borders `┌───┐` mark stateless inputs and outputs.
- Arrows with labels are the highways named in §10.1.
- Every edge respects the ten invariants; every node honors its bounded-context discipline.

### 10.3 Substrate foundations — the bedrock beneath every highway

Before any highway can carry traffic, the substrate must hold. The modules below do not sit on one highway; they underpin all five. Every envelope crossing a seam carries `WorkflowMetadata`; every governance dispatch routes through `foldGovernance`; every content-addressed reference uses `Fingerprint<Tag>`; every agentic decision produces an `InterventionHandoff`. These are the load-bearing stones §9 named; §10 shows where they sit.

| Stone | Path | Role | Lights up |
|---|---|---|---|
| `WorkflowMetadata<S>` + `WorkflowEnvelope<T, S>` | `lib-v2/domain/governance/workflow-types.ts` | Base envelope parameterized by stage literal; carries ids, fingerprints, lineage, governance, payload | Phase 0 |
| `Fingerprint<Tag>` + `stableStringify` + `sha256` | `lib-v2/domain/kernel/hash.ts` | Content-addressed identity with phantom tag over a closed registry (30+ tags) | Phase 0 |
| `PhaseOutputSource` + `foldPhaseOutputSource` | `lib-v2/domain/pipeline/source.ts` | Provenance source discriminant with exhaustive fold (v2 subset excludes `reference-canon`) | Phase 0 |
| `EpistemicallyTyped<T, S>` + `foldEpistemicStatus` | `lib-v2/domain/handshake/epistemic-brand.ts` | Observational-confidence brand orthogonal to governance | Phase 0 |
| Governance phantom brands + `foldGovernance` | `lib-v2/domain/governance/workflow-types.ts` | `Approved<T>`, `ReviewRequired<T>`, `Blocked<T>`; exhaustive match forces unhandled state to compile error | Phase 0 |
| Architecture Law 8 | `lib-v2/tests/architecture/governance-verdict.laws.spec.ts` | Runnable assertion forbidding ad-hoc governance string comparisons in production code | Phase 0 |
| `InterventionHandoff` shape | `lib-v2/domain/handshake/intervention.ts` | Required shape of every structured decision handoff when determinism exhausts | Phase 1 |
| File-backed decision bridge | `lib-v2/infrastructure/handshake/file-decision-bridge.ts` | Atomic temp-rename cross-process transport for decision messages | Phase 1 |
| Manifest emitter | build step | Generates `manifest.json` from code; fails build on non-additive drift | Phase 1 |

The substrate is invisible on the macro map but present at every interchange. The highways rest on it; pull any stone and the relevant highway loses its discipline.

### 10.4 Highway town catalogs

Each highway from §10.1 runs through a sequence of towns — the specific modules and verbs that give it its traffic. These are the "parallel work streams" of §3 reorganized by highway rather than by phase. The same modules, viewed along their second axis.

For each highway: the arc it traces, the towns along it, the phase each town lights up, the shape as ASCII when that adds clarity.

#### 10.4.1 Verb highway towns

The shortest highway in the map. Manifest is published at build time, read once per session, consulted implicitly by every other highway at every interchange. Four towns — all at Phase 1 — plus the fluency checks that keep them honest.

| Town | Path | Role | Phase |
|---|---|---|---|
| Manifest Schema | `lib-v2/manifesting/manifest-schema.ts` | TypeScript types for verb entries: `{ name, category, inputs, outputs, errorFamilies, sinceVersion }` | 1 |
| Manifest Generator | build step in `lib-v2/manifesting/` | Scans verb-declaring code; emits `manifest.json` at build time | 1 |
| Sync Check | build step | Fails build if emitted manifest diverges from committed manifest in a non-additive way | 1 |
| Fluency Harness | `lib-v2/composition/fluency-harness.ts` | Canonical agent-task fixtures, one per declared verb, asserting correct dispatch | 1 |

```
   ┌────────────┐     ┌────────────┐     ┌────────────┐
   │ Schema     │───▶ │ Generator  │───▶ │ Sync Check │
   └────────────┘     └─────┬──────┘     └─────┬──────┘
                            │                  │
                            ▼                  ▼
                      manifest.json       build passes
                            │                  │
                            ▼                  │
                   ┌────────────────┐          │
                   │ Fluency Harness│◀─────────┘
                   └────────────────┘
                            │
                   asserts dispatch on
                  canonical agent tasks
```

Every verb-declaring town on every other highway (below) contributes entries to this manifest. The verb highway is not a *path* as much as a *channel*: one direction, one consumer (the agent, at session start), one refresh cadence (per build).

*Composition.* Verb definitions live as `Context.Tag` declarations at each bounded-context edge. At build time, the manifest generator walks every declared tag, extracts its `Schema`-typed inputs and outputs, and emits the manifest. At session start the agent reads the manifest once via `Effect.sync(() => fs.readFileSync('manifest.json'))` and parses it through `Schema.decode` into a typed verb table. The fluency harness composes canonical tasks as `Effect<Success, FluencyError, VerbTable>`; running them under the declared verb table either proves dispatch or fails the build. No runtime reflection; no per-call lookup cost beyond a typed table read.

#### 10.4.2 Intent highway towns

One-way inbound. Four source towns funnel into two handshake towns; a typed `ParsedIntent` artifact emerges at the agent's end.

**Source towns (polymorphic branches of `intent-fetch`):**

| Town | Path | Role | Phase |
|---|---|---|---|
| ADO Source | `lib-v2/infrastructure/intent/ado-source.ts` | Azure DevOps REST v7.1 + WIQL adapter; PAT auth; field extraction | 3 |
| Testbed Adapter | `lib-v2/measurement/testbed-adapter.ts` | Reads `testbed/v<N>/*.yaml` when `source: testbed:v<N>` | 5 |
| Dialog Capture | `lib-v2/instruments/operator/dialog-capture.ts` | Extracts candidate facets from chat transcripts (contributes to Memory highway too) | 7 |
| Document Ingest | `lib-v2/instruments/operator/document-ingest.ts` | Extracts candidate facets from operator-shared documents (Markdown → PDF later) | 7 |

**Handshake towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Intent Fetch | `lib-v2/application/intent/fetch.ts` | Polymorphic dispatch over `source` field; returns uniform work-item shape | 3 |
| Intent Parse | within ADO source at Phase 3; generalized later | XML step extraction, entity decoding, preconditions/actions/expected outcomes with source-text provenance | 3 |

```
   ADO Source   ─┐
   Testbed Adapter ─┤
   Dialog Capture   ─┼─▶ Intent Fetch ──▶ Intent Parse ──▶ ParsedIntent
   Document Ingest  ─┘                                       (to agent)
```

By Phase 7 the highway carries four source types through one handshake shape. Downstream of Intent Parse, no handshake can distinguish where the work item came from — every source is equivalent to the agent's workbench. This is the polymorphism that lets v2 measure itself with the same code it ships.

*Composition.* `IntentFetch` is a `Context.Tag` whose contract is `(sourceRef: SourceRef) => Effect<WorkItem, IntentError>`. The four source towns contribute implementations via `Layer.succeed(IntentFetch, adoImpl) | Layer.succeed(IntentFetch, testbedImpl) | ...` — polymorphism is typed and dispatch is by layer provision. Errors are tagged (`AdoTransientError`, `AdoAuthError`, `TestbedNotFoundError`, `DialogMalformedError`); `Effect.catchTag` routes them without `instanceof` gymnastics.

#### 10.4.3 World highway towns

Two-way. Outbound requests (navigation, element resolution, interaction); inbound observations (accessibility tree, state probes). The only highway where v2 reaches past its own borders.

**Outbound (request) towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Navigation Strategy | `lib-v2/instruments/navigation/strategy.ts` | `page.goto` with `waitUntil` per URL pattern; `page.url()` idempotence check; discrete `{ reachedUrl, status, timingMs }` envelope | 3 |
| Locator Ladder | `lib-v2/instruments/observation/locator-ladder.ts` | Ordered strategy ladder: role → label → placeholder → text → test-id → css; first match wins; rung recorded | 3 |
| Interact | `lib-v2/instruments/action/interact.ts` | Role-keyed action dispatch (`click`, `fill`, `selectOption`, `check`, `press`, `hover`); pre-action state validation; four-family error classification | 3 |

**Inbound (observation) towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| ARIA Snapshot | `lib-v2/instruments/observation/aria.ts` | `page.accessibility.snapshot({ root, interestingOnly: false })`; yields the canonical ARIA tree for facet minting | 3 |
| State Probes | `lib-v2/instruments/observation/state-probes.ts` | `isVisible`, `isEnabled`, `textContent`, `inputValue`, `getAttribute`, `count`; non-ARIA supplementary observation | 3 |

```
                           outbound ─▶ Navigation Strategy ──┐
                                    ─▶ Locator Ladder       ─┼─▶ (Playwright + SUT)
                                    ─▶ Interact              ─┘
                                                                     │
                           inbound  ◀─ ARIA Snapshot        ◀────────┤
                                    ◀─ State Probes         ◀────────┘
```

*Composition.* `Page` is an `Effect.Resource` (`Effect.acquireUseRelease`) acquired once per session. Every world operation is an effect requiring `Page` from context. Parallel probes compose via `Effect.all(probes, { concurrency: 4 })` — bounded because hammering the SUT with unbounded parallelism is itself a failure mode. Pre-action state probes run as `Effect.filterOrFail` guards *before* the action effect, so `NotVisibleError` or `NotEnabledError` fires before the action does, rather than as a post-attempt classification of Playwright's own timeout.

#### 10.4.4 Memory highway towns

Longest and densest highway. v2's compounding asset lives here, so the highway branches into four sub-carriageways: *storage* (where facets and evidence live), *derivation* (how confidence and health are read), *gates* (how proposals and drift surface), and *maintenance* (how memory tends itself).

**Storage towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Facet Schema | `lib-v2/memory/facet-schema.ts` | Unified facet record types with kind-specific extensions for element, state, vocabulary, route | 2 |
| Facet Store | `lib-v2/memory/facet-store.ts` | Per-screen YAML with atomic temp-rename writes; in-memory index on load, keyed by `<screen>:<element>` IDs | 2 |
| Evidence Log | `lib-v2/memory/evidence-log.ts` | Per-facet append-only JSONL; each entry `{ timestamp, runId, instrument, outcome, context }` | 6 |
| Candidate Review | `lib-v2/memory/candidate-review.ts` | Operator-facing queue for L2 candidate facets; accept/edit/reject with rationale preserved | 7 |

**Derivation towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Confidence | `lib-v2/memory/confidence.ts` | Pure function from evidence log → confidence scalar; cached summary invalidated on new evidence | 6 |
| Facet Query | `lib-v2/memory/query.ts` | Intent phrase → parsed constraints → ranked facets via structured-field matching; confidence is primary key, health is tiebreaker | 6 |
| Locator Health Track | `lib-v2/memory/health-track.ts` | Per-strategy `{ successCount, failureCount, lastSuccessAt, lastFailureAt }` co-located on the facet's `locatorStrategies` array | 6 |
| Facade Regenerator | `lib-v2/instruments/codegen/facade-regenerator.ts` | Derives per-screen facade TypeScript modules from the catalog on every authoring pass | 6 |

**Gate towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Drift Emit | `lib-v2/observation/drift-emit.ts` | Appends classified drift events to `drift-events.jsonl`; mismatch kinds `not-found | role-changed | name-changed | state-mismatch | ambiguous` | 8 |
| Confidence Gate | `lib-v2/instruments/codegen/confidence-gate.ts` | DOM-less authoring policy: skips live observation when memory confidence ≥ threshold for that surface | 8 |

**Maintenance towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Confidence Age | `lib-v2/memory/confidence-age.ts` | Idempotent maintenance pass applying decay to uncorroborated evidence logs | 9 |
| Corroborate | `lib-v2/memory/corroborate.ts` | Post-execution hook: passing test runs append positive evidence to every referenced facet | 9 |
| Revision Propose | `lib-v2/memory/revision-propose.ts` | Aggregates drift events + decay + corroboration into revision proposals for operator review | 9 |

```
                         ┌── Storage ──┐    ┌── Derivation ──┐
    agent ◀──query──▶   │  Facet      │──▶│ Confidence      │
                         │  Store      │    │ Facet Query     │
                         │  Evidence   │    │ Locator Health  │
                         │  Log        │    │ Facade Regen    │
                         └─────────────┘    └─────────────────┘
                                │                    │
                                ▼                    ▼
                         ┌── Maintenance ─┐    ┌── Gates ──────┐
                         │ Confidence Age │    │ Drift Emit    │──▶ drift-events.jsonl
                         │ Corroborate    │    │ Confidence    │──▶ DOM-less policy
                         │ Revision       │    │ Gate          │
                         │ Propose        │    └───────────────┘
                         └────────────────┘
```

*Composition.* `FacetStore`, `EvidenceLog`, `DriftLog` are `Context.Tag`s over file-system adapters. Writes go through `Effect.sync` wrapping the atomic temp-rename protocol; a crash mid-write leaves prior state intact. `facet-query` is `Effect.gen` yielding from `FacetStore.Tag`, parsing the intent phrase via `Schema.decode`, filtering the index, returning ranked facets — pure except for the initial read. Confidence derivation is a fold over the evidence log: `Stream.runFold(stream, zeroSummary, applyEvent)`, with summary cached behind a `Ref` and invalidated on new evidence. Maintenance passes (`Confidence Age`, `Corroborate`) are `Effect.schedule`d; they run on a cadence the application layer configures and append their outcomes back to the evidence log like any other event.

#### 10.4.5 Truth highway towns

Cyclical. Starts with the emitted test; flows through execution, run records, metrics, proposals, review, approved changes; closes back onto the agent as verification receipts.

**Run and record towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Test Compose | `lib-v2/instruments/codegen/spec-codegen.ts` | AST-backed emission via ts-morph; facet-keyed facades; no inline selectors or data | 3 |
| Test Execute | `lib-v2/application/execute/` | Playwright Test runner invocation via CLI with `--reporter=json`; structured run record return | 3 |
| Run Record Log | `catalog/runs/*.jsonl` | Append-only log of every test execution with step-level evidence | 3 |

**Metric towns** (all declared in `lib-v2/measurement/metrics.ts`; each is a manifest-declared pure derivation):

| Metric verb | Measures | Phase |
|---|---|---|
| `metric-test-acceptance-rate` | Proportion of testbed runs passing + QA-accepted real runs | 5 |
| `metric-authoring-time-p50` | Median authoring duration per work item | 5 |
| `metric-memory-hit-rate` | Proportion of steps resolved from memory vs. live observation | 6 |
| `metric-memory-corroboration-rate` | Proportion of referenced facets gaining positive evidence | 6 |
| `metric-operator-wording-survival-rate` | Fraction of operator wording preserved into generated tests | 7 |
| `metric-vocabulary-alignment-score` | Test-step language aligned with operator vocabulary | 7 |
| `metric-drift-event-rate` | Drift events per N memory-authored tests | 8 |
| `metric-dom-less-authoring-share` | Fraction of steps authored without live observation | 8 |
| `metric-convergence-delta-p50` | Statistical convergence across testbed-version increments (the v1 convergence-proof harness re-expressed as a metric derivation) | 8 |
| `metric-hypothesis-confirmation-rate` | The batting average — proportion of hypothesis receipts with `confirmed: true` | 9 |

**Proposal and review towns:**

| Town | Path | Role | Phase |
|---|---|---|---|
| Proposal Log | `lib-v2/memory/proposal-lifecycle.ts` | Append-only log keyed by `kind`: `revision | hypothesis | candidate` | 5 |
| Operator Review | external process + CLI | `accept | edit | reject`; rejections preserved with rationale | 5 |
| Receipt Log | `lib-v2/measurement/receipt-log.ts` | Append-only verification receipts: `{ hypothesisId, predictedDelta, actualDelta, confirmed, computedAt }` | 5 |

```
    Test Compose ─▶ Test Execute ─▶ Run Record Log
                                          │
                                          ▼
                              ┌── metric verbs ──┐
                              │  (manifest-      │
                              │   declared       │
                              │   derivations)   │
                              └────────┬─────────┘
                                       │
                                       ▼
                              Proposal Log
                           (revision | hypothesis |
                            candidate)
                                       │
                                       ▼
                              Operator Review
                                       │
                         ┌─────────────┴──────────────┐
                         ▼                            ▼
                   catalog change                code change
                   (revisions/candidates)   (hypotheses → next build)
                         │                            │
                         └──────────────┬─────────────┘
                                        ▼
                              next evaluation run
                                        │
                                        ▼
                                 Receipt Log
                                        │
                                        └──▶ agent reads,
                                              proposes next
```

*Composition.* The truth highway is the longest saga. One evaluation run is `Effect.gen` composing testbed fetch → authoring → execution → run-record append → metric computation in sequence; independent metric derivations are parallelized via `Effect.all`. The proposal lifecycle is a state machine expressed as `Stream` transforms — `pending → approved → landed → verified` or `pending → rejected`. Operator review is a suspended `Fiber` that resumes on the decision bridge's atomic-rename signal. The closure — agent reads receipt, proposes next — is a long-running `Fiber.daemon` scoped to the session's lifecycle.

#### 10.4.6 Reasoning highway towns

The agent's inner voice. Every saga contains decision points — interpret this ambiguous step, extract candidates from this transcript, phrase this step title in QA vocabulary, classify this drift event, synthesize this revision proposal. In every case, the agent is calling an LLM. The Reasoning highway is where those calls happen, abstracted behind a single port so the provider can change without touching the sagas.

**Service tag (the port):**

| Town | Path | Role | Phase |
|---|---|---|---|
| `Reasoning` tag | `lib-v2/domain/reasoning/reasoning.ts` | `Context.Tag` declaring the cognition operations: `interpret`, `extract`, `phrase`, `classify`, `synthesize` — each a typed `Effect` with a named input shape, a named output shape, and a typed error channel | 1 |

**Provider adapters (Layer implementations — the agent's inner voice, made by different vocal cords):**

| Town | Path | Role | Phase |
|---|---|---|---|
| Anthropic Adapter | `lib-v2/infrastructure/reasoning/anthropic-live.ts` | Direct Anthropic API calls; structured output via tool-use / JSON schema | 1 |
| OpenAI Adapter | `lib-v2/infrastructure/reasoning/openai-live.ts` | Direct OpenAI API calls; structured output via function calling | 1 |
| MCP Adapter | `lib-v2/infrastructure/reasoning/mcp-live.ts` | Brokered via Model Context Protocol; v2 acts as MCP client; LLM runs in a separate process | 1 |
| Copilot Adapter | `lib-v2/infrastructure/reasoning/copilot-live.ts` | VSCode Copilot integration via editor extension protocol | later |
| Local Adapter | `lib-v2/infrastructure/reasoning/local-live.ts` | Local model via Ollama, llama.cpp, or similar | later |
| Test Adapter | `lib-v2/testing/reasoning/test-live.ts` | Deterministic responses for integration tests; replays fixtures | 1 |

**Operation towns (what the Reasoning port actually does):**

| Operation | Called from (saga or sub-saga) | Input → Output |
|---|---|---|
| `Reasoning.interpret` | intent-parse (Stage α disambiguation) | raw step text → structured `{ action, expected, preconditions }` with provenance back-link |
| `Reasoning.extractFromDialog` | `absorbOperatorInput` — dialog path | operator transcript → `CandidateFacet[]` with verbatim wording preserved |
| `Reasoning.extractFromDocument` | `absorbOperatorInput` — document path | operator document + anchor hints → `CandidateFacet[]` with region anchors |
| `Reasoning.phraseStep` | test-compose | `{ intent, facet }` → business-vocabulary step title |
| `Reasoning.classifyDrift` | `respondToDrift` — ambiguous branch | mismatch evidence → classification kind + confidence |
| `Reasoning.synthesizeRevision` | `proposeRefinements` | `{ driftEvents, decayedFacets, corroborated }` → candidate revision list |
| `Reasoning.proposeHypothesis` | agent self-directed (post-evaluation) | `{ receiptLogSummary, evaluationDelta }` → hypothesis with predicted delta |
| `Reasoning.resolveHandoff` | any saga that surfaces an `InterventionHandoff` | handoff shape → chosen option + rationale |

```
        ┌──────────────────────────────┐
        │  every saga decision point   │
        │  (interpret, extract,        │
        │   phrase, classify,          │
        │   synthesize, propose,       │
        │   resolve handoff)           │
        └────────────┬─────────────────┘
                     │ typed request
                     ▼
        ┌──────────────────────────────┐
        │       Reasoning.Tag          │
        │       (the port)             │
        └────────────┬─────────────────┘
                     │
                     │  provider chosen by Layer
                     │  at runtime composition (§11)
                     │
          ┌──────────┼──────────┬──────────┬──────────┐
          ▼          ▼          ▼          ▼          ▼
      Anthropic   OpenAI       MCP      Copilot     Local
        Live       Live        Live      Live       Live
```

*Composition.* `Reasoning` is a `Context.Tag` whose methods return `Effect<Output, ReasoningError, Reasoning>`. Each method is typed at the domain edge — the saga cannot see *how* the LLM is reached, only what shape it expects back. Provider selection happens once at `AppLayer` composition time (§11.1): `Layer.succeed(Reasoning, AnthropicLive)` or `Layer.succeed(Reasoning, McpLive)` or the test adapter for integration testing. Structured output is enforced by `Schema.decode` on the adapter side — the LLM's JSON response becomes a typed domain value before it reaches the saga, or the operation fails with `ReasoningShapeError`. Retries for transient provider failures compose via `Effect.retry(Schedule.exponential("200 millis") /* ... */)` inside the adapter, invisible to sagas.

*Why Reasoning is a highway, not just a service.* It's many-to-one like Verb — every decision site consults it. It has named *operations*, not just opaque invocations — each operation has a named input, output, and error shape, making reasoning calls first-class in the type system. It has *multiple adapter implementations* that are swappable per invocation via Layer composition — which is precisely what hexagonal architecture demands for external services that may be exchanged. And sagas cross it explicitly via `yield* Reasoning.classifyDrift(...)` or similar; the yield is visible in the code as a handoff to the agent's inner voice. If it weren't a highway, the LLM would be invisible in the architecture — and in v2 the LLM is how the agent thinks.

*One provider-agnostic property worth calling out.* The Reasoning highway is where MCP integration lives as an adapter. When v2 is invoked with the MCP adapter provisioned, the LLM runs in another process (Claude Desktop, or an IDE plugin, or a remote service); v2 exposes its own verbs as MCP tools the LLM can call back into, *in addition* to v2 calling the LLM via `Reasoning.*`. The two directions of MCP — v2 as MCP client (calling the LLM) and v2 as MCP server (exposing tools to the LLM) — coexist inside the MCP adapter. The rest of v2 doesn't know which direction is active; it just yields from `Reasoning.Tag` and gets typed responses.

### 10.5 Composition and braiding — how Effect holds the highways together

The highways are data routes. Effect is the composition calculus that moves data along them. The parallel work streams named throughout §3 become *compile-time guarantees* rather than scheduling wishes because `Effect.all` types them, `yield*` sequences them, `Context.Tag`s port them, `catchTag` discriminates their failures, and `Stream` threads their events through time. This section names the arterial patterns — the ones v2 uses at every handshake and relies on at every interchange — and then shows one end-to-end saga braided through all five highways.

**Pattern 1 — Ports as service tags.** Every bounded context exposes its operations as `Context.Tag`s. `IntentFetch.Tag`, `PlaywrightPage.Tag`, `FacetStore.Tag`, `EvidenceLog.Tag`, `ManifestRegistry.Tag`, `ReceiptLog.Tag`. Domain code *requires* the tag; the composition layer *provides* the implementation via `Layer.succeed(Tag, impl)` or `Layer.effect(Tag, constructor)`. Hexagonal architecture's port/adapter mechanic is Effect's service-layer mechanic; one pattern, two vocabularies.

```ts
// Declaration at the domain edge
class IntentFetch extends Context.Tag("IntentFetch")<
  IntentFetch,
  { fetch: (ref: SourceRef) => Effect.Effect<WorkItem, IntentError> }
>() {}

// Provision at the composition edge
const AdoLive = Layer.succeed(IntentFetch, { fetch: adoImpl });
const TestbedLive = Layer.succeed(IntentFetch, { fetch: testbedImpl });

// Consumption anywhere in the domain
const work = Effect.gen(function* () {
  const fetcher = yield* IntentFetch;
  return yield* fetcher.fetch(someRef);
});
```

**Pattern 2 — Handshakes as small `Effect.gen` programs.** Every handshake in §7 of the feature ontology is a short generator: yield from the ports it needs, compose the operations, return the result. Three or four `yield*`s per handshake is typical.

```ts
const intentFetchHandshake = Effect.gen(function* () {
  const source = yield* IntentFetch;
  const raw = yield* source.fetch(sourceRef);
  const parsed = yield* source.parse(raw);
  return parsed;
});
```

The `yield*` at each boundary is a typed handoff; each return value's shape is inferred; every error the handshake can surface is part of the inferred error channel. No runtime dispatch; no cast-and-pray.

**Pattern 3 — Parallel work streams as `Effect.all`.** When §3 names "parallel work streams within the step," the compile-time shape is `Effect.all`. Independent effects run concurrently; their results collect into a tuple the next step consumes.

```ts
// Within Phase 3: the six L0 instruments integrate in parallel
const [adoReady, ariaReady, ladderReady, interactReady, navReady, composeReady] =
  yield* Effect.all([
    portAdoSource,
    portAriaSnapshot,
    portLocatorLadder,
    portInteract,
    portNavigation,
    portTestCompose,
  ], { concurrency: "unbounded" });

// Within whole-screen observation: bounded-concurrency element probes
const states = yield* Effect.all(
  elements.map((el) => probeElement(el)),
  { concurrency: 4 }
);
```

Parallelism is declared, typed, and bounded. The scheduler handles the actual interleaving; the code reads sequentially.

**Pattern 4 — Typed error channels as `catchTag` / `catchTags`.** Every handshake carries an inferred error channel listing the tagged errors it can surface. Recovery routing is `Effect.catchTag('X', handlerX)` or `Effect.catchTags({ X: handlerX, Y: handlerY })`. No `instanceof`; no untyped `catch` blocks; the compiler knows every branch.

```ts
const withRecovery = intentFetchHandshake.pipe(
  Effect.catchTag("AdoTransientError", () => retryWithBackoff),
  Effect.catchTag("AdoAuthError", () => escalateToOperator),
  Effect.catchTag("AdoNotFoundError", () => logAndReturnNull),
);
```

If a new error tag is added to the handshake's channel, every composition that doesn't route it remains a compile-checkable residual in the outer effect's error channel. The compiler refuses to pretend every error is handled unless it actually is.

**Pattern 5 — Event streams as `Stream`.** The evidence log, drift log, receipt log, run-record log all expose `Stream` interfaces. Metric verbs are folds: `Stream.runFold(stream, initial, combine)`. Subscribers consume events without polling.

```ts
const corroborationRate: Effect.Effect<number, never, EvidenceLog> =
  Effect.gen(function* () {
    const log = yield* EvidenceLog;
    return yield* Stream.runFold(
      log.since(windowStart),
      { positives: 0, total: 0 },
      (acc, evt) => ({
        positives: acc.positives + (evt.outcome === "pass" ? 1 : 0),
        total: acc.total + 1,
      })
    ).pipe(Effect.map(({ positives, total }) => total === 0 ? 0 : positives / total));
  });
```

A metric verb is just a fold over a stream plus a signature declaration in the manifest. Adding a metric is adding a verb.

**Pattern 6 — Long-running sagas as `Fiber`.** The measurement loop runs as a `Fiber.daemon` for the lifetime of the session. Operator review is a suspended fiber that resumes when the decision bridge's atomic rename delivers the decision. Session lifecycle scopes the fiber tree; shutdown collects children deterministically.

**Pattern 7 — Retry and schedule for temporal discipline.** Transient failures retry on a declared schedule; maintenance passes run on a declared cadence. Both use `Effect.retry` / `Effect.retryOrElse` / `Effect.schedule` with composable schedules — `Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))` for a bounded exponential backoff, `Schedule.fixed("1 hour")` for a maintenance pass.

**The braided shape — one saga through all five highways.**

Here is an authoring saga expressed as one Effect program, with each `yield*` annotated by the highway it crosses. Read top-to-bottom; every line is a handoff; every error has a typed path.

```ts
const authorTest = (sourceRef: SourceRef, hypothesis?: Hypothesis) =>
  Effect.gen(function* () {
    // ─── Verb highway: fluency was established at session start ───
    // (implicit: the agent already read the manifest; every subsequent
    //  yield* lands on a declared verb with a frozen signature)

    // ─── Intent highway ─────────────────────────────────────────
    const intent = yield* IntentFetch.fetch(sourceRef);
    const parsed = yield* IntentParse.apply(intent);

    // ─── For each step, walk Memory highway first; fall through ──
    // ─── to World highway only when memory is insufficient ───────
    const stepResults = yield* Effect.all(
      parsed.steps.map((step) =>
        Effect.gen(function* () {
          // Memory highway: query
          const candidates = yield* FacetQuery.resolve(step.intentPhrase);

          // Branch on confidence — memory wins or world fills in
          const facet =
            candidates.top && candidates.top.confidence >= step.threshold
              ? candidates.top
              : yield* ObserveAndMint.forStep(step); // World + Memory mint

          return { step, facet };
        })
      ),
      { concurrency: 1 } // per-step sequencing within the work item
    );

    // ─── Reasoning highway: phrase step titles in QA vocabulary ──
    // Test compose delegates business-vocabulary phrasing to the LLM;
    // raw intent text goes in, QA-legible step titles come out. This
    // is the difference between a test a human reads as "professional"
    // and a test that reads as "generated."
    const phrasedSteps = yield* Effect.all(
      stepResults.map(({ step, facet }) =>
        Effect.gen(function* () {
          const title = yield* Reasoning.phraseStep({ intent: step, facet });
          return { step, facet, title };
        })
      ),
      { concurrency: 4 }  // bounded LLM fan-out
    );

    // ─── Truth highway: compose and execute ──────────────────────
    const testFile = yield* TestCompose.emit(parsed, phrasedSteps);
    const runRecord = yield* TestExecute.run(testFile);

    // ─── Memory highway: corroborate or drift-emit ───────────────
    yield* Effect.all(
      stepResults.map(({ facet }) =>
        runRecord.pass
          ? Corroborate.append(facet, runRecord)
          : DriftEmit.classify(facet, runRecord)
      ),
      { concurrency: "unbounded" }
    );

    // ─── Truth highway: verify hypothesis if one was attached ───
    if (hypothesis) {
      const actualDelta = yield* MetricCompute.delta(hypothesis.metric);
      yield* ReceiptLog.append({
        hypothesisId: hypothesis.id,
        predictedDelta: hypothesis.predictedDelta,
        actualDelta,
        confirmed: directionMatches(hypothesis.predictedDelta, actualDelta),
      });
    }

    return runRecord;
  }).pipe(
    // ─── Typed recovery at the saga boundary ────────────────────
    Effect.catchTag("NavigationTimeoutError",      () => escalateToOperator),
    Effect.catchTag("LocatorLadderExhaustedError", () => handoffToAgent),
    Effect.catchTag("AdoTransientError",           () => retryWithBackoff),
    Effect.catchTag("FacetStoreCorruptError",      () => failFast),
    Effect.catchTag("ReasoningShapeError",         () => surfaceShapeErrorToOperator),
    Effect.catchTag("ReasoningProviderError",      () => retryOrFailover),
    // any other error surfaces unhandled; the compiler's error-channel
    // residual lists what remains unrouted
    Effect.withSpan("authorTest", { attributes: { sourceRef: sourceRef.toString() } })
  );
```

Count the braiding. The saga touches every highway: Verb (implicit at session start), Intent (fetch + parse), Memory (query), World (observe + mint when memory misses), Memory again (corroborate or drift-emit), Truth (compose + execute + receipt). Eleven `yield*`s; two `Effect.all`s for parallelism; four `catchTag`s for typed recovery; one `withSpan` for observability. The saga is small because each verb is a port, each port is typed, each composition is associative, each error is discriminated. The braiding is *readable* because the sequence of `yield*`s literally walks the highway map.

**The saga gallery — every other braided path v2 runs.**

The authoring saga is the flagship. v2 runs a small closed set of other sagas, each a distinct braided path through the highways. Some fire per-session; some per-work-item as sub-sagas of `authorTest`; some on a schedule; some in response to events; some at operator-review time. The gallery below is closed — any work v2 does falls into one of these sagas plus the flagship above. Each is named, its trigger is stated, its highways are annotated, its Effect shape is shown, its error channel is closed.

**Saga 1 — `onboardSession`.** Fires once at session start. Reads the manifest; validates fluency; opens the session receipt. Short saga, Verb highway primary.

```ts
const onboardSession = (sessionId: SessionId) =>
  Effect.gen(function* () {
    // ─── Verb highway: read manifest (single fs read, per §8.5 invariant 10) ─
    const raw = yield* Effect.sync(() => fs.readFileSync("manifest.json", "utf8"));
    const manifest = yield* Schema.decode(VerbManifestSchema)(raw);

    // ─── Verb highway: bind verb table to session scope ──────────
    const verbTable = yield* VerbTable.fromManifest(manifest);

    // ─── Fluency self-check: compose canonical tasks; all must pass ─
    const report = yield* FluencyHarness.run({ verbTable });
    if (report.failures.length > 0) {
      return yield* Effect.fail(new FluencyRegressionError({ report }));
    }

    // ─── Open the session receipt; its lifetime scopes the fiber tree ─
    return yield* SessionReceipt.open({ sessionId, verbTable, startedAt: yield* Clock.now });
  }).pipe(
    Effect.catchTag("ManifestMissingError",     () => failBuild),
    Effect.catchTag("ManifestSchemaError",      () => failBuild),
    Effect.catchTag("FluencyRegressionError",   () => failSession),
    Effect.withSpan("onboardSession")
  );
```

The saga is deliberately tight: four `yield*`s, three `catchTag`s, one invariant enforced (the single-file-read of §8.5 invariant 10). Every other saga in v2 assumes this has completed successfully — no other saga re-reads the manifest during a session.

**Saga 2 — `growMemoryForStep`.** Sub-saga composed inside `authorTest` whenever a step's facet-query returns nothing above threshold. Named separately because the feature ontology's §8.1 lists "grow memory during authoring" as a canonical flow. World highway outbound; Memory highway mint.

```ts
const growMemoryForStep = (step: ParsedStep) =>
  Effect.gen(function* () {
    // ─── World highway: resolve target via locator ladder ────────
    const target = yield* LocatorLadder.resolve(step.targetRef);

    // ─── World highway: observe ARIA + state probes in parallel ──
    const snapshot = yield* Effect.all({
      aria:  AriaSnapshot.capture({ root: target.handle, interestingOnly: false }),
      state: StateProbes.readAll(target),
    });

    // ─── Memory highway: mint with provenance (invariant 2) ──────
    const facet = yield* FacetMint.create({
      observation: snapshot,
      intentPhrase: step.intentPhrase,
      provenance: {
        mintedAt:       yield* Clock.now,
        instrument:     "playwright",
        agentSessionId: yield* Session.currentId,
        runId:          yield* Session.currentRunId,
      },
    });

    // ─── Memory highway: initialize per-strategy locator health ──
    yield* LocatorHealthTrack.initialize({
      facetId:    facet.id,
      strategies: target.strategies,
      rung:       target.rung,
    });

    return facet;
  }).pipe(
    Effect.catchTag("LocatorLadderExhaustedError", () => handoffToAgent),
    Effect.catchTag("AriaSnapshotFailedError",     () => retryWithSingleFallback),
    Effect.withSpan("growMemoryForStep", { attributes: { intentPhrase: step.intentPhrase } })
  );
```

Note the mint provenance block is assembled inline — there is no retroactive mint path anywhere in v2. The saga's shape enforces invariant 2 by construction: a facet cannot be created without its four provenance fields present.

**Saga 3 — `absorbOperatorInput`.** Fires when the operator provides a dialog transcript or a document. Intent highway (extraction) + Memory highway (candidate queue). Runs standalone per operator action, not per work item.

```ts
const absorbOperatorInput = (input: OperatorInput) =>
  Effect.gen(function* () {
    // ─── Reasoning highway: LLM-powered extraction by input kind ─
    // The Reasoning.Tag adapter (provider chosen at §11) handles the
    // actual LLM call; the saga sees a typed CandidateFacet[] return.
    const candidates = yield* Match.value(input.kind).pipe(
      Match.when("dialog",   () => Reasoning.extractFromDialog(input)),
      Match.when("document", () => Reasoning.extractFromDocument(input)),
      Match.exhaustive,
    );

    // ─── Memory highway: enqueue each candidate with full provenance ─
    yield* Effect.all(
      candidates.map((candidate) =>
        CandidateReview.enqueue({
          candidate,
          provenance: {
            operatorId:       input.operatorId,
            sourceType:       input.kind,
            sourceText:       candidate.sourceText,      // preserved verbatim per invariant 8
            anchorRef:        candidate.anchorRef,        // doc-region pointer, if applicable
            reasoningProvider: yield* Reasoning.providerId,  // audit trail: which adapter spoke
            capturedAt:       yield* Clock.now,
          },
        })
      ),
      { concurrency: "unbounded" }
    );

    return { queued: candidates.length };
  }).pipe(
    Effect.catchTag("DialogMalformedError",     () => logAndSkip),
    Effect.catchTag("DocumentUnreadableError",  () => surfaceErrorToOperator),
    Effect.catchTag("ReasoningShapeError",      () => surfaceShapeErrorToOperator),
    Effect.catchTag("ReasoningProviderError",   () => retryOrFailover),
    Effect.withSpan("absorbOperatorInput", { attributes: { kind: input.kind } })
  );
```

Candidates are proposal-gated, not memory-written. The saga enqueues; the operator review saga (§10.5 Saga 6) disposes. Invariant 8 (source vocabulary preserved) binds at the extraction boundary: `candidate.sourceText` is verbatim operator wording — the LLM parsed but did not paraphrase. The `reasoningProvider` field on provenance is the audit trail: every candidate carries which adapter (Anthropic, OpenAI, MCP, local) produced it, so a provider change is observable in the catalog's history.

**Saga 4 — `respondToDrift`.** Fires when a memory-authored step fails at runtime in a mismatch pattern. Memory highway (classify + log) + Truth highway (may surface to handoff). Composed inside `authorTest`'s post-execution branch when `runRecord.pass === false` and the failure looks like drift rather than product failure.

```ts
const respondToDrift = (runRecord: RunRecord, failedStep: StepResult) =>
  Effect.gen(function* () {
    // ─── Memory highway: try deterministic classification first ──
    // Rule-based path: known mismatch shapes (not-found, role-changed,
    // name-changed, state-mismatch) resolve without a reasoning call.
    const ruleBased = yield* DriftEmit.classifyByRules({
      facetId:       failedStep.facetId,
      observedState: failedStep.observedState,
      expectedState: failedStep.expectedState,
    });

    // ─── Reasoning highway: LLM classification only when rules exhaust ─
    // If rules are inconclusive, the Reasoning adapter resolves; the
    // response is Schema-decoded into a typed classification before
    // returning. The agent's inner voice is invoked here and only here.
    const classification = ruleBased.kind !== "ambiguous"
      ? ruleBased
      : yield* Reasoning.classifyDrift({
          facetId:       failedStep.facetId,
          observedState: failedStep.observedState,
          expectedState: failedStep.expectedState,
          ruleHint:      ruleBased,  // gives the LLM what rules saw
        });

    // ─── Memory highway: append drift event (append-only, invariant 3) ─
    const driftEvent = yield* DriftLog.append({
      runId:             runRecord.runId,
      facetId:           failedStep.facetId,
      strategyKind:      failedStep.strategyKind,
      mismatchKind:      classification.kind,
      evidence:          classification.evidence,
      classifiedBy:      classification.source,  // "rule" | "reasoning:<provider>"
      observedAt:        yield* Clock.now,
    });

    // ─── Memory highway: reduce confidence via negative evidence ──
    yield* EvidenceLog.appendNegative({
      facetId: failedStep.facetId,
      runId:   runRecord.runId,
      reason:  classification.kind,
    });

    // ─── If the LLM itself returned ambiguous, hand off to operator ─
    if (classification.kind === "ambiguous") {
      const handoff = yield* InterventionHandoff.prepare({
        blockageType:        "drift-ambiguous",
        attemptedStrategies: [failedStep.strategyKind],
        evidenceSlice:       classification.evidence,
        competingCandidates: classification.candidates,
        reversalPolicy:      "rereview-on-next-evaluation",
      });
      return yield* Effect.fail(new AgenticDecisionRequired({ handoff }));
    }

    return driftEvent;
  }).pipe(
    Effect.catchTag("AgenticDecisionRequired", (err) => surfaceHandoffToAgent(err.handoff)),
    Effect.catchTag("ReasoningShapeError",     () => fallBackToAmbiguousAndSurface),
    Effect.catchTag("ReasoningProviderError",  () => fallBackToAmbiguousAndSurface),
    Effect.withSpan("respondToDrift")
  );
```

The saga never silently patches memory. Invariant 6 (no silent escalation) is visible here: every state change — the drift event, the negative evidence, the ambiguous handoff — is an append to a log the agent and operator can read. Confidence falls by rule, not by mutation.

The Reasoning call is *gated by rules*. Rule-based classification runs first; only when rules return `ambiguous` does the saga spend an LLM call. This keeps cognition budget on the decisions that actually need it and makes the rule-based path the deterministic fallback when the Reasoning adapter is absent or misconfigured. The `classifiedBy` field on the drift event records which path produced the classification, so the receipt log later distinguishes rule-resolved drift from reasoning-resolved drift — useful telemetry for evaluating whether rules are keeping up with reality.

**Saga 5 — `proposeRefinements`.** The L4 saga. Runs on a periodic schedule; aggregates accumulated signals (drift events, decayed facets, corroboration) into revision proposals for operator review. Memory highway (read signals) + Truth highway (append proposals). Not tied to any single work item.

```ts
const proposeRefinements = (window: TimeWindow) =>
  Effect.gen(function* () {
    // ─── Memory highway: gather the three signal streams in parallel ─
    const signals = yield* Effect.all({
      driftEvents:   DriftLog.since(window.start),
      decayedFacets: ConfidenceAge.decayedSince(window.start),
      corroborated:  CorroborationLog.since(window.start),
    });

    // ─── Load prior rejections so the LLM can see what's already been tried ─
    const priorRejections = yield* ProposalLog.rejectionsInRecentHistory({ windowDays: 30 });

    // ─── Reasoning highway: LLM-powered synthesis with context ────
    // The synthesis is the saga's core work: given signals and rejection
    // history, draft revision proposals that a human would recognize as
    // reasonable. This is exactly where an LLM earns its keep — taking
    // structured evidence and producing rationale-carrying proposals.
    const revisions = yield* Reasoning.synthesizeRevision({
      signals,
      priorRejections,
      constraints: {
        maxProposalsPerRun: 10,
        minEvidenceCitations: 1,
        mustCiteEvidenceByFacetId: true,
      },
    });

    // ─── Truth highway: append each proposal with its cited evidence ─
    yield* Effect.all(
      revisions.map((revision) =>
        ProposalLog.append({
          kind:              "revision",
          facetId:           revision.facetId,
          proposedChange:    revision.proposedChange,
          citedEvidence:     revision.citedEvidence,   // enforced by Reasoning Schema
          rationale:         revision.rationale,      // LLM-authored; verbatim
          reasoningProvider: yield* Reasoning.providerId,
          conditionedOn:     priorRejections.relevantTo(revision.facetId),
        })
      ),
      { concurrency: "unbounded" }
    );

    return { proposed: revisions.length };
  }).pipe(
    Effect.catchTag("SignalStreamGapError",   (err) => logAndContinueWithPartial(err)),
    Effect.catchTag("ReasoningShapeError",    () => surfaceShapeErrorToOperator),
    Effect.catchTag("ReasoningProviderError", () => retryOrFailover),
    Effect.withSpan("proposeRefinements", { attributes: { window: String(window) } })
  );
```

The saga is what the feature ontology calls "self-refinement" operationalized. Signal gathering is deterministic reads over streams. The synthesis itself is a Reasoning call — the LLM takes structured evidence plus rejection history and drafts revisions with rationale. Proposals are append-only with the provider recorded, so an audit later can ask "which provider authored this proposal?" and the receipt log answers.

Notice what the saga does *not* do: there is no autonomous memory change. Every proposal sits in the proposal log awaiting operator review (`applyApprovedProposal`, Saga 6). The LLM proposes; the operator disposes. This is invariant 7 (reversible agentic writes) enforced by saga shape — `proposeRefinements` writes nothing that isn't proposal-gated, regardless of how confident the LLM is in its own synthesis.

**Saga 6 — `applyApprovedProposal`.** Fires when an operator review closes a proposal with `approved`. Short saga that routes by proposal kind to the right adapter. Closes the review loop; the next evaluation or authoring run picks up the effect of the approval.

```ts
const applyApprovedProposal = (approval: ApprovedProposal) =>
  Effect.gen(function* () {
    // ─── Memory or Truth highway, depending on proposal kind ──
    yield* Match.value(approval.kind).pipe(
      Match.tag("revision",   ({ facetId, proposedChange }) =>
        FacetStore.applyRevision(facetId, proposedChange)),
      Match.tag("candidate",  ({ candidate }) =>
        FacetStore.addFromCandidate(candidate)),
      Match.tag("hypothesis", ({ hypothesisId }) =>
        HypothesisRegistry.markLanded(hypothesisId)),  // code change lands externally
      Match.exhaustive,
    );

    // ─── Proposal log: mark applied (append-only state transition) ─
    yield* ProposalLog.markApplied(approval.id, { appliedAt: yield* Clock.now });

    return approval.id;
  }).pipe(
    Effect.catchTag("RevisionConflictError",   () => escalateToOperator),
    Effect.catchTag("FacetStoreCorruptError",  () => failFast),
    Effect.withSpan("applyApprovedProposal", { attributes: { kind: approval.kind } })
  );
```

`Match.tag` with `Match.exhaustive` makes the three proposal kinds a compile-checkable total function. Adding a fourth kind of proposal later fails the build until this saga handles it — the GoF visitor pattern enforced at the type system.

**Saga 7 — `recordProposalRejection`.** Counterpart to `applyApprovedProposal`. Fires when an operator review closes a proposal with `rejected`. The rejection is not just a state change — its rationale is preserved verbatim and conditions every subsequent synthesis that touches the same facet, so the same proposal does not resurface unchanged.

```ts
const recordProposalRejection = (rejection: ProposalRejection) =>
  Effect.gen(function* () {
    // ─── Truth highway: append rejection with rationale ──────────
    // Rationale preserved verbatim per invariant 8 so future
    // synthesis (proposeRefinements, proposeHypothesis) can
    // condition on it without resurfacing the same proposal.
    yield* ProposalLog.markRejected(rejection.proposalId, {
      rejectedBy:  rejection.operatorId,
      rationale:   rejection.rationale,
      rejectedAt:  yield* Clock.now,
    });

    return rejection.proposalId;
  }).pipe(
    Effect.catchTag("ProposalNotFoundError",     () => failFast),
    Effect.catchTag("ProposalAlreadyResolvedError", () => logAndSkip),
    Effect.withSpan("recordProposalRejection")
  );
```

The saga is short by design — the work is the rationale-preservation discipline, not the state transition. Without this saga, rejection rationales become folklore (the operator remembers, the agent doesn't); with it, every rejection is queryable evidence the next synthesis must consider.

**Saga 8 — `applyHandoffDecision`.** Closes a pending intervention handoff. Fires when an operator (or the agent itself, via Reasoning) provides a chosen option for a handoff that previously surfaced from a saga that hit a deadlock (ambiguous drift, exhausted locator ladder, etc.). The choice does not resume a suspended fiber — the originating saga already exited. Instead, the choice is recorded as a hint the next authoring attempt at the same facet will see and apply, per the handoff's `reversalPolicy`.

```ts
const applyHandoffDecision = (decision: HandoffDecision) =>
  Effect.gen(function* () {
    // ─── Memory highway: load the handoff being resolved ─────
    const handoff = yield* HandoffQueue.read(decision.handoffId);

    // ─── Validate: the chosen option must be one the handoff offered ─
    const valid = handoff.choices.some((c) => c.id === decision.chosenOptionId);
    if (!valid) {
      return yield* Effect.fail(new InvalidHandoffChoiceError({
        handoffId:      decision.handoffId,
        chosenOptionId: decision.chosenOptionId,
      }));
    }

    // ─── Memory highway: append a resolution record ──────────
    // The next authoring run that hits the same situation reads
    // this and applies the choice without re-emitting the handoff.
    yield* HandoffResolutionLog.append({
      handoffId:       decision.handoffId,
      chosenOptionId:  decision.chosenOptionId,
      resolvedBy:      decision.resolverId,         // operator or agent
      resolvedVia:     decision.resolutionMethod,   // "operator" | "reasoning"
      rationale:       decision.rationale,
      reversalPolicy:  handoff.reversalPolicy,
      resolvedAt:      yield* Clock.now,
    });

    // ─── If the handoff is bound to a facet, enrich it with the choice ─
    if (handoff.attachmentRegion?.facetId) {
      yield* EvidenceLog.appendHandoffResolution({
        facetId:    handoff.attachmentRegion.facetId,
        handoffId:  decision.handoffId,
        choice:     decision.chosenOptionId,
      });
    }

    // ─── Memory highway: mark queue entry resolved ───────────
    yield* HandoffQueue.markResolved(decision.handoffId);

    return decision.handoffId;
  }).pipe(
    Effect.catchTag("HandoffNotFoundError",      () => failFast),
    Effect.catchTag("InvalidHandoffChoiceError", () => surfaceErrorToOperator),
    Effect.withSpan("applyHandoffDecision")
  );
```

The two resolution paths (operator-via-CLI and agent-via-Reasoning) flow through the same saga; `decision.resolutionMethod` records which one this was. Per the handoff's `reversalPolicy`, the resolution may be revisited at the next evaluation if drift contradicts the choice — invariant 7 (reversible agentic writes) holds here too.

**Saga 9 — `proposeHypothesis`.** The agent's self-driven proposal saga. Counterpart to `proposeRefinements`: where that produces *revision* proposals (change a facet), this produces *hypothesis* proposals (change code with a predicted metric delta). Fires when the agent reads the receipt log and decides the batting average suggests a code change is worth proposing.

```ts
const proposeHypothesis = (context: HypothesisContext) =>
  Effect.gen(function* () {
    // ─── Truth highway: read recent receipts + metric trajectory ─
    const receiptHistory  = yield* ReceiptLog.recent({ count: 30 });
    const metricSnapshot  = yield* MetricCompute.snapshot({
      metrics: context.focusMetrics,
      window:  context.window,
    });

    // ─── Memory highway: shape of memory for grounding ───────
    const memorySnapshot = yield* MemoryHealthSnapshot.compute();

    // ─── Truth highway: prior rejected hypotheses to condition on ─
    const priorRejected = yield* ProposalLog.rejectedHypothesesIn(context.window);

    // ─── Reasoning highway: synthesize a hypothesis ──────────
    // LLM authors a code change + predicted metric delta, grounded
    // in receipts and trajectory, conditioned on prior rejections.
    const hypothesis = yield* Reasoning.proposeHypothesis({
      receiptHistory,
      metricSnapshot,
      memorySnapshot,
      priorRejected,
      constraints: {
        mustCiteReceipts:                true,
        mustNamePredictedMetric:         true,
        mustNamePredictedDirection:      true,
        mustEstimatePredictedMagnitude:  true,
        maxFilesInProposedChange:        5,
      },
    });

    // ─── Truth highway: append to proposal log (kind: hypothesis) ─
    const proposalId = yield* ProposalLog.append({
      kind:              "hypothesis",
      proposedChange:    hypothesis.proposedChange,
      predictedDelta:    hypothesis.predictedDelta,
      rationale:         hypothesis.rationale,
      citedReceipts:     hypothesis.citedReceipts,
      reasoningProvider: yield* Reasoning.providerId,
      proposedAt:        yield* Clock.now,
    });

    return proposalId;
  }).pipe(
    Effect.catchTag("ReceiptLogEmptyError",   () => skipUntilReceiptsAccumulate),
    Effect.catchTag("ReasoningShapeError",    () => surfaceShapeErrorToOperator),
    Effect.catchTag("ReasoningProviderError", () => retryOrFailover),
    Effect.withSpan("proposeHypothesis")
  );
```

This is the agent closing the trust-but-verify loop on its own initiative. Without this saga, hypotheses are only ever human-authored — which limits how much of v2's evolution the agent can drive. With it, the agent reads the receipt log at session start and may emit a hypothesis proposal that the operator reviews like any other; if approved, it lands as a code change; the next evaluation verifies; the receipt appends; the agent reads again. The flywheel that §5 of the direction doc describes is what this saga turns.

**Saga 10 — `evaluateTestbed`.** The measurement saga. Runs a full evaluation against a committed testbed version: fan out authoring across testbed work items, compute metrics in parallel, append evaluation summary. Composes `authorTest` against the testbed source; crosses all five highways via that composition.

```ts
const evaluateTestbed = (version: TestbedVersion) =>
  Effect.gen(function* () {
    // ─── Intent highway: enumerate work items at this testbed version ─
    const refs = yield* TestbedAdapter.listRefs(version);

    // ─── Fan-out: each ref runs authorTest in parallel, bounded ──
    const runRecords = yield* Effect.all(
      refs.map((ref) => authorTest(ref)),
      { concurrency: 4, batching: false } // bounded to avoid SUT overload
    );

    // ─── Truth highway: metric derivations in parallel ────────
    const metrics = yield* Effect.all({
      acceptanceRate:       MetricCompute.testAcceptanceRate(runRecords),
      authoringTimeP50:     MetricCompute.authoringTimeP50(runRecords),
      memoryHitRate:        MetricCompute.memoryHitRate(runRecords),
      corroborationRate:    MetricCompute.memoryCorroborationRate(runRecords),
      driftEventRate:       MetricCompute.driftEventRate(runRecords),
      domLessAuthoringShare: MetricCompute.domLessAuthoringShare(runRecords),
    });

    // ─── Truth highway: append evaluation summary (append-only) ──
    return yield* EvaluationLog.append({
      testbedVersion: version,
      codeVersion:    yield* CodeVersion.current,
      completedAt:    yield* Clock.now,
      runRecordIds:   runRecords.map((r) => r.runId),
      metrics,
    });
  }).pipe(
    Effect.catchTag("TestbedNotFoundError",    () => failFast),
    Effect.catchTag("TestbedMalformedError",   () => escalateToOperator),
    // individual authorTest failures do not fail the saga; they surface as
    // failed runRecords in the set and affect metric values directly
    Effect.withSpan("evaluateTestbed", { attributes: { version: String(version) } })
  );
```

Notice what the saga does *not* do: there is no special evaluation-runner code. The authoring path is the same. The testbed adapter provides work items indistinguishable from real ADO items; `authorTest` runs identically. The only distinction is the `source` field — polymorphism doing the work so measurement and production share a code path.

**Saga 11 — `verifyHypothesis`.** Fires after a hypothesis-carrying code change lands. Runs the next evaluation at the hypothesis' declared testbed version; computes the delta against the prior summary; appends the verification receipt. The closing joint of the trust-but-verify loop.

```ts
const verifyHypothesis = (hypothesis: Hypothesis) =>
  Effect.gen(function* () {
    // ─── Run the evaluation at the hypothesis' testbed version ──
    const evaluation = yield* evaluateTestbed(hypothesis.testbedVersion);

    // ─── Truth highway: compare to the immediately prior summary ─
    const prior = yield* EvaluationLog.priorSummary(hypothesis.testbedVersion);
    const actualDelta = yield* MetricCompute.delta(
      hypothesis.metric,
      { from: prior, to: evaluation }
    );

    // ─── Truth highway: append verification receipt (append-only) ──
    const receipt = yield* ReceiptLog.append({
      hypothesisId:   hypothesis.id,
      predictedDelta: hypothesis.predictedDelta,
      actualDelta,
      confirmed:      directionMatches(hypothesis.predictedDelta, actualDelta),
      computedAt:     yield* Clock.now,
    });

    // ─── If contradicted, the agent's next read will surface it ──
    // No automated rollback: invariant 7 (reversibility) gates reversal
    // through proposal-gated review, not through verification outcome.

    return receipt;
  }).pipe(
    Effect.catchTag("MetricComputeError",      () => logAndSurfaceToOperator),
    Effect.catchTag("PriorSummaryMissingError", () => failFast),
    Effect.withSpan("verifyHypothesis", { attributes: { hypothesisId: hypothesis.id } })
  );
```

Contradiction does not roll back the code change. It appends a `confirmed: false` receipt. The next agent session reads the receipt log; if the batting average is slipping, the agent proposes a reversal through the proposal-gated pathway. Reversibility is a property of the log history, not of automated rollback.

**Saga 12 — `maintenanceCycle`.** The L4 daemon. Scheduled on a cadence (e.g., once per hour). Runs confidence-aging, batch corroboration for recent passing runs, and a refinement proposal synthesis over the last window. Memory highway self-loop; entirely internal.

In practice the saga is split into a body (`maintenanceTick`, one iteration) and a daemon wrapper (`maintenanceDaemon = maintenanceTick.pipe(Effect.schedule(Schedule.fixed("1 hour")), Effect.forkDaemon)`). The CLI verb `v2 maintain --once` invokes the body; the implicit daemon in `main` uses the wrapper. One body, two invocation paths, identical logic.

```ts
const maintenanceCycle = Effect.gen(function* () {
  // ─── Memory highway: age confidence over uncorroborated evidence ─
  yield* ConfidenceAge.run();

  // ─── Memory highway: corroborate facets from recent passing runs ─
  const recent = yield* RunRecordLog.passingRunsSince({ hours: 1 });
  yield* Effect.all(
    recent.map((run) => Corroborate.fromRun(run)),
    { concurrency: "unbounded" }
  );

  // ─── Memory + Truth: synthesize revision proposals for the window ─
  yield* proposeRefinements({ start: yield* Clock.hoursAgo(1) });
}).pipe(
  Effect.schedule(Schedule.fixed("1 hour")),
  Effect.forkDaemon,
  Effect.withSpan("maintenanceCycle")
);
```

Three sub-operations composed in sequence; the whole forked as a daemon scoped to the session's lifetime. The `Schedule.fixed("1 hour")` is declarative — the scheduler handles timing, not the application code. Shutting down the session shuts down the daemon deterministically via fiber-tree cleanup.

---

**Why the braiding doesn't break under change.** If a new source lands on the intent highway, `Layer.succeed(IntentFetch, newImpl)` is the only change; `authorTest`'s consumers are untouched. If a new metric verb joins the truth highway, it appears in the manifest and in `MetricCompute` without rewriting `authorTest`. If a new proposal kind joins `applyApprovedProposal`, the `Match.exhaustive` call site becomes a compile error until the new case is handled — the visitor pattern enforced by the type system. If a new error tag is introduced to any handshake, the inferred error channel of every saga that composes that handshake gains the tag as a residual until a `catchTag` routes it. Additions are additive; subtractions are deprecations with paths; changes are compile-checkable. The map holds because Effect's composition is both *compositional* (parts combine without knowing about each other) and *total* (every error has a typed path, every proposal kind has an exhaustive match, every saga has a scoped fiber).

**The saga set is closed.** The thirteen sagas above — `authorTest` (the flagship), plus `onboardSession`, `growMemoryForStep`, `absorbOperatorInput`, `respondToDrift`, `proposeRefinements`, `recordProposalRejection`, `applyHandoffDecision`, `proposeHypothesis`, `applyApprovedProposal`, `evaluateTestbed`, `verifyHypothesis`, and `maintenanceCycle` (with its `maintenanceTick` body) — are the whole of v2's runtime behavior. Every action v2 takes, at any phase of its life, composes these sagas or sub-sagas thereof. Adding a new capability means adding to the set with the same structural discipline; changing a capability means evolving a saga under the proposal-gated hypothesis loop. The closed set is the claim: v2 does nothing that does not fall into one of these braided paths.

The shape of the thirteen, by relationship to the highways:

| # | Saga | Trigger | Primary highways |
|---|---|---|---|
| 0 | `authorTest` | per work item (CLI `v2 author`) | all six |
| 1 | `onboardSession` | every session start | Verb (then implicit on every other) |
| 2 | `growMemoryForStep` | sub-saga in `authorTest` on facet-miss | World → Memory |
| 3 | `absorbOperatorInput` | operator action (CLI `v2 absorb`) | Reasoning → Memory |
| 4 | `respondToDrift` | sub-saga in `authorTest` on memory-vs-world mismatch | Memory + Truth (+ Reasoning if ambiguous) |
| 5 | `proposeRefinements` | scheduled (in `maintenanceCycle`) | Memory → Reasoning → Truth |
| 6 | `applyApprovedProposal` | operator action (CLI `v2 approve`) | Memory or Truth, by kind |
| 7 | `recordProposalRejection` | operator action (CLI `v2 reject`) | Truth |
| 8 | `applyHandoffDecision` | operator or agent action (CLI `v2 decide`) | Memory + Truth |
| 9 | `proposeHypothesis` | agent self-driven (CLI `v2 propose-hypothesis`) | Truth → Memory → Reasoning → Truth |
| 10 | `evaluateTestbed` | manual or scheduled (CLI `v2 evaluate`) | all six (via `authorTest`) |
| 11 | `verifyHypothesis` | after hypothesis-carrying change lands (CLI `v2 verify`) | Truth |
| 12 | `maintenanceCycle` | `Schedule.fixed("1 hour")` daemon (CLI `v2 maintain`) | Memory |

The two new operator-decision sagas (`recordProposalRejection`, `applyHandoffDecision`) close the half of the operator review loop that the original gallery left implicit; the new `proposeHypothesis` closes the agent's side of the trust-but-verify loop. With these in place the saga gallery is genuinely complete: every behavior the prior five v2 docs name is owned by exactly one saga (or one named sub-saga), and every saga is reachable from exactly one CLI verb dispatched through `main`.

### 10.6 The interchanges

The highways meet at five places. Each interchange is where one primitive's output becomes another primitive's input, and each carries a specific discipline.

**The fluency interchange** — where the verb highway meets the agent. Read on session start; never read again during the session. The agent's capability is fixed at the moment of reading; new verbs require a new session. This interchange is where agent fluency is made cheap (one file read) and agent capability is made stable (no mid-session discovery).

**The mint interchange** — where the world highway meets the memory highway. When an observation produces a new facet, provenance is threaded at this moment: instrument, session, run, timestamp. No later write can retrofit provenance; invariant 2 binds here. This is the most structurally load-bearing interchange in the map; every downstream claim about the facet rests on what is committed at mint.

**The query interchange** — where the agent meets memory in the read direction. Intent phrases become parsed constraints; constraints become ranked facets; ranking is by confidence (a derivation) with health as tiebreaker. This is where memory *earns its way* — a query that returns nothing above threshold falls through to live observation, and the memory highway hands off to the world highway.

**The proposal interchange** — where evaluation outputs meet operator review. Three kinds of proposal converge here: revision (change a facet), hypothesis (change code, predict a metric delta), candidate (new facet from operator input). All three follow the same proposal-gated reversibility; the operator sees them in a single queue; accept/reject is a typed decision; rejection is preserved with rationale. This is where human judgment sits in the loop by design.

**The receipt interchange** — where code changes meet the next evaluation. The loop's closing joint: a hypothesis lands, the next evaluation runs, the metric verb computes the actual delta, the verification receipt appends, the agent reads it. The batting average is a derivation over what happens here. This is the single joint the entire trust-but-verify discipline hangs from.

### 10.7 The lighting-up sequence — which towns come online at each phase

The highways are built gradually. A phase-indexed view of the town catalogs answers "what's live after Phase K?" The matrix below traces which highway's towns light up at each phase; empty cells indicate nothing is added to that highway in that phase. Substrate foundations (§10.3) are implicitly Phase 0 across all rows.

| Phase | Verb highway | Intent highway | World highway | Memory highway | Truth highway |
|---|---|---|---|---|---|
| **0** — scaffolding | — | — | — | — | — |
| **1** — manifest + fluency | Manifest Schema · Manifest Generator · Sync Check · Fluency Harness | — | — | — | — |
| **2** — facet schema | — | — | — | Facet Schema · Facet Store | — |
| **3** — L0 data-flow | — | ADO Source · Intent Fetch · Intent Parse | Navigation · Locator Ladder · Interact · ARIA Snapshot · State Probes | (catalog populates organically via compose-time minting) | Test Compose · Test Execute · Run Record Log |
| **4** — ship L0 | — | — | — | (organic population continues) | (run records accumulate) |
| **5** — measurement substrate | — | Testbed Adapter | — | — | `metric-test-acceptance-rate` · `metric-authoring-time-p50` · Proposal Log · Operator Review · Receipt Log |
| **6** — L1 memory | — | — | — | Evidence Log · Confidence · Locator Health Track · Facet Query · Facade Regenerator | `metric-memory-hit-rate` · `metric-memory-corroboration-rate` |
| **7** — L2 operator | — | Dialog Capture · Document Ingest | — | Candidate Review | `metric-operator-wording-survival-rate` · `metric-vocabulary-alignment-score` |
| **8** — L3 drift + DOM-less | — | — | — | Drift Emit · Confidence Gate | `metric-drift-event-rate` · `metric-dom-less-authoring-share` · `metric-convergence-delta-p50` |
| **9** — L4 self-refinement | — | — | — | Confidence Age · Corroborate · Revision Propose | `metric-hypothesis-confirmation-rate` |

Read horizontally for "what phase lit up which highway"; read vertically for "when did this highway gain its towns." Some observations this matrix makes visible that the phase-indexed view of §3 does not:

- **The Verb highway lights up once and then stays static in shape.** All four of its towns land in Phase 1; every subsequent phase adds verb *declarations* but never verb *infrastructure*.
- **The World highway lights up once.** Phase 3 ships every town; Phase 8 adds a policy that consumes World highway outputs (the Confidence Gate) but does not extend the highway itself.
- **The Memory highway is the most phased.** Storage towns at Phase 2; derivation towns at Phase 6; gate towns at Phase 8; maintenance towns at Phase 9. Each phase adds a sub-carriageway to a highway that grew along with v2's capability.
- **The Truth highway lights up in two stages.** Phase 3 gives it its record-keeping infrastructure (compose, execute, run-record log); Phase 5 and thereafter add the measurement layer (metric verbs, proposal/receipt logs). Between Phase 4 (first ship) and Phase 5 (first metrics), run records accumulate without being measured — this is the deliberate "unmeasured choices" gap §5 flagged.

The matrix is also the staging plan for a v2 build that wants to preview a single highway at a time. A team could, for example, build Phases 0–2 + Phase 1's Verb towns + Phase 2's Storage towns, and have a working Memory highway skeleton before any authoring runs. Such staging orderings are *permitted* (they don't violate hard dependencies from §4.1) but *not recommended*: the phase order is backward-chained from v2 as the destination, not from any individual highway's completeness.

### 10.8 The map in motion — one session traced

Open the map and trace a single authoring session.

**(1)** The agent starts. `fs.readFile('manifest.json')` — the verb highway delivers the full verb set. The agent is fluent before any action.

**(2)** The agent picks a work item. `intent-fetch` with `source: ado:12345` — the intent highway brings the work item inbound. `intent-parse` shapes it into ordered preconditions, actions, expected outcomes, with source-text provenance per step.

**(3)** For each step, the agent queries memory. `facet-query` with intent phrase — the memory highway outbound. If the query returns above-threshold facets, the agent has what it needs. If not, the query interchange hands off: the world highway lights up. `navigate` + `observe` produce snapshots; at the mint interchange, `facet-mint` writes new entries with full provenance.

**(4)** With facets in hand, the agent composes the test. `test-compose` produces a Playwright test file that references facets by name — no inline selectors, no inline data. The facade regenerator updates per-screen facade modules from the catalog.

**(5)** `test-execute` runs the test. Run records append to the run-record log. Step-level evidence, outcomes, facets-referenced — all captured, all structured, all append-only.

**(6)** If the test fails in a memory-mismatch pattern, `drift-emit` fires. The drift log receives a classified event; the offending facet's confidence drops. If the test passes, `corroborate` fires; positive evidence appends to the referenced facets' evidence logs.

**(7)** Metrics recompute. `metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-memory-hit-rate` — each is a pure derivation over the relevant log. The evaluation outputs show what moved.

**(8)** If the session's authoring carried a hypothesis ("moving the ladder order will improve match rate by 10%"), the evaluation produces a verification receipt: `{ hypothesis, predictedDelta, actualDelta, confirmed }`. The receipt appends to the receipt log. The agent, at the start of its next session, reads this log.

**(9)** If the drift log or metrics indicate a pattern the agent can propose a response to, the agent emits a proposal. The proposal interchange routes it to operator review. Accepted proposals land — as code changes, memory revisions, or approved candidates. The next evaluation verifies.

**(10)** The session closes. A closeout receipt captures what was touched, what was minted, what was proposed. The receipt log has one more entry. The agent has one more piece of its own history to learn from. The loop has turned once.

Every step above travels a highway; every handoff between steps is an interchange. The map is the session. The session is the map in motion.

### 10.9 What this map is for

Three uses.

**For orientation.** A new engineer or a new agent session can find itself on the map in seconds. Every primitive is visible; every flow is named; every interchange has a discipline attached. No hidden paths.

**For impact analysis.** When a change is proposed — a new verb, a new metric, a shape adjustment to a facet — its blast radius is traceable on the map. Follow the highways from the change point; every interchange it touches is a place where discipline must hold. The architecture's cascade risks (§5) are visible as walks across the map.

**For the agent's reasoning.** The agent at session start reads the manifest; it can also, metaphorically, read this map. The agent's own actions are traces through the highways; the agent's own receipts sit at the receipt interchange; the agent's own proposals route through the proposal interchange. When the agent asks "what should I do next?" it is asking where on the map it currently sits.

The cathedral of §9 holds because every stone carries weight the others need. The highway map of §10 is the routing that makes the cathedral a place you can move through — not just admire, but *use*. Together they are the whole: the structural commitment and the navigational poster. v2 is both at once, which is why the plan is executable and the execution has somewhere to go.

## 11. The runtime composition — how v2 actually runs

§10 showed what v2 *is* when it's running. This section shows how v2 *starts running*: how every port gets wired once, how sagas get dispatched at invocation time, how the fiber tree scopes the run, how shutdown collects its children, and how observability makes the whole thing visible. This is the single `main` that makes everything compose. If §9 was the cathedral and §10 was the map, §11 is the ignition.

Six subsections:
- **§11.1** the Layer cake — every port wired once.
- **§11.2** the entry point — `main` as saga dispatcher.
- **§11.3** invocation modes — what the CLI accepts.
- **§11.4** the fiber tree — session scope, daemons, shutdown.
- **§11.5** observability — every saga is its own span.
- **§11.6** the shape of an actual run — one CLI invocation traced.

And a short closing stanza.

### 11.1 The Layer cake — every port, wired once

Every service v2 uses is a `Context.Tag`; every tag needs a `Layer` to implement it at runtime. The composition layer — a single file under `lib-v2/composition/app-layer.ts` — wires them all, once, into an `AppLayer` the entry point provides to every saga. This is the hexagonal architecture's composition root made concrete; the clean architecture's "main" module; the Effect application's service provision point. One name, one location, one commit.

```ts
import { Layer } from "effect";

// Infrastructure baseline — provided once, required by many
const FsLive      = NodeFileSystem.layer;
const ClockLive   = Clock.layer;
const LoggerLive  = Logger.layer;
const TracerLive  = OpenTelemetryTracer.layer;

// ─── Intent highway adapters ────────────────────────────────────
const AdoSourceLive       = AdoSource.live;
const TestbedAdapterLive  = TestbedAdapter.live;

// ─── World highway adapters ─────────────────────────────────────
const PlaywrightPageLive  = PlaywrightPage.live;   // Effect.Resource-backed

// ─── Memory highway adapters ────────────────────────────────────
const FacetStoreLive      = FacetStore.yamlLive;   // YAML + in-memory index
const EvidenceLogLive     = EvidenceLog.jsonlLive; // per-facet JSONL
const DriftLogLive        = DriftLog.jsonlLive;
const ProposalLogLive     = ProposalLog.jsonlLive;
const ReceiptLogLive      = ReceiptLog.jsonlLive;
const RunRecordLogLive    = RunRecordLog.jsonlLive;

// ─── Verb highway ───────────────────────────────────────────────
const ManifestRegistryLive = ManifestRegistry.fromJson("manifest.json");

// ─── Reasoning highway — provider chosen at startup ─────────────
// One of these wins; the choice is configuration, not code.
const ReasoningLive = Config.string("REASONING_PROVIDER").pipe(
  Config.withDefault("anthropic"),
  Effect.map((provider) =>
    Match.value(provider).pipe(
      Match.when("anthropic", () => AnthropicReasoning.live),
      Match.when("openai",    () => OpenAIReasoning.live),
      Match.when("mcp",       () => McpReasoning.live),
      Match.when("copilot",   () => CopilotReasoning.live),
      Match.when("local",     () => LocalReasoning.live),
      Match.when("test",      () => TestReasoning.live),
      Match.orElse((unknown) => Effect.die(new UnknownProviderError({ unknown }))),
    )
  ),
  Layer.unwrapEffect,
);

// ─── Composition: one AppLayer, built once ──────────────────────
export const AppLayer = Layer.mergeAll(
  // infrastructure baseline first; every other layer depends on these
  FsLive, ClockLive, LoggerLive, TracerLive,
  // intent
  AdoSourceLive, TestbedAdapterLive,
  // world
  PlaywrightPageLive,
  // memory
  FacetStoreLive, EvidenceLogLive, DriftLogLive,
  ProposalLogLive, ReceiptLogLive, RunRecordLogLive,
  // verb
  ManifestRegistryLive,
  // reasoning
  ReasoningLive,
).pipe(
  Layer.provideMerge(NodeContext.layer),
);
```

Five properties make the Layer cake what it is:

1. **Every port has exactly one Live Layer in `AppLayer`.** No port is provided twice; no port is missing. The compiler enforces this: a saga that requires a tag the `AppLayer` doesn't provide is a type error at the `Effect.provide(AppLayer)` site.

2. **Provider choice for Reasoning is configuration, not code.** `REASONING_PROVIDER=anthropic npm run ...` picks Anthropic; `REASONING_PROVIDER=mcp` picks MCP. The sagas don't change. The manifest doesn't change. Only the Layer resolution changes. This is what provider abstraction *means* operationally.

3. **Testing uses a different Layer.** `TestLayer` in `lib-v2/testing/test-layer.ts` swaps in `TestReasoning.live` (deterministic fixture-based responses), `TestFacetStore.live` (in-memory), `TestPlaywrightPage.live` (recorded-response), and so on. Integration tests provide `TestLayer` instead of `AppLayer` and run the same sagas against it. One code path, two layers, two audiences — the production/test boundary is a single import swap.

4. **Layer composition is associative and acyclic.** `Layer.mergeAll` combines independent layers; `Layer.provideMerge` stacks dependent ones (e.g., `NodeContext.layer` provides the file system and clock that `FacetStoreLive` depends on). Effect's Layer type system catches cycles; the compiler refuses to build a cyclic cake.

5. **The `AppLayer` is a value, not a procedure.** It can be inspected, combined with other layers (for deployments that add observability or alternate transports), or partially applied. The composition root is itself a composable object — clean architecture's dependency rule made into a manipulable value.

Provider swap scenarios this supports out of the box:
- **Production against a real customer tenant** — `REASONING_PROVIDER=anthropic` (or `openai`), plus production ADO credentials, plus real Playwright browser.
- **Operator-in-the-loop over MCP** — `REASONING_PROVIDER=mcp`, the LLM running in Claude Desktop (or similar), v2 exposing its verbs as MCP tools while also calling `Reasoning.*` through the MCP channel.
- **Offline/air-gapped** — `REASONING_PROVIDER=local`, local model via Ollama; no network calls leave the environment.
- **CI integration tests** — `REASONING_PROVIDER=test`, deterministic fixtures replayed; no real LLM call; runs in 30 seconds.
- **Development with a cheaper model** — `REASONING_PROVIDER=openai` with a cheaper model for iteration, `anthropic` for production quality.

One configuration flag. Zero code changes. Every saga, every handshake, every metric, every receipt is provider-agnostic from the inside.

### 11.2 The entry point — `main` as saga dispatcher

Every v2 invocation — authoring one work item, evaluating a testbed version, verifying a hypothesis, absorbing an operator document, running a maintenance cycle — starts at one function. `main` parses the CLI, opens a session, dispatches to the right saga, and closes the session with a receipt. It is the only place where sagas become running fibers, and it is the only place where the `AppLayer` is provided.

```ts
import { Effect, NodeRuntime, Match } from "effect";

// The runtime request — what the CLI parses into
type RuntimeRequest =
  | { kind: "author";             sourceRef: SourceRef;       hypothesis?: Hypothesis }
  | { kind: "evaluate";           version: TestbedVersion }
  | { kind: "verify";             hypothesis: Hypothesis }
  | { kind: "absorb";             input: OperatorInput }
  | { kind: "approve";            approval: ApprovedProposal }
  | { kind: "reject";             rejection: ProposalRejection }
  | { kind: "decide";             decision: HandoffDecision }
  | { kind: "propose-hypothesis"; context: HypothesisContext }
  | { kind: "maintain";           once?: boolean };

// The single entry point — composes onboarding + dispatch + closeout
const main = (request: RuntimeRequest) =>
  Effect.gen(function* () {
    // ─── Onboard — read manifest, validate fluency, open session ─
    const session = yield* onboardSession(SessionId.generate());

    // ─── Fork maintenance cycle as a daemon for the session's life ─
    // Skipped when the invocation IS the maintenance command itself,
    // to avoid double-scheduling.
    if (request.kind !== "maintain") {
      yield* maintenanceDaemon;
    }

    // ─── Dispatch to the requested saga by kind ───────────────
    const result = yield* Match.value(request).pipe(
      Match.tag("author",             ({ sourceRef, hypothesis }) => authorTest(sourceRef, hypothesis)),
      Match.tag("evaluate",           ({ version })               => evaluateTestbed(version)),
      Match.tag("verify",             ({ hypothesis })            => verifyHypothesis(hypothesis)),
      Match.tag("absorb",             ({ input })                 => absorbOperatorInput(input)),
      Match.tag("approve",            ({ approval })              => applyApprovedProposal(approval)),
      Match.tag("reject",             ({ rejection })             => recordProposalRejection(rejection)),
      Match.tag("decide",             ({ decision })              => applyHandoffDecision(decision)),
      Match.tag("propose-hypothesis", ({ context })               => proposeHypothesis(context)),
      Match.tag("maintain",           ({ once })                  => once ? maintenanceTick : maintenanceDaemon),
      Match.exhaustive,
    );

    // ─── Close the session receipt; this appends a closeout record ─
    yield* SessionReceipt.close(session, result);

    return result;
  }).pipe(
    // ─── Provide every port, once, here at the composition root ───
    Effect.provide(AppLayer),
    // ─── Session scope — fiber tree cleaned up on exit ──────────
    Effect.scoped,
    // ─── Any unhandled error surfaces to the log with full cause ──
    Effect.tapErrorCause((cause) =>
      Effect.logError("v2 session failed", { cause: Cause.pretty(cause) })
    ),
    // ─── Top-level span wraps the whole run ──────────────────────
    Effect.withSpan("v2.main", { attributes: { kind: request.kind } }),
  );

// ─── Hand the composed program to the Node runtime ──────────────
NodeRuntime.runMain(main(parseCli(process.argv)));
```

Four properties make `main` more than a dispatcher:

1. **Every port is provided exactly once, at the top.** `Effect.provide(AppLayer)` wraps the whole generator. Nothing inside `main` (or inside any saga `main` dispatches to) can accidentally provide a different Layer; the composition root is the only authority.

2. **Session scoping is explicit.** `Effect.scoped` binds the lifetime of every resource (including `PlaywrightPage`, the maintenance fiber, every open log file descriptor) to the session. When `main` returns — whether by success, typed error, or unrecoverable defect — every child fiber is interrupted and every resource is released. No leaked browsers, no orphaned daemons, no half-written logs.

3. **The dispatch is exhaustive.** `Match.exhaustive` forces every `RuntimeRequest` kind to have a case. Adding a seventh invocation mode (say, `benchmark`) without adding its dispatch case is a compile error. The CLI surface and the saga surface stay in sync by type-system law.

4. **Errors surface with full cause trace.** `tapErrorCause` with `Cause.pretty` ensures every unhandled defect includes the full fiber history — where the error originated, what span it was under, what parent fiber invoked it. Production debugging has a trail regardless of where the failure happened.

One last property, subtle but load-bearing: `NodeRuntime.runMain` is the *only* place in v2 that runs an Effect. Every saga, every handshake, every utility returns an `Effect<A, E, R>` value that does nothing until the runtime evaluates it. This means every non-entry-point code path is inspectable, composable, and substitutable without side effects occurring. The production code and the test code both produce Effect values; the difference is which runtime reads them. v2's side-effect surface area is exactly one function call wide.

### 11.3 Invocation modes — what the CLI accepts

Nine CLI verbs, each parsing into one `RuntimeRequest`, each dispatching to one saga (or, in the `maintain` case, sitting alive to host the daemon). The whole CLI is declared once in `lib-v2/cli/parse.ts`; the parser is a pure function over `process.argv`; every combination that passes the parser has a corresponding saga and cannot slip through.

```ts
// The CLI surface — nine verbs, one parser, one RuntimeRequest output
export const parseCli = (argv: string[]): RuntimeRequest =>
  Command.parse(argv, {
    author: Command.make({
      source: Options.text("source").pipe(Options.withDescription("ado:<id> | testbed:v<N>:<id>")),
      hypothesis: Options.fileJson("hypothesis", HypothesisSchema).pipe(Options.optional),
    }, ({ source, hypothesis }) => ({
      kind: "author" as const,
      sourceRef: SourceRef.parse(source),
      hypothesis: Option.getOrUndefined(hypothesis),
    })),

    evaluate: Command.make({
      version: Options.text("testbed").pipe(Options.withDefault("current")),
    }, ({ version }) => ({
      kind: "evaluate" as const,
      version: TestbedVersion.parse(version),
    })),

    verify: Command.make({
      hypothesis: Options.fileJson("hypothesis", HypothesisSchema),
    }, ({ hypothesis }) => ({
      kind: "verify" as const,
      hypothesis,
    })),

    absorb: Command.make({
      input: Options.fileJson("input", OperatorInputSchema),
    }, ({ input }) => ({
      kind: "absorb" as const,
      input,
    })),

    approve: Command.make({
      approval: Options.fileJson("approval", ApprovedProposalSchema),
    }, ({ approval }) => ({
      kind: "approve" as const,
      approval,
    })),

    reject: Command.make({
      rejection: Options.fileJson("rejection", ProposalRejectionSchema),
    }, ({ rejection }) => ({
      kind: "reject" as const,
      rejection,
    })),

    decide: Command.make({
      decision: Options.fileJson("decision", HandoffDecisionSchema),
    }, ({ decision }) => ({
      kind: "decide" as const,
      decision,
    })),

    proposeHypothesis: Command.make({
      context: Options.fileJson("context", HypothesisContextSchema).pipe(Options.optional),
    }, ({ context }) => ({
      kind: "propose-hypothesis" as const,
      context: Option.getOrElse(context, () => HypothesisContext.defaults),
    })),

    maintain: Command.make({
      once: Options.boolean("once").pipe(Options.withDefault(false)),
    }, ({ once }) => ({
      kind: "maintain" as const,
      once,
    })),
  });
```

Nine verbs, mapped to real commands:

| CLI | What it does | Saga | Typical cadence |
|---|---|---|---|
| `v2 author --source=ado:12345` | Author one test from one ADO work item against the real customer | `authorTest` | on demand (per QA backlog item) |
| `v2 author --source=ado:12345 --hypothesis=hyp-17.json` | Same but carrying a pre-declared hypothesis to verify | `authorTest` + `verifyHypothesis` | when the agent is testing a proposed change |
| `v2 evaluate --testbed=v3` | Run the full testbed at version v3; produce metrics | `evaluateTestbed` | nightly; before cut-over; after any code change |
| `v2 verify --hypothesis=hyp-17.json` | Run evaluation at the hypothesis' version; append receipt | `verifyHypothesis` | after a hypothesis-carrying change lands in code |
| `v2 absorb --input=dialog-0142.json` | Extract candidates from an operator dialog or document | `absorbOperatorInput` | when the operator provides input |
| `v2 approve --approval=prop-89.json` | Apply an operator's approved proposal (revision / candidate / hypothesis) | `applyApprovedProposal` | after operator review closes a proposal |
| `v2 reject --rejection=prop-89.json` | Record an operator's rejection of a proposal with rationale | `recordProposalRejection` | after operator review closes a proposal as rejected |
| `v2 decide --decision=hf-42.json` | Resolve a pending intervention handoff with a chosen option + rationale | `applyHandoffDecision` | when the operator (or the agent) clears a queued handoff |
| `v2 propose-hypothesis [--context=ctx.json]` | Agent reads receipt log + recent metrics; proposes a code change with predicted delta | `proposeHypothesis` | agent-initiated, typically at session start when the agent decides the batting average warrants action |
| `v2 maintain` | Run the maintenance daemon (age + corroborate + refine, scheduled) | `maintenanceDaemon` | scheduled hourly via cron or systemd |
| `v2 maintain --once` | Run a single maintenance tick and exit | `maintenanceTick` | on demand (e.g., right after a large catalog change) |

Two observations about this surface:

**The CLI is the manifest for humans.** The verb set is narrow — six — because everything v2 does falls into one of the nine sagas, and most sagas are reached through one of these verbs. A new verb means either a new saga or a new dispatch composition; both require deliberate addition, not incidental growth.

**Every CLI verb is a pure dispatch.** The CLI parses; `main` dispatches; sagas compose. There is no CLI-side orchestration logic — no "if flag A then run saga X first then Y." If a workflow needs both authoring and evaluation, it's two invocations, not one verb with branches. Complexity in the CLI means the saga gallery is missing something, and the fix is a new saga, not a CLI flag.

**Why MCP is not its own verb.** When v2 runs with `REASONING_PROVIDER=mcp`, the MCP server aspect of the adapter exposes v2's verbs as MCP tools the LLM can call. An LLM driving v2 via MCP sees the same six verbs the CLI user sees — the MCP adapter simply routes the tool call through `main`. No parallel code path; no second dispatcher. The MCP-exposed surface and the human-exposed surface are the same surface.

### 11.4 The fiber tree — session scope, daemons, shutdown

Every v2 invocation is one top-level fiber. That fiber spawns children; those children spawn children. The tree is a structured hierarchy Effect maintains for free — nothing in v2's code explicitly manages concurrency; the runtime manages it from the shape of `Effect.gen`, `Effect.all`, and `Effect.forkDaemon` calls.

```
v2.main (top-level fiber)
├── onboardSession
│   └── FluencyHarness.run
│       └── canonical task fixtures × N  (Effect.all parallel)
├── maintenanceCycle  (forkDaemon — daemon child, scoped)
│   ├── ConfidenceAge.run                 (scheduled hourly)
│   ├── Corroborate.fromRun × N           (Effect.all unbounded)
│   └── proposeRefinements
│       └── Reasoning.synthesizeRevision
└── <dispatched saga>  (authorTest | evaluateTestbed | …)
    ├── IntentFetch.fetch
    │   └── AdoSource.live (or TestbedAdapter.live)
    ├── For each step:
    │   ├── FacetQuery.resolve
    │   └── growMemoryForStep (if memory misses)
    │       ├── LocatorLadder.resolve
    │       ├── AriaSnapshot.capture        ┐
    │       ├── StateProbes.readAll         │ Effect.all
    │       └── FacetMint.create            ┘
    ├── Reasoning.phraseStep × steps  (Effect.all, concurrency: 4)
    ├── TestCompose.emit
    ├── TestExecute.run
    │   └── Playwright runner (subprocess, managed resource)
    ├── Corroborate.append × facets   (Effect.all unbounded)
    │     or DriftEmit.classify → respondToDrift
    │         └── Reasoning.classifyDrift (if rules ambiguous)
    └── ReceiptLog.append (if hypothesis carried)
```

Four disciplines govern the tree:

**1. Session scope is the root.** `Effect.scoped` in `main` creates a `Scope` that every child inherits. When `main` returns — normally, by failure, by interruption — the scope is closed; every `Resource` and every `Fiber` registered under it is released in reverse-acquisition order. The PlaywrightPage is closed, file descriptors are released, the maintenance daemon is interrupted, log flushes complete. No code in v2 writes explicit cleanup; the scope does it.

**2. Daemons vs. scoped fibers.** `maintenanceCycle` uses `Effect.forkDaemon` — it's a daemon child of the session. Daemons are collected at scope close just like scoped fibers, but they don't block the session's completion: the session's return value is ready as soon as the dispatched saga returns, and the daemon is gracefully interrupted on scope exit. Scoped fibers (like the per-step parallel branches inside `Effect.all`) block on completion by default; daemons don't. The distinction is declared at the `fork` call, visible in the code, and compile-checkable via Effect's fiber types.

**3. Resource acquisition and release.** `PlaywrightPage.live` is built on `Effect.acquireRelease`: the acquire phase launches a browser and a page; the release phase closes them. The page is available to any effect that requires `PlaywrightPage.Tag`. Every saga that touches the world gets the same page (scoped to the session); the session's exit releases it. Equivalent patterns apply to long-lived file handles, HTTP connection pools, and the MCP transport if `REASONING_PROVIDER=mcp` is in use. Resources are *composed into the AppLayer*, not acquired ad hoc inside sagas.

**4. Interruption is structured.** If the user hits Ctrl-C, if a process signal arrives, if an unhandled defect occurs at the top level, every fiber in the tree receives a structured interruption signal and unwinds through its scope. Effect's interruption model means an interrupted fiber can still run cleanup (via `Effect.addFinalizer`) before it dies; log flushes complete, browser sessions close cleanly, atomic temp-renames either finish or are aborted with the temp file left to be garbage-collected by the next session.

Two concrete consequences of this structure worth calling out:

**No zombie browsers.** v1 historically leaked Playwright browsers when a test run crashed mid-evaluation. v2 cannot — the browser is a scoped resource; its release is a finalizer bound to the scope; the scope exits whether the run succeeded, failed, or was interrupted. Verification is a single test: send SIGTERM during an evaluate run; check `ps` for orphaned Chromium processes; assert zero.

**No interleaved log writes.** Atomic temp-rename on every append means a killed session either completes its write or leaves an abandoned temp file. Appends from parallel fibers serialize at the OS-level rename; Effect's `Ref`-based in-memory summaries reconcile on next session start. The append-only logs remain consistent regardless of how ungracefully a session exits.

### 11.5 Observability — every saga is its own span

Every saga in §10.5 closes its `pipe` with `Effect.withSpan("saga-name", { attributes })`. This isn't decoration; it's the substrate for v2's observability. The `TracerLive` Layer in `AppLayer` collects spans into an OpenTelemetry-compatible exporter; the trace tree mirrors the fiber tree exactly. When the team or the agent debugs a session, they read the trace and see the saga gallery executed in real time.

```ts
// Already shown in many saga code blocks above; the pattern recurs:
const someSaga = (input: SomeInput) =>
  Effect.gen(function* () {
    /* … saga body … */
  }).pipe(
    Effect.catchTag(/* … */),
    Effect.withSpan("someSaga", {
      attributes: {
        relevant: input.field,
        kind:     input.kind,
      },
    }),
  );
```

Three properties that fall out of consistent span discipline:

**1. The trace is the saga gallery executed.** Open the trace viewer; the top-level span is `v2.main` with `kind: <invocation>`. Its children are `onboardSession`, the dispatched saga, and `maintenanceCycle` (daemon). Each saga's children are its `yield*` operations as nested spans. A reader following the trace literally walks the highway map in time-order.

**2. Reasoning calls are spans too.** Each `Reasoning.*` operation produces its own span (declared inside the adapter's implementation). The trace shows which reasoning call took how long, against which provider, with what input shape. When `metric-authoring-time-p50` regresses, the trace tells the team whether the regression came from Reasoning latency, World latency, or Memory contention — without instrumenting anything further.

**3. Errors carry their span chain.** When `Effect.tapErrorCause` logs a failure in `main`, the cause includes the span path that led to it. A `LocatorLadderExhaustedError` thrown deep in `growMemoryForStep` is logged with the span chain `v2.main → authorTest → growMemoryForStep → LocatorLadder.resolve`. Production debugging starts with the trace; the trace points at the line; the line points at the error. The operator and the agent both consult the same observability surface.

Two complementary surfaces over the same span data:

- **Real-time:** the OpenTelemetry exporter ships spans live to a collector (Tempo, Jaeger, Honeycomb — choice is configuration, not code). During customer authoring, an operator can watch sessions complete in seconds.
- **Persistent:** every span's attributes plus its parent reference are also written to the run-record log. `metric-authoring-time-p50` is a fold over those run-record entries (specifically, the duration attribute on the `authorTest` spans). Metrics and traces share one source of truth; what the dashboard shows in real time is exactly what the metric verb computes after the fact.

The spans have one more job: they are the receipt of *what happened* that the agent reads when proposing the next change. The agent doesn't need a separate "what happened" log; the spans already describe every yield* that ran, every failure that was caught, every duration that was measured. The agent's "read the receipt log" step in §10.4 is, mechanically, "read the spans plus the verification receipts." The observability surface and the agent's epistemic surface are the same surface.

### 11.6 The shape of an actual run — one CLI invocation traced

Concretely: a developer runs `v2 author --source=ado:12345 --hypothesis=hyp-17.json` from the command line. Walk through what happens, end to end.

**`t = 0ms` — process spawn.** Node starts. Imports resolve. `parseCli(process.argv)` returns `{ kind: "author", sourceRef: { source: "ado", id: "12345" }, hypothesis: <hyp-17 contents> }`. `NodeRuntime.runMain(main(request))` is the last line in the entry-point file; it begins evaluating the Effect.

**`t = 1ms` — `v2.main` span opens.** The top-level span starts with `kind: "author"` attribute. `Effect.provide(AppLayer)` evaluates: every Layer's `acquire` runs in dependency order. The `REASONING_PROVIDER=anthropic` environment variable resolves; `AnthropicReasoning.live` is selected; an HTTP client is initialized. `PlaywrightPage.live` launches a Chromium subprocess. `FacetStore.yamlLive` reads existing per-screen YAML files into the in-memory index. `ManifestRegistry` parses `manifest.json` from disk.

**`t = ~800ms` — `onboardSession` runs.** `fs.readFileSync("manifest.json")`; `Schema.decode(VerbManifestSchema)` validates the shape; `VerbTable.fromManifest` produces the typed verb table. `FluencyHarness.run` fires N canonical-task fixtures in parallel via `Effect.all`; each one asserts the agent dispatches the right verb on a known input. All pass. `SessionReceipt.open` appends a session-start record. The `onboardSession` span closes; the session reference is bound for downstream use.

**`t = ~810ms` — `maintenanceCycle` forks as daemon.** `Effect.forkDaemon` registers the maintenance fiber as a child of the session scope. It schedules its first iteration for one hour out and returns immediately. The daemon is alive but idle.

**`t = ~810ms` — dispatch.** `Match.value(request).pipe(Match.tag("author", …))` resolves; `authorTest(sourceRef, hypothesis)` becomes the next effect. The `authorTest` span opens with `sourceRef: "ado:12345"` attribute.

**`t = ~810ms` — Intent highway.** `IntentFetch.fetch({ source: "ado", id: "12345" })` yields. Inside, `AdoSource.live` makes the HTTP call to `https://dev.azure.com/.../wit/workitems/12345`. The work item returns 280ms later. `IntentParse.apply` runs the XML regex; the parsed-intent structure emerges with three steps.

**`t = ~1100ms` — Memory highway, per step.** For each of the three steps in parallel (concurrency 1 since steps are sequential within a work item, but each step's substeps parallelize), `FacetQuery.resolve` runs against the in-memory index. Step 1 finds a high-confidence facet. Step 2 finds a medium-confidence facet. Step 3 finds nothing — `growMemoryForStep` fires.

**`t = ~1200ms` — World highway, for step 3 only.** `LocatorLadder.resolve` walks role → label → placeholder → text → test-id → css; matches at rung 0 (role-name). `AriaSnapshot.capture` and `StateProbes.readAll` run in parallel via `Effect.all`. `FacetMint.create` writes a new facet to YAML with provenance threaded inline; `LocatorHealthTrack.initialize` initializes per-strategy health.

**`t = ~1500ms` — Reasoning highway, step phrasing.** `Reasoning.phraseStep` runs once per step in parallel (concurrency: 4). Each call produces a QA-legible step title from the intent text and the resolved facet. The Anthropic API returns three titles in ~600ms total (parallel); the trace shows three nested `Reasoning.phraseStep` spans, each ~600ms wide.

**`t = ~2100ms` — Truth highway, compose and execute.** `TestCompose.emit` produces the Playwright test file (AST-backed via ts-morph) referencing the three facets via the generated screen facade. `TestExecute.run` invokes the Playwright runner as a subprocess; the test runs against the customer's staging OutSystems instance. Three step assertions; all pass; `runRecord` returns with `pass: true`.

**`t = ~14000ms` — back on the Memory highway.** All three referenced facets receive positive evidence via `Corroborate.append` in parallel.

**`t = ~14100ms` — back on the Truth highway, hypothesis verification.** Because the run carried `hypothesis = hyp-17`, the saga computes the actual delta: `MetricCompute.delta(hyp-17.metric, { from: priorSummary, to: thisRun })` derives the change in metric-test-acceptance-rate. The hypothesis predicted `+0.05`; actual is `+0.08`. `confirmed: true`. `ReceiptLog.append` records the verification receipt with the predicted/actual pair.

**`t = ~14150ms` — `authorTest` span closes.** Returns the run record up the call chain.

**`t = ~14150ms` — `SessionReceipt.close` runs.** The session-end record is appended with the result reference. The `v2.main` span closes.

**`t = ~14160ms` — `Effect.scoped` releases.** The maintenance daemon fiber is interrupted (it was idle, no in-flight work). The PlaywrightPage scope releases — Chromium subprocess closes. The Reasoning HTTP client closes its keep-alive connection. The FacetStore in-memory index is dropped. All file handles flush and close.

**`t = ~14200ms` — process exits cleanly.** Exit code 0. The CLI prints the run record's URL to stdout.

The end-to-end shape: 14.2 seconds to author, execute, corroborate, and verify-hypothesis one work item — and every span of those 14.2 seconds is in the trace, every facet write is durable, every receipt is append-only, every Layer was provided exactly once. Nothing leaks. Nothing forgets.

A reader watching the trace in real time sees v2's behavior as a literal walk through the highway map: Verb (manifest read in onboard) → Intent (ADO fetch + parse) → Memory (query, mint for the missed step) → World (resolve, observe, interact) → Reasoning (phrase steps) → Truth (compose, execute, run record) → Memory again (corroborate) → Truth again (hypothesis verification, receipt). Six highways crossed in 14 seconds. One sustained execution of the trust-but-verify loop.

### 11.7 The closing stanza

Eleven sections. Begun with §1's one-page shape; closing here with the runtime that makes everything in those sections actually run.

The destination, restated for the last time: **v2 is a small agent-facing surface** — a vocabulary manifest, a facet catalog, QA-accepted tests — backed by a measurement substrate that lets the agent improve v2 with the team's review. **The architecture that holds it** is a cathedral of interlocking patterns: DDD bounded contexts, hexagonal ports, clean-architecture dependency direction, FP purity in the domain, Effect for composition, phantom types for compile-time invariants, append-only logs for time, GoF visitor for exhaustive analysis. **The map that lets you move through it** is six highways meeting at five interchanges; every parallel work stream from §3 is a town on a highway; every saga is a braided Effect program walking through specific towns; every saga is reachable from one of six CLI verbs through one `main` providing one `AppLayer`.

**The sequence that gets there** is ten phases, four inflection points, five forcing functions, one cut-over commit fired on a sustained three-metric floor. The plan is not a wish list. It is a route, with explicit gates and explicit reversals.

**The discipline that holds across all of it** is trust, but verify. Every code change carries a hypothesis; every hypothesis verifies against the next evaluation; every receipt appends. Small bets, reviewed, measured, receipted. The batting average is itself a derivation the agent reads. v2 is the system; the system measures itself; the measurement is the system measuring itself with its own primitives.

When `NodeRuntime.runMain(main(parseCli(process.argv)))` runs, all of this — the cathedral, the highways, the towns, the sagas, the runtime composition, the trust-but-verify loop, the agent's inner voice as a port choosing among five providers — is one Effect value being evaluated. One value. One process. One session at a time.

The plan is the route. The architecture is what you build along it. The runtime is what makes the architecture run. The destination is where the customer's QA team accepts the tests. **Execute.**

