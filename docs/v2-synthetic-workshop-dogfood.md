# v2 Synthetic Workshop Dogfood — Design Memo

> Status: **forward-looking design memo**, drafted 2026-04-21 at the conclusion of Step 4c. This is the next-generation replacement for v1's `dogfood/scenarios/` corpus (retired at Step 1 per `v2-direction.md §6`). The memo is scoping, not prescriptive; specific fixture shapes land at Step 5 (probe IR spike) and compound across Steps 7–10.

## 1. The problem this memo addresses

v1 shipped a hand-authored scenario corpus under `dogfood/scenarios/` that served as both the workshop's measurement substrate and a smoke-test harness for the compiler. It had three failure modes:

1. **Hand-authorship drift.** Every new verb, every shape change, every new error family needed a scenario author to keep the corpus honest. The corpus always lagged behind the product's surface; coverage was never knowable.
2. **Selector leakage.** Scenarios embedded DOM shapes directly, so selector drift in the customer app silently invalidated scenarios. The workshop "passed" on a fiction.
3. **No cohort discipline.** Scenarios were keyed by ADO-task ID, which meant a single bad probe pattern could masquerade as N distinct failures. M5 couldn't calibrate itself.

v2's answer is to retire the hand-authored corpus entirely and derive the measurement substrate from `product/`'s manifest plus per-verb fixture specifications. **The manifest is the probe substrate; the workshop's dogfood is what the workshop authors against its own manifest.** This memo names what the synthetic dogfood looks like once Step 5's spike has validated the IR.

## 2. The handshake in one sentence

**Workshop reads `product/manifest/manifest.json`, derives one probe per `(verb × fixture × error-family)` triple, runs each probe through `product/`'s normal authoring flow, records evidence into the existing append-only log set, and calibrates the seven-visitor metric tree over the resulting run records.**

The workshop does not hand-author scenarios. It derives them. The only hand-authored artifact in the loop is the per-verb fixture specification — a tiny YAML file alongside each verb declaration.

## 3. The five primitives applied

| Primitive | In synthetic dogfood |
|---|---|
| **Agent** | The same Reasoning port the product ships. No second agent stack for measurement. |
| **Intent source** | Fixture-declared intent phrases plus verb descriptions. The manifest is the vocabulary. |
| **World** | Three substrates: `synthetic` (a generated React app), `fixture-replay` (captured DOM snapshots), `production` (customer OutSystems app). The probe IR is substrate-agnostic; the runner resolves which world to use via `--substrate`. |
| **Instruments** | `product/instruments/` unchanged. Workshop calls the same facet-mint, facet-query, interact, observe, test-compose the customer's agent calls. |
| **Memory** | The append-only log set in `product/logs/`. Workshop reads run records, evidence, receipts, proposals. It does not maintain a second memory. |

## 4. The probe IR shape

Per `v2-readiness.md §4`, the fixture grammar is:

```yaml
verb: facet-mint
schemaVersion: 1
fixtures:
  - name: headless-happy-path
    description: "Mint a facet for a button that exists, is visible, enabled."
    input:
      intent: "Find the submit button on the checkout page"
      screen: "checkout"
    worldSetup:
      kind: synthetic
      domFragment: "<button data-testid='submit' aria-label='Submit order'>Submit</button>"
    expected:
      classification: matched
      errorFamily: null
    exercises:
      - rung: "role"
  - name: ambiguous-role
    description: "Mint against two same-role elements; expects ambiguity."
    input:
      intent: "Find the submit button"
      screen: "checkout"
    worldSetup:
      kind: synthetic
      domFragment: "<button>Submit A</button><button>Submit B</button>"
    expected:
      classification: ambiguous
      errorFamily: ambiguous-match
    exercises:
      - rung: "role"
        errorFamily: "ambiguous-match"
```

A probe is `(verb × fixture × exercise)`. The exercise names which rung and/or error-family the probe is meant to reach — it is the probe's declared hypothesis about where the product should resolve.

## 5. Probe coverage as the graduation clock

The workshop's graduation condition (per `v2-substrate.md §5`) is **probe coverage = 100% across the manifest's declared verbs × error families, with `metric-hypothesis-confirmation-rate` sustaining above floor for three consecutive windows**. Synthetic dogfood is how coverage grows.

- **Each manifest verb declaration emits a coverage row.** The row lists the verb's declared error families plus its rungs (for verbs that declare a resolution ladder).
- **Each fixture exercise fills a cell.** A `(verb × error-family × rung)` cell is covered when at least one probe exercises it and produces the expected classification.
- **The coverage report is a manifest-declared verb.** `workshop-coverage-report` returns the current matrix; dashboards render it without knowing probe internals.

At Step 0 baseline (pre-spike), the coverage matrix is empty except for the transitional probe set's 5–10 rows. At Step 5 (spike), the matrix grows to validate three representative verbs. At Step 6 (customer ship), the matrix accompanies first-customer work and its gaps become the tuning target. By Step 10, coverage is dense enough that graduation is plausible.

## 6. What this replaces from v1

v1 had three interlocking artifacts that this design collapses:

