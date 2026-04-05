/**
 * IterationTimeline organism — multi-iteration horizontal timeline with act segments.
 *
 * Displays every iteration as a segmented bar, color-coded by act identity.
 * Overlays: hit-rate bars, convergence velocity arrows, iteration markers.
 *
 * Consumes pure domain logic from lib/domain/iteration-timeline.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part IX: Iteration Timeline
 */

import { memo } from 'react';
import {
  buildTimeline,
  totalTimelineWidth,
  type IterationMetrics,
  type TimelineEntry,
  type TimelineState,
} from '../../../lib/domain/observation/contracts';
import { ConvergenceArrow } from '../molecules/convergence-arrow';

// ─── Component Props ───

export interface IterationTimelineProps {
  readonly metrics: readonly IterationMetrics[];
  readonly converged: boolean;
  readonly currentIteration: number;
  /** Optional click handler for iteration selection. */
  readonly onIterationClick?: (iteration: number) => void;
  readonly compact?: boolean;
}

// ─── Pure Helpers ───

/** Act colors matching PlaybackScrubber palette. */
const ACT_COLORS: Readonly<Record<number, string>> = {
  1: '#6366f1', 2: '#06b6d4', 3: '#f59e0b', 4: '#10b981',
  5: '#ef4444', 6: '#8b5cf6', 7: '#3b82f6',
} as const;

// ─── Component ───

export const IterationTimeline = memo(function IterationTimeline({
  metrics,
  converged,
  currentIteration,
  onIterationClick,
  compact = false,
}: IterationTimelineProps) {
  const timeline: TimelineState = buildTimeline(metrics, converged);

  if (timeline.entries.length === 0) {
    return (
      <div className="text-xs text-white/40 px-2 py-1">
        Awaiting first iteration…
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 px-2 py-1.5"
      style={{ background: 'rgba(0,0,0,0.5)', borderRadius: 6 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Iterations</span>
        {converged && <span className="text-emerald-400">✓ Converged</span>}
      </div>

      {/* Scrollable timeline */}
      <div
        className="flex gap-0.5 overflow-x-auto"
        style={{
          scrollBehavior: 'smooth',
          maxWidth: '100%',
        }}
      >
        {timeline.entries.map((entry: TimelineEntry) => (
          <IterationBar
            key={entry.iteration}
            entry={entry}
            isActive={entry.iteration === currentIteration}
            onClick={onIterationClick}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
});

// ─── Sub-components ───

interface IterationBarProps {
  readonly entry: TimelineEntry;
  readonly isActive: boolean;
  readonly onClick?: (iteration: number) => void;
  readonly compact: boolean;
}

const IterationBar = memo(function IterationBar({
  entry,
  isActive,
  onClick,
  compact,
}: IterationBarProps) {
  return (
    <div
      className={`flex flex-col items-center gap-0.5 cursor-pointer transition-opacity ${
        isActive ? 'opacity-100' : 'opacity-60 hover:opacity-80'
      }`}
      style={{ minWidth: entry.totalWidthPx, maxWidth: entry.totalWidthPx }}
      onClick={() => onClick?.(entry.iteration)}
      title={`Iteration ${entry.iteration}: ${Math.round(entry.metrics.knowledgeHitRate * 100)}% hit rate`}
    >
      {/* Hit rate bar */}
      <div
        className="w-full rounded-t"
        style={{
          height: compact ? 16 : 24,
          position: 'relative',
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-t"
          style={{
            height: `${entry.hitRateBarHeight * 100}%`,
            background: 'rgba(34, 197, 94, 0.4)',
            transition: 'height 300ms ease',
          }}
        />
      </div>

      {/* Act segments bar */}
      <div className="flex w-full overflow-hidden" style={{ height: compact ? 4 : 6, borderRadius: 2 }}>
        {entry.segments.map((seg, i) => (
          <div
            key={`${seg.act}-${i}`}
            style={{
              width: `${seg.widthFraction * 100}%`,
              background: ACT_COLORS[seg.act] ?? '#666',
            }}
          />
        ))}
      </div>

      {/* Labels */}
      {!compact && (
        <div className="flex items-center gap-0.5 text-xs">
          <span className="text-white/50 font-mono">{entry.iteration}</span>
          <ConvergenceArrow
            direction={entry.convergenceDirection}
            hitRateDelta={entry.hitRateDelta}
            compact
          />
        </div>
      )}
    </div>
  );
});
