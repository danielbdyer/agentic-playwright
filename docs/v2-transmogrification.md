# v2 Transmogrification

> Status: the execution plan for reshaping v1 into v2 via in-place compartmentalization. Reads alongside `v2-direction.md` (primary direction), `v2-substrate.md` (primitives and invariants), `feature-ontology-v2.md` (handshakes and technical paths), and `v2-delta-audit.md` (per-handshake v1→v2 verdicts). This document is the route; the others name the destination.

> **2026-04-17 revision note.** Earlier drafts of this document framed v2 as a `lib-v2/` sibling rebuild with an atomic cut-over commit. That framing is retired. v2 is now an in-place reshape of v1's `lib/` into three top-level folders (`product/`, `workshop/`, `dashboard/`) with a manifest-mediated seam between them. The per-lane salvage audit (§13) and the later sections (§§9–12) are in transition; they still reference `lib-v2/` and should be read as historically-sourced detail rather than current doctrine until this revision completes. The core §§1–2 below are the current plan; §3 construction order lives in `v2-direction.md §6` as the canonical sequence.

## 1. The shape

v1 reshapes into v2 in place. The key move is compartmentalization — one atomic tree reshape that divides today's `lib/` into three top-level folders, each with a single responsibility and a manifest-mediated seam to its siblings:

- **`product/`** — the packageable core. Agent-facing shipping surface. What the customer sees.
- **`workshop/`** — the measurement consumer. Consumes `product/`'s manifest to derive probes and runs them through `product/`'s normal authoring flow.
- **`dashboard/`** — the read-only observer. Projects both upstreams through manifest-declared verbs.

There are ten construction steps (named in `v2-direction.md §6`), one shipping inflection (first customer acceptance at Step 6), and one graduation condition (workshop probe coverage saturates at 100% and the batting average sustains above its floor). There is **no cut-over commit**. There is **no `lib-v2/` sibling**. v1 does not freeze while v2 is built — the workshop is already running, the trust policy is already enforcing, the seven-visitor metric tree is already producing a scorecard history. What changes is the seam between shipping surface and measurement surface.

**The shape in one paragraph:**

Step 0 is the compartmentalization commit — an atomic tree reshape that moves every v1 file into `product/`, `workshop/`, or `dashboard/` per the destinations in `v2-direction.md §3` and the per-file table in §13 (pending revision). Step 1 retires the reference-canon transitional slot via a type-level surgical edit on `source.ts` plus the demotion sweep. Steps 2–4 land the vocabulary manifest + fluency harness, the unified facet schema, and the L0 data-flow chain with the named shape adjustments and the five monolith splits. Step 5 is the probe IR spike (substrate §6a) — three representative verbs, fixture specifications, a go/no-go verdict on whether manifest-derived probes can stand as workshop's testbed. Step 6 is the first customer shipping inflection; the workshop is watching via probes already. Steps 7–10 expand L1 through L4 under the trust-but-verify loop the workshop is already running.

**The discipline in one paragraph:**

Trust, but verify. Small bets with a good batting average. No line of v2 code is justified without pointing at either a customer-facing capability in `product/` or a measurement in `workshop/` that verifies `product/` is improving. No irreversible decision lands without the proposal-gated reversibility the trust policy already enforces. Every hypothesis receipt is append-only; contradictions never overwrite. The envelope-axis substrate in `product/domain/` enforces what the invariants demand at compile time. Fluency regression fails the build at the same severity as a broken product test. The seam between folders is a compile error, not a convention. The plan is executable because its primitives are few, its sequencing is explicit, its checkpoints are measurable, and its folder seams are enforced.

**The payoff in one paragraph:**

When Step 10 lands, `product/` is a small agent-facing surface — vocabulary manifest, facet catalog, QA-accepted tests — shipping against a real customer's OutSystems backlog. `workshop/` continues running alongside, producing hypothesis receipts and scorecard deltas the agent reads to propose the next change. `dashboard/` reads from both without writing back. v1's operational scaffolding that was coupling across the concern boundary retires. The codebase an agent opens in a fresh session is 10× cheaper to orient in because the three folders name one concern each, and feature velocity inside each folder rises because no lane has to negotiate three constituencies. Subsequent evolution is by hypothesis receipt and measurement delta, not by doctrine drift.

The rest of this document is the route.

## 2. Choreography: how v1 becomes v2 mechanically

Four decisions frame how the transmogrification executes. Each is named once; each answers a question a new contributor or agent will ask in their first session.

### 2.1 The three-folder structure and the seam discipline

**Decision:** `lib/` reshapes into three top-level folders — `product/`, `workshop/`, `dashboard/` — inside the existing repository. Each has a single responsibility per `v2-direction.md §1`. The seam between folders is enforced as a compile error via an architecture test that forbids `workshop/` or `dashboard/` from importing `product/` (except through manifest-declared public verbs and the append-only log set).

**Why not a `lib-v2/` sibling rebuild:** earlier drafts defended a sibling approach on the grounds that v1's envelope-axis substrate might drift if shared during construction. Deeper inspection of v1's substrate files (`workflow-types.ts`, `hash.ts`, `source.ts`, `epistemic-brand.ts`, total 1133 LOC) showed they are Phase-0a/b/c/d complete and load-bearing, and that the workshop infrastructure (seven-visitor metric tree, scorecard with history, trust policy, convergence-proof harness) is running production today. Building a sibling meant either (a) duplicating a meticulous substrate and a running workshop, or (b) importing them across the seam and accepting drift anyway. The compartmentalization move does neither — it makes the seam explicit and the substrate stays where it is, with its existing doctrine preserved.

**Why not separate repositories:** the three folders will continue to share the envelope-axis phantom types, the fingerprint tag registry, and the governance brands. Cross-repo coordination of those shared types adds friction without buying meaningful isolation. A folder split in one repo with a compile-enforced seam is the minimum mechanism that delivers the agent-discovery payoff.

**Build harness:** `package.json` scripts gain per-folder targets (`build:product`, `build:workshop`, `build:dashboard`) alongside the aggregate `build`. `tsconfig.json` references all three folders through project references. CI runs each folder's tests. The architecture test that enforces the import seam runs in `product/`'s test suite (since any violation originates in a file under `workshop/` or `dashboard/` trying to reach into `product/`).

### 2.2 In-place evolution: v1 does not stop running

**Decision:** v1 does not freeze. The workshop infrastructure continues running throughout the construction order — running speedrun verbs, appending to the scorecard history, enforcing the trust policy, producing convergence verdicts. What happens during Steps 0–10 is a targeted reshape of the existing tree, not a parallel-build cutover.

**Why this is possible:** the workshop runs against v1's existing `lib/` today. Step 0 moves files but preserves behavior; the workshop keeps reading its run-record log, its scorecard history keeps accumulating, the trust policy keeps gating. The probe IR (introduced at Step 5) changes the workshop's *input* from handwritten dogfood scenarios to manifest-derived probes, but does not change its *machinery*.

**What does retire:** the reference-canon transitional slot (Step 1 — the type-level source union contracts from six to five variants), the dogfood content tree, the `dogfood/`-vs-root `createProjectPaths` split, and the scenario-corpus 10000/20000 partition. These retire on their own commit with named mechanics; see `v2-direction.md §4B` for the full list.

**What does not retire:** the seven-visitor metric tree, the scorecard history, the trust policy YAML, the convergence-proof harness, the speedrun four-verb orchestration, the file-backed decision bridge. These port forward in place — most with no logic changes; some (the metric tree) subject to per-visitor audit.

**Team capacity:** no "one engineer holds the v1 lane" constraint. The team works in one tree. What distributes work is the folder split: a contributor or agent can pick up a lane inside one folder without negotiating the other two. Parallelism is structural (one folder at a time per contributor), not temporal (no freeze/thaw choreography).

### 2.3 File movement mechanics — one atomic reshape at Step 0

**Decision:** every file in `lib/` moves to its destination folder in a single atomic commit (Step 0 per `v2-direction.md §6`). The per-file destinations come from the salvage audit at §13 of this document (pending revision to a three-folder destination table).

**Mechanism:**

- **Group A — envelope-axis substrate and governance brands.** `workflow-types.ts`, `hash.ts`, `source.ts`, `epistemic-brand.ts` → `product/domain/`. Architecture law 8 → `product/tests/architecture/`. No logic changes. Phases B–E of the envelope-axis refactor continue landing in place as needed after Step 0.
- **Group B — L0 data-flow chain.** ADO adapter, Playwright adapters, navigation strategy, codegen, runtime widgets → `product/instruments/` and `product/runtime/` per §3.2 of the direction doc. Shape adjustments (ladder reorder, idempotence check, four-family error classification, pre-generated facade) land at Step 4, not Step 0 — Step 0 is structural only.
- **Group C — workshop infrastructure.** Speedrun orchestration, seven-visitor metric tree, scorecard code and YAML, convergence-proof harness, trust-policy gate, improvement ledger → `workshop/`. Subdirectories by concern: `workshop/orchestration/`, `workshop/metrics/`, `workshop/scorecard/`, `workshop/convergence/`, `workshop/policy/`, `workshop/ledger/`. No code logic changes at Step 0.
- **Group D — dashboard + MCP.** Dashboard MCP server, HTTP bridge, file-backed decision bridge watcher → `dashboard/`. The writer side of the decision bridge migrates to `product/instruments/handshake/`.
- **Group E — InterventionHandoff shape.** `lib/domain/handshake/intervention.ts` → `product/domain/handshake/`. The adaptation that makes the handoff required on every agentic decision lands separately (likely Step 4 or earlier, as the shape adjustments are small).
- **Group F — reference-canon content.** Deleted at Step 1 (not moved). Mechanism in `v2-direction.md §4B`.

**The seam-enforcement test** lands as part of Step 0's test suite additions: an architecture law forbidding `workshop/` or `dashboard/` from importing `product/` except through manifest-declared verbs and the shared log set.

### 2.4 Team continuity and the agent's role

**Decision:** construction work lands on the current feature branch (`claude/review-v2-architecture-fEH5v` at the time of this revision); Step 0's atomic reshape merges to `main` as one commit once reviewed. After Step 0, subsequent steps land as individual PRs that each respect the folder seam.

**Where the agent works:** the agent works across all three folders but in one folder per session. A session opens `product/README.md`, `workshop/README.md`, or `dashboard/README.md` and orients from there. From Step 5 onward, every substantive change the agent proposes in any folder carries a hypothesis: "this change will move `metric-X` by direction D, magnitude M." The hypothesis lands in the proposal log (`kind: hypothesis`), gets operator review, and produces a verification receipt on the next workshop run.

**Review discipline:** every PR declares its folder (`product/`, `workshop/`, or `dashboard/`) and respects the seam. Review checks four things: (a) does the change match its hypothesis design; (b) does the receipt corroborate the predicted delta; (c) does the change respect the ten invariants from `v2-substrate.md §4`; (d) does the change stay within its declared folder. If any of the four fails, the PR does not merge.

**Agent self-proposal:** the workshop is running from Step 0 forward, so the agent can read the receipt log and scorecard history and propose follow-up hypotheses at any time. The Step 5 inflection earlier drafts named (where agent autonomy shifts from directed to partially self-proposing) retires — self-proposal discipline is on from the start, with proposal-gated reversibility as the safety net.

### 2.5 Graduation, not cut-over

**Decision:** there is no cut-over commit. v2 graduates rather than cuts over. Graduation has two components:

- **`product/` graduation.** `product/` is customer-facing today in the sense that its shipping surface (manifest + facet catalog + tests) is what the agent emits when authoring. The graduation gate is the shipping-claim gate: customer QA accepts tests `product/` authored, `metric-test-acceptance-rate` sustains above floor, `metric-authoring-time-p50` sustains below ceiling. At that point `product/` is shippable as a standalone package, and the workshop is not required to ship with it.
- **`workshop/` graduation.** `workshop/` graduates when probe coverage reaches 100% against the manifest and the batting average (`metric-hypothesis-confirmation-rate`) sustains above floor. At that point the workshop's active role is done — it degrades to a passive alarm running the same probes on schedule. If `product/` changes, new probes appear automatically; the workshop re-engages until coverage returns to 100%.

**Why this is better than a cut-over:** graduation is a natural consequence of the probe IR. Cut-overs are risk events that compress many decisions into one commit and defer operational learning until after the event. Graduations are continuous — the workshop gets quieter as it runs out of things to measure against a steady-state surface, and the team learns its floor-sustaining discipline while the workshop is still active.

**Why no metric-floor cut-over commit:** the cut-over metrics earlier drafts named (acceptance rate ≥ 0.85, authoring time ≤ 45 min, confirmation rate ≥ 0.70) stay as product and workshop graduation floors. What changes is that they do not trigger a single atomic event; they gate whether `product/` can be packaged and distributed without `workshop/`, and whether `workshop/` degrades to passive mode. Each is a continuous decision reviewed per release.

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

**Saga 13 — `compareEvaluations`.** The workshop's diff tool. Given two evaluation summaries from the evaluation log (most often: the one before a code change landed and the one after), produces a typed delta report — which metrics moved, which run records appeared or disappeared, what the code-version and testbed-version deltas were. The workshop's bread-and-butter operation when reasoning about whether a change paid off; the runtime correlate of `git diff` for v2 itself.

```ts
const compareEvaluations = (older: EvaluationId, newer: EvaluationId) =>
  Effect.gen(function* () {
    // ─── Truth highway: read both summaries ──────────────────
    const olderEval = yield* EvaluationLog.read(older);
    const newerEval = yield* EvaluationLog.read(newer);

    // ─── Truth highway: compute every metric's delta in parallel ─
    const metricDeltas = yield* Effect.all(
      ManifestRegistry.declaredMetrics().map((metric) =>
        Effect.gen(function* () {
          const olderValue = yield* MetricCompute.fromEvaluation(metric, olderEval);
          const newerValue = yield* MetricCompute.fromEvaluation(metric, newerEval);
          return {
            metric,
            older:     olderValue,
            newer:     newerValue,
            delta:     newerValue - olderValue,
            direction: directionOf(newerValue - olderValue),
          };
        })
      ),
      { concurrency: "unbounded" }
    );

    // ─── Set diffs over the run-record cohorts ───────────────
    const newRunRecords     = newerEval.runRecordIds.filter((id) => !olderEval.runRecordIds.includes(id));
    const removedRunRecords = olderEval.runRecordIds.filter((id) => !newerEval.runRecordIds.includes(id));
    const sharedRunRecords  = olderEval.runRecordIds.filter((id) => newerEval.runRecordIds.includes(id));

    // ─── Build the report; append to ComparisonLog for audit ──
    const report = {
      from:               older,
      to:                 newer,
      computedAt:         yield* Clock.now,
      metricDeltas,
      newRunRecords,
      removedRunRecords,
      sharedRunRecords,
      codeVersionDelta:   { from: olderEval.codeVersion,    to: newerEval.codeVersion },
      testbedVersionDelta:{ from: olderEval.testbedVersion, to: newerEval.testbedVersion },
    };

    yield* ComparisonLog.append(report);
    return report;
  }).pipe(
    Effect.catchTag("EvaluationNotFoundError", () => failFast),
    Effect.catchTag("MetricComputeError",      () => surfaceErrorToOperator),
    Effect.withSpan("compareEvaluations", {
      attributes: { from: String(older), to: String(newer) },
    })
  );
```

The saga has two consumers. The team uses it directly to answer "did this change actually move the metric?" — the answer is in the delta report. `verifyHypothesis` (Saga 11) implicitly composes the same shape but for one metric only; `compareEvaluations` produces the full N-metric picture across two evaluations. The agent uses it as part of `proposeHypothesis` (Saga 9) when reasoning about which hypotheses to propose next — reading recent comparison reports tells the agent which hypothesis-shaped changes have been working historically.

The append to `ComparisonLog` is what makes this a saga rather than a CLI utility: every comparison the team runs is durable, queryable, and linkable from receipts. A reviewer auditing v2's evolution can walk back through the comparison log and see every "did this change pay off?" question the team ever asked.

**Saga 14 — `dashboardSnapshot`.** The dashboard plug-in. Composes read-only queries across the entire system into one typed snapshot artifact for an external dashboard UI to render. The default dashboard model in v2 is *external*: an HTML/SPA UI reads the snapshot file (or polls v2 for it) and renders. v2 doesn't ship a dashboard server; it ships the snapshot the dashboard renders.

```ts
const dashboardSnapshot = Effect.gen(function* () {
  // ─── Truth highway: latest evaluation + batting average ──
  const latestEval         = yield* EvaluationLog.latest;
  const battingAverage     = yield* MetricCompute.computeMetric("metric-hypothesis-confirmation-rate");
  const recentMetricTrends = yield* Effect.all(
    ManifestRegistry.declaredMetrics().map((m) => MetricCompute.recentTrend(m, { windowDays: 7 })),
    { concurrency: "unbounded" }
  );

  // ─── Truth highway: pending review counts ─────────────────
  const pendingProposals = yield* ProposalLog.pendingCount();
  const pendingHandoffs  = yield* HandoffQueue.pendingCount();

  // ─── Memory highway: catalog and drift signals ───────────
  const facetCount         = yield* FacetStore.count();
  const recentDriftCount   = yield* DriftLog.countSince({ hours: 24 });
  const lowConfidenceFacetCount = yield* FacetStore.countWithConfidenceBelow(0.5);

  // ─── Truth highway: latest run + session activity ────────
  const lastRunRecord  = yield* RunRecordLog.latest;
  const activeSessions = yield* SessionReceipt.activeCount();

  // ─── Verb + Reasoning highway: provider and verb status ──
  const reasoningProvider = yield* Reasoning.providerId;
  const manifestVersion   = yield* ManifestRegistry.currentVersion;

  // ─── Compose the typed snapshot artifact ─────────────────
  const snapshot = {
    timestamp:       yield* Clock.now,
    codeVersion:     yield* CodeVersion.current,
    manifestVersion,
    reasoningProvider,
    latestEvaluation:    latestEval,
    battingAverage,
    recentMetricTrends,
    pending: {
      proposals: pendingProposals,
      handoffs:  pendingHandoffs,
    },
    memory: {
      facetCount,
      recentDriftCount,
      lowConfidenceFacetCount,
    },
    runtime: {
      lastRunRecord,
      activeSessions,
    },
  };

  // ─── Write the snapshot to the agreed dashboard path ─────
  yield* DashboardSnapshot.write(snapshot);
  return snapshot;
}).pipe(
  Effect.catchTag("MetricComputeError", () => skipMetricAndContinue),
  Effect.catchTag("EvaluationLogEmptyError", () => emitEmptySnapshot),
  Effect.withSpan("dashboardSnapshot")
);
```

Three uses of the snapshot, all by external consumers:

