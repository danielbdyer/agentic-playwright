# Executed-Test Cohort Plan (Step 11 Z11b)

> Status: planning — Step 11 Z11b. Architectural design doc;
> no code has landed. Companion to
> `docs/v2-compounding-engine-plan.md`,
> `docs/v2-substrate-study-plan.md`, and
> `docs/v2-live-adapter-plan.md`. Orthogonal to Z11d and Z11f;
> can be implemented in parallel with either.

## 0. The verdict in one sentence

**Add a third cohort to the compounding engine — `executed-test`
— measuring post-compile spec quality (pass / flake / fail over
N repetitions), turning the scoreboard into a complete
three-outcome quality surface and unlocking the `stability-rate`
prediction kind.**

## 1. Purpose and Scope

### 1.1 What this slice delivers

1. **`executed-test` cohort kind** added to the `Cohort` closed
   union in `workshop/compounding/domain/cohort.ts`. Discriminates
   per `{ specId, substrateVersion }`.

2. **`stability-rate` prediction kind** — new variant of
   `Prediction`. Parameters: `passRate: number` (0..1),
   `flakeRateCap: number` (0..1), `overRepetitions: number`
   (integer ≥ 2), `overCycles: number`.

3. **`ExecutionReceipt` envelope** — new type under
   `workshop/compounding/domain/execution-receipt.ts`. Mirrors
   CompilationReceipt's shape. Carries `{ specId, verdict,
   retryCount, durationMs, failingAssertion?, substrateVersion }`.

4. **`tesseract test-execute --emit-compounding-receipt` CLI** —
   wraps `npm run test:generated`, runs the suite N times
   (default 3), aggregates per-spec verdicts into Executions.

5. **`stability-rate` evaluator** added to
   `confirmation-judgments.ts`. Judges whether
   `passRate ≥ atLeast AND flakeRate ≤ flakeRateCap` sustained
   over `overCycles`.

6. **ReceiptStore widening** — two new port methods
   (`executionReceiptsForHypothesis`, `latestExecutionReceipts`);
   filesystem + in-memory adapters updated.

### 1.2 What this slice does NOT deliver

- **Real customer-SUT test execution.** Z11b runs the
  generated-spec suite against the synthetic-app substrate (as
  today). Real-SUT execution is a customer-deployment
  concern.
- **New test infrastructure.** `npm run test:generated` already
  runs; Z11b wraps it, aggregates results, emits receipts.
- **Retry logic for flake-recovery.** We measure flake; we don't
  try to reduce it. Matchers + pattern-ladder improvements
  reduce flake downstream.
- **Per-spec diagnostic receipts.** Z11b aggregates pass/fail
  verdicts; failure-class attribution (e.g., timing vs
  selector-ambiguity vs assertion) is future work.
- **Cross-browser matrix.** Single-browser today (whatever
  `npm run test:generated` runs). Matrix expansion is a
  separate epic.

### 1.3 Guiding principles

- **Follow the Z11a template.** Domain types + pure evaluator +
  CLI wrapper + receipt emitter + ReceiptStore widening +
  laws. Same shape that landed cleanly three times.
- **Aggregate at the Playwright-reporter layer.** Don't re-run
  specs from a custom harness; hook into Playwright's existing
  reporter output (already wired at
  `product/instruments/reporting/tesseract-reporter.ts`).
- **Flake detection via repetition.** A spec that passes then
  fails within the same run is a flake; a spec that fails all
  N runs is a fail; a spec that passes all N is a pass. No
  "sometimes-flaky, sometimes-broken" middle category.
- **No `product/` imports from workshop/compounding/.** Seam
  discipline unchanged.

### 1.4 Success in one line

**By end-of-Z11b: `tesseract test-execute --emit-compounding-
receipt` runs the generated-spec suite 3 times, emits one
ExecutionReceipt per spec with a verdict of pass/flake/fail,
and the compounding engine evaluates `stability-rate`
hypotheses against the receipts, producing trajectories on the
new executed-test cohort.**

## 2. Ubiquitous Language

- **Execution**: one `npm run test:generated` invocation. Runs
  the full suite once.
- **Execution batch**: N executions of the same suite (default
  N=3). Aggregates to per-spec verdicts.
- **Spec**: one `.spec.ts` file under
  `product/generated/{suite}/`.
- **Per-spec verdict**: closed enum `'pass' | 'flake' | 'fail'`.
  - `pass`: ≥ N-1 of N runs pass.
  - `flake`: at least one pass and at least one fail across N runs.
  - `fail`: ≥ N-1 of N runs fail.
  Edge case N=2 with 1 pass + 1 fail → `flake`.
- **SpecId**: stable identifier per `.spec.ts` file.
  Content-addressed by file path + contentHash.
- **Stability rate**: `passCount / totalCount` across a cycle's
  ExecutionReceipts. Equivalent to confirmation-rate for this
  cohort but with `flake` tallied separately.
- **Flake rate**: `flakeCount / totalCount`. Tracked as a
  separate floor alongside stability rate.
- **`executed-test` cohort**: groups receipts by
  `(specId, substrateVersion)`. SubstrateVersion change →
  new cohort (expected; different SUT version measures
  differently).

## 3. Invariants

### 3.1 I-Verdict (Closed Verdict Enum)

**Per-spec verdicts are exactly three: `'pass' | 'flake' |
'fail'`.** No 'skipped' (generated specs don't skip), no
'unknown' (we always aggregate). Widening requires a law update.

### 3.2 I-Batch (N Runs Define a Batch)

**An execution batch is N contiguous runs of the same suite
against the same substrate version.** N is the smallest integer
≥ 2; the default is 3. Batches with N=1 are not emitted as
ExecutionReceipts (no flake-detection possible).

### 3.3 I-Deterministic-Aggregation

**Per-spec verdict aggregation is a pure function over the
N-run results.** Given the same (spec-id, N-pass-counts), the
verdict is byte-identical. A law pins this on fixture
inputs.

### 3.4 I-Append

**ExecutionReceipts are append-only.** Same discipline as
CompilationReceipts. File path:
`workshop/logs/execution-receipts/<ts>-<specId>-<fp>.json`.

### 3.5 I-Seam

**Zero new `ALWAYS_ALLOWED_PRODUCT_PATHS` entries.** Playwright
reporter already at `product/instruments/tooling/` is in the
allowlist. ExecutionReceipt emitter lives in
`workshop/compounding/emission/`.

## 4. Domain Model

Pure types under `workshop/compounding/domain/`.

### 4.1 Cohort + prediction widening

```typescript
// workshop/compounding/domain/cohort.ts — delta

