# The Probe IR Spike — A Postdoctoral Treatment

> Status: **primary design document** for Step 5 of the v2 construction order, written at the moment the scaffolding that makes the spike runnable lands on the branch (2026-04-21). Authoritative for the next agent picking up probe work; supersedes `docs/v2-synthetic-workshop-dogfood.md` for Step-5-scoped concerns.

> Read order for the agent resuming this work: (1) the introductions in §§0–1 of this memo; (2) `product/domain/manifest/testable-surface.ts` + its laws at `product/tests/manifest/testable-surface.laws.spec.ts`; (3) `workshop/probe-derivation/{probe-ir,derive-probes,probe-harness,probe-receipt,spike-harness}.ts` + `tests/probe-derivation/spike-harness.laws.spec.ts`; (4) the memo §§2–8; (5) when you want to run it: `node dist/bin/tesseract.js probe-spike` after `npm run build`.

---

## 0. A one-paragraph prologue

The workshop's job is to prove the product is getting better. For a year the evidence of that claim lived in a hand-authored scenario corpus — `dogfood/scenarios/` — whose freshness was itself a full-time maintenance burden. v2's bet is that the evidence can derive instead: the product's own manifest declares the surface it ships; the workshop mechanically generates probes against that surface; the workshop measures the probes' run records; the coverage of those probes becomes the workshop's graduation clock. The Probe IR is the name of the intermediate representation between the manifest and the run records. The spike — this step — validates whether the IR can carry that load. If the spike passes, the workshop stops authoring its own tests and starts reading the product's declaration. If it fails, the failure is named with enough precision that the next month's work is scoped.

The payoff for getting this right is structural, not incremental. Every new verb that lands in `product/manifest/manifest.json` after this spike lands carries its own fixture; every fixture synthesizes probes; every probe produces receipts; every receipt lands in the seven-visitor metric tree and the trust-policy gate and the hypothesis-confirmation loop without any further wiring. The workshop doesn't grow — it stays the same size — but what it measures grows automatically with the product.

## 1. The claim this spike makes

The claim is ontological: **a probe is a first-class construct, not a testing convenience.**

The weaker framing — probes as automated tests — treats the workshop as QA infrastructure for the product. That framing is wrong for v2. v2's workshop is not QA; it is a measurement consumer whose substrate (the probe) is a reified piece of the seam between product and workshop. A probe is what the two folders exchange. The shape of the exchange is:

1. Product emits a **manifest verb** (name, input shape, output shape, error families, category).
2. Product ships a **fixture specification** alongside each verb declaration (`<verb>.probe.yaml`).
3. Workshop derives a **TestableSurface** from (verb × fixture) and synthesizes a **Probe** from that surface.
4. Workshop executes the probe via a **ProbeHarness** adapter.
5. The harness produces a **ProbeReceipt** that lands in workshop's evidence log.
6. The metric tree reduces receipts into **scorecard columns** that measure whether the product is improving.

The spike validates that steps 1–5 compose cleanly for three representative verbs. If they do, the entire workshop/product seam becomes a derivation rather than an implementation, and the workshop's active role becomes a scheduling concern rather than an authorial one.

Everything that follows in this memo elaborates that claim.

## 2. The atomic claim — what one probe proves

A probe is **a unit of provable local truth**. Every probe pins down a single row in the coverage matrix `verb × facet-kind × error-family × rung` and produces one receipt that either confirms or contradicts the fixture's declared expectation. That narrow scope is the source of the probe's leverage: a probe's verdict is unambiguous because the expectation is declared in advance and the observation is classified against a closed union.

The atomic claim rides on four invariants the scaffolding enforces:

**I1. Declared expectation.** Every probe carries an `expected: { classification, errorFamily }` field drawn from its fixture YAML. Classification is one of `matched | failed | ambiguous` — three outcomes, each with a precise operational meaning. Error family is `null` for success paths or a named member of the verb's closed error-family set. The expectation is authorial intent, not opinion: the fixture's author is asserting "when this probe runs, here's what must be true."

**I2. Observed outcome.** Every probe execution produces an `observed: { classification, errorFamily }` field under the harness's discretion. Under the dry-harness this is a literal copy of `expected` (the seam-proof mode). Under the substrate-backed harnesses (fixture-replay, playwright-live, production), `observed` comes from classifying the actual verb outcome. The observed field's honesty is the harness's responsibility; the probe itself makes no claims about substrate behavior.

**I3. Receipt as judgement.** The `completedAsExpected: boolean` field is computed at receipt-construction time as `expected.classification === observed.classification && expected.errorFamily === observed.errorFamily`. It is not a subjective score; it is a two-axis comparison that either holds or doesn't. This pins the probe's verdict to a lattice join — the probe confirms iff both axes agree, and disagreement on either axis is enough to contradict.

**I4. Provenance at mint.** Every receipt carries `ProbeProvenance`: adapter, manifest version, fixture fingerprint, start/complete timestamps, elapsed milliseconds. The adapter tag (`dry-harness | fixture-replay | playwright-live | production`) makes the receipt self-describing about how much weight the reader should attach to it. A receipt from `dry-harness` is seam-proof, not truth-proof; a receipt from `production` is both. The reader decides.

Together, I1–I4 make one probe-receipt a **proof token** in the Curry–Howard sense: a concrete witness that some proposition — "verb V under fixture F exercised rung R and emitted error family E as declared" — either holds or doesn't. The proof is local (one probe), reproducible (pure probe + deterministic harness produces identical receipt), and composable (receipts join in the metric tree). This is the atomic unit that makes the workshop's measurement substrate honest.

What an individual probe does **not** prove: anything about other probes, the verb's behavior outside the fixture's world, or the product's improvement trajectory. Those are compositional claims the next section elaborates.

## 3. The compositional claim — what probes prove when composed

Composition is where probes earn their keep. One receipt confirms one cell in the coverage matrix; many receipts — composed via a few carefully-chosen algebraic operations — confirm the product's measurement substrate as a whole. Three compositions matter, in increasing order of what they prove.

### 3.1 Horizontal composition: the coverage matrix as a colimit

