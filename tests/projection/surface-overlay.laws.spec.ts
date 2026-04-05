import { expect, test } from '@playwright/test';
import {
  ROLE_COLORS,
  STAGGER_DELAY_MS,
  INITIAL_OVERLAY_STATE,
  addRegion,
  deactivatePulse,
  navigateToScreen,
  clearOverlays,
  regionColor,
  effectiveOpacity,
  staggerDelay,
  regionsForScreen,
  regionsByRole,
  normalizeBox,
  screenCount,
  type AriaRole,
} from '../../lib/domain/projection/surface-overlay';

const ALL_ROLES: readonly AriaRole[] = [
  'navigation', 'main', 'form', 'complementary', 'banner',
  'contentinfo', 'search', 'region', 'dialog', 'generic',
];

test.describe('SurfaceOverlay laws', () => {

  test('Law 1: exactly 10 ARIA roles with colors', () => {
    expect(ALL_ROLES).toHaveLength(10);
    ALL_ROLES.forEach((role) => {
      expect(ROLE_COLORS[role]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('Law 2: INITIAL_OVERLAY_STATE starts empty', () => {
    expect(INITIAL_OVERLAY_STATE.regions).toHaveLength(0);
    expect(INITIAL_OVERLAY_STATE.activeScreen).toBeNull();
    expect(INITIAL_OVERLAY_STATE.totalDiscovered).toBe(0);
  });

  test('Law 3: addRegion creates a region with correct properties', () => {
    const state = addRegion(
      INITIAL_OVERLAY_STATE, 'login', 'form', 'Login Form',
      { x: 10, y: 20, width: 300, height: 200 }, 5, 1,
    );
    expect(state.regions).toHaveLength(1);
    expect(state.regions[0]!.screen).toBe('login');
    expect(state.regions[0]!.role).toBe('form');
    expect(state.regions[0]!.pulseActive).toBe(true);
    expect(state.totalDiscovered).toBe(1);
  });

  test('Law 4: addRegion sets activeScreen', () => {
    const state = addRegion(
      INITIAL_OVERLAY_STATE, 'home', 'main', 'Main Content',
      { x: 0, y: 0, width: 1024, height: 768 }, 10, 1,
    );
    expect(state.activeScreen).toBe('home');
  });

  test('Law 5: addRegion dims previous screen when new screen detected', () => {
    let state = addRegion(
      INITIAL_OVERLAY_STATE, 'home', 'main', 'Main',
      { x: 0, y: 0, width: 1024, height: 768 }, 10, 1,
    );
    state = addRegion(
      state, 'search', 'form', 'Search',
      { x: 0, y: 0, width: 500, height: 400 }, 3, 2,
    );
    // First region should be dimmed
    expect(state.regions[0]!.dimmed).toBe(true);
    // Second region should be active
    expect(state.regions[1]!.dimmed).toBe(false);
    expect(state.activeScreen).toBe('search');
  });

  test('Law 6: deactivatePulse sets all pulses to false', () => {
    let state = addRegion(
      INITIAL_OVERLAY_STATE, 'home', 'main', 'M',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1,
    );
    expect(state.regions[0]!.pulseActive).toBe(true);
    state = deactivatePulse(state);
    expect(state.regions[0]!.pulseActive).toBe(false);
  });

  test('Law 7: navigateToScreen reactivates previously dimmed regions', () => {
    let state = addRegion(
      INITIAL_OVERLAY_STATE, 'home', 'main', 'Main',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1,
    );
    state = addRegion(state, 'other', 'form', 'Form',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 2,
    );
    // home is dimmed
    expect(state.regions[0]!.dimmed).toBe(true);
    // Navigate back to home
    state = navigateToScreen(state, 'home');
    expect(state.regions[0]!.dimmed).toBe(false);
    expect(state.regions[1]!.dimmed).toBe(true);
  });

  test('Law 8: clearOverlays removes all regions', () => {
    let state = addRegion(
      INITIAL_OVERLAY_STATE, 'home', 'main', 'M',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1,
    );
    state = clearOverlays(state);
    expect(state.regions).toHaveLength(0);
    expect(state.activeScreen).toBeNull();
  });

  test('Law 9: regionColor returns role color', () => {
    ALL_ROLES.forEach((role) => {
      const region = {
        id: 'test', screen: 's', role, label: 'L',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        childCount: 0, discoveredAt: 0, opacity: 0.4,
        pulseActive: false, dimmed: false,
      };
      expect(regionColor(region)).toBe(ROLE_COLORS[role]);
    });
  });

  test('Law 10: effectiveOpacity adds pulse boost when active', () => {
    const pulsing = {
      id: 'test', screen: 's', role: 'main' as AriaRole, label: 'L',
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
      childCount: 0, discoveredAt: 0, opacity: 0.4,
      pulseActive: true, dimmed: false,
    };
    const notPulsing = { ...pulsing, pulseActive: false };
    expect(effectiveOpacity(pulsing)).toBeGreaterThan(effectiveOpacity(notPulsing));
  });

  test('Law 11: staggerDelay increases with index', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(STAGGER_DELAY_MS);
    expect(staggerDelay(5)).toBe(5 * STAGGER_DELAY_MS);
  });

  test('Law 12: regionsForScreen filters correctly', () => {
    let state = addRegion(INITIAL_OVERLAY_STATE, 'home', 'main', 'M',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1);
    state = addRegion(state, 'home', 'navigation', 'N',
      { x: 0, y: 0, width: 100, height: 50 }, 2, 2);
    state = addRegion(state, 'search', 'form', 'F',
      { x: 0, y: 0, width: 200, height: 100 }, 1, 3);
    const homeRegions = regionsForScreen(state, 'home');
    expect(homeRegions).toHaveLength(2);
  });

  test('Law 13: normalizeBox converts to [0,1] range', () => {
    const norm = normalizeBox({ x: 100, y: 200, width: 300, height: 400 }, 1000, 800);
    expect(norm.x).toBeCloseTo(0.1, 5);
    expect(norm.y).toBeCloseTo(0.25, 5);
    expect(norm.w).toBeCloseTo(0.3, 5);
    expect(norm.h).toBeCloseTo(0.5, 5);
  });

  test('Law 14: screenCount tracks unique screens', () => {
    let state = addRegion(INITIAL_OVERLAY_STATE, 'home', 'main', 'M',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1);
    state = addRegion(state, 'home', 'navigation', 'N',
      { x: 0, y: 0, width: 100, height: 50 }, 2, 2);
    state = addRegion(state, 'search', 'form', 'F',
      { x: 0, y: 0, width: 200, height: 100 }, 1, 3);
    expect(screenCount(state)).toBe(2);
  });

  test('Law 15: regionsByRole groups correctly', () => {
    let state = addRegion(INITIAL_OVERLAY_STATE, 'home', 'main', 'M',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 1);
    state = addRegion(state, 'home', 'form', 'F',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 2);
    state = addRegion(state, 'other', 'form', 'F2',
      { x: 0, y: 0, width: 100, height: 100 }, 1, 3);
    const grouped = regionsByRole(state);
    expect(grouped.get('main')?.length).toBe(1);
    expect(grouped.get('form')?.length).toBe(2);
  });
});
