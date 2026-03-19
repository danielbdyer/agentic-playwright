# Plan: Self-Improving Pipeline Speedrun

## Mental Model

```
Current (Level 0):
  synthetic run → knowledge proposals → activate hints → better hit rate
  Durable output: knowledge files (hints, patterns)

Proposed (Level 1):
  synthetic run → failure taxonomy → pipeline improvement signals → code changes → better BASELINE hit rate
  Durable output: pipeline code + scorecard
  Ephemeral: everything else (scenarios, evidence, learning, knowledge changes)
```

The analogy:
- **Knowledge files** = activations (ephemeral per run, always start fresh)
- **Pipeline code** = weights (the durable thing that improves)
- **Scorecard** = loss curve (monotonic improvement record)
- **Synthetic scenarios** = training data (regenerated each time)
- **Pipeline fitness report** = gradient (tells you what code to change)

## Architecture

### 1. Untrack synthetic artifacts + add `.gitignore` rules

Files:
- `.gitignore` — add rules for synthetic/ephemeral paths

```
scenarios/synthetic/
generated/synthetic/
.tesseract/evidence/runs/
.tesseract/learning/
.tesseract/runs/
.tesseract/benchmarks/runs/
.ado-sync/synthetic/
```

Then `git rm --cached` the currently tracked files in those paths.

### 2. Pipeline Fitness Report type + emission

The key new artifact. After a clean-slate flywheel run, the system emits a structured report classifying *why* the pipeline succeeded or failed at each step, aggregated into improvement signals.

File: `lib/domain/types/fitness.ts`

```typescript
interface PipelineFitnessReport {
  readonly kind: 'pipeline-fitness-report'
  readonly version: 1
  readonly pipelineVersion: string           // git commit hash of pipeline code
  readonly runAt: string                     // ISO timestamp
  readonly baseline: true                    // always clean-slate

  // ─── Aggregate metrics (the "loss") ───
  readonly metrics: {
    readonly knowledgeHitRate: number         // % steps resolved via approved-knowledge from scratch
    readonly translationPrecision: number     // % of translation matches that were correct
    readonly translationRecall: number        // % of resolvable steps that translation found
    readonly convergenceVelocity: number      // iterations to reach no-proposals
    readonly proposalYield: number            // % of proposals that improved hit rate when activated
    readonly resolutionByRung: ReadonlyArray<{ readonly rung: string; readonly rate: number }>
    readonly degradedLocatorRate: number
    readonly recoverySuccessRate: number
  }

  // ─── Classified failure modes (the "gradient") ───
  readonly failureModes: ReadonlyArray<{
    readonly class: PipelineFailureClass
    readonly count: number
    readonly affectedSteps: number
    readonly exampleIntents: readonly string[]
    readonly improvementTarget: PipelineImprovementTarget
  }>

  // ─── Scoring rule effectiveness ───
  readonly scoringEffectiveness: {
    readonly bottleneckWeightCorrelations: ReadonlyArray<{
      readonly signal: string
      readonly weight: number
      readonly correlationWithImprovement: number
    }>
    readonly proposalRankingAccuracy: number  // did high-ranked proposals yield more improvement?
  }
}

type PipelineFailureClass =
  | 'translation-threshold-miss'      // correct match scored below 0.34
  | 'translation-normalization-gap'   // tokenization missed a phrasing pattern
  | 'alias-coverage-gap'             // no alias existed but pattern was predictable
  | 'resolution-rung-skip'           // a rung could have won but didn't fire
  | 'scoring-weight-mismatch'        // bottleneck signal weight didn't match actual impact
  | 'recovery-strategy-miss'         // recovery tried wrong strategy first
  | 'convergence-stall'              // proposals generated but didn't improve hit rate
  | 'trust-policy-over-block'        // policy blocked a proposal that would have helped

type PipelineImprovementTarget =
  | { readonly kind: 'translation'; readonly detail: string }   // e.g., "lower threshold" or "add normalization rule"
  | { readonly kind: 'scoring'; readonly detail: string }       // e.g., "increase repair-density weight"
  | { readonly kind: 'resolution'; readonly detail: string }    // e.g., "add rung for X"
  | { readonly kind: 'recovery'; readonly detail: string }      // e.g., "reorder strategy chain"
  | { readonly kind: 'trust-policy'; readonly detail: string }  // e.g., "lower threshold for hints"
```

File: `lib/application/fitness.ts` — the emission logic:

- After flywheel completes, walk all step receipts and classify each failure
- Compute translation precision/recall by comparing translation candidates against what eventually resolved
- Compute per-rung resolution rates from receipt `winningSource` fields
- Correlate bottleneck signal weights with actual hit-rate improvement across iterations
- Emit the structured report

### 3. Speedrun harness (`npm run speedrun`)

File: `scripts/speedrun.ts`