Each probe pins one cell of the **coverage matrix**: rows indexed by verb, columns indexed by the triple (facet-kind × error-family × exercise-rung). Filling a cell means "at least one probe exercises this surface and produces a confirming receipt." The coverage matrix is exactly the colimit of the per-probe proof tokens under disjoint-union: independent cells compose by set union; coverage percentage is `|filled cells| / |total cells|`.

This composition is trivially a **commutative monoid** over `Set<CoverageCell>`: identity is the empty set, combine is set-union, associative and commutative because sets are. The spike harness's `summarizeSpike` is precisely the `foldMap` of that monoid over the receipt stream. The law "missing fixtures lower the coverage percentage monotonically" (test S7 in `spike-harness.laws.spec.ts`) is the monoid's monotonicity property in disguise.

Consequence: the coverage matrix grows *additively*. Adding a new fixture never regresses coverage for an existing fixture. Adding a new verb drops coverage percentage but raises the denominator honestly — this is a feature, not a bug: the spike's job is to make product incompleteness visible, and a newly-declared verb without a fixture is precisely product incompleteness the workshop should report.

### 3.2 Vertical composition: the metric tree reduction

Receipts aren't just cells in a coverage matrix; they're inputs to the seven-visitor metric tree. Each visitor (extraction-ratio, handshake-density, rung-distribution, intervention-cost, compounding-economics, memory-worthiness-ratio / M5, intervention-marginal-value / C6) is a pure function from a receipt stream to a `MetricNode<Kind>`. The metric tree itself is the Cartesian product of all seven visitor outputs, wrapped in a parent node.

The important structural fact: each visitor's output depends on *a subset of receipt fields*, and different visitors care about different subsets. `extraction-ratio` reads success/failure classifications; `handshake-density` reads agent-fallback events; `rung-distribution` reads exercise-rung tags; M5 reads the probe-surface cohort triple to index trajectory points. Separation of concerns is enforced at the typeclass level — the `MetricVisitor<Input, Kind>` interface carries its own `inputDescription` field.

This gives the composition a **phantom-branded natural transformation** shape: receipts (source functor) map into metric nodes (target functor) via the visitor's `visit` method, with the phantom `Kind` parameter enforcing that the visitor's declared output kind matches what it actually emits. Adding a new metric is adding a new visitor; no existing visitor changes; the receipt stream stays pure over the visitor set.

### 3.3 Longitudinal composition: the hypothesis-confirmation loop

The third composition is across *time*: receipts tagged with `hypothesisId` feed `metric-hypothesis-confirmation-rate` — the batting average of product changes predicting their own metric movement correctly. This is C6 (workshop graduation gate) in probe-IR language per `docs/v2-substrate.md §8a`.

The loop has four stations:

1. A product change ships under the `ProposalKind = 'hypothesis'` discriminator carrying a `PredictedDelta { metric, direction, magnitude? }`.
2. The next spike run produces receipts tagged with the proposal's hypothesisId.
3. `metric-hypothesis-confirmation-rate` reads (prediction, actual) pairs over a rolling window.
4. A verification receipt `{ hypothesis, predictedDelta, actualDelta, confirmed }` appends to the receipt log. The receipt log is append-only; contradiction never overwrites.

Composition-wise this is a **free monoid over (hypothesis, verification) pairs** projected through a rolling-window fold to a scalar. The hypothesisId ties prediction to verification without requiring either side to know the other's identity in advance. Prediction without verification is not a hypothesis; verification without prediction is noise — the compositional discipline forces both sides to commit.

### 3.4 Why three compositions and not one

The coverage matrix, the metric tree, and the hypothesis loop operate at **three different time scales**: one-shot (coverage is a snapshot), per-run (metrics update per execution), per-epoch (batting average updates across a rolling window of runs). Collapsing them into one mechanism would entangle time scales the same way v1's scoreboard entangled measurement and authorship. Keeping them separate means each composition can specialize its algebra — union for coverage, visitor-fold for metrics, rolling window for hypothesis — without compromise.

The integration claim is that all three compositions **share one substrate**: the ProbeReceipt. No separate log, no duplicated identity, no reconstruction. Coverage reads probe identity + cohort. Metric tree reads classification + latency + rung tags. Hypothesis loop reads hypothesisId + observed outcome. One receipt feeds all three reductions, and that's what makes the whole apparatus cheap.

## 4. The praxis — FP, Effect, and DDD shape of the probe

This section names how the probe lives idiomatically in the codebase. The scaffolding that landed at Step 5 entry (commits `step-5.scaffold-1` and `step-5.scaffold-2`) instantiates each of the patterns below; the technical references point at the exact file and function so a reader can verify the claim.

### 4.1 TestableSurface as a pure projection (DDD)

`product/domain/manifest/testable-surface.ts` projects one `VerbEntry` into one `TestableSurface` via `projectVerbToTestableSurface`. The projection is a pure function: no Effect, no IO, no mutation. This respects the domain/application/runtime layering `CLAUDE.md` prescribes — manifests are domain-level declarations, so the tuple that probes pattern-match against is also domain.

The `CompositionPath` ADT is the piece of this projection worth dwelling on. It is a seven-variant discriminated union naming *how the probe's fixture world has to be prepared*. It is not the verb's intrinsic property; it is the workshop's classifier over verbs. `atomic | memory-read | memory-write | world-observation | external-source | ledger-append | unfixturable` — each kind carries adjunct fields relevant to harness wiring. The default classifier (`defaultCompositionPathForCategory`) is total over `VerbCategory` (9 → 1 mapping); fixture specifications override per-verb.

`foldCompositionPath` is the exhaustive fold over the seven kinds, shaped identically to `foldGovernance`, `foldReasoningError`, and `foldProposalKind`. The exhaustive-fold pattern is v2's main discipline for discriminated unions: adding a new path kind is a typecheck error in every fold until the case lands. This is the compile-time enforcement that makes the ADT's closed-union claim honest.

### 4.2 ProbeHarness as an Effect Service Tag (Effect)

`workshop/probe-derivation/probe-harness.ts` declares the `ProbeHarness` port as a `Context.Tag` subclass, following the shape every other service in the codebase uses (`FileSystem`, `RuntimeScenarioRunner`, `Reasoning`, `Dashboard`, etc.):

