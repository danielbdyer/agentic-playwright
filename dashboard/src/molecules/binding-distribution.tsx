/**
 * BindingDistribution molecule — stacked bar for bound/deferred/unbound steps.
 *
 * Shows the distribution of step bindings during Act 4 (Deterministic Compile):
 *   ┌──────────────────────┬────────────┬──────┐
 *   │   BOUND (green)      │ DEFERRED   │UNBOUND│
 *   │   72%                │ (amber)20% │(red)8%│
 *   └──────────────────────┴────────────┴──────┘
 *
 * Consumes pure domain logic from product/domain/binding-distribution.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 4), Part VIII
 */

import { memo } from 'react';
import {
  stackedBarSegments,
  formatBreakdown,
  trendArrow,
  trendColor,
  type DistributionBreakdown,
  type BindingTrend,
} from '../../../product/domain/projection/binding-distribution';

// ─── Component Props ───

export interface BindingDistributionProps {
  readonly breakdown: DistributionBreakdown | null;
  readonly trend: BindingTrend;
  readonly compact?: boolean;
}

// ─── Component ───

export const BindingDistribution = memo(function BindingDistribution({
  breakdown,
  trend,
  compact = false,
}: BindingDistributionProps) {
  if (!breakdown) {
    return (
      <div className="text-xs text-white/40 px-2 py-1">
        Awaiting bindings…
      </div>
    );
  }

  const segments = stackedBarSegments(breakdown);
  const arrow = trendArrow(trend);
  const color = trendColor(trend);

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between text-white/80">
        <span>Binding Distribution</span>
        <span style={{ color }} title={`Trend: ${trend}`}>
          {arrow}
        </span>
      </div>

      {/* Stacked bar */}
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        {segments.map((seg) => (
          <div
            key={seg.kind}
            style={{
              width: `${seg.width * 100}%`,
              background: seg.color,
              transition: 'width 500ms ease',
            }}
            title={`${seg.kind}: ${Math.round(seg.width * 100)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="text-white/50">
          {formatBreakdown(breakdown)}
        </div>
      )}
    </div>
  );
});
