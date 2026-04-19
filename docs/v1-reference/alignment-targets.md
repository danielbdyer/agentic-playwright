# Alignment Targets

> Status: Active — concrete numeric goals for the temporal-epistemic
> realization. Updated when the wall-mounted scoreboard moves.

This is the wall. Two scoreboard metrics get top billing; everything
else is diagnostic.

## Why this wall

The two scoreboard metrics (M5, C6) operationalize the two-engine
framing from [`docs/canon-and-derivation.md`](./canon-and-derivation.md)
§ 9:

- **M5 (Memory Worthiness Ratio)** measures the **deterministic
  discovery engine**'s payoff: is remembering worth more than
  forgetting across cohort trajectories? It is the quantitative
  form of K5 (marginal discovery decay) from
  `docs/temporal-epistemic-kernel.md`.
  A system that compounds has an M5 slope above 1.0 and rising; a
  system that merely accumulates artifacts without earning
  compounding leverage has flat or descending M5 regardless of how
  sophisticated its runtime looks.
- **C6 (Intervention-Adjusted Economics)** measures the **agentic
  intervention engine**'s payoff: when an agent writes an agentic
  override, does the override actually reduce ambiguity /
  suspension / rung-score in its attachment region within N runs?
  If fewer than half of accepted augmentations do so, the
  intervention layer is ornamental — which is the exact regression
  mode the scoreboard is built to prevent.

Together, M5 and C6 are the operationalization of the ROI target
in `docs/canon-and-derivation.md` § 14.1: a token-cost trend-line
that plateaus to a linear floor as the canonical artifact store
matures. "Token cost per test case" is not itself a first-class
metric — it is the emergent consequence of M5 and C6 both holding
simultaneously. The temporal-epistemic addendum's
`BootstrapCostSeeded(task,τ)` and `BootstrapCostBlank(task,τ)`
functions are the formal proxies: when the ratio
`BootstrapCostBlank / BootstrapCostSeeded` grows monotonically with
cohort maturity, the plateau has arrived. M5's cohort-trajectory
slope captures this relationship.

Diagnostic metrics (further below) remain useful for situational
awareness but cannot be used as acceptance gates. A change that
improves `effectiveHitRate` without moving M5 or C6 is not, by
itself, compounding.

## Top-of-wall scoreboard

### M5 — Memory Worthiness Ratio

**Definition**: `RememberingBenefit(τ) / MemoryMaintenanceCost(τ)`,
operationalized as the cohort-trajectory slope of `effectiveHitRate`
over `MemoryMaturity(τ)` divided by the per-iteration
`MemoryMaintenanceCost`.

**Operational definitions (locked 2026-04-10).**