```ts
export class ProbeHarness extends Context.Tag('workshop/probe-derivation/ProbeHarness')<
  ProbeHarness,
  ProbeHarnessService
>() {}

export interface ProbeHarnessService {
  readonly execute: (probe: Probe) => Effect.Effect<ProbeReceipt, Error, never>;
}
```

The Tag decouples *what the harness does* from *which adapter is providing it*. Four adapters are named; one (`dry-harness`) ships at Step 5 entry. The substrate-backed adapters come online as each substrate earns its way in through the same proposal-gated discipline every other v2 change goes through. At any given moment the CLI entry point composes `Layer.succeed(ProbeHarness, chosenAdapter)` and hands the resulting layer to the spike program.

This is the Strategy pattern in Effect's idiom: the caller doesn't care which harness is active, only that *some* harness is active. Test suites pick `createDryProbeHarness({ now: () => fixedDate })` with deterministic time; CI-batch runs pick `fixture-replay` for repeatability; dogfood runs pick `playwright-live` for realism; production supervision picks `production`. One program, four substrates.

### 4.3 ProbeReceipt as a phantom-staged envelope (Envelope discipline)

`workshop/probe-derivation/probe-receipt.ts` defines `ProbeReceipt extends WorkflowMetadata<'evidence'>`. The stage literal is load-bearing: it says this artifact lives at the `evidence` stage of the six-stage pipeline (`preparation | resolution | execution | evidence | proposal | projection`). A receipt is not an execution artifact — execution artifacts are `RunRecord`s, stage `execution`. The distinction matters because the metric tree reads evidence and the run record log reads execution; collapsing them would entangle what each consumer cares about.

The four phantom axes (Stage × Source × Verdict × Fingerprint) all thread through the receipt:

- **Stage**: `'evidence'` (narrow literal).
- **Source**: implicit — receipts are always workshop-authored, but the `ProbeHarnessAdapter` tag in `provenance` names which substrate *observed* the outcome.
- **Verdict**: `governance: 'approved'` — receipts are never blocked; they are evidence, not proposals.
- **Fingerprint**: three — `artifact` (envelope identity), `content` (payload content-hash), `fixtureFingerprint` (the YAML that defined this probe). The content fingerprint makes receipts deduplicatable; the fixture fingerprint makes fixture drift detectable.

The receipt's `payload.cohort` field is a `ProbeSurfaceCohort` triple (verb × facetKind × errorFamily). This is the M5 cohort key — the probe-surface cohort that replaced the scenario-ID cohort at Step 1 per `docs/v2-substrate.md §8a`. One field ties the receipt into the memory-maturity trajectory for compounding-economics measurement.

### 4.4 The spike harness as a hylomorphism (Algebra)

`workshop/probe-derivation/spike-harness.ts` exports `runSpike(input): Effect<SpikeVerdict, Error, ProbeHarness>`. The implementation has a clean hylomorphic shape:

- **Unfold (anamorphism)**: `derivation.probes: readonly Probe[]` is itself the unfold of `(manifest, fixtures)` into a probe stream. The unfold happens once, at derivation time; it's pure.
- **Action (the effectful middle)**: for each probe, `harness.execute(probe)` yields one `ProbeReceipt`. This is the only effectful layer; the rest is pure.
- **Fold (catamorphism)**: `summarizeSpike({ manifest, derivation, receipts, generatedAt })` reduces the receipt stream into a `SpikeVerdict` carrying per-verb breakdowns, coverage percentage, and pass/fail gate.

This is structurally identical to the convergence-proof harness (`workshop/orchestration/convergence-proof.ts`) which is also a hylomorphism over cold-start trials. The codebase treats this pattern as first-class: `product/domain/algebra/hylomorphism.ts` declares `UnfoldStep<S, T>` + `Hylomorphism<S, T, A>` + `runHyloEffect`. The spike could be refactored onto the `runHyloEffect` primitive — for now it uses plain `Effect.gen` because the loop is simple enough that the primitive would obscure rather than clarify.

### 4.5 The fixture YAML grammar as a bounded schema (DDD)

The fixture-spec grammar (`docs/v2-readiness.md §4`) is intentionally narrow: six required fields (`verb`, `schemaVersion`, `fixtures[]`, each with `name`, `description`, `input`, `expected`) and two optional (`worldSetup`, `exercises`). The narrowness is the discipline — a fixture that needs more than 30 lines of YAML to specify is signaling that the verb's surface is harder than the IR admits, which is itself the spike's pass/fail discriminator per `docs/v2-substrate.md §6a`.

The fixture's `input` field is **unchecked at parse time**. The fixture loader validates only the grammar, not the input's shape against the verb's declared input type. This is deliberate: the shape validation happens at probe-execution time, inside the harness adapter. Putting shape validation at parse time would require a runtime type registry (Zod, @effect/schema) that v2 has deliberately deferred. Deferring the registry keeps the manifest prose-only; the cost is that fixture-authoring errors surface at probe-execution rather than at fixture-load, and the spike's verdict absorbs that cost.

### 4.6 Laws as provable invariants (FP)

Every piece of the scaffolding ships with a `.laws.spec.ts` file. The law-style test is v2's main discipline for pinning structural invariants the type system cannot enforce. The Probe IR spike has two law files:

- `product/tests/manifest/testable-surface.laws.spec.ts` — 7 laws pinning the projection's fidelity (L1 surjective, L2 order-preserving, L3 closed-union, L4 fold-exhaustive, L5 defaulter-total, L6 error-family-preserving, plus a snapshot of the current 8-verb classification).
- `tests/probe-derivation/spike-harness.laws.spec.ts` — 9 laws pinning the end-to-end spike (S1 one receipt per probe, S2 dry-harness always confirms, S3 per-verb sums to probe count, S4 gate pure over derivation buckets, S5 envelope shape, S6 latency non-negative and fingerprints non-empty, S7 fixture gaps lower coverage monotonically, S8 current 3 fixtures yield 7 probes, S9 current state fails 80% gate by design).

The laws are not exhaustive tests; they are *invariants the implementation must never break*. When a new probe harness adapter lands, the laws don't change — the adapter slides in under the same tests. This is what the testability-as-lawhood pattern buys: adapters swap, invariants persist.