export interface ExecutedTestCohort {
  readonly kind: 'executed-test';
  readonly specId: string;
  readonly substrateVersion: string;
}

export type Cohort =
  | ProbeSurfaceCohortRef
  | ScenarioTrajectoryCohort
  | CustomerCompilationCohort
  | ExecutedTestCohort;        // NEW

// cohortKey extension:
//   executed-test → `executed-test:spec:<specId>|substrate:<version>`
//
// foldCohort gains an `executedTest` case.
```

```typescript
// workshop/compounding/domain/prediction.ts — delta

export interface StabilityRatePrediction {
  readonly kind: 'stability-rate';
  readonly atLeast: number;           // passRate floor, 0..1
  readonly flakeRateCap: number;      // flakeRate ceiling, 0..1
  readonly overRepetitions: number;   // N in the batch, integer ≥ 2
  readonly overCycles: number;        // sustained window, integer ≥ 1
}

export type Prediction =
  | ConfirmationRatePrediction
  | ReceiptFamilyShiftPrediction
  | CoverageGrowthPrediction
  | RegressionFreedomPrediction
  | InterventionFidelityPrediction
  | StabilityRatePrediction;          // NEW

// foldPrediction gains a `stabilityRate` case.
```

### 4.2 ExecutionReceipt shape

```typescript
// workshop/compounding/domain/execution-receipt.ts

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';