- **`RememberingBenefit(τ)`**: the effective hit-rate the cohort
  achieved at time τ, measured with the lookup chain walking all
  six slots (warm default). "Remembering" here means "reference
  canon and real canonical artifacts were available to the
  resolver"; when both are denied via `--mode cold
  --no-reference-canon --no-overrides`, what remains is the
  baseline for "forgetting."
- **`MemoryMaintenanceCost(τ)`**: wall-clock per iteration *plus*
  the **agentic-override maintenance work** — a small positive
  weight per override file that currently lives under
  `.canonical-artifacts/agentic/`, reflecting the cost of
  maintaining an override across drift cycles. Reference canon
  entries do NOT count toward maintenance cost because they are
  slated for demotion, not active maintenance. Pure
  deterministic observations also do not count — they are
  re-earned by the discovery engine every cold pass and carry no
  maintenance tax.
- **"Cohort-comparable" means same scenario IDs.** The trajectory
  buffer compares hit-rate points only across iterations where
  the underlying scenario set is the same. Reseeding the
  reference cohort (20000-series) or changing the cohort
  definition resets the trajectory buffer for affected scenarios.
  The 10000-series golden scenarios are always comparable to
  themselves across runs.

| Window  | Floor | Direction      |
|---------|-------|----------------|
| 2026-Q2 | 1.0   | rising         |
| 2026-Q3 | 1.2   | monotonic up   |
| 2026-Q4 | 1.5   | monotonic up   |

**Why it matters**: M5 is the question the entire substrate exists to
answer — *is remembering worth more than forgetting?*  If M5 is flat
or descending across a quarter, the architecture is not compounding
even if it is sophisticated. Compounding is the test; everything else
is the ground truth.

**Design bias.** The operational definition favors a system that
**runs as deterministically as possible and defers to the agent
only when forced.** An agentic override earns its maintenance tax
only if it carries its weight in measured impact (C6 below); a
deterministic observation is "free" because the discovery engine
can regenerate it from scratch on any cold pass. This bias is
intentional: the long-term ROI depends on the canonical-artifact
store being dominated by deterministic observations, with agentic
overrides reserved for the genuinely unobservable.

**Implementation dependency**: M5 is a *cohort-trajectory slope*,
not a point-in-time value. It cannot be computed from a single
fitness report. It requires:

1. A branded `MemoryMaturity` scalar — already present at
   `lib/domain/fitness/memory-maturity.ts:27-93`.
2. A `MemoryMaturityTrajectory` value object accumulating
   `(cohortId, maturity, effectiveHitRate, computedAt)` points
   across comparable cohorts — **not yet implemented**. Lives in
   `lib/domain/fitness/memory-maturity-trajectory.ts` per Phase B
   of `docs/cold-start-convergence-plan.md`.
3. At least three cohort-comparable history points in the
   improvement ledger before the slope can be computed honestly
   (per the floor-tightening rule in § How floors get tightened
   below).

Until the trajectory primitive lands and has ≥ 3 comparable
points, M5's theorem-group status remains `proxy` (the current
state in the per-theorem-group floors table below). Graduation to
`direct` happens only when the trajectory is populated and the
slope is computable from real history, not heuristics.

### C6 — Intervention-Adjusted Economics

**Definition**: % of accepted augmentations that reduce ambiguity,
suspension, or rung-score in their attachment region within N runs.
Computed by the H2 token-impact tracker.

**Operational definitions (locked 2026-04-10).**

- **"Accepted augmentations"** means entries living under
  `{suiteRoot}/.canonical-artifacts/agentic/` that carry a real
  `InterventionReceipt` reference. Reference-canon entries
  (§ 3.2a in `canon-and-derivation.md`) are EXCLUDED from C6's
  denominator — they never flowed through an auto-approval gate,
  so counting them would measure historical hand-authoring, not
  the participatory-agency loop.
- **"N runs" = 1 loop iteration.** One iteration of the full
  improvement loop (harvest → scenario run → agentic intervention
  → fitness scoring → demotion sweep) counts as N=1. The
  before/after impact scheduler snapshots the attachment region's
  rung distribution pre-activation and re-measures it after the
  next full iteration. An override that moved the needle within
  one iteration counts as a C6 numerator hit; an override that
  required multiple iterations to show effect does not (it is
  instead a candidate for demotion at the end of the window).
- **"Attachment region"** is specified on the intervention
  receipt's `handoff.attachmentRegion` field (already landed per
  the recent Phase C item 3 commit). The impact scheduler reads
  the region spec and knows which slice of the rung distribution
  to snapshot.

| Window  | Floor | Direction      |
|---------|-------|----------------|
| 2026-Q2 | 50%   | rising         |
| 2026-Q3 | 60%   | monotonic up   |
| 2026-Q4 | 75%   | monotonic up   |

**Why it matters**: C6 is the participatory-agency claim. Without
it, the agent layer is ornamental. *Did accepting this augmentation
actually move the needle in the region it attached to within one
loop iteration?* If the answer is "no, less than half the time,"
accepted addenda are not earning their seat at the table.

**Graduation criterion from `proxy` to `direct`.** C6 moves from
`proxy` to `direct` when all of the following hold:
1. The reference-canon slot is wired (canon-and-derivation § 6) so
   that C6's denominator can distinguish real agentic overrides
   from pre-gate reference canon.
2. The before/after impact scheduler at
   `lib/application/intervention/impact-scheduler.ts` populates
   `InterventionTokenImpact.rungImprovement` from real next-
   iteration comparisons.
3. At least 10 accepted agentic overrides have been observed
   through one full loop iteration each.

Until all three hold, C6's theorem-group status is `proxy` per
the per-theorem-group floors table below.

## Per-theorem-group floors

Theorem groups graduate from `missing` → `proxy` → `direct` as the
substrate matures. Floors are minimums for "system is honest about its
own coverage."

| Group | 2026-Q2 floor | 2026-Q3 floor | Notes |
|-------|---------------|---------------|-------|
| K     | proxy         | direct        | Requires both posture-separability AND fingerprint-stability `direct` |
| L     | proxy         | proxy         | Direct measurement requires per-target observability instrumentation |
| S     | proxy         | proxy         | Same as L |
| D     | proxy         | direct        | Requires the dynamic-topology obligation to be measurement-direct |
| V     | proxy         | proxy         | Variance factorization needs role/data/phase variance harnesses |
| R     | proxy         | proxy         | Recoverability needs replay-cost vs rediscover-cost data |
| A     | proxy         | direct        | Requires actor-chain-coherence obligation backed by handoff schema |
| H     | direct        | direct        | Already direct via MCP handoff-integrity reducer |
| C     | proxy         | direct        | Requires ≥3 cohort-comparable history points for the trajectory builder |
| M     | proxy         | direct        | Composite — graduates when M5 ratio target is met |

## Diagnostic scoreboard

These metrics are NOT acceptance gates but are surfaced on every
scorecard for situational awareness.

| Metric | Healthy | Watch | Critical |
|--------|---------|-------|----------|
| `effectiveHitRate` | ≥ 0.6 | 0.4–0.6 | < 0.4 |
| `knowledgeHitRate` (informational) | ≥ 0.5 | 0.3–0.5 | < 0.3 |
| `ambiguityRate` | ≤ 0.2 | 0.2–0.4 | > 0.4 |
| `suspensionRate` | ≤ 0.1 | 0.1–0.3 | > 0.3 |
| `degradedLocatorRate` | ≤ 0.1 | 0.1–0.3 | > 0.3 |
| `proposalYield` | ≥ 0.8 | 0.6–0.8 | < 0.6 |
| `recoverySuccessRate` | ≥ 0.9 | 0.7–0.9 | < 0.7 |

`effectiveHitRate` is the **primary acceptance gate**.
`knowledgeHitRate` is preserved as a live informational metric for
convergence views, historical comparison, and diagnostics; it is NOT
the gate.

## Acceptance gate semantics

A scorecard improvement is **accepted** iff:

1. The candidate is not Pareto-dominated by any existing frontier
   entry, AND
2. No target metric regresses below its floor for the current window.

Rule 2 is the Phase 3 veto: improvement-by-other-metrics cannot
overshadow regression-against-target. The floors above are the
mechanical realization of that rule.

## How floors get tightened

Floors move when ALL of the following are true:

1. The metric has been at or above the proposed new floor for at least
   one week of dogfood runs.
2. The cohort-trajectory direction is `ascending` or `flat-positive`.
3. There is at least one cohort-comparable history point that anchors
   the measurement (otherwise the floor is heuristic-proxy and cannot
   be enforced).

This is the doctrinal version of "show me the math." Every floor
tightening should be auditable through the scorecard history.

## What gets thrown away

A floor is **dropped** (not tightened) if:

1. The underlying obligation graduates from heuristic-proxy to direct
   AND the direct measurement reveals the floor was an artifact of the
   proxy formula, not a real signal.
2. The substrate has changed in a way that makes the metric
   structurally noisy (e.g. role-affordance refactor changed what
   "approved equivalent rate" means).

Document droppings in this file's git history with a clear `dropped:`
prefix in the commit message.
