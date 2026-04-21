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
