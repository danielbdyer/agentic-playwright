/**
 * ScreenThumbnail — pure domain module for multi-screen discovery context.
 *
 * Solves Part X Challenge 6: "Multi-Screen Discovery Context Loss".
 *
 * When the screen plane texture replaces with a new screen, the operator
 * loses reference to previous discoveries. This module manages a thumbnail
 * strip at the bottom of the viewport showing all discovered screens.
 *
 * Features:
 *   - Ordered strip of screen thumbnails (left-to-right, chronological)
 *   - Active screen highlighted with border
 *   - Visited screens show element count badges
 *   - Hover preview: tooltip with screen name, element count, region count
 *   - Click to restore: switches screen plane back to thumbnail
 *   - Observatory screen nodes cross-reference thumbnails
 *
 * Strip layout:
 *   ┌─────┬─────┬─────┬─────┬─────┐
 *   │ 🟢  │ 🟢  │ 🔵  │     │     │
 *   │login│home │srch │ ... │     │
 *   └─────┴─────┴─────┴─────┴─────┘
 *     ✓4    ✓7    ★3   (active)
 *
 * Pure domain logic. No React.
 *
 * @see docs/first-day-flywheel-visualization.md Part X Challenge 6
 */

// ─── Types ───

/** Visit state for a screen. */
export type ScreenVisitState = 'unvisited' | 'active' | 'visited';

/** Thumbnail data for one discovered screen. */
export interface ScreenThumbnail {
  readonly screenId: string;
  readonly url: string;
  readonly title: string;              // Short display name
  readonly visitOrder: number;         // 0-based order of discovery
  readonly elementCount: number;       // Elements discovered on this screen
  readonly regionCount: number;        // ARIA regions discovered
  readonly visitState: ScreenVisitState;
  readonly discoveredAt: number;       // Sequence number of first visit
  readonly lastVisitedAt: number;      // Sequence number of latest visit
}

/** Hover preview data. */
export interface ThumbnailPreview {
  readonly screenId: string;
  readonly title: string;
  readonly elementCount: number;
  readonly regionCount: number;
  readonly discoveredElements: readonly string[]; // Up to 5 element names
  readonly visitCount: number;
}

/** Full thumbnail strip state. */
export interface ThumbnailStripState {
  readonly thumbnails: readonly ScreenThumbnail[];
  readonly activeScreenId: string | null;
  readonly hoveredScreenId: string | null;
  readonly maxVisible: number;         // How many fit in viewport
  readonly scrollOffset: number;       // For scrolling when many screens
}

// ─── Constants ───

/** Thumbnail width in pixels. */
export const THUMBNAIL_WIDTH_PX = 80;

/** Thumbnail height in pixels. */
export const THUMBNAIL_HEIGHT_PX = 50;

/** Gap between thumbnails in pixels. */
export const THUMBNAIL_GAP_PX = 4;

/** Maximum thumbnails visible at once. */
export const DEFAULT_MAX_VISIBLE = 8;

export const INITIAL_STRIP_STATE: ThumbnailStripState = {
  thumbnails: [],
  activeScreenId: null,
  hoveredScreenId: null,
  maxVisible: DEFAULT_MAX_VISIBLE,
  scrollOffset: 0,
};

// ─── State Transitions ───

/**
 * Register a newly discovered screen.
 */
export function addScreen(
  state: ThumbnailStripState,
  screenId: string,
  url: string,
  title: string,
  sequenceNumber: number,
): ThumbnailStripState {
  // Don't add duplicates
  if (state.thumbnails.some((t) => t.screenId === screenId)) {
    return navigateToScreen(state, screenId, sequenceNumber);
  }

  const newThumbnail: ScreenThumbnail = {
    screenId,
    url,
    title: title || screenId,
    visitOrder: state.thumbnails.length,
    elementCount: 0,
    regionCount: 0,
    visitState: 'active',
    discoveredAt: sequenceNumber,
    lastVisitedAt: sequenceNumber,
  };

  // Dim previous active screen
  const updated = state.thumbnails.map((t) =>
    t.visitState === 'active'
      ? { ...t, visitState: 'visited' as ScreenVisitState }
      : t,
  );

  return {
    ...state,
    thumbnails: [...updated, newThumbnail],
    activeScreenId: screenId,
  };
}