- **`dogfood/scenarios/*.yaml`** — hand-authored task scenarios. **Retires.** The probe IR derives equivalent probes from the manifest.
- **`dogfood/benchmarks/*.yaml`** — named benchmark runbooks grouping scenarios. **Reshapes.** A benchmark in v2 is a named subset of the coverage matrix (e.g., `flagship-policy-journey` selects rows from the `rerun-plan`, `test-compose`, and `test-execute` coverage rows). The benchmark file is a few-line YAML listing fixture IDs, not a scenario corpus.
- **`dogfood/controls/*.yaml`** — expected-winning-source overrides. **Retires.** The fixture's `expected.classification` + `expected.errorFamily` carry the same assertion; the substrate-and-run-context override surface is no longer needed because the substrate is declared in the fixture.

## 7. Substrate plurality

The substrate choice (`synthetic`, `fixture-replay`, `production`) is orthogonal to the probe. The same probe runs against multiple substrates; its expected-classification is an invariant of the probe, not a property of the substrate. A probe that expects `ambiguous-match` with DOM two same-role buttons produces that classification regardless of whether the DOM came from a synthesized React app or a captured OutSystems page.

This matters for graduation: the customer substrate must exercise every probe the synthetic substrate does (modulo probes that are substrate-synthetic-only). A probe that only ever runs against synthetic DOM has zero customer-signal and is quarantined from the graduation denominator.

## 8. The workshop's active role and its graduation

The workshop is active while:

1. Probe coverage < 100%, OR
2. `metric-hypothesis-confirmation-rate` < floor, OR
3. New verbs are landing and need new fixtures, OR
4. Customer evidence reveals a probe class the manifest hadn't considered.

When all four conditions relax — coverage saturates, confirmation rate stays above floor, verb surface stabilizes, customer evidence stops surfacing new probe classes — the workshop's active role is done. It degrades to a passive alarm: `coverage-drift-check`, `confirmation-rate-floor-guard`, `new-verb-fixture-missing-alert`. The workshop never shuts down; it goes quiet.

## 9. What Step 5 must validate

The probe IR spike (Step 5 per `v2-direction.md §6`) validates whether the design in §4 above can mechanically derive meaningful probes for three representative verbs. The spike's output is:

- **IR holds** — the three verbs' fixtures produce coverage rows that match hand-authored expectations. Step 6 ships against manifest-derived probes as the primary substrate; hand-authored `dogfood/scenarios/` is a non-goal.
- **IR holds with gaps** — some verbs (likely `test-compose` or `observe` with complex recovery ladders) need hand-authored probe schemas alongside the fixture set. Step 6 proceeds with hand-written gap schemas for the named verbs; the spike defines exactly which verbs and what their schemas look like.
- **IR does not hold** — the fixture grammar needs a shape change or the manifest needs to expose additional metadata. Step 5 blocks Step 6 until the shape question is answered.

The spike is cheap: three verbs, 3–5 fixtures each, one coverage report. Its output is a one-memo go/no-go that unblocks the next nine months of work.

## 10. What this memo does not commit

- **The exact fixture grammar.** §4's YAML is illustrative; Step 5 may adjust fields. The authoritative grammar lands alongside the spike's verb fixtures.
- **The substrate implementation.** Synthetic React app composition, DOM-snapshot replay, and customer-production routing are three separate implementation lanes. Each ships on its own hypothesis after Step 5.
- **The cohort-key algebra.** M5's probe-surface cohort key is defined in `v2-substrate.md §8a`; this memo takes it as given.
- **The dashboard surface.** Coverage rendering, cohort drill-down, and fixture-authoring affordances are dashboard work that lands after Step 5's spike confirms the IR is viable.

## 11. Why this is the right replacement for v1 dogfood

The old corpus was a static asset that had to be maintained by hand in parallel with the product. Every manifest change risked corpus drift; every new error family needed a corpus-author to catch up. The workshop's "health" was a proxy for "corpus freshness," not "product quality."

The new substrate inverts this: the probe substrate is derived from the product's own manifest plus tiny per-verb fixtures. The product's manifest IS the source-of-truth for what the workshop measures. Coverage gaps become product-visible (manifest-verb-without-fixture is a warning). The workshop cannot lag the product; it compiles from the product.

This is what "probes are derived, not authored" means in practice. The handful of YAML fixtures are the hand-authorship debt; everything else is mechanical.

## 12. Reading order for the agent picking this up

1. This memo end-to-end (~10 minutes).
2. `docs/v2-direction.md §5` (the probe IR concept, ~8 minutes) + `§6 Step 5` (the spike step, ~3 minutes).
3. `docs/v2-substrate.md §6a` (the spike protocol, ~5 minutes).
4. `docs/v2-readiness.md §4` (fixture grammar draft, ~5 minutes).
5. Skim `workshop/probe-derivation/transitional.ts` to see the transitional probe set that's already running.
6. Design the first spike fixture (probably against `facet-query` or `observe` — concrete enough to stress the grammar).

Total time-to-first-spike-fixture: under an hour.
