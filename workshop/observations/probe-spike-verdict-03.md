# Probe IR Spike — Verdict 03

**Date:** 2026-04-22
**Event:** Classifier coverage reaches 8/8 under the fixture-replay harness. Every declared verb in manifest v1 has a rung-2 classifier; every probe in the 22-probe coverage matrix confirms its expectation.

## The verdict, in one line

**Step 5.5 graduation condition is met.** All three graduation metrics from docs/v2-probe-ir-spike.md §7 are PASS at the full coverage ceiling — not scoped, not partial. The probe IR is authoritative for the manifest v1 seed set. Step 6 (customer ship under workshop supervision) can now proceed with the probe IR as its measurement substrate rather than the transitional set.

## Three graduation verdicts — final state

| Verdict | Status | Evidence |
|---|---|---|
| Coverage gate (≥ 80%) | **PASS @ 100%** | 8/8 verbs have fixture YAMLs; 22 probes synthesized. |
| Fixture economy (≤ 30 lines per fixture) | **PASS** | Per-fixture comprehensibility holds across all 22 fixtures. |
| Reproducibility (byte-identical receipts across runs) | **PASS (full)** | 8/8 classifiers registered; substrate parity laws P1/P2/P3 pin the invariant band for every probe. Running `tesseract probe-spike --adapter fixture-replay` produces 22/22 confirmations. |

The reproducibility verdict is no longer scoped. The registered classifier set equals the declared verb set. Every probe the spike synthesizes can be exercised at rung 2 with byte-identical receipts across runs on pinned `now`.

## Two axes, both maxed

From verdict-02, Step 5 unfolded two coverage axes:

| Axis | verdict-01 (Step 5) | verdict-02 (Step 5.5 scaffold) | verdict-03 (Step 5.5 graduation) |
|---|---|---|---|
| Fixture coverage | 8/8 = 100% | 8/8 = 100% | 8/8 = 100% |
| Classifier coverage | N/A | 1/8 = 12.5% | **8/8 = 100%** |
| Probe confirmation (fixture-replay) | N/A | 2/22 ≈ 9% | **22/22 = 100%** |

Both axes are saturated against the current manifest. The next source of additional signal is manifest growth (new verbs) and/or substrate-ladder climb (rung 3+).

## The eight classifiers

Each classifier pins the rung-2 substrate semantics for its verb. Shape-only classifiers validate input; hook-driven classifiers additionally read `probe.worldSetup` to route declared failure families.

| Verb | Style | Hooks honored |
|---|---|---|
| `facet-query` | shape-only | (none — manifest error-family is unclassified only) |
| `locator-health-track` | shape-only | (none — success/failure outcome is the input, not a failure mode) |
| `test-compose` | shape-only (handler-aligned) | (none — see Gap 4 in verdict-02) |
| `facet-mint` | shape + hook | `id-collision: true` → assertion-like |
| `facet-enrich` | shape + hook | `facet-missing: true` → assertion-like |
| `observe` | shape + hook | `hide-target: true` → not-visible; `timeout: true` → timeout |
| `interact` | shape + hook | `hide-target` → not-visible; `disable-target` → not-enabled; `detach-target-after-ms` → timeout; `non-input-target` → assertion-like |
| `intent-fetch` | shape + hook | `simulate-rate-limit` → rate-limited; `simulate-transport-failure` → unavailable; `inject-malformed-payload` → malformed-response |

The hook dictionary is not a feature; it's a substrate-ladder approximation. Rung 3+ (playwright-live, production) replaces each hook with its real upstream condition: hidden DOM element, disabled attribute, element detach timing, role/tag mismatch, HTTP 429, connection refused, schema-break payload. The shape of the classifier — a VerbClassifier that returns an observed ProbeOutcome — stays the same across rungs; only the mechanism that reaches the (classification, errorFamily) tuple changes.

## What's left of the three original gaps

