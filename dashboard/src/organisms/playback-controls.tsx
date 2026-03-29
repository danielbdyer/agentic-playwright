/**
 * PlaybackControls organism — scrubber, speed selector, bookmark navigation.
 *
 * Composes PlaybackScrubber + SpeedTierSelector + BookmarkChip molecules
 * into a unified playback control bar. Supports three modes:
 *   - Live: shows real-time position with no scrubbing
 *   - Playback: full scrubber with speed control
 *   - Compact: minimal controls for small viewports
 *
 * All state management is delegated to usePlaybackController hook.
 *
 * @see docs/first-day-flywheel-visualization.md Part III, Part VIII
 */

import { memo, useCallback } from 'react';
import {
  PlaybackScrubber,
  type ActSegment,
  type IterationMarker,
  type BookmarkChip as BookmarkChipType,
  type ScrubberPreview,
} from './playback-scrubber';
import { SpeedTierSelector } from '../molecules/speed-tier-selector';
import { BookmarkChip } from '../molecules/bookmark-chip';

// ─── Types ───

export type PlaybackMode = 'live' | 'playback' | 'compact';

export interface PlaybackControlsProps {
  /** Current playback mode. */
  readonly mode: PlaybackMode;
  /** Current playback position [0, 1]. */
  readonly position: number;
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Whether currently playing. */
  readonly playing: boolean;
  /** Current speed multiplier. */
  readonly speed: number;
  /** Act timeline segments. */
  readonly segments: readonly ActSegment[];
  /** Iteration boundary markers. */
  readonly iterationMarkers: readonly IterationMarker[];
  /** Bookmarks on the timeline. */
  readonly bookmarks: readonly BookmarkChipType[];
  /** Callback when user seeks. */
  readonly onSeek: (fraction: number) => void;
  /** Callback when user toggles play/pause. */
  readonly onTogglePlay: () => void;
  /** Callback when user changes speed. */
  readonly onSpeedChange: (speed: number) => void;
  /** Callback when user clicks a bookmark. */
  readonly onBookmarkClick?: (id: string) => void;
  /** Callback to generate hover preview. */
  readonly onPreview?: (fraction: number) => ScrubberPreview | null;
}

// ─── Pure Helpers ───

/** Format speed as label. */
export function speedLabel(speed: number): string {
  return speed < 1 ? `${speed}×` : `${speed}×`;
}

// ─── Component ───

export const PlaybackControls = memo(function PlaybackControls({
  mode,
  position,
  totalDurationMs,
  playing,
  speed,
  segments,
  iterationMarkers,
  bookmarks,
  onSeek,
  onTogglePlay,
  onSpeedChange,
  onBookmarkClick,
  onPreview,
}: PlaybackControlsProps) {
  const isCompact = mode === 'compact';

  const handleBookmarkClick = useCallback(
    (id: string) => {
      const bm = bookmarks.find((b) => b.id === id);
      if (bm) {
        onSeek(bm.fraction);
        onBookmarkClick?.(id);
      }
    },
    [bookmarks, onSeek, onBookmarkClick],
  );

  if (mode === 'live') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5"
        style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 8 }}
      >
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-xs text-white/70">LIVE</span>
        <SpeedTierSelector currentSpeed={speed} onSpeedChange={onSpeedChange} compact />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Main scrubber */}
      <PlaybackScrubber
        position={position}
        totalDurationMs={totalDurationMs}
        segments={segments}
        iterationMarkers={iterationMarkers}
        bookmarks={bookmarks}
        playing={playing}
        speedLabel={speedLabel(speed)}
        onSeek={onSeek}
        onTogglePlay={onTogglePlay}
        {...(onPreview ? { onPreview } : {})}
        {...(isCompact ? { compact: true } : {})}
      />

      {/* Bottom bar: speed + bookmarks */}
      {!isCompact && (
        <div className="flex items-center gap-2 px-4">
          <SpeedTierSelector
            currentSpeed={speed}
            onSpeedChange={onSpeedChange}
          />
          {bookmarks.length > 0 && (
            <div className="flex items-center gap-1 ml-auto overflow-x-auto">
              {bookmarks.slice(0, 5).map((bm) => (
                <BookmarkChip
                  key={bm.id}
                  bookmark={bm}
                  onClick={handleBookmarkClick}
                  compact
                />
              ))}
              {bookmarks.length > 5 && (
                <span className="text-xs text-white/30">
                  +{bookmarks.length - 5}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
