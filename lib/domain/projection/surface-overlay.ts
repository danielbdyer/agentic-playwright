/**
 * SurfaceOverlay — pure domain module for ARIA landmark region overlays.
 *
 * During Act 2 (ARIA Discovery), discovered surface regions are highlighted
 * on the screen plane. Each region gets a translucent overlay with:
 *   - Color by ARIA role (navigation=blue, main=green, form=amber)
 *   - Label positioned at region top-left
 *   - Staggered fade-in (150ms per region)
 *   - Pulsing highlight on active discovery
 *   - Fade to 30% opacity when discovery moves to next screen
 *
 * Architecture:
 *   surface-discovered → addRegion()
 *   route-navigated → dimPreviousScreen() + activateNewScreen()
 *   Act transition → fadeAll() or clearAll()
 *
 * Pure domain logic. No React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 2), Part IV
 */

// ─── Region Types ───

/** ARIA landmark roles for color mapping. */
export type AriaRole =
  | 'navigation'
  | 'main'
  | 'form'
  | 'complementary'
  | 'banner'
  | 'contentinfo'
  | 'search'
  | 'region'
  | 'dialog'
  | 'generic';

/** Bounding box in viewport coordinates. */
export interface ViewportBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A discovered surface region. */
export interface SurfaceRegion {
  readonly id: string;
  readonly screen: string;
  readonly role: AriaRole;
  readonly label: string;
  readonly boundingBox: ViewportBox;
  readonly childCount: number;
  readonly discoveredAt: number;   // Sequence number
  readonly opacity: number;        // Current render opacity [0, 1]
  readonly pulseActive: boolean;   // True during active discovery
  readonly dimmed: boolean;        // True when screen is no longer active
}

/** Full overlay system state. */
export interface SurfaceOverlayState {
  readonly regions: readonly SurfaceRegion[];
  readonly activeScreen: string | null;
  readonly totalDiscovered: number;
  readonly screens: ReadonlySet<string>;
}

// ─── Constants ───

/** Color mapping by ARIA role. */
export const ROLE_COLORS: Readonly<Record<AriaRole, string>> = {
  navigation:    '#3b82f6', // Blue
  main:          '#22c55e', // Green
  form:          '#f59e0b', // Amber
  complementary: '#8b5cf6', // Violet
  banner:        '#06b6d4', // Cyan
  contentinfo:   '#64748b', // Slate
  search:        '#ec4899', // Pink
  region:        '#6366f1', // Indigo
  dialog:        '#f97316', // Orange
  generic:       '#94a3b8', // Gray
} as const;

/** Stagger delay per region (ms). */
export const STAGGER_DELAY_MS = 150;

/** Active opacity for visible regions. */
const ACTIVE_OPACITY = 0.4;

/** Dimmed opacity for previous screen regions. */
const DIMMED_OPACITY = 0.15;

/** Pulse opacity boost. */
const PULSE_BOOST = 0.2;

export const INITIAL_OVERLAY_STATE: SurfaceOverlayState = {
  regions: [],
  activeScreen: null,
  totalDiscovered: 0,
  screens: new Set(),
};

// ─── State Transitions ───

/**
 * Add a newly discovered region.
 */
export function addRegion(
  state: SurfaceOverlayState,
  screen: string,
  role: AriaRole,
  label: string,
  boundingBox: ViewportBox,
  childCount: number,
  sequenceNumber: number,
): SurfaceOverlayState {
  const id = `surface-${screen}-${role}-${state.totalDiscovered}`;

  const newRegion: SurfaceRegion = {
    id,
    screen,
    role,
    label: label || role,
    boundingBox,
    childCount,
    discoveredAt: sequenceNumber,
    opacity: ACTIVE_OPACITY,
    pulseActive: true,
    dimmed: false,
  };

  const newScreens = new Set(state.screens);
  newScreens.add(screen);

  // If active screen changes, dim previous regions
  const shouldDim = state.activeScreen !== null && state.activeScreen !== screen;
  const updatedRegions = shouldDim
    ? state.regions.map((r) =>
        r.screen === state.activeScreen
          ? { ...r, dimmed: true, opacity: DIMMED_OPACITY, pulseActive: false }
          : r,
      )
    : state.regions;

  return {
    regions: [...updatedRegions, newRegion],
    activeScreen: screen,
    totalDiscovered: state.totalDiscovered + 1,
    screens: newScreens,
  };
}

/**
 * Deactivate pulse on all regions (called after stagger completes).
 */
export function deactivatePulse(state: SurfaceOverlayState): SurfaceOverlayState {
  return {
    ...state,
    regions: state.regions.map((r) => ({ ...r, pulseActive: false })),
  };
}

/**
 * Navigate to a new screen — dims previous, activates new.
 */
export function navigateToScreen(
  state: SurfaceOverlayState,
  newScreen: string,
): SurfaceOverlayState {
  return {
    ...state,
    activeScreen: newScreen,
    regions: state.regions.map((r) => {
      if (r.screen === newScreen) {
        return { ...r, dimmed: false, opacity: ACTIVE_OPACITY };
      }
      return { ...r, dimmed: true, opacity: DIMMED_OPACITY, pulseActive: false };
    }),
  };
}

/**
 * Clear all overlays (on act transition away from Act 2).
 */
export function clearOverlays(state: SurfaceOverlayState): SurfaceOverlayState {
  return {
    ...state,
    regions: [],
    activeScreen: null,
  };
}

// ─── Computed Properties ───

/**
 * Get the display color for a region (role color with opacity applied).
 */
export function regionColor(region: SurfaceRegion): string {
  return ROLE_COLORS[region.role];
}

/**
 * Get the effective opacity for a region, including pulse boost.
 */
export function effectiveOpacity(region: SurfaceRegion): number {
  return region.pulseActive
    ? Math.min(1, region.opacity + PULSE_BOOST)
    : region.opacity;
}

/**
 * Compute stagger delay for the nth region within a screen.
 */
export function staggerDelay(regionIndex: number): number {
  return regionIndex * STAGGER_DELAY_MS;
}

/**
 * Get regions filtered by screen.
 */
export function regionsForScreen(
  state: SurfaceOverlayState,
  screen: string,
): readonly SurfaceRegion[] {
  return state.regions.filter((r) => r.screen === screen);
}

/**
 * Get regions filtered by role.
 */
export function regionsByRole(
  state: SurfaceOverlayState,
): ReadonlyMap<AriaRole, readonly SurfaceRegion[]> {
  return state.regions.reduce<Map<AriaRole, SurfaceRegion[]>>(
    (map, region) => {
      const existing = map.get(region.role);
      return map.set(region.role, existing ? [...existing, region] : [region]);
    },
    new Map(),
  );
}

/**
 * Convert viewport box to normalized [0,1] coordinates for Three.js mapping.
 */
export function normalizeBox(
  box: ViewportBox,
  viewportWidth: number,
  viewportHeight: number,
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
  return {
    x: box.x / viewportWidth,
    y: box.y / viewportHeight,
    w: box.width / viewportWidth,
    h: box.height / viewportHeight,
  };
}

/**
 * Count unique screens discovered.
 */
export function screenCount(state: SurfaceOverlayState): number {
  return state.screens.size;
}
