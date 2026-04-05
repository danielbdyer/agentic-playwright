/**
 * BookmarkChip molecule — individual bookmark indicator on timeline.
 *
 * Renders a single bookmark as a small colored dot with label tooltip.
 * Auto-bookmarks are amber, manual bookmarks are blue.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Bookmark System
 */

import { memo } from 'react';

// ─── Types ───

export type BookmarkKind = 'auto' | 'manual';

export interface BookmarkChipData {
  readonly id: string;
  readonly label: string;
  readonly fraction: number;    // [0, 1] position on timeline
  readonly kind: BookmarkKind;
  readonly slotIndex: number | null; // 1-9 for Ctrl+N shortcuts
}

export interface BookmarkChipProps {
  readonly bookmark: BookmarkChipData;
  readonly onClick?: (id: string) => void;
  readonly compact?: boolean;
}

// ─── Pure Helpers ───

/** Color by bookmark kind. */
export function bookmarkColor(kind: BookmarkKind): string {
  return kind === 'auto' ? '#fbbf24' : '#60a5fa';
}

/** Format shortcut hint. */
export function shortcutHint(slotIndex: number | null): string {
  return slotIndex !== null ? ` (Ctrl+${slotIndex})` : '';
}

// ─── Component ───

export const BookmarkChip = memo(function BookmarkChip({
  bookmark,
  onClick,
  compact = false,
}: BookmarkChipProps) {
  const handleClick = () => {
    onClick?.(bookmark.id);
  };

  const color = bookmarkColor(bookmark.kind);

  return (
    <div
      className="inline-flex items-center gap-1 cursor-pointer"
      onClick={handleClick}
      title={`${bookmark.label}${shortcutHint(bookmark.slotIndex)}`}
      style={{ opacity: 0.9 }}
    >
      {/* Dot */}
      <div
        style={{
          width: compact ? 6 : 8,
          height: compact ? 6 : 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      {/* Label (only in non-compact mode) */}
      {!compact && (
        <span className="text-xs text-white/60 truncate" style={{ maxWidth: 80 }}>
          {bookmark.label}
        </span>
      )}
    </div>
  );
});