export type ExecutionVerdict = 'pass' | 'flake' | 'fail';

export interface ExecutionReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'execution-receipt';
  readonly scope: 'execution';        // NEW scope (§5.1)
  readonly payload: ExecutionReceiptPayload;
}

export interface ExecutionReceiptPayload {
  readonly hypothesisId: string | null;
  readonly specId: string;
  readonly substrateVersion: string;
  readonly verdict: ExecutionVerdict;

  // Aggregated across the batch
  readonly totalRuns: number;              // N
  readonly passCount: number;
  readonly failCount: number;
  readonly retryCount: number;             // sum of Playwright retries across runs
  readonly averageDurationMs: number;

  // Failure attribution (when verdict !== 'pass')
  readonly dominantFailureClass: string | null;  // Playwright reporter's classification
  readonly representativeFailure: {
    readonly runIndex: number;
    readonly assertion: string | null;
    readonly error: string;
  } | null;

  readonly provenance: {
    readonly substrateVersion: string;
    readonly manifestVersion: number;
    readonly computedAt: string;
    readonly specContentFingerprint: Fingerprint<'content'>;
  };
}
```

### 4.3 Fingerprint-tag + WorkflowScope additions

```typescript
// product/domain/kernel/hash.ts — delta
export type FingerprintTag =
  | ... // existing
  | 'execution-receipt';               // NEW
```

```typescript
// product/domain/governance/workflow-types.ts — delta
export type WorkflowScope =
  | 'scenario' | 'step' | 'run' | 'suite' | 'workspace' | 'control'
  | 'hypothesis' | 'compilation' | 'execution';   // NEW: 'execution'
```

## 5. Effect Architecture

Minimal — most of the work is in the reporter integration +
aggregator, both of which are pure.

### 5.1 Ports + services

No new Context.Tag services. The existing `ReceiptStore` port
widens with two methods:

```typescript
// workshop/compounding/application/ports.ts — delta

export interface ReceiptStoreService {
  // ... existing methods
  readonly executionReceiptsForHypothesis: (
    id: HypothesisId,
  ) => Effect.Effect<readonly ExecutionReceiptLike[], CompoundingError, never>;
  readonly latestExecutionReceipts: () => Effect.Effect<readonly ExecutionReceiptLike[], CompoundingError, never>;
}

export interface ExecutionReceiptLike {
  readonly payload: {
    readonly hypothesisId: string | null;
    readonly specId: string;
    readonly substrateVersion: string;
    readonly verdict: 'pass' | 'flake' | 'fail';
    readonly totalRuns: number;
    readonly passCount: number;
    readonly failCount: number;
  };
  readonly fingerprints: { readonly artifact: string };
}
```

Both adapters (in-memory + filesystem) implement the new
methods identically to the CompilationReceipt pattern at
Z11a.6.

### 5.2 Top-level Effect program

```typescript
// workshop/compounding/emission/execute-test-batch.ts

export interface ExecuteTestBatchOptions {
  readonly rootDir: string;
  readonly suite: string;                  // e.g., 'generated'
  readonly repetitions: number;            // default 3
  readonly hypothesisId: string | null;
  readonly substrateVersion: string;
  readonly computedAt: Date;
}

export function executeTestBatch(
  options: ExecuteTestBatchOptions,
): Effect.Effect<readonly ExecutionReceipt[], CompoundingError, never> {
  // 1. Invoke `npm run test:generated` N times, capturing
  //    Playwright reporter output (JSON format).
  // 2. Per spec, aggregate the N run results into a verdict.
  // 3. Build one ExecutionReceipt per spec.
  // 4. Write to workshop/logs/execution-receipts/.
  // 5. Return the receipts.
}
```

### 5.3 Per-spec aggregator (pure)

```typescript
// workshop/compounding/domain/aggregate-spec-verdict.ts