## 5. The spike protocol — what to do, in order

The spike protocol from `docs/v2-substrate.md §6a` is five steps. Each step's deliverable, its test-pass condition, and its verdict are named below.

### Step 5.1 — Baseline: run the spike under the dry-harness

**Command**: `npm run build && node dist/bin/tesseract.js probe-spike`

**Expected output** (current state, 2026-04-21):

```
Probe IR Spike — manifest v1, 8 declared verbs
  Coverage: 3/8 verbs (37.5%) — gate FAIL @ 80%
  Probes synthesized: 7
  Receipts confirming expectation: 7/7
  Uncovered verbs (no fixture): facet-enrich, facet-mint,
                                 intent-fetch, interact,
                                 locator-health-track
```

**Verdict**: the spike plumbing is runnable; the current coverage fails the 80% gate by design. The failure is informative — it tells the agent exactly which five verbs need fixtures.

### Step 5.2 — Author the five missing fixtures

The five uncovered verbs (`facet-enrich`, `facet-mint`, `intent-fetch`, `interact`, `locator-health-track`) each need a `<verb>.probe.yaml` file alongside the verb's declaration module. Each fixture should target 2–4 probe entries covering:

- One happy-path fixture (`expected: matched`, `errorFamily: null`).
- At least one failure-path fixture per named error family in the verb's manifest entry.
- Where the verb declares a ladder (e.g., `observe` has the 6-rung locator ladder), one fixture per probed rung.

**Deliverable**: 5 YAML files, each ≤30 lines, living at:

| Verb | Fixture path |
|---|---|
| `facet-mint` | `product/domain/memory/facet-mint.probe.yaml` |
| `facet-enrich` | `product/domain/memory/facet-enrich.probe.yaml` |
| `intent-fetch` | `product/instruments/intent/intent-fetch.probe.yaml` |
| `interact` | `product/runtime/widgets/interact.probe.yaml` |
| `locator-health-track` | `product/domain/memory/locator-health-track.probe.yaml` |

