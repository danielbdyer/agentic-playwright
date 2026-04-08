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
  `docs/archive/research/temporal-epistemic-specification-addendum.md`.
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
over `MemoryMaturity(τ)` divided by the per-iteration scorecard
maintenance overhead.

| Window  | Floor | Direction      |
|---------|-------|----------------|
| 2026-Q2 | 1.0   | rising         |
| 2026-Q3 | 1.2   | monotonic up   |
| 2026-Q4 | 1.5   | monotonic up   |

**Why it matters**: M5 is the question the entire substrate exists to
answer — *is remembering worth more than forgetting?*  If M5 is flat or
descending across a quarter, the architecture is not compounding even
if it is sophisticated. Compounding is the test; everything else is
the ground truth.

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

| Window  | Floor | Direction      |
|---------|-------|----------------|
| 2026-Q2 | 50%   | rising         |
| 2026-Q3 | 60%   | monotonic up   |
| 2026-Q4 | 75%   | monotonic up   |

**Why it matters**: C6 is the participatory-agency claim. Without it,
the agent layer is ornamental. *Did accepting this augmentation
actually move the needle in the region it attached to?* If the answer
is "no, less than half the time," accepted addenda are not earning
their seat at the table.

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