/**
 * Navigate to an existing screen (revisit).
 */
export function navigateToScreen(
  state: ThumbnailStripState,
  screenId: string,
  sequenceNumber: number,
): ThumbnailStripState {
  const updated = state.thumbnails.map((t) => {
    if (t.screenId === screenId) {
      return { ...t, visitState: 'active' as ScreenVisitState, lastVisitedAt: sequenceNumber };
    }
    if (t.visitState === 'active') {
      return { ...t, visitState: 'visited' as ScreenVisitState };
    }
    return t;
  });

  return {
    ...state,
    thumbnails: updated,
    activeScreenId: screenId,
  };
}

/**
 * Update element count for a screen.
 */
export function updateElementCount(
  state: ThumbnailStripState,
  screenId: string,
  elementCount: number,
): ThumbnailStripState {
  return {
    ...state,
    thumbnails: state.thumbnails.map((t) =>
      t.screenId === screenId
        ? { ...t, elementCount }
        : t,
    ),
  };
}

/**
 * Update region count for a screen.
 */
export function updateRegionCount(
  state: ThumbnailStripState,
  screenId: string,
  regionCount: number,
): ThumbnailStripState {
  return {
    ...state,
    thumbnails: state.thumbnails.map((t) =>
      t.screenId === screenId
        ? { ...t, regionCount }
        : t,
    ),
  };
}

/**
 * Set the hovered thumbnail.
 */
export function setHovered(
  state: ThumbnailStripState,
  screenId: string | null,
): ThumbnailStripState {
  return { ...state, hoveredScreenId: screenId };
}

// ─── Computed Properties ───

/**
 * Compute hover preview data for a screen.
 */
export function computePreview(
  state: ThumbnailStripState,
  screenId: string,
): ThumbnailPreview | null {
  const thumb = state.thumbnails.find((t) => t.screenId === screenId);
  if (!thumb) return null;

  // Count visits (how many times this screen has been active)
  const visitCount = state.thumbnails.filter(
    (t) => t.screenId === screenId,
  ).length;

  return {
    screenId: thumb.screenId,
    title: thumb.title,
    elementCount: thumb.elementCount,
    regionCount: thumb.regionCount,
    discoveredElements: [], // Would be populated from surface overlay state
    visitCount,
  };
}

/**
 * Get the visible thumbnail window (handles scrolling).
 */
export function visibleThumbnails(
  state: ThumbnailStripState,
): readonly ScreenThumbnail[] {
  const start = state.scrollOffset;
  const end = start + state.maxVisible;
  return state.thumbnails.slice(start, end);
}

/**
 * Compute the total strip width in pixels.
 */
export function totalStripWidth(state: ThumbnailStripState): number {
  const count = state.thumbnails.length;
  if (count === 0) return 0;
  return count * THUMBNAIL_WIDTH_PX + (count - 1) * THUMBNAIL_GAP_PX;
}

/**
 * Should the strip be scrollable?
 */
export function isScrollable(state: ThumbnailStripState): boolean {
  return state.thumbnails.length > state.maxVisible;
}

/**
 * Scroll the strip to ensure a screen is visible.
 */
export function scrollToScreen(
  state: ThumbnailStripState,
  screenId: string,
): ThumbnailStripState {
  const index = state.thumbnails.findIndex((t) => t.screenId === screenId);
  if (index < 0) return state;

  const currentEnd = state.scrollOffset + state.maxVisible;
  if (index >= state.scrollOffset && index < currentEnd) {
    return state; // Already visible
  }

  // Scroll to put the target roughly in the center
  const newOffset = Math.max(0, index - Math.floor(state.maxVisible / 2));
  return { ...state, scrollOffset: newOffset };
}

/**
 * Get the screen count.
 */
export function screenCount(state: ThumbnailStripState): number {
  return state.thumbnails.length;
}

/**
 * Get all visited (non-active) screens.
 */
export function visitedScreens(
  state: ThumbnailStripState,
): readonly ScreenThumbnail[] {
  return state.thumbnails.filter((t) => t.visitState === 'visited');
}

/**
 * Get the active screen thumbnail, if any.
 */
export function activeScreen(
  state: ThumbnailStripState,
): ScreenThumbnail | null {
  return state.thumbnails.find((t) => t.visitState === 'active') ?? null;
}
