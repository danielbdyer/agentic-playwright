# Compounding Engine — Execution Plan

> Status: execution plan (2026-04-22). Sits above
> `docs/v2-scenario-corpus-plan.md` (which sat above
> `docs/v2-probe-ir-spike.md`). The compounding engine is the
> third and final XXXXL slice — it closes the workshop's
> self-referential feedback loop so the workshop can graduate
> itself when probe coverage saturates and
> `metric-hypothesis-confirmation-rate` sustains above floor.
>
> Reading order: §§1–2 ground purpose and vocabulary; §§3–5
> model domain + Effect + Big-O; §6 places files; §§7–9 are the
> execution track; §§10–12 are exit criteria + risk + open
> questions.

## 1. Purpose and Scope

### 1.1 What this slice delivers

After the compounding engine lands, the workshop:

1. **Treats every change as a hypothesis.** A new fixture, a
   registered classifier, an updated renderer, a substrate-version
   bump, a probe or scenario authoring edit — each mints a
   `Hypothesis` declaring the predicted receipt-space movement.
2. **Tags receipts.** Every `ProbeReceipt` and `ScenarioReceipt`
   carries a `hypothesisId` naming the hypothesis the receipt is
   evidence for (or `null` when the receipt is baseline
   measurement).
3. **Computes confirmation.** The C6 visitor
   (`metric-hypothesis-confirmation-rate`) reads hypothesis-tagged
   receipts, compares `predicted` to `observed`, emits a rolling-
   window rate.
4. **Persists the trajectory.** `workshop/logs/scenario-receipts/`
   and `workshop/logs/probe-receipts/` are the append-only
   evidence trails; the scorecard reads them for trends.
5. **Detects regressions.** A per-receipt diff across two
   sequential runs names which receipts changed verdict.
6. **Ratchets customer incidents.** A captured real-world flow
   becomes a scenario that must continue to pass forever; the
   workshop's graduation gate forbids ratchet regressions.
7. **Computes graduation.** A single boolean: `probe coverage
   ≥ 100% ∧ corpus passes ∧ hypothesis confirmation rate ≥ floor
   over N cycles ∧ no ratchet regressions`.
8. **Auto-identifies gaps.** The workshop reports the
   (verb × facet-kind × error-family) cells that lack probes plus
   the scenario-topology combinations that lack coverage.
9. **Surfaces in the dashboard.** Operators see trajectory,
   regressions, ratchets, and graduation distance at a glance.

### 1.2 What this slice does NOT deliver

- **Business-domain judgment.** The engine measures structural
  axes and hypothesis-confirmation rates. "Does this feature make
  customers happier" remains outside its scope.
- **Adoption of the product's runtime.** The engine reads receipts
  the product has already emitted; it does not modify
  manifest-declared verbs.
- **Replacement of the proposal-gated trust policy.** The existing
  trust policy still gates catalog writes; the engine feeds it
  hypothesis-confirmation evidence as an input, not a replacement.
- **A brand-new CI pipeline.** Integrates with existing
  `npx vitest run`, `verify:rung-3-parity`, `scenario-verify` —
  additive, not parallel.
- **Autonomous code changes.** Every proposed change still lands
  through the normal git commit flow; the engine identifies gaps
  and scores confirmation, it does not write code.

### 1.3 Guiding principles (standing rules)

| Rule | Source |
|---|---|
| FP-first; immutable data; `readonly` on exported interface fields | `docs/coding-notes.md` |
| Effect-forward orchestration (`Effect.gen` + `yield*`) | idem |
| Closed unions with exhaustive folds | idem |
| `Context.Tag` for each injectable service | idem |
| Laws pin invariants, not implementations | CLAUDE.md |
| Envelope discipline: `extends WorkflowMetadata<Stage>` | CLAUDE.md |
| Seam compile-enforced; RULE_1/2/3 honored | `seam-enforcement.laws.spec.ts` |
| No `Effect.runPromise` outside CLI/tests | `coding-notes.md` |
| Content-addressable identity via `Fingerprint<Tag>` | `product/domain/kernel/hash.ts` |
| **New: hypotheses are append-only; never edited, only superseded** | this doc (§10 R2 mitigation) |
| **New: trajectory log lives under `workshop/logs/`, not product/** | CLAUDE.md seam doctrine |

### 1.4 Success-in-one-line

**The workshop computes its own graduation.** One boolean, derived
from the receipt trail, says whether the workshop's job is done.
When true, the workshop is structurally redundant to the probes it
emits — the exit condition the memo has promised since Step 5.

## 2. Ubiquitous Language (DDD glossary)

Every term below is load-bearing. The table names each term, its
meaning, and the file where its domain type lives.

| Term | Definition | Home |
|---|---|---|
| **Hypothesis** | Aggregate root. An authored prediction: "under change `C`, receipt(s) of kind `K` in cohort `H` will satisfy predicate `P` for `N` cycles." Content-addressable via `Fingerprint<'hypothesis'>`. | `workshop/compounding/domain/hypothesis.ts` |
| **Prediction** | Value object. The body of a hypothesis — closed-union shape declaring what movement is expected. | `.../prediction.ts` |
| **HypothesisReceipt** | Aggregate root. Append-only evidence artifact for ONE hypothesis-confirmation cycle. Extends `WorkflowMetadata<'evidence'>` with `kind: 'hypothesis-receipt'`. References the probe/scenario receipts whose observations formed the evidence. | `.../hypothesis-receipt.ts` |
| **ConfirmationOutcome** | Value object. `'confirmed' \| 'refuted' \| 'inconclusive'`. Exhaustive fold. | `.../confirmation.ts` |
| **Cohort** | Value object. The identity tuple hypotheses and receipts group by. Extends the existing `ProbeSurfaceCohort` with a scenario-cohort variant. Union: `probe-surface \| scenario-trajectory`. | `.../cohort.ts` |
| **TrajectoryEntry** | Entity. A single point on a cohort's pass-rate timeline. Content: `{ cohortId, timestamp, sampleCount, confirmedCount, verdict }`. | `.../trajectory.ts` |
| **ConfirmationRate** | Value object. `confirmed / (confirmed + refuted)` in a rolling window — the C6 metric's core number. | `.../confirmation-rate.ts` |
| **GraduationGate** | Value object. The closed set of predicates the workshop must satisfy to be "done." Evaluates to `{ state: 'holds' \| 'not-yet' \| 'regressed'; missingConditions: readonly string[] }`. | `.../graduation.ts` |
| **RegressionReport** | Value object. The diff between two receipt snapshots (usually sequential runs). `{ newlyFailing: ReceiptId[]; newlyPassing: ReceiptId[]; newRatchetBreak: RatchetBreakDetail[] }`. | `.../regression.ts` |
| **Ratchet** | Aggregate root. A captured customer incident encoded as a scenario that the graduation gate forbids regressing. Once a receipt passes once, it must continue to pass forever. | `.../ratchet.ts` |
| **GapReport** | Value object. Named (verb × facetKind × errorFamily) cells not covered by any probe OR topology compositions not covered by any scenario. Drives authoring priority. | `.../gap-analysis.ts` |
| **CompoundingScoreboard** | Aggregate root. Top-level workshop scorecard — ties probe coverage, scenario corpus status, confirmation-rate trajectory, ratchet tally, graduation gate into one renderable document. | `.../scoreboard.ts` |

### 2.1 Aggregate relationships

```
Hypothesis (root)
├── Prediction
├── Cohort (the grouping key)
├── Author + timestamp + supersedes?
└── Evidence set — resolved at query time from ProbeReceipt/ScenarioReceipt log

HypothesisReceipt (root)
├── references Hypothesis by id + fingerprint
├── ConfirmationOutcome
├── evidenceReceiptIds  (ProbeReceipt + ScenarioReceipt artifact fingerprints)
└── provenance (when the rate computed, against which substrate version)

TrajectoryEntry (entity)
├── belongs to Cohort
└── folds over HypothesisReceipt + per-run scenario/probe pass-rates

GraduationGate (value object)
├── aggregates CompoundingScoreboard fields
├── checks probe coverage
├── checks scenario corpus pass-rate
├── checks trajectory floor sustained
└── checks no ratchet regressions

Ratchet (root)
├── owns a Scenario (by id)
└── once passed, is a pinned invariant on the trajectory

CompoundingScoreboard (root, read-model)
├── probe-coverage snapshot
├── scenario-pass snapshot
├── trajectory per cohort
├── ratchet tally + break list
├── graduation gate state
└── GapReport
```

### 2.2 Naming policy

- **Hypothesis IDs** are UUIDv4 on authoring OR content-addressed via `Fingerprint<'hypothesis'>` for deterministic test construction. Two forms supported; production uses UUIDs.
- **Cohort IDs** extend the existing `probeSurfaceCohortKey` shape (`verb:<v>|facet-kind:<k>|error-family:<e>`) with a new scenario form (`scenario:<id>|topology:<t>`).
- **Ratchet IDs** mirror their source scenario's id (`ratchet:<scenario-id>`).
- **Receipt references** are artifact fingerprints (`sha256:...`), never runtime ids; fingerprints make the trajectory stable across log rotations.
- **No business-domain words**, anywhere. The engine's vocabulary is strictly measurement-shaped.

## 3. Domain Model

### 3.1 Hypothesis + Prediction

```ts
// workshop/compounding/domain/hypothesis.ts

import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { Cohort } from './cohort';
import type { Prediction } from './prediction';

export type HypothesisId = string & { readonly __brand: 'HypothesisId' };

export interface Hypothesis {
  readonly id: HypothesisId;
  readonly description: string;         // cosmetic; excluded from fingerprint
  readonly schemaVersion: 1;
  readonly cohort: Cohort;
  readonly prediction: Prediction;
  /** Number of hypothesis-confirmation cycles the hypothesis
   *  must consistently confirm for the graduation gate to credit
   *  it. Default 3 (matches M5's MIN_TRAJECTORY_POINTS). */
  readonly requiredConsecutiveConfirmations: number;
  /** ID of the hypothesis this one replaces (append-only; never
   *  edit). Null for first-generation hypotheses. */
  readonly supersedes: HypothesisId | null;
  readonly author: string;              // e.g., commit SHA + author name
  readonly createdAt: string;           // ISO-8601
}

