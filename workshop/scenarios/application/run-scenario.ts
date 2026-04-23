/**
 * The scenario runner — the main composition.
 *
 * Per docs/v2-scenario-corpus-plan.md §4.2, runScenario:
 *   1. Acquires a session via the injected ScenarioHarness.
 *   2. Walks steps sequentially (state-dependent).
 *   3. Evaluates invariants over the resulting trace
 *      (parallel-safe).
 *   4. Folds the per-step + per-invariant outcomes into a
 *      ScenarioVerdict.
 *   5. Releases the session via Effect.scoped.
 *
 * The runner returns a `RunOutput` value; the receipt envelope
 * (S4) wraps it for log persistence. Keeping these split keeps
 * the runner's logic free of envelope concerns.
 */

import { Effect } from 'effect';
import {
  ScenarioHarness,
} from './scenario-harness-port';
import {
  diagnoseStepDivergence,
  isStepCompletedAsExpected,
} from './diagnose-divergence';
import {
  foldScenarioVerdict,
  type Scenario,
  type ScenarioVerdict,
} from '../domain/scenario';
import {
  EMPTY_TRACE,
  type ScenarioTrace,
  type StepDivergence,
  type StepOutcome,
} from '../domain/scenario-trace';
import { type Invariant, type InvariantOutcome } from '../domain/invariant';
import type { ScenarioError } from '../domain/scenario-error';

export interface RunOutput {
  readonly scenario: Scenario;
  readonly trace: ScenarioTrace;
  readonly invariantOutcomes: readonly InvariantRun[];
  readonly verdict: ScenarioVerdict;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly harnessTag: 'scenario-dry' | 'scenario-fixture-replay' | 'scenario-playwright-live';
}

export interface InvariantRun {
  readonly invariant: Invariant;
  readonly outcome: InvariantOutcome;
}

/** The full Effect program. Runs in `Effect.scoped` so session
 *  acquisition + release are guaranteed paired. */
export function runScenario(
  scenario: Scenario,
  opts?: { readonly now?: () => Date },
): Effect.Effect<RunOutput, ScenarioError, ScenarioHarness> {
  const now = opts?.now ?? (() => new Date());
  return Effect.scoped(
    Effect.gen(function* () {
      const harness = yield* ScenarioHarness;
      const startedAt = now();
      const session = yield* Effect.acquireRelease(
        harness.openSession(scenario),
        (s) => harness.closeSession(s),
      );

      // Sequential step execution — state-dependent. for…of inside
      // Effect.gen is the right shape per plan §4.5.
      const stepOutcomes: StepOutcome[] = [];
      let firstDivergence: StepDivergence | null = null;

      for (const step of scenario.steps) {
        const rawOutcome = yield* harness.executeStep(session, step, stepOutcomes);
        // Recompute completedAsExpected to enforce the runner's
        // semantics — harness implementations should compute it
        // identically, but the runner is the source of truth.
        const completedAsExpected = isStepCompletedAsExpected(step, rawOutcome);
        const outcome: StepOutcome = { ...rawOutcome, completedAsExpected };
        stepOutcomes.push(outcome);
        if (!completedAsExpected) {
          firstDivergence = diagnoseStepDivergence(step, outcome);
          break;
        }
      }

      const trace: ScenarioTrace = {
        steps: stepOutcomes,
        firstDivergence,
      };

      // Invariants are parallel-safe — they read the trace; no
      // mutation of substrate state. concurrency=unbounded since
      // I is small (~10).
      const invariantOutcomes: readonly InvariantRun[] = yield* Effect.all(
        scenario.invariants.map((inv) =>
          harness.evaluateInvariant(session, inv, trace).pipe(
            Effect.map((outcome) => ({ invariant: inv, outcome }) as InvariantRun),
          ),
        ),
        { concurrency: 'unbounded' },
      );

      const verdict = computeVerdict(trace, invariantOutcomes);
      const completedAt = now();

      return {
        scenario,
        trace,
        invariantOutcomes,
        verdict,
        startedAt,
        completedAt,
        harnessTag: harness.tag,
      };
    }),
  );
}

/** Compute the overall ScenarioVerdict. Pure. */
export function computeVerdict(
  trace: ScenarioTrace,
  invariantOutcomes: readonly InvariantRun[],
): ScenarioVerdict {
  if (trace.firstDivergence !== null) {
    return trace.firstDivergence.kind === 'harness-error'
      ? 'harness-failed'
      : 'step-diverged';
  }
  if (invariantOutcomes.some((r) => r.outcome.kind === 'violated')) {
    return 'invariant-violated';
  }
  return 'trajectory-holds';
}

/** Pure check: does a verdict mean the scenario passes? */
export function verdictPasses(verdict: ScenarioVerdict): boolean {
  return foldScenarioVerdict(verdict, {
    trajectoryHolds: () => true,
    stepDiverged: () => false,
    invariantViolated: () => false,
    harnessFailed: () => false,
  });
}

/** Empty / sentinel for tests that don't actually run. */
export const EMPTY_RUN_OUTPUT_TRACE: ScenarioTrace = EMPTY_TRACE;