export function aggregateSpecVerdict(
  runs: readonly { readonly passed: boolean; readonly retries: number; readonly durationMs: number }[],
): { verdict: ExecutionVerdict; passCount: number; failCount: number; retryTotal: number; avgDurationMs: number } {
  const total = runs.length;
  const passCount = runs.filter((r) => r.passed).length;
  const failCount = total - passCount;
  const verdict: ExecutionVerdict =
    passCount === total ? 'pass'
    : failCount === total ? 'fail'
    : 'flake';
  return {
    verdict,
    passCount,
    failCount,
    retryTotal: runs.reduce((a, r) => a + r.retries, 0),
    avgDurationMs: total === 0 ? 0 : runs.reduce((a, r) => a + r.durationMs, 0) / total,
  };
}
```

Pure; deterministic; one-line law test per edge case.

### 5.4 stability-rate evaluator

Added to `confirmation-judgments.ts`:

```typescript
function evaluateStabilityRate(
  prediction: Extract<Prediction, { kind: 'stability-rate' }>,
  evidence: HypothesisEvidence,
): Judgment {
  const evidenceIds = evidence.executionReceipts.map((r) => r.fingerprints.artifact);
  if (evidence.executionReceipts.length === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  const passCount = evidence.executionReceipts.filter((r) => r.payload.verdict === 'pass').length;
  const flakeCount = evidence.executionReceipts.filter((r) => r.payload.verdict === 'flake').length;
  const failCount = evidence.executionReceipts.filter((r) => r.payload.verdict === 'fail').length;
  const total = passCount + flakeCount + failCount;

  const passRate = passCount / total;
  const flakeRate = flakeCount / total;

  const outcome: ConfirmationOutcome =
    (passRate >= prediction.atLeast && flakeRate <= prediction.flakeRateCap)
      ? 'confirmed'
      : 'refuted';

  return {
    outcome,
    confirmedCount: passCount,
    refutedCount: failCount + flakeCount,
    inconclusiveCount: 0,
    cycleRate: passRate,
    evidenceReceiptIds: evidenceIds,
  };
}
```

`foldPrediction` dispatch gains `stabilityRate: (p) =>
evaluateStabilityRate(p, evidence)`.

`HypothesisEvidence` gains `executionReceipts` (same pattern as
Z11a.6's addition for compilationReceipts).

## 6. CLI Integration

### 6.1 New command

```
tesseract test-execute --suite <name> \
                       [--repetitions <n>] \
                       [--substrate-version <v>] \
                       [--hypothesis-id <id>] \
                       [--emit-compounding-receipt]
```

Defaults:
- `--suite`: `generated`
- `--repetitions`: 3
- `--substrate-version`: reads from synthetic-app SUBSTRATE_VERSION
  (or an env var override)
- `--hypothesis-id`: null
- `--emit-compounding-receipt`: must be explicit (follows Z10a
  pattern)

### 6.2 Registration

- `CommandName` union gains `'test-execute'`.
- `commandNames` array includes it.
- `workshop/cli/commands/test-execute.ts` implements the command
  following the Z11a.5 `compile-corpus` shape.
- `workshop/cli/commands/index.ts` registers.

### 6.3 Reporter integration

Playwright's JSON reporter produces a file per run. The
`--repetitions` loop:

```
for i in 1..N:
  npm run test:generated -- --reporter=json --output=runs/run-<i>.json
done
aggregate(runs/*.json) → receipts
```

Existing `product/instruments/reporting/tesseract-reporter.ts`
may need minor extension to emit per-spec retry + duration
fields (check before implementation; they may already be there).

## 7. Phasing

Four sub-commits following the Z11a template.

### 7.1 Z11b.a — Domain types + aggregator + laws

- Cohort + Prediction widenings.
- ExecutionReceipt envelope type.
- `aggregateSpecVerdict` pure function.
- `FingerprintTag` + `WorkflowScope` registry additions.
- **Laws (ZB1.*)**: fold exhaustiveness, verdict aggregation
  edge cases (N=2 flake tie, N=3 pass majority, etc.),
  envelope round-trip.

### 7.2 Z11b.b — ReceiptStore widening + evaluator

- `HypothesisEvidence` gains `executionReceipts`.
- `filter-evidence.ts` + `evaluate-hypothesis.ts` threads it
  through.
- `evaluateStabilityRate` in `confirmation-judgments.ts`.
- In-memory + filesystem adapters implement new port methods.
- `compute-scoreboard.ts` parallel fetch widens to include
  latestExecutionReceipts.
- **Laws (ZB2.*)**: evaluator over mixed verdicts; zero-evidence
  → inconclusive; adapter append + list round-trip.

### 7.3 Z11b.c — `tesseract test-execute` CLI + batch runner

- CLI command + registration.
- `executeTestBatch` Effect program.
- Receipt emitter writes to `workshop/logs/execution-receipts/`.
- Playwright reporter output parsing.
- **Laws (ZB3.*)**: CLI flag parse; batch runner with stubbed
  reporter output; receipt writes to correct path.

### 7.4 Z11b.d — Seed hypothesis + smoke integration

- Seed hypothesis fixture at
  `workshop/observations/fixtures/verdict-*-stability-hypothesis.json`.
- Smoke test: authoring + run + scoreboard produces a
  trajectory with a real cycleRate.
- Updates `graduate.ts` or a sibling script to optionally
  include test-execute in the drive-through.

### 7.5 Effort estimate

- Z11b.a: 1 day.
- Z11b.b: 1 day (ReceiptStore widening pattern is established).
- Z11b.c: 2 days (CLI + reporter integration + aggregation).
- Z11b.d: 0.5 days.

Total: **~4.5 days**.

## 8. Laws Per Phase — Detailed

### ZB1 (Domain + aggregator)

- ZB1.a — `foldCohort` exhaustively covers 4 variants.
- ZB1.b — `foldPrediction` exhaustively covers 6 variants.
- ZB1.c — `executed-test` cohortKey format:
  `'executed-test:spec:<id>|substrate:<version>'`.
- ZB1.d — `aggregateSpecVerdict` all-pass → 'pass'.
- ZB1.e — all-fail → 'fail'.
- ZB1.f — mixed → 'flake'.
- ZB1.g — N=2, 1-pass-1-fail → 'flake'.
- ZB1.h — N=3, 2-pass-1-fail → 'flake' (not 'pass'; strict
  "all runs must pass").
- ZB1.i — Empty input → 'fail' (no runs = no evidence of
  passing).
- ZB1.j — `ExecutionReceipt` envelope JSON round-trip.

### ZB2 (Evaluator + adapters)

- ZB2.a — stabilityRate evaluator: all-pass → confirmed.
- ZB2.b — all-fail → refuted.
- ZB2.c — mixed with flakeRate > cap → refuted.
- ZB2.d — mixed with passRate < atLeast → refuted.
- ZB2.e — empty receipts → inconclusive.
- ZB2.f — in-memory adapter append/list round-trip.
- ZB2.g — filesystem adapter append/list round-trip
  (tempdir).
- ZB2.h — compute-scoreboard picks up execution receipts
  alongside probe/scenario/compilation.

### ZB3 (CLI + batch runner)

- ZB3.a — CLI flags parse correctly.
- ZB3.b — `--repetitions` enforces ≥ 2.
- ZB3.c — batch runner with stubbed Playwright output produces
  expected receipts.
- ZB3.d — receipt filename format matches convention.
- ZB3.e — exit code 0 on success; non-zero on
  fatal/infra errors.

### ZB4 (Smoke)

- ZB4.a — hypothesis + batch + scoreboard produces a
  trajectory with expected cycleRate.
- ZB4.b — re-run reproduces identical receipts (under
  deterministic-adapter at least).

## 9. Open Questions

### Q1 — Flake-recovery retries

Playwright supports per-test retries. Should retries count
against flake rate or not?

**Default**: retries count as part of the run's verdict. If a
test passed on retry, the run is 'pass' but the `retryCount`
field captures this; operators can correlate high retry counts
with poor reliability.

### Q2 — substrateVersion capture

SUBSTRATE_VERSION stamp in the CompilationReceipt already
exists. The ExecutionReceipt uses the same source. When the
substrate evolves (e.g., new preset added), version bumps and
execution receipts land on a new cohort key. Drift-detection
is automatic via the cohort split.

### Q3 — Per-browser matrix

Chrome-only today via Playwright's default launcher. Adding
Firefox + WebKit would triple execution time. Deferred;
when needed, the substrateVersion can encode browser
(`1.0.0/chromium`, `1.0.0/firefox`) to keep cohorts clean.

### Q4 — CI integration

Running `tesseract test-execute --emit-compounding-receipt` on
every CI build could accumulate receipts rapidly. Policy:
manual invocation only; CI runs `npm run test:generated` as
normal. Periodic receipt-emitting runs are operator-triggered.

### Q5 — Failure classification

The `dominantFailureClass` field is a placeholder. Populating
it meaningfully requires the Playwright reporter to classify
failures. The existing tesseract-reporter at
`product/instruments/reporting/` does this for Playwright runs;
we reuse its classification. Deferred until first operator
need to slice by failure class.

## 10. Relationship to Other Slices

### 10.1 With Z11a (customer-compilation cohort)

Parallel lanes. Customer-compilation measures compile-time
resolution; executed-test measures runtime stability. A
single `tesseract run-everything` wrapper could drive
`compile-corpus` then `test-execute` then `scoreboard` ×3;
not Z11b's concern — the individual CLIs compose.

### 10.2 With Z11d (live adapter)

Loosely coupled. Z11d reasons about what the spec should do;
Z11b measures whether the resulting spec runs cleanly.
Compound analysis ("did live-reasoning-produced specs have
better stability than heuristic-produced?") is possible
downstream.

### 10.3 With Z11f (substrate study)

Unrelated. Different evidence source (harvested DOMs vs.
executed specs).

### 10.4 With the graduation gate

Z11b adds a new trajectory category to the
hypothesis-confirmation-rate-sustained gate's calculation.
Sustained-rate still aggregates across all trajectories; a
persistently-flaky executed-test cohort drags the aggregate
rate down, correctly.

## 11. Success Criteria

Z11b is complete when:

1. Four sub-commits landed; full suite green; seam laws green.
2. `tesseract test-execute --suite generated --repetitions 3
   --emit-compounding-receipt` produces one ExecutionReceipt
   per generated spec.
3. The compounding scoreboard shows an executed-test trajectory
   per spec cohort.
4. A stability-rate hypothesis evaluates against the receipts
   and produces a judgment whose cycleRate matches
   passCount/total.
5. Full four-cohort drive-through (probe + scenario +
   compile-corpus + test-execute) produces a scoreboard with
   four cohorts represented; graduation holds when all
   evaluate favorably.

## Closing note

Z11b is the most mechanical of the three forward paths because
the patterns are already established. It's also the third leg
of the quality stool: Z11a measures "can we compile?"; Z11b
measures "do the compiled specs run?"; Z11d measures "did the
reasoning produce the right specs?". Together they span the
three product-efficacy questions the compounding engine was
designed to answer.

The work here is steady and well-scoped. Run this slice when
the team wants predictable progress with low architectural
novelty. Save Z11d for when bandwidth for design exploration is
high.

