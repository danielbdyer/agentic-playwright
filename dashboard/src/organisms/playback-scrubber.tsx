/**
 * PlaybackScrubber — interactive timeline for flywheel time-lapse playback.
 *
 * Features from the spec (Part III):
 *   - Horizontal timeline with act-colored segments
 *   - Iteration boundary markers (vertical lines)
 *   - Bookmark chips with priority-ordered labels
 *   - Hover preview: iteration, act, timestamp, key metric
 *   - Click-to-seek anywhere on the timeline
 *   - Current position indicator (playhead)
 *   - Elapsed / total time display
 *   - Compact responsive layout
 *
 * Pure presentational component — all state management is in the parent
 * via usePlaybackController and useEventJournal. The scrubber receives
 * position, bookmarks, act segments, and callbacks.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Scrubber UI
 */

import { memo, useCallback, useRef, useState } from 'react';
import type { FlywheelAct } from '../types';

// ─── Domain Types ───

/** A segment of the timeline corresponding to one act. */
export interface ActSegment {
  readonly act: FlywheelAct;
  readonly startFraction: number; // [0, 1]
  readonly endFraction: number;   // [0, 1]
  readonly label: string;
}

/** Iteration boundary marker on the timeline. */
export interface IterationMarker {
  readonly iteration: number;
  readonly fraction: number; // [0, 1]
}

/** Bookmark chip for timeline display. */
export interface BookmarkChip {
  readonly id: string;
  readonly label: string;
  readonly fraction: number;    // [0, 1]
  readonly slotIndex: number | null;
  readonly kind: 'auto' | 'manual';
}

/** Hover preview data at a timeline position. */
export interface ScrubberPreview {
  readonly fraction: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly timestamp: string;
  readonly knowledgeHitRate: number;
}

// ─── Color Mapping ───

/** Act-specific colors for timeline segments. */
export const ACT_COLORS: Readonly<Record<FlywheelAct, string>> = {
  1: '#6366f1', // Indigo — Context Intake
  2: '#06b6d4', // Cyan — ARIA Capture
  3: '#f59e0b', // Amber — Suite Slicing
  4: '#10b981', // Emerald — Deterministic Generation
  5: '#ef4444', // Red — Execution & Failure
  6: '#8b5cf6', // Violet — Trust Gating
  7: '#3b82f6', // Blue — Meta-Measurement
} as const;

export const ACT_LABELS: Readonly<Record<FlywheelAct, string>> = {
  1: 'Intake',
  2: 'Capture',
  3: 'Slice',
  4: 'Compile',
  5: 'Execute',
  6: 'Gate',
  7: 'Measure',
} as const;

// ─── Pure Helpers ───

/** Format milliseconds as M:SS or H:MM:SS. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Clamp a fraction to [0, 1]. */
const clampFraction = (f: number): number => Math.max(0, Math.min(1, f));

/** Convert a mouse X position to a fraction within a container. */
export function mouseToFraction(clientX: number, rect: DOMRect): number {
  return clampFraction((clientX - rect.left) / rect.width);
}

/** Find the act segment at a given fraction. */
export function findActAtFraction(
  segments: readonly ActSegment[],
  fraction: number,
): ActSegment | null {
  return segments.find((s) => fraction >= s.startFraction && fraction <= s.endFraction) ?? null;
}

// ─── Component Props ───

export interface PlaybackScrubberProps {
  /** Current playback position [0, 1]. */
  readonly position: number;
  /** Total duration in milliseconds. */
  readonly totalDurationMs: number;
  /** Act segments for colored timeline. */
  readonly segments: readonly ActSegment[];
  /** Iteration boundary markers. */
  readonly iterationMarkers: readonly IterationMarker[];
  /** Bookmark chips on the timeline. */
  readonly bookmarks: readonly BookmarkChip[];
  /** Whether playback is currently playing. */
  readonly playing: boolean;
  /** Current playback speed label (e.g. "5×"). */
  readonly speedLabel: string;
  /** Callback when user clicks/drags to seek. */
  readonly onSeek: (fraction: number) => void;
  /** Callback when user clicks play/pause. */
  readonly onTogglePlay: () => void;
  /** Callback to generate hover preview data. */
  readonly onPreview?: (fraction: number) => ScrubberPreview | null;
  /** Whether scrubber is in compact mode. */
  readonly compact?: boolean;
}

