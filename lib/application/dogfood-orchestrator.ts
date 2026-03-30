/**
 * Dogfood orchestrator — configurable self-improving loop planner.
 *
 * This module provides the plan layer for the dogfood loop:
 * - Configuration with safe defaults and convergence bounds
 * - Pure predicate for loop continuation
 * - Phase plan generation for discover → compile → run → propose → approve → rerun
 *
 * All functions are pure. The orchestrator produces a plan; execution is
 * delegated to the existing speedrun/dogfood infrastructure.
 */

import {
  knowledgeHitRateLyapunov,
  deriveTerminationBound,
  estimateRateOfDecrease,
} from '../domain/convergence-bounds';

// ─── Configuration ───

export interface DogfoodConfig {
  readonly maxIterations: number;
  readonly maxCost: number;
  readonly convergenceThreshold: number;
  readonly autoApprove: boolean;
}

export function defaultDogfoodConfig(): DogfoodConfig {
  return {
    maxIterations: 10,
    maxCost: 1000,
    convergenceThreshold: 0.85,
    autoApprove: false,
  };
}

// ─── Loop Continuation Predicate ───

export interface LoopMetrics {
  readonly knowledgeHitRate: number;
  readonly proposalYield: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly costSoFar: number;
  readonly energyHistory: readonly number[];
}

/**
 * Pure predicate: should the dogfood loop continue?
 *
 * Returns false (stop) when any of:
 * - iteration >= maxIterations
 * - costSoFar >= maxCost
 * - knowledgeHitRate >= convergenceThreshold
 * - the Lyapunov function detects a fixed point (3-window, epsilon 0.001)
 * - the estimated termination bound from current progress exceeds remaining budget
 */
export function shouldContinueLoop(
  iteration: number,
  metrics: LoopMetrics,
  config: DogfoodConfig,
): boolean {
  // Hard bounds
  if (iteration >= config.maxIterations) return false;
  if (metrics.costSoFar >= config.maxCost) return false;

  // Convergence threshold met
  if (metrics.knowledgeHitRate >= config.convergenceThreshold) return false;

  // Lyapunov fixed-point detection on energy history
  const _lyapunov = knowledgeHitRateLyapunov();
  const energyHistory = metrics.energyHistory;
  if (energyHistory.length >= 3) {
    const window = energyHistory.slice(-3);
    const spread = Math.max(...window) - Math.min(...window);
    if (spread <= 0.001) return false; // fixed point reached
  }

  // Estimated termination bound exceeds remaining iterations
  if (energyHistory.length >= 2) {
    const rate = estimateRateOfDecrease(energyHistory);
    const currentEnergy = energyHistory[energyHistory.length - 1]!;
    const targetEnergy = 1 - config.convergenceThreshold;
    const bound = deriveTerminationBound(rate, currentEnergy, targetEnergy);
    const remaining = config.maxIterations - iteration;
    if (bound > remaining && bound !== Infinity) return false;
  }

  return true;
}

// ─── Phase Plan ───

export type DogfoodPhaseName =
  | 'discover'
  | 'compile'
  | 'run'
  | 'propose'
  | 'approve'
  | 'rerun';

export interface DogfoodPhase {
  readonly name: DogfoodPhaseName;
  readonly order: number;
  readonly description: string;
  readonly requiresAutoApprove: boolean;
}

/** Canonical phase ordering for the dogfood loop. */
const PHASE_DEFINITIONS: readonly DogfoodPhase[] = [
  { name: 'discover', order: 0, description: 'Discover scenarios and knowledge surfaces', requiresAutoApprove: false },
  { name: 'compile', order: 1, description: 'Compile scenarios into bound specs', requiresAutoApprove: false },
  { name: 'run', order: 2, description: 'Execute bound specs and collect evidence', requiresAutoApprove: false },
  { name: 'propose', order: 3, description: 'Generate improvement proposals from evidence', requiresAutoApprove: false },
  { name: 'approve', order: 4, description: 'Review and approve proposals per trust policy', requiresAutoApprove: true },
  { name: 'rerun', order: 5, description: 'Re-execute to validate improvements', requiresAutoApprove: false },
];

/**
 * Create the dogfood phase plan from config.
 * When autoApprove is false, the approve phase is still included but
 * marked as requiring manual intervention.
 */
export function createDogfoodPlan(config: DogfoodConfig): readonly DogfoodPhase[] {
  return PHASE_DEFINITIONS.map((phase) => ({
    ...phase,
    requiresAutoApprove: phase.name === 'approve' ? !config.autoApprove : false,
  }));
}

/**
 * Validate that a phase sequence is in strictly ascending order.
 * Useful as a law-style invariant check.
 */
export function isPhasesOrdered(phases: readonly DogfoodPhase[]): boolean {
  return phases.every(
    (phase, index) => index === 0 || phase.order > phases[index - 1]!.order,
  );
}

/**
 * Extract the phase names in execution order.
 */
export function phaseNames(phases: readonly DogfoodPhase[]): readonly DogfoodPhaseName[] {
  return phases.map((p) => p.name);
}
