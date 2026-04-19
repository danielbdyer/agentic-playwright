# v2 Direction

> Status: primary strategy document for v2. The substrate (`v2-substrate.md`), the feature ontology (`feature-ontology-v2.md`), the delta audit (`v2-delta-audit.md`), and the transmogrification plan (`v2-transmogrification.md`) are subsidiary to this one and serve as elaboration.

This document is prescriptive. It states what v2 is, names how v1 compartmentalizes into v2, names which surfaces retire and which port forward, and works backwards from the envisioned destination to a construction order. Where the subsidiary documents describe or audit, this one directs.

The working frame: **v2 is v1 compartmentalized into three folders — `product/`, `workshop/`, `dashboard/` — each with a single responsibility and a manifest-mediated seam to its siblings.** The product is what ships to customers. The workshop consumes the product's manifest to derive probes that measure whether the product is getting better; it puts itself out of a job as probe coverage converges. The dashboard is a read-only observer over both. The primary feature is agent discovery — a fresh session opens one folder and orients, instead of paying token cost to re-separate concerns that were never meant to be fused. Decoupling the three is the feature; 10× per-lane development velocity is the payoff.

## 1. What v2 is

v2 is a codebase that lets a single agent, given a backlog of Azure DevOps test cases against a customer's OutSystems application, author a Playwright test suite a professional QA team would call professionally authored — and do so faster over time as the agent accumulates memory of the application under test. The codebase is organized into three compartments that never blur at the seam:

- **`product/`** — the packageable core. What ships to customers. The agent-facing surface (vocabulary manifest, facet catalog, QA-legible tests) plus the instruments the agent calls (intent-fetch, observe, interact, test-compose, test-execute, Reasoning). Has no dependencies on workshop or dashboard code, and no knowledge that they exist.
- **`workshop/`** — the measurement consumer. Reads `product/`'s manifest and derives probes that exercise every declared verb × facet-kind × error-family combination. Runs authoring against those probes, records evidence, derives metrics, gates activations against the trust policy, and issues hypothesis receipts. Can import from `product/`; `product/` cannot import from it. Does not ship to customers. Puts itself out of a job when probe coverage converges against a steady-state product surface.
- **`dashboard/`** — the read-only observer. Projects `product/` artifacts and `workshop/` artifacts through manifest-declared verbs into a human view. Writes nothing. Replaceable without touching either of its upstreams.

The **three things v2 ships** to the customer (all from `product/`):

1. A **vocabulary manifest** the agent reads on every session, listing every verb the agent can call with stable signatures and named error families.
2. A **facet catalog** — the memory that grows from authoring work, self-describing, provenance-threaded, and consultable by intent phrase. The catalog is the compounding asset; its quality is what makes tomorrow's authoring cheaper than today's.
3. **QA-legible tests** in the customer's existing test framework (Playwright), referencing facets by name, not selectors. Tests are the visible output; the catalog is the durable one.

Everything else is implementation. The ADO adapter, the Playwright adapters, the test emitter, the envelope substrate — all are libraries `product/` consumes. Only those three surfaces face the customer.

The **five primitives** the system is made of — agent, intent source, world, instruments, memory — are listed in the substrate. The **five levels** — L0 agentic authoring, L1 discovery memory, L2 operator-supplied semantics, L3 DOM-less authoring, L4 self-refinement — are the growth spine. The **ten invariants** (stable verb signatures, provenance at mint, append-only history, named error families, no silent escalation, reversible agentic writes, source vocabulary preserved, one source of truth per concern, cheap introspection, structured fallthrough) hold across every handshake. These are described elsewhere; this doc takes them as given.

What v2 is *not*: a greenfield rewrite. v2 is v1 reshaped — the envelope-axis substrate, the L0 data-flow chain, the governance brands, the seven-visitor metric tree, the trust policy, the file-backed decision bridge, and the proto-Reasoning ports all port forward. What v2 redesigns is the seam between shipping surface and measurement surface; what v2 retires is the scaffolding that accrued while the seam was unclear.

## 2. The essentialization — three compartments, one seam

v1 accrued a coupling debt. The dashboard, the improvement loop, and the agent-facing surface grew into the same bag and began calling into each other's internals from both directions. That coupling is what stalled late-v1 development: a single feature change had to negotiate three constituencies at once, and agent sessions paid an enormous token cost to re-separate concerns that were already fused in the code.

v2 unstitches the seam.

**`product/`** is the narrow shipping surface from §1: manifest, catalog, tests, plus the instruments the agent calls. Its design principles are agent fluency, memory compounding, selector and data indirection, QA legibility, structured fallthrough, reversibility gated by operator review. Its success is measured by the customer's QA team accepting the tests and the agent's time-to-working-test dropping over the corpus. It depends on nothing upstream and knows nothing about workshop or dashboard.

**`workshop/`** is the measurement consumer. It imports `product/`'s manifest, derives probes from the declared verbs and facet kinds, runs authoring against those probes through `product/`'s normal paths, and writes its findings into append-only logs (run-record, evidence, receipt, proposal, scorecard, metric-compute). The workshop owns the seven-visitor metric tree, the scorecard history, the convergence-proof harness, the trust-policy gate, and the hypothesis-receipt discipline. It measures whether `product/` is getting better over time. It does not ship to customers, and it has an explicit graduation condition: when probe coverage saturates against a steady-state product surface and the batting average stays above its floor, the workshop's active role is done and it degrades to a passive alarm.

**`dashboard/`** is the read-only observer. It projects both upstreams into a human view — pending proposals, scorecard trends, batting average, queue items, fitness metrics — through manifest-declared verbs. It writes nothing to either upstream. If it breaks or is retired, neither `product/` nor `workshop/` notices.

The seam between the three is a contract, not a convention. It has two parts: **the vocabulary manifest** (what `product/` declares it can do) and **the append-only log set** (what `product/` emits as side-effects of doing it). Workshop reads both. Dashboard reads both. Neither writes across the seam except through proposal-gated reversibility. A workshop metric that cannot be derived from the manifest plus the logs is either malformed or signals a missing product verb — and the missing verb is the feature, not a workaround.

This is not a cost-cutting move; it is a **clarity move** applied ruthlessly. Once the three compartments are separable, agent discovery becomes cheap: a fresh session opens one folder, reads one `README`, and orients. Features develop faster because each compartment has a narrow public contract instead of a diffuse mutual dependency. The anti-scaffolding gate applies with equal force to all three — `workshop/` is not granted a kitchen sink; its being "for the team, not the customer" is a shipping discipline, not an architectural one. Coupling debt across compartments is the failure mode v2 exists to prevent.

The consequence for how v2 is built: **every line of code in v2 is justified by whether it helps the agent ship tests to the customer (`product/`), helps the team and the agent verify that shipping is working (`workshop/`), or helps anyone read the first two without modifying them (`dashboard/`)** — and the line lives in exactly one of the three.

## 3. What ports forward from v1