From verdict-01, three gaps were named; from verdict-02, one new gap (Gap 4) surfaced. Full state at verdict-03:

| Gap | Original in | Status at verdict-03 |
|---|---|---|
| 1: facet-mint stale `not-visible` family | v-01 | **RESOLVED** at scope 1. |
| 2: intent-fetch `malformed-response` needs fixture-replay | v-01 | **RESOLVED**. Fixture added in scope 4; classifier in slice A5. 22/22 confirms. |
| 3: interact `unclassified` un-triggerable by construction | v-01 | **UNCHANGED by design.** Growth rate is the signal; classifier routes shape-invalid inputs there. |
| 4: test-compose manifest missing `assertion-like` | v-02 | **DEFERRED.** Scope C (next slice) widens the manifest + reverts the fixture retarget. Non-additive manifest change; not blocking Step 5.5. |

## What this enables

With 8/8 classifier coverage, several downstream workstreams unblock:

1. **Transitional.ts retirement (Slice B).** The reason to delay retirement was M5 trajectory continuity — `memory-worthiness-ratio` needs `MIN_TRAJECTORY_POINTS = 3` per cohort, and the transitional set was the only source for 7/8 verbs. With classifiers registered, fixture-replay output becomes the post-transitional M5 feed. Retirement is the next commit on this branch.

2. **C6 re-wire (Step 10 prep).** `metric-hypothesis-confirmation-rate` reads probe receipts with `hypothesisId` non-null. The probe receipts exist now; the hypothesis-tagging path is the remaining wire. Post-verdict-03, the scaffolding is in place; the conditional logic awaits Step 10's proposal-lifecycle changes.

3. **Playwright-live harness (Step 6).** The classifier port doesn't change between rung 2 and rung 3 — only the Layer composition swaps. Scope 6's synthetic React app now has a concrete target: render the screens every fixture references, let fixture-replay's classifiers climb to rung 3.

4. **Customer-incident backfill (memo §8.5).** Each customer-reported world-shape becomes a new probe; the classifier dispatches to the declared family via the hook dictionary. The ratchet can start turning as soon as the first customer ships.

## Slice A commit sequence

| Commit | Classifiers registered | Cumulative | Confirm rate |
|---|---|---|---|
| `step-5.5a1` | facet-query, locator-health-track | 3/8 | 7/22 |
| `step-5.5a2` | facet-mint, facet-enrich | 5/8 | 11/22 |
| `step-5.5a3` | observe | 6/8 | 13/22 |
| `step-5.5a4` | interact | 7/8 | 18/22 |
| `step-5.5a5` | intent-fetch | **8/8** | **22/22** |

Each commit carried its classifier file, registry update, fixture hook additions (where needed), and laws. The parity P2 assertion tightened at each step — prevents silent drift where a classifier ships without the parity check covering it.

## Next actionable tasks

1. **Slice B — transitional.ts retirement.** Delete `workshop/probe-derivation/transitional.ts`; verify M5 reads from probe-receipt trajectory. Memo §6.5 retirement protocol. Verdict-04 records the event.
2. **Slice C — Gap 4.** Widen test-compose's manifest error families to include `assertion-like`; revert the fixture retarget from verdict-02.
3. **Scope 6 — synthetic React app.** Rung-3 substrate. A minimal `workshop/synthetic-app/` with the screens fixtures reference.
4. **Scope 7 — C6 visitor re-wire.** Read `ProbeReceipt` with non-null `hypothesisId` instead of the v1 `InterventionTokenImpact` ledger.

## Pointers

- Memo: `docs/v2-probe-ir-spike.md`.
- Verdict 01 (coverage gate): `workshop/observations/probe-spike-verdict-01.md`.
- Verdict 02 (scaffold + classifier 1/8): `workshop/observations/probe-spike-verdict-02.md`.
- Substrate ladder + invariant band: memo §§8.3–8.6.
- C6 reshape: `docs/v2-substrate.md §8a`.
