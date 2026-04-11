# Synthetic Feature Completion Plan

> Status: Active — the executable sequence for driving the synthetic
> workload to feature completion before any real enterprise target
> lands. Subordinate to [`docs/canon-and-derivation.md`](./canon-and-derivation.md)
> (doctrine), [`docs/alignment-targets.md`](./alignment-targets.md)
> (scoreboard), and [`docs/cold-start-convergence-plan.md`](./cold-start-convergence-plan.md)
> (the six-phase spine). This plan is the concrete commit sequence
> that closes the gap between "the four-axis envelope exists in code"
> and "M5 and C6 are both `direct`, above their 2026-Q2 floors,
> measured against a single honest scorecard."
>
> **Origin:** the 2026-04-10 reference-canon reframe (commit
> `ee9d62b`) plus the 4-axis envelope framing from the
> [envelope-axis refactor plan](./envelope-axis-refactor-plan.md)
> revealed that "feature completion" is not 12 parallel gap-closures
> — it is **one Source-axis extension** (adding `reference-canon`
> to `PhaseOutputSource`) followed by **four scoreboard closures**
> that ride on top of the four axis lifts the refactor plan already
> landed. Five commits total, in dependency order.

## TL;DR

The 4-axis upper ontology is in place. The structural substrate is
ready. What remains is five commits that close the gap between
"the types enforce correctness" and "the scoreboard reads honest
numbers from the synthetic loop." When those five commits land,
the synthetic dogfood suite is feature complete and the system is
ready to point at a real enterprise target.

| # | Commit | Axis anchor | Closes |
|---|---|---|---|
| 1 | Source axis extension: `reference-canon` slot | Source | The doctrinal reframe from commit `ee9d62b` at the code level — adds the 6th `PhaseOutputSource` variant, extends the lookup chain precedence to six slots, tags catalog loader output by source, adds `--no-reference-canon` mode. |
| 2 | C6 direct: impact scheduler closure | Stage + Fingerprint | Populates `InterventionTokenImpact.rungImprovement` from real before/after comparisons per loop iteration; C6 visitor graduates from `proxy` to `direct`. |
| 3 | M5 direct: trajectory accumulation | Stage | Per-cohort `MemoryMaturityTrajectory` history points accumulate in the improvement ledger; M5 visitor graduates from `proxy` to `direct` once ≥3 comparable points exist. |
| 4 | Promotion gates with confidence intervals | Source + Verdict | Beta-posterior CIs per atom class replace scalar quality thresholds; per-class `PromotionConfidencePolicy` registry; confidence-accumulation monoid laws. |
| 5 | Demotion sweep for reference canon | Source + Verdict | Automatic demotion proposals when real agentic overrides or deterministic observations supplant reference canon entries; reference-canon-hit trend report in the score command. |

Each commit's acceptance criterion is a metric movement or a new
law test. The plan is executable against the existing synthetic
workload (the 20000-series reference cohort per
[`docs/scenario-partition.md`](./scenario-partition.md)); no real
enterprise target is needed until after commit 5 lands and the
scoreboard passes its 2026-Q2 floors.

## Prerequisites (already landed)

This plan assumes the four axis lifts from
[`docs/envelope-axis-refactor-plan.md`](./envelope-axis-refactor-plan.md)
Phase 0 have landed. A brief status check:

- **Stage phantom** (`WorkflowMetadata<S>`): landed. 8 concrete envelope
  types carry narrow stage literals. The runtime assertion at
  `validate-step-results.ts` is compile-time. Per Phase 0a.
- **Source phantom** (`Atom<C, T, Src>`, `Composition<S, T, Src>`,
  `Projection<S, Src>`): landed. Every canon artifact declares its
  source slot explicitly; no default parameter. Per Phase 0b.
  **Note:** the `PhaseOutputSource` union currently has 5 variants;
  commit 1 below extends it to 6 to match the reference-canon
  reframe's doctrinal 6-slot lookup chain.
- **Fingerprint<Tag>**: landed. Closed tag registry, tag-required
  helpers, all call sites migrated. Per Phase 0c.
- **Verdict lift**: landed. Governance consumption exclusively through
  typed API (`isApproved`, `foldGovernance`, `runGateChain`); an
  architecture law test enforces zero ad-hoc string comparisons.
  Per Phase 0d.

Because the four lifts are done, every commit in this plan rides on
top of compile-time invariants for Stage, Source, Fingerprint, and
Verdict. The structural substrate carries the weight; the commits
below are behavioral closures.

## What's NOT in this plan (explicit deferrals)

- **Phase E (runtime-family recognition + OutSystems specialization).**
  This is the structural bridge to real enterprise targets. It
  requires the discovery engine to identify runtime families from
  DOM signature bundles, which is its own workstream and should not
  be attempted until the synthetic scoreboard is honest.
- **Phase F (Tier 3 projection authoring).** Role visibility,
  wizard state, posture availability, and feature-flag projections
  are the structural bridge to role-aware enterprise applications.
  The qualifier-aware lookup seam is wired from day one per
  `canon-and-derivation.md` § 3.8, but the discovery and
  authoring of projections is deferred until a real target has
  roles to observe.
