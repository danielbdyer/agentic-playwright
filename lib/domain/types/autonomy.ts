/**
 * Graduated Autonomy Profiles (N1.9)
 *
 * Per-screen trust levels based on run history. Screens graduate from
 * manual → supervised → autonomous as they accumulate successful runs.
 */

// ─── Autonomy Level ───

export type AutonomyLevel = 'manual' | 'supervised' | 'autonomous';

// ─── Screen Autonomy Profile ───

export interface ScreenAutonomyProfile {
  readonly screenId: string;
  readonly level: AutonomyLevel;
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly successRate: number;
  readonly lastRunAt: string;
  readonly promotedAt: string | null;
  readonly reason: string;
}

// ─── Thresholds ───

export interface AutonomyThresholds {
  readonly supervisedMinRuns: number;
  readonly supervisedMinSuccessRate: number;
  readonly autonomousMinRuns: number;
  readonly autonomousMinSuccessRate: number;
}

// ─── Promotion / Demotion ───

export interface AutonomyPromotion {
  readonly screenId: string;
  readonly previousLevel: AutonomyLevel;
  readonly newLevel: AutonomyLevel;
  readonly reason: string;
  readonly evidence: AutonomyEvidence;
}

export interface AutonomyEvidence {
  readonly totalRuns: number;
  readonly successfulRuns: number;
  readonly successRate: number;
  readonly consecutiveSuccesses: number;
}