(Note: the fixture loader looks for `<verb-name>.probe.yaml` in the directory of the verb's `declaredIn` path. Several verbs share `product/domain/memory/facet-record.ts`; the loader keys on the verb name, not the declaration path, so multiple verbs can coexist in one directory.)

**Test-pass condition**: `npx vitest run tests/probe-derivation/` shows derivation.probes count rising as fixtures land; the spike-laws test S8 (currently asserting 7) gets updated to the new count; the 80% gate flips.

### Step 5.3 — Verify one fixture grows beyond 30 lines

Fixture growth past 30 lines is the spike's **fail signal**: it means the verb's input shape admits too much variation for mechanical synthesis. If any of the five fixtures in Step 5.2 cannot be authored under 30 lines without feeling contorted, that verb's fixture **needs a hand-lifted schema** (the exit condition from the protocol). The spike's final verdict names those verbs explicitly.

**Expected outcome at the fixture-set-complete moment**: 4 of 5 new fixtures fit under 30 lines; 1 (probably `intent-fetch` or `interact`) is borderline. The spike records those borderline cases and proceeds.

### Step 5.4 — Compute the verdict

The verdict is the `SpikeVerdict` the CLI already emits. Three discriminators:

- **Pass**: coverage ≥ 80%, all fixtures ≤ 30 lines, receipts confirm uniformly under the dry-harness.
- **Pass with named gaps**: coverage ≥ 80%, but one or more verbs named as needing hand-lifted schemas.
- **Fail**: coverage < 80% and no tractable path to fix it without substrate-backed harness work first.

Each discriminator has a concrete next step. The verdict document is committed to `workshop/observations/probe-spike-verdict-01.md` as an append-only observation.

### Step 5.5 — Graduate from dry-harness to fixture-replay

The dry-harness proves the seam; fixture-replay proves the substrate. When Step 5.2–5.4 pass, author the `FixtureReplayProbeHarness` adapter that swaps the dry harness's "observed = expected" logic for "observed = run the verb against a captured DOM snapshot and classify the result."

**Scope guard**: fixture-replay is Step 5's *exit* deliverable, not its entry. The spike is the dry-harness; fixture-replay is how the spike becomes useful beyond its seam-proof purpose. This is a commit boundary worth preserving: the spike's go/no-go verdict (Step 5.4) decides whether fixture-replay ships at Step 5 or defers to Step 6.

## 6. The substrate-backed harnesses — what the three real adapters look like

The dry-harness proves the seam; the three substrate-backed adapters prove the substrate. Each adapter's implementation is named below with enough specificity that a new agent picking up the work can land it in a week of scoped effort.

### 6.1 FixtureReplayProbeHarness — deterministic world, real verb

**What it does**: runs the verb's actual product code against a captured DOM snapshot + fixture catalog state. The "world" is frozen — no real browser, no network, no operator intervention. The verb runs its normal Effect program; the harness injects the snapshot as the Playwright page surrogate, the fixture catalog as the `FacetCatalog` layer, and a deterministic clock.

**Inputs it needs beyond the Probe**:
- A snapshot fixture: `product/fixtures/snapshots/<screen>.html` — captured DOM.
- A catalog fixture: `product/fixtures/catalogs/<name>.yaml` — the facet catalog state to inject.

**Implementation sketch**:
```ts
export function createFixtureReplayProbeHarness(opts: {
  readonly snapshotDir: string;
  readonly catalogDir: string;
}): ProbeHarnessService {
  return {
    execute: (probe) => Effect.gen(function* () {
      const snapshot = yield* loadSnapshot(opts.snapshotDir, probe);
      const catalog = yield* loadCatalog(opts.catalogDir, probe);
      const layer = Layer.mergeAll(
        Layer.succeed(PlaywrightBridge, snapshotAsPlaywrightBridge(snapshot)),
        Layer.succeed(FacetCatalog, catalog),
        Layer.succeed(Clock, deterministicClock()),
      );
      const observed = yield* runVerbUnderLayer(probe, layer);
      return buildReceipt({ probe, observed, adapter: 'fixture-replay', ... });
    }),
  };
}
```

**Why it's worth landing before playwright-live**: fixture-replay gives the workshop a reproducibility guarantee playwright-live can never offer. The same probe against the same snapshot produces byte-identical receipts across runs. When a metric moves, fixture-replay can prove the movement was product-caused, not substrate-caused.

### 6.2 PlaywrightLiveProbeHarness — real browser, synthetic app

**What it does**: runs the verb's actual product code against a real Playwright browser pointed at a synthetic React app (or a fixture site the workshop controls). Real page rendering, real JavaScript, real widget state — but the app itself is ours.

**Inputs it needs beyond the Probe**:
- A synthetic app the harness can launch: `workshop/synthetic-app/` (new subdirectory) — a minimal React app with the screens probes reference.
- A Playwright page factory (the `HeadedHarness` factory already exists at `product/instruments/tooling/headed-harness.ts`).

**Implementation sketch**:
```ts
export function createPlaywrightLiveProbeHarness(opts: {
  readonly appUrl: string;
}): ProbeHarnessService {
  return {
    execute: (probe) => Effect.gen(function* () {
      const harness = yield* launchHeadedHarness({
        initialUrl: opts.appUrl,
      });
      const layer = Layer.succeed(PlaywrightBridge, harness.bridge);
      try {
        const observed = yield* runVerbUnderLayer(probe, layer);
        return buildReceipt({ probe, observed, adapter: 'playwright-live', ... });
      } finally {
        yield* Effect.promise(() => harness.dispose());
      }
    }),
  };
}
```

**Why after fixture-replay**: playwright-live introduces real-world flakiness (network jitter, rendering delays, Chromium version drift). Workshop wants signal, not noise. Running fixture-replay first isolates product-caused movement from substrate-caused movement; running playwright-live second captures the substrate contribution deliberately.

### 6.3 ProductionProbeHarness — real browser, customer tenant

**What it does**: same as playwright-live, but the target URL is a customer's actual OutSystems tenant. The verb runs real product code against real customer DOM. This is the highest-signal substrate and the one that eventually pays the graduation bill.

**Scoping note**: production probes only run under explicit operator authorization per the trust-policy gate. The adapter doesn't implement anything new — it's `playwright-live` with a different URL — but the operator-authorization gate at the CLI level is load-bearing.

**Implementation**: thin factory over `playwright-live` with the `adapter` tag changed to `'production'`.

### 6.4 What's shared across all three

All three substrate-backed adapters use the same composition pattern: `Layer.mergeAll` to inject the environment-specific services (PlaywrightBridge, FacetCatalog, Clock), then `runVerbUnderLayer(probe, layer)` to execute the verb's actual Effect program under the injected services. The probe's work item goes through `product/application/commitment/run.ts` → `runScenarioSelection` via an intent source that reads `source: 'probe:<verb>:<fixture>'` from the probe's identity.

The harness's job is NOT to re-implement the verb. The harness is *a Layer provider* — it supplies the environment the verb needs, then lets the product's normal flow run. This is what "probes run through the product's normal authoring flow" means in Effect's idiom: the harness IS the composition decision, and the verb's code doesn't know a probe is probing it.

### 6.5 Retirement of the transitional probe set

When FixtureReplayProbeHarness lands (Step 5.5), the same commit deletes `workshop/probe-derivation/transitional.ts` per the retirement protocol in `docs/v2-readiness.md §5.3`. The commit message: *"Step 5: retire transitional probe set; manifest-derived probes take over for [list of verbs]."*

## 7. Graduation metrics — how we know the spike worked

The spike has a short, named graduation condition: **three verdicts stacked over three runs**. Workshop is out of Step 5 when:

1. **Coverage gate holds** (≥ 80% of declared verbs have fixture YAMLs; current value queryable via `tesseract probe-spike`).
2. **Fixture economy holds** (every fixture ≤ 30 lines, or the verb exceeding is named and has a hand-lifted schema commitment).
3. **Reproducibility holds** (fixture-replay harness produces byte-identical receipts across three consecutive runs on the same commit).

The first two are static properties of the codebase. The third is a runtime property — `tesseract probe-spike --adapter fixture-replay` run three times, receipts diffed, hashes identical. When all three hold the workshop can declare the probe IR authoritative and the next phase's work (Step 6 customer ship) proceeds with probes as its measurement substrate rather than the transitional set.

### 7.1 What the spike does NOT have to prove

- **Every verb covered.** 80% is the gate, not 100%. The remaining 20% land fixture-by-fixture as verbs ship in Phase 3.
- **Every error family exercised.** Rare error families (e.g., `rate-limited` on `intent-fetch`) may have no tractable synthetic trigger; those show as coverage holes the fixture report surfaces.
- **Every rung tested.** Ladder rungs that only fire under specific real-world DOM (e.g., `observe` rung 5 `test-id`) can defer until fixture-replay can construct that rung's trigger.
- **Any hypothesis confirmation.** `metric-hypothesis-confirmation-rate` wires in at Step 10 (L4 self-refinement). Step 5 ships the substrate that metric will read; the metric itself is future work.

### 7.2 What the spike absolutely must prove

- **One probe can run end-to-end under the dry-harness.** (Proven today by `tesseract probe-spike`.)
- **The coverage percentage is computable.** (Proven by `SpikeVerdict.coverage.coveragePercentage`.)
- **Fixtures compose into probes mechanically.** (Proven by `deriveProbesFromInputs` + its 12 laws.)
- **Receipts land in evidence-stage envelopes with M5-ready cohort keys.** (Proven by `ProbeReceipt extends WorkflowMetadata<'evidence'>` + S5 law.)
- **Graduating to fixture-replay doesn't require reshaping any of the above.** (Proven by the Layer-swap discipline — same program, different adapter.)

The spike's pass condition is these five provable claims, not "full coverage." The 80% gate is a coverage floor; the five claims are the structural floor.

## 8. First principles — from synthetic probes to production results

This section defends the entire enterprise. The reader has every right to ask: *if our probes run against synthetic DOM, fixture snapshots, and in-memory catalogs, how do we know what they tell us is true of a customer's actual OutSystems tenant?* That is the epistemological question this section answers from first principles. The defense proceeds in six steps, each committed separately over the next few subsections.

### 8.1 The core premise, plainly stated

**We are not building a test harness that simulates the product's behavior. We are building a measurement harness that runs the product's actual code against substrates of varying fidelity, and we derive increasingly strong claims from increasingly faithful substrates.** The probe is a commitment device: it says "when verb V runs against a world shaped like W, the product will produce outcome O." What varies across substrates is not the verb — the verb is always the same shipping code — but the world. The claim the spike makes is about the verb's **behavior under a declared world-shape**, not about every possible world.

That single distinction is the whole epistemology. A synthetic probe's receipt is honest to the extent that the world-shape is honest. When we say `observe` with fixture `visible-button-on-known-screen` expects classification `matched`, we are asserting that under a DOM where a button with role=button and accessible-name="Search" is visible and enabled, the product's observe verb will classify it as matched. That assertion is substrate-invariant — it holds whether the DOM is synthesized by React, captured from OutSystems, or rendered live by a customer tenant — because the product's classification logic does not know or care which source produced the DOM. It reads the DOM it's given.

The premise is robust because the probe's claim is narrow. It does not claim: "customers will never hit an edge case this probe missed." It claims: "for the surface this fixture declares, the product behaves as declared." The first claim is false of any finite test set; the second claim is provable, probe by probe.

### 8.2 The substrate-invariance theorem — why synthetic receipts are honest

The substrate-invariance theorem, stated precisely: **for a probe `P` whose fixture declares world-shape `W`, the product verb's classification of `W` is identical across any substrate that presents `W`.** The theorem holds because of three structural facts about the product's architecture:

**Fact 1: Verbs consume their inputs, not the substrate that produced them.** Look at `product/instruments/observation/aria.ts` — the `observe` verb takes a `PlaywrightBridgePort` + a request shape and produces an `AriaSnapshot`. The bridge is a Layer-injected port. Whether the port wraps a real Chromium page, a captured snapshot, or a synthetic fixture makes no difference to the verb's logic. The verb reads whatever the port returns.

**Fact 2: The classification logic is pure over the observed data.** The product's classifiers (not-visible detection, role resolution, locator ladder ordering) are pure functions over the data the port produces. Purity means: same input → same output. If two substrates present the verb with byte-identical input, the classifier produces byte-identical output. This is enforced by the coding-notes discipline in `docs/coding-notes.md §FP`: classifiers live in `product/domain/` and must be side-effect-free.

**Fact 3: Error families are declared as a closed union.** Every verb's possible error family is a member of a closed TypeScript union (`InteractErrorFamily`, `ReasoningError.family`, etc.) declared at the verb's `errorFamilies[]` manifest field. The classifier cannot produce an error outside that union — the compiler forbids it. This means a probe asserting `errorFamily: 'not-visible'` is asserting a check over a known-finite set, not an open-ended prediction.

Together these three facts give the substrate-invariance claim its teeth: if your synthetic substrate reproduces the input shape faithfully, the verb will classify it identically to a production substrate. The probe's receipt is honest because the fixture's world-shape is the *contract* — substrate fidelity is a separate property than receipt honesty.

**What substrate-invariance does NOT claim**: that every world-shape a customer's tenant will produce is present in some fixture. Fixtures are a finite set; customer DOM is unbounded. Substrate-invariance says "if the shape matches, the verdict matches"; it does not say "all shapes match."

### 8.3 The substrate ladder — monotonicity and staircase claims

The spike does not claim synthetic probes are equivalent to production probes. It claims something weaker but more defensible: **monotonicity up the substrate ladder**. The ladder has four rungs, ordered by fidelity:

| Rung | Substrate | What it proves | What it doesn't |
|---|---|---|---|
| 1 | dry-harness | The seam shape: probes derive, execute, emit receipts. | Anything about verb behavior. |
| 2 | fixture-replay | Verb classifiers produce declared outcomes on captured DOM. | Behavior under live network, async rendering, real event dispatch. |
| 3 | playwright-live (synthetic app) | Verb classifiers work under real browser event semantics. | Customer-specific DOM peculiarities. |
| 4 | production (customer tenant) | Verb classifiers work on the specific customer surface. | Other customers' tenants. |

**The monotonicity claim**: if a probe **fails** at rung N, it almost certainly fails at every rung below N. Lower rungs are strictly simpler — they remove sources of substrate variance. A probe that fails to observe a button on a fixture-replay snapshot will also fail on the live customer page that *produced* that snapshot. Failure at low fidelity is high-signal evidence of product defect.

**The staircase claim**: if a probe **passes** at rung N, it *may* pass at rung N+1 but we do not know until we test. Passing at low fidelity is a necessary condition for passing at high fidelity, not a sufficient one. Passing at rung 2 (fixture-replay) tells us the verb's classifier is correct on the captured DOM; it doesn't tell us whether the live customer tenant will render DOM in the same shape next week.

This asymmetry — failure is predictive, success is permissive — is what justifies running synthetic probes in the first place. Synthetic substrate is **cheap noise-free failure detection**: it catches regressions before they reach customers. Production substrate is **expensive success validation**: it confirms the product's actual customer-facing behavior. We run synthetic substrate at every commit; we run production substrate at customer-ship boundaries.

### 8.4 What synthetic probes cannot prove (and what fills the gap)

Being explicit about the limits of synthetic testing is part of the first-principles defense. Synthetic probes **cannot**:

- **Discover unknown customer edge cases.** A fixture encodes one world-shape; novel customer DOM may present shapes no fixture anticipates.
- **Validate non-functional requirements.** Latency under production load, memory consumption under sustained use, auth gate behavior under real tenant policies — these are substrate-dependent and synthetic substrates cannot simulate them honestly.
- **Prove behavior outside declared error families.** If a customer's tenant produces an error that no verb's `errorFamilies[]` names, the product classifies it as `unclassified` — and the probe's expected classification was presumably against a named family. Unknown-error outcomes escape the probe's purview by design.
- **Substitute for operator judgement.** A probe can assert "the verb classified correctly"; it cannot assert "the classification was the right thing for the customer." That's a trust-policy decision the operator makes.

The gap between what synthetic probes prove and what customer-facing correctness requires is closed by **three complementary mechanisms**:

1. **Substrate plurality** (§6): running probes at all four rungs of the ladder, not just the cheapest one. The expensive rungs are sparse but load-bearing for production-like signal.
2. **Customer incident backfill** (§8.5): every customer-reported issue becomes a new fixture. The probe set grows toward customer reality over time.
3. **The hypothesis-confirmation loop** (§3.3): every product change carries a predicted metric delta; mismatches surface as the workshop's batting-average data rather than silent acceptance.

The synthetic substrate does the cheap work. The substrate ladder, the incident backfill, and the hypothesis loop do the expensive work. Together they compose to a claim stronger than any one alone: *the product does what it says it does, and when it doesn't, we find out fast and codify the lesson into a probe.*

### 8.5 Customer incidents as fixture sources — the ratchet that narrows the substrate gap

The gap between the synthetic probe set and the space of all customer DOM shapes does not stay constant. It narrows over time via a deliberate mechanism: **every customer-reported incident becomes a probe fixture**.

The ratchet works like this:

1. A customer reports an issue. The issue represents a world-shape the synthetic probe set did not anticipate — by definition, because if the probe set had anticipated it, the probe would have caught the regression before release.
2. The incident investigation produces a **world capture**: a DOM snapshot or structured description of the customer surface that elicited the issue.
3. The investigation produces a **classification verdict**: what the product *should* have done on that world-shape.
4. A workshop commit lands a new fixture entry under the relevant verb's `.probe.yaml`, encoding the captured world + expected classification as a probe.
5. The next CI run includes that probe. Every subsequent product change must pass it or explicitly carry a hypothesis that predicts the metric movement.

The mechanism is a **monotonic ratchet** in two senses. First, fixtures never get removed — once a customer world-shape is captured as a probe, it stays captured (subject to the same append-only discipline every other log honors). Second, coverage can only grow: each incident narrows the space of uncovered customer world-shapes by exactly one shape.

**Why this matters for the first-principles defense**: the synthetic substrate at any given moment is a *lower bound* on customer coverage, and the bound rises monotonically as incidents are incorporated. A new agent reading this memo should understand that "what synthetic probes prove" is not a static claim — it is a claim that grows over time as the fixture set grows. The workshop's graduation condition (100% verb coverage + sustained hypothesis-confirmation rate) is explicitly a *moving target*: it shifts as customer reality educates the fixture set.

**Concrete authorship pattern for incident-to-fixture**:

```yaml
# product/instruments/observation/observe.probe.yaml
# (adding a new fixture)
  - name: outsystems-form-validation-region
    description: |
      CUSTOMER-DERIVED: customer tenant acme-corp presented a
      validation message element that synthetic fixtures did not
      anticipate — the element was role="alert" with no accessible
      name and a dynamic test-id. observe mis-classified as
      ambiguous; correct behavior was matched with the role-rung.
      Originally reported 2026-05-XX, incident ref: TESS-417.
      Now a probe; any regression on this shape breaks CI.
    input:
      surface:
        screen: customer-home
        facet-kind: element
      target:
        role: alert
    expected:
      classification: matched
      error-family: null
    exercises:
      - rung: role
```

### 8.6 Substrate-drift detection — keeping new substrates honest

As the workshop adds substrates (fixture-replay captures, synthetic app versions, production customers), each new substrate introduces a failure mode: it may not faithfully represent the world its fixtures claim. A React synthetic app upgrade might render role semantics differently than its predecessor; a captured DOM snapshot might lose event-listener state; a customer tenant's update might change ARIA conventions. The workshop must detect these **substrate drifts** before they masquerade as product regressions.

The detection discipline is a **substrate parity test**: when a new substrate is introduced at rung N, it is run against the existing probe set, and its receipts are compared to the same probes' receipts at rung N-1 (the previous-rung substrate). Receipts that mismatch across rungs within a tolerance band are substrate-drift, not product drift.

```
           probes                       probes
             │                            │
             ▼                            ▼
     fixture-replay  ────  compare  ────  playwright-live
         receipts          fail if       receipts
                           disagreement     │
                           exceeds band     ▼
                                        substrate-drift
                                        OR product-drift?
                                              │
                                              ├─ product change in between?
                                              │    YES → hypothesis-confirmation
                                              │           loop adjudicates
                                              │    NO  → substrate drift; investigate
                                              └─
```

The tolerance band exists because substrate-variant properties (latency, event timing, pixel layout) legitimately differ across rungs. The invariant-band properties (classification, error-family, rung) should not differ within a tolerance. A new substrate that produces a classification mismatch on a probe that worked on the prior substrate is a substrate regression, and the workshop's response is to **either** fix the substrate **or** explicitly downgrade the probe's substrate-ladder claim (e.g., "this probe is valid at fixture-replay but not at playwright-live because of a known React-upgrade difference").

The substrate-drift detection is itself proposal-gated: new substrates land through the same trust-policy gate that knowledge proposals use. A substrate proposal must include its parity test results and name any probes whose receipts it invalidates. This keeps the substrate ladder honest across time — new rungs cannot silently invalidate old proofs.

**Roadmap for substrate addition**:

| Stage | New substrate added | Parity gate |
|---|---|---|
| Step 5.5 | FixtureReplayProbeHarness + captured-DOM snapshots | vs dry-harness |
| Step 6.0 | PlaywrightLiveProbeHarness + minimal synthetic React app | vs fixture-replay |
| Step 6.1 | Additional screens on synthetic React app | vs previous synthetic-app version |
| Step 6.2 | First customer-authorized DOM capture | vs synthetic-app playwright-live |
| Step 7.0 | L1 memory substrate (facet catalog with evidence log) | vs Step 6 baseline |
| Step 10.0 | Production probe against live customer tenant | vs customer-authorized captures |

Each stage's parity gate is a law the new substrate must satisfy before it becomes authoritative. A failed gate is a naming event — the problem gets diagnosed and either the new substrate earns its place or the rollout blocks until it does.

**What this buys us**: confidence that growing the substrate ladder over time does not erode the probe set's validity. A probe that was meaningful at Step 5 stays meaningful at Step 10, or it gets explicitly retired with a commit record. No silent drift. No substrate-induced flakiness passed off as product flakiness. The measurement substrate grows monotonically in fidelity.

## 9. For the next agent — reading order + first-hour tasks

You are picking up the Probe IR spike on top of commit `step-5.scaffold-2` (SHA visible in `git log --oneline`). The scaffolding exists; the spike runs; the gate fails at 37.5%; the fix is authoring 5 fixtures. Here's how to orient and land your first contribution in under two hours.

### 9.1 Read in this order (~65 minutes total)

1. **This memo §§0–4** (~12 minutes). The ontology + atomic/compositional claims + the FP/Effect/DDD praxis.
2. **This memo §8** (~15 minutes). The first-principles defense. Read before trusting any probe receipt.
3. **The substrate-in-code** (~20 minutes):
   - `product/domain/manifest/testable-surface.ts` — understand `TestableSurface` + `CompositionPath`.
   - `workshop/probe-derivation/probe-ir.ts` — understand `Probe`, `ProbeFixtureDocument`, `SpikeCoverageReport`.
   - `workshop/probe-derivation/probe-harness.ts` — understand the `ProbeHarness` tag and the dry adapter.
   - `workshop/probe-derivation/spike-harness.ts` — understand `runSpike` and `summarizeSpike`.
4. **One existing fixture** (~5 minutes):
   - `product/instruments/observation/observe.probe.yaml` — the simplest of the three; two fixtures, one happy-path one failure-path.
5. **The laws** (~5 minutes):
   - `tests/probe-derivation/spike-harness.laws.spec.ts` — pattern-match your next fixture's expectations here.
6. **This memo §§5–7 + §9** (~8 minutes). The protocol, the substrate roadmap, graduation metrics.

### 9.2 Run the spike yourself (~2 minutes)

```bash
npm run build
node dist/bin/tesseract.js probe-spike | tail -40
```

You should see `Coverage: 3/8 verbs (37.5%) — gate FAIL @ 80%`. If you don't, something upstream has changed; re-read this memo's §5.1.

### 9.3 Pick your first fixture and author it (~40 minutes)

The easiest first fixture is `facet-mint` — it's a pure in-memory operation (no live DOM, no external source). Fixture lives at `product/domain/memory/facet-mint.probe.yaml`. Two fixtures to seed:

1. `mint-new-facet-succeeds` — input carries a new facet shape, expected classification is `matched`.
2. `mint-duplicate-id-fails-assertion` — input reuses an existing facet ID, expected classification is `failed` with error-family `assertion-like` (per the manifest entry's declared families).

**Test-pass condition**: `npx vitest run tests/probe-derivation/spike-harness.laws.spec.ts` — the S8 law (`7 probes → 9 probes`) needs updating to `(2+2+3+2)=9`. Update the law to match, re-run, watch it pass.

**Commit message pattern**: `step-5.fixture-facet-mint: 2 probes for facet-mint verb; coverage 3/8 → 4/8`.

### 9.4 Iterate until the gate flips

Land the remaining four fixtures (`facet-enrich`, `intent-fetch`, `interact`, `locator-health-track`) one commit at a time. Each commit:

1. Authors one `<verb>.probe.yaml` under 30 lines.
2. Updates the S8 law's assertion to the new probe count.
3. Updates the S9 law's coverage-percentage expectation (the ratio is `fixtured-verbs / 8`).
4. Commits with `step-5.fixture-<verb>: N probes for <verb> verb; coverage X/8 → Y/8`.

When coverage reaches 7/8 or 8/8 (87.5% or 100%), the S9 law flips from `expect(passesGate).toBe(false)` to `expect(passesGate).toBe(true)`. That's the gate-flip moment — record it as the spike's verdict in a new file `workshop/observations/probe-spike-verdict-01.md` per §5.4.

### 9.5 If a fixture is fighting you

If a verb resists fixture authoring under 30 lines, **do not force it**. The spike protocol treats bloated fixtures as a signal, not a failure. Document the resistance in your fixture's header comment:

```yaml
# Fixture specification for the `<verb>` verb.
# Grammar: docs/v2-readiness.md §4.
# SPIKE NOTE: this fixture exceeds 30 lines because <specific reason>.
# A hand-lifted schema under <path> may be required; see
# docs/v2-probe-ir-spike.md §5.3.
```

Then proceed with a truncated fixture (1–2 entries instead of 3–4) and flag it in the spike verdict. The spike's job is to name these constraints, not hide them.

### 9.6 After the gate flips — Step 5.5 hand-off

Once the coverage gate passes, you have one more substantive deliverable: `createFixtureReplayProbeHarness` per §6.1. At that point the spike graduates from "seam-proof" to "substrate-proof" and the workshop can start reading real product signal.

If at that point you want to hand off again, the next agent's first task is `createPlaywrightLiveProbeHarness` per §6.2. The substrate plurality — fixture-replay / playwright-live / production — is designed to let those deliverables land in parallel because they share the harness port and differ only in Layer composition.

## 10. Coda — why this matters beyond Step 5

The Probe IR is not just Step 5's work; it is the seam that makes every future step cheaper. Step 7 (L1 memory) lands with probes that exercise repeat-authoring; no new measurement apparatus needed, just new fixtures. Step 8 (L2 operator semantics) lands with probes that exercise vocabulary-alignment; no new apparatus, just new fixtures. Step 9 (L3 drift) lands with perturbation probes; the convergence-proof harness — already a hylomorphism — consumes them. Step 10 (L4 self-refinement) closes the hypothesis loop; the probe's `hypothesisId` field is where it closes.

Every one of those steps is a fixture-authoring commit plus a metric declaration. None of them requires standing up new infrastructure. That is what it means to say the workshop doesn't grow — it measures more, but its measurement substrate is stable. This is v2's aesthetic win made structural: the seam between `product/` and `workshop/` is the manifest plus the log set, and the probe IR is the mechanical projection that makes the seam measurable.

When the spike passes, the workshop's future is twenty commits of YAML authorship and three adapter implementations. When the workshop's graduation condition holds (100% coverage + sustained hypothesis-confirmation floor), those commits stop landing because there is nothing left to measure. The workshop goes quiet. The product ships.

That is the plan. Get the spike right and everything after rides on the substrate.