v1 contains the majority of what v2 needs. The task is compartmentalization and targeted reshape, not rewrite. Each subsection names what lives where, what changes at the seam, and what doctrinal value survives the move.

### 3.1 Envelope-axis substrate — moves into `product/domain/`, unchanged

**v1 assets:** `lib/domain/governance/workflow-types.ts` (WorkflowMetadata, WorkflowEnvelope, governance phantom brands, foldGovernance), `lib/domain/kernel/hash.ts` (Fingerprint<Tag> with closed 30+ tag registry, stableStringify, sha256), `lib/domain/pipeline/source.ts` (PhaseOutputSource, foldPhaseOutputSource, PostureSourceBound), `lib/domain/handshake/epistemic-brand.ts` (EpistemicallyTyped, foldEpistemicStatus, audited mint functions).

**Destination:** `product/domain/`. The substrate is more meticulous than previous drafts of this doc credited — the Envelope ⊣ Receipt adjunction is formalized with a round-trip law, the fingerprint tag registry is closed and enforced, `mintObserved` is compile-gated against synthetic sources (the A2 invariant is type-safe today, not a convention), and `PhaseOutputSource` encodes reference-canon doctrine via `PostureSourceBound` mapped types. Phase 0a/0b/0c/0d all landed as of 2026-04-11.

**Why it belongs in `product/`:** these phantom types are what make the ten invariants compile-time guarantees instead of runtime hopes. Every envelope crossing every seam carries them. `workshop/` imports them; `dashboard/` imports them; neither modifies them.

**Adjustments at the move:** none of the type shapes change. The reference-canon doctrine retirement described in §4 is a **type-level surgical edit on `source.ts`** — the `PhaseOutputSource` union contracts from six variants to five as the demotion sweep completes, and `PostureSourceBound` updates accordingly. Phases B–E of the envelope-axis refactor continue in-place as needed; they do not block the compartmentalization move.

### 3.2 L0 data-flow chain — moves into `product/`, with named shape adjustments

