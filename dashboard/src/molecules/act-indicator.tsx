/**
 * ActIndicator molecule — current act badge with transition animation.
 *
 * Displays the current flywheel act as a colored badge with:
 *   - Act number and short name (e.g., "3 Slice")
 *   - Color coded by act identity
 *   - Iteration counter
 *   - Slide + cross-fade transition between acts
 *
 * Consumes pure domain logic from lib/domain/act-indicator.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part VIII: Molecule Components
 */

import { memo } from 'react';
import type { FlywheelAct } from '../types';
import {
  ACT_METADATA,
  badgeLabel,
  shortBadgeLabel,
  iterationLabel,
  outgoingOpacity,
  incomingOpacity,
  type ActBadgeState,
} from '../../../lib/domain/observation/contracts';

// ─── Component Props ───

export interface ActIndicatorProps {
  /** Current badge state from the act-indicator state machine. */
  readonly badgeState: ActBadgeState;
  /** Whether to show the compact (short) label. */
  readonly compact?: boolean;
}

// ─── Component ───

export const ActIndicator = memo(function ActIndicator({
  badgeState,
  compact = false,
}: ActIndicatorProps) {
  const meta = ACT_METADATA[badgeState.currentAct];
  const label = compact
    ? shortBadgeLabel(badgeState.currentAct)
    : badgeLabel(badgeState.currentAct);

  const outOpacity = outgoingOpacity(badgeState);
  const inOpacity = incomingOpacity(badgeState);
  const isTransitioning = badgeState.phase === 'exiting' || badgeState.phase === 'entering';

  return (
    <div
      className="relative inline-flex items-center gap-2"
      style={{ minWidth: compact ? 80 : 160 }}
    >
      {/* Current/outgoing badge */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
        style={{
          background: meta.color,
          opacity: outOpacity,
          transition: isTransitioning ? 'opacity 300ms ease' : 'none',
        }}
      >
        <span>{meta.icon}</span>
        <span>{label}</span>
      </div>

      {/* Incoming badge (visible only during transitions) */}
      {badgeState.previousAct && inOpacity > 0 && (
        <div
          className="absolute inset-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
          style={{
            background: ACT_METADATA[badgeState.previousAct].color,
            opacity: inOpacity,
            transition: 'opacity 300ms ease',
          }}
        >
          <span>{ACT_METADATA[badgeState.previousAct].icon}</span>
          <span>
            {compact
              ? shortBadgeLabel(badgeState.previousAct)
              : badgeLabel(badgeState.previousAct)}
          </span>
        </div>
      )}

      {/* Iteration counter */}
      <span className="text-xs text-white/50 ml-1">
        {iterationLabel(badgeState.iteration)}
      </span>

      {/* Progress indicator */}
      {badgeState.progress !== null && (
        <div
          className="h-0.5 rounded-full"
          style={{
            width: 40,
            background: 'rgba(255,255,255,0.2)',
          }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${badgeState.progress * 100}%`,
              background: meta.color,
              transition: 'width 200ms linear',
            }}
          />
        </div>
      )}
    </div>
  );
});
