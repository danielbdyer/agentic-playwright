/**
 * Graduated Autonomy — Pure Computation (N1.9)
 *
 * Computes per-screen autonomy profiles from run history and evaluates
 * promotions/demotions based on configurable thresholds. All functions
 * are pure — no side effects, no mutation.
 */

import type {
  AutonomyLevel,
  AutonomyPromotion,
  AutonomyThresholds,
  ScreenAutonomyProfile,
} from './types/autonomy';

// ─── Default Thresholds ───

export const DEFAULT_THRESHOLDS: AutonomyThresholds = {
  supervisedMinRuns: 3,
  supervisedMinSuccessRate: 0.8,
  autonomousMinRuns: 10,
  autonomousMinSuccessRate: 0.95,
};

// ─── Run History Entry ───

interface RunHistoryEntry {
  readonly success: boolean;
  readonly runAt: string;
}

// ─── Autonomy Level Ordering ───

const LEVEL_ORDER: Record<AutonomyLevel, number> = {
  manual: 0,
  supervised: 1,
  autonomous: 2,
};

// ─── Private Helpers ───

function computeSuccessRate(total: number, successful: number): number {
  return total === 0 ? 0 : successful / total;
}

function deriveLevel(
  totalRuns: number,
  successRate: number,
  thresholds: AutonomyThresholds,
): AutonomyLevel {
  if (totalRuns >= thresholds.autonomousMinRuns && successRate >= thresholds.autonomousMinSuccessRate) {
    return 'autonomous';
  }
  if (totalRuns >= thresholds.supervisedMinRuns && successRate >= thresholds.supervisedMinSuccessRate) {
    return 'supervised';
  }
  return 'manual';
}

function reasonForLevel(level: AutonomyLevel, totalRuns: number, successRate: number): string {
  switch (level) {
    case 'autonomous':
      return `Promoted to autonomous: ${totalRuns} runs at ${(successRate * 100).toFixed(1)}% success rate`;
    case 'supervised':
      return `Promoted to supervised: ${totalRuns} runs at ${(successRate * 100).toFixed(1)}% success rate`;
    case 'manual':
      return totalRuns === 0
        ? 'New screen — no run history'
        : `Manual: ${totalRuns} runs at ${(successRate * 100).toFixed(1)}% success rate — below promotion thresholds`;
  }
}

function demoteOneLevel(level: AutonomyLevel): AutonomyLevel {
  switch (level) {
    case 'autonomous':
      return 'supervised';
    case 'supervised':
      return 'manual';
    case 'manual':
      return 'manual';
  }
}

// ─── Public API ───

export function computeAutonomyProfile(
  screenId: string,
  runHistory: readonly RunHistoryEntry[],
  thresholds: AutonomyThresholds = DEFAULT_THRESHOLDS,
): ScreenAutonomyProfile {
  const totalRuns = runHistory.length;
  const successfulRuns = runHistory.filter((r) => r.success).length;
  const successRate = computeSuccessRate(totalRuns, successfulRuns);
  const level = deriveLevel(totalRuns, successRate, thresholds);
  const sorted = [...runHistory].sort((a, b) => a.runAt.localeCompare(b.runAt));
  const lastEntry = sorted[sorted.length - 1];
  const lastRunAt = lastEntry !== undefined ? lastEntry.runAt : '';

  return {
    screenId,
    level,
    totalRuns,
    successfulRuns,
    successRate,
    lastRunAt,
    promotedAt: level !== 'manual' ? lastRunAt : null,
    reason: reasonForLevel(level, totalRuns, successRate),
  };
}

export function evaluatePromotion(
  current: ScreenAutonomyProfile,
  thresholds: AutonomyThresholds = DEFAULT_THRESHOLDS,
): AutonomyPromotion | null {
  const derivedLevel = deriveLevel(current.totalRuns, current.successRate, thresholds);

  if (LEVEL_ORDER[derivedLevel] <= LEVEL_ORDER[current.level]) {
    return null;
  }

  return {
    screenId: current.screenId,
    previousLevel: current.level,
    newLevel: derivedLevel,
    reason: `Promotion: ${current.level} → ${derivedLevel} based on ${current.totalRuns} runs at ${(current.successRate * 100).toFixed(1)}% success`,
    evidence: {
      totalRuns: current.totalRuns,
      successfulRuns: current.successfulRuns,
      successRate: current.successRate,
      consecutiveSuccesses: 0, // not tracked at profile level; caller may enrich
    },
  };
}

export function evaluateDemotion(
  current: ScreenAutonomyProfile,
  recentFailureCount: number,
  demotionThreshold: number = 3,
): AutonomyPromotion | null {
  if (current.level === 'manual') {
    return null;
  }

  if (recentFailureCount < demotionThreshold) {
    return null;
  }

  const newLevel = demoteOneLevel(current.level);

  return {
    screenId: current.screenId,
    previousLevel: current.level,
    newLevel,
    reason: `Demotion: ${current.level} → ${newLevel} due to ${recentFailureCount} recent failures (threshold: ${demotionThreshold})`,
    evidence: {
      totalRuns: current.totalRuns,
      successfulRuns: current.successfulRuns,
      successRate: current.successRate,
      consecutiveSuccesses: 0,
    },
  };
}