- **Static dashboard UI.** The snapshot file (`./.v2/dashboard-snapshot.json`) is read by an HTML page or an editor extension; the page renders metric trends, pending counts, and the active-session list.
- **Polling refresh.** A dashboard scheduling a `v2 dashboard-snapshot` invocation every 30 seconds keeps a near-real-time view without v2 hosting any HTTP server.
- **Real-time push (advanced).** A dashboard process can subscribe to v2's append-only logs directly via `Stream` (per the §10.5 patterns); the snapshot is then a backstop for first-paint and for clients that don't subscribe.

The saga doesn't include UI rendering, server logic, or transport. v2 produces; the dashboard consumes; the boundary between them is the snapshot artifact. Any dashboard implementation — terminal-based, web-based, embedded in an IDE, posted to a Slack channel — composes from the same snapshot.

This is the workshop's *windshield* — the single object the team and the agent look at to know v2's current state. Without it, knowing v2's state requires reading multiple log files and computing aggregates manually. With it, one read returns one typed value.

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

**The saga set is closed.** The fifteen sagas above — `authorTest` (the flagship), plus the fourteen-saga gallery — are the whole of v2's runtime behavior. Every action v2 takes, at any phase of its life, composes these sagas or sub-sagas thereof. Adding a new capability means adding to the set with the same structural discipline; changing a capability means evolving a saga under the proposal-gated hypothesis loop. The closed set is the claim: v2 does nothing that does not fall into one of these braided paths.

The shape of the fifteen, by relationship to the highways and to the parallel work streams of §3:

| # | Saga | Trigger | Primary highways | Phase 3 streams it integrates |
|---|---|---|---|---|
| 0 | `authorTest` | per work item (CLI `v2 author`) | all six | intent + observation + interact + nav + compose + execute |
| 1 | `onboardSession` | every session start | Verb (then implicit on every other) | manifest read + fluency check |
| 2 | `growMemoryForStep` | sub-saga in `authorTest` on facet-miss | World → Memory | observation + locator ladder + facet mint |
| 3 | `absorbOperatorInput` | operator action (CLI `v2 absorb`) | Reasoning → Memory | dialog/document → candidate review |
| 4 | `respondToDrift` | sub-saga in `authorTest` on memory-vs-world mismatch | Memory + Truth (+ Reasoning if ambiguous) | drift emit + classification + handoff |
| 5 | `proposeRefinements` | scheduled (in `maintenanceCycle`) | Memory → Reasoning → Truth | maintenance signals → revision proposals |
| 6 | `applyApprovedProposal` | operator action (CLI `v2 approve`) | Memory or Truth, by kind | proposal lifecycle → catalog write |
| 7 | `recordProposalRejection` | operator action (CLI `v2 reject`) | Truth | proposal lifecycle → rejection log |
| 8 | `applyHandoffDecision` | operator or agent action (CLI `v2 decide`) | Memory + Truth | handoff queue → resolution log |
| 9 | `proposeHypothesis` | agent self-driven (CLI `v2 propose-hypothesis`) | Truth → Memory → Reasoning → Truth | receipt history → hypothesis log |
| 10 | `evaluateTestbed` | manual or scheduled (CLI `v2 evaluate`) | all six (via `authorTest`) | testbed adapter + metric verbs |
| 11 | `verifyHypothesis` | after hypothesis-carrying change lands (CLI `v2 verify`) | Truth | metric delta → verification receipt |
| 12 | `maintenanceCycle` | `Schedule.fixed("1 hour")` daemon (CLI `v2 maintain`) | Memory | confidence age + corroborate + refine |
| 13 | `compareEvaluations` | operator/agent action (CLI `v2 compare`) | Truth | evaluation log → comparison report |
| 14 | `dashboardSnapshot` | scheduled or on-demand (CLI `v2 dashboard-snapshot`) | all six (read-only) | every log → snapshot artifact |

The fourteen gallery sagas close every gap the prior five v2 docs imply: the six canonical agent flows from `feature-ontology-v2.md §8.1` (onboard, author, grow memory, absorb operator, respond to drift, propose refinement) plus the measurement substrate from `v2-direction.md §5` (evaluate, verify, propose hypothesis, maintenance) plus the operator-review surfaces (approve, reject, decide handoffs) plus the workshop instruments (compare evaluations, dashboard snapshot). Every parallel work stream from §3 of this document is integrated into one of the sagas (rightmost column); every CLI verb maps to exactly one saga; every saga's typed error channel routes through `catchTag` at its boundary; every saga's trace span surfaces in the observability layer.

What this set does *not* contain is also a claim — v2 does not have:

- A "main loop" that runs continuously and decides what to do next. The agent makes that decision via Reasoning; sessions are bounded, not perpetual.
- A "self-modifying" saga that rewrites code without operator review. Hypothesis proposals require approval.
- A "dashboard server" saga. Dashboards are external consumers of `dashboardSnapshot` and the append-only logs.
- A "session resume" saga. Sessions are atomic-or-fail; a killed session restarts from `onboardSession`, not from a checkpoint.
- A "configuration change" saga. Provider, thresholds, and Layer choices are environment / config; changing them means restarting.

Each absence is a deliberate constraint. Adding any of them would expand the surface; the gallery's closure is what keeps v2 small enough to be a cathedral and not a sprawl.

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

Seven subsections:
- **§11.1** the Layer cake — every port wired once.
- **§11.2** the entry point — `main` as saga dispatcher.
- **§11.3** invocation modes — what the CLI accepts.
- **§11.4** the fiber tree — session scope, daemons, shutdown.
- **§11.5** observability — every saga is its own span.
- **§11.6** the shape of an actual run — one CLI invocation traced.
- **§11.7** the harvesting flywheel — iterative hardening across sessions.

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
  | { kind: "compare";            from: EvaluationId; to: EvaluationId }
  | { kind: "dashboard-snapshot" }
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
      Match.tag("compare",            ({ from, to })              => compareEvaluations(from, to)),
      Match.tag("dashboard-snapshot", ()                          => dashboardSnapshot),
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

    compare: Command.make({
      from: Options.text("from").pipe(Options.withDescription("evaluation id (older)")),
      to:   Options.text("to").pipe(Options.withDescription("evaluation id (newer)")),
    }, ({ from, to }) => ({
      kind: "compare" as const,
      from: EvaluationId.parse(from),
      to:   EvaluationId.parse(to),
    })),

    dashboardSnapshot: Command.make({}, () => ({
      kind: "dashboard-snapshot" as const,
    })),

    maintain: Command.make({
      once: Options.boolean("once").pipe(Options.withDefault(false)),
    }, ({ once }) => ({
      kind: "maintain" as const,
      once,
    })),
  });
