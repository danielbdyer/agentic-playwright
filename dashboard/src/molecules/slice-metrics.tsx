/**
 * SliceMetrics molecule — suite slice selection summary display.
 *
 * Shows the breakdown of scenario selection during Act 3:
 *   - Total scenarios considered
 *   - Selected (green count)
 *   - Deferred (gray count)
 *   - Selection ratio as a compact progress bar
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 3), Part VIII
 */

import { memo } from 'react';

// ─── Types ───

export interface SliceMetricsData {
  readonly totalScenarios: number;
  readonly selectedCount: number;
  readonly deferredCount: number;
  readonly selectionReason: string;
}

export interface SliceMetricsProps {
  readonly data: SliceMetricsData | null;
}

// ─── Pure Helpers ───

/** Compute selection ratio [0, 1]. */
export function selectionRatio(data: SliceMetricsData): number {
  return data.totalScenarios > 0 ? data.selectedCount / data.totalScenarios : 0;
}

/** Format ratio as percentage string. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ─── Component ───

export const SliceMetrics = memo(function SliceMetrics({ data }: SliceMetricsProps) {
  if (!data) {
    return (
      <div className="text-xs text-white/40 px-2 py-1">
        Awaiting suite slice…
      </div>
    );
  }

  const ratio = selectionRatio(data);

  return (
    <div className="flex flex-col gap-1 px-2 py-1.5 text-xs">
      <div className="flex items-center justify-between text-white/80">
        <span>Suite Slice</span>
        <span className="font-mono">{formatPercent(ratio)}</span>
      </div>

      {/* Stacked bar: selected vs deferred */}
      <div className="flex h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div
          style={{
            width: `${ratio * 100}%`,
            background: '#22c55e',
            transition: 'width 500ms ease',
          }}
        />
      </div>

      <div className="flex justify-between text-white/50">
        <span>
          <span style={{ color: '#22c55e' }}>●</span> {data.selectedCount} selected
        </span>
        <span>
          <span style={{ color: '#6b7280' }}>●</span> {data.deferredCount} deferred
        </span>
      </div>
    </div>
  );
});
