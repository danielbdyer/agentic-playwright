# Probe IR Spike — Verdict 04

**Date:** 2026-04-22
**Event:** `workshop/probe-derivation/transitional.ts` retired. The manifest-derived probe IR plus fixture-replay harness are now the workshop's sole measurement substrate.

## The verdict, in one line

**Transitional set retired cleanly.** The module was orphaned scaffolding — no callers imported its exports. The retirement is a deletion, a two-doc-comment realignment, and a verdict record. Per `docs/v2-readiness.md §5.3`'s retirement protocol, this was the last obligation the Step-1 cohort-reset era carried forward.

## What retired and what didn't

| Retired | Status |
|---|---|
| `workshop/probe-derivation/transitional.ts` | **DELETED** (was 109 lines, exporting `TRANSITIONAL_PROBES` + `TRANSITIONAL_COHORTS`, neither imported anywhere). |
| Doc reference in `workshop/metrics/probe-surface-cohort.ts` | Updated to name fixture-replay harness as the current M5 feed; names this verdict as the retirement record. |
| Doc reference in `product/tests/fluency/canonical-tasks.ts` | Updated to name the manifest-derived probe IR as the behavioral-fluency source. |

| NOT retired | Reason |
|---|---|
| `probe-surface-cohort.ts` module | Still the canonical cohort-identity surface. Every ProbeReceipt carries its cohort triple in `payload.cohort`; M5's trajectory groups receipts by the key `probeSurfaceCohortKey` derives. |
| `cohortKeyEra: 'probe-surface'` on the scorecard | Step-1 cohort-reset marker stays. The era didn't change; only the signal source did. |

## Why the retirement was mechanically tiny

When scope 3c landed the FixtureReplayProbeHarness, the design anticipated a migration: classifier coverage would grow verb-by-verb, and when coverage crossed the M5 trajectory-point floor, transitional.ts would retire in the next commit.

What made retirement trivial today: **the transitional set had zero live callers**. Grep across `workshop/`, `product/`, `tests/`, and `bin/` for `TRANSITIONAL_PROBES` or `TRANSITIONAL_COHORTS` returned only the declaration site itself. The workshop's active measurement path was already the probe IR from the moment scope 3c landed — the transitional module was a design-time artifact waiting to be removed, not a live dependency.

This is the honest outcome of the "grow classifier coverage, then retire" sequencing: once the substrate was capable, the retirement was deletion plus doc cleanup. No caller migration. No code change to M5. No scorecard baseline reset. The ratchet from Step 1 (`cohortKeyEra: 'probe-surface'`) held all the way through.

## M5 trajectory continuity — post-retirement

Pre-retirement M5 trajectory source: none live — the transitional module declared probes but nothing ran them.

Post-retirement M5 trajectory source: ProbeReceipts emitted by the fixture-replay harness. Every receipt carries `payload.cohort: ProbeSurfaceCohort` (verb × facetKind × errorFamily); M5 groups receipts by the canonical key; `MIN_TRAJECTORY_POINTS = 3` gates when M5 starts returning non-zero values.

**Required posture for M5 to begin returning non-zero values**: three consecutive `tesseract probe-spike --adapter fixture-replay` runs producing 22 receipts each. With 22 probes × 3 runs = 66 receipts landed, every cohort (there are as many cohorts as there are distinct `(verb, facetKind, errorFamily)` triples across the probes) has ≥3 trajectory points, and M5 becomes live.

Today's concrete cohort count: every probe receipt has a distinct `(verb, facetKind, errorFamily)` triple or duplicates one. Running the spike three times would seed the trajectory. That is not the scope of this verdict — it is a separate operational gesture the workshop executes when it wants M5 non-zero.

## Three historical markers the retirement preserves

1. The `cohortKeyEra: 'probe-surface'` marker on `tests/fixtures/scorecards/baseline.json` stays. It marks the Step 1 scenario-ID → probe-surface cohort-key change; the era did not change at Step 5.5.
2. `probe-spike-verdict-01.md` and `-02.md` and `-03.md` remain as the unambiguous history of the spike's graduation sequence. verdict-04 joins them; verdict-05 awaits the next graduation event.
3. `docs/v2-readiness.md §5` (the transitional probe set specification) and `§5.3` (retirement protocol) are load-bearing historical references — they name what retired and why. The retirement doesn't invalidate them; it satisfies them.

## What comes next on this branch

1. **Slice C — Gap 4 resolution.** Widen test-compose's manifest error families to include `assertion-like`; revert the fixture retarget from verdict-02. Manifest is non-additively changed; the drift-check catches it and emit-manifest regenerates.
2. **Scope 6 — synthetic React app.** Rung-3 substrate. Unblocked by 8/8 classifier coverage — every classifier now has a rung-2 surface fixture-replay tests against; playwright-live is the next rung.
3. **Scope 7 — C6 re-wire.** `metric-hypothesis-confirmation-rate` reads probe-receipts with non-null `hypothesisId`. The receipts exist; the hypothesis-tagging conditional is the remaining wire.

## Pointers

- Memo: `docs/v2-probe-ir-spike.md`.
- Readiness §5 (transitional specification): `docs/v2-readiness.md`.
- Prior verdicts: `workshop/observations/probe-spike-verdict-{01,02,03}.md`.
- M5 visitor audit: `docs/v2-substrate.md §8a`.