export function hypothesisId(value: string): HypothesisId {
  return value as HypothesisId;
}

/** Canonical key excluded cosmetic fields → fingerprint input. */
export function hypothesisKeyableShape(h: Hypothesis): unknown {
  return {
    id: h.id,
    schemaVersion: h.schemaVersion,
    cohort: h.cohort,
    prediction: h.prediction,
    requiredConsecutiveConfirmations: h.requiredConsecutiveConfirmations,
    supersedes: h.supersedes,
  };
}
```

```ts
// workshop/compounding/domain/prediction.ts

export type Prediction =
  | ConfirmationRatePrediction
  | ReceiptFamilyShiftPrediction
  | CoverageGrowthPrediction
  | RegressionFreedomPrediction;

/** "This cohort's confirmation rate is at least X% over N cycles." */
export interface ConfirmationRatePrediction {
  readonly kind: 'confirmation-rate';
  readonly atLeast: number;             // 0 ≤ x ≤ 1
  readonly overCycles: number;
}

/** "Receipts in this cohort shift from error-family F1 to F2 or
 *  to matched/null." */
export interface ReceiptFamilyShiftPrediction {
  readonly kind: 'receipt-family-shift';
  readonly from: string;                // 'not-visible', etc., or 'failed-any'
  readonly to: string;                  // 'matched' for recovery predictions
}

/** "Probe coverage for (verb, facetKind) rises from X to Y." */
export interface CoverageGrowthPrediction {
  readonly kind: 'coverage-growth';
  readonly verb: string;
  readonly facetKind: string;
  readonly fromRatio: number;
  readonly toRatio: number;
}

/** "These named receipts never regress (ratchet predicate)." */
export interface RegressionFreedomPrediction {
  readonly kind: 'regression-freedom';
  readonly receiptIds: readonly string[];
}

export function foldPrediction<R>(
  p: Prediction,
  cases: {
    readonly confirmationRate: (p: ConfirmationRatePrediction) => R;
    readonly receiptFamilyShift: (p: ReceiptFamilyShiftPrediction) => R;
    readonly coverageGrowth: (p: CoverageGrowthPrediction) => R;
    readonly regressionFreedom: (p: RegressionFreedomPrediction) => R;
  },
): R {
  switch (p.kind) {
    case 'confirmation-rate':   return cases.confirmationRate(p);
    case 'receipt-family-shift': return cases.receiptFamilyShift(p);
    case 'coverage-growth':     return cases.coverageGrowth(p);
    case 'regression-freedom':  return cases.regressionFreedom(p);
  }
}
```

### 3.2 Cohort (union)

```ts
// workshop/compounding/domain/cohort.ts

import type { ProbeSurfaceCohort } from '../../metrics/probe-surface-cohort';

/** Extends the existing probe-surface cohort with a scenario form. */
export type Cohort =
  | ProbeSurfaceCohortRef
  | ScenarioTrajectoryCohort;

export interface ProbeSurfaceCohortRef {
  readonly kind: 'probe-surface';
  readonly cohort: ProbeSurfaceCohort;
}

export interface ScenarioTrajectoryCohort {
  readonly kind: 'scenario-trajectory';
  readonly scenarioId: string;
  readonly topologyId: string;
}

export function cohortKey(c: Cohort): string {
  switch (c.kind) {
    case 'probe-surface':
      return `probe:${c.cohort.verb}|facet-kind:${c.cohort.facetKind}|error-family:${c.cohort.errorFamily ?? 'none'}`;
    case 'scenario-trajectory':
      return `scenario:${c.scenarioId}|topology:${c.topologyId}`;
  }
}
```

### 3.3 ConfirmationOutcome + HypothesisReceipt

```ts
// workshop/compounding/domain/confirmation.ts

export type ConfirmationOutcome = 'confirmed' | 'refuted' | 'inconclusive';

export function foldConfirmationOutcome<R>(
  o: ConfirmationOutcome,
  cases: {
    readonly confirmed: () => R;
    readonly refuted: () => R;
    readonly inconclusive: () => R;
  },
): R {
  switch (o) {
    case 'confirmed':    return cases.confirmed();
    case 'refuted':      return cases.refuted();
    case 'inconclusive': return cases.inconclusive();
  }
}
```

```ts
// workshop/compounding/domain/hypothesis-receipt.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { ConfirmationOutcome } from './confirmation';
import type { HypothesisId } from './hypothesis';

export interface HypothesisReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'hypothesis-receipt';
  readonly scope: 'hypothesis';
  readonly payload: {
    readonly hypothesisId: HypothesisId;
    readonly hypothesisFingerprint: Fingerprint<'hypothesis'>;
    readonly outcome: ConfirmationOutcome;
    /** The ProbeReceipt / ScenarioReceipt artifact fingerprints
     *  that formed this cycle's evidence — lineage.parents
     *  carries them too, but the payload keeps a structured
     *  list for indexed query. */
    readonly evidenceReceiptIds: readonly string[];
    readonly confirmedCount: number;
    readonly refutedCount: number;
    readonly inconclusiveCount: number;
    /** The exact rate this cycle produced. */
    readonly cycleRate: number;
    readonly provenance: {
      readonly substrateVersion: string;
      readonly manifestVersion: number;
      readonly computedAt: string;
    };
  };
}
```

### 3.4 TrajectoryEntry

```ts
// workshop/compounding/domain/trajectory.ts

export interface TrajectoryEntry {
  readonly cohortId: string;                       // from cohortKey()
  readonly timestamp: string;                       // ISO-8601
  readonly sampleSize: number;                      // receipts in the window
  readonly confirmedCount: number;
  readonly refutedCount: number;
  readonly rate: number;                            // confirmed / (confirmed + refuted)
  readonly substrateVersion: string;
}

export interface Trajectory {
  readonly cohortId: string;
  readonly entries: readonly TrajectoryEntry[];
}

/** Returns a rolling-window rate over the last N entries. */
export function rollingRate(
  trajectory: Trajectory,
  window: number,
): number | null {
  if (trajectory.entries.length === 0) return null;
  const slice = trajectory.entries.slice(-window);
  const confirmed = slice.reduce((a, e) => a + e.confirmedCount, 0);
  const refuted = slice.reduce((a, e) => a + e.refutedCount, 0);
  const denom = confirmed + refuted;
  return denom === 0 ? null : confirmed / denom;
}
```

### 3.5 GraduationGate

```ts
// workshop/compounding/domain/graduation.ts

export type GraduationGateState = 'holds' | 'not-yet' | 'regressed';

export interface GraduationGateReport {
  readonly state: GraduationGateState;
  readonly missingConditions: readonly string[];
  /** For each ordered condition: held? */
  readonly conditions: readonly { readonly name: string; readonly held: boolean; readonly detail: string }[];
}

export const GRADUATION_CONDITIONS: readonly string[] = [
  'probe-coverage-is-100',
  'scenario-corpus-all-passes',
  'hypothesis-confirmation-rate-sustained',
  'no-ratchet-regressions',
];

export function foldGraduationGateState<R>(
  state: GraduationGateState,
  cases: {
    readonly holds: () => R;
    readonly notYet: () => R;
    readonly regressed: () => R;
  },
): R {
  switch (state) {
    case 'holds':     return cases.holds();
    case 'not-yet':   return cases.notYet();
    case 'regressed': return cases.regressed();
  }
}
```

### 3.6 Regression / Ratchet / GapReport

```ts
// workshop/compounding/domain/regression.ts

export interface RegressionReport {
  readonly baselineFingerprint: string;
  readonly currentFingerprint: string;
  readonly newlyFailing: readonly string[];          // receipt ids
  readonly newlyPassing: readonly string[];
  readonly ratchetBreaks: readonly RatchetBreakDetail[];
}

export interface RatchetBreakDetail {
  readonly ratchetId: string;
  readonly scenarioId: string;
  readonly brokenAt: string;                          // ISO-8601
  readonly firstPassedAt: string;
}
```

```ts
// workshop/compounding/domain/ratchet.ts

export interface Ratchet {
  readonly id: string;                                // 'ratchet:<scenario-id>'
  readonly scenarioId: string;
  readonly firstPassedAt: string;
  readonly firstPassedFingerprint: string;
}
```

```ts
// workshop/compounding/domain/gap-analysis.ts

export interface ProbeGap {
  readonly verb: string;
  readonly facetKind: string;
  readonly errorFamily: string | null;
}

export interface ScenarioGap {
  readonly topologyId: string;
  readonly uncoveredInvariants: readonly string[];
}

export interface GapReport {
  readonly probeGaps: readonly ProbeGap[];
  readonly scenarioGaps: readonly ScenarioGap[];
  readonly generatedAt: string;
}
```

### 3.7 CompoundingScoreboard (read-model root)

```ts
// workshop/compounding/domain/scoreboard.ts

import type { GraduationGateReport } from './graduation';
import type { GapReport } from './gap-analysis';
import type { RegressionReport } from './regression';
import type { Trajectory } from './trajectory';

export interface CompoundingScoreboard {
  readonly generatedAt: string;
  readonly probeCoverageRatio: number;
  readonly scenarioPassRatio: number;
  readonly trajectories: readonly Trajectory[];
  readonly activeRatchetCount: number;
  readonly brokenRatchetCount: number;
  readonly graduation: GraduationGateReport;
  readonly gaps: GapReport;
  readonly lastRegression: RegressionReport | null;
  readonly substrateVersion: string;
}
```

### 3.8 Value-object discipline

Every exported interface field is `readonly`. Arrays are `readonly T[]`.
Unions are closed. Folds are exhaustive. Aggregates are constructed
fresh; no field mutation after construction.

### 3.9 Reuses (no duplication)

The compounding engine builds on existing primitives:

- `ProbeReceipt` (workshop/probe-derivation/probe-receipt.ts) —
  gets a new optional `payload.hypothesisId: HypothesisId | null`
  field.
- `ScenarioReceipt` (workshop/scenarios/domain/scenario-receipt.ts)
  — gets the same `payload.hypothesisId` field.
- `ProbeSurfaceCohort` (workshop/metrics/probe-surface-cohort.ts)
  — Cohort union's first variant wraps this unchanged.
- `SUBSTRATE_VERSION` (workshop/substrate/version.ts) — trajectory
  entries stamp it.
- `WorkflowMetadata<'evidence'>` (product/domain/governance) — the
  envelope shape HypothesisReceipt extends.

Additive change to `hypothesisId`: field declared optional so
existing receipts continue to round-trip; new code populates it
when a hypothesis is being evaluated.

## 4. Effect Architecture

### 4.1 Service topology

Three `Context.Tag` services (all workshop-side). Everything else
is pure.

```ts
// workshop/compounding/application/ports.ts