```

Eleven verbs, mapped to real commands:

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
| `v2 compare --from=eval-101 --to=eval-118` | Diff two evaluation summaries; produce a delta report | `compareEvaluations` | after any meaningful change has produced a new evaluation |
| `v2 dashboard-snapshot` | Compose current state across all logs into one snapshot artifact | `dashboardSnapshot` | scheduled (every 30s for live dashboards) or on-demand for static views |
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

### 11.7 The harvesting flywheel — iterative hardening across sessions

§11.6 traced one session. This subsection traces the cycle the team and the agent execute *across many sessions* — the workshop's iterative-hardening loop, where each turn produces evidence that hardens v2's outcome over time. It is not a single Effect program; it is a multi-session composition in which existing sagas play their parts at different moments.

The flywheel has six turns, each producing a specific kind of hardening. Read each turn as "what happened?" plus "which saga did it?" plus "what's now harder than it was before?"

**Turn 1 — Authoring produces evidence.**
- *What happened.* The agent authors a test against a real ADO work item (`v2 author --source=ado:N`) or a synthetic testbed item. Some facets are queried from memory; some are minted; the test runs; the run record appends.
- *Sagas in play.* `onboardSession` → `authorTest` → `growMemoryForStep` (when memory misses) → on pass, `Corroborate.append` runs against referenced facets; on fail-with-mismatch, `respondToDrift` runs.
- *Hardened.* The catalog now has *more facets* (newly minted) or *more evidence on existing facets* (corroboration appended). Confidence on referenced facets either rises (corroboration) or falls (drift). Locator health gets one more outcome per strategy used. Nothing has been *promoted* yet — the catalog grew, but hardening hasn't fired.

**Turn 2 — Maintenance ages and corroborates.**
- *What happened.* On the next maintenance tick (`v2 maintain --once` or the `maintenanceDaemon`), confidence ages on uncorroborated facets, recent passing runs corroborate their referenced facets in batch, and `proposeRefinements` synthesizes revision proposals from accumulated drift events plus decay plus corroboration.
- *Sagas in play.* `maintenanceTick` → `ConfidenceAge.run` → `Corroborate.fromRun × N` → `proposeRefinements` → `Reasoning.synthesizeRevision` → `ProposalLog.append(kind: revision)`.
- *Hardened.* Stale facets have *lower confidence*; corroborated facets have *higher confidence*. New revision proposals sit in the queue, each citing the evidence that motivated them.

**Turn 3 — Operator review surfaces decisions.**
- *What happened.* The operator (or an external dashboard the operator drives) inspects the proposal queue. Each proposal carries cited evidence and a rationale; the operator decides accept or reject for each. Pending handoffs from prior sessions surface in the same review pass.
- *Sagas in play.* `applyApprovedProposal` for accepts; `recordProposalRejection` for rejects; `applyHandoffDecision` for handoffs. All three invoked from the operator's review tool, which is itself just a CLI client of v2's verbs.
- *Hardened.* The catalog gains *operator-blessed revisions*. The proposal log records *operator-blessed rejections* with rationale (which conditions future proposals away from the same dead end). Pending handoffs are *resolved into memory*, so the next authoring attempt at the same situation finds the choice already made.

**Turn 4 — Evaluation re-grounds the metrics.**
- *What happened.* Either scheduled or operator-triggered, an evaluation runs against the current testbed version. Every metric verb computes from run records produced under the new (post-Turn-3) catalog state. The evaluation summary appends to the evaluation log.
- *Sagas in play.* `evaluateTestbed` → fan-out of `authorTest` over the testbed → `Effect.all` of metric computations → `EvaluationLog.append`.
- *Hardened.* The metric trajectory now includes a *post-revision data point*. The team can ask: "did the revisions help?" — but until Turn 5, that question doesn't have a typed answer.

**Turn 5 — Comparison answers the question.**
- *What happened.* The team (or the agent autonomously) runs `compareEvaluations(previousEvalId, latestEvalId)`. The delta report shows which metrics moved, which run records appeared/disappeared, what the catalog and code-version deltas were.
- *Sagas in play.* `compareEvaluations` → `Effect.all` of per-metric deltas → `ComparisonLog.append`.
- *Hardened.* The team and agent now *know* whether Turn 3's revisions paid off. The comparison log gains a typed verdict tying revisions to outcomes.

**Turn 6 — The agent proposes the next change.**
- *What happened.* The agent reads the receipt log and the comparison log; it sees what's worked and what hasn't; it proposes a hypothesis — a code change with a predicted metric delta — that aims to harden whatever the comparison revealed as the weakest link.
- *Sagas in play.* `proposeHypothesis` → reads `ReceiptLog.recent` + `MetricCompute.snapshot` + `MemoryHealthSnapshot` + `ProposalLog.rejectedHypothesesIn` → `Reasoning.proposeHypothesis` → `ProposalLog.append(kind: hypothesis)`.
- *Hardened.* A new hypothesis sits in the proposal queue, *citing the comparison evidence* that motivated it. The next operator review (Turn 3 of the next cycle) will weigh it.

The cycle returns to Turn 1: if the operator approves the hypothesis, a code change lands, and the next authoring run produces evidence under the changed code. Each turn through the flywheel hardens something specific:

| Turn | What hardens | Where it shows |
|---|---|---|
| 1 | The catalog (more facets, more evidence) | `FacetStore` + `EvidenceLog` |
| 2 | Confidence (aged or boosted) + revision proposals | `EvidenceLog` derivation + `ProposalLog` |
| 3 | Operator-approved revisions + handoff resolutions | Catalog write + `HandoffResolutionLog` |
| 4 | Metric trajectory updated post-revision | `EvaluationLog` |
| 5 | Causal claim (revision → metric delta) | `ComparisonLog` |
| 6 | Hypothesis citing causal evidence | `ProposalLog (kind: hypothesis)` |

**The flywheel's reach into existing infrastructure.** None of the six turns introduces new infrastructure. Every turn composes existing sagas; every saga writes to existing append-only logs; every log is read by either a downstream saga in the cycle or by the dashboard snapshot. The dashboard renders the flywheel's state at any point — which proposals are pending, what the latest comparison said, what the batting average is, where in the cycle the team currently sits.

**The dashboard's role in the flywheel.** `dashboardSnapshot` is consulted between turns. The team looks at the dashboard to know what to do next: a high pending-proposals count means Turn 3 is the next move; a stale-evaluation timestamp means Turn 4 is overdue; a low batting-average means Turn 6 should slow down (the agent should propose less and verify more). The dashboard does not drive the flywheel — the team and the agent do — but it is the surface they read to know where they are.

**Why this is the harvesting flow.** Each turn *harvests* something specific from the prior turn's output: Turn 2 harvests evidence into proposals; Turn 3 harvests proposals into approvals; Turn 4 harvests approvals into measured deltas; Turn 5 harvests deltas into causal claims; Turn 6 harvests causal claims into the next proposal. Nothing is wasted; every artifact a turn produces is the input to a subsequent turn. The catalog gets richer; confidence gets calibrated; metrics get sharper; the agent's batting average gets a new data point; the next cycle starts with stronger ground than the last. **This is what "iterative hardening of outcome" means in v2 — a cycle in which every saga has its turn and every turn produces something the next turn consumes.**

The flywheel is closed in the sense that all fifteen sagas have a place in it, and it does not require any additional sagas to operate. New sagas (if they were ever added) would either belong to one of the existing turns or would extend the cycle with a seventh turn — which is itself a kind of structural change the flywheel's metric layer would be asked to verify is worth making.

### 11.8 The closing stanza

Eleven sections. Begun with §1's one-page shape; closing here with the runtime that makes everything in those sections actually run.

The destination, restated for the last time: **v2 is a small agent-facing surface** — a vocabulary manifest, a facet catalog, QA-accepted tests — backed by a measurement substrate that lets the agent improve v2 with the team's review. **The architecture that holds it** is a cathedral of interlocking patterns: DDD bounded contexts, hexagonal ports, clean-architecture dependency direction, FP purity in the domain, Effect for composition, phantom types for compile-time invariants, append-only logs for time, GoF visitor for exhaustive analysis. **The map that lets you move through it** is six highways meeting at five interchanges; every parallel work stream from §3 is a town on a highway; every saga is a braided Effect program walking through specific towns; every saga is reachable from one of six CLI verbs through one `main` providing one `AppLayer`.

**The sequence that gets there** is ten phases, four inflection points, five forcing functions, one cut-over commit fired on a sustained three-metric floor. The plan is not a wish list. It is a route, with explicit gates and explicit reversals.

**The discipline that holds across all of it** is trust, but verify. Every code change carries a hypothesis; every hypothesis verifies against the next evaluation; every receipt appends. Small bets, reviewed, measured, receipted. The batting average is itself a derivation the agent reads. v2 is the system; the system measures itself; the measurement is the system measuring itself with its own primitives.

When `NodeRuntime.runMain(main(parseCli(process.argv)))` runs, all of this — the cathedral, the highways, the towns, the sagas, the runtime composition, the trust-but-verify loop, the agent's inner voice as a port choosing among five providers — is one Effect value being evaluated. One value. One process. One session at a time.

The plan is the route. The architecture is what you build along it. The runtime is what makes the architecture run. The destination is where the customer's QA team accepts the tests. **Execute.**

## 12. Self-governance — how features descend from the map to the towns

§11 closed the architecture with a running process. This section opens it back up, from the perspective of a future agent (or engineer) picking up work without having read the whole plan. The question it answers: *I have a feature idea. What does it take to land it correctly?*

The answer is the descent protocol. Every feature is a vertical slice through the cathedral. It starts at the map and descends through five levels until it lands as executable code. At each level, invariants bind. The author's job is to verify each as they descend, not re-derive them. This section names the levels, the obligations at each, the cohesion laws that govern descent, and the parallelizable feature lanes a team (of agents or humans) can pick up without coordination overhead.

### 12.1 The descent principle

A feature is not a PR. A feature is a commitment at every level of the cathedral. The PR is the last level's artifact. If the upper levels weren't walked, the PR is landing work on sand — the code compiles, but the doctrine drifts.

The principle: **invariants propagate downward; evidence propagates upward**. A decision at the map level (which highway? which interchange?) constrains what can happen at the town level (which module? which verb?). A decision at the town level constrains the saga shape. A decision at the saga shape constrains the runtime composition. At every level, evidence — receipts, tests, metrics — flows back upward to validate or contradict the original map-level decision.

Skipping levels produces the same kind of rot in every system: implementation that satisfies local tests but violates substrate invariants. v2 resists this by making the descent visible. The cohesion laws (§12.3) are what you check at each level before descending further.

### 12.2 The five levels of descent

Every feature descends through five levels. Each level has its own vocabulary, its own questions, its own evidence.

| Level | Artifact | Vocabulary | Questions the author answers | Evidence at completion |
|---|---|---|---|---|
| 1. Substrate | `v2-substrate.md` | Primitives, levels, invariants | Which primitive does this touch? Which level's claim does it help ship? Does it pass the anti-scaffolding gate? | A one-sentence mapping: *(level, primitive, claim)* |
| 2. Feature ontology | `feature-ontology-v2.md` §7 + §9 | Handshakes, technical paths | Which handshake surface does this operate on? Does it fit an existing §9 path, or does it need a new one? | Named handshake + primary-path sketch |
| 3. Town | `v2-transmogrification.md` §10.4 | Modules, verbs, highways | Which town on which highway? Does it add a new verb or compose existing ones? Which invariants at that town still hold? | Named module path + manifest verb name with frozen signature |
| 4. Saga | `v2-transmogrification.md` §10.5 | Effect programs, phantom types | Which saga calls this? Does it need a new saga or extend a composition? Does every yield write a receipt? | Saga sequence written out; receipt discipline verified at each yield |
| 5. Runtime | `v2-transmogrification.md` §11 | Layers, fibers, CLI verbs | Which Layer provides the required service? Does the entry point reach this saga from the CLI? How does it surface in the fiber tree? | Composition added; CLI invocation documented; test passes end-to-end |

The levels are not optional. A feature whose author stopped at Level 3 produces code that works but drifts from the saga shape the runtime expects. A feature whose author jumped from Level 1 to Level 5 produces runtime wiring for a primitive that doesn't yet have a handshake.

**The one-page test.** At the end of the descent, the feature should fit on one page: *(level, primitive, claim)* + *named handshake* + *town + verb name* + *saga sequence* + *Layer + CLI surface*. If it doesn't fit on one page, either the feature is too large (decompose) or the author skipped a level (descend again).

### 12.3 The cohesion laws

Twelve laws descend automatically from the substrate's ten invariants into concrete implementation requirements. An author who follows the descent protocol without checking the laws will still break the substrate; the laws are the per-level translation of the invariants into things the code must look like.

1. **Every new capability is a new verb.** (Invariant 1.) Adding a boolean flag to an existing verb is forbidden. The manifest-generator build check catches this; the author should catch it first.
2. **Every manifest verb has a frozen signature from the moment it is published.** (Invariant 1.) Extension happens by adding new verbs, not by widening old ones.
3. **Every agent-observable state change emits a receipt before the observing code can consume the result.** (Invariants 3 + 5.) A saga that yields and then reads the result without appending a receipt is a silent escalation.
4. **Every receipt names its caller, its timestamp, and its inputs at least by fingerprint.** (Invariant 2.) Provenance is minted at the event, not reconstructed later.
5. **Every cross-seam artifact carries an envelope with the four phantom axes (Stage × Source × Verdict × Fingerprint).** The compiler refuses otherwise; the author should not need to think about it, but occasionally the compiler's message is opaque — the law says: look at the axes first.
6. **Every agent decision site produces an `InterventionHandoff` shape.** (Invariant 10.) No `throw` as escape. The handoff precedes the choice; the choice records back against it.
7. **Every reasoning call produces a reasoning-receipt before returning.** The receipt's durability precedes the choice's visibility to the saga. Provider-specific errors classify into the named families.
8. **Every append-only log is written by an adapter that refuses in-place updates.** (Invariant 3.) The adapter, not the caller, enforces this.
9. **Every source vocabulary survives the inbound path as-is.** (Invariant 7.) Paraphrasing at the seam — even for brevity — is forbidden; preserved source text goes into provenance, paraphrases go into derivations.
10. **Every governance verdict dispatches through `foldGovernance`, never through string comparison.** Architecture law 8 is a running test; the author should never need it to catch them.
11. **Every exhaustive fold over a sum type is a `fold<X>` helper that causes a compile error on new variants.** When adding a new case, the compile error is the TODO list.
12. **Every saga's yields are auditable: which verb, which receipt, which fingerprint, which error family.** A saga that yields without a receipt is ungoverned; a saga with a receipt but no named error family is ungoverned under failure.

The laws are not twelve separate concerns. They are twelve views of the same commitment: **the doctrine descends, and descent makes governance automatic**. An author who checks the laws at each descent level ships features that slot into the cathedral without rework.

### 12.4 The pre-flight checklist

Before committing a feature, the author runs this checklist. It is short because the descent did the heavy lifting. Each question has a one-place-to-check answer; none requires re-reading the cathedral.

**Substrate level (Level 1):**
- [ ] Named the primitive this feature operates on (agent, intent, world, instruments, memory)?
- [ ] Named the level whose claim this feature helps ship (L0 through L4)?
- [ ] Passes the anti-scaffolding gate (substrate §6)?

**Feature ontology level (Level 2):**
- [ ] Identified the handshake in `feature-ontology-v2.md` §7 this feature affects?
- [ ] Either a new §9 technical path is drafted, or an existing one is extended with a named section?

**Town level (Level 3):**
- [ ] Named the module path (`lib-v2/<bounded-context>/...`)?
- [ ] Named the new verb (with frozen signature and error families) or the extension surface on an existing verb?
- [ ] Identified the highway this verb traffics on (Intent, World, Memory, Verb, Reasoning, Truth)?

**Saga level (Level 4):**
- [ ] Named the saga(s) that call this verb (or a new saga is declared with a composition sketch)?
- [ ] Each yield writes a receipt? (Checked by reading the saga code, not by running it.)
- [ ] Every failure mode classifies into a named error family?
- [ ] Reversibility class selected (self-reversing, proposal-gated, review-gated, hard-gated)?

**Runtime level (Level 5):**
- [ ] Layer in the Layer cake that provides the required service is named?
- [ ] CLI verb (or daemon) that reaches the saga is declared?
- [ ] End-to-end test passes against the testbed?

**Cohesion laws:**
- [ ] All twelve laws (§12.3) hold for this feature's code?

**Measurement substrate:**
- [ ] Testbed increment committed (new YAML under `testbed/v<N>/`)?
- [ ] Hypothesis receipt logged (predicted delta named against a metric verb)?
- [ ] After this feature lands, the next evaluation run either corroborates or contradicts the hypothesis; the receipt stacks.

If any checkbox is unchecked, the feature is not ready to commit. The checklist is not a bureaucracy; it is the descent protocol written out.

### 12.5 The parallelizable feature backlog

§4 named five parallel tracks across the ten phases. This section names the finer-grained lanes within and across those tracks — lanes a future agent can pick up with clear handoff contracts. Every lane is a sub-feature of its parent track; every lane has explicit dependencies, an explicit deliverable, and an explicit post-condition that unblocks downstream work.

The backlog is living. As phases complete, lanes retire. As phases open, lanes light up. The lanes below are the *current* parallelizable work; future maintainers should extend this section, not replace it.

#### 12.5.1 Lane shape

Every lane has the same six-field shape:

```
Lane: <name>
Track: <A | B | C | D | E>         (from §4.3)
Phase window: <phase or span>
Depends on: <hard deps>
Soft depends on: <soft deps>
Deliverable: <what artifact the lane produces>
Handoff contract: <what downstream lanes can assume true when this lane finishes>
```

Lanes are pickable independently — a new agent starting a session can read the lane card and know what to ship and what to leave alone.

#### 12.5.2 Phase 0–2 lanes (structural setup)

**Lane A1 — Envelope substrate port.**
- Track: A. Phase window: 0. Depends on: none. Soft-depends on: nothing.
- Deliverable: `lib-v2/domain/governance/workflow-types.ts`, `lib-v2/domain/kernel/hash.ts`, `lib-v2/domain/pipeline/source.ts`, `lib-v2/domain/handshake/epistemic-brand.ts` ported from v1; architecture law 8 running.
- Handoff: every subsequent lane can `import` the four substrate modules and rely on their types. The phantom axes are available; governance dispatch through `foldGovernance` is enforceable.

**Lane A2 — Reasoning port declaration.**
- Track: A. Phase window: 0. Depends on: A1. Soft-depends on: nothing.
- Deliverable: `lib-v2/domain/ports/reasoning.ts` (Context.Tag, operation signatures, named error families). Manifest entries for `reason-select`, `reason-interpret`, `reason-synthesize` declared with frozen signatures.
- Handoff: every saga that needs cognition yields from `Reasoning.Tag`; adapters land in Phase 3 without disturbing saga code.

**Lane A3 — Manifest generator build step.**
- Track: A. Phase window: 1. Depends on: A1. Soft-depends on: A2.
- Deliverable: build step that emits `manifest.json` from code-declared verbs; drift check that fails the build on non-additive manifest changes; canonical-task fluency fixture (one per declared verb at Phase 1).
- Handoff: every subsequent verb-declaration lane triggers a manifest update automatically; breaking a signature breaks the build.

**Lane A4 — Facet schema + YAML store.**
- Track: A. Phase window: 2. Depends on: A1. Soft-depends on: nothing.
- Deliverable: unified facet record types; kind-specific extensions; per-screen YAML storage with atomic temp-rename writes; in-memory index on load.
- Handoff: L0 data-flow chain lanes (B1–B7) can mint and query facets via the typed interface without knowing storage details.

#### 12.5.3 Phase 3 lanes (L0 instruments, the largest parallelization win)

The seven L0 instruments can each be picked up by a separate agent with minimal coordination once Lanes A1–A4 land. This is the single largest wall-time win in the construction order.

**Lane B1 — ADO intent-fetch + intent-parse.**
- Track: B. Phase window: 3. Depends on: A1, A3.
- Deliverable: verbs behind `IntentSource.Tag`; source provenance preserved; REST v7.1 client; XML step tokenization.
- Handoff: authoring saga can pull work items via `yield* IntentSource` with parsed intent plus source-text provenance.

**Lane B2 — Playwright navigate.**
- Track: B. Phase window: 3. Depends on: A1, A3.
- Deliverable: `navigate` verb with `page.url()` idempotence check; `{ reachedUrl, status, timingMs }` envelope; classified failure families.
- Handoff: world-reach available; sagas yielding navigate get deterministic envelopes.

**Lane B3 — Playwright observe.**
- Track: B. Phase window: 3. Depends on: A1, A3, A4.
- Deliverable: `observe` verb emitting timestamped snapshots; ladder resolution with v2 order (role → label → placeholder → text → test-id → css); observation-receipt append.
- Handoff: facet-mint candidates flow from observations; ladder changes are one-file edits.

**Lane B4 — Playwright interact.**
- Track: B. Phase window: 3. Depends on: A1, A3.
- Deliverable: `interact` verb with four-family error classification (`not-visible`, `not-enabled`, `timeout`, `assertion-like`); precondition checks.
- Handoff: action dispatch governed; failure families are enumerable at every callsite.

**Lane B5 — Test compose (AST-backed emitter).**
- Track: B. Phase window: 3. Depends on: A1, A3, A4.
- Deliverable: TypeScript AST emission producing Playwright tests referencing per-screen facades; no inline selectors; facade regeneration on catalog change.
- Handoff: authoring saga produces QA-legible tests; catalog updates invalidate generated tests cleanly.

**Lane B6 — Test execute (Playwright runner adapter).**
- Track: B. Phase window: 3. Depends on: A1, A3.
- Deliverable: `test-execute` verb invoking the Playwright CLI with `--reporter=json`; run-record envelope with `classification`; per-step evidence logged.
- Handoff: run-record log fills; downstream memory layer (Phase 6) and measurement substrate (Phase 5) read this log.

**Lane B7 — Reasoning adapter (one provider).**
- Track: B. Phase window: 3. Depends on: A2.
- Deliverable: one working adapter (direct Anthropic or OpenAI) behind `Reasoning.Tag`; reasoning-receipt log; provider-specific error classification into the named families.
- Handoff: sagas that yield from `Reasoning.Tag` resolve against a real model; swapping providers is a `Layer.succeed` change, not a saga change.

Lanes B1 through B7 are concurrent. A seven-engineer (or seven-agent) team collapses Phase 3's wall time to the longest single instrument's implementation.

#### 12.5.4 Phase 5 lanes (measurement substrate)

**Lane D1 — Testbed adapter (testbed:v0).**
- Track: D. Phase window: 5. Depends on: B1 (IntentSource shape).
- Deliverable: adapter that reads `testbed/v<N>/*.yaml` and produces the same parsed-intent shape as ADO; version 0 committed with a handful of deliberately simple work items and known expected outcomes.
- Handoff: `author --source=testbed:v0` runs through the normal authoring flow; no downstream handshake distinguishes testbed from real.

**Lane D2 — First two metric verbs.**
- Track: D. Phase window: 5. Depends on: A3, B6 (run-record log).
- Deliverable: `metric-test-acceptance-rate` and `metric-authoring-time-p50` declared in manifest; pure derivations over the run-record log; metric-compute-record append protocol.
- Handoff: `evaluate` CLI verb produces a token-conservative report the agent consumes; metric history is queryable.

**Lane D3 — Hypothesis-receipt discriminator.**
- Track: D. Phase window: 5. Depends on: existing proposal log primitive.
- Deliverable: `kind: "hypothesis"` variant on proposals; verification-receipt log append shape; `metric-hypothesis-confirmation-rate` declared for later computation.
- Handoff: trust-but-verify cycle is live; every subsequent feature carries a hypothesis; the batting average is a derivation the agent can query.

#### 12.5.5 Phase 6–9 lanes (memory layers, pipelined with measurement)

**Lane E1 — Per-facet evidence log.**
- Track: B/D hybrid. Phase window: 6. Depends on: A4.
- Deliverable: append-only JSONL evidence log per facet; confidence-derivation helper; summary cache invalidated on new evidence.
- Handoff: confidence is derived on read; caching is transparent.

**Lane E2 — Locator-health co-location.**
- Track: B. Phase window: 6. Depends on: E1.
- Deliverable: locator strategies carry per-strategy health; health flows back into facets after each observation or execution.
- Handoff: ladder choice at query time is evidence-backed rather than statically ordered.

**Lane E3 — Dialog capture.**
- Track: B. Phase window: 7. Depends on: A4, candidate-review queue primitive.
- Deliverable: operator chat turn → candidate facets with operator wording preserved as provenance; candidate review queue.
- Handoff: operator-sourced facets enter memory under proposal-gated reversibility.

**Lane E4 — Document ingest.**
- Track: B. Phase window: 7. Depends on: A4.
- Deliverable: shared document (markdown first) → candidate facets with region anchors.
- Handoff: document regions anchor candidate facets; non-DOM semantics enter memory.

**Lane E5 — Drift emit.**
- Track: B. Phase window: 8. Depends on: B6, E1.
- Deliverable: `drift-events.jsonl` append-only log; drift classifier distinguishing product failure from memory-mismatch; per-facet confidence reduction on drift.
- Handoff: drift events feed Phase 9 aging; agent and operator see drift signals at the same seam.

**Lane E6 — DOM-less authoring policy.**
- Track: B. Phase window: 8. Depends on: E1, E5.
- Deliverable: confidence-gated authoring — when memory confidence about a surface exceeds a threshold, author without fresh observation.
- Handoff: authoring throughput rises on known-enough surfaces; drift is the failure mode.

**Lane E7 — Aging / corroboration / revision-propose.**
- Track: B/D. Phase window: 9. Depends on: E1, E5.
- Deliverable: confidence aging over the evidence log; corroboration hook on passing runs; revision-proposal aggregation; `maintenanceCycle` saga running as a daemon.
- Handoff: memory refines between explicit authoring work; proposals flow to operator review under review-gated reversibility.

#### 12.5.6 Cross-phase lanes

**Lane F1 — Testbed growth.**
- Track: D. Phase window: spans 5–9. Depends on: D1.
- Deliverable: each phase commits an incremental testbed version (v0 → v4) with one named increment in verisimilitude (new role, new state, new workflow, new vocabulary variant).
- Handoff: can begin one phase ahead of implementation — the increment is committed, the implementation that makes it relevant lands later. Pipelines serial wall time by ~30–40%.

**Lane F2 — Metric catalog growth.**
- Track: D. Phase window: spans 5–9. Depends on: A3, D2.
- Deliverable: each phase declares one to three new metric verbs; declaration precedes implementation so Phase K ships with its verification hypothesis ready.
- Handoff: the metric catalog grows under proposal-gated review; retired metrics earn deprecation, not deletion.

**Lane F3 — Operator-review UI.**
- Track: outside the main tracks. Phase window: spans 2–9. Depends on: candidate-review queue primitive.
- Deliverable: JSONL queue + CLI is sufficient for construction; richer surfaces emerge only under customer pressure.
- Handoff: independent of other lanes until customer adoption begins; every extension lands as a new verb, not a new review schema.

**Lane F4 — Dashboard plug-in.**
- Track: outside the main tracks. Phase window: spans 5–9. Depends on: A3 (manifest), D2 (metric verbs), B6 (run-record log).
- Deliverable: read-only consumer of run-record, receipt, drift, and proposal logs via manifest verbs; writes nothing to the substrate.
- Handoff: independent of all other lanes because it writes nothing; a dashboard that cannot be rebuilt from the logs is the dashboard's fault, not the substrate's.

#### 12.5.7 Lane internals — the micro-cathedral inside each lane

Every lane is a micro-cathedral. It has its own primary highway, its own internal towns, its own interchanges where traffic changes direction, and a specific set of outbound connections to the six main highways of the full cathedral. This subsection draws that internal map for each major lane. It is what gives the backlog its texture: a lane is not a task, it is a small structured thing that produces structured things.

Every lane-internal map follows the same shape:

- **Primary highway.** Which of the six main highways (§10.1) this lane principally builds.
- **Secondary highways.** Other highways this lane's work touches as a by-product.
- **Internal towns.** The sub-modules inside the lane's own bounded area. These are smaller than the §10.4 town catalog; they are the internal structure of a single lane's deliverable.
- **Internal interchanges.** Where inside the lane one flow hands off to another — error classifications, receipt emissions, fingerprint generation, envelope construction.
- **Manifest exposures.** Which verbs this lane publishes into the vocabulary manifest. These are the lane's public API; everything else is lane-internal and free to refactor.
- **Saga connections.** Which sagas (§10.5) will consume this lane's verbs once the lane ships, and at what step of each saga.
- **Failure topology.** The named error families the lane emits, in order of how common they are in practice. A lane without a failure topology is under-designed.

Read a lane-internal map in any order. The order below is one recommended scan: primary highway first (context), internal towns (structure), manifest exposures (API), saga connections (integration), failure topology (what goes wrong). Internal interchanges are the connective tissue you return to when you want to know *how* data flows from one internal town to another.

##### Lane A1 — Envelope substrate port

**Primary highway:** none — this lane is substrate bedrock (§10.3), under every highway.

**Secondary highways:** all six. Every envelope, every fingerprint, every governance verdict this lane defines is consumed by every downstream lane.

**Internal towns:**

```
A1 micro-cathedral
├── envelope/
│   ├── WorkflowMetadata<Stage>     — base envelope with stage literal
│   ├── WorkflowEnvelope<T, Stage>  — payload-typed wrapper
│   └── envelope-builders            — constructors per stage
├── kernel/
│   ├── stableStringify              — canonical JSON for hashing
│   ├── sha256                       — content-address primitive
│   └── Fingerprint<Tag>             — phantom-tagged hash
├── pipeline/
│   ├── PhaseOutputSource            — source discriminant (no reference-canon)
│   └── foldPhaseOutputSource        — exhaustive source fold
├── handshake/
│   ├── EpistemicallyTyped<T, S>     — observation confidence brand
│   └── foldEpistemicStatus          — exhaustive epistemic fold
└── governance/
    ├── Approved<T> / ReviewRequired<T> / Blocked<T>  — phantom brands
    └── foldGovernance                                 — exhaustive verdict fold
```

**Internal interchanges:** `stableStringify` → `sha256` → `Fingerprint<Tag>` is the canonical hash pipeline; envelope builders read the current stage literal and attach the matching fingerprint tag so downstream code can only consume envelopes whose tag matches their expectation.

**Manifest exposures:** none at this lane. Manifest emission is A3's concern; A1 builds the types A3 will emit against.

**Saga connections:** every saga yields envelopes typed by this lane. No saga imports these modules directly — they are imported by the adapter lanes that build handshakes.

**Failure topology:** none at runtime — A1 is pure types and pure functions. Failures are compile errors: misused phantom tag, missing verdict variant, envelope with wrong stage literal for its call site. Architecture law 8 (running test) catches ad-hoc governance string comparisons that slip past the types.

##### Lane A2 — Reasoning port declaration

**Primary highway:** Reasoning (§10.1).

**Secondary highways:** Verb (manifest entries).

**Internal towns:**

```
A2 micro-cathedral
├── ports/
│   └── reasoning.ts              — Context.Tag + operation signatures
├── reasoning-receipts/
│   ├── ReasoningReceipt<Op>      — typed per operation
│   └── reasoning-receipt-log     — append-only store contract
├── errors/
│   ├── RateLimited / ContextExceeded / MalformedResponse /
│   │   Unavailable / Unclassified   — tagged error union
│   └── foldReasoningError         — exhaustive error fold
└── prompts/
    └── prompt-fingerprint         — stableStringify + sha256 over prompt shape
```

**Internal interchanges:** every Reasoning operation runs through prompt-fingerprint → adapter call → receipt-write → return. The receipt write precedes the return; the saga never sees a choice that isn't already logged.

**Manifest exposures:** `reason-select`, `reason-interpret`, `reason-synthesize`. Signatures frozen at publication; error families enumerated in the manifest.

**Saga connections:** authorTest yields Reasoning at candidate disambiguation (step phrasing, locator choice). absorbOperatorInput yields at dialog interpretation. proposeRefinements yields at synthesis. respondToDrift yields at classification when rules are inconclusive. proposeHypothesis yields at proposal synthesis. Essentially every non-trivial saga connects to this port at least once.

**Failure topology:** `rate-limited` (most common, bounded retry at adapter level → context-handoff at saga level if persistent), `context-exceeded` (less common, triggers handoff immediately), `malformed-response` (rare, one retry with reminder, then error), `unavailable` (rare, circuit-breaker at adapter), `unclassified` (rarest, always surfaces to the saga).

##### Lane A3 — Manifest generator build step

**Primary highway:** Verb (§10.1).

**Secondary highways:** none — the manifest is the Verb highway. Every lane's outbound API lands here.

**Internal towns:**

```
A3 micro-cathedral
├── manifest-schema/
│   ├── VerbEntry                  — name, category, inputs, outputs, errors, version
│   └── Manifest                   — ordered set of VerbEntry
├── emitter/
│   ├── collect-declared-verbs     — scans code for @verb annotations or Context.Tag calls
│   ├── emit-manifest              — writes manifest.json
│   └── drift-check                — compares against committed manifest
├── fluency-fixture/
│   ├── canonical-tasks            — one per declared verb at Phase 1+
│   └── dispatch-harness           — asserts agent routes task → correct verb
└── build-integration/
    └── prebuild-hook              — runs emit + drift-check before tsc
```

**Internal interchanges:** code changes → collect-declared-verbs → emit-manifest → drift-check. If drift is detected and the change is non-additive, build fails before tsc runs.

**Manifest exposures:** none — this lane *produces* the manifest; it does not itself publish verbs.

**Saga connections:** session-start (onboardSession) reads the manifest once; every session has verb fluency before any other yield.

**Failure topology:** `manifest-drift-non-additive` fails the build. `fluency-fixture-failure` fails CI. Neither classifies into runtime error families — both are build-time gates.

##### Lane A4 — Facet schema + YAML store

**Primary highway:** Memory (§10.1).

**Secondary highways:** Verb (query/mint/enrich verbs land in the manifest).

**Internal towns:**

```
A4 micro-cathedral
├── facet-schema/
│   ├── FacetRecord                — id, kind, displayName, aliases, role, scope, …
│   ├── LocatorStrategies          — per-strategy health embedded in facet
│   ├── Provenance                 — mintedAt, instrument, agentSessionId, runId
│   └── kind-extensions            — element / state / vocabulary / route
├── storage/
│   ├── per-screen-yaml            — one file per screen; human-readable
│   ├── atomic-temp-rename         — write via temp + rename for crash safety
│   └── in-memory-index            — loaded once, rebuilt on change
├── id-discipline/
│   ├── stable-id                  — `<screen>:<element-or-concept>`
│   └── id-migration               — renames emit a redirect record
└── query-engine/
    ├── by-intent-phrase           — primary access path
    └── by-id                      — secondary access path
```

**Internal interchanges:** a facet-mint yields a FacetRecord → storage writes atomically → in-memory-index updates → query-engine sees it on the next read. Evidence (E1) connects here but is its own lane.

**Manifest exposures:** `facet-mint`, `facet-query`, `facet-enrich`, `facet-by-id` (rarely used; primary path is by-intent-phrase).

**Saga connections:** growMemoryForStep writes through `facet-mint`. authorTest reads through `facet-query` before every step. applyApprovedProposal updates through `facet-enrich`. applyHandoffDecision may enrich or mint depending on the decision class.

**Failure topology:** `facet-not-found` on query (common, triggers growMemoryForStep sub-saga). `facet-conflict` on mint when an id collision is detected (rare, handoff). `storage-io-error` (rare, retry then surface).

##### Lane B1 — ADO intent-fetch + intent-parse

**Primary highway:** Intent (§10.1).

**Secondary highways:** Verb (manifest entries), Truth (source-provenance seeds run records).

**Internal towns:**

```
B1 micro-cathedral
├── rest-client/
│   ├── ado-rest-http               — PAT auth, retry with backoff, 5xx handling
│   ├── wiql-query-builder          — [System.WorkItemType] = 'Test Case' + filters
│   └── work-item-expand            — GET work item with $expand=fields
├── xml-parser/
│   ├── step-tokenizer              — regex <step> boundaries
│   ├── parameterized-string        — extract action + expected
│   ├── entity-decoder              — &lt; &gt; &quot; &#39; &amp; + CDATA
│   ├── param-extractor             — <param name="..."> from Parameters field
│   └── data-row-extractor          — <Table1> rows from LocalDataSource
├── intent-envelope/
│   ├── WorkItemEnvelope            — carries fields + rev + source-text provenance
│   └── ParsedIntentEnvelope        — ordered actions + expected + parameters
└── source-dispatch/
    └── source-field                — `source: 'ado:<org>/<project>/<id>'`
```

**Internal interchanges:** HTTP 5xx → bounded retry → `transient-fetch-error` or success. XML parse failure with structure intact → degraded parse keeping source text as provenance. XML missing `<parameterizedString>` → expected defaults to empty; no exception fires. The `rev` field is threaded forward so drift detection downstream can distinguish "work item changed upstream" from "world changed."

**Manifest exposures:** `intent-fetch`, `intent-parse`. Polymorphic over `source` — the same verbs serve testbed (Lane D1).

**Saga connections:** authorTest begins with intent-fetch → intent-parse. evaluateTestbed uses the same verbs against `source: testbed:v<N>`.

**Failure topology:** `auth-invalid` (surfaces immediately, no retry), `transient-fetch-error` (retried with backoff, then surfaces), `not-found` (surfaces, 404), `parse-degraded` (returns partial intent with provenance, not an error), `unclassified` (rare).

##### Lane B2 — Playwright navigate

**Primary highway:** World (§10.1, outbound).

**Secondary highways:** Verb, Truth (navigation outcomes append to run records).

**Internal towns:**

```
B2 micro-cathedral
├── browser-lifecycle/
│   ├── context-pool                — one context per session, reused per step
│   └── page-registry               — active pages by scenario id
├── navigation-strategy/
│   ├── waitUntil-selector          — 'load' | 'domcontentloaded' | 'networkidle'
│   ├── url-normalizer              — strips trailing slashes, fragments, query order
│   └── idempotence-check           — if page.url() === target: skip navigate
├── outcome-envelope/
│   └── NavigateEnvelope            — { reachedUrl, status, timingMs, classification }
└── failure-classifier/
    └── to-error-family             — timeout / blocked-redirect / dns-error / unclassified
```

**Internal interchanges:** target → url-normalizer → idempotence-check → (navigate or skip) → outcome envelope. Every navigate emits a navigation-receipt before returning.

**Manifest exposures:** `navigate`. Signature accepts a named place or URL.

**Saga connections:** authorTest yields navigate at session-startup and at cross-screen transitions. evaluateTestbed follows the same pattern.

**Failure topology:** `timeout` (common on slow SUTs, classified and retried once), `blocked-redirect` (auth/consent walls; surfaces a handoff), `dns-error` (config issue, surfaces), `page-crashed` (rare, restart context), `unclassified`.

##### Lane B3 — Playwright observe

**Primary highway:** World (§10.1, inbound).

**Secondary highways:** Memory (observations feed facet-mint), Verb.

**Internal towns:**

```
B3 micro-cathedral
├── aria-snapshot/
│   ├── accessibility-tree          — Playwright's accessibility snapshot API
│   ├── dom-predicate-probe         — domain-level state probes the SUT exposes
│   └── snapshot-envelope           — timestamped + sourceFingerprint
├── ladder-resolver/
│   ├── rung-0-role                 — role + accessible name
│   ├── rung-1-label                — labelled-by, aria-label
│   ├── rung-2-placeholder          — placeholder-based match
│   ├── rung-3-text                 — visible text match
│   ├── rung-4-test-id              — data-testid fallback
│   ├── rung-5-css                  — last-resort CSS selector
│   └── ladder-health-feed          — per-rung usage outcomes → E2
├── observation-receipt/
│   └── append-to-receipt-log       — who observed, when, through what instrument
└── mint-candidate-stream/
    └── candidates-for-facet-mint   — streamed to caller; caller decides whether to mint
```

**Internal interchanges:** browser page → aria-snapshot → ladder-resolver (per affordance) → observation-receipt → snapshot returned. Ladder-resolver emits ladder-health-feed events consumed by Lane E2 at Phase 6.

**Manifest exposures:** `observe`. Returns `Effect<TimestampedSnapshot, ObserveError, PlaywrightAria>`.

**Saga connections:** authorTest yields observe on every screen the agent encounters at L0; at L3 with sufficient memory confidence, observe is skipped (DOM-less authoring policy, Lane E6). growMemoryForStep yields observe when memory lacks a facet.

**Failure topology:** `not-found` (ladder exhausted, common at L0, triggers handoff), `timeout` (SUT slow to render), `page-crashed` (rare), `degraded` (partial snapshot, proceed with caveat in envelope), `unclassified`.

##### Lane B4 — Playwright interact

**Primary highway:** World (§10.1, outbound).

**Secondary highways:** Verb, Memory (interaction outcomes feed locator-health, Lane E2).

**Internal towns:**

```
B4 micro-cathedral
├── affordance-resolver/
│   ├── facet-ref-to-locator        — resolves facet.locatorStrategies at execution time
│   └── preflight-check             — visibility + enabled state before action
├── action-dispatch/
│   ├── click / fill / select / hover / …   — Playwright primitives per affordance kind
│   └── payload-validator           — checks data payload matches affordance's accepted shape
├── outcome-envelope/
│   └── InteractEnvelope            — { affordanceRef, payload, outcome, timingMs }
└── failure-classifier/
    └── four-family-mapper          — not-visible / not-enabled / timeout / assertion-like
```

**Internal interchanges:** affordance-ref → facet-ref-to-locator → preflight-check → (action-dispatch or failure). Every interaction emits an interact-receipt. Outcome feeds ladder-health (one step removed, through Lane E2).

**Manifest exposures:** `interact`. Takes a facet reference plus a data payload.

**Saga connections:** authorTest yields interact for every action step. evaluateTestbed same. absorbOperatorInput does not use interact directly but may trigger it indirectly through proposal review.

**Failure topology:** `not-visible` (common, surfaces to handoff), `not-enabled` (common, surfaces to handoff), `timeout` (SUT slow to respond), `assertion-like` (action succeeded but expected outcome not reached — classified as a distinct family because the recovery policy differs), `unclassified`.

##### Lane B5 — Test compose (AST-backed emitter)

**Primary highway:** World (§10.1) and Memory (consumes facets), but the lane's deliverable is a Test instrument artifact, so some frame this as the "Test" sub-highway inside Verb.

**Secondary highways:** Verb (the `test-compose` verb lands in the manifest).

**Internal towns:**

```
B5 micro-cathedral
├── intent-walker/
│   ├── action-sequencer            — orders actions from parsed intent
│   └── expected-binding            — maps expected outcomes to assertions
├── facet-facade-generator/
│   ├── per-screen-facade           — one TypeScript module per screen
│   ├── facet-ref-emitter           — emits by facet id, never inline selector
│   └── regeneration-on-change      — catalog change → regenerate affected facades
├── ast-emitter/
│   ├── ts-morph-or-equivalent      — AST-level emission, not string splicing
│   ├── test-file-structure         — imports, describe, test, steps
│   └── readable-assertions         — business-vocabulary wording
└── output-writer/
    └── atomic-write                — temp + rename into generated/<suite>/<ado_id>.spec.ts
```

**Internal interchanges:** parsed intent + facet query results → intent-walker → facet-facade-generator → ast-emitter → output-writer. Catalog updates trigger facade regeneration; regeneration never discards operator-edited intent layers (handoff boundary, substrate §3.2).

**Manifest exposures:** `test-compose`. Input: parsed intent + facet set. Output: test file path + compose receipt.

**Saga connections:** authorTest yields test-compose after memory consultation and (if needed) world exploration. Regeneration on catalog change is triggered by applyApprovedProposal sagas.

**Failure topology:** `facet-missing-for-step` (intent references something not in the catalog — common at L0, triggers mint-on-the-fly or handoff), `sequencing-ambiguous` (order of actions unclear from intent — handoff), `unclassified`.

##### Lane B6 — Test execute (Playwright runner adapter)

**Primary highway:** Truth (§10.1) — run records are Truth-highway traffic.

**Secondary highways:** World (execution uses world), Verb.

**Internal towns:**

```
B6 micro-cathedral
├── runner-invocation/
│   ├── cli-spawn                   — `npx playwright test --reporter=json`
│   ├── config-resolution           — project, retries, timeout from policy
│   └── output-capture              — stdout + stderr + json report
├── run-record-builder/
│   ├── per-step-evidence           — which facet was touched at each step
│   ├── classification              — pass / fail-product / fail-drift / fail-infra
│   └── RunRecordEnvelope           — append-only log entry shape
├── referenced-facet-tracker/
│   └── facets-touched-this-run     — feeds Memory corroboration (Lane E1)
└── failure-differentiator/
    ├── product-failure             — assertion failed on application logic
    ├── drift-failure               — locator no longer resolves (Lane E5 consumes)
    └── infra-failure               — browser/runner/network
```

**Internal interchanges:** test file path + config → runner-invocation → output-capture → run-record-builder → append to run-record log → referenced-facet-tracker feeds Memory corroboration. Drift-classified failures feed Lane E5.

**Manifest exposures:** `test-execute`. Input: test file path + execution config. Output: run record reference + execute receipt.

**Saga connections:** authorTest yields test-execute after test-compose. evaluateTestbed yields test-execute for each testbed work item. verifyHypothesis reads run records post-execution.

**Failure topology:** `fail-product` (assertion on app logic — this is valuable signal, not an error), `fail-drift` (locator failed, classified as drift not assertion — feeds E5), `fail-infra` (browser/runner/network — transient, retried), `unclassified`.

##### Lane B7 — Reasoning adapter (one provider)

**Primary highway:** Reasoning (§10.1) — this lane lights up the port A2 declared.

**Secondary highways:** Verb (receipt-log read verbs for dashboard), Truth (reasoning-receipts feed measurement).

**Internal towns:**

```
B7 micro-cathedral
├── provider-client/
│   ├── http-or-sdk-client          — Anthropic messages.create, OpenAI chat.completions
│   ├── auth                        — API key from environment (never in code)
│   └── request-shape               — model-specific prompt structure
├── operation-handlers/
│   ├── select-handler              — constrains response to choice IDs from handoff
│   ├── interpret-handler           — schema-guided output
│   └── synthesize-handler          — proposal-shaped output
├── response-validator/
│   ├── schema-check                — adapter boundary rejects malformed responses
│   ├── constrained-retry           — one retry with explicit reminder on malformed
│   └── error-family-classifier     — provider errors → named families
└── receipt-emitter/
    ├── prompt-fingerprint          — hash of prompt shape, not verbatim text
    ├── token-accounting            — tokens-in + tokens-out for cost metric
    └── append-to-reasoning-receipts
```

**Internal interchanges:** saga yields `Reasoning.select` → operation-handler formats prompt → provider-client calls API → response-validator checks → receipt-emitter appends → choice returned to saga. Receipt is durable before the saga sees the choice.

**Manifest exposures:** none new — this lane implements the verbs A2 declared. The lane's public API is the `Reasoning.Tag` layer binding.

**Saga connections:** every saga that yields `Reasoning.*` at any step binds against this adapter through `Layer.succeed(Reasoning.Tag, AnthropicAdapter)` or similar at composition.

**Failure topology:** `rate-limited` (common, bounded backoff at adapter, handoff if persistent), `context-exceeded` (triggers handoff immediately — saga decides whether to summarize or chunk), `malformed-response` (one retry with reminder, then fail), `unavailable` (provider down — handoff), `unclassified`.

##### Lane D1 — Testbed adapter (testbed:v0)

**Primary highway:** Intent (§10.1) — same highway as ADO, different source.

**Secondary highways:** Truth (testbed-sourced run records seed measurement derivations).

**Internal towns:**

```
D1 micro-cathedral
├── testbed-layout/
│   ├── testbed-root                — `testbed/v<N>/`
│   ├── version-manifest            — v<N>/manifest.yaml declaring the increment
│   └── work-item-files             — v<N>/<id>.yaml per synthetic work item
├── yaml-loader/
│   ├── parse-work-item             — same shape as ADO parsed-intent envelope
│   ├── expected-outcomes           — testbed-specific: what the run should produce
│   └── source-field                — 'testbed:v<N>:<id>'
├── polymorphism-adapter/
│   └── ports-the-same-intent-source-contract  — indistinguishable from ADO downstream
└── expected-outcome-registry/
    └── per-work-item-expectation   — used by metric verbs to compute acceptance
```

**Internal interchanges:** `intent-fetch --source=testbed:v<N>:<id>` → yaml-loader → polymorphism-adapter → same envelope shape ADO emits. Downstream handshakes do not distinguish. Expected-outcome-registry is read by metric verbs (D2), not by sagas.

**Manifest exposures:** none new — this lane lights up the existing `intent-fetch` and `intent-parse` verbs for a new source. The source polymorphism is the whole point.

**Saga connections:** evaluateTestbed binds to the testbed source exclusively. authorTest can also target the testbed for ad-hoc runs. compareEvaluations consumes across testbed versions.

**Failure topology:** `yaml-parse-error` (committed testbed file malformed — build-time catchable ideally, runtime fall-through otherwise), `version-not-found` (testbed version doesn't exist — surfaces), `unclassified`.

##### Lane D2 — First two metric verbs

**Primary highway:** Truth (§10.1) — metrics are the Truth highway's derivations.

**Secondary highways:** Verb (metric verbs land in the manifest with frozen signatures).

**Internal towns:**

```
D2 micro-cathedral
├── metric-framework/
│   ├── MetricVerb<Inputs, Output>  — typed metric declaration shape
│   ├── metric-compute-record       — append when a metric is computed
│   └── windowing                   — by time, by testbed version, by cohort
├── metric-test-acceptance-rate/
│   ├── filter-to-reviewed-runs     — runs the QA accepted into the suite
│   ├── aggregate-pass-fraction     — accepted / (accepted + rejected + pending)
│   └── derivation-lineage          — names the run subset it was derived from
├── metric-authoring-time-p50/
│   ├── per-run-wall-clock          — from intent-fetch to test-compose completion
│   ├── p50-aggregate               — median across filtered runs
│   └── breakdown-by-source         — testbed vs ADO comparable separately
└── metric-hypothesis-confirmation-rate/
    └── (declared; lights up after D3)
```

**Internal interchanges:** metric invocation → windowing filter → aggregate → metric-compute-record append → return derived value + derivation-lineage. Computation is pure given the run log; the compute record is the only side effect.

**Manifest exposures:** `metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-hypothesis-confirmation-rate` (declared here, used once D3 lands). Signatures frozen.

**Saga connections:** evaluateTestbed yields metric verbs at close of batch. dashboardSnapshot consumes them read-only. verifyHypothesis computes actualDelta against a named metric.

**Failure topology:** `empty-window` (no runs in the filter window — surfaces as a derivation with `empty: true`, not as an error), `metric-config-invalid` (build-time catchable), `unclassified`.

##### Lane D3 — Hypothesis-receipt discriminator

**Primary highway:** Truth (§10.1) — the trust-but-verify loop runs on this lane.

**Secondary highways:** Memory (proposals live in the same proposal log revisions use).

**Internal towns:**

```
D3 micro-cathedral
├── proposal-discriminator/
│   ├── kind-field                  — 'revision' | 'candidate' | 'hypothesis'
│   └── hypothesis-shape            — { proposedChange, predictedDelta, rationale }
├── predicted-delta-schema/
│   ├── metric-name                 — references a declared metric verb
│   ├── direction                   — 'increase' | 'decrease' | 'maintain'
│   └── magnitude                   — number | 'qualitative'
├── verification-receipt-log/
│   ├── append-only                 — invariant 3
│   ├── hypothesisId-link           — links back to the proposal
│   └── actualDelta + confirmed     — computed post-next-evaluation
└── batting-average-derivation/
    └── metric-hypothesis-confirmation-rate  — lights up the declared D2 metric
```

**Internal interchanges:** hypothesis proposal → proposal log (same log as revisions) → operator review → accepted proposals land code → next evaluation produces run records → actualDelta computed → verification-receipt appended → batting-average derivation reads the log.

**Manifest exposures:** no new verbs — this lane discriminates on an existing proposal log and lights up the D2-declared `metric-hypothesis-confirmation-rate`.

**Saga connections:** proposeHypothesis produces hypothesis-kind proposals. applyApprovedProposal distinguishes `kind: hypothesis` from `kind: revision` on landing (hypothesis lands as code; revision lands as memory). verifyHypothesis is the sub-saga that computes actualDelta and appends the verification receipt.

**Failure topology:** `hypothesis-metric-not-declared` (build-time catchable — the referenced metric must be a declared verb), `verification-not-yet-possible` (evaluation hasn't run yet; hypothesis stays pending — not an error), `unclassified`.

##### Lane E1 — Per-facet evidence log

**Primary highway:** Memory (§10.1).

**Secondary highways:** Truth (confidence derivations are metric-adjacent).

**Internal towns:**

```
E1 micro-cathedral
├── evidence-log/
│   ├── per-facet-jsonl             — one append-only file per facet
│   ├── atomic-append               — temp + rename; no in-place updates
│   └── evidence-event-schema       — { observedAt, instrument, outcome, runId }
├── confidence-derivation/
│   ├── on-read-fold                — accumulate evidence → confidence scalar
│   ├── aging-kernel                — half-life or decay (specifics deferred)
│   └── corroboration-weight        — passing runs reinforce; flaky runs don't
├── summary-cache/
│   ├── memoize-per-facet           — cache keyed by (facetId, evidence-count)
│   └── invalidate-on-append        — new evidence invalidates cached summary
└── evidence-query/
    └── history-by-facet            — returns ordered evidence for a facet id
```

**Internal interchanges:** any saga that touches a facet (observe → mint, interact → corroborate, drift → decay) appends to the per-facet log via atomic-append. Summary cache invalidates; next read re-derives confidence via on-read-fold.

**Manifest exposures:** `facet-evidence-append`, `facet-confidence`, `facet-evidence-history`. Confidence derivation is a pure function of the log.

**Saga connections:** growMemoryForStep appends via mint. authorTest reads confidence at facet-query time. maintenanceCycle triggers aging. respondToDrift appends drift evidence with decay weight.

**Failure topology:** `evidence-log-io-error` (rare, retry + surface), `confidence-derivation-panic` (should be impossible — pure function, but unclassified surfaces if it ever fires), `unclassified`.

##### Lane E2 — Locator-health co-location

**Primary highway:** Memory (§10.1).

**Secondary highways:** World (locator choice affects observe/interact).

**Internal towns:**

```
E2 micro-cathedral
├── health-schema/
│   ├── per-strategy-health         — embedded in FacetRecord.locatorStrategies
│   └── usage-counter + success-rate — simple aggregates, pure derivation
├── outcome-intake/
│   ├── observe-feed                — ladder-resolver (B3) emits per-rung outcomes
│   └── interact-feed               — interact outcomes update locator that matched
├── ladder-reorderer/
│   └── evidence-backed-choice      — rank locator strategies by observed health
└── drift-signal/
    └── strategy-failed-threshold   — repeated failure triggers drift emit (E5)
```

**Internal interchanges:** observe/interact → outcome-intake → per-strategy-health updated in place (via append-only evidence pattern, not field mutation — a new evidence event supersedes old in derivation). Ladder-reorderer consults health on next use.

**Manifest exposures:** `locator-health-track` (append-only update), `locator-rank` (derivation).

**Saga connections:** authorTest implicitly benefits via facet-query returning health-ranked locators. respondToDrift consumes strategy-failed-threshold signals.

**Failure topology:** no new families — piggybacks on B3/B4 error families with added `health-threshold-breached` signal (not an error, a drift trigger).

##### Lane E3 — Dialog capture

**Primary highway:** Intent (§10.1) — operator dialog is an intent variant — with outbound into Memory (§10.1).

**Secondary highways:** Verb, Reasoning (interpretation of operator wording).

**Internal towns:**

```
E3 micro-cathedral
├── dialog-channel/
│   ├── turn-envelope               — { speaker, timestamp, rawText, session }
│   ├── tag-as-domain-info          — operator annotates or agent classifies
│   └── source-text-preservation    — invariant 7, verbatim text as provenance
├── interpretation-handler/
│   ├── reason-interpret-call       — yields to Reasoning.Tag
│   ├── candidate-extractor         — structured candidates from operator text
│   └── schema-guided-output        — candidates conform to facet kind schemas
├── candidate-review-queue/
│   ├── jsonl-queue                 — append-only queue
│   ├── per-candidate-record        — operator wording + extracted candidate + rationale
│   └── review-state-machine        — pending → approved | rejected | needs-edit
└── decision-intake/
    ├── approve-handler             — lands candidate as facet (via A4 mint)
    ├── reject-handler              — preserves rejection with rationale
    └── edit-handler                — operator edits candidate then approves
```

**Internal interchanges:** dialog turn → tag-as-domain-info → reason-interpret → candidate-extractor → candidate-review-queue. Operator decision → decision-intake → (facet-mint if approved, rejection-with-rationale appended if rejected). Source wording is preserved throughout.

**Manifest exposures:** `dialog-capture`, `candidate-propose`, `candidate-review-decide`.

**Saga connections:** absorbOperatorInput is the primary saga; dialog capture is its first step. applyApprovedProposal handles the approval side.

**Failure topology:** `interpretation-ambiguous` (multiple candidate extractions from the same turn — surfaces as several candidates, not an error), `reasoning-unavailable` (Reasoning port down — surfaces), `queue-io-error`, `unclassified`.

##### Lane E4 — Document ingest

**Primary highway:** Intent (§10.1) — documents are an intent-adjacent source — into Memory.

**Secondary highways:** Verb, Reasoning.

**Internal towns:**

```
E4 micro-cathedral
├── document-adapter/
│   ├── format-detector             — markdown first; PDF/Confluence deferred
│   ├── region-chunker              — splits document into addressable regions
│   └── region-anchor-schema        — { path, startOffset, endOffset, headings }
├── candidate-extraction/
│   ├── reason-interpret-per-region — schema-guided extraction with region context
│   └── candidate-with-anchor       — every candidate carries its source region
├── deduplication/
│   └── anchor-based-dedup          — repeat ingests don't double-count
└── review-queue-integration/
    └── same-queue-as-E3            — dialog and document candidates share the queue
```

**Internal interchanges:** document upload → format-detector → region-chunker → per-region reason-interpret → candidate-with-anchor → review queue. Deduplication runs before enqueue.

**Manifest exposures:** `document-ingest`, `document-regions`.

**Saga connections:** absorbOperatorInput handles document path as well as dialog path. The review queue is shared with E3.

**Failure topology:** `format-unsupported` (non-markdown in Phase 7 — surfaces, deferred to later formats), `region-extraction-degraded` (partial extraction with source preserved), `reasoning-unavailable`, `unclassified`.

##### Lane E5 — Drift emit

**Primary highway:** Memory (§10.1) — but the event stream is a distinct log (drift-events.jsonl).

**Secondary highways:** Truth (drift events feed measurement), World (drift is observed during execution).

**Internal towns:**

```
E5 micro-cathedral
├── drift-classifier/
│   ├── product-vs-drift-split      — distinguishes assertion failures from locator failures
│   ├── mismatch-kind               — stale-locator / changed-role / moved-element / …
│   └── offending-facet-linker      — names the facets involved in the drift
├── drift-event-log/
│   ├── append-only-jsonl           — drift-events.jsonl
│   └── event-schema                — { facetIds, kind, runId, observedAt, evidence }
├── confidence-reducer/
│   └── per-facet-decay-application — drift triggers weighted decay via E1
└── surfacing-handler/
    ├── to-agent                    — next authoring pass sees a handoff for the facet
    └── to-operator                 — drift shows in proposal-review if operator-configured
```

**Internal interchanges:** test-execute outcome (B6) classified as drift → drift-classifier → drift-event-log append → confidence-reducer fires through E1 → agent's next session sees the reduced confidence and a decision handoff.

**Manifest exposures:** `drift-emit`, `drift-query`.

**Saga connections:** respondToDrift consumes drift events. maintenanceCycle aggregates drift across facets for revision synthesis. authorTest receives drift through facet-query results (reduced confidence, annotated drift evidence).

**Failure topology:** `classification-ambiguous` (is it product or drift? — surfaces with both candidates), `facet-link-missing` (drift observed but no facet link can be established — rare, surfaces), `unclassified`.

##### Lane E6 — DOM-less authoring policy

**Primary highway:** Memory (§10.1) — a policy, not an instrument.

**Secondary highways:** World (policy decides whether to observe), Truth (authoring throughput is measured under this policy).

**Internal towns:**

```
E6 micro-cathedral
├── policy-evaluator/
│   ├── surface-confidence-query    — aggregate confidence across a surface's facets
│   ├── threshold-gate              — above threshold → skip observe; below → observe
│   └── per-session-policy-cache    — decision is stable within a session
├── authoring-path-router/
│   ├── with-observation            — standard L0–L2 path
│   └── dom-less                    — skip observe, compose from memory only
├── drift-consequence-handler/
│   └── drift-demotes-surface       — one drift event drops the surface below threshold
└── throughput-hook/
    └── metric-dom-less-fraction    — declared metric verb (D2 family)
```

**Internal interchanges:** authorTest at screen-entry → policy-evaluator → authoring-path-router → (observe or skip). Drift events fed back from E5 demote the surface; next session reverts to the observation path.

**Manifest exposures:** `surface-confidence`, `dom-less-policy-decide`.

**Saga connections:** authorTest yields the policy decision before yielding observe. evaluateTestbed benefits proportionally; DOM-less throughput is measurable on testbed.

**Failure topology:** `policy-config-invalid` (threshold misconfigured — build-time catchable), `surface-undefined` (facet query returns nothing for the surface — triggers observation path as fallback, not an error), `unclassified`.

##### Lane E7 — Aging / corroboration / revision-propose

**Primary highway:** Memory (§10.1) — self-refinement is Memory ↔ itself.

**Secondary highways:** Truth (refinement is validated by next evaluation via D3 hypothesis-receipt).

**Internal towns:**

```
E7 micro-cathedral
├── aging-scheduler/
│   ├── periodic-tick               — daemon fiber ticks on schedule
│   ├── half-life-kernel            — per-facet confidence decay over elapsed time
│   └── aging-receipt               — appended to evidence log as a decay event
├── corroboration-hook/
│   ├── passing-run-intake          — test-execute pass → corroborate referenced facets
│   └── strength-weighting          — corroboration strength ∝ pass reliability
├── revision-synthesizer/
│   ├── drift-aggregator            — groups drift events by facet + kind
│   ├── pattern-detector            — looks for repeated drift patterns
│   ├── reason-synthesize-call      — yields to Reasoning for proposal text
│   └── proposal-envelope           — { kind: 'revision', target, rationale, evidence }
└── review-gated-application/
    └── approved-proposal-applier   — lands the revision (via applyApprovedProposal)
```

**Internal interchanges:** aging-scheduler ticks → for each facet: aging-receipt appended → confidence re-derives lower on next read. Passing run → corroboration-hook → evidence log appended with corroboration event. Drift accumulation → revision-synthesizer → proposal into the proposal log.

**Manifest exposures:** `facet-age`, `facet-corroborate`, `revision-propose`.

**Saga connections:** maintenanceCycle is the daemon saga. proposeRefinements is the scheduled synthesis step. applyApprovedProposal handles the operator-approved landing path.

**Failure topology:** `aging-scheduler-stopped` (daemon died — circuit breaker restarts), `reasoning-unavailable` (synthesis blocked — proposal deferred to next tick), `unclassified`.

##### Lane F1 — Testbed growth

**Primary highway:** Intent (§10.1) — each testbed version is an intent-source snapshot.

**Secondary highways:** Truth (testbed growth enables cohort-comparable measurement).

**Internal towns:**

```
F1 micro-cathedral
├── version-manifest/
│   ├── versions.yaml               — ordered list of testbed versions with increments
│   └── increment-narrative         — one paragraph per version naming what it adds
├── authored-content/
│   └── testbed/v<N>/*.yaml          — synthetic work items committed per version
├── expected-outcome-registry/
│   └── per-version-expected         — what each work item should produce
└── cohort-id-discipline/
    ├── stable-ids-across-versions  — same work-item id means same scenario
    └── version-diff-semantics      — v<N+1> is v<N> + one named increment
```

**Internal interchanges:** author new testbed work items → write version manifest entry → commit. Cohort-id discipline ensures measurement can compare the same scenario across versions.

**Manifest exposures:** none — content lane, not verb lane.

**Saga connections:** evaluateTestbed targets a specific version. compareEvaluations diffs across versions.

**Failure topology:** `version-id-collision` (build-time catchable via a commit-hook that validates versions.yaml), `expected-outcome-drift` (a committed expected outcome contradicts earlier commits — build-time catchable), `unclassified`.

##### Lane F2 — Metric catalog growth

**Primary highway:** Truth (§10.1) — new metrics extend what Truth measures.

**Secondary highways:** Verb (every metric is a manifest verb).

**Internal towns:**

```
F2 micro-cathedral
├── metric-proposal-shape/
│   └── { name, signature, derivation, rationale, predicted-utility }
├── declaration-first-pipeline/
│   ├── declare-in-manifest         — signature frozen, derivation can stub
│   ├── implement-derivation        — pure function over run records
│   └── verify-against-testbed      — run metric over known-outcome data
├── deprecation-handler/
│   ├── since-version               — marks metric deprecated with replacement pointer
│   └── retire-never-delete         — invariant-aware retirement
└── metric-interaction-catalog/
    └── cross-metric-correlation    — documentation, not executable
```

**Internal interchanges:** new metric need → metric-proposal-shape → manifest declaration → implementation → testbed verification → activation. Retirement follows the deprecation-handler path, never a delete.

**Manifest exposures:** varies — this lane adds metric verbs by the ones each phase needs.

**Saga connections:** evaluateTestbed and dashboardSnapshot consume all declared metrics.

**Failure topology:** `metric-signature-drift` (build-fail via A3 drift check), `derivation-impurity` (catchable by a law: metric derivations must be pure functions of the run log), `unclassified`.

##### Lane F3 — Operator-review UI

**Primary highway:** Memory (§10.1) and Intent (operator decisions are intent-adjacent).

**Secondary highways:** Verb.

**Internal towns:**

```
F3 micro-cathedral
├── queue-surface/
│   ├── jsonl-queue                 — one item per pending review
│   └── cli-list / cli-show         — operator inspects pending items
├── decision-writer/
│   ├── approve-cli                 — writes a decision record via file-backed bridge
│   ├── reject-cli                  — same path, distinct verdict
│   └── edit-cli                    — opens the item for operator edit, then approves
├── decision-intake/
│   ├── watch-bridge                — picks up decisions the CLI wrote
│   └── resume-paused-fiber         — saga waiting on decision resumes
└── extension-points/
    └── richer-surfaces-defer       — TUI/web UI lands later only under pressure
```

**Internal interchanges:** proposal lands in queue → operator runs `review list / review show / review approve|reject|edit` → decision-writer emits decision record → decision-intake wakes the saga fiber.

**Manifest exposures:** `review-list`, `review-show`, `review-decide`.

**Saga connections:** every proposal-gated saga (applyApprovedProposal, recordProposalRejection, applyHandoffDecision) waits on a decision from this lane.

**Failure topology:** `queue-io-error`, `decision-timeout` (operator absent; saga times out with structured handoff, not silent abandonment), `unclassified`.

##### Lane F4 — Dashboard plug-in

**Primary highway:** Truth (§10.1) — the dashboard is the Truth highway's external consumer.

**Secondary highways:** none — dashboards write nothing.

**Internal towns:**

```
F4 micro-cathedral
├── log-reader/
│   ├── run-record-reader
│   ├── receipt-log-reader
│   ├── drift-log-reader
│   ├── proposal-log-reader
│   └── reasoning-receipt-reader    (from B7)
├── manifest-driven-derivations/
│   └── dashboard-calls-metric-verbs  — reads via declared verbs only
├── snapshot-envelope/
│   └── DashboardSnapshot            — { window, metrics, highlights, proposals }
├── projection-surfaces/
│   ├── cli-text                    — human-readable snapshot
│   ├── json-export                 — machine-readable for external tools
│   └── subscribe-stream            — optional, push snapshots to a dashboard
└── read-only-discipline/
    └── architecture-law            — fails tests if the lane writes any log
```

**Internal interchanges:** dashboardSnapshot saga yields metric verbs → log-reader fills detail → snapshot-envelope returned. No writes; no mutations. A dashboard rebuild from logs alone must produce the same snapshot given the same log state.

**Manifest exposures:** `dashboard-snapshot`. Read-only by signature.

**Saga connections:** dashboardSnapshot saga consumes the lane. External tools (team TUI, web dashboard, alerting system) subscribe to or pull from the lane's surfaces.

**Failure topology:** `log-read-io-error` (retry + surface), `manifest-verb-unavailable` (dashboard references a retired metric — surfaces gracefully), `unclassified`.

---

Every lane above shares the same micro-cathedral discipline: a primary highway, internal towns, explicit interchanges, manifest exposures, saga connections, and a failure topology. A lane without this structure cannot be parallelized; a lane with it is a pickable unit of work whose interface is compile-enforced and whose failure modes are enumerable. This is what lets a future agent — or a team of agents working concurrently — ship v2 without coordination overhead. The backlog is structured, the structure is descriptive not prescriptive, and every lane extends the same shape.

Every lane's handoff contract is the shape downstream lanes can assume. The shape is always the same form: **"when this lane is complete, these invariants hold across the codebase."** Not "this file exists" — that's necessary but not sufficient.

A valid handoff contract names invariants, not artifacts. Example:

```
Lane B3 (observe) handoff:
- The `observe` verb is declared in the manifest with signature
  (Route) => Effect<TimestampedSnapshot, ObserveError, PlaywrightAria>
- ObserveError has exactly five variants: not-found, timeout, page-crashed,
  degraded, unclassified
- Every call emits an observation-receipt (receipt log append-only)
- Snapshots carry `sourceFingerprint` that downstream facet-mint uses as provenance
- Ladder resolution is behind a helper the observe verb consumes;
  changing the ladder order is a one-file change, not a codebase-wide edit
```

An invalid handoff contract names artifacts without invariants:

```
Lane B3 handoff:
- observe.ts is implemented   ← says nothing about invariants
- Tests pass                  ← passes what tests?
- Works with Playwright       ← says nothing about what downstream assumes
```

Handoff contracts descend from the cohesion laws and are therefore already half-written. The author's job is to name the specific invariants their lane establishes, not to invent the shape of the claim. A lane without a valid handoff contract cannot be parallelized — downstream work will discover the contract by running into it, which is what coordination-overhead looks like.

### 12.7 Common temptations and their antidotes

The descent is designed to resist common failures. These are the ones that still get past it; name them to make resistance automatic.

**Temptation:** Add a boolean flag to an existing verb for a "small" variation.
**Antidote:** Invariant 1 says new verb. The manifest drift check catches this; the author catches it first by checking cohesion law 1.

**Temptation:** Paraphrase operator wording "for clarity" when storing in memory.
**Antidote:** Invariant 7 says source vocabulary survives. Store the source text verbatim; put paraphrases in derivations. Cohesion law 9.

**Temptation:** Read the governance verdict as a string and branch.
**Antidote:** Architecture law 8. Route through `foldGovernance`. Cohesion law 10.

**Temptation:** Have the reasoning adapter retry indefinitely on `rate-limited`.
**Antidote:** Error families are structured fallthrough, not silent recovery. Classify, emit a handoff, let the saga decide. Invariant 10 + cohesion law 6.

**Temptation:** Skip the testbed increment "because the feature is too small to need one."
**Antidote:** Trust-but-verify says every code change carries a hypothesis. A feature too small to name a predicted delta is a feature too small to land. Pre-flight measurement-substrate checklist.

**Temptation:** Mutate an existing facet entry instead of appending evidence.
**Antidote:** Invariant 3. The store adapter refuses in-place updates (cohesion law 8); the caller doesn't get a chance to get it wrong.

**Temptation:** Let a saga yield without a receipt "for performance."
**Antidote:** Cohesion law 3. A saga without receipts is ungoverned. Performance concerns land as a proposal to change the receipt format, not as a waiver.

**Temptation:** Add a new variant to a sum type and "fix the compile errors one by one."
**Antidote:** Cohesion law 11. The `fold<X>` helper's compile errors *are* the TODO list. Handle every site before moving on.

**Temptation:** Pick a Reasoning provider at a saga callsite because "we know we want Claude here."
**Antidote:** Cohesion law 7; saga code is provider-agnostic. Provider choice is `Layer.succeed(Reasoning.Tag, <adapter>)` at composition, never at callsite.

**Temptation:** Build a dashboard that writes back corrections to memory.
**Antidote:** §7.10's dashboard-as-read-only-consumer law. Dashboards are eyes, not hands. Corrections flow through proposal-gated reversibility like every other memory write.

**Temptation:** Inline a small helper in a saga rather than declare a new verb, because "it's only used once."
**Antidote:** If it crosses a bounded-context boundary, it earns a verb. If it stays within the saga, it can inline. The test is the boundary, not the reuse count.

**Temptation:** Let a daemon saga (e.g. `maintenanceCycle`) write memory directly to "save a round-trip."
**Antidote:** Daemons produce proposals, same as interactive sagas. Review-gated reversibility applies regardless of who triggered the saga.

### 12.8 When a feature genuinely doesn't fit

Sometimes a feature descends and the descent doesn't close. No handshake fits; no saga composes cleanly; no cohesion law can be satisfied without bending. This is the signal that the substrate needs amendment, not that the feature needs forcing.

The path for such features:

1. **Write the one-page descent anyway.** Name the primitive, the level, the handshake, and where the descent breaks. The broken step is the evidence.
2. **Open a substrate proposal.** Propose a substrate-level change (new primitive, new handshake category, new invariant, new cohesion law) with the feature as the forcing scenario. The proposal carries the same `kind: hypothesis` discriminator the measurement substrate uses — it names what will change and what the predicted impact is.
3. **Wait for review.** Substrate changes are review-gated; the proposal enters the same proposal log memory revisions and hypothesis-receipts use. Operator + team review it against the anti-scaffolding gate: does this earn its place in the substrate?
4. **If approved, the substrate changes first, then the feature descends cleanly.** If rejected, the feature is deferred or reconceived.

This path is rare and should stay rare. A feature that breaks descent is either (a) evidence the substrate was wrong in a specific and now-falsifiable way, or (b) a poorly-scoped feature that wants to sneak around the doctrine. The proposal review gate distinguishes. If ten features in a row request the same substrate amendment, the substrate is indeed wrong; if no single feature can make the case, the doctrine is holding. Either outcome is valuable signal.

### 12.9 Closing: the agent's own descent

This section is a letter to future agents.

You will open a session with no memory of this conversation. You will read the `CLAUDE.md` pointer to this document. You will have a feature to ship.

Your first move: run the descent. Name the primitive. Name the level. Name the handshake. Name the town. Name the saga. Name the runtime seam. Write the five answers on one page in under five minutes. If you cannot, the feature isn't ready; reply with the descent gap, not with code.

Your second move: check the cohesion laws. Run the pre-flight checklist. If anything is unchecked, either the descent missed a level or the feature is malformed.

Your third move: pick a lane from §12.5 or name a new lane with the same six-field shape. Commit the handoff contract before you commit the implementation — other lanes depend on the shape of your deliverable, not on its code.

Your fourth move: write the testbed increment and the hypothesis receipt. Your code must be a falsifiable claim about a metric you named before the code ran. Everything else is taste.

Your fifth move: land the code. The descent did the governance; the code is the last-mile realization. If the descent was done, the PR is ten lines of context over a clean diff. If the descent was skipped, the PR is a debate.

The substrate holds because every feature descends through the same five levels, and at every level the same invariants bind. The cathedral is built one descent at a time. This is how future agents, without reading any other document, can still build v2 coherently — **the descent is self-governing, and self-governance is what makes parallelism possible**.

Execute with discipline. The doctrine descends; the evidence ascends. v2 grows one well-descended feature at a time.

## 13. Per-lane salvage audit — what ports, what changes, what's fresh

§12 named the lanes and the towns inside them. This section answers the question a future agent asks when they pick up a lane: *what can I port, what do I port with changes, and what do I write from scratch?* The goal is zero additional discovery: every v1 file with a salvage opportunity is named here, every shape adjustment is specified, and every fresh module is justified. A future agent can open this section, find their lane, and start working.

Each lane block follows the same shape:

- **Clean port** — specific v1 file copies into `lib-v2/` with only import rewiring. No logic change.
- **Port with changes** — specific v1 file ports with a named shape adjustment. The change is spelled out so the author does not have to infer it.
- **Write fresh** — no v1 analog. The reason names why there is no port (either v1 never had the concern, or v1's concern is being left behind per `v2-direction.md` §4).
- **Cross-lane dependencies** — v1 or v2 files the lane's work relies on but that live in another lane's scope. Listed so the lane's author knows what must be stable before or alongside their own work.

Paths in this section are illustrative — `lib-v2/<bounded-context>/...` placeholders may resolve to slightly different concrete layouts during Phase 0 scaffolding. The port classifications and shape adjustments are stable; the directory tree is the author's call during Step 0.

### 13.1 A-track — structural setup

#### Lane A1 — Envelope substrate port

**Clean port:**
- `lib/domain/governance/workflow-types.ts` → `lib-v2/domain/governance/workflow-types.ts` — phantom brands (Approved / ReviewRequired / Blocked) + `foldGovernance`. Import rewire only.
- `lib/domain/kernel/hash.ts` → `lib-v2/domain/kernel/hash.ts` — stableStringify + sha256 + `Fingerprint<Tag>` closed registry (30+ tags). Copy intact.
- `lib/domain/handshake/epistemic-brand.ts` → `lib-v2/domain/handshake/epistemic-brand.ts` — epistemic status brands + `foldEpistemicStatus`. Copy intact.

**Port with changes:**
- `lib/domain/pipeline/source.ts` → `lib-v2/domain/pipeline/source.ts` — change: `PhaseOutputSource` drops the `reference-canon` slot entirely (v2 has no transitional slot per `v2-direction.md` §4B); the discriminant collapses from six slots to the three v2 recognizes (operator-override, agentic-override, deterministic-observation). `foldPhaseOutputSource` restructures accordingly.
- `lib/domain/pipeline/lookup-chain.ts` → `lib-v2/domain/pipeline/lookup-chain.ts` — change: remove `LookupMode` flags (`warm` / `cold` / `compare` / `--no-reference-canon`); v2 has one canonical walk, not a mode matrix.

**Write fresh:**
- `lib-v2/domain/envelope/stage-narrowing.ts` — reason: v1 lacks concrete envelope subtypes by stage; v2 needs `WorkflowMetadata<'preparation' | 'resolution' | 'execution' | 'proposal'>` discrimination with compile-time enforcement at seams.
- `lib-v2/domain/envelope/builder-factories.ts` — reason: v1 mints envelopes ad-hoc at call sites; v2 centralizes stage-aware constructors that atomically attach the matching `Fingerprint<Tag>`.

**Cross-lane dependencies:**
- Every subsequent lane imports A1's types. A1 is strictly upstream; no lane can land before A1 is stable.
- `foldEpistemicStatus` feeds A4 (facet provenance) and B7 (reasoning receipts).
- The source discriminant feeds A4 (facet-query ranking).

#### Lane A2 — Reasoning port declaration

**Clean port:**
- None. A2 is the port *declaration* lane; v1 has no unified port, so the clean-port opportunities live in B7 (the adapter lane). A2 is almost entirely new code.

**Port with changes:**
- `lib/application/resolution/translation/translation-provider.ts` → informs `lib-v2/domain/ports/reasoning/request-response.ts` — change: v1's three-backend strategy (`deterministic` / `llm-api` / `copilot`) is collapsed into *one* port with three *operations* (`select` / `interpret` / `synthesize`); backend choice moves to `Layer.succeed(Reasoning.Tag, <adapter>)` at composition time (B7). The request/response envelope shape is the reusable piece; the strategy discriminator is retired.
- `lib/domain/resolution/types.ts` (`TranslationReceipt`) → `lib-v2/domain/ports/reasoning/receipt.ts` — change: parameterize the receipt by operation (`ReasoningReceipt<Op>`); add append-only log contract; unify token accounting.

**Write fresh:**
- `lib-v2/domain/ports/reasoning/context.ts` — reason: v2 requires `Reasoning` as an `Effect.Context.Tag`; v1 has no composition-layer tag for LLM access.
- `lib-v2/domain/ports/reasoning/error-union.ts` — reason: unify scattered v1 error models into the five families (`rate-limited` / `context-exceeded` / `malformed-response` / `unavailable` / `unclassified`) with exhaustive `foldReasoningError`.
- `lib-v2/domain/ports/reasoning/prompt-fingerprint.ts` — reason: v1 has no prompt-shape versioning; v2 requires stable cache keys via stableStringify → sha256 over prompt structure.

**Cross-lane dependencies:**
- A2 signatures feed A3 (manifest entries for `reason-select`, `reason-interpret`, `reason-synthesize`).
- A2 error families feed B7 (adapter classification).
- A2 receipts feed F4 (dashboard reads reasoning-receipt log) and eventually D2 (cost / latency metric verbs).

#### Lane A3 — Manifest generator + fluency harness

**Clean port:**
- None. Per the delta audit, §9.8 (Verb declare / Manifest introspect / Fluency check) is Absent in v1. The entire lane is fresh.

**Port with changes:**
- None.

**Write fresh:**
- `lib-v2/domain/manifest/verb-entry.ts` — reason: no v1 schema for verb entries.
- `lib-v2/domain/manifest/manifest.ts` — reason: unified `Manifest` as ordered `VerbEntry` set.
- `lib-v2/build/emitter/collect-declared-verbs.ts` — reason: AST scan for verb annotations or `Context.Tag` declarations.
- `lib-v2/build/emitter/emit-manifest.ts` — reason: prebuild step writes `manifest.json`.
- `lib-v2/build/emitter/drift-check.ts` — reason: fails the build on non-additive manifest changes.
- `lib-v2/tests/fluency/canonical-tasks.ts` — reason: per-verb smoke fixture at product-test severity (Phase 1+).
- `lib-v2/tests/fluency/dispatch-harness.ts` — reason: asserts the agent routes a canonical task → the correct verb.
- `lib-v2/build/prebuild-hook.ts` — reason: wires emit + drift-check before `tsc`.

**Cross-lane dependencies:**
- A3 consumes every lane's verb declarations. It is always downstream of the lane that declared the verb, and always upstream of sessions that read the manifest.
- Fluency fixtures exercise B1 (intent-fetch), B3 (observe), B4 (interact), B6 (test-execute).

#### Lane A4 — Facet schema + YAML store

**Clean port:**
- `lib/domain/knowledge/types.ts` (`ElementSig`, `ScreenElementHint`) — informs `lib-v2/domain/memory/facet-record.ts` by consolidation, not copy; see port-with-changes.
- `lib/application/canon/decompose-screen-elements.ts` → `lib-v2/infrastructure/memory/elements-yaml-loader.ts` — per-screen loader; import rewire only.
- `lib/application/canon/decompose-screen-hints.ts` → `lib-v2/infrastructure/memory/hints-yaml-loader.ts` — per-screen loader; import rewire only.

**Port with changes:**
- `lib/application/canon/minting.ts` → `lib-v2/application/memory/facet-minter.ts` — change: drop v1's split-across-two-files pattern (elements.yaml + hints.yaml); collapse into one `FacetRecord`. Provenance restructures from v1's `CanonicalKnowledgeMetadata` (certification, activatedAt) to a `Provenance` header atomic at mint (`mintedAt`, `instrument`, `agentSessionId`, `runId`). `driftSeed` is dropped (v2's drift lives in Lane E5).
- `lib/application/drift/selector-health.ts` → `lib-v2/domain/memory/locator-health.ts` — change: co-locate health on `FacetRecord.locatorStrategies` rather than a separate `SelectorHealthIndex`. Keep the metric computations (success rate, flakiness, trend).
- `lib/domain/knowledge/types.ts` (`CanonicalKnowledgeMetadata`) → `lib-v2/domain/memory/provenance.ts` — change: atomic at mint, threaded forward; v1's backward-reference pattern goes away.

**Write fresh:**
- `lib-v2/domain/memory/facet-record.ts` — reason: unified record with id / kind / displayName / aliases / role / scope / locatorStrategies+health / confidence / provenance / evidence-log reference.
- `lib-v2/domain/memory/kind-extensions.ts` — reason: per-kind shapes (element / state / vocabulary / route).
- `lib-v2/infrastructure/memory/per-screen-yaml.ts` — reason: unified per-screen file replaces the split-file pattern.
- `lib-v2/infrastructure/memory/atomic-temp-rename.ts` — reason: crash-safe write discipline.
- `lib-v2/infrastructure/memory/in-memory-index.ts` — reason: loaded-once index with rebuild-on-change notification.
- `lib-v2/application/memory/query-by-intent-phrase.ts` — reason: the primary access path; v1's query is a secondary concern.
- `lib-v2/application/memory/query-by-id.ts` — reason: secondary path.
- `lib-v2/domain/memory/stable-id.ts` + `id-migration.ts` — reason: immutable `<screen>:<element>` IDs with rename-redirect records in the evidence log.

**Cross-lane dependencies:**
- A4 query feeds B5 (test compose) and B4 (interact affordance resolution).
- A4 mint feeds A3 (manifest entries for `facet-mint` / `facet-query` / `facet-enrich`).
- A4 evidence-log reference is the insertion point E1 extends.
- A4 health fields receive feeds from B3 (ladder-health), B4 (interact outcome), B6 (referenced-facet tracker).

### 13.2 B-track — L0 instruments

#### Lane B1 — ADO intent-fetch + intent-parse

**Clean port:**
- `lib/infrastructure/ado/live-ado-source.ts` → `lib-v2/infrastructure/ado/live-ado-source.ts` — REST v7.1 + PAT auth, WIQL query, field extraction, revision carry-forward, transient-error classification all map directly to B1's `rest-client` + `xml-parser` towns. Per delta audit §9.1–§9.2, verdict is Aligned; copy intact.

**Port with changes:**
- Entity-decoder + parameterized-string extractor inside `live-ado-source.ts` → `lib-v2/domain/ado/xml-parser/` — change: split the currently-inline XML tokenization into discrete functions (`step-tokenizer`, `parameterized-string-extractor`, `entity-decoder`, `param-extractor`, `data-row-extractor`) matching B1's micro-cathedral towns. Same logic; clearer module boundaries.

**Write fresh:**
- `lib-v2/domain/ado/work-item-envelope.ts` — reason: v1's `WorkItemResponse` shape is implicit; v2 names an explicit `WorkItemEnvelope` with source-text provenance and `rev` threaded.
- `lib-v2/domain/intent/parsed-intent-envelope.ts` — reason: v1 emits unadorned parsed-intent structures; v2's Intent highway contract requires the typed envelope.

**Cross-lane dependencies:**
- `lib/infrastructure/ado/local-ado-source.ts` — D1 (testbed adapter) uses the same verb surface; its shape must be preserved so `source: testbed:v<N>` is polymorphic with `source: ado:<id>`.
- `lib/domain/intent/types.ts` — B5 (test compose) and B6 (test execute) consume parsed intent; the step-shape contract `{ index, action, expected }` with lineage provenance must carry through.

#### Lane B2 — Playwright navigate

**Clean port:**
- `lib/runtime/adapters/navigation-strategy.ts` → `lib-v2/runtime/navigation/navigation-strategy.ts` — route classification (SPA vs. traditional), `waitUntil` selection, timeout handling — maps directly to B2's `waitUntil-selector` + `url-normalizer` towns.

**Port with changes:**
- `lib/runtime/execute/program.ts` (navigation dispatch, inline at call site) → `lib-v2/runtime/navigation/navigate-verb.ts` — change: extract the inline `page.goto(...)` call into a dedicated verb; add the `page.url()` idempotence check before goto (per delta audit §9.3: "missing — explicit `page.url()` idempotence check before goto"); wrap result in the `NavigateEnvelope { reachedUrl, status, timingMs, classification }` shape; emit a navigation-receipt before returning.

**Write fresh:**
- `lib-v2/runtime/navigation/context-pool.ts` — reason: v1 has per-page lifecycle scattered across runtime code; v2 names explicit browser-context pooling.
- `lib-v2/runtime/navigation/outcome-envelope.ts` — reason: no v1 discrete outcome shape.
- `lib-v2/runtime/navigation/failure-classifier.ts` — reason: v1 handles navigation errors inline; v2 requires the named-family classifier.

**Cross-lane dependencies:**
- `lib/runtime/widgets/locate.ts` (B3 locator ladder) — some navigate paths may include a targeted-element readiness check that depends on B3's ladder resolver.
- `lib/composition/scenario-context.ts` — session-startup and cross-screen transitions yield navigate before step execution.

#### Lane B3 — Playwright observe

**Clean port:**
- `lib/playwright/aria.ts` → `lib-v2/runtime/observe/aria.ts` — accessibility snapshot via Playwright's API with `interestingOnly: false` is v2-aligned. Import rewire only.

**Port with changes:**
- `lib/playwright/locate.ts` → `lib-v2/runtime/observe/locator-ladder.ts` — change: **ladder order flips**. v1 is `test-id → role → css`; v2 is `role → label → placeholder → text → test-id → css` per `v2-direction.md` §3.2. Restructure `locatorStrategies()` and `locateForStrategy()` to emit rungs in v2 order (`rung-0-role` → `rung-1-label` → `rung-2-placeholder` → `rung-3-text` → `rung-4-test-id` → `rung-5-css`). This is a load-bearing change; the role-first order is v2's stated best practice.
- `lib/runtime/widgets/locate.ts` → `lib-v2/runtime/observe/locate.ts` — change: wrap `resolveLocator()` to emit `ladder-health-feed` events per rung attempted (consumed by E2). Thread rung index through the return envelope.

**Write fresh:**
- `lib-v2/runtime/observe/snapshot-envelope.ts` — reason: v1 returns unadorned aria-snapshots; v2 requires timestamp + `sourceFingerprint`.
- `lib-v2/runtime/observe/observation-receipt.ts` — reason: no v1 receipt for who-observed / when / through-what-instrument.
- `lib-v2/runtime/observe/mint-candidate-stream.ts` — reason: v1 mints facets post-hoc through proposal activation; v2 emits a streamed candidate queue at observation time.

**Cross-lane dependencies:**
- `lib/domain/widgets/role-affordances.ts` (B4) — observe reads the affordance taxonomy to skip irrelevant rungs; B3 validates availability, B4 dispatches.
- B6 (run-record builder) — observation results thread facet references into run records.
- E2 consumes the `ladder-health-feed` events.

#### Lane B4 — Playwright interact

**Clean port:**
- `lib/domain/widgets/role-affordances.ts` → `lib-v2/domain/widgets/role-affordances.ts` — role-to-method dispatch table. Copy intact.
- `lib/runtime/widgets/interact.ts` → `lib-v2/runtime/interact/action-dispatch.ts` — precondition checking + affordance invocation maps directly onto B4's `preflight-check` + `action-dispatch` towns.

**Port with changes:**
- `lib/playwright/locate.ts` → `lib-v2/runtime/interact/facet-ref-to-locator.ts` — change: the runtime-resolution flow is retained; the input changes from "direct selector" to "facet reference resolved at execution time." The ladder-order flip (B3's change) applies here as well.
- `lib/runtime/result.ts` → `lib-v2/runtime/interact/outcome-envelope.ts` — change: v1's `RuntimeResult<void>` lacks the explicit four-family mapping; v2 wraps outcomes in an envelope carrying the `not-visible | not-enabled | timeout | assertion-like | unclassified` classification.

**Write fresh:**
- `lib-v2/runtime/interact/failure-classifier.ts` — reason: no v1 module gates precondition failures into the four named families. v2's `foldInteractError` requires this.

**Cross-lane dependencies:**
- B5 (test compose) emits tests that consume interact; affordance metadata shape must stay consistent.
- E2 consumes interact outcomes for locator-health tracking.
- B2 (navigate) is a precondition context for some affordances (links, async-loading selects).

#### Lane B5 — Test compose (AST-backed emitter)

**Clean port:**
- `lib/domain/codegen/spec-codegen.ts` → `lib-v2/infrastructure/codegen/ast-emitter.ts` — ts-morph-based AST emission. Copy intact; import helpers from sibling `ts-ast` utility.
- `lib/domain/codegen/method-name.ts` → `lib-v2/infrastructure/codegen/method-name.ts` — derives readable method names per screen from step titles.

**Port with changes:**
- `lib/composition/scenario-context.ts` → `lib-v2/infrastructure/codegen/facet-facade-generator.ts` — change: v1 realizes facades at runtime via screen registry; v2 pre-generates per-screen TypeScript modules regenerated from the facet catalog on each authoring pass. The substance (facet-keyed addressing, no inline selectors) is identical; `ScreenContext` demotes from runtime instantiation to a facade-generation template.
- `lib/domain/intent/types.ts` (`GroundedFlowStep`, `GroundedSpecFlow`) → `lib-v2/domain/codegen/intent-walker.ts` — change: v1's `bindingKind` enum (`bound` / `deferred` / `unbound`) is replaced by a facet-ref lookup result; deferred/unbound steps trigger a structured decision handoff rather than a `test.skip()` annotation.

**Write fresh:**
- `lib-v2/infrastructure/codegen/output-writer.ts` — reason: v1 writes via direct `fs.writeFileSync`; v2 requires atomic temp + rename.
- `lib-v2/infrastructure/codegen/regeneration-on-change.ts` — reason: v1 regenerates on full speedrun; v2 requires catalog-change-triggered incremental invalidation so operator-edited intent layers survive regeneration.

**Cross-lane dependencies:**
- B4 (affordance dispatch) — facade methods encode affordance kinds; compose must translate intent action → affordance kind → method signature.
- B6 (test execute) — emitted file path contract.
- Parametric expansion (§9.19 Aligned in delta audit) carries through untouched.

#### Lane B6 — Test execute (Playwright runner adapter)

**Clean port:**
- `lib/composition/scenario-context.ts` (runner-invocation parts) → `lib-v2/infrastructure/runner/runner-invocation.ts` — test entry point via `test()` decorator and `test.step()` wrapping. Copy the runner-invocation slice.

**Port with changes:**
- `lib/application/commitment/build-run-record.ts` → `lib-v2/application/runner/run-record-builder.ts` — change: v1's `RunRecord` embeds step-level classification; v2 lifts classification to a run-envelope-level field (`classification: 'product-pass' | 'product-fail' | 'fail-drift' | 'fail-infra' | 'unclassified'`).
- `lib/runtime/scenario.ts` (`runScenarioHandshake` + `stepHandshakeFromPlan`) → `lib-v2/application/runner/failure-differentiator.ts` — change: the per-step classification logic present in v1 must aggregate up to the run envelope.

**Write fresh:**
- `lib-v2/infrastructure/runner/config-resolution.ts` — reason: v1 uses hardcoded Playwright config; v2 wires trust-policy per-run config (project, retries, timeout).
- `lib-v2/application/runner/referenced-facet-tracker.ts` — reason: v1 infers facet-touch from step-level evidence post-hoc; v2 requires an explicit facet-touch log emitted mid-run so E1 corroboration has a direct input.

**Cross-lane dependencies:**
- B5 (test compose) — emitted test file path contract.
- B4 (interact per step) — step outcomes roll up to run classification.
- E1, E2, E5 — run records feed memory corroboration, health tracking, and drift classification respectively.

#### Lane B7 — Reasoning adapter (one provider)

**Clean port:**
- `lib/application/resolution/translation/translation-provider.ts` (llm-api strategy path) → `lib-v2/infrastructure/reasoning/anthropic-adapter.ts` or equivalent — HTTP + auth + retry + parse. Copy intact for the chosen provider.
- `lib/application/agency/agent-interpretation-cache.ts` → `lib-v2/infrastructure/reasoning/result-cache.ts` — fingerprinting and cache envelope logic is portable intact; key input shape unchanged.
- `lib/runtime/resolution/rung8-llm-dom.ts` → `lib-v2/application/reasoning/dom-constraint-handler.ts` — pure signal extraction + confidence scoring; becomes a constraint inside `reason-select` rather than a separate rung.

**Port with changes:**
- `lib/application/resolution/translation/translation-provider.ts` → `lib-v2/infrastructure/reasoning/provider-client/` — change: unify v1's three distinct error tags (`TranslationProviderTimeoutError`, `TranslationProviderParseError`, misc) into the five named families; extract `buildTranslationSystemPrompt` / `buildTranslationUserMessage` into `operation-handlers/select-handler/prompt-template`.
- `lib/application/agency/agent-interpreter-provider.ts` → `lib-v2/application/reasoning/operation-handlers/` — change: split v1's three provider types (disabled / llm-api / session) plus heuristic into the three operation handlers (`select` / `interpret` / `synthesize`); drop `ABTestConfig` routing (workshop scaffolding); move vision-config specificity into the provider-specific adapter.
- `lib/composition/local-runtime-scenario-runner.ts` (LLM callsites) → `lib-v2/composition/saga-helpers.ts` — change: replace `resolveTranslationProvider()` / `resolveAgentInterpreterPort()` factory calls with `yield* Reasoning.select(...)` / `yield* Reasoning.interpret(...)` sagas. Provider binding moves to composition-time `Layer.succeed(Reasoning.Tag, <adapter>)`.

**Write fresh:**
- `lib-v2/infrastructure/reasoning/response-validator/error-family-classifier.ts` — reason: no v1 module maps HTTP and parse outcomes into the closed set of five families.
- `lib-v2/infrastructure/reasoning/response-validator/constrained-retry.ts` — reason: v1 has retry policies but no "one retry with explicit reminder on malformed response" protocol.
- `lib-v2/infrastructure/reasoning/receipt-emitter/reasoning-receipt-log.ts` — reason: v1 has caches but no durable reasoning-receipt log with `{ promptFingerprint, tokensIn, tokensOut, providerId, operationKind, timestamp }`.
- `lib-v2/infrastructure/reasoning/provider-client/auth.ts` — reason: v1 embeds API key loading in composition; v2 isolates it so secrets never appear in logs.

**Migration callsites (v1 LLM callers that move to `Reasoning.Tag`):**
- `lib/application/resolution/translation/translation-provider.ts` (rung-5 translator) — becomes `yield* Reasoning.select(...)`.
- `lib/application/agency/agent-interpreter-provider.ts` (rung-9 interpreter) — becomes `yield* Reasoning.interpret(...)`.
- `lib/runtime/resolution/rung8-llm-dom.ts` (rung-8 DOM probe) — becomes a constraint inside `reason-select(..., { domOnly: true })`.
- `lib/composition/local-runtime-scenario-runner.ts` — composition initialization becomes `Layer.succeed(Reasoning.Tag, <adapter>)`.

**Cross-lane dependencies:**
- A2 — B7 implements the port A2 declares. No downward dependency; B7 lights up A2.
- B6 (run-record log) — shared append-only receipt discipline; reasoning-receipts carry `{ stepId, runId }` for traceability.
- D2 — future cost/latency metric verbs consume the reasoning-receipt log.
- E3 / E4 / E5 / E7 — every saga that yields Reasoning binds against the adapter chosen at composition.

### 13.3 D-track — measurement substrate

#### Lane D1 — Testbed adapter (testbed:v0)

**Clean port:**
- None. v1's scenario corpus partition (`dogfood/scenarios/10000-series` legacy and `20000-series` generated) is deliberately omitted per `v2-direction.md` §4B. v2's testbed is greenfield.

**Port with changes:**
- None. `lib/application/synthesis/cohort-generator.ts` and `lib/domain/synthesis/cohort-orchestrator.ts` generate algorithmic cohorts; v2's testbed verisimilitude grows in *named, committed increments* (v0 → v1 → v2 …), not algorithmically. The concept survives; the implementation does not.

**Write fresh:**
- `lib-v2/infrastructure/testbed/testbed-source.ts` — reason: polymorphic `intent-fetch` reading `testbed/v<N>/*.yaml` and returning the same parsed-intent envelope as ADO.
- `testbed/v0/*.yaml` — reason: handful of synthetic work items (one screen, one affordance, one assertion each), hand-committed with known expected outcomes.
- `testbed/v0/manifest.yaml` — reason: version metadata + verisimilitude narrative.

**Cross-lane dependencies:**
- B1 (ADO adapter) — shares the `intent-fetch` verb surface; the source field (`source: testbed:v<N>:<id>` vs `source: ado:<id>`) is the only downstream-visible difference.
- A4 (facet schema) — testbed work items reference facet IDs; A4's stable-id discipline must be in place.
- D2 — reads the expected-outcome registry D1 commits.

#### Lane D2 — First two metric verbs

**Clean port:**
- None. v1's eight pipeline-fitness classes (`translation-threshold-miss`, `normalization-gap`, etc.) are workshop scaffolding; they are not ported per delta audit V1.4.

**Port with changes:**
- `lib/application/improvement/convergence-proof.ts` → informs `lib-v2/application/measurement/convergence-metrics.ts` — change: v1's N-trial harness reimplements as metric-verb derivations (`metric-convergence-delta-p50`, `metric-convergence-variance-p95`). The statistical shape (unfold/fold trial aggregation) survives; the computation surface moves from a standalone harness into composable metric verbs.
- `lib/application/improvement/improvement.ts` (`ObjectiveVector`, `ImprovementLineageEntry`) → informs `lib-v2/domain/measurement/metric-framework.ts` — change: v1's per-SHA lineage pattern becomes v2's windowing-by-testbed-version + derivation-lineage field. Append-only ledger discipline survives; specific shapes do not.

**Write fresh:**
- `lib-v2/application/measurement/metric-engine.ts` — reason: pure metric computation — takes run-record log (filtered by window/version), produces scalar + derivation-lineage.
- `lib-v2/domain/measurement/metric-types.ts` — reason: `MetricVerb<Inputs, Output>` shape; `MetricComputeRecord` append-only entry; `MetricDerivation` linking result to the run subset.
- Manifest declarations: `metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-hypothesis-confirmation-rate` frozen at Phase 5 — reason: these are net-new verbs.

**Cross-lane dependencies:**
- D1 — metric denominators require expected-outcome anchors from the testbed registry.
- D3 — `metric-hypothesis-confirmation-rate` is declared by D2 and populated by D3.
- B6 — produces run records; D2 reads them read-only.

#### Lane D3 — Hypothesis-receipt discriminator

**Clean port:**
- None. v1 has no hypothesis-receipt log. `ImprovementRun` + `ImprovementLedger` are workshop artifacts, not shipping primitives.

**Port with changes:**
- `lib/domain/proposal/lifecycle.ts` (`ProposalTransitionEvent`, `transitionProposal` FSM) → `lib-v2/domain/proposal/lifecycle.ts` — change: the proposal state machine ports as-is; a `kind: 'hypothesis' | 'revision' | 'candidate'` discriminator is added *outside* the FSM at entry.

**Write fresh:**
- `lib-v2/application/measurement/hypothesis-dispatch.ts` — reason: on approved proposals with `kind: 'hypothesis'`, extracts `predictedDelta` and registers against the proposal id.
- `lib-v2/application/measurement/verify-hypothesis.ts` — reason: post-evaluation saga computes `actualDelta` via the named metric, compares to `predictedDelta`, appends verification receipt.
- `lib-v2/infrastructure/measurement/verification-receipts.jsonl.ts` — reason: append-only log writer; temp + rename; no in-place mutation.

**Cross-lane dependencies:**
- D2 — reads the verification-receipt log to compute `metric-hypothesis-confirmation-rate`.
- B6 — D3 reads run records post-execution, filtering by `source` to match the testbed version the hypothesis targeted.
- E1 — hypotheses that propose memory changes (L2+) read per-facet evidence logs to measure memory-corroboration-rate delta; deferred to Phase 6 shipping.

### 13.4 E-track — memory layers

#### Lane E1 — Per-facet evidence log

**Clean port:**
- `lib/application/commitment/persist-evidence.ts` → `lib-v2/infrastructure/memory/evidence-store.ts` — step-level evidence write path; repurpose the file-write discipline for facet-scoped JSONL appends.

**Port with changes:**
- `lib/application/knowledge/confidence.ts` → `lib-v2/application/memory/confidence-derivation.ts` — change: v1 materializes confidence as a field on the facet's `acquired` block (static snapshot via `scoreForAggregate()`); v2 derives confidence on-read from the accumulated evidence log with aging applied. The scoring formula (`0.35 + successCount * 0.2 + ...`) is reusable; the storage strategy flips from field-mutation to log-fold.
- `lib/domain/evidence/types.ts` → `lib-v2/domain/memory/evidence-schema.ts` — change: v1 carries evidence as step-indexed artifact references with implicit facet association; v2 requires an explicit evidence-event schema `{ observedAt, instrument, outcome, runId }` keyed per facet.

**Write fresh:**
- `lib-v2/application/memory/aging-scheduler.ts` — reason: v1 has no decay-over-time mechanism. v2's half-life kernel is new.
- `lib-v2/infrastructure/memory/evidence-log-store.ts` — reason: v1 step-evidence lives at `.tesseract/evidence/runs/{adoId}/{runId}/step-*.json` with implicit facet association; v2 requires explicit per-facet JSONL files with atomic-append safety.

**Cross-lane dependencies:**
- `lib/application/knowledge/activate-proposals.ts` — trust-policy gates currently read the `acquired` static field; when E1 is active, those reads shift to the E1 confidence API.
- `lib/runtime/resolution/proposals.ts` — proposal activation emits new evidence; must hook into E1's append path.
- E2 — shares observation outcomes with E1; E2 consumes for per-strategy health, E1 consumes for corroboration weight.

#### Lane E2 — Locator-health co-location

**Clean port:**
- `lib/application/drift/selector-health.ts` → `lib-v2/application/memory/health-index.ts` — pure computation of metrics (success rate, flakiness, trend) is reusable. Minimal shape adjustment: v1 keys by string `"test-id:rung0"`; v2 embeds health inside the facet's locator-strategy struct. Core aggregation logic ports; keying flips.

**Port with changes:**
- `lib/runtime/resolution/index.ts` (ladder walker) → `lib-v2/runtime/observe/outcome-intake.ts` — change: v1 emits observation outcomes implicitly as side effects of walking rungs; v2 requires explicit outcome-event emission at each rung attempt, classified into per-strategy health deltas.

**Write fresh:**
- `lib-v2/application/memory/ladder-reorderer.ts` — reason: v1's ladder is statically ordered; v2 reranks dynamically based on observed health.
- `lib-v2/application/memory/drift-signal.ts` — reason: v1 detects drift at step-execute time (B6); E2 surfaces `strategy-failed-threshold` as a separate signal feeding E5.
- `lib-v2/application/memory/health-cache.ts` — reason: cache invalidation hook for when E1 appends evidence affecting the same facet's locators.

**Cross-lane dependencies:**
- B3 / B4 — outcome feeds originate in observe/interact lanes; they emit structured outcome events E2 consumes.
- E1 ↔ E2 — bidirectional: E2's health feeds facet-query ranking (A4); E1's confidence contributes to E2's corroboration-weight.
- E5 — E2's threshold breach is one input to drift classification.

#### Lane E3 — Dialog capture

**Clean port:**
- None. §9.14 is Absent in v1.

**Port with changes:**
- `lib/domain/handshake/intervention.ts` → informs `lib-v2/application/memory/dialog-review.ts` — change: v1's `InterventionReceipt` captures broad operator interactions; E3 narrows to dialog-turn-specific structure. The receipt + rationale envelope shape is reusable; specialize for `{ speaker, timestamp, rawText, session }`.

**Write fresh:**
- `lib-v2/infrastructure/dialog/dialog-channel.ts` — reason: fresh transport for operator dialog turns; v1 has no structured dialog source (MCP tools exist but no capture infrastructure).
- `lib-v2/application/memory/interpretation-handler.ts` — reason: LLM-assisted extraction of domain-informative turns; wires to B7's `reason-interpret`.
- `lib-v2/application/memory/candidate-review-queue.ts` — reason: operator-facing review loop; v1 has no candidate-queue for dialog-sourced candidates.
- `lib-v2/application/memory/decision-intake.ts` — reason: wires approve/reject/edit decisions into facet-mint (A4) or rejection-log.

**Cross-lane dependencies:**
- B7 (Reasoning) — E3's interpretation-handler depends on Reasoning.Tag being available.
- A4 (facet mint) — approve-handler lands a dialog-extracted candidate as a new facet.
- F3 (operator-review UI) — F3's queue surface is E3's decision transport.

#### Lane E4 — Document ingest

**Clean port:**
- None. §9.14 is Absent in v1.

**Port with changes:**
- `lib/domain/governance/workflow-types.ts` (`Provenance` shape) → `lib-v2/domain/memory/region-anchor.ts` — change: v1 provenance carries `sourceArtifactPaths` + `lineage`; E4 extends with region anchors `{ path, startOffset, endOffset, headings }`. Reuse the base; extend.

**Write fresh:**
- `lib-v2/infrastructure/document/document-adapter.ts` — reason: fresh parser for markdown (and later PDF / Confluence).
- `lib-v2/infrastructure/document/region-chunker.ts` — reason: splits documents into addressable regions.
- `lib-v2/application/memory/candidate-extraction.ts` — reason: per-region `reason-interpret` with region context.
- `lib-v2/application/memory/deduplication.ts` — reason: anchor-based dedup prevents repeat-ingest double-counting.
- `lib-v2/application/memory/review-queue-integration.ts` — reason: E4 shares E3's queue; the integration point formalizes the shared contract.

**Cross-lane dependencies:**
- B7 (Reasoning) — required for per-region interpretation.
- E3 — shared review queue; both lanes append to the same candidate stream.
- A4 (facet mint) — approved document candidates land with region-anchor provenance preserved.
- F3 — operator review over the unified queue.

#### Lane E5 — Drift emit

**Clean port:**
- None. v1 drift is mutation-prescriptive (rewrites YAML); v2 drift is observation-emitted (append-only event log).

**Port with changes:**
- `lib/application/drift/rung-drift.ts` → `lib-v2/application/drift/rung-drift.ts` — change: reframe as an observation extractor. The pure extraction functions (`extractRungObservations`, `buildRungHistory`, `detectRungDrift`, `computeRungStability`) map directly onto E5's `drift-classifier` + `confidence-reducer` inputs; the mutation verbs go away.
- `lib/application/drift/selector-health.ts` → shared with E2 — change: trend-detection logic feeds E5's classifier as well as E2's reorderer.

**Write fresh:**
- `lib-v2/application/drift/drift-classifier.ts` — reason: v1 has no module that classifies a step outcome as product-vs-drift and names the mismatch kind (`stale-locator | changed-role | moved-element | …`).
- `lib-v2/infrastructure/drift/drift-events.jsonl.ts` — reason: v1 has no central event log; drift is scattered as mutation side effects in YAML files.
- `lib-v2/application/memory/confidence-reducer.ts` — reason: v1 has no decay kernel. Pure function that translates drift events into confidence adjustments on linked facets.

**Cross-lane dependencies:**
- `lib/application/drift/drift.ts` — mutation kinds (`label-change`, `locator-degradation`, `element-addition`, `alias-removal`) are *evidence* of what drift looks like; they inform E5's mismatch-kind taxonomy even though the mutation verbs do not port.
- A4 (facet store) — drift appends confidence-reducing events to per-facet evidence logs.
- B6 — drift-classified failures originate at test-execute classification.
- E7 — the drift log is one input to revision-synthesis.

#### Lane E6 — DOM-less authoring policy

**Clean port:**
- None. Policy evaluation on per-surface confidence is new.

**Port with changes:**
- `lib/application/knowledge/confidence.ts` → `lib-v2/application/memory/surface-confidence.ts` — change: v1's `buildConfidenceOverlayCatalog` computes *artifact*-level confidence (per elements.yaml, hints.yaml). E6 needs *surface*-level aggregation (all facets on a screen → one confidence scalar). Reuse the scoring formula; change the aggregation scope.

**Write fresh:**
- `lib-v2/application/memory/dom-less-policy.ts` — reason: v1 has no policy evaluator. Pure decision function; threshold-gate + per-session cache + drift-consequence demotion.
- `lib-v2/application/authoring/authoring-path-router.ts` — reason: v1's authoring path is not parameterized by confidence policy; v2 dispatches to `with-observation` or `dom-less` path.

**Cross-lane dependencies:**
- E1 — surface confidence derives from per-facet evidence logs.
- E5 — drift events demote surfaces below threshold; authoring reverts to observation on next session.
- D2 — a new metric verb `metric-dom-less-fraction` (F2 catalog growth) measures throughput under this policy.

#### Lane E7 — Aging / corroboration / revision-propose

**Clean port:**
- None. All three concerns are Absent in v1 per §9.15.

**Port with changes:**
- `lib/application/improvement/iteration-journal.ts` → `lib-v2/application/memory/decision-memory.ts` — change: v1's rejection-memory prevents proposal thrashing (`'accepted' | 'rejected' | 'deferred'` within a sliding window). E7 repurposes the windowed-append pattern for corroboration-strength memory tracking passing-run reliability. Data structure is portable; the decision axis changes.
- `lib/application/drift/selector-health.ts` (`computeTrendFromObservations`) → reused — change: trend classification (improving / stable / degrading) feeds aging detection.

**Write fresh:**
- `lib-v2/application/memory/aging-scheduler.ts` — reason: periodic-tick daemon with half-life kernel; no v1 analog.
- `lib-v2/application/memory/corroboration-hook.ts` — reason: post-test-execute hook capturing passing runs, extracting referenced facets, appending corroboration events weighted by run reliability.
- `lib-v2/application/memory/revision-synthesizer.ts` — reason: drift aggregator + pattern detector + Reasoning call + proposal envelope emitter. Net-new composition.
- `lib-v2/composition/maintenance-cycle.ts` — reason: scheduled daemon saga orchestrating aging-scheduler, corroboration-intake, and revision-synthesis.

**Cross-lane dependencies:**
- E1 — aging + corroboration append to per-facet evidence logs.
- E5 — drift events aggregate into revision-synthesis patterns.
- B7 — revision-synthesizer yields Reasoning for proposal rationale.
- F3 — revision proposals enter the shared review queue.
- D3 — hypothesis-receipts scaffold verification of revision impact over time.

### 13.5 F-track — cross-phase lanes

#### Lane F1 — Testbed growth

**Clean port:**
- None. v1's scenario corpus is deliberately omitted (see D1 and `v2-direction.md` §4B).

**Port with changes:**
- None. The cohort-generation concept is retired; v2 grows testbed through named, committed increments, not algorithmic synthesis.

**Write fresh:**
- `testbed/` — reason: v2 testbed is a first-class intent source; v1 scenarios are migration scaffolding.
- `testbed/v0/`, `testbed/v1/`, … — reason: one directory per version, deliberately simple at v0, one named increment per bump.
- `testbed/versions.yaml` — reason: version manifest with increment narrative per version; required for cohort-comparable measurement.

**Cross-lane dependencies:**
- D1 — the testbed adapter reads F1's content; F1 must exist before D1 lights up.
- A4 — testbed work items reference facet IDs; stable-id discipline must hold.

#### Lane F2 — Metric catalog growth

**Clean port:**
- None. v1's fitness classifier (eight classes) is workshop scaffolding, not a metric-verb catalog.

**Port with changes:**
- `lib/application/improvement/fitness.ts` → informs `lib-v2/application/measurement/classifier-patterns.ts` — change: the *pattern* of classified outcomes with aggregated counters is portable; the specific class names do not port (they are workshop labels). v2 uses runtime error families, not fitness classes.
- `lib/application/improvement/improvement.ts` (`ImprovementRun` shape) → informs `lib-v2/domain/measurement/metric-framework.ts` — change: v1's `ObjectiveVector` + per-SHA lineage collapses into windowed metric-verb derivations; append-only ledger discipline survives.

**Write fresh:**
- `lib-v2/domain/measurement/metrics.ts` — reason: the catalog owner. Starts with three declared metric verbs; extension is proposal-gated.
- `lib-v2/domain/measurement/metric-compute-record.ts` — reason: when a metric is computed, a compute record appends to the run log. Unique to v2's verb-first emission discipline.

**Cross-lane dependencies:**
- D1 — metrics derive over testbed-sourced run records.
- D3 — `metric-hypothesis-confirmation-rate` is one of F2's metrics; it depends on D3's verification-receipt log.

#### Lane F3 — Operator-review UI

**Clean port:**
- `lib/infrastructure/dashboard/file-decision-bridge.ts` → `lib-v2/infrastructure/handshake/file-decision-bridge.ts` — the atomic temp-rename transport is v1's standout innovation (delta audit V1.6). Load-bearing and shape-correct for v2. Copy intact.

**Port with changes:**
- `lib/domain/handshake/intervention.ts` → informs `lib-v2/composition/decision-intake.ts` — change: v1's `InterventionHandoff` is optional on `InterventionReceipt`; in v2 every agentic decision produces a handoff receipt. Shape stays; discipline tightens.
- `lib/domain/observation/dashboard.ts` (`WorkItemDecision`) → `lib-v2/domain/memory/candidate-decision.ts` — change: the three-state decision (approve / reject / edit) is portable; the queue-integration layer and rejection-rationale preservation are new surfaces.

**Write fresh:**
- `lib-v2/application/memory/candidate-review.ts` — reason: the unified review queue for proposals. v1 has no explicit queue; v2 makes it first-class.
- `lib-v2/composition/decision-intake.ts` — reason: fiber-resumption logic for decisions picked up from the file bridge. v1 embeds this in the MCP server; v2 lifts to a composable layer.
- `lib-v2/cli/review.ts` — reason: `review list / review show / review approve|reject|edit` verbs. JSONL queue + CLI is sufficient for construction; richer surfaces emerge only under customer pressure (per §12.5.5 Lane F3 spec).

**Cross-lane dependencies:**
- The v1 file bridge (CLEAN PORT above) is the transport F3 watches.
- All proposal-gated sagas (E3 / E4 / E5 / E7, plus hypothesis approval) wait on F3.
- `lib/infrastructure/mcp/dashboard-mcp-server.ts` — F4 will expose the same decision verbs via MCP; F3's CLI and the MCP adapter are two faces of the same decision surface.

#### Lane F4 — Dashboard plug-in

**Clean port:**
- None at full-file granularity. The 33-tool surface ports piece by piece under port-with-changes.

**Port with changes:**
- `lib/infrastructure/mcp/dashboard-mcp-server.ts` → `lib-v2/infrastructure/dashboard/mcp-server.ts` — change: the transport layer ports; the hardcoded 33-tool list becomes a *derived* projection over the vocabulary manifest (A3). Once manifest verbs are declared, F4 regenerates the dashboard tool catalog as a read-only subset organized by (Observe | Control | Metric) category.
- `lib/domain/observation/dashboard.ts` (`McpToolDefinition`, `dashboardMcpTools`) → `lib-v2/domain/dashboard/manifest-driven-projection.ts` — change: tool definitions become manifest-verb references rather than hand-maintained records.
- `lib/runtime/observe/snapshots.ts` (snapshot templates) → informs F4's log-reader enrichments — change: templates are preserved; F4's reader may enrich with derived data (confidence overlays from E1, drift summaries from E5).

**Write fresh:**
- `lib-v2/infrastructure/dashboard/log-reader.ts` — reason: F4 reads five append-only logs (run records, receipt log, drift-events, proposal log, reasoning-receipts) and projects them. Explicit, testable, pure.
- `lib-v2/domain/dashboard/snapshot-envelope.ts` — reason: unified output envelope `{ window, metrics, highlights, proposals }`. No v1 contract exists.
- `lib-v2/cli/dashboard.ts` — reason: CLI text format for operator inspection, parallel to F3's CLI.
- `lib-v2/tests/architecture/dashboard-read-only.law.ts` — reason: architecture law enforcing F4's read-only discipline. Any write attempt from within F4's modules fails the build.

**Cross-lane dependencies:**
- A3 — F4 enumerates dashboard tools as manifest-driven projections; A3 must be stable.
- F2 — F4 invokes metric verbs by name.
- D1 — F4 filters by `source` field to distinguish testbed runs from production.
- B7 — F4 may delegate LLM-assisted summarization to Reasoning; read-only discipline holds (reasoning calls emit receipts via B7, which is their side effect, not F4's).

### 13.6 Salvage summary — how much of v2 is fresh

| Track | Lanes | Clean-port files | Port-with-changes files | Fresh modules | Character |
|---|---|---:|---:|---:|---|
| A | A1–A4 | 6 | 6 | 13 | Substrate; mostly ported, some consolidation |
| B | B1–B7 | 8 | 11 | 14 | Heavy reuse from v1's L0 chain; envelopes and receipts fresh |
| D | D1–D3 | 0 | 3 | 8 | Measurement is greenfield in content; shape adjustments only |
| E | E1–E7 | 2 | 7 | 16 | Evidence log + dialog/document ingest are largely fresh |
| F | F1–F4 | 1 | 5 | 10 | File-decision bridge is v1's standout innovation; content lanes are fresh |
| **Total** | **25** | **17** | **32** | **61** | |

Counts are nominal and will shift as Phase 0 scaffolding resolves concrete file layouts. The shape is what matters: **roughly a third clean port, a third port-with-changes, a third fresh**. That ratio is what `v2-direction.md` §3 leads with ("v2 draws from v1 where v2 needs it and v1 has it in the right shape") and what §4 constrains ("v2 redesigns fresh where the right shape differs").

### 13.7 Three-bucket reading of the audit

The 25-lane audit resolves into three strategic buckets future agents can plan against.

**Bucket 1: lanes that ship fast because v1 did the work.** A1, B1, B2 (mostly), B3 (with ladder flip), B4, B5 (runner-invocation slice), B6 (runner-invocation slice), E2 (core health math), F3 (file bridge). These lanes have substantial clean-ports; the author's job is import rewiring + receipt discipline + envelope wrapping. Phase 0–3 wall time is dominated by these.

**Bucket 2: lanes that consolidate v1's scattered work.** B7 (Reasoning adapter — the single biggest consolidation), A4 (facet schema — unifies two v1 files into one record), E1 (confidence derivation — strategy flip from static snapshot to log fold), F4 (dashboard — from hardcoded 33 tools to manifest-driven projection). These lanes carry most of the "port with changes" weight and deliver the largest structural wins.

**Bucket 3: lanes that are greenfield because v1 lacked the concern.** A2 (Reasoning port declaration), A3 (manifest generator + fluency), D1–D3 (measurement substrate), E3 (dialog capture), E4 (document ingest), E5 (drift as emitted event with log), E6 (DOM-less authoring policy), E7 (aging / corroboration / revision), F1 (testbed growth), F2 (metric catalog). These lanes are where v2 most visibly exists as v2 and where the substrate's shipping claims are forced into new code.

A future agent picking up any lane can read this section, identify its bucket, and know what to expect. Bucket 1 lanes are about migration rigor. Bucket 2 lanes are about clean refactoring. Bucket 3 lanes are about new design. The descent protocol (§12) applies identically across all three; the salvage audit here tells the author which kind of work they are actually doing.

**No additional discovery required.** Every v1 file with a salvage opportunity is named. Every shape adjustment is spelled out. Every fresh module is justified. A future agent opens this section, finds their lane, and starts working.

