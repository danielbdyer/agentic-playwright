/**
 * DegradationController organism — FPS monitor and automatic quality reduction.
 *
 * Monitors frame rate and progressively reduces visual fidelity to maintain
 * 60fps target. Four degradation tiers (from spec Part VII):
 *
 *   Tier 0: Full quality — bloom, all particles, glass pane, 3D text
 *   Tier 1: Reduce bloom — disable bloom post-processing
 *   Tier 2: Pool particles — reduce particle count by 50%
 *   Tier 3: Simplify glass — replace glass pane with flat overlay
 *   Tier 4: 2D fallback — replace 3D scene with 2D dashboard
 *
 * The controller is a headless component — it renders no UI itself,
 * only the FPS indicator badge. Quality tier is consumed by other
 * components through the FlywheelProvider context.
 *
 * Consumes hook logic from dashboard/src/hooks/use-degradation.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part VII: Graceful Degradation
 */

import { memo } from 'react';

// ─── Types ───

export type DegradationTier = 0 | 1 | 2 | 3 | 4;

export interface DegradationState {
  readonly tier: DegradationTier;
  readonly fps: number;
  readonly bloomEnabled: boolean;
  readonly particleDensity: number;  // [0.25, 1.0]
  readonly glassPaneMode: 'full' | 'flat' | 'hidden';
  readonly use3D: boolean;
}

export interface DegradationControllerProps {
  readonly state: DegradationState;
  readonly showIndicator?: boolean;
}

// ─── Pure Helpers ───

/** Tier labels for display. */
export const TIER_LABELS: Readonly<Record<DegradationTier, string>> = {
  0: 'Full',
  1: 'No Bloom',
  2: 'Reduced',
  3: 'Simplified',
  4: '2D Mode',
} as const;

/** Tier colors. */
export const TIER_COLORS: Readonly<Record<DegradationTier, string>> = {
  0: '#22c55e', // Green
  1: '#84cc16', // Lime
  2: '#f59e0b', // Amber
  3: '#f97316', // Orange
  4: '#ef4444', // Red
} as const;

/** Compute the degradation state from a raw FPS reading. */
export function computeDegradationState(
  fps: number,
  currentTier: DegradationTier,
): DegradationState {
  // Hysteresis: drop tier at <45fps, recover at >55fps
  const shouldDegrade = fps < 45 && currentTier < 4;
  const shouldRecover = fps > 55 && currentTier > 0;
  const tier: DegradationTier = shouldDegrade
    ? Math.min(4, currentTier + 1) as DegradationTier
    : shouldRecover
      ? Math.max(0, currentTier - 1) as DegradationTier
      : currentTier;

  return {
    tier,
    fps,
    bloomEnabled: tier < 1,
    particleDensity: tier >= 2 ? 0.5 : 1.0,
    glassPaneMode: tier >= 3 ? 'flat' : 'full',
    use3D: tier < 4,
  };
}

/** Format FPS for display. */
export function formatFps(fps: number): string {
  return `${Math.round(fps)} fps`;
}

// ─── Component ───

export const DegradationController = memo(function DegradationController({
  state,
  showIndicator = true,
}: DegradationControllerProps) {
  if (!showIndicator) return null;

  const color = TIER_COLORS[state.tier];
  const label = TIER_LABELS[state.tier];

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
      style={{
        background: 'rgba(0,0,0,0.6)',
        border: `1px solid ${color}33`,
      }}
      title={`Quality: ${label} (Tier ${state.tier})`}
    >
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      <span className="font-mono" style={{ color }}>
        {formatFps(state.fps)}
      </span>
      {state.tier > 0 && (
        <span className="text-white/40">
          T{state.tier}
        </span>
      )}
    </div>
  );
});