import { Context, type Effect } from 'effect';
import type { Hypothesis, HypothesisId } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Trajectory } from '../domain/trajectory';
import type { RegressionReport } from '../domain/regression';
import type { CompoundingScoreboard } from '../domain/scoreboard';
import type { Ratchet } from '../domain/ratchet';
import type { CompoundingError } from '../domain/compounding-error';

/** The append-only hypothesis store. Writes are one-shot (an
 *  authored hypothesis), reads are cohort-indexed queries. */
export interface HypothesisLedgerService {
  readonly append: (h: Hypothesis) => Effect.Effect<void, CompoundingError, never>;
  readonly findById: (id: HypothesisId) => Effect.Effect<Hypothesis | null, CompoundingError, never>;
  readonly findByCohort: (cohortKey: string) => Effect.Effect<readonly Hypothesis[], CompoundingError, never>;
  readonly listAll: () => Effect.Effect<readonly Hypothesis[], CompoundingError, never>;
}

export class HypothesisLedger extends Context.Tag('workshop/compounding/HypothesisLedger')<
  HypothesisLedger,
  HypothesisLedgerService
>() {}

/** The receipt-query port. Reads from workshop/logs/. */
export interface ReceiptStoreService {
  readonly probeReceiptsForHypothesis: (
    id: HypothesisId,
  ) => Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never>;
  readonly scenarioReceiptsForHypothesis: (
    id: HypothesisId,
  ) => Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never>;
  readonly latestProbeReceipts: () => Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never>;
  readonly latestScenarioReceipts: () => Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never>;
  readonly appendHypothesisReceipt: (r: HypothesisReceipt) => Effect.Effect<void, CompoundingError, never>;
  readonly appendRatchet: (r: Ratchet) => Effect.Effect<void, CompoundingError, never>;
  readonly listRatchets: () => Effect.Effect<readonly Ratchet[], CompoundingError, never>;
}

export class ReceiptStore extends Context.Tag('workshop/compounding/ReceiptStore')<
  ReceiptStore,
  ReceiptStoreService
>() {}

/** Clock — existing; reused, not redefined. */
// import { Clock } from 'effect';

/** Type aliases so the port doesn't depend on probe-derivation
 *  or scenarios modules directly (keeps the layering clean). */
export interface ProbeReceiptLike {
  readonly payload: {
    readonly probeId: string;
    readonly hypothesisId?: string | null;
    readonly outcome: {
      readonly expected: { readonly classification: string; readonly errorFamily: string | null };
      readonly observed: { readonly classification: string; readonly errorFamily: string | null };
      readonly completedAsExpected: boolean;
    };
    readonly cohort: { readonly verb: string; readonly facetKind: string; readonly errorFamily: string | null };
  };
  readonly fingerprints: { readonly artifact: string };
}

export interface ScenarioReceiptLike {
  readonly payload: {
    readonly scenarioId: string;
    readonly hypothesisId?: string | null;
    readonly verdict: string;
  };
  readonly fingerprints: { readonly artifact: string };
}
```

### 4.2 Runner composition

The top-level program builds the CompoundingScoreboard by
composing pure readers over the two service tags.

```ts
// workshop/compounding/application/compute-scoreboard.ts

import { Effect } from 'effect';
import { HypothesisLedger, ReceiptStore } from './ports';
import { evaluateHypothesis } from './evaluate-hypothesis';
import { computeTrajectories } from './trajectories';
import { computeRegressionReport } from './regression';
import { computeGraduationGate } from './graduation';
import { computeGapReport } from './gap-analysis';
import { SUBSTRATE_VERSION } from '../../substrate/version';
import type { CompoundingError } from '../domain/compounding-error';
import type { CompoundingScoreboard } from '../domain/scoreboard';

export function computeScoreboard(options: {
  readonly now: () => Date;
}): Effect.Effect<CompoundingScoreboard, CompoundingError, HypothesisLedger | ReceiptStore> {
  return Effect.gen(function* () {
    const ledger = yield* HypothesisLedger;
    const store = yield* ReceiptStore;

    // Step 1 — fetch inputs (can parallel-run; each yields its
    // own receipt stream).
    const [hypotheses, probeReceipts, scenarioReceipts, ratchets] = yield* Effect.all([
      ledger.listAll(),
      store.latestProbeReceipts(),
      store.latestScenarioReceipts(),
      store.listRatchets(),
    ], { concurrency: 'unbounded' });

    // Step 2 — evaluate each hypothesis (parallel-safe: pure
    // derivations over disjoint receipt subsets).
    const hypothesisReceipts = yield* Effect.all(
      hypotheses.map((h) => evaluateHypothesis(h, probeReceipts, scenarioReceipts)),
      { concurrency: 'unbounded' },
    );

    // Step 3 — append each new hypothesis receipt (sequential:
    // log writes must serialize per-file).
    for (const hr of hypothesisReceipts) {
      yield* store.appendHypothesisReceipt(hr);
    }

    // Step 4 — compute derived read-models (pure).
    const trajectories = computeTrajectories(hypothesisReceipts, probeReceipts, scenarioReceipts);
    const regression = computeRegressionReport(probeReceipts, scenarioReceipts, ratchets);
    const gaps = computeGapReport(probeReceipts, scenarioReceipts);
    const graduation = computeGraduationGate({
      probeReceipts,
      scenarioReceipts,
      trajectories,
      ratchets,
      regression,
    });

    return {
      generatedAt: options.now().toISOString(),
      probeCoverageRatio: computeProbeCoverage(probeReceipts),
      scenarioPassRatio: computeScenarioPass(scenarioReceipts),
      trajectories,
      activeRatchetCount: ratchets.length,
      brokenRatchetCount: regression.ratchetBreaks.length,
      graduation,
      gaps,
      lastRegression: regression,
      substrateVersion: SUBSTRATE_VERSION,
    };
  });
}
```

### 4.3 Evaluate-hypothesis (pure + Effect boundary)

```ts
// workshop/compounding/application/evaluate-hypothesis.ts

import { Effect } from 'effect';
import type { Hypothesis } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { ProbeReceiptLike, ScenarioReceiptLike } from './ports';
import type { CompoundingError } from '../domain/compounding-error';
import { buildHypothesisReceipt } from './build-hypothesis-receipt';
import { filterEvidenceForHypothesis } from './filter-evidence';
import { foldPrediction } from '../domain/prediction';
import { confirmationFromPrediction } from './confirmation-judgments';

/** Evaluate a single hypothesis against the current receipt stream.
 *  Pure over its inputs. Returns an HypothesisReceipt ready to
 *  append to the store. */
export function evaluateHypothesis(
  hypothesis: Hypothesis,
  probeReceipts: readonly ProbeReceiptLike[],
  scenarioReceipts: readonly ScenarioReceiptLike[],
): Effect.Effect<HypothesisReceipt, CompoundingError, never> {
  return Effect.sync(() => {
    const evidence = filterEvidenceForHypothesis(hypothesis, probeReceipts, scenarioReceipts);
    const judgment = foldPrediction(hypothesis.prediction, {
      confirmationRate: (p) => confirmationFromPrediction.confirmationRate(p, evidence),
      receiptFamilyShift: (p) => confirmationFromPrediction.receiptFamilyShift(p, evidence),
      coverageGrowth: (p) => confirmationFromPrediction.coverageGrowth(p, evidence),
      regressionFreedom: (p) => confirmationFromPrediction.regressionFreedom(p, evidence),
    });
    return buildHypothesisReceipt(hypothesis, judgment);
  });
}
```

### 4.4 Error model (tagged union)

```ts
// workshop/compounding/domain/compounding-error.ts

export interface LogIoFailed {
  readonly _tag: 'LogIoFailed';
  readonly path: string;
  readonly cause: string;
}

export interface HypothesisFingerprintMismatch {
  readonly _tag: 'HypothesisFingerprintMismatch';
  readonly expected: string;
  readonly actual: string;
}

export interface EvidenceQueryFailed {
  readonly _tag: 'EvidenceQueryFailed';
  readonly cohortKey: string;
  readonly cause: string;
}

export interface SupersedesChainCircular {
  readonly _tag: 'SupersedesChainCircular';
  readonly chain: readonly string[];
}

export type CompoundingError =
  | LogIoFailed
  | HypothesisFingerprintMismatch
  | EvidenceQueryFailed
  | SupersedesChainCircular;

export function foldCompoundingError<R>(
  err: CompoundingError,
  cases: {
    readonly logIo: (e: LogIoFailed) => R;
    readonly fingerprintMismatch: (e: HypothesisFingerprintMismatch) => R;
    readonly evidenceQuery: (e: EvidenceQueryFailed) => R;
    readonly supersedesCircular: (e: SupersedesChainCircular) => R;
  },
): R {
  switch (err._tag) {
    case 'LogIoFailed':                  return cases.logIo(err);
    case 'HypothesisFingerprintMismatch': return cases.fingerprintMismatch(err);
    case 'EvidenceQueryFailed':          return cases.evidenceQuery(err);
    case 'SupersedesChainCircular':      return cases.supersedesCircular(err);
  }
}
```

### 4.5 Layer composition

```ts
// workshop/compounding/composition/live-services.ts

export const liveHypothesisLedgerLayer: Layer.Layer<HypothesisLedger, never, FileSystem> =
  Layer.effect(HypothesisLedger, Effect.gen(function* () {
    const fs = yield* FileSystem;
    return createFilesystemHypothesisLedger({ fs, path: hypothesisLedgerPath() });
  }));

export const liveReceiptStoreLayer: Layer.Layer<ReceiptStore, never, FileSystem> =
  Layer.effect(ReceiptStore, Effect.gen(function* () {
    const fs = yield* FileSystem;
    return createFilesystemReceiptStore({ fs, logDir: receiptLogDir() });
  }));

