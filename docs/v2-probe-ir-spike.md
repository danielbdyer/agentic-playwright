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
