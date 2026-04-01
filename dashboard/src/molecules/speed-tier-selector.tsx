/**
 * SpeedTierSelector molecule — playback speed dropdown/selector.
 *
 * Displays available playback speed tiers and allows selection.
 * Speeds: 0.5×, 1×, 5×, 10×, 25×, 50×, 100×
 *
 * Consumes pure domain logic from lib/domain/speed-tier-batcher.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Playback Speed Tiers
 */

import { memo, useCallback, useState } from 'react';
import { SPEED_TIERS, type SpeedTier } from '../../../lib/domain/projection/speed-tier-batcher';

// ─── Component Props ───

export interface SpeedTierSelectorProps {
  readonly currentSpeed: number;
  readonly onSpeedChange: (speed: number) => void;
  readonly compact?: boolean;
}

// ─── Pure Helpers ───

/** Format speed as display label. */
export function formatSpeed(speed: number): string {
  return speed < 1 ? `${speed}×` : `${speed}×`;
}

/** Find the nearest tier for a speed value. */
export function nearestTier(speed: number): SpeedTier {
  return SPEED_TIERS.reduce((closest, tier) =>
    Math.abs(tier.speed - speed) < Math.abs(closest.speed - speed) ? tier : closest,
  );
}

// ─── Component ───

export const SpeedTierSelector = memo(function SpeedTierSelector({
  currentSpeed,
  onSpeedChange,
  compact = false,
}: SpeedTierSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const current = nearestTier(currentSpeed);

  const handleSelect = useCallback(
    (speed: number) => {
      onSpeedChange(speed);
      setIsOpen(false);
    },
    [onSpeedChange],
  );

  return (
    <div className="relative inline-block">
      {/* Current speed button */}
      <button
        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-white/80 hover:text-white transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
        title={`Speed: ${current.label} (${current.batchingLevel} batching)`}
      >
        <span>{current.label}</span>
        <span className="text-white/40">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute bottom-full mb-1 left-0 flex flex-col rounded overflow-hidden shadow-lg"
          style={{ background: 'rgba(0,0,0,0.9)', border: '1px solid rgba(255,255,255,0.1)', zIndex: 50 }}
        >
          {SPEED_TIERS.map((tier) => (
            <button
              key={tier.speed}
              className={`px-3 py-1.5 text-xs text-left font-mono hover:bg-white/10 transition-colors ${
                tier.speed === currentSpeed ? 'text-emerald-400' : 'text-white/70'
              }`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => handleSelect(tier.speed)}
            >
              {tier.label}
              {!compact && (
                <span className="text-white/30 ml-2">
                  {tier.batchingLevel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