// ─── Component ───

export const PlaybackScrubber = memo(function PlaybackScrubber({
  position,
  totalDurationMs,
  segments,
  iterationMarkers,
  bookmarks,
  playing,
  speedLabel,
  onSeek,
  onTogglePlay,
  onPreview,
  compact = false,
}: PlaybackScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<ScrubberPreview | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fraction = mouseToFraction(e.clientX, rect);
      onSeek(fraction);
    },
    [onSeek],
  );

  const handleTrackHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const fraction = mouseToFraction(e.clientX, rect);
      setHoverX(fraction);
      if (onPreview) {
        setPreview(onPreview(fraction));
      }
    },
    [onPreview],
  );

  const handleTrackLeave = useCallback(() => {
    setHoverX(null);
    setPreview(null);
  }, []);

  const elapsed = totalDurationMs * position;
  const remaining = totalDurationMs - elapsed;

  return (
    <div
      className={`flex flex-col gap-1 select-none ${compact ? 'px-2 py-1' : 'px-4 py-2'}`}
      style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 8 }}
    >
      {/* Top row: play button, time, speed */}
      <div className="flex items-center gap-3 text-xs text-white/80">
        <button
          onClick={onTogglePlay}
          className="text-white hover:text-emerald-400 transition-colors"
          style={{ fontSize: compact ? 14 : 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="font-mono">{formatDuration(elapsed)}</span>
        <span className="text-white/40">/</span>
        <span className="font-mono text-white/60">{formatDuration(totalDurationMs)}</span>
        <span className="ml-auto text-white/50">{speedLabel}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative cursor-pointer"
        style={{ height: compact ? 20 : 28, borderRadius: 4, overflow: 'hidden' }}
        onClick={handleTrackClick}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
      >
        {/* Act segments (colored background) */}
        {segments.map((seg) => (
          <div
            key={`seg-${seg.act}-${seg.startFraction}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${seg.startFraction * 100}%`,
              width: `${(seg.endFraction - seg.startFraction) * 100}%`,
              background: ACT_COLORS[seg.act],
              opacity: 0.3,
            }}
            title={`Act ${seg.act}: ${ACT_LABELS[seg.act]}`}
          />
        ))}

        {/* Iteration markers */}
        {iterationMarkers.map((marker) => (
          <div
            key={`iter-${marker.iteration}`}
            className="absolute top-0 bottom-0"
            style={{
              left: `${marker.fraction * 100}%`,
              width: 1,
              background: 'rgba(255,255,255,0.25)',
            }}
            title={`Iteration ${marker.iteration}`}
          />
        ))}

        {/* Bookmark chips */}
        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="absolute"
            style={{
              left: `${bm.fraction * 100}%`,
              top: 0,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: bm.kind === 'auto' ? '#fbbf24' : '#60a5fa',
              transform: 'translate(-50%, 2px)',
              zIndex: 2,
            }}
            title={`${bm.label}${bm.slotIndex ? ` (Ctrl+${bm.slotIndex})` : ''}`}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: `${position * 100}%`,
            width: 2,
            background: '#fff',
            zIndex: 3,
            boxShadow: '0 0 4px rgba(255,255,255,0.5)',
          }}
        />

        {/* Hover indicator */}
        {hoverX !== null && (
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${hoverX * 100}%`,
              width: 1,
              background: 'rgba(255,255,255,0.4)',
              zIndex: 1,
            }}
          />
        )}
      </div>

      {/* Hover preview tooltip */}
      {preview && hoverX !== null && (
        <div
          className="text-xs text-white/70 flex gap-3"
          style={{ minHeight: 16 }}
        >
          <span>Iter {preview.iteration}</span>
          <span style={{ color: ACT_COLORS[preview.act] }}>
            Act {preview.act}: {ACT_LABELS[preview.act]}
          </span>
          <span>{Math.round(preview.knowledgeHitRate * 100)}% hit rate</span>
        </div>
      )}
    </div>
  );
});
