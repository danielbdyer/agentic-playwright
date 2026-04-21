# Probe IR Spike — Verdict 02

**Date:** 2026-04-21
**Event:** Step 5.5 scaffolding lands on branch claude/step-5-probe-ir-graduation. The `--adapter` CLI flag, the VerbClassifier port, the FixtureReplayProbeHarness, the default registry, the first classifier (test-compose), and the substrate parity laws are all live.

## The verdict, in one line

**Graduation metrics 1–3 all PASS** at the rungs they're designed to pin. Coverage (8/8 verbs) holds. Fixture economy holds. Reproducibility under fixture-replay holds for the registered classifier set. The transitional probe set retirement (memo §6.5) slips from Step 5.5 to Step 5.6 because classifier coverage is a separate axis from fixture coverage and the retirement is tied to the former, not the latter.

## Three graduation verdicts — current state

| Verdict | Rung | Status | Evidence |
|---|---|---|---|
| Coverage gate (≥ 80%) | fixture availability | **PASS** | 8/8 verbs have fixture YAMLs; gate PASS @ 100% under `tesseract probe-spike`. |
| Fixture economy (≤ 30 lines per fixture) | authorial | **PASS** | Per-fixture comprehensibility holds; no fixture is contorted. |
| Reproducibility (byte-identical receipts across runs) | fixture-replay | **PASS (scoped)** | Substrate parity laws P1/P2/P3 pin the invariant band for registered classifiers. Today: 1/8 verbs classified (test-compose); 2/21 probes confirm under fixture-replay. The structural scaffold for growing to N/8 is pinned; growth is per-commit classifier work. |

All three are live. The "scoped" on the reproducibility row names the axis that grows with the classifier registry: today it proves the shape-level contract for test-compose; tomorrow it proves that for every verb with a standalone Layer-injectable handler.

## The two axes of Step 5 coverage

Step 5's coverage verdict folds two axes that Step 5.5 unfolds:

- **Fixture coverage** — does every declared verb have a fixture YAML? Tracked by `SpikeVerdict.coverage.coveragePercentage`. Today: 8/8 = 100%.
- **Classifier coverage** — does every declared verb have a registered VerbClassifier that fixture-replay can consult? Tracked by `SpikeVerdict.coverage.probesCompletingAsExpected / totalProbes` under `--adapter fixture-replay`. Today: 2/21 ≈ 9.5%.

Fixture coverage is the gate; classifier coverage is the substrate ladder's rung-2 population. The spike's dual output (coverage + receipts-confirmed) is exactly what these two axes need.

## Scope 3 — what shipped

| Commit | Contents |
|---|---|
| `step-5.5a-adapter-flag` | `--adapter` flag in ParsedFlags + flagDescriptorTable; exhaustive `createProbeHarnessForAdapter` switch; CLI routes to dry-harness by default. |
| `step-5.5b-verb-classifier-port` | VerbClassifier port + registry; 4 laws pinning registry invariants. |
| `step-5.5c-fixture-replay-harness` | FixtureReplayProbeHarness with stratification-on-missing-classifier (ambiguous observation); 5 laws pinning F1–F5. |
| `step-5.5d-test-compose-classifier` | First classifier registered; test-compose.probe.yaml retargets to match manifest error families; 5 laws T1–T5. |
| `step-5.5e-substrate-parity-laws` | P1/P2/P3 substrate parity laws — invariant band between dry-harness and fixture-replay pinned. |

Plus scope-1 (`step-5.gap1-facet-mint-families`) closing Gap 1 from verdict-01 — the stale `not-visible` error family removed from facet-mint's manifest entry.

## Named gaps — resolution status

From verdict-01, three gaps were named:

### Gap 1: facet-mint's stale `not-visible` error family
**RESOLVED** at `step-5.gap1-facet-mint-families`. Removed from the declaration; manifest regenerated. No handler existed yet so there was no callsite blast radius.

