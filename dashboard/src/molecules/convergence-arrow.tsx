/**
 * ConvergenceArrow molecule — trend arrow for knowledge hit-rate velocity.
 *
 * Displays a directional arrow indicating convergence trajectory:
 *   ↑ improving (green) — hit rate increasing between iterations
 *   → flat (amber) — hit rate stable
 *   ↓ regressing (red) — hit rate decreasing
 *
 * Consumes pure domain logic from product/domain/iteration-timeline.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part VIII: Molecule Components
 */

import { memo } from 'react';
import {
  directionArrow,
  directionColor,
  type ConvergenceDirection,
} from '../../../product/domain/projection/iteration-timeline';

// ─── Component Props ───

export interface ConvergenceArrowProps {
  readonly direction: ConvergenceDirection;
  readonly hitRateDelta: number;
  readonly compact?: boolean;
}

// ─── Pure Helpers ───

/** Format delta as signed percentage. */
export function formatDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// ─── Component ───

export const ConvergenceArrow = memo(function ConvergenceArrow({
  direction,
  hitRateDelta,
  compact = false,
}: ConvergenceArrowProps) {
  const arrow = directionArrow(direction);
  const color = directionColor(direction);

  return (
    <div
      className="inline-flex items-center gap-1 text-xs font-medium"
      title={`Convergence: ${direction} (${formatDelta(hitRateDelta)})`}
    >
      <span
        style={{
          color,
          fontSize: compact ? 14 : 18,
          lineHeight: 1,
          transition: 'color 300ms ease',
        }}
      >
        {arrow}
      </span>
      {!compact && (
        <span style={{ color }} className="font-mono">
          {formatDelta(hitRateDelta)}
        </span>
      )}
    </div>
  );
});
