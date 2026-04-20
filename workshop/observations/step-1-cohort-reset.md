# Step 1 cohort-reset observation memo

**Date:** 2026-04-19
**Event:** M5 cohort re-key from scenario-ID to probe-surface triple; scorecard history reset; epoch marker added.

## What changed

The M5 visitor (`memory-worthiness-ratio`) interprets its `cohortId` field as the canonical string of a probe-surface triple `(verb, facetKind, errorFamily)` instead of a scenario-ID-derived string. The visitor itself, the trajectory algebra (`memory-maturity-trajectory.ts`), and the `isComparableAt` predicate are unchanged — only the semantics of the cohort-identity string shift.

The scorecard fixture at `tests/fixtures/scorecards/baseline.json` was written under the scenario-ID era. Those four history entries cannot be losslessly re-mapped to the probe-surface era (they carry no verb / facetKind / errorFamily fields), so the history array was cleared and the scorecard gained a `cohortKeyEra: 'probe-surface'` epoch marker.

## Why this is honest

The dogfood scenarios that produced the pre-reset history retire in the same commit. The old cohort space has no post-Step-1 continuity — nothing written before this date measures anything future runs can extend. A visible reset signals the measurement-epoch boundary to any reader who later asks "where did the history go?"

## What to expect next

- The Step 1 transitional probe set at `workshop/probe-derivation/transitional.ts` declares seven probes across five probe-surface cohorts.
- The first run of the transitional set produces one trajectory point per cohort. `M5` gates on `MIN_TRAJECTORY_POINTS = 3`, so the first run returns `M5 = 0`. That is correct, not a regression.
- After three or more runs of the transitional set (accumulated across Phase 1 and the Phase 2 construction window), M5 begins returning non-zero values. End-to-end confirmation of the re-key lands at that point.
- At Step 5 the transitional probe set retires in favor of the manifest-derived probe IR. `cohortKeyEra` stays `'probe-surface'`; no further reset is required.

## Pointers

- Re-key plan: `docs/v2-readiness.md §10`.
- Transitional probe set: `docs/v2-readiness.md §5`.
- M5 visitor audit: `docs/v2-substrate.md §8a`.