### Gap 2: intent-fetch's `malformed-response` family needs fixture-replay to exercise
**PARTIALLY RESOLVED.** Fixture-replay's scaffold lands in scope 3; intent-fetch does not yet have a classifier because its handler is not wired at manifest-verb level. Scope 4 lands the fixture-spec side — a `malformed-response` probe entry with a `world-setup.inject-malformed-payload: true` hook that a future intent-fetch classifier will honor. The classifier itself waits for the handler wiring (item 17 in the Step 5 handoff queue).

### Gap 3: interact's `unclassified` family is un-triggerable by construction
**UNCHANGED.** This gap is not a missing fixture; it's the acknowledgment that `unclassified` is definitionally "what's left over." Growth in the unclassified rate is the signal; it surfaces through the classifier's error-family routing and through the metric tree's rung-distribution visitor. No new fixture or law lands here; the spike measures what needs measuring.

## New gap surfaced by scope 3d

**Gap 4 — test-compose's manifest does not declare `assertion-like`.** The shape-validation failure of test-compose's handler would most naturally route to `assertion-like`, but that family isn't in the verb's declared `errorFamilies`. Scope 3d routes shape failures to `unclassified` — the closest declared family. This is a manifest-surgery candidate with two resolution paths:

1. **Retarget the fixture** (done). The `missing-imports-fails-shape-validation` fixture now expects `unclassified`. Parity holds.
2. **Widen the manifest** (deferred). Adding `assertion-like` to test-compose's declared error families is a drift-check-non-additive change that needs a deliberate commit. It's the more semantically-accurate move but needs a handler-level change at the same time (the handler should throw an error that's classified as assertion-like, not a generic Error). Scheduled for a future scope — not blocking Step 5.5.

## Why transitional.ts retirement slips to Step 5.6

Per memo §6.5, the transitional probe set at `workshop/probe-derivation/transitional.ts` was to retire in the same commit that `FixtureReplayProbeHarness` landed. The handoff explicitly flagged this tension: "retiring now would regress M5."

The tension resolves cleanly once we name classifier coverage explicitly. The transitional set fuels M5 trajectory points for all probe-surface cohorts; retiring it before fixture-replay actually exercises those cohorts would leave M5 without data for 7 of 8 verbs.

**The commit boundary moves** from "retire when harness port lands" (Step 5.5) to "retire when classifier coverage ≥ M5 signal floor" (Step 5.6). A new scope will:

1. Register the remaining 7 verb classifiers as each verb's handler surfaces a standalone-callable shape.
2. When `receiptsConfirmed / totalProbes` under fixture-replay exceeds the M5 trajectory-point floor (`MIN_TRAJECTORY_POINTS = 3`), run `--adapter fixture-replay` 3 times to seed the post-transitional trajectory.
3. Delete `workshop/probe-derivation/transitional.ts` in the next commit.
4. Write `probe-spike-verdict-03.md` recording the retirement event.

This is the honest ratchet: the transitional set earns its keep while it's the only signal source, and graduates when the substrate-backed harness has proven itself on enough verbs.

## Next actionable tasks

1. **Scope 4** (this branch): land the `intent-fetch` malformed-response fixture with the `world-setup.inject-malformed-payload` hook. The classifier honors the hook when it lands.
2. **Scope 5** (follow-up): register classifiers for observe, interact, intent-fetch as each handler surface hardens. Each registration is a self-contained commit: classifier + laws + verdict bump.
3. **Scope 6** (Step 6 prep): the synthetic React app at `workshop/synthetic-app/` that playwright-live targets. This is the rung-3 substrate.
4. **Scope 7** (Step 10 prep): re-wire the C6 visitor's receiptKinds from `'intervention-token-impact'` to `'probe-receipt'`; start reading hypothesisId-tagged receipts from the fixture-replay output.

## Pointers

- Primary design memo: `docs/v2-probe-ir-spike.md`.
- Verdict 01: `workshop/observations/probe-spike-verdict-01.md` — the coverage-gate crossing.
- Spike protocol: `docs/v2-substrate.md §6a`.
- Substrate ladder + parity discipline: `docs/v2-probe-ir-spike.md §§8.3–8.6`.
- Transitional set retirement protocol: `docs/v2-readiness.md §5.3`.
- C6 reshape: `docs/v2-substrate.md §8a`.