export const liveCompoundingLayer = Layer.mergeAll(
  liveHypothesisLedgerLayer,
  liveReceiptStoreLayer,
);
```

Test doubles wire via `Layer.succeed(HypothesisLedger, inMemoryLedger)`
and `Layer.succeed(ReceiptStore, inMemoryStore)`.

### 4.6 Parallel-safety analysis

| Operation | Safe to parallelize? | Reasoning |
|---|---|---|
| Fetch hypotheses + probe receipts + scenario receipts | YES | Disjoint reads; `Effect.all` concurrency=unbounded. |
| Evaluate each hypothesis | YES | Pure over disjoint evidence subsets; no shared mutable state. |
| Append hypothesis receipts to log | NO (per-file) | Single-file append semantics. Use `for…of` inside `Effect.gen`. |
| Compute trajectories / regression / gaps / graduation | YES (pure) | Read-only derivations over the populated receipt set. |
| Append ratchet entries | NO (per-file) | Same as hypothesis receipt appends. |

### 4.7 Scoped resource hygiene

Filesystem layers don't need `Effect.scoped` (Node's fs is
process-global). The MCP / CLI entrypoints provide the
`FileSystem` tag from `product/application/ports`; no new scoped
acquisition here.

### 4.8 Determinism contract

`computeScoreboard` is deterministic conditioned on:
- The receipt log contents (snapshot at read time).
- The hypothesis ledger contents.
- `options.now()` (test-mode pins it).
- `SUBSTRATE_VERSION`.

Two runs under identical conditions produce byte-identical
scoreboards. This is the parity-law gate for the compounding
engine.

## 5. Big-O Analysis

### 5.1 Variables

Let:
- `H` = hypotheses in the ledger (typical: 50–500; ceiling: 10,000)
- `R_p` = probe receipts in the log (typical: 100/day; ceiling: 10M lifetime)
- `R_s` = scenario receipts in the log (typical: 20/day; ceiling: 1M)
- `R_h` = hypothesis receipts in the log (one per hypothesis per
  evaluation cycle; N_cycles × H lifetime)
- `C` = cohorts distinct in the ledger (typical: 50; ceiling: 1,000)
- `T` = trajectory window size (default 10)
- `Ratch` = active ratchets (typical: 20; ceiling: 10,000)

### 5.2 Per-operation complexity

| Operation | Complexity | Notes |
|---|---|---|
| `ledger.append(hypothesis)` | `O(size of hypothesis JSON)` | Append to JSONL file. |
| `ledger.findById(id)` | `O(H)` scan; `O(log H)` with indexed variant | Default filesystem variant scans; see §5.5. |
| `ledger.findByCohort(k)` | `O(H)` scan | Same. |
| `receiptStore.probeReceiptsForHypothesis(id)` | `O(R_p)` | Linear scan of hypothesis-tagged probe receipts. |
| `evaluateHypothesis(h, P, S)` where `\|evidence\|` ≤ 100 typical | `O(\|evidence\|)` | Pure filter + predicate evaluation. |
| `computeTrajectories(R_h, R_p, R_s)` | `O(R_h + R_p + R_s)` | Single-pass grouping by cohort key. |
| `rollingRate(trajectory, W)` | `O(W)` | Slice last W entries + sum. |
| `computeRegressionReport(P_new, P_old)` | `O(R_p)` | Sort-by-probeId + linear merge diff. |
| `computeGraduationGate(...)` | `O(C)` | Pure fold over conditions. |
| `computeGapReport(P, S)` | `O(R_p + R_s + C)` | Counts cohorts with zero coverage; O(C) lookup via Map. |
| `computeScoreboard(...)` full | `O(H + R_p + R_s)` | Dominated by receipt enumeration. |

### 5.3 Lifetime complexity

Running `computeScoreboard` once per CI cycle over the lifetime:

- Receipt logs grow `O(K × N_cycles)` where K = receipts per cycle.
- Each cycle's `computeScoreboard` is `O(H + R_p + R_s)` in the log
  snapshot at that time.
- Total lifetime cost: `O(H × N_cycles + Σ(R_p + R_s))`.

This grows super-linearly unless we introduce snapshotting.
**Mitigation**: the scoreboard writes a snapshot receipt per
cycle; subsequent cycles read the snapshot + only the incremental
receipts since last snapshot. Complexity per cycle then becomes
`O(ΔR_p + ΔR_s + H)` — linear in the current-cycle delta plus
hypothesis count.

Snapshotting lands in Z7 (see §7); earlier phases tolerate the
quadratic pathway because K × N_cycles remains small during
bootstrapping.

### 5.4 Memory

- Each HypothesisReceipt: ~500 bytes serialized.
- Each TrajectoryEntry: ~200 bytes.
- Each RegressionReport: bounded by `min(\|newly-failing\|, \|newly-passing\|, \|ratchet-breaks\|)` which in normal operation is ≤ 10.

CompoundingScoreboard in memory: ~50 KB at typical scale, ~1 MB
at ceiling. Fits comfortably in a single Node process.

Receipt logs on disk: JSONL files, ~10-100 MB at one-year steady
state, split by month. Rotation is straightforward.

### 5.5 Lookup structures

| Lookup | Backing | Access |
|---|---|---|
| Hypothesis by id | JSONL scan; optional sidecar index file maps id → byte offset | O(H) naive; O(log H) indexed |
| Probe receipts by cohort | Pre-computed inverted index (cohort → receipt ids) OR linear scan | O(1) amortized with index; O(R_p) without |
| Ratchet by id | Small set (≤10k); `ReadonlyMap<RatchetId, Ratchet>` | O(1) |
| Trajectory by cohort | `ReadonlyMap<cohortKey, Trajectory>` | O(1) |

Indexing is **additive optimization**: every phase ships correct
naive code first; indexes land only when a benchmark shows the
naive pathway is a bottleneck. This preserves code clarity until
we have evidence the index pays for itself.

### 5.6 Parallelism at scoreboard level

`computeScoreboard` naturally parallelizes across hypotheses
(§4.2 — `Effect.all concurrency=unbounded` over hypothesis
evaluation). Each hypothesis evaluation is pure; concurrent
evaluation never races.

The sequential appends for HypothesisReceipt and Ratchet writes
serialize per-file; throughput bounded by filesystem write
throughput, not concurrency model.

### 5.7 Big-O summary

```
computeScoreboard (per cycle):
  O(H + R_p + R_s)  naive
  O(ΔH + ΔR_p + ΔR_s)  with Z7 snapshotting

Lifetime (N cycles):
  O(Σ(ΔR))  ≈ O(total receipts)  with snapshotting
  O(N × H + Σ(R))  without
```

No path is worse than linear in the lifetime data size. No
accidental quadratic. Snapshotting (Z7) is the lever that keeps
per-cycle cost bounded as the log grows.

## 6. Seam Discipline

### 6.1 Directory layout

```
workshop/
  compounding/
    domain/                       # pure types, no Effect
      hypothesis.ts               # Hypothesis, HypothesisId, keyable shape
      prediction.ts               # Prediction union + fold
      hypothesis-receipt.ts       # HypothesisReceipt envelope
      confirmation.ts             # ConfirmationOutcome + fold
      cohort.ts                   # Cohort union + key
      trajectory.ts               # TrajectoryEntry, Trajectory, rollingRate
      graduation.ts               # GraduationGateReport + conditions list
      regression.ts               # RegressionReport + RatchetBreakDetail
      ratchet.ts                  # Ratchet aggregate root
      gap-analysis.ts             # GapReport value objects
      scoreboard.ts               # CompoundingScoreboard read-model
      compounding-error.ts        # tagged CompoundingError + fold
    application/                  # Effect programs
      ports.ts                    # HypothesisLedger + ReceiptStore tags
      compute-scoreboard.ts       # top-level composition
      evaluate-hypothesis.ts      # Effect.sync over pure predicate
      filter-evidence.ts          # pure: hypothesis → matching receipts
      confirmation-judgments.ts   # pure: prediction + evidence → outcome
      trajectories.ts             # pure: hypothesis-receipts → Trajectory[]
      regression.ts               # pure: receipts diff → RegressionReport
      graduation.ts               # pure: inputs → GraduationGateReport
      gap-analysis.ts             # pure: receipts → GapReport
      build-hypothesis-receipt.ts # pure: h + judgment → HypothesisReceipt
      fingerprint.ts              # Fingerprint<'hypothesis'> / receipt
    harness/                      # I/O-backed service implementations
      filesystem-hypothesis-ledger.ts
      filesystem-receipt-store.ts
      in-memory-hypothesis-ledger.ts  # test double
      in-memory-receipt-store.ts      # test double
    composition/                  # Layer roots
      live-services.ts
      in-memory-services.ts       # composed for unit tests
    ledger/                       # authored hypothesis files
      *.hypothesis.yaml
    cli/                          # CLI command modules
      compounding-scoreboard-command.ts
      compounding-improve-command.ts
      compounding-ratchet-command.ts
  logs/
    hypotheses/                   # authored hypothesis log (JSONL)
    hypothesis-receipts/          # one per evaluation cycle
    ratchets/                     # once passed, never deleted
    scoreboard-snapshots/         # per-cycle CompoundingScoreboard JSON
    probe-receipts/               # (existing)
    scenario-receipts/            # (existing)