**v1 assets and their destination:**
- `lib/infrastructure/ado/live-ado-source.ts` → `product/instruments/intent/ado-source.ts`. REST v7.1 + WIQL + XML regex for `Microsoft.VSTS.TCM.Steps`, parameter and data-row extraction. No logic changes; wrap behind the manifest's `intent-fetch` and `intent-parse` verbs.
- `lib/playwright/aria.ts` → `product/instruments/observation/aria.ts`. Accessibility snapshot capture, unchanged.
- `lib/playwright/locate.ts` → `product/instruments/observation/locator-ladder.ts`. Ladder order flips from v1's (test-id → role → css) to (role → label → placeholder → text → test-id → css). Small edit, not a rewrite.
- `lib/runtime/widgets/interact.ts` → `product/instruments/action/interact.ts`. Action dispatch and precondition validation, with the four named failure families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`) plus `unclassified` added to the action envelope.
- `lib/domain/codegen/spec-codegen.ts` → `product/instruments/codegen/spec-codegen.ts`. TypeScript AST emission for Playwright tests. The facade switches from runtime-instantiated (via `lib/composition/scenario-context.ts`) to pre-generated per-screen modules regenerated from the facet catalog on every authoring pass.
- `lib/runtime/adapters/navigation-strategy.ts` → `product/instruments/navigation/strategy.ts`. Route classification and `waitUntil` selection, with the `page.url()` idempotence check added before `goto`.

**Why this belongs in `product/`:** these are the instruments the agent calls. They have no measurement concern, no dashboard concern, no workshop concern. The L0 chain is procedural work v1 has already done competently; rebuilding it greenfield would waste weeks with no design gain. The value v2 adds here lives at the seam — receipts, facet-reference resolution, four-family error classification — not in the body of the instruments themselves.

### 3.3 Architecture law 8 — moves into `product/tests/architecture/`, enforced unchanged

The governance phantom brands named in §3.1 are one half of the structured-fallthrough invariant (invariant 10). The other half is **architecture law 8**: the runnable assertion in the test suite that forbids ad-hoc governance string comparisons anywhere in production code. The brands make the type system refuse un-handled governance states; the law makes the build refuse code that reads `item.governance === 'approved'` instead of routing through `foldGovernance`. Together they turn a convention into a check.

**Destination:** `product/tests/architecture/governance-verdict.laws.spec.ts`. The law runs against `product/` code only; `workshop/` and `dashboard/` inherit the discipline through the shared compile-time brands but do not need a parallel law. If `workshop/` later adds governance-bearing types of its own, the law is extended, not duplicated.

### 3.4 InterventionHandoff and the file-backed decision bridge — split across `product/` and `dashboard/`

**v1 assets:** `lib/domain/handshake/intervention.ts` defines the `InterventionHandoff` shape (unresolvedIntent, attemptedStrategies, evidenceSlice, blockageType, nextMoves, competingCandidates, reversalPolicy). `lib/infrastructure/dashboard/file-decision-bridge.ts` defines the cross-process transport — `writeDecisionFile`, `watchForDecision`, and the atomic temp-rename protocol that makes agent-in-the-loop sessions race-safe.

**Destination split:**
- The handoff **shape** is a product concern — it is the structured output every saga emits when determinism exhausts. `product/domain/handshake/intervention.ts`.
- The file-backed **transport** is where product and dashboard meet. The writer lives on the product side (`product/instruments/handshake/decision-bridge.ts`); the watcher lives on the dashboard side (`dashboard/bridges/decision-watcher.ts`). The atomic temp-rename protocol is a shared file-system contract, not a shared module — both sides know how to read and write the directory, and neither imports the other.

**Adjustment:** in v1 the handoff is optional on `InterventionReceipt`; in v2 every agentic decision produces a handoff receipt. The shape stays; the discipline around its population tightens. In `product/`, `foldHandshake` becomes exhaustive over the decision outcomes the agent can emit.

### 3.5 Workshop infrastructure — moves into `workshop/`, inherited as running

Earlier drafts of this doc underpriced what v1 already has here. The workshop is production infrastructure, not scaffolding. Five components port forward together because they compose into the running measurement loop:

- **The speedrun orchestration** (`lib/application/improvement/speedrun.ts`, the `corpus` / `iterate` / `fitness` / `score` / `baseline` verbs) → `workshop/orchestration/`. Effect-native four-phase pipeline with structured error handling, progress streaming to JSONL sidecar, and regression detection via p99 baseline. Adjustment: the phases still run, but they are now driven by `product/`'s manifest — probes derived at the seam (§5) rather than handwritten scenarios, and the `iterate` phase runs against probes that exercise product-declared verbs.
- **The seven-visitor metric tree** (`lib/domain/fitness/metric/visitors/`) → `workshop/metrics/`. `extraction-ratio`, `handshake-density`, `rung-distribution`, `intervention-cost`, `compounding-economics`, `memory-worthiness-ratio` (M5), `intervention-marginal-value` (C6). Each visitor is pure, consumes `PipelineFitnessMetrics`, produces a `MetricNode<K>`. Adjudication per visitor lives in §4 of this doc and in `v2-substrate.md §8`; the ones that survive the audit port without change.
- **The scorecard history + Pareto frontier** (`.tesseract/benchmarks/scorecard.json`, the `highWaterMark` / `history` / `paretoFrontier` shape) → `workshop/scorecard/`. The loss curve is a first-class artifact; running workshop runs append to it. No reset at cut-over — the existing four runs of history keep their place as the baseline the next run diffs against.
- **The convergence-proof harness** (`lib/application/improvement/convergence-proof.ts` + `lib/domain/convergence/types.ts`) → `workshop/convergence/`. N-trial statistical verdict via hylomorphism (fold ∘ unfold). The bones of "does the loop actually converge?" are already statistically sound; the verdict they produce is what the cut-over metric floors (§ prior drafts §2.6) are meant to approximate.
- **The trust-policy gate** (`.tesseract/policy/trust-policy.yaml` + `lib/application/governance/trust-policy.ts`) → `workshop/policy/`. YAML-authored confidence thresholds and evidence requirements, actively enforced on every iteration. The mechanism (proposal-gated reversibility driven by declared thresholds) is sound; the specific numeric thresholds get recalibrated as v2's probes surface real evidence, under the same proposal discipline the policy already gates.

**Why this belongs in `workshop/`:** none of the five appears in the agent's session flow when an agent is authoring a test. They exist to measure whether the agent's authoring is getting better. Customers never see them; `product/` never imports them.

**What this means for the v1 "these are workshop features only, redesign fresh" framing earlier drafts carried:** that framing was wrong. These are not aspirational workshop features awaiting v2's green light. They are the workshop v2 inherits. Measurement in v2 is not Phase 5 light-up; it is continuation of something already running. What changes is the seam (§5) — probes now derive from `product/`'s manifest instead of hand-authored dogfood — not the machinery.

### 3.6 Proto-Reasoning ports — consolidate into `product/reasoning/`, retrofit ~320 LOC

Earlier drafts of this doc described v1's LLM surface as scattered. It isn't — it's proto-unified. Two callsites, same pattern: strategy interface + typed request/response + Effect monads + callback dependency injection + deterministic fallback as a first-class provider + composite/hybrid for multi-tier fallback. Zero direct SDK imports: provider choice is already a composition-time decision.

- `lib/application/resolution/translation/translation-provider.ts` — the Translation port. Rung-5 resolution of step intent to ontology (screen + element).
- `lib/application/agency/agent-interpreter-provider.ts` — the AgentInterpreter port. Rung-9 semantic judgment after live-dom fails. Includes vision support (base64 screenshot + ARIA snapshot).

**What changes:**
- Both ports unify under one `Reasoning.Tag` with three operations (`select` / `interpret` / `synthesize`). The pattern is preserved; the two sibling abstractions collapse into one.
- The two scattered error unions (`TranslationProviderError`, `AgentInterpreterError`) unify into `ReasoningError` with the five named families (`rate-limited`, `context-exceeded`, `malformed-response`, `unavailable`, `unclassified`) and `foldReasoningError` for exhaustive dispatch.
- `TranslationReceipt` and `AgentInterpretationResult` lift into a shared `ReasoningReceipt<Op>` that adds token counts, model identifier, latency, and prompt fingerprint. Every reasoning call writes a receipt; the receipt log joins `product/`'s append-only log set at the seam.
- Provider choice moves entirely to `Layer.succeed(Reasoning.Tag, <adapter>)` at composition. Saga code becomes provider-agnostic.

**Destination:** `product/reasoning/`. This is a product concern — the agent's own cognition is a product-side instrument. `workshop/` consumes receipts for its cost/latency/batting-average metrics; it does not reach into the port.

**Cost:** approximately 320 LOC across 3–4 files. No logic rewrites; the existing strategy patterns port as-is. This retrofit lands in Phase 0 of the compartmentalization, not deferred to a later phase, because every downstream saga benefits immediately from the unified receipt shape.

### 3.7 The five load-bearing monoliths — split along the three-folder seams

Five files carry the densest insight in v1. Earlier drafts of the salvage audit were silent on them; that silence was the gap. Each has a folder destination, and the split itself reveals where `lib/`'s internal seams want to be sharpened.

- **`lib/application/observation/interface-intelligence.ts`** (~1600 LOC) — projection engine synthesizing interface graph, selector canon, and state transition graph from catalog state. The hard-won lessons (O(1) pre-indexing, state identity key composition, evidence-lineage graph) are product-side — this is how the agent knows the world. **Destination:** `product/intelligence/`, split by projection kind (interface graph, selector canon, state transitions) so each sub-module is independently readable.
- **`lib/domain/graph/derived-graph.ts`** (~1515 LOC) — graph builder with the conditional-edge pattern for partial-artifact sets, multi-source evidence lineage, and scenario-step grounding. Product-side — the graph is what the catalog queries resolve against. **Destination:** `product/graph/`, with conditional-edge composition and evidence-lineage as separate modules.
- **`lib/infrastructure/mcp/dashboard-mcp-server.ts`** (~1815 LOC) — the MCP surface with pending-decision closure, paginated responses, and suggested-action scoring. Pure dashboard concern. **Destination:** `dashboard/mcp/`. The tool implementations reshape to read through manifest-declared verbs instead of importing domain types directly; that reshape is how the dashboard stops straddling.
- **`lib/runtime/resolution/resolution-stages.ts`** (~875 LOC) — the multi-rung resolution ladder with the `RankedLattice`, exhaustion trail, and candidate summary pattern. Product-side runtime. **Destination:** `product/runtime/resolution/`. The rung count contracts (§4 rules on error families and ladder order); the lattice and exhaustion-trail patterns stay.
- **`lib/runtime/scenario.ts`** (~882 LOC) — the step-execution orchestrator with route-variant ranking, pre-navigation, observation-before-action, recovery envelope, and semantic accrual. Product-side. **Destination:** `product/runtime/scenario/`. Recovery-strategy composition is the reusable spine; semantic accrual is conditional on whether `product/` retains the dictionary layer (see §4).

**What the split reveals:** every straddling monolith is a sharpening opportunity. Interface-intelligence's catalog-reading path is product; its scoreboard-feeding path is workshop. Resolution-stages' ladder is product; its rung-performance telemetry is workshop. Scenario.ts's execution is product; its drift-emit signal is shared with workshop through the append-only log. In each case the file has grown because the seam between the concerns was implicit. The folder split forces the seam to become explicit, and the pattern that falls out is the same everywhere: the product module emits a receipt; the workshop module consumes the receipt. No cross-imports needed.

### 3.8 Learnings that shape v2 but are not imported as code

The audit surfaced several v1 innovations v2 adopts as *ideas* without necessarily inheriting the v1 implementation:

- **Epistemic branding orthogonal to governance** — v1's insight that observation confidence and governance verdict are different axes. v2 may or may not materialize this as a separate phantom type; the discipline survives either way.
- **Scope-of-effect axis orthogonal to reversibility class** — v1's InterventionBlastRadius. v2 tracks the same concern (a drift event's scope affects how many surfaces reconsider their confidence) without necessarily the same enum.
- **Certification as distinct from activation** — the observation that "written to canon" and "trusted by an operator" are separable states. v2 structures the proposal lifecycle around this.

These are design lessons v2 learned through v1. The code may or may not carry forward; the ideas do.

## 4. What retires at the compartmentalization

Items below split into two categories. A smaller set **reshapes in place** — v1's mechanism is sound but its configuration or coupling needs adjustment once the folders are split. A smaller set still is **left behind entirely** — v2 has no equivalent concern because v2's three-folder structure does not require one.

The distinction matters. Reshaped items stay running with adjusted shape or calibration. Left-behind items are genuinely absent. Earlier drafts of this doc classified a lot of v1 infrastructure as "redesigned fresh" that actually ports forward under §3.5 — that framing is retired with this revision.

### 4A. Reshape in place

The concepts below port forward but adjust their shape or calibration as they enter the three-folder structure.

- **Confidence as a derived scalar, not a named total order.** v1's `unbound < intent-only < agent-proposed < agent-verified < compiler-derived < human` is replaced by confidence derived from the per-facet evidence log. Named rungs may emerge as a byproduct of derivation; they are not part of the memory spec. `product/` owns derivation on read.
- **Theorem claims as narrative framing, operationalized only when they earn it.** v1's K/L/S/V/D/R/A/C/M/H groups and 19 proof obligations were aspirational scaffolding that outran the evidence. `workshop/` operationalizes specific claims one metric at a time under the trust-but-verify discipline (§5); theorem framing survives in narrative form but does not ship as a proof-obligation matrix.
- **Testbed derived from product's manifest, not hand-authored dogfood scenarios.** The 10000-series legacy and 20000-series generated-cohort partition retires. `workshop/` synthesizes probes from `product/`'s declared verbs, facet kinds, and error families (§5). Dogfood content is not ported; testbed verisimilitude becomes a coverage metric against the product surface, not a handwritten corpus size.
- **Trust-policy thresholds recalibrate under probe evidence; the mechanism ports forward.** v1's per-artifact thresholds (element 0.95, posture 0.95, surface 0.95, snapshot 0.98, hint 0.90, pattern 0.95, route 0.95) were calibrated against the dogfood corpus. The YAML-authored gate machinery and its active enforcement port forward into `workshop/policy/` (see §3.5); the specific numeric thresholds get recalibrated as probes derived from `product/`'s manifest surface real evidence. Threshold changes land through the same proposal-gated discipline the policy already enforces on catalog writes.
- **Persistent surfaces named by concern, not `.tesseract/` as a bulk staging directory.** v1's twelve-subdirectory runtime engine directory is not replicated. v2 names each persistent surface explicitly under its owning folder: the facet catalog (`product/catalog/`), the evidence log (`product/logs/evidence/`), the drift-event log (`product/logs/drift/`), the proposal log (shared seam at `.logs/proposals/`), the receipt log (`workshop/logs/receipts/`), the scorecard history (`workshop/scorecard/`). Each has one owner; nothing is a bulk staging area.
- **MCP as one adapter, not the exclusive agent surface.** v1's dashboard MCP server is not v2's source of truth. v2's source of truth is the **vocabulary manifest file** declared in `product/`, read by the agent on every session. MCP is one adapter over that manifest; the CLI is another; direct library use is a third. The manifest is the authority; the MCP server in `dashboard/mcp/` reads through it instead of reimplementing its own taxonomy.
- **Agent-facing error families at runtime, pipeline-fitness classes at measurement time.** v1's eight pipeline-level fitness classes (`translation-threshold-miss`, `normalization-gap`, etc.) and v2's five runtime error families (`not-visible`, `not-enabled`, `timeout`, `assertion-like`, `unclassified`) are not competing — they live in different folders. The runtime families are product-side, carried on every action envelope for recovery decisions. The pipeline classes are workshop-side, derived at metric-compute time over the run-record log. Earlier drafts conflated the two; the compartmentalization separates them cleanly.

### 4B. Left behind entirely

v2 has no equivalent concern because v2's three-folder structure does not require one.

- **The reference-canon transitional slot and dogfood content.** v1's `PhaseOutputSource` union contains six variants; the `reference-canon` slot (4) was added in the 2026-04-10 reframe to hold pre-gate dogfood content (`dogfood/knowledge/**`, `dogfood/benchmarks/**`, pre-gate `dogfood/controls/**`) that was consulted at runtime but carried no intervention-receipt lineage. That transition retires at the compartmentalization. **Mechanically:** the demotion sweep runs as one pass, every reference-canon atom gets deleted, the `PhaseOutputSource` union contracts from six to five variants (a type-level surgical edit on `source.ts` — one compiler pass surfaces every consumer needing the `referenceCanon:` arm removed from its fold), and `PostureSourceBound<'warm-start'>` loses the `'reference-canon'` member. Commit 1b and Commit 5 of the stalled synthetic feature completion plan describe the catalog-loader wiring and the sweep respectively; under the compartmentalization, those two commits land together as part of the retirement, and dogfood content does not migrate into `product/` or `workshop/`.
- **Dogfood / production split as a structural axis.** v1's `createProjectPaths(rootDir, suiteRoot)` indirection and the gitignore governance of `dogfood/` exist because v1 evolved its training content alongside its code. v2 runs against the customer's tenant; `workshop/` runs against probes derived from `product/`'s manifest (§5). There is no "dogfood mode," no suite-root indirection, and no shadow tree.
- **The 10000-series / 20000-series scenario corpus partition.** The partition classified legacy from go-forward dogfood scenarios. Since neither cohort ports forward, the partition retires alongside the scenarios themselves.
- **The `.tesseract/` bulk staging directory.** The twelve-subdirectory runtime engine directory is not replicated. Each persistent surface is named by its owning folder (see §4A final bullet); nothing accumulates at the repo root.

## 5. The measurement substrate — `workshop/` reads `product/`'s manifest and probes what it finds

`workshop/` measures `product/` through a single discipline: **derive probes from the product's own declared surfaces, run them through the product's normal authoring flow, and measure the run records.** No parallel apparatus, no hand-authored scenario corpus, no dual mastery between scoreboard and product. The manifest is the contract; the probes are its mechanical projection; the measurements are derivations over the log set the product already emits.

This is the sharpest move in v2's design. It falls out of the three-folder compartmentalization: once `product/` declares its surface in one place — the vocabulary manifest — `workshop/` gains a machine-readable description of everything measurable. Probes become inevitable rather than negotiated. Coverage becomes a derivable number. Graduation becomes an operational target: when probes cover every manifest-declared verb × facet-kind × error-family combination and the batting average stays above its floor, `workshop/`'s active role is complete and it degrades to a passive alarm.

The operating frame is unchanged: **trust, but verify**, small bets with a good batting average, "can't improve what you don't measure." What changes in this revision is where the measurement input comes from. Earlier drafts committed a hand-authored testbed version history (`testbed/v0/` through `testbed/v4/`). That framing retires here in favor of the probe IR, because a handwritten testbed drifts from product reality while a manifest-derived probe set cannot.

### 5.1 The probe IR — derived from `product/`'s manifest, not handwritten

A **probe** is a synthetic work item whose shape is derived from one `TestableSurface` — a tuple of (verb, input shape, output shape, expected error families, composition path). `workshop/` computes the set of `TestableSurface[]` by walking the manifest: every declared verb, every declared facet kind, every declared saga composition, every declared error family. Each `TestableSurface` maps to one or more probes through a small per-verb **fixture specification** committed alongside the verb's declaration — a minimal YAML saying "when this verb is probed, here's a valid minimal input." The fixture is part of the verb's definition in `product/`, not part of a separate dogfood corpus.

```
 product/manifest.json   product/fixtures/<verb>.probe.yaml
           │                    │
           └────────┬───────────┘
                    ▼
            workshop.derive(TestableSurface[])
                    ▼
            workshop.synthesize(Probe[])
                    ▼
   run through product/'s normal authoring flow
                    ▼
            run-record log (append-only)
                    ▼
            metric visitors derive values
                    ▼
            scorecard updates; receipts append
```

Downstream of probe synthesis, no handshake distinguishes probe from real. `intent-fetch` is polymorphic over its source — a work item returned by the Azure DevOps adapter, a work item returned by the testbed adapter, and a work item synthesized from a probe all carry the same shape. The only distinguishing field is `source`, which for probes names the probe's IR address (`probe:<verb>:<fixture>`).

**Why this is better than a handwritten testbed:**
- **The forcing-function problem dissolves.** When a new verb lands in the manifest, new probes appear automatically. When a verb's signature changes, the probe set regenerates. Phase 2's facet schema is no longer an unmeasured choice — it becomes measurable the moment the first verb reading a facet ships.
- **Testbed verisimilitude becomes a coverage metric.** `workshop/` can report "probes cover 84% of declared verb-compositions × facet-kinds × error-families." The gap between 84% and 100% is the product's own incompleteness surface.
- **Graduation is operational.** When coverage saturates and probes consistently pass, the workshop's active role is done. Earlier drafts of this section promised this outcome rhetorically; the probe IR makes it measurable.
- **It extends naturally to real SUTs.** Same probe generation; probe targets a real fixture app or a customer tenant rather than a synthetic one. The IR is the shape; the SUT is the substitution.

**What needs validation before the IR becomes load-bearing:** whether probe specifications for the most complex verbs (test-compose, facet-query, drift-emit) can derive meaningful work items without extensive hand-tuning. If the verbs' input shapes admit too much variation, fixture specifications may need hand-lifted schemas and the auto-derivation is shallower than advertised. A spike against three representative verbs precedes any phase work that treats the IR as authoritative. See `v2-substrate.md §6a` for the spike protocol.

### 5.2 Evaluation is authoring against probes

To evaluate `product/`, `workshop/` runs `product/`'s normal authoring flow against probes as its intent source. Same agent session, same memory consultation, same test compose, same test execute. The difference is that probes carry expected outcomes derived from the fixture specification, so the run-record log — already kept by `product/` as its memory of what happened — becomes evaluation input when filtered to probe work items.

There is no separate evaluation runner. There is `product/`, invoked by `workshop/` with `--source=probe:<verb>:<fixture>`. The session receipt is functionally identical to a customer-backlog receipt; only the `source` field differs. One code path, two audiences, one seam.

### 5.3 Metrics are manifest-declared derivations over run records

A metric is a named, manifest-declared derivation over the run-record log. Each metric is declared in `workshop/` with a frozen signature once published. Adding a metric is adding a verb; retiring a metric is deprecating a verb; the same discipline verb declaration already enforces applies.

Metric computation is pure given the run log: filter run records by window and probe coverage, aggregate, return the scalar plus the run subset the scalar was derived from (so the derivation is auditable). Computation is itself a run event — a metric-compute record appends to the log — so the history of metric values over time is queryable through the same pagination rules apply to everything else.

**The starting set inherits from v1.** Seven metric visitors already live in `lib/domain/fitness/metric/visitors/`: `extraction-ratio`, `handshake-density`, `rung-distribution`, `intervention-cost`, `compounding-economics`, `memory-worthiness-ratio` (M5), `intervention-marginal-value` (C6). Each visitor is pure and composable. The audit that decides which port forward unchanged, which port with recalibration, and which retire lives in `v2-substrate.md §8`; every visitor that survives lands in `workshop/metrics/` with its existing signature plus a revision to its denominator where needed to reflect the probe IR rather than the dogfood corpus.

Product-level metrics (`metric-test-acceptance-rate`, `metric-authoring-time-p50`, `metric-hypothesis-confirmation-rate`) land alongside the inherited set as the shipping-claim surface. They are not replacements for the seven visitors; they are complements that measure customer-facing outcomes while the seven measure internal health. Additional metrics — both product-level and internal — are proposed under the same proposal-gated reversibility rules memory uses. A metric earns its place by predicting something actionable; if it doesn't, the review rejects it.

### 5.4 Hypotheses are proposals; verification is the next evaluation

A hypothesis is a specific kind of proposal: `{ kind: "hypothesis", proposedChange, predictedDelta: { metric, direction, magnitude }, rationale }`. It enters the same proposal log revisions use (§9.15), with a discriminator on `kind`. Operator review gates it like any other proposal.

If accepted, the code change lands; the next evaluation produces new run records; the agent reads the delta and appends a verification receipt: `{ hypothesis, predictedDelta, actualDelta, confirmed }`. The receipt log is append-only (invariant 3); contradicting a hypothesis never overwrites its receipt — confirmations and contradictions stack into history.

That history is itself queryable. A metric like `metric-hypothesis-confirmation-rate` is a derivation over the receipt log — the batting average, computed the same way every other metric is computed, readable by the agent through the same manifest verbs.

### 5.5 Trust-but-verify in one sentence

Every code change carries a hypothesis; the next evaluation confirms or contradicts it; the receipt log is append-only; the agent reads it to propose the next change. Small bets, reviewed, measured, receipted — and the batting average is a derivation the agent can pull at any time.

### 5.6 What this substrate is not

- **Not a parallel apparatus.** Probes run through `product/`'s normal authoring flow. There is no separate evaluation pipeline.
- **Not a metric store.** Metrics are derivations over existing run records, not entries in a sibling database.
- **Not a handwritten scenario corpus.** Probes derive from `product/`'s manifest; the dogfood 10000/20000-series partition retires with it.
- **Not a new metric catalog that discards v1's.** The seven inherited visitors carry forward under audit (§4); new metrics complement them rather than replace them.
- **Not a theorem-verification system.** v2's compounding claims stay narrative; operationalization pays its way under the same proposal-gated discipline everything else uses.
- **Not customer-facing.** `workshop/` does not ship to customers. Its findings inform the team and the agent; none of its artifacts reach the customer's test suite.

The aesthetic win is that measurement becomes structural: the seam between `product/` and `workshop/` is the manifest plus the log set, and the probe IR is the mechanical projection that makes the seam measurable.

## 6. Construction order — three phases across thirteen steps

The destination dictates the sequence. The work groups into three phases with coherent risk profiles:

- **Phase 1 — The Reshape (Steps 0, 1, 1.5, 2, 3; ~4 weeks).** Bounded restructure. Compartmentalization, reference-canon retirement with transitional probe set, customer-reality probe, manifest + fluency harness, facet schema. Single coordinated effort; everything else blocks on it.
- **Phase 2 — The Unstitching (Steps 4a, 4b, 4c, 5, 6; ~8 weeks).** Bounded interior reshape. Monolith splits, L0 shape adjustments + Reasoning port, dashboard manifest-reshape, probe IR spike, first customer ship. Parallelizable; first customer shipping signal emerges here.
- **Phase 3 — The Compounding (Steps 7–10, continuous).** Open-ended incremental. L1 memory, L2 operator, L3 drift, L4 self-refinement. Each ships on its hypothesis; graduation is continuous per §6.2–§6.3 of `v2-transmogrification.md`.

Three framing shifts from earlier drafts of this section:

- **No `lib-v2/` sibling.** v2 evolves in place. The compartmentalization move is a single atomic tree reshape; later shape adjustments land incrementally on the already-split tree.
- **No "measurement lights up at Step 5" inflection.** The workshop is already running (§3.5). Measurement continues through the compartmentalization; what lights up later is the probe IR as a replacement for the dogfood corpus, not measurement itself.
- **Step 4 splits into 4a / 4b / 4c.** Earlier drafts compressed monolith splits + L0 shape adjustments + dashboard reshape into one "Step 4," which was structurally dishonest about scope. Now: 4a = monolith splits (no behavior change), 4b = L0 shape adjustments + Reasoning port, 4c = dashboard manifest-reshape. See `v2-transmogrification.md §3` for execution mechanics of each.

### Step 0 — compartmentalization commit

One atomic reshape of the repository. No logic changes; every file moves to its destination folder per §§3–4.

- **Create the three top-level folders:** `product/`, `workshop/`, `dashboard/`. Each gets an initial `README.md` naming its single responsibility (product: agent-facing shipping surface; workshop: consumer of product's manifest; dashboard: read-only observer).
- **Move v1 files to their destinations.** The per-file folder assignment comes from the §13 salvage audit in `v2-transmogrification.md` (reshaped in this revision to a three-folder destination table). No file is split across folders in this step; monolith splits (§3.7) come in subsequent steps.
- **Update import paths.** A single pass rewrites every relative import to reflect the new tree. TypeScript's compiler surfaces every stale reference; each gets fixed in place.
- **Build harness reshape.** `tsconfig.json` references the three folders; `package.json` scripts gain per-folder build/test targets (`build:product`, `build:workshop`, `build:dashboard`) alongside the aggregate. CI runs all three.
- **Enforce the seam.** A lint rule or architecture test forbids imports from `workshop/` or `dashboard/` into `product/`. The seam is a compile error, not a convention.

**Definition of done:** `npm run build` succeeds with the three folders. `npm test` runs the existing test suite against the reshaped tree without semantic change. Architecture law 8 continues to run green. A fresh `git grep -r "from '\\.\\./lib"` returns nothing.

**Why this is first:** agent discovery costs collapse the moment the three folders exist. Every subsequent step benefits from clear ownership; every review before this step has to negotiate three constituencies in one file.

### Step 1 — reference-canon retirement and the source-discriminant contraction

The type-level surgical edit described in §4B, run as its own commit so the contraction is visible and reviewable.

- **Delete reference-canon content.** Remove `dogfood/knowledge/`, `dogfood/benchmarks/`, the pre-gate portions of `dogfood/controls/` that were feeding slot 4.
- **Contract the source union.** `PhaseOutputSource` drops `'reference-canon'`; `foldPhaseOutputSource` loses the `referenceCanon:` arm; `PostureSourceBound<'warm-start'>` loses the `'reference-canon'` member. Every compile error surfaces a consumer that needs its handler removed.
- **Run Commit 1b and Commit 5 of the stalled synthetic feature completion plan together.** The catalog-loader wiring (1b) and the automatic demotion sweep (5) are no longer load-bearing separately — with the reference canon content gone, what remains is the type-level contraction plus the sweep running once over any stragglers.
- **Workshop continues running the whole time.** The trust-policy gate and metric tree adapt to a five-variant source union in the same commit.

**Definition of done:** `PhaseOutputSource` has five variants; every `foldPhaseOutputSource` callsite compiles with the `referenceCanon:` arm removed; the reference-canon demotion sweep runs to completion and returns an empty proposal set; workshop's scorecard run after the contraction produces the same shape as before.

**Why this is second:** the retirement clarifies the source-ranking invariant (`operator-override` > canonical artifacts > derived outputs) without a transitional middle. Every downstream step operates under the clearer invariant.

**Transitional probe set co-lands.** The workshop loses its dogfood input at this step but needs *something* to measure against through Step 5 (where the manifest-derived probe IR takes over). Step 1 commits a small inline-encoded transitional probe set (5–10 probes against v1's existing surfaces, pre-manifest so no Step-2 dependency) under `workshop/probe-derivation/transitional.ts`. M5's cohort key re-defines from scenario-ID to **probe-surface cohort** (the probe's verb × facet-kind × error-family triple) in the same commit. The scorecard history stays continuous across the input switchover.

### Step 1.5 — customer-reality probe (non-blocking observation)

One customer work item, authored by the agent through v1's existing pipeline, against the customer's real ADO + OutSystems. This is not a shipping event — it is an **observation** that feeds Phase 2's design decisions. Steps 2–4 commit forcing-function choices (manifest format, facet schema, monolith split boundaries, ladder order); one customer-reality observation de-risks those choices before they become expensive to revisit.

The observation runs in parallel with Steps 2 and 3 (not serial), feeds Step 4a's monolith-split design, and commits as `workshop/observations/customer-probe-01/` with a team-reviewed memo naming 3–5 design constraints the probe surfaced (or explicitly "no material surprises").

**Why this exists:** without it, Phase 2 commits ~6–8 weeks of design choices with zero customer contact. One probe session is cheap insurance.

### Step 2 — the vocabulary manifest and fluency test harness

**Why after compartmentalization and retirement:** the manifest is how every other handshake becomes callable by the agent, and how `workshop/` learns what is probeable. It lands in `product/manifest/` and is generated from code-declared verbs across `product/`. It needs the three folders to exist because the manifest's source-of-truth is product-only — workshop verbs and dashboard verbs do not enter it.

**What ships at this step:**
- `product/manifest/manifest.json` generated at build time from code-declared verbs. Each entry has `{ name, category, inputs, outputs, errorFamilies, sinceVersion }`.
- A build check that fails when the manifest and the code diverge.
- A fluency test fixture: canonical agent tasks, one per verb, asserting the agent dispatches correctly.
- Agent session-start reads the manifest once. No session-time reflection over code.
- **The `kind: hypothesis` discriminator on the proposal lifecycle** lands here (not at a later step) because the manifest's own signatures become the first governed surface. Every subsequent manifest change carries a hypothesis; the trust-but-verify loop is live from this point onward.

**What this closes:** stable verb signatures (invariant 1) and cheap introspection (invariant 10) both gain compile-time teeth. Workshop's probe derivation (Step 5 below) now has a machine-readable source.

### Step 3 — the unified facet schema with stable IDs

**Why third:** the facet schema is the shape every memory handshake depends on. It lands in `product/catalog/` and consolidates v1's split-across-two-files pattern (elements.yaml + hints.yaml) into a single record per facet.

**What ships at this step:**
- Facet record with `{ id: "<screen>:<elementOrConcept>", kind, displayName, aliases, role, scope, locatorStrategies (with per-strategy health), confidence, provenance (mintedAt / instrument / agentSessionId / runId), evidence (pointer to append-only log) }`.
- Kind-specific extensions for `element`, `state`, `vocabulary`, `route`.
- Storage as per-screen YAML files under `product/catalog/` with in-memory index on load. Atomic temp-then-rename writes.
- **The facet's own manifest entries** (`facet-mint`, `facet-query`, `facet-enrich`, `locator-health-track`) get declared here with frozen signatures. Implementations land in Step 7 (L1); declaration precedes implementation so downstream steps can reason against the schema.

**What this closes:** the split-across-two-files pattern collapses into one facet record. Locator health co-locates on the facet rather than a separate `SelectorHealthIndex` — that's a small greenfield piece of `product/`, not a ported pattern.

### Step 4a — monolith splits (internal reshape, no behavior change)

The five monolith splits from §3.7, run as behavior-preserving moves with existing test surfaces held green:

- `interface-intelligence.ts` → `product/intelligence/` sub-modules (interface graph / selector canon / state transitions).
- `derived-graph.ts` → `product/graph/` sub-modules (graph builder / conditional-edge composition / evidence-lineage).
- `resolution-stages.ts` → `product/runtime/resolution/` sub-modules (lattice / stages / exhaustion / accumulator).
- `scenario.ts` → `product/runtime/scenario/` sub-modules (environment / route / execution / recovery / accrual).
- `dashboard-mcp-server.ts` → `dashboard/mcp/` sub-modules (handlers / context / actions) — behavior preserved; the manifest-reshape lands at Step 4c.

**Why before Step 4b:** the L0 shape adjustments touch modules that currently live inside these monoliths. Splitting first means 4b's shape work lands in bounded modules rather than in 900-line monolith bodies. The customer-reality probe observation memo from Step 1.5 informs where to cut.

**What this closes:** every monolith's internal seam is now a folder boundary. Existing test surfaces continue to pass. No behavior changes until 4b.

### Step 4b — L0 shape adjustments + Reasoning port consolidation

The shape changes from §3.2 and the Reasoning port consolidation from §3.6, landed in the (now split) modules from Step 4a:

- Locator ladder reorder: role → label → placeholder → text → test-id → css.
- `page.url()` idempotence check on navigate; `{ reachedUrl, status, timingMs }` envelope.
- Four-family error classification on interact (`not-visible`, `not-enabled`, `timeout`, `assertion-like`, plus `unclassified` fallback).
- Pre-generated facade on test-compose (per-screen modules regenerated from the catalog on every authoring pass).
- Reasoning port consolidation (~320 LOC, 3–4 files) — `TranslationProvider` and `AgentInterpreter` collapse into one `Reasoning.Tag` with three operations. Provider choice becomes a `Layer.succeed` composition decision.

**What this closes:** the L0 shipping claim becomes runnable. Every instrument emits a receipt on its declared manifest verb. The workshop's existing visitors compute verification against the transitional probe set and (once Step 5 lands) against manifest-derived probes.

### Step 4c — dashboard manifest-reshape

`dashboard/mcp/` tool implementations rewire to route through manifest-declared verbs instead of importing `product/` domain types directly. The compile-enforced seam (no `import` from `dashboard/mcp/` reaches `product/domain/` except via manifest-declared verb references) goes green.

**Why its own step:** the reshape from ~1815 LOC of hand-curated tool implementations to a manifest-driven projection is substantive work with independent dependencies on Step 2 (manifest) and Step 4a (the dashboard monolith's sub-folder split). Earlier drafts buried this under a broader Step 4; it earns its own step.

**What this closes:** the dashboard becomes a read-only projection over the manifest plus the append-only log set. Adding a verb to `product/` automatically extends the dashboard's tool surface at the next build.

### Step 5 — probe IR spike against representative verbs

**Why before L0 ships:** the probe IR (§5.1) is load-bearing for every subsequent workshop claim. Before it becomes authoritative, a spike validates whether manifest-derived probes can exercise real verb surfaces meaningfully. This is a **validation step**, not a coding milestone — the output is either "IR holds" (proceed) or "IR needs hand-lifted schemas for verbs X, Y, Z" (the scope is known before the IR becomes a dependency).

**What ships at this step:**
- Per-verb fixture specifications (tiny YAML files alongside each verb declaration) for three representative verbs: `facet-query`, `test-compose`, `drift-emit` if drift is in scope yet (otherwise substitute `observe`).
- A `workshop/probe-derivation/` module that walks the manifest + fixtures and produces a `Probe[]` set.
- Probes run through the normal authoring flow; run records accumulate.
- A coverage report: for each (verb, fixture) pair, did the probe complete? Did it produce expected run-record shape?

**What this closes or does not close:**
- **Closes:** the go/no-go decision on whether `workshop/`'s testbed is manifest-derived or partially hand-authored. If the spike shows that 80%+ of probes derive mechanically and the gaps are named, the IR proceeds as authoritative.
- **Does not close:** the full probe set across every verb. That grows incrementally across Steps 7–10 as new verbs land.

### Step 6 — ship L0 against the customer backlog under workshop supervision

The agent authors its first tests against real customer ADO items. QA reviews them. Acceptance is the signal the product is on track. **The workshop is watching from Day 1:** probes run alongside customer work, the scorecard history appends, the trust-policy gate continues enforcing, hypothesis receipts accumulate as the team proposes shape adjustments.

Expect Stage α costs: every work item is expensive. Memory is empty; the facet catalog is growing by a few facets per test.

This is a **shipping milestone**, not a coding milestone. The measurement substrate is not a parallel deliverable here — it is the thing already running. What's new is the real customer evidence entering the same run-record log the probes already populate.

**What this closes:** the product's L0 shipping claim. First customer acceptances land in workshop's scorecard as the initial acceptance-rate datapoint.

**What this is explicitly *not* doing:** establishing a new scorecard, a new metric catalog, or a new evaluation runner. All three already exist per §3.5.

### Step 7 — L1 memory layer with per-facet evidence log

**Why after L0 ships:** L1 optimizes the repeat-authoring case. Without L0 running, there's no repeat authoring to optimize.

**What ships at this step:**
- Per-facet evidence log as append-only JSONL under `product/logs/evidence/`.
- Confidence derived from the log on read, with cached summary invalidated on new evidence.
- Locator health co-located on the facet's locator strategies (the split from `SelectorHealthIndex` landed at Step 3 as part of the schema; the live feed of health from run records lands here).
- Memory-backed authoring: test compose consults the catalog before reaching for live observation.
- Facade regeneration on every catalog change.
- New workshop probes for the repeat-authoring claim (hit the same affordance twice and measure the delta); the probes derive from the manifest and land under `workshop/probe-specs/`.

**What this closes:** the scale claim ("one catalog update fixes N tests") becomes measurable in the workshop's scorecard.

### Step 8 — L2 operator-supplied semantics

**What ships at this step:**
- Dialog capture instrument under `product/instruments/operator/`: chat transcripts → candidate facets with operator wording preserved.
- Document ingest instrument under `product/instruments/operator/`: shared documents → candidate facets with region anchors.
- Candidate review queue under `product/catalog/candidate-queue/`: operator approves / edits / rejects; rejections preserved with rationale.
- New workshop probes for vocabulary-alignment claims.

**What this closes:** the memory starts picking up non-DOM semantics. The operator surface gains structured inputs beyond live-DOM observation.

### Step 9 — L3 drift detection and DOM-less authoring

**What ships at this step:**
- Drift-emit as an observational event, not a mutation. `product/logs/drift/drift-events.jsonl` append-only log.
- Confidence-gated authoring policy: when memory confidence about a surface exceeds a threshold, author without fresh observation.
- Drift event surfacing to the agent (via handshake) and operator (via `dashboard/`).
- New workshop probes for drift detection — synthetic perturbations of probe fixtures that the product should emit drift events against. The existing convergence-proof harness in `workshop/convergence/` consumes these perturbation probes and produces verdicts.

**What this closes:** drift becomes a first-class observational event. The encounter-propose-review pathway for affordance extension matches the drift pathway in shape.

### Step 10 — L4 self-refinement

**What ships at this step:**
- Confidence aging over the evidence log.
- Corroboration hook on passing runs.
- Revision-proposal aggregation from accumulated drift + decay + corroboration.
- Review-gated activation of revisions through the trust-policy gate (inherited from `workshop/policy/`).
- `metric-hypothesis-confirmation-rate` declared and wired to derive the batting average over the receipt log.

**What this closes:** the compounding-memory claim becomes measurable end-to-end in the workshop. Trust-but-verify closes on itself — v2 measures its own batting average at improving itself, and the metric is queryable through the same manifest-declared verb surface everything else uses.

### Workshop growth across steps

Because the workshop is already running from Step 0 forward, its "extension" at each product step is small and targeted: new probe fixtures (one per new verb), new metric declarations (one to three per step), new scorecard columns. None of these require standing up fresh infrastructure. The pattern:

- **Step 7 (L1 memory):** new probes exercise repeat-authoring; `metric-memory-hit-rate` and `metric-memory-corroboration-rate` land as new metric declarations. The L1 claim "repeat work is cheaper" becomes measurable.
- **Step 8 (L2 operator semantics):** probe fixtures gain synthetic dialog and document variants. Vocabulary-alignment metrics land.
- **Step 9 (L3 drift):** perturbation probes exercise the drift emitter. The convergence-proof harness (already in `workshop/convergence/`) consumes them.
- **Step 10 (L4 self-refinement):** `metric-hypothesis-confirmation-rate` closes the batting-average loop.

None of this ships to customers. All of it ships with v2's codebase under `workshop/`. The seven-visitor metric tree inherited at Step 0 continues providing internal-health measurements; the new metrics are product-claim surfaces that complement the inherited set.

## 7. How the subsidiary documents relate

This document is first in line. The others are read in service of this one.

- **`v2-substrate.md`** defines the five primitives, the five levels, the handoff boundary between agent-authored artifacts and human-editable ones, the anti-scaffolding gate, the probe IR spike protocol (§6a), the per-visitor metric audit (§8a), and the list of deliberately deferred decisions. Read it when you need to verify that a proposed design fits v2's primitives or check whether a concern belongs to a level v2 has or hasn't reached.
- **`feature-ontology-v2.md`** enumerates the handshakes, technical paths, agent-engagement flows, invariants, and reversibility classes. Read it when you are about to design or implement a specific handshake and need the per-feature contract.
- **`v2-delta-audit.md`** measures v1 against v2 handshake by handshake. Read it when you need to decide whether a v1 asset is ready to port, needs shape adjustment, or should be left behind.
- **`v2-transmogrification.md`** is the execution plan: §§1–8 the current thirteen-step three-phase plan (with graduation per §6 and phase-boundary DoD per §7); §9 the fifteen-saga gallery + truth/reasoning catalogs; §10 the runtime composition (Layer cake, CLI, fiber tree); §11 the descent protocol with a light-discipline track; §12 the per-folder and per-lane salvage audit. Read it when you need the operational mechanics of a step.
- **`v2-readiness.md`** is the execution preprocessing pack: day-by-day Step 0 playbook, seam-enforcement test design, per-folder README stubs, probe IR fixture grammar, transitional probe set scope, customer-reality probe checklist, branch + rollback strategy, and concrete file-level audits for the test-import rewrite, Reasoning port retrofit, and M5 cohort re-key. Read it *before* executing any step; most stumbling blocks are preprocessed here.

If there is ever a conflict between this document and the other four, **this document wins**. The subsidiary docs describe; this one directs. If a contradiction appears, either this document is wrong and should be corrected, or the subsidiary document is stale. Do not act on the subsidiary version without resolving the contradiction here first.

## 8. What success looks like for this document

A reader who finishes this document should be able to answer, without consulting the others:

- What is v2? (§1)
- Why three folders, and what is the seam between them? (§2)
- Which parts of v1 port forward into which folder, and why those specifically? (§3)
- Which parts reshape in place, and which retire entirely? (§4)
- How does `workshop/` measure `product/` through manifest-derived probes? (§5)
- What is built first, second, third? (§6)

If any of those is unclear on a reading of this document alone, this document has failed and should be revised. The other four documents elaborate what this one names; they do not substitute for the clarity this document is expected to provide.

The destination is small enough to hold in one head: one codebase, three folders (`product/`, `workshop/`, `dashboard/`), one seam (the manifest plus the append-only log set), three customer-facing surfaces from `product/` (manifest, catalog, tests), five primitives, five levels, ten invariants, and a workshop that already runs and measures product through probes it derives from product's own declared surface. Trust, but verify. Small bets, good batting average. 10× per-lane velocity from a codebase a fresh agent can orient in without re-discovering it. If that holds, v2 is on course.