- **Lane axis as a phantom type.** The six public lanes
  (`intent | knowledge | control | resolution | execution |
  governance`) remain a runtime taxonomy. After the five commits
  in this plan land, Lane may be over-determined by the
  `(Stage, Source, Fingerprint, Verdict)` combination — in which
  case lifting Lane to a phantom adds nothing. Defer until we
  find a concrete over-determination failure. See
  `VISION.md` § "The four-axis envelope" for the rationale.
- **Loops (A/B/C) as a Kleisli composition.** Loop A's output is
  Loop B's input is Loop C's input at the type level, which is
  `>>=` in Kleisli form. Lifting this to a typed composition is
  a structural improvement that requires the scoreboard to be
  honest first (otherwise you're typing noise). Defer until after
  commit 5 lands.
- **Any work against a real enterprise target.** Per the user's
  direction (2026-04-11), "it wouldn't be functional in the right
  ways if we played it against a production app yet." The synthetic
  loop is the laboratory; the real target is the field. This plan
  stays in the lab.

---

## Commit 1 — Source axis extension: add `reference-canon`

**Goal.** Close the gap between the 2026-04-10 reference-canon
reframe (which updated doctrine in commit `ee9d62b`) and the code.
Today `lib/domain/pipeline/source.ts` declares:

```typescript
export type PhaseOutputSource =
  | 'operator-override'
  | 'agentic-override'
  | 'deterministic-observation'
  | 'live-derivation'
  | 'cold-derivation';
```

Five variants. The doctrine now describes six, with
`reference-canon` as the transitional slot 4 between
`deterministic-observation` and `live-derivation`. This commit
extends the union to match, wires the catalog loader to tag the
pre-gate dogfood YAMLs as `'reference-canon'`, and adds the
`--no-reference-canon` mode flag for measuring migration debt.

**Axis anchor.** Source. Phase 0b of the envelope refactor
phantom-typed `Atom<C, T, Src>` already; this commit adds a new
valid value for `Src` without changing the axis mechanics.

**Files touched.**

| File | Change |
|---|---|
| `lib/domain/pipeline/source.ts` | Add `'reference-canon'` to the `PhaseOutputSource` union; update `SOURCE_PRECEDENCE` constant to 6 entries in order; update `compareSourcePrecedence`; extend `foldPhaseOutputSource` exhaustively (TypeScript compiler will force this at every call site). Update the docblock to describe the 6-slot chain per `canon-and-derivation.md` § 6. |
| `lib/domain/pipeline/lookup-chain.ts` | Extend the `LookupChain` interface to walk six slots in warm mode; add `--no-reference-canon` as a mode flag that skips slot 4; update `LookupResult.winningSource` to include the new variant. |
| `lib/application/catalog/loaders/**` | The loaders that walk `{suiteRoot}/knowledge/**`, `{suiteRoot}/benchmarks/**`, and the non-pure-intent portions of `{suiteRoot}/controls/**` tag their loaded envelopes with `source: 'reference-canon'`. The loader that walks `{suiteRoot}/.canonical-artifacts/agentic/**` (empty today, greenfield) continues to tag as `'agentic-override'`; the `deterministic/` loader continues to tag as `'deterministic-observation'`. |
| `lib/application/cli/commands/score.ts` (or equivalent) | Emit a new "reference-canon hit fraction" bucket in the rung distribution report alongside the existing resolution rung breakdown. |
| `tests/pipeline/source-phase-output.laws.spec.ts` (new or extended) | Exhaustive fold test over all 6 variants; precedence ordering law (operator-override > agentic-override > deterministic-observation > reference-canon > live-derivation > cold-derivation). |
| `tests/pipeline/lookup-chain.laws.spec.ts` (new or extended) | Six-slot ordering; `--no-reference-canon` mode skip; catalog loader source-tagging fidelity. |

**Acceptance criteria.**

1. `npm run typecheck` passes. Every `foldPhaseOutputSource` call
   site handles the new variant (the compiler enforces this; there
   is no way to forget).
2. `npm run build` stays green.
3. The new law tests pass.
4. A warm run against the synthetic workload produces a score
   report that includes a "reference-canon hit fraction" bucket;
   the number is honest (not zero — the dogfood YAMLs ARE reference
   canon and warm runs DO hit them).
5. The same warm run under `--no-reference-canon` produces a
   lower overall hit rate AND a zero reference-canon hit fraction.
   The delta between the two runs is the measurable migration debt.

**Expected metric movement.**

- Pipeline-efficacy L4 tree: no numerical change. Warm runs resolve
  the same content they resolved before; they're just *honestly
  labeled* as reference-canon hits instead of being lumped in with
  other sources.
- Discovery-fitness tree: no change yet (that's commit 3).
- M5: stays `proxy` (commit 3 graduates it).
- C6: stays `proxy` (commit 2 graduates it). BUT the commit 1
  substrate is a precondition for C6 because C6's denominator has
  to distinguish real agentic overrides from reference canon, and
  without the new Source variant, it can't.
- **The new measurement.** A "reference canon hit fraction" number
  that will become the migration-debt trend signal for the
  remaining four commits and all post-plan work.

**Law-test skeleton.**

```typescript
// tests/pipeline/source-phase-output.laws.spec.ts
test('SOURCE_PRECEDENCE has six entries in the documented order', () => {
  expect(SOURCE_PRECEDENCE).toEqual([
    'operator-override',
    'agentic-override',
    'deterministic-observation',
    'reference-canon',
    'live-derivation',
    'cold-derivation',
  ]);
});

test('foldPhaseOutputSource handles every variant', () => {
  // Exhaustive fold — TypeScript enforces this at compile time,
  // but this test provides a runtime witness for coverage.
  for (const source of SOURCE_PRECEDENCE) {
    const result = foldPhaseOutputSource(source, {
      operatorOverride: () => 1,
      agenticOverride: () => 2,
      deterministicObservation: () => 3,
      referenceCanon: () => 4,
      liveDerivation: () => 5,
      coldDerivation: () => 6,
    });
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(6);
  }
});

test('compareSourcePrecedence ranks reference-canon below deterministic-observation', () => {
  expect(
    compareSourcePrecedence('deterministic-observation', 'reference-canon'),
  ).toBeGreaterThan(0);
  expect(
    compareSourcePrecedence('reference-canon', 'live-derivation'),
  ).toBeGreaterThan(0);
});
```

**Estimated scope.** ~30–50 call sites (the `foldPhaseOutputSource`
exhaustiveness fans out to every consumer of the Source axis). Most
edits are one-line additions of a new case branch. Compiler-driven.

---

## Commit 2 — C6 direct: impact scheduler closure

**Goal.** Graduate the C6 (Intervention-Adjusted Economics)
scoreboard metric from `proxy` to `direct`. Today
`InterventionTokenImpact` at
`lib/domain/handshake/intervention.ts:162-169` carries
`ambiguityReduction`, `suspensionAvoided`, `rungImprovement`, and
`activationQuality` as optional numeric fields. Nothing populates
them. The C6 visitor at
`lib/domain/fitness/metric/visitors/intervention-marginal-value.ts`
(landed as a stub in commit `c68e03f`) reads those fields and
returns zero or a proxy value. This commit wires the populator —
a before/after impact scheduler that snapshots the attachment
region's rung distribution pre-activation and re-measures it one
loop iteration later — and flips the C6 visitor to direct
measurement.

**Axis anchor.** Stage + Fingerprint. The before/after protocol
requires (a) stage-constrained snapshots (pre-activation lives at
`'execution'` stage; post-activation lives at `'execution'` stage
after the intervention receipt has been applied), and (b) typed
`Fingerprint<'attachment-region'>` to prove that the pre and post
snapshots reference the same region. Both axes are already landed;
this commit uses them.

**Files touched.**

| File | Change |
|---|---|
| `lib/application/intervention/impact-scheduler.ts` | The scheduler primitives landed in commit `93387c1` (Phase C item 2). This commit completes the wiring: `snapshotAttachmentRegion(region, catalog, evidence)` produces a pre-state record typed by the attachment region's `Fingerprint<'attachment-region'>`; `reMeasureAttachmentRegion(region, snapshot, nextRun)` compares post-state against pre-state and produces a populated `InterventionTokenImpact`. Pure functions; no IO inside the primitives. |
| `lib/application/improvement/speedrun.ts` | The `iteratePhase` function calls `snapshotAttachmentRegion` immediately before activating an agentic override, and calls `reMeasureAttachmentRegion` during the next iteration's `fitnessPhase`. The snapshots live in `.tesseract/scratch/attachment-snapshots/<receipt-id>.json` (gitignored; regenerable). |
| `lib/domain/handshake/intervention.ts` | `InterventionReceipt.handoff.attachmentRegion` already exists per commit `d6d4e58`; make the type require a `Fingerprint<'attachment-region'>` instead of a bare string (load-bearing for typed pre/post pairing). |
| `lib/domain/fitness/metric/visitors/intervention-marginal-value.ts` | Replace the stub return with a real fold over populated `InterventionTokenImpact` records from the improvement ledger. Compute: `#{receipts with rungImprovement > 0 OR ambiguityReduction > 0 OR suspensionAvoided > 0} / #{accepted receipts in window}`. Expose the result as a C6 scoreboard value with provenance. |
| `lib/application/catalog/loaders/agentic-overrides.ts` (or equivalent) | Law enforcement: no file under `{suiteRoot}/.canonical-artifacts/agentic/**` may be loaded without a corresponding `InterventionReceipt` reference in the improvement ledger. If a file exists but no receipt does, the loader emits a structured warning and the entry is NOT loaded as an agentic override (it's rejected as "orphaned canon"). |
| `tests/intervention/impact-scheduler.laws.spec.ts` (new) | Pre/post snapshots are stage-typed; attachment region fingerprints survive serialization; the scheduler is idempotent (re-running the snapshot phase on the same state produces identical snapshots); the visitor computes C6 deterministically from a given set of populated impacts. |
| `tests/fitness/metric/intervention-marginal-value.laws.spec.ts` (extended) | C6 value lies in `[0, 1]`; empty ledger → C6 is undefined (not zero); when all populated impacts are positive, C6 = 1.0; when all are zero or negative, C6 = 0.0. |

**Acceptance criteria.**

1. The stub `intervention-marginal-value.ts` visitor is replaced
   with a direct implementation. Its theorem-group status moves
   from `proxy` to `direct` in the alignment-targets per-group
   floors table.
2. After running a synthetic speedrun with `--max-iterations 4`,
   the improvement ledger contains populated `InterventionTokenImpact`
   records for every agentic override activated during the run.
3. Every populated impact has a `rungImprovement` field computed
   from a real before/after delta, not a placeholder.
4. C6 on the synthetic workload reads above its 2026-Q2 floor
   (50%). If it reads below, the diagnosis is either (a) the
   activated overrides aren't actually moving the needle — this
   is a signal the agentic intervention engine is producing
   low-quality proposals — or (b) the impact scheduler is
   measuring the wrong region, which is a scheduler bug.
5. A law test enforces that no file under
   `.canonical-artifacts/agentic/**` exists without a corresponding
   `InterventionReceipt`. The law fails on any orphaned canon.

**Expected metric movement.**

- C6: graduates from `proxy` to `direct`. Numerical value depends
  on the quality of the agentic overrides actually being activated
  on the synthetic workload; target is ≥50% for 2026-Q2 floor.
- Pipeline-efficacy L4 tree: unchanged.
- Discovery-fitness tree: unchanged.
- M5: unchanged (commit 3).

**Why Stage + Fingerprint are the load-bearing axes.** The
before/after pairing is a protocol: a pre-state snapshot is a
stage-typed value at `'execution'` stage, and a post-state
re-measurement is a stage-typed value at `'execution'` stage of
a later iteration. The same attachment region has to be
referenced by both; without typed fingerprints, the scheduler
could silently compare two different regions (e.g., the scope
drifted between iterations) and nobody would notice. The Stage
phantom lets the scheduler's function signatures declare
`snapshot: (region: WorkflowEnvelope<'execution', _>) →
AttachmentSnapshot<region>` and `remeasure: (snapshot:
AttachmentSnapshot<region>, next: WorkflowEnvelope<'execution',
_>) → InterventionTokenImpact`. The Fingerprint<Tag> brand lets
the compiler check "same region" as a type-level fact.

**Estimated scope.** ~6–10 files touched. The scheduler primitives
already exist (Phase C item 2, commit `93387c1`); this commit is
their wiring into the speedrun loop and the C6 visitor closure.

---

## Commit 3 — M5 direct: trajectory accumulation

**Goal.** Graduate the M5 (Memory Worthiness Ratio) scoreboard
metric from `proxy` to `direct`. Today `MemoryMaturity` exists as
a branded scalar at `lib/domain/fitness/memory-maturity.ts:27-93`
and the trajectory type exists as a file
(`memory-maturity-trajectory.ts` is present in the tree). What's
missing is the accumulation — nothing appends history points to
the trajectory across improvement runs, so the trajectory never
has more than zero points and the slope can't be computed.

Per the operational definitions locked in
`docs/alignment-targets.md` on 2026-04-10:

- **`MemoryMaintenanceCost(τ)`** = wall-clock per iteration +
  agentic-override maintenance work (a small positive weight per
  file under `.canonical-artifacts/agentic/`). Reference canon
  entries do NOT count — they're slated for demotion. Pure
  deterministic observations also do not count — they're re-earned
  on each cold pass.
- **"Cohort-comparable"** = same scenario IDs. The trajectory buffer
  resets per-scenario when the reference cohort is reseeded.
- **M5 graduates from `proxy` to `direct`** when ≥3 cohort-comparable
  history points exist and the slope is computed from real data.

**Axis anchor.** Stage. Trajectory points are stage-typed
(`WorkflowEnvelope<'improvement', MemoryMaturityPoint>`) so the
accumulator can only be appended by code paths that actually run
at the improvement stage — no accidental appends from preparation
or execution phases.

**Files touched.**

| File | Change |
|---|---|
| `lib/domain/fitness/memory-maturity-trajectory.ts` | The file exists; add the full implementation. `MemoryMaturityPoint` as a readonly value type carrying `cohortId`, `maturity: MemoryMaturity`, `effectiveHitRate: number`, `computedAt: string`, `scorecardCommit: string`. `MemoryMaturityTrajectory` as `{ readonly points: readonly MemoryMaturityPoint[] }`. `appendTrajectoryPoint(trajectory, point): MemoryMaturityTrajectory` as a pure function (returns a new value). `trajectorySlope(trajectory, window): number` as linear regression over the last N comparable points. `isComparableAt(a, b): boolean` checks cohort ID equality. |
| `lib/application/improvement/ledger.ts` (or equivalent) | The improvement ledger gains a `memoryMaturityTrajectory: MemoryMaturityTrajectory` field. After each `fitnessPhase` run, the ledger writer computes the current `MemoryMaturity`, constructs a `MemoryMaturityPoint`, and appends it via `appendTrajectoryPoint`. |
| `lib/domain/fitness/metric/visitors/memory-worthiness-ratio.ts` | Promote from stub to direct. Read `MemoryMaturityTrajectory` from the visitor input; compute `trajectorySlope` over the configured window; divide by `MemoryMaintenanceCost(τ)` from the improvement ledger's wall-clock + agentic-override count. Return an M5 scoreboard value with provenance. Graduate its theorem-group status from `proxy` to `direct`. |
| `lib/domain/fitness/memory-maintenance-cost.ts` (new) | Pure function that computes `MemoryMaintenanceCost(τ)` from (a) the loop-iteration wall-clock duration, and (b) the count of files under `{suiteRoot}/.canonical-artifacts/agentic/**` at the end of the iteration. Reference canon entries are deliberately excluded per the alignment-targets definition. |
| `tests/fitness/memory-maturity-trajectory.laws.spec.ts` (new) | Determinism (same point sequence → same slope); empty trajectory slope = 0; single-point slope = 0; monotone positive input → positive slope; monotone negative input → negative slope; cohort-comparability filter excludes non-matching cohort IDs. |
| `tests/fitness/metric/memory-worthiness-ratio.laws.spec.ts` (extended) | M5 value is finite and non-negative; empty trajectory → M5 is `undefined` (not zero); three monotone-positive points → M5 > 1.0. |

**Acceptance criteria.**

1. The trajectory primitive is implemented, tested, and used by the
   improvement ledger.
2. After running the synthetic convergence proof across ≥3
   iterations on the same reference cohort (same scenario IDs),
   the improvement ledger's trajectory has ≥3 cohort-comparable
   points and the slope is computable.
3. The M5 visitor reads the trajectory and returns a numerical
   value. Its theorem-group status in alignment-targets is
   updated from `proxy` to `direct` for the 2026-Q2 floor row.
4. The synthetic M5 reads above its 2026-Q2 floor (1.0) on at
   least one reference cohort. If it reads below, the synthetic
   pipeline is not compounding on that cohort, and the diagnosis
   is either (a) the effective hit rate is flat iteration-over-
   iteration — which means the agentic interventions are not
   improving resolution — or (b) the maintenance cost denominator
   is exploding because we're adding agentic overrides faster
   than they earn their keep. Both are diagnostics that C6 (commit
   2) can adjudicate.

**Expected metric movement.**

- M5: graduates from `proxy` to `direct`. Numerical value depends
  on how steeply the effective hit rate rises with maturity on
  the synthetic workload; target is ≥1.0 for 2026-Q2 floor.
- Pipeline-efficacy L4 tree: unchanged (M5 reads from it, not
  vice versa).
- C6: unchanged (commit 2 already graduated it).
- Discovery-fitness tree: unchanged (commit 4 + 5 touch it).

**Why Stage is the load-bearing axis.** Trajectory points are
stage-typed at `'improvement'`. The trajectory accumulator's
signature is `appendTrajectoryPoint: (MemoryMaturityTrajectory,
WorkflowEnvelope<'improvement', MemoryMaturityPoint>) →
MemoryMaturityTrajectory`. A code path at preparation stage cannot
silently append a trajectory point because the type forbids it.
This is a small but load-bearing protection: the alignment-targets
wall defines M5 as a cohort-trajectory slope, and the trajectory
must be append-only-from-improvement-phase to mean what the wall
says it means.

**Estimated scope.** ~5–8 files touched. The trajectory primitive
is a single focused addition; the ledger wiring is ~20 lines; the
visitor graduation is ~30 lines; the maintenance-cost helper is a
pure fold over the agentic-override directory tree.

---

## Commit 4 — Promotion gates with confidence intervals

**Goal.** Replace the scalar `PromotionEvaluation.scores` field at
`lib/domain/pipeline/promotion-gate.ts:43-46` with a Beta-posterior
confidence interval model. Today a promotion gate compares
`candidate score` against `existing score` as a scalar; a single
flaky cold-derivation can promote a bad atom because no
statistical floor gates the decision. The doctrine at
`canon-and-derivation.md` § 7.1a prescribes per-class dynamic
confidence intervals; this commit implements that prescription.

**Axis anchor.** Source + Verdict. The gate is a transition
`PromotionGate<Src1 → Src2>` (e.g., `'cold-derivation' →
'deterministic-observation'`) that produces a `GovernanceVerdict`
(`Approved` → promote, `Suspended` → needs more samples,
`Blocked` → reject candidate). Both axes are landed; this commit
refines the gate's internal scoring without changing its signature.

**Files touched.**

| File | Change |
|---|---|
| `lib/domain/pipeline/promotion-confidence.ts` (new) | `BetaPosterior` type with `alpha` and `beta` fields. Pure functions: `observeSuccess(posterior)`, `observeFailure(posterior)`, `confidenceInterval(posterior, significance): { lower, upper, point }`. Monoid composition: `combinePosteriors(a, b)` with identity `{ alpha: 1, beta: 1 }` (Beta(1,1) = uniform prior). |
| `lib/domain/pipeline/promotion-gate.ts` | Replace the scalar `scores?: { candidate: number; existing: number }` field on `PromotionEvaluation` with `confidence?: { candidate: ConfidenceInterval; existing: ConfidenceInterval }`. The existing scalar path remains as a fallback for gates that haven't been migrated. The verdict logic gains three branches: sample count below floor → `Suspended('needs-review')`; lower bound below per-class quality floor → `Blocked('insufficient-quality')`; candidate lower bound > existing upper bound + margin → `Approved('promote')`. |
| `lib/domain/pipeline/promotion-policies.ts` (new) | `PromotionConfidencePolicy` type declaring `minSampleCount`, `significanceLevel`, `qualityFloor`, `promotionMargin` per atom class. `Record<AtomClass, PromotionConfidencePolicy>` mapped-type registry, compile-time-exhaustive. Routes get conservative policies (rare changes); elements get moderate; resolution-overrides get the tightest (highest cadence). |
| `lib/application/pipeline/promotion-scheduler.ts` (or equivalent) | The scheduler that computes candidate scores is extended to also accumulate observation counts (success/failure series). Each cold-derivation that agrees with the existing canon is a success observation; each that disagrees is a failure observation. The series is stored in `.tesseract/promotion-observations/<address>.json` (gitignored) and fed into the gate's `observeSuccess`/`observeFailure` primitives. |
| `tests/promotion-confidence.laws.spec.ts` (new) | Monoid laws: `combinePosteriors` is associative and has identity; `observeSuccess` and `observeFailure` commute with each other (order doesn't matter); confidence interval widens with higher significance level; confidence interval narrows with more observations. |
| `tests/promotion-gate.laws.spec.ts` (extended) | Per-class policy graduation: low sample count → `Suspended`; insufficient quality → `Blocked`; clear margin over existing → `Approved`; no promotion when margin is too tight. |

**Acceptance criteria.**

1. The `BetaPosterior` monoid laws pass (associativity, identity,
   commutativity of independent observations).
2. Every `AtomClass` has a registered `PromotionConfidencePolicy`
   in the compile-time-exhaustive registry; adding a new atom class
   without registering a policy is a TypeScript error.
3. A synthetic speedrun that runs cold derivations against the
   reference cohort produces promotion evaluations with populated
   `confidence` fields. The verdict distribution across the run
   should be approximately: many `Suspended('needs-review')` early
   (low sample count), transitioning to `Approved` or `Blocked` as
   observation counts accumulate.
4. At least one atom class demonstrates a full `Suspended →
   Approved` transition across iterations — proof that the
   confidence accumulation is working end-to-end.
5. The existing scalar-scoring code path still works for gates
   that haven't been migrated (no breaking change to call sites).

**Expected metric movement.**

- Pipeline-efficacy L4 tree: unchanged.
- Discovery-fitness tree: gains honest per-class promotion
  signals. The `discovery-*-fidelity` visitors can now distinguish
  "cold derivation is close to canon but we don't have enough
  samples yet" from "cold derivation is close but below the
  quality floor" from "cold derivation is clearly beating canon."
- C6: unchanged directly, but strengthened indirectly because
  confidence-interval gates reject bad promotions that would
  otherwise poison the C6 denominator.
- M5: unchanged directly, but strengthened indirectly because
  confidence gates prevent the canonical artifact store from
  churning on marginal candidates — which prevents maintenance
  cost spikes.

**Why Source + Verdict are the load-bearing axes.** The gate is a
typed transition between Source slots. Its input is
`Atom<C, T, 'cold-derivation' | 'live-derivation'>` and its output
is `GovernanceVerdict<Atom<C, T, 'deterministic-observation'>,
NeedsReview>`. The compiler enforces that only derivable-source
atoms can flow into the gate, and only gate-approved atoms can
become deterministic observations. The verdict's three-way decision
carries the confidence interval inline so downstream consumers can
fold over it without reconstruction.

**Estimated scope.** ~6–10 files. The Beta posterior primitives are
~80 lines of pure math; the policy registry is ~30 lines of
declarations; the gate migration is ~50 lines per gate type × 5
atom classes that have active gates; the scheduler wiring is ~40
lines.

---

## Commit 5 — Demotion sweep for reference canon

**Goal.** Close the loop. Today reference canon sits in slot 4 as
the transitional fallback layer, but nothing actively shrinks it.
The doctrine at `canon-and-derivation.md` § 3.2a says reference
canon has three defined exits: supersession by an agentic
override, supersession by a deterministic observation, or direct
demotion. This commit implements an automatic sweep that proposes
demotions whenever a real agentic override or deterministic
observation appears at the same address as a reference canon
entry. Plus: a reference-canon-hit trend report in the score
command so the migration debt shrinking is visible cycle-over-cycle.

**Axis anchor.** Source + Verdict. A demotion is a
`GovernanceVerdict` transition that removes an atom from slot 4.
The sweep walks the catalog, identifies addresses where slot 2 or
slot 3 has a real canonical artifact AND slot 4 has a reference
canon entry, and emits a demotion proposal (Verdict:
`Suspended('demotion-candidate')`) that the operator (or
auto-approval, if the policy allows) resolves.

**Files touched.**

| File | Change |
|---|---|
| `lib/application/pipeline/demotion-sweep.ts` (new) | Pure function `sweepReferenceCanon(catalog): DemotionProposal[]`. Walks `catalog.tier1Atoms`, `tier2Compositions`, `tier3Projections`. For each address where `source === 'reference-canon'`, checks whether a `source === 'agentic-override'` or `source === 'deterministic-observation'` entry exists at the same address. If yes, emits a `DemotionProposal` with the reference canon entry, the superseding entry, and a reason code. |
| `lib/domain/pipeline/demotion-proposal.ts` (new or extended) | `DemotionProposal` type: `{ address: AtomAddress; currentEntry: Atom<C, T, 'reference-canon'>; supersedingEntry: Atom<C, T, 'agentic-override' \| 'deterministic-observation'>; reason: DemotionReason; proposedAt: string }`. `DemotionReason` discriminated union: `'superseded-by-agentic-override'`, `'superseded-by-deterministic-observation'`, `'no-longer-needed'`. Exhaustive fold for rendering/processing. |
| `lib/application/cli/commands/score.ts` | Add a "reference-canon hit trend" bucket to the score report. Compares the current warm run's reference-canon hit fraction to the last N baselines; reports as `decreasing` (healthy), `flat` (watch), or `increasing` (regression). |
| `lib/application/cli/commands/demote.ts` (new or extended) | `tesseract demote --review` surfaces pending demotion proposals from the sweep. `--auto-approve-supersessions` flag lets the dogfood loop automatically demote reference canon entries that are cleanly superseded (no ambiguity). The auto-approval is logged to the promotion-log for audit. |
| `lib/application/improvement/speedrun.ts` | At the end of each loop iteration, the speedrun runs `sweepReferenceCanon` and either queues demotion proposals for operator review or auto-approves them (synthetic mode). The result is emitted as a dashboard event `reference-canon-demoted` so the convergence UI can show shrinkage in real time. |
| `tests/pipeline/demotion-sweep.laws.spec.ts` (new) | Sweep idempotency (same catalog state → same proposals); sweep correctness (every emitted proposal has a real superseding entry); exhaustive fold over `DemotionReason`; proposal ordering is deterministic. |
| `docs/canon-and-derivation.md` § 14.0 | Cross-reference update: the graduation condition now points at the demotion sweep as the mechanism that drives reference canon to zero. |

**Acceptance criteria.**

1. `sweepReferenceCanon` is implemented, tested, and runs at the
   end of every speedrun iteration.
2. On a synthetic dogfood cycle where at least one agentic
   override is activated that lands at the same address as an
   existing reference canon entry, the sweep emits a demotion
   proposal for that entry.
3. Auto-approved demotions actually remove the reference canon
   file from disk and the catalog no longer loads it on the next
   iteration.
4. The score command's "reference-canon hit trend" bucket reads
   `decreasing` across a multi-iteration speedrun.
5. After a sufficient number of synthetic cycles, the
   reference-canon hit fraction trends toward zero on the
   scenarios the loop has exercised. (Full-zero is not a gate
   for this commit — that's the long-arc graduation condition
   in `canon-and-derivation.md` § 14.0.)

**Expected metric movement.**

- Reference-canon hit fraction: **decreasing** cycle-over-cycle.
  This is the signature measurement of synthetic feature completion
  working as designed — the substrate is shrinking the migration
  debt without the operator manually deleting anything.
- M5: marginal improvement as the maintenance-cost denominator
  tightens (fewer reference canon entries means fewer zombie
  addresses in the catalog).
- C6: unchanged directly but the denominator becomes more honest
  as reference canon shrinks — C6 is computed over "accepted
  agentic augmentations," and the sweep removes any reference
  canon entries that agentic overrides have already superseded,
  so the denominator is cleaner.
- Pipeline-efficacy L4 tree: marginal improvement as the catalog
  loads faster (less reference canon to walk) and lookup chain
  walks terminate at slot 2/3 instead of slot 4 more often.

**Why Source + Verdict are the load-bearing axes.** The sweep is a
typed fold over the catalog that selects atoms by Source and
produces demotion verdicts. Its signature is roughly
`sweepReferenceCanon: (catalog: Catalog) → readonly
GovernanceVerdict<Atom<C, T, 'reference-canon'>, DemotionProposal>[]`.
Every proposal carries the superseding entry as part of its
payload, and the verdict fold makes processing exhaustive.

**Estimated scope.** ~5–8 files. The sweep is a straightforward
catalog walk; the proposal type is ~40 lines; the CLI wiring is
~50 lines; the auto-approval policy is ~20 lines.

---

## Exit criteria: synthetic feature completion

When all five commits have landed, the synthetic dogfood suite
is **feature complete** iff all of the following hold:

### Scoreboard honesty

- **M5**: theorem-group status is `direct`, numerical value is
  above 1.0 on at least one reference cohort for the 2026-Q2 floor.
- **C6**: theorem-group status is `direct`, numerical value is
  above 50% for the 2026-Q2 floor.
- **No scoreboard metric is using a `proxy` formula where the
  doctrine expects `direct`.** Per `alignment-targets.md` theorem
  group table, the Q2 floors for K, L, S, D, V, R, A, C, M all
  meet their target status.

### Substrate honesty

- **Every file under `.canonical-artifacts/agentic/**` is
  receipt-backed.** A law test enforces it. Orphaned canon is a
  load-time error, not a warning.
- **Every file under `.canonical-artifacts/deterministic/**` is
  promotion-gate-backed.** A law test enforces it.
- **Reference canon hit fraction is trending down cycle-over-cycle.**
  Not necessarily zero — zero is the graduation condition in
  `canon-and-derivation.md` § 14.0 — but the trend signal is
  visible in the score command.

### Type-system honesty

- **The four axes are fully enforced.** No untyped stages, no
  untyped sources, no untyped fingerprints, no untyped governance
  strings. Architecture fitness laws pass.
- **The synthetic speedrun runs under `--no-reference-canon` and
  emits a comparison report** showing "real canon hit rate" vs
  "warm-with-reference-canon hit rate." The delta is the
  migration debt.

### Loop honesty

- **Loop A / B / C run end-to-end against the reference cohort
  corpus.** The convergence proof script runs clean over at least
  3 iterations. The improvement ledger accumulates trajectory
  points. Demotion proposals land automatically. C6 is populated
  from real before/after comparisons.

### What is NOT required for synthetic feature completion

- Running against a real enterprise target.
- Populating the Tier 3 projection store.
- Landing the runtime-family detector for a specific platform.
- Lifting Lane to a phantom type.
- Lifting Loops to a Kleisli composition.
- Any confidence-interval floor above the 2026-Q2 minimum.

Those are all post-feature-completion work. They depend on the
synthetic scoreboard being honest first; attempting them earlier
risks locking in false positives against noisy metrics.

## After synthetic feature completion lands

The immediate next target is **runtime-family recognition** (cold-
start plan Phase E). Pick a concrete runtime family —
probably OutSystems Reactive 11 per the cold-start plan § 4.E —
author its signature bundle as an initial agentic override, run
the discovery engine against a public demo instance, and measure
whether the scoreboard holds under real-target conditions. This
is the point at which the "interface intelligence transfers across
customer instances" claim can be tested.

After Phase E comes **Tier 3 projection authoring** (Phase F) for
role-aware enterprise applications, which is where the C6 scoreboard
starts measuring the agent's contribution to role-visibility and
wizard-state modeling. Both of those phases are out of scope for
this plan; both assume this plan has already landed.

## Plan status

This document tracks five discrete commits. Commit 1 was split into
1a (type extension) and 1b (loader + wiring + score report) to keep
the type-level work reviewable independently from the runtime
loader work. The status of each moves as they land on `main` or a
feature branch.

| # | Commit | Status | Landed as |
|---|---|---|---|
| 1a | Source axis type extension: `reference-canon` variant | `landed` | `87c73ff` on `claude/review-recursive-improvement-docs-AU4xb` |
| 1b | Reference-canon loader + catalog wiring + score report bucket | `in progress` | — |
| 2 | C6 direct: impact scheduler closure | `planned` | — |
| 3 | M5 direct: trajectory accumulation | `planned` | — |
| 4 | Promotion gates with confidence intervals | `planned` | — |
| 5 | Demotion sweep for reference canon | `planned` | — |

Update this table as commits land. When 1a–5 are all `landed` and
the scoreboard honesty criteria above pass on a synthetic run,
mark the whole plan as `complete` and move on to Phase E.

### Commit 1a summary (landed 2026-04-11)

Extended `PhaseOutputSource` from 5 variants to 6, adding
`'reference-canon'` as slot 4 between `'deterministic-observation'`
and `'live-derivation'`. The compiler now enforces exhaustive
handling of all six variants at every `foldPhaseOutputSource` call
site. The lookup chain interface gained an optional
`skipReferenceCanon?: boolean` flag orthogonal to `LookupMode`; the
implementation threads it through the tier resolver, the qualified
projection pass, and the slots-consulted accounting. New law tests
assert the six-slot precedence, the four-category source partition,
and the reference-canon slot position. 42 source-classifier tests
pass; build remains green; the 4 pre-existing typecheck errors are
unchanged (no new errors introduced).

What 1a does NOT do: nothing yet produces entries tagged
`'reference-canon'`. The type system is in place but the reference
canon slot is empty at runtime. Commit 1b closes that gap by
writing the loader.
