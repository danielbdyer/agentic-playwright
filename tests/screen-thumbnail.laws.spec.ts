import { expect, test } from '@playwright/test';
import {
  INITIAL_STRIP_STATE,
  THUMBNAIL_WIDTH_PX,
  THUMBNAIL_GAP_PX,
  addScreen,
  navigateToScreen,
  updateElementCount,
  updateRegionCount,
  setHovered,
  computePreview,
  visibleThumbnails,
  totalStripWidth,
  isScrollable,
  scrollToScreen,
  screenCount,
  visitedScreens,
  activeScreen,
} from '../lib/domain/screen-thumbnail';

test.describe('ScreenThumbnail laws', () => {

  test('Law 1: INITIAL_STRIP_STATE is empty', () => {
    expect(INITIAL_STRIP_STATE.thumbnails).toHaveLength(0);
    expect(INITIAL_STRIP_STATE.activeScreenId).toBeNull();
    expect(screenCount(INITIAL_STRIP_STATE)).toBe(0);
  });

  test('Law 2: addScreen adds a new thumbnail', () => {
    const state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    expect(state.thumbnails).toHaveLength(1);
    expect(state.activeScreenId).toBe('login');
    expect(state.thumbnails[0]!.visitState).toBe('active');
  });

  test('Law 3: addScreen dims previous active screen', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    state = addScreen(state, 'home', '/home', 'Home', 2);
    expect(state.thumbnails[0]!.visitState).toBe('visited');
    expect(state.thumbnails[1]!.visitState).toBe('active');
    expect(state.activeScreenId).toBe('home');
  });

  test('Law 4: addScreen does not duplicate existing screenId', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    state = addScreen(state, 'home', '/home', 'Home', 2);
    state = addScreen(state, 'login', '/login', 'Login', 3);
    expect(state.thumbnails).toHaveLength(2);
    expect(state.activeScreenId).toBe('login');
  });

  test('Law 5: navigateToScreen reactivates visited screen', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    state = addScreen(state, 'home', '/home', 'Home', 2);
    state = navigateToScreen(state, 'login', 3);
    expect(state.thumbnails[0]!.visitState).toBe('active');
    expect(state.thumbnails[1]!.visitState).toBe('visited');
  });

  test('Law 6: updateElementCount sets count on target screen', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    state = updateElementCount(state, 'login', 5);
    expect(state.thumbnails[0]!.elementCount).toBe(5);
  });

  test('Law 7: updateRegionCount sets count on target screen', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login', 1);
    state = updateRegionCount(state, 'login', 3);
    expect(state.thumbnails[0]!.regionCount).toBe(3);
  });

  test('Law 8: setHovered tracks hovered screen', () => {
    const state = setHovered(INITIAL_STRIP_STATE, 'login');
    expect(state.hoveredScreenId).toBe('login');
    const cleared = setHovered(state, null);
    expect(cleared.hoveredScreenId).toBeNull();
  });

  test('Law 9: computePreview returns data for existing screen', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 'login', '/login', 'Login Page', 1);
    state = updateElementCount(state, 'login', 8);
    const preview = computePreview(state, 'login');
    expect(preview).not.toBeNull();
    expect(preview!.title).toBe('Login Page');
    expect(preview!.elementCount).toBe(8);
  });

  test('Law 10: computePreview returns null for unknown screen', () => {
    expect(computePreview(INITIAL_STRIP_STATE, 'unknown')).toBeNull();
  });

  test('Law 11: totalStripWidth computes from thumbnails and gaps', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 's1', '/s1', 'S1', 1);
    state = addScreen(state, 's2', '/s2', 'S2', 2);
    state = addScreen(state, 's3', '/s3', 'S3', 3);
    const expected = 3 * THUMBNAIL_WIDTH_PX + 2 * THUMBNAIL_GAP_PX;
    expect(totalStripWidth(state)).toBe(expected);
  });

  test('Law 12: totalStripWidth is 0 for empty state', () => {
    expect(totalStripWidth(INITIAL_STRIP_STATE)).toBe(0);
  });

  test('Law 13: isScrollable returns false when under maxVisible', () => {
    const state = addScreen(INITIAL_STRIP_STATE, 's1', '/s1', 'S1', 1);
    expect(isScrollable(state)).toBe(false);
  });

  test('Law 14: visibleThumbnails respects maxVisible window', () => {
    let state = { ...INITIAL_STRIP_STATE, maxVisible: 2 };
    state = addScreen(state, 's1', '/s1', 'S1', 1);
    state = addScreen(state, 's2', '/s2', 'S2', 2);
    state = addScreen(state, 's3', '/s3', 'S3', 3);
    const visible = visibleThumbnails(state);
    expect(visible).toHaveLength(2);
  });

  test('Law 15: scrollToScreen adjusts offset', () => {
    let state = { ...INITIAL_STRIP_STATE, maxVisible: 2 };
    state = addScreen(state, 's1', '/s1', 'S1', 1);
    state = addScreen(state, 's2', '/s2', 'S2', 2);
    state = addScreen(state, 's3', '/s3', 'S3', 3);
    state = addScreen(state, 's4', '/s4', 'S4', 4);
    const scrolled = scrollToScreen(state, 's4');
    expect(scrolled.scrollOffset).toBeGreaterThan(0);
  });

  test('Law 16: visitedScreens excludes active', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 's1', '/s1', 'S1', 1);
    state = addScreen(state, 's2', '/s2', 'S2', 2);
    const visited = visitedScreens(state);
    expect(visited).toHaveLength(1);
    expect(visited[0]!.screenId).toBe('s1');
  });

  test('Law 17: activeScreen returns current active', () => {
    let state = addScreen(INITIAL_STRIP_STATE, 's1', '/s1', 'S1', 1);
    state = addScreen(state, 's2', '/s2', 'S2', 2);
    const active = activeScreen(state);
    expect(active).not.toBeNull();
    expect(active!.screenId).toBe('s2');
  });

  test('Law 18: activeScreen returns null for empty state', () => {
    expect(activeScreen(INITIAL_STRIP_STATE)).toBeNull();
  });
});
