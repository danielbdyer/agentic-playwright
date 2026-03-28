/**
 * W3.6: Parallel Step Execution — Dependency Analysis & Independent Step Detection
 *
 * Pure functions that analyze BoundStep[] for parallelization opportunities.
 * Conservative: only assertion-only steps are candidates for parallel execution.
 *
 * The dependency model is simple and safe:
 *   - A step depends on previous steps that share the same screen
 *   - Assertion-only steps (observe-structure, custom-escape-hatch with assert)
 *     do not mutate application state and are safe to parallelize
 *   - Steps with side effects (navigate, enter, invoke) create sequential barriers
 */

import type { BoundStep, StepAction } from '../domain/types';

// ─── Step Classification ───

/** Actions that only observe and do not mutate application state. */
const ASSERTION_ACTIONS: ReadonlySet<StepAction> = new Set([
  'assert-snapshot',
]);

/** Actions that mutate application state and must execute sequentially. */
const MUTATING_ACTIONS: ReadonlySet<StepAction> = new Set([
  'navigate',
  'input',
  'click',
  'custom',
]);

/**
 * O(1). Determine whether a step is assertion-only — no side effects
 * on the application under test. Assertion-only steps are safe to run
 * in parallel because they only read DOM state.
 *
 * A step is assertion-only when:
 *   - Its action is 'assert-snapshot', OR
 *   - Its program (if present) contains only observe-structure instructions
 */
export function isAssertionOnly(step: BoundStep): boolean {
  // If the step has a compiled program, inspect instructions
  const program = step.program;
  if (program && program.instructions.length > 0) {
    return program.instructions.every(
      (inst) => inst.kind === 'observe-structure',
    );
  }
  // Fall back to action classification
  return ASSERTION_ACTIONS.has(step.action) && !MUTATING_ACTIONS.has(step.action);
}

// ─── Dependency Analysis ───

/**
 * O(n^2) worst case. Compute which steps depend on which other steps.
 *
 * Dependency rules:
 *   1. Every step implicitly depends on all preceding mutating steps
 *      that share the same screen (state may have changed).
 *   2. Assertion-only steps do NOT create dependencies for subsequent steps.
 *   3. A mutating step depends on all preceding steps on the same screen.
 *   4. Steps with no screen are treated as depending on the immediately
 *      preceding step (conservative default).
 *
 * Returns a map from step index to the indices of steps it depends on.
 * Steps with no dependencies map to an empty array.
 */
export function analyzeStepDependencies(
  steps: readonly BoundStep[],
): ReadonlyMap<number, readonly number[]> {
  // Track the last mutating step index per screen
  const lastMutatingByScreen = new Map<string, number>();
  // Track the last mutating step index overall (for screen-less steps)
  const result = new Map<number, readonly number[]>();

  return steps.reduce((acc, step, idx) => {
    const screen = step.screen ?? step.resolution?.screen ?? null;
    const deps: readonly number[] = computeDependencies(
      idx,
      screen,
      step,
      lastMutatingByScreen,
    );

    // Update tracking state for mutating steps
    if (!isAssertionOnly(step) && screen) {
      lastMutatingByScreen.set(screen, idx);
    } else if (!isAssertionOnly(step) && !screen) {
      // Screen-less mutating step: mark all screens as having a barrier
      for (const key of lastMutatingByScreen.keys()) {
        lastMutatingByScreen.set(key, idx);
      }
    }

    return new Map([...acc, [idx, deps]]);
  }, new Map<number, readonly number[]>());
}

function computeDependencies(
  idx: number,
  screen: string | null | undefined,
  step: BoundStep,
  lastMutatingByScreen: ReadonlyMap<string, number>,
): readonly number[] {
  if (idx === 0) return [];

  if (screen) {
    const lastMutating = lastMutatingByScreen.get(screen);
    return lastMutating !== undefined ? [lastMutating] : [];
  }

  // No screen: depend on immediately preceding step (conservative)
  return [idx - 1];
}

// ─── Independent Step Groups ───

/**
 * O(n * d) where d is the max dependency chain length.
 * Groups steps into batches that can execute in parallel.
 *
 * Each group is a set of step indices whose dependencies are all
 * satisfied by steps in earlier groups. Steps within the same group
 * have no mutual dependencies and can execute concurrently.
 *
 * Returns groups in execution order — group 0 first, then group 1, etc.
 */
export function findIndependentSteps(
  dependencies: ReadonlyMap<number, readonly number[]>,
): readonly (readonly number[])[] {
  if (dependencies.size === 0) return [];

  // Compute the "level" of each step: the earliest group it can belong to
  const levels = computeLevels(dependencies);

  // Group steps by level
  const maxLevel = Math.max(...levels.values());
  return Array.from({ length: maxLevel + 1 }, (_, level) =>
    [...levels.entries()]
      .filter(([, l]) => l === level)
      .map(([idx]) => idx),
  );
}

function computeLevels(
  dependencies: ReadonlyMap<number, readonly number[]>,
): ReadonlyMap<number, number> {
  const memo = new Map<number, number>();

  const level = (idx: number): number => {
    const cached = memo.get(idx);
    if (cached !== undefined) return cached;

    const deps = dependencies.get(idx) ?? [];
    const result = deps.length === 0
      ? 0
      : 1 + Math.max(...deps.map(level));

    memo.set(idx, result);
    return result;
  };

  for (const idx of dependencies.keys()) {
    level(idx);
  }

  return memo;
}

// ─── Parallel Execution Plan ───

/** A group of steps that can execute concurrently. */
export interface ParallelStepGroup {
  readonly groupIndex: number;
  readonly stepIndices: readonly number[];
  readonly allAssertionOnly: boolean;
}

/**
 * O(n). Build an execution plan from step groups.
 * Currently conservative: only groups where ALL steps are assertion-only
 * are marked for parallel execution.
 */
export function buildParallelPlan(
  steps: readonly BoundStep[],
  groups: readonly (readonly number[])[],
): readonly ParallelStepGroup[] {
  return groups.map((stepIndices, groupIndex) => ({
    groupIndex,
    stepIndices,
    allAssertionOnly: stepIndices.every((idx) => {
      const step = steps[idx];
      return step !== undefined && isAssertionOnly(step);
    }),
  }));
}