Orchestration:
1. **Clean slate**: Wipe `scenarios/synthetic/`, `generated/synthetic/`, `.tesseract/evidence/`, `.tesseract/learning/`, and any activated knowledge changes from prior runs. Restore knowledge files to git HEAD state.
2. **Generate**: Run scenario generator + interface fuzzer (fresh synthetic corpus)
3. **Flywheel**: Run dogfood loop with `autoApprovalPolicy` enabled, starting from zero knowledge proposals
4. **Measure**: Compute pipeline fitness report from the run
5. **Compare**: Load current scorecard, compare metrics against high-water-mark
6. **Emit**: Write fitness report to `.tesseract/benchmarks/runs/{timestamp}.fitness.json` (ephemeral)
7. **Report**: Print summary to stdout — did we beat the mark?

### 4. Scorecard as high-water-mark

File: `.tesseract/benchmarks/scorecard.json` (committed to git)

```typescript
interface PipelineScorecard {
  readonly kind: 'pipeline-scorecard'
  readonly version: 1
  readonly highWaterMark: {
    readonly setAt: string
    readonly pipelineVersion: string              // git commit that achieved this
    readonly knowledgeHitRate: number              // baseline from-scratch
    readonly translationPrecision: number
    readonly convergenceVelocity: number
    readonly proposalYield: number
    readonly resolutionByRung: ReadonlyArray<{ readonly rung: string; readonly rate: number }>
  }
  readonly history: ReadonlyArray<{
    readonly runAt: string
    readonly pipelineVersion: string
    readonly knowledgeHitRate: number
    readonly translationPrecision: number
    readonly convergenceVelocity: number
    readonly improved: boolean                    // did this run beat the prior mark?
  }>
}
```

Only the scorecard is committed. The fitness reports in `.tesseract/benchmarks/runs/` are ephemeral.

### 5. Improvement loop protocol

The recursive self-improvement workflow (can be agent-driven or human-driven):

```
loop:
  1. npm run speedrun                      # clean-slate run, emits fitness report
  2. Read fitness report failureModes      # the "gradient"
  3. Identify top failure class by count   # highest-impact improvement
  4. Map to pipeline code location:
     - translation-threshold-miss     → lib/application/translate.ts (overlapScore threshold)
     - translation-normalization-gap  → lib/domain/inference.ts (normalizeIntentText)
     - alias-coverage-gap            → lib/runtime/agent/resolution-stages.ts (alias matching)
     - scoring-weight-mismatch       → lib/application/learning-bottlenecks.ts (weights)
     - resolution-rung-skip          → lib/runtime/agent/resolution-stages.ts (strategy chain)
     - recovery-strategy-miss        → lib/runtime/agent/strategy.ts (strategy order)
     - trust-policy-over-block       → .tesseract/policy/trust-policy.yaml (thresholds)
  5. Implement targeted code change
  6. npm run speedrun                      # re-measure
  7. if metrics.knowledgeHitRate > scorecard.highWaterMark.knowledgeHitRate:
       update scorecard
       commit: pipeline code change + scorecard
     else:
       discard change (git checkout)
```

### 6. Add `origin` provenance to synthetic artifacts

File: `lib/application/synthesis/scenario-generator.ts`

Add `origin: 'synthetic'` to scenario source headers so the pipeline itself can distinguish synthetic from production, enabling:
- The speedrun to skip trust-policy blocks for synthetic evidence
- The fitness report to filter by origin
- Future: different convergence thresholds for synthetic vs production

### 7. Wire into existing test infrastructure

File: `tests/speedrun.test.ts`

A law-style test that:
- Runs a minimal speedrun (5 scenarios, 2 iterations)
- Asserts the fitness report has the expected structure
- Asserts the scorecard comparison logic works (beat-the-mark / reject)
- Asserts clean-slate invariant: no knowledge files modified after run completes

## Implementation order

1. **Untrack + .gitignore** — immediate hygiene, no code changes
2. **Fitness report type** — `lib/domain/types/fitness.ts`, pure domain types
3. **Fitness emission** — `lib/application/fitness.ts`, the classification logic
4. **Scorecard type + comparison** — `lib/domain/types/fitness.ts` (extend), pure
5. **Speedrun harness** — `scripts/speedrun.ts`, orchestration
6. **Origin provenance** — tag synthetic scenarios
7. **npm script** — add `speedrun` to `package.json`
8. **Test** — law-style test for the report + scorecard logic
9. **Seed scorecard** — run once, commit initial high-water-mark
10. **Document** — update `BACKLOG.md` with the speedrun lane

## What this enables

- **Agent-driven self-improvement**: An agent can run `npm run speedrun`, read the fitness report, make a code change, re-run, and commit only if improved. The scorecard is the objective function.
- **No knowledge churn in git**: All synthetic knowledge proposals are ephemeral. Only pipeline code and the scorecard are committed.
- **Monotonic improvement guarantee**: The scorecard only advances forward. Regressions are rejected.
- **Composable improvement targets**: Each `PipelineFailureClass` maps to a specific code location. New failure classes can be added as the pipeline evolves.
- **Training data independence**: Synthetic scenarios are regenerated fresh each time, so improvements in pipeline code must generalize, not overfit to specific phrasings.