```

### 6.2 Seam compliance matrix

| Module | Imports from product/ | Imports from workshop/ |
|---|---|---|
| `compounding/domain/` | `product/domain/governance/workflow-types` + `product/domain/kernel/hash` (both already allowlisted) | `workshop/metrics/probe-surface-cohort` (existing Cohort); `workshop/substrate/version` (SUBSTRATE_VERSION). |
| `compounding/application/` | same as domain + `product/application/ports` (FileSystem — already allowlisted) | domain + `workshop/probe-derivation/probe-receipt` (ProbeReceipt type) + `workshop/scenarios/domain/scenario-receipt` (ScenarioReceipt). |
| `compounding/harness/` | `product/application/ports` (FileSystem) — already allowlisted. | everything above. |
| `compounding/cli/` | `product/cli/shared` (CommandSpec) — already allowlisted. | application + composition. |

### 6.3 New allowlist entries

**Zero.** Every product-side import the compounding engine
requires is already in `ALWAYS_ALLOWED_PRODUCT_PATHS`. No new
seam-test updates needed.

### 6.4 RULE_3 stays at zero

`product/` never imports from `workshop/compounding/`. Dashboard
reads compounding scoreboards via the shared log set (seam
contract — unchanged).

### 6.5 Cross-module reuse

The compounding engine reuses:

- **ProbeReceipt** / **ScenarioReceipt** — tagged with optional
  `payload.hypothesisId`. Additive field change.
- **ProbeSurfaceCohort** — one variant of the new Cohort union.
- **SUBSTRATE_VERSION** — stamped on trajectory + hypothesis
  receipt provenance.
- **Fingerprint<Tag>** — two new tags: `'hypothesis'` +
  `'hypothesis-receipt'`. Added once to the registry at phase Z1.
- **FileSystem Context.Tag** (from `product/application/ports`) —
  used by the filesystem hypothesis ledger + receipt store.
- **WorkflowMetadata<'evidence'>** — HypothesisReceipt's envelope
  base.
- **TrustPolicy** (optional) — future integration: hypothesis
  confirmation rate feeds the trust policy's activation gate.
  Noted as open question (§11 Q5), not wired in this slice.

### 6.6 Where the engine does NOT reach

- **Manifest verbs.** The engine reads receipts; it never modifies
  manifest-declared verbs. No `declareVerb` touches compounding.
- **Runtime authoring flow.** The product's authoring path
  (`product/runtime/*`) is untouched. Probes and scenarios
  continue to emit receipts through their existing channels.
- **Dashboard projection source-of-truth.** The scoreboard is
  workshop-emitted; dashboard renders it read-only via the
  projection seam (same pattern as the existing
  `dashboard/projections/*`).

### 6.7 Effect service hygiene

Two new `Context.Tag` services: `HypothesisLedger` and
`ReceiptStore`. Everything else is pure. Over-tagging obscures
the injectable boundaries; these two are the only external-world
contact points the engine needs.

## 7. Execution Plan — Phases Z1 through Z10

Each phase is a single commit (or a small set) with a named
deliverable + exit gate. Commits land in order; each builds on
the prior. Laws land with their phase; SC-laws ledger extends
from SC32 onward with `ZC1..ZCn` prefix.

### Z1 — Domain primitives (2 commits)

**Deliverable**: the pure types — `Hypothesis`, `Prediction`,
`Cohort`, `ConfirmationOutcome`, `HypothesisReceipt`,
`TrajectoryEntry`, `GraduationGateReport`, `RegressionReport`,
`Ratchet`, `GapReport`, `CompoundingScoreboard`,
`CompoundingError`. No Effect imports in the domain tree.

**Commits**:
- `step-9.Z1a-hypothesis-prediction-cohort`: core authored
  values (Hypothesis, Prediction, Cohort) + folds + cohort
  key derivation. Laws ZC1–ZC3.
- `step-9.Z1b-receipt-trajectory-graduation`: runtime evidence
  types (HypothesisReceipt, TrajectoryEntry,
  GraduationGateReport, RegressionReport, Ratchet, GapReport,
  CompoundingScoreboard, CompoundingError). Laws ZC4–ZC9.

**Exit gate**: all types compile; 12+ laws green; filesystem-walk
test confirms no `from 'effect'` import under `compounding/domain/`.

**Size**: ~600 LOC types + 500 LOC laws.

### Z2 — Fingerprint + Service ports (1 commit)

**Deliverable**: `'hypothesis'` + `'hypothesis-receipt'` land in
the Fingerprint tag registry; the `HypothesisLedger` + `ReceiptStore`
Context.Tags are declared; the pure fingerprint helpers are in place.

**Commit**:
- `step-9.Z2-fingerprint-ports`:
  - `product/domain/kernel/hash.ts`: + two tags.
  - `workshop/compounding/application/fingerprint.ts`:
    `hypothesisFingerprint()`, `hypothesisReceiptFingerprint()`.
  - `workshop/compounding/application/ports.ts`: the two tags.
  - Laws ZC10 (fingerprint stability + cosmetic exclusion).

**Exit gate**: build clean; 3 new fingerprint laws green; tags
appear in the closed union.

**Size**: ~200 LOC.

### Z3 — Probe + Scenario receipts tag with hypothesisId (1 commit)

**Deliverable**: `ProbeReceipt.payload.hypothesisId?: string | null`
and `ScenarioReceipt.payload.hypothesisId?: string | null` land
as optional fields. Existing receipt emitters default to `null`;
the compounding engine reads the tagged ones.

**Commit**:
- `step-9.Z3-receipt-hypothesis-tag`:
  - Add optional field to both receipt types.
  - Update `probeReceipt()` / `buildScenarioReceipt()` constructors
    to accept the field.
  - All existing constructors default to `null` → no behavioral
    change to existing tests.
  - Law ZC11: round-trip preserves `hypothesisId` when present.

**Exit gate**: full probe IR + scenario corpus tests (3,698 as of
S9) continue to pass. Build clean.

**Size**: ~150 LOC.

### Z4 — In-memory HypothesisLedger + ReceiptStore (1 commit)

**Deliverable**: test-double implementations of both services —
pure-in-memory, used for unit tests of the compute pipeline.

**Commit**:
- `step-9.Z4-in-memory-services`:
  - `workshop/compounding/harness/in-memory-hypothesis-ledger.ts`
  - `workshop/compounding/harness/in-memory-receipt-store.ts`
  - `workshop/compounding/composition/in-memory-services.ts` —
    Layer composition root for tests.
  - Laws ZC12–ZC14 (append idempotent, findById round-trip,
    findByCohort filters).

**Exit gate**: test doubles cover both service surfaces; unit
tests can wire them via Layer.succeed.

**Size**: ~400 LOC.

### Z5 — Core compute pipeline (pure derivations) (2 commits)

**Deliverable**: the pure derivation functions that turn inputs
into a `CompoundingScoreboard`.

**Commits**:
- `step-9.Z5a-evaluate-filter-judgment`:
  - `filter-evidence.ts`: hypothesis → receipts it tags.
  - `confirmation-judgments.ts`: pure predicate evaluators per
    Prediction kind. Returns ConfirmationOutcome + cycle counts.
  - `evaluate-hypothesis.ts`: Effect.sync wrapper.
  - `build-hypothesis-receipt.ts`: output envelope construction.
  - Laws ZC15–ZC19 (one per Prediction kind + the build).
- `step-9.Z5b-trajectory-regression-graduation-gaps`:
  - `trajectories.ts`: group by cohort + compute rolling rates.
  - `regression.ts`: diff receipt sets by artifact fingerprint.
  - `graduation.ts`: evaluate the four ordered conditions.
  - `gap-analysis.ts`: compute probe + scenario coverage gaps.
  - Laws ZC20–ZC24.

**Exit gate**: 12+ new laws green; `computeScoreboard` runs
end-to-end under the in-memory services; produces a valid
`CompoundingScoreboard` from a hand-crafted input set.

**Size**: ~1,000 LOC (split roughly evenly across code + laws).

### Z6 — Filesystem services + integration law (1 commit)

**Deliverable**: `FileSystem`-backed `HypothesisLedger` +
`ReceiptStore` that read/write JSONL logs. End-to-end integration
law writes a hypothesis, writes receipts, reads the scoreboard,
asserts expected shape.

**Commit**:
- `step-9.Z6-filesystem-services`:
  - `workshop/compounding/harness/filesystem-hypothesis-ledger.ts`
  - `workshop/compounding/harness/filesystem-receipt-store.ts`
  - `workshop/compounding/composition/live-services.ts`.
  - Integration law ZC25: tempdir-based end-to-end scoreboard
    computation from zero state through 3 receipts.

**Exit gate**: integration law passes under vitest with tempdir.

**Size**: ~500 LOC.

### Z7 — Snapshotting + regression detection (1 commit)

**Deliverable**: the scoreboard persists a snapshot per run; the
regression detector reads the prior snapshot + current receipts
to produce a `RegressionReport`. Ratchet breaks surface as a
dedicated field.

**Commit**:
- `step-9.Z7-snapshots-regression`:
  - `workshop/compounding/application/snapshot-store.ts`:
    writes `scoreboard-snapshots/<timestamp>.json`; reads the
    most-recent-prior.
  - `regression.ts` consumes prior-snapshot + current receipts
    for the diff.
  - `ratchet.ts` uses firstPassedFingerprint — if a prior
    snapshot's pass-list contains a receipt that currently
    fails, it's a ratchet break.
  - Laws ZC26–ZC27.

**Exit gate**: second run of the integration law detects no
regressions against the first; a contrived third run with a
flipped receipt produces the expected RatchetBreakDetail.

**Size**: ~300 LOC.

### Z8 — Improvement CLI (1 commit)

**Deliverable**: `tesseract compounding scoreboard` +
`tesseract compounding improve` CLI commands.

**Commit**:
- `step-9.Z8-compounding-cli`:
  - `workshop/cli/commands/compounding-scoreboard.ts` — computes
    and prints the current scoreboard JSON.
  - `workshop/cli/commands/compounding-improve.ts` — runs the
    scoreboard, then prints the top-N gaps ranked by graduation
    distance + the ratchets broken. Suggests fixture/scenario
    authoring priorities.
  - Registers `'compounding-scoreboard'` + `'compounding-improve'`
    as new CommandNames.
  - Laws ZC28 (exit code discipline).

**Exit gate**: `npm run build && tesseract compounding scoreboard`
produces a scoreboard JSON; `tesseract compounding improve`
produces a ranked gap list.

**Size**: ~400 LOC.

### Z9 — Ratchet authoring + customer-incident import (1 commit)

**Deliverable**: a CLI subcommand that imports a currently-passing
scenario's receipt as a Ratchet — locking it in as a
"never-regress" invariant. Plus a hypothesis-authoring CLI for
manual hypothesis entry.

**Commit**:
- `step-9.Z9-ratchet-hypothesis-authoring`:
  - `tesseract compounding ratchet <scenario-id>`: captures the
    current passing receipt for the scenario; appends a Ratchet to
    the log. If the scenario currently fails, exits 1 with a
    clear error.
  - `tesseract compounding hypothesize --cohort ... --prediction ...`:
    mints a Hypothesis + appends to the ledger.
  - Laws ZC29–ZC30.

**Exit gate**: CLI commands work end-to-end; graduation gate
fails when a known-passing scenario regresses post-ratchet.

**Size**: ~400 LOC.

### Z10 — Verdict-09 + dashboard projection + graduation smoke (1 commit)

**Deliverable**: the graduation verdict artifact that names
the workshop's first compounding-engine run. Dashboard projection
reads the scoreboard for operator visibility.

**Commit**:
- `step-9.Z10-verdict-dashboard-graduation`:
  - `dashboard/projections/compounding-scoreboard.ts`: renders
    the scoreboard as a timeline + gap-list + graduation-distance
    indicator.
  - `workshop/observations/probe-spike-verdict-09.md`: records
    the compounding engine's graduation — the full Z1–Z10 ledger,
    graduation gate state, seed hypothesis set, ratchet list,
    and the SC+ZC law ledger.
  - End-to-end smoke: author 3 hypotheses, run a spike + corpus
    cycle, compute the scoreboard, assert `graduation.state`
    resolves (expected `'not-yet'` at first run).

**Exit gate**: verdict-09 commits; dashboard projection renders
under `npm run dashboard:build`; full regression (~3,800 tests)
stays green.

**Size**: ~500 LOC (mostly verdict + projection).

### Phase totals

- **Commits**: 12 (across Z1a/b and Z5a/b splits).
- **LOC** (approx): ~4,500 (50% laws).
- **Session estimate**: 3–5 sessions single-agent; parallelizable
  across Z5a/Z5b and Z6/Z7 across agents.

### Sequencing dependencies

```
Z1 ─── Z2 ─── Z3 ─── Z4 ─── Z5 ─── Z6 ─── Z7 ─── Z8 ─── Z9 ─── Z10
 │      │                    │
 │      └── (Z2 adds tags needed from Z4 onward)
 │
 └── (Z1 types unblock everything downstream)
```

Linear by default. Z5a/Z5b can parallelize if two agents
collaborate (pure derivation pairs are independent). Z8/Z9 are
CLI layers and both depend on the full pipeline; they land
sequentially.

## 8. Grammar + Wire Formats

### 8.1 Hypothesis YAML (authored)

```yaml
# workshop/compounding/ledger/<uuid>.hypothesis.yaml
hypothesis: <uuid-v4>
schemaVersion: 1

description: |
  One sentence on why this hypothesis exists + what success looks
  like. Cosmetic; excluded from the fingerprint.

cohort:
  kind: probe-surface                          # or 'scenario-trajectory'
  cohort:
    verb: interact
    facet-kind: element
    error-family: not-visible
  # For scenario-trajectory variant:
  # kind: scenario-trajectory
  # scenarioId: form-success-recovery
  # topologyId: login-form

prediction:
  kind: confirmation-rate                      # or receipt-family-shift,
                                               # coverage-growth,
                                               # regression-freedom
  atLeast: 0.95
  overCycles: 3

requiredConsecutiveConfirmations: 3
supersedes: null                               # or <earlier-hypothesis-id>

author: "commit:abcd1234 / Alice"
createdAt: "2026-04-22T10:00:00.000Z"
```

### 8.2 HypothesisReceipt JSON (emitted, JSONL)

```json
{
  "version": 1,
  "stage": "evidence",
  "scope": "hypothesis",
  "kind": "hypothesis-receipt",
  "ids": {},
  "fingerprints": {
    "artifact": "sha256:...",
    "content": "sha256:..."
  },
  "lineage": {
    "sources": ["hypothesis:<uuid>"],
    "parents": ["sha256:probe-receipt-fp-1", "sha256:probe-receipt-fp-2"],
    "handshakes": ["evidence"]
  },
  "governance": "approved",
  "payload": {
    "hypothesisId": "<uuid>",
    "hypothesisFingerprint": "sha256:...",
    "outcome": "confirmed",
    "evidenceReceiptIds": ["sha256:...", "sha256:..."],
    "confirmedCount": 9,
    "refutedCount": 1,
    "inconclusiveCount": 0,
    "cycleRate": 0.9,
    "provenance": {
      "substrateVersion": "1.0.0",
      "manifestVersion": 1,
      "computedAt": "2026-04-22T10:05:00.000Z"
    }
  }
}
```

### 8.3 Ratchet JSON (emitted, JSONL)

```json
{
  "id": "ratchet:form-success-recovery",
  "scenarioId": "form-success-recovery",
  "firstPassedAt": "2026-04-22T10:00:00.000Z",
  "firstPassedFingerprint": "sha256:..."
}
```

### 8.4 CompoundingScoreboard JSON (snapshot)

```json
{
  "generatedAt": "2026-04-22T12:00:00.000Z",
  "probeCoverageRatio": 1.0,
  "scenarioPassRatio": 1.0,
  "trajectories": [
    {
      "cohortId": "probe:interact|facet-kind:element|error-family:not-visible",
      "entries": [
        { "timestamp": "2026-04-22T11:00:00.000Z", "sampleSize": 10, "confirmedCount": 9, "refutedCount": 1, "rate": 0.9, "substrateVersion": "1.0.0" }
      ]
    }
  ],
  "activeRatchetCount": 4,
  "brokenRatchetCount": 0,
  "graduation": {
    "state": "not-yet",
    "missingConditions": ["hypothesis-confirmation-rate-sustained"],
    "conditions": [
      { "name": "probe-coverage-is-100", "held": true, "detail": "34/34 probes" },
      { "name": "scenario-corpus-all-passes", "held": true, "detail": "4/4 scenarios" },
      { "name": "hypothesis-confirmation-rate-sustained", "held": false, "detail": "rolling rate 0.9; needs ≥ 0.95 over 3 cycles" },
      { "name": "no-ratchet-regressions", "held": true, "detail": "0 breaks" }
    ]
  },
  "gaps": {
    "probeGaps": [],
    "scenarioGaps": [{ "topologyId": "paginated-grid", "uncoveredInvariants": ["form-state-preserved-on-navigation"] }],
    "generatedAt": "2026-04-22T12:00:00.000Z"
  },
  "lastRegression": null,
  "substrateVersion": "1.0.0"
}
```

### 8.5 Log layout

```
workshop/logs/
  hypotheses/
    <uuid>.hypothesis.yaml            # one file per authored hypothesis
  hypothesis-receipts/
    YYYY-MM.jsonl                     # one JSON object per line; monthly rotation
  ratchets/
    YYYY-MM.jsonl                     # append-only
  scoreboard-snapshots/
    YYYY-MM-DD-HHMMSS.scoreboard.json # one per computeScoreboard invocation
  probe-receipts/                     # (existing)
    YYYY-MM.jsonl
  scenario-receipts/                  # (existing)
    YYYY-MM.jsonl
```

### 8.6 Fingerprint input recipes

**`scenarioFingerprint(s)`** already excludes cosmetic fields
(description, step names) per the S1 plan. **Same discipline** for
hypotheses:

```ts
hypothesisKeyableShape(h) = {
  id, schemaVersion, cohort, prediction,
  requiredConsecutiveConfirmations, supersedes,
  // excluded: description, author, createdAt
};
```

**`hypothesisReceiptFingerprint(r)`** covers the payload minus
wall-clock timing (per SC15 pattern):

```ts
receiptKeyableShape(r) = {
  hypothesisId, hypothesisFingerprint, outcome,
  evidenceReceiptIds, confirmedCount, refutedCount,
  inconclusiveCount, cycleRate,
  provenance: { substrateVersion, manifestVersion },
  // excluded: computedAt
};
```

### 8.7 Forward-compatibility clauses

- Receipts with no `hypothesisId` field continue to parse (optional).
- Hypotheses with unknown top-level fields emit a warning and load
  with the unknown field dropped.
- Scoreboard snapshot schema bumps via a `schemaVersion` field
  (missing → assumed 1).

## 9. Laws per Phase

Laws pin invariants; every phase seals a named set. ZC-laws extend
the S1–S9 ledger (SC1..SC32) with `ZC1..ZCn`.

### 9.1 Domain laws (Z1)

**ZC1** (Hypothesis key stability): `hypothesisKeyableShape`
excludes `description`, `author`, `createdAt`. Same hypothesis with
different cosmetic fields → same keyable shape.

**ZC2** (Prediction closed union): `foldPrediction` routes every
kind. Typecheck enforces exhaustiveness.

**ZC3** (Cohort key derivation): `cohortKey(c)` is deterministic;
two Cohorts of the same kind + same underlying fields produce
identical keys. Different kinds produce differently-prefixed keys.

**ZC4** (HypothesisReceipt envelope): emitted receipts have
`version=1`, `stage='evidence'`, `scope='hypothesis'`,
`kind='hypothesis-receipt'`, `governance='approved'`.

**ZC5** (ConfirmationOutcome fold): `foldConfirmationOutcome`
exhaustive.

**ZC6** (GraduationGate state fold): `foldGraduationGateState`
exhaustive.

**ZC7** (rollingRate correctness): known trajectory → known rate;
empty trajectory → null; denominator 0 → null.

**ZC8** (TrajectoryEntry immutability): adding an entry to a
Trajectory returns a new Trajectory; original unchanged.

**ZC9** (CompoundingError fold): `foldCompoundingError` exhaustive
over 4 variants.

**ZC9.b** (Domain purity — filesystem walk): no file under
`workshop/compounding/domain/` imports `'effect'`. Same pattern
as SC6.

### 9.2 Fingerprint + ports (Z2)

**ZC10** (Fingerprint stability + cosmetic exclusion):
- Same hypothesis → same fingerprint across calls.
- Cosmetic field change (description) → same fingerprint.
- Substantive field change (prediction.atLeast) → different
  fingerprint.

### 9.3 Receipt tag (Z3)

**ZC11** (hypothesisId round-trip): a ProbeReceipt built with
`hypothesisId: '<uuid>'` serializes and deserializes with the
field preserved; absence round-trips as absence (not as null).

### 9.4 In-memory services (Z4)

**ZC12** (append idempotent on re-append): `ledger.append(h)`
twice produces exactly one entry (dedup on id).

**ZC13** (findById round-trip): append(h) → findById(h.id)
returns h (structurally).

**ZC14** (findByCohort filters): append two hypotheses with
distinct cohorts; findByCohort on each returns only the matching
hypothesis.

### 9.5 Pure derivations (Z5)

**ZC15** (filter-evidence correctness): `filterEvidenceForHypothesis`
returns only receipts whose `payload.hypothesisId` matches.

**ZC16–ZC19** (confirmation per Prediction kind): one law per kind:
- `confirmation-rate`: given 10 receipts, 9 confirming → rate 0.9;
  if `atLeast 0.9 overCycles 1` → confirmed; if 0.95 → refuted.
- `receipt-family-shift`: from='not-visible' to='matched';
  evidence has ≥1 matching transition → confirmed; else refuted.
- `coverage-growth`: fromRatio 0.5 → toRatio 0.9; sampleCount
  grows 5→9 → confirmed; stays 5 → refuted.
- `regression-freedom`: all listed receipt ids pass in evidence →
  confirmed; any fails → refuted.

**ZC20** (computeTrajectories groups by cohort): 3 receipts across
2 cohorts → Trajectory map with 2 entries.

**ZC21** (regression diff correctness): old pass set + new fail
set → RegressionReport.newlyFailing correct; same for
newlyPassing.

**ZC22** (ratchet break detection): ratchet's
firstPassedFingerprint present in old pass set but absent in new
pass set → RatchetBreakDetail.

**ZC23** (graduation conditions hold order): graduation returns
`holds` only when all four conditions hold; otherwise lists
missing conditions in stable order.

**ZC24** (gap analysis): manifest has 9 verbs × 4 facet-kinds ×
5 error-families = 180 cells; receipts cover N → gaps.probeGaps.length
= 180 - N.

### 9.6 Filesystem services (Z6)

**ZC25** (integration): vitest with a tempdir:
1. Append 1 hypothesis to the filesystem ledger.
2. Append 2 probe receipts tagged with it.
3. Run computeScoreboard.
4. Assert: one hypothesis receipt emitted; trajectory has 1 cohort
   with 1 entry; graduation state `not-yet` with appropriate
   missingConditions.

### 9.7 Snapshot + regression (Z7)

**ZC26** (snapshot round-trip): writing a snapshot then reading
via `readMostRecentSnapshot` returns the same JSON.

**ZC27** (regression detection across snapshots): snapshot A has
pass-list [r1, r2]; current receipts have [r1 failing]; regression
report names r1 in newlyFailing AND ratchetBreaks (if r1 is a
ratchet).

### 9.8 CLI surface (Z8)

**ZC28** (exit discipline): `tesseract compounding scoreboard`
exits 0 on success; `tesseract compounding improve` exits 0 if
no regressions, 1 if ratchet breaks present.

### 9.9 Ratchet + hypothesis authoring (Z9)

**ZC29** (ratchet authoring requires pass): `tesseract compounding
ratchet <scenario-id>` against a currently-failing scenario exits
1 with a clear error; against a currently-passing scenario appends
a Ratchet entry successfully.

**ZC30** (hypothesis authoring writes to ledger): `tesseract
compounding hypothesize --cohort ... --prediction ...` appends a
Hypothesis to `workshop/logs/hypotheses/` with a valid uuid id
and timestamp.

### 9.10 Verdict + dashboard (Z10)

**ZC31** (end-to-end smoke): the verdict-09 smoke test:
1. Author 3 hypotheses (three different prediction kinds).
2. Run a probe spike + scenario corpus cycle (emits receipts).
3. Compute scoreboard.
4. Assert: graduation state is `not-yet` (at first run;
   confirmation rate hasn't sustained); exactly 3 hypothesis
   receipts; scoreboard snapshot written.

**ZC32** (dashboard projection): projection reads the latest
snapshot + renders it; unit test verifies the projection's input
shape matches `CompoundingScoreboard`.

### 9.11 Law summary

- Total new laws: ~32 (ZC1 through ZC32).
- Combined with SC1–SC32 (scenarios) and S1–S9 (probe IR), the
  full law ledger is ~80+ laws covering every phase.
- Every phase's commit message lists the ZC-laws it seals.
- An architecture-style test greps verdict-09 for the ZC-IDs to
  ensure the ledger stays complete.

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Hypothesis log grows unbounded as the system runs for months | Medium | Low | Append-only discipline is intentional; log size is bounded by authoring rate (humans author hypotheses; LLMs don't). Pruning policy deferred until log exceeds ~1k entries. Read-path performance dominated by receipt log size, not hypothesis count. |
| R2 | Confirmation rate computation becomes quadratic as receipts accumulate | High | High | Z7 snapshot store caches per-cycle scoreboards. Per-cycle cost is `O(H + ΔR)` where ΔR is new receipts since last snapshot, not total receipts. Regression laws (ZC26) pin the invariant. |
| R3 | Hypothesis supersedes chain forms a cycle (A supersedes B supersedes A) | Low | Medium | Z1 domain law ZC1 requires `supersedes` to reference an existing earlier-createdAt hypothesis; cycle detection runs at authoring time. If the law's later check is expensive, scope it to authoring CLI (not ledger read). |
| R4 | Prediction kinds under-model real hypotheses operators want to author | Medium | High | Union is closed and versioned (`schemaVersion: 1`). Adding a new kind (e.g., `latency-budget`) bumps to schemaVersion: 2 and requires a tagged migration. Seed with the 4 kinds forecast likely to cover most early hypotheses; revisit at Z10 verdict. |
| R5 | Ratchet proliferation — every scenario gets ratcheted, corpus becomes brittle | Medium | Medium | `tesseract compounding ratchet` is operator-invoked only (not auto). Intent is "customer incident lockdown" — one ratchet per incident. Ratchets are also append-only; a retired ratchet goes into a separate `ratchets-retired/` log (noted in Z9). |
| R6 | Graduation gate fires spuriously (all four conditions true on a lucky day) | Low | High | `hypothesis-confirmation-rate-sustained` requires N consecutive cycles above floor (default N=5). The sustain window catches transient spikes. The floor is authored in `workshop/policy/trust-policy.yaml`, not hardcoded. |
| R7 | ReceiptStore + HypothesisLedger composition creates circular imports | Low | Medium | Both services have `Context.Tag` identities declared in `workshop/compounding/application/*-port.ts`; consumers import the Tag, not the adapter. Filesystem adapters in `workshop/compounding/harness/` depend on domain, not on each other. Architecture law (domain-purity walk, ZC9.b) catches direct filesystem imports in domain. |
| R8 | Scoreboard snapshot growth outpaces available disk | Low | Low | Snapshots are small JSON (~5–20 KB each); 1 snapshot per cycle; ~365 cycles/year at daily cadence → ~5 MB/year. Rotation policy (keep-last-N) is a one-liner in the harness; default N=365. |
| R9 | `rollingRate` off-by-one or misaligned window | Medium | Medium | Z5 law ZC7 pins rolling-window behavior: window of 10 with 12 entries returns rate of last 10; window of 10 with 3 entries returns rate of 3. Boundary cases are exhaustively tested. |
| R10 | Hypothesis fingerprint drift on cosmetic edits (description wording) | Low | High | Z2 law ZC10 pins the fingerprint input to substantive fields only (cohort, prediction, supersedes, schemaVersion). Description + author string excluded. Mirror of the scenario-fingerprint discipline (SC14). |
| R11 | Cross-platform timestamp ordering (ISO-8601 vs monotonic clock) | Low | Medium | Hypotheses and receipts carry ISO-8601 timestamps; sort by `createdAt` string comparison (lexicographic == chronological for ISO-8601). If clock skew becomes a concern, add a monotonic counter. Deferred unless real skew observed. |
| R12 | Effect `Context.Tag` service identity confusion between ledger + store | Low | Low | Distinct `Context.Tag<"HypothesisLedger", ...>()` and `Context.Tag<"ReceiptStore", ...>()` identities. Layer composition uses `Layer.succeed(HypothesisLedger, ...)` and `Layer.succeed(ReceiptStore, ...)` explicitly. A composition law walks the CLI layer for presence of both. |
| R13 | Improvement CLI (`tesseract compounding improve`) wait-and-reveal UX is slow | Medium | Low | CLI is fast-in, fast-out — runs the receipt cycle, computes the scoreboard, prints a one-page verdict. No long-running daemon. If cycle takes longer than ~10s, Z7 snapshot hit-rate is failing; investigate. |
| R14 | Hypothesis receipt schema change breaks historical receipts | Medium | High | Every `HypothesisReceipt` carries `schemaVersion: 1`. Schema evolution follows the same pattern as `ScenarioReceipt` (cf. §8.2 of the scenario plan). Migrations are tagged and additive. |
| R15 | Parallel cycle execution races against append-only log | Low | High | The CLI's orchestration is single-process today; Z6 harness appends via atomic temp-rename; multiple concurrent cycles would serialize on FS locks. If parallel cycles ever ship, investigate append coordination (log-per-cycle rather than single log). |

## 11. Open Questions

These resolve at first real use — deliberately NOT answered up
front. Each has a default; real data overrides the default.

### Q1 — Auto-authoring hypotheses from scoreboard deltas

Should the system auto-generate hypotheses when it notices a
coverage cliff or regression? E.g., "confirmation rate dropped 20%
— hypothesize the last pattern write caused it." Appealing but
risks hypothesis inflation; hypotheses should be intentional, not
reactive. Default: operator-authored only; reactive suggestions
surface as `InterventionHandoff` candidates, not hypotheses.

### Q2 — Hypothesis retirement vs supersession

When a hypothesis is superseded, does the original stay in the
confirmation computation (historical backing) or drop out (only
current hypotheses contribute to the gate)? Default: drop out;
only the latest supersession participant is "live". Original
stays in the log as a historical record. Revisit if operators
want to see confirmation trajectories that span a supersession.

### Q3 — Per-cohort vs aggregate confirmation rate

Should the graduation gate's `hypothesis-confirmation-rate-
sustained` apply across all hypotheses (aggregate) or per-cohort
(probe-surface / scenario-trajectory separately)? Default:
aggregate. If a cohort underperforms consistently, we see it via
per-cohort scoreboard rows, but gate is one number. Revisit when
cohort-specific gates become valuable.

### Q4 — Hypothesis voting / multi-author

Workshop is single-author today. If multi-author, hypothesis
records carry a single `author` string; collisions on authoring
IDs are rare. No multi-vote mechanism planned. Deferred until
multi-author use case surfaces.

### Q5 — Ratchet expiry / retirement path

Can a ratchet be retired when the scenario is deprecated? Default:
yes, via `tesseract compounding ratchet retire <scenario-id>`,
which appends a retirement entry to a separate log (active +
retired ratchets both append-only). Active set is `active minus
retired` computed on read. Deferred unless ratchets need retiring
before Z10.

### Q6 — Scoreboard output format versioning

The CLI's `compounding scoreboard` emits JSON. Should we version
the output schema explicitly (`output.schemaVersion: 1`) so
downstream consumers can pin? Default: yes, include
`schemaVersion: 1` in the top-level scoreboard JSON. Mirror of
the pattern already used for receipts.

### Q7 — Cost accounting in scoreboard

ReasoningReceipts carry `tokens` + `latencyMs`. Should the
compounding scoreboard surface aggregate cost for each
hypothesis (tokens consumed while the hypothesis was live)?
Useful for cost-aware trust policy. Default: not in Z10;
add a `cost-efficiency` prediction kind later if needed.

### Q8 — Graduation artifact persistence

Verdict-09 names the graduation state. When graduation state
transitions from `not-yet` to `graduated`, should we emit a
formal event (e.g., write a dated graduation record under
`workshop/observations/graduations/`)? Default: yes, one
graduation record per transition with the four gate states at
time of transition. One-way — graduation is a milestone, not a
toggle.

### Q9 — Dashboard refresh cadence

The dashboard projection is on-read (pull). Should a daemon
pre-compute it on every cycle (push)? Default: on-read; the
scoreboard is small enough that pre-computation buys little.
Revisit if dashboard users see latency.

### Q10 — Hypothesis ID format

`HypothesisId` is a branded string. UUIDv4 is the default
generator in the CLI. Should it be content-addressed (hash of
cohort + prediction)? Content-addressing makes identical
hypotheses collide (which may be right — if two operators author
the same hypothesis, maybe it's the same hypothesis). Default:
UUIDv4; revisit if duplicate authoring becomes a pattern.

## 12. Success Criteria (Done Definition)

The compounding engine work is *complete* when:

1. **Domain types land** (Z1–Z2): ~10 laws green; zero Effect
   imports in `workshop/compounding/domain/`; Fingerprint<Tag>
   registry carries `'hypothesis'` + `'hypothesis-receipt'`.
2. **Ports declared** (Z2): `HypothesisLedger` +
   `ReceiptStore` Context.Tag services exist; both have
   in-memory adapters under test.
3. **Hypothesis tagging round-trips** (Z3): ProbeReceipt carries
   `hypothesisId: HypothesisId | null`; existing receipts with
   null tags continue to verify under probe-spike.
4. **Pure derivations compose** (Z5): `filterEvidence`,
   `evaluateHypothesis`, `buildTrajectories`, `analyzeGaps`,
   `computeGraduationGate` — all pure functions, all sealed by
   laws ZC15–ZC24.
5. **Filesystem harness parity** (Z6): log-appending adapters
   work identically to in-memory adapters (tempdir integration
   law ZC25).
6. **Snapshot + regression caching** (Z7): per-cycle cost stays
   `O(ΔR)` not `O(R)`; regression law ZC27 catches ratchet
   breaks across snapshots.
7. **CLI surface live** (Z8): `tesseract compounding
   scoreboard`, `tesseract compounding improve`, `tesseract
   compounding hypothesize`, `tesseract compounding ratchet` —
   all four exit-disciplined per ZC28.
8. **Ratchet + hypothesis authoring operational** (Z9): operator
   can author a hypothesis and lock a scenario; laws ZC29 +
   ZC30 green.
9. **Verdict-09 graduation artifact** (Z10): smoke test runs
   a full compounding cycle; dashboard projection reads latest
   snapshot; verdict-09 lists every ZC-law sealed.
10. **Full regression passes**: ~3700+ prior tests + ~80 total
    SC+ZC laws all green; build clean; seam laws hold; manifest
    unchanged.

### Anti-goals (if we hit these, we went off-path)

- **`product/` touched**. The compounding engine is 100%
  workshop-side. Any new allowlist entry in the seam test is a
  red flag — investigate before merging.
- **Hypothesis becomes mutable**. If `Hypothesis` gains an
  `updatedAt` field, or any in-place write touches the ledger
  log, we've lost append-only discipline.
- **Graduation gate becomes a runtime toggle**. The four gate
  conditions are *computed* from evidence; they are not
  operator-settable flags. If operators can "force graduate",
  the invariant breaks.
- **Confirmation rate becomes an average over all time**. It's a
  *sustained* rolling window — the point is to detect recent
  drift, not historical flattening.
- **Ratchets auto-created**. Only operator-invoked via the CLI.
  Auto-ratcheting breaks the customer-incident authorial
  intent.
- **Per-step quadratic complexity**. Per-cycle cost scales with
  new receipts since last snapshot, not total receipts ever
  emitted. Z7 is load-bearing; if it slips, Z8/Z9/Z10 reveal
  the quadratic surprise.
- **Cross-log coupling**. Hypothesis log, hypothesis-receipt
  log, ratchet log, and scoreboard-snapshot log are all
  independent append streams. They join on `hypothesisId` /
  `scenarioId` at read time, not write time.

### The graduation artifact

At Z10 completion, `workshop/observations/probe-spike-verdict-
09.md` records:

- Which hypotheses the ledger carries at graduation-compute time.
- Each `GraduationGate` condition's state (satisfied/unsatisfied/
  insufficient-evidence) with the latest scoreboard snapshot
  reference.
- The ZC-law ledger (ZC1–ZC32, all green).
- Combined phase-law ledger across probe IR + scenarios +
  compounding (S1–S9, SC1–SC32, ZC1–ZC32).
- The open questions that became live during execution.
- A pointer to the first graduation-state-transition record (if
  graduation actually fires during the verdict cycle).

The naming convention (`probe-spike-verdict-N.md`) continues —
compounding engine is the scenario corpus's successor
trajectory. Verdict-09 is authored after Z10 smoke passes. The
document closes the `probe-spike-verdict-*` numbering sequence
for this reshape; future compounding-relevant verdicts can
either continue the sequence or branch to a
`compounding-cycle-N.md` convention (deferred).

## Appendix A — Phase Dependency Graph

```
                ┌──────────────────┐
                │ Z1: domain       │
                │  primitives      │
                │  (Hypothesis,    │
                │   Prediction,    │
                │   Cohort, etc.)  │
                └────────┬─────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
     ┌────────▼─────────┐ ┌─────────▼────────┐
     │ Z2: ports +      │ │ Z3: ProbeReceipt │
     │  fingerprints    │ │  hypothesisId    │
     │  (HypothesisLdg, │ │  tagging         │
     │   ReceiptStore)  │ │                  │
     └────────┬─────────┘ └─────────┬────────┘
              │                     │
              └──────────┬──────────┘
                         │
                ┌────────▼─────────┐
                │ Z4: in-memory    │
                │  adapters        │
                │  (test doubles)  │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z5: pure         │
                │  derivations     │
                │  (filter,        │
                │   evaluate,      │
                │   trajectories,  │
                │   graduate, gap) │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z6: filesystem   │
                │  adapters        │
                │  (log-writing    │
                │   harness)       │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z7: snapshots +  │
                │  regression      │
                │  cache (O(ΔR))   │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z8: improvement  │
                │  CLI (4 verbs)   │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z9: ratchet +    │
                │  hypothesis     │
                │  authoring       │
                │  surfaces        │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ Z10: verdict-09  │
                │  + dashboard     │
                │  projection      │
                └────────┬─────────┘
                         │
                ┌────────▼─────────┐
                │ verdict-09       │
                │  (graduation     │
                │   artifact)      │
                └──────────────────┘
```

Cross-plan dependency: the compounding engine sits above the
probe IR + scenario corpus. It consumes their receipts; it does
not modify them (except for the one additive `hypothesisId`
field on ProbeReceipt added at Z3). The stacked trajectory:

```
┌────────────────────────────────────────────┐
│ probe IR spike   (S1–S9 → verdict-01..07) │
└─────────────────────────┬──────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────┐
│ scenario corpus  (S1–S9 → verdict-08)      │
└─────────────────────────┬──────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────┐
│ compounding engine (Z1–Z10 → verdict-09)   │
└────────────────────────────────────────────┘
```

## Appendix B — Pointers

- Forecast (what + why): forthcoming `docs/v2-compounding-
  engine-forecast.md` (authored alongside Z1 as operator-facing
  preamble).
- Probe IR spike parent: `docs/v2-probe-ir-spike.md`.
- Scenario corpus predecessor plan: `docs/v2-scenario-corpus-
  plan.md`.
- Scenario corpus forecast: `docs/v2-scenario-corpus-
  forecast.md`.
- Coding discipline: `docs/coding-notes.md` (FP + Effect + DDD).
- Substrate primitives: `workshop/substrate/`.
- Probe IR primitives: `workshop/probe-derivation/`.
- Scenario corpus primitives: `workshop/scenarios/`.
- Compounding engine primitives (target paths):
  - Domain: `workshop/compounding/domain/`
  - Application: `workshop/compounding/application/`
  - Harness: `workshop/compounding/harness/`
  - Composition: `workshop/compounding/composition/`
  - CLI: `workshop/cli/commands/compounding-*.ts`
- Prior verdicts: `workshop/observations/probe-spike-verdict-
  {01..08}.md`.
- Graduation target: `workshop/observations/probe-spike-
  verdict-09.md` (authored at Z10).
- Log locations:
  - Hypotheses: `workshop/logs/hypotheses/*.json`
  - Hypothesis receipts: `workshop/logs/hypothesis-receipts/
    *.json`
  - Ratchets: `workshop/logs/ratchets/*.json`
  - Scoreboard snapshots: `workshop/logs/scoreboard-
    snapshots/*.json`
- Trust policy (graduation thresholds read at runtime):
  `workshop/policy/trust-policy.yaml`.
- This plan lives here as the authoritative "how" document;
  cross-reference from verdict-09 when it lands.


