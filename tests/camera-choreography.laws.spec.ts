import { expect, test } from '@playwright/test';
import {
  CAMERA_STATES,
  ACT_CAMERA_MAP,
  TRANSITION_DURATIONS,
  cubicEaseInOut,
  lerpVec3,
  lerpScalar,
  createTransition,
  advanceTransition,
  isTransitionComplete,
  interpolateCamera,
  activateOverride,
  deactivateOverride,
  resolveCamera,
  getTransitionDuration,
  cameraStateForAct,
  INITIAL_OVERRIDE,
  type CameraStateName,
} from '../lib/domain/camera-choreography';

const ALL_STATE_NAMES: readonly CameraStateName[] = [
  'void', 'harvest', 'slice', 'compile', 'gate', 'measure', 'summary',
];

test.describe('CameraChoreography laws', () => {

  test('Law 1: exactly 7 camera states defined', () => {
    expect(ALL_STATE_NAMES).toHaveLength(7);
    ALL_STATE_NAMES.forEach((name) => {
      expect(CAMERA_STATES[name]).toBeDefined();
    });
  });

  test('Law 2: every camera state has position[3], target[3], and positive FOV', () => {
    ALL_STATE_NAMES.forEach((name) => {
      const state = CAMERA_STATES[name];
      expect(state.position).toHaveLength(3);
      expect(state.target).toHaveLength(3);
      expect(state.fov).toBeGreaterThan(0);
    });
  });

  test('Law 3: all 7 acts map to a camera state', () => {
    ([1, 2, 3, 4, 5, 6, 7] as const).forEach((act) => {
      expect(ACT_CAMERA_MAP[act]).toBeDefined();
      expect(ALL_STATE_NAMES).toContain(ACT_CAMERA_MAP[act]);
    });
  });

  test('Law 4: transition durations are all positive', () => {
    Object.values(TRANSITION_DURATIONS).forEach((duration) => {
      expect(duration).toBeGreaterThan(0);
    });
  });

  test('Law 5: cubicEaseInOut maps 0→0, 0.5→0.5, 1→1', () => {
    expect(cubicEaseInOut(0)).toBe(0);
    expect(cubicEaseInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(cubicEaseInOut(1)).toBe(1);
  });

  test('Law 6: cubicEaseInOut clamps out-of-range values', () => {
    expect(cubicEaseInOut(-1)).toBe(0);
    expect(cubicEaseInOut(2)).toBe(1);
  });

  test('Law 7: lerpVec3 at t=0 returns a, at t=1 returns b', () => {
    const a: readonly [number, number, number] = [1, 2, 3];
    const b: readonly [number, number, number] = [4, 5, 6];
    expect(lerpVec3(a, b, 0)).toEqual([1, 2, 3]);
    expect(lerpVec3(a, b, 1)).toEqual([4, 5, 6]);
  });

  test('Law 8: lerpScalar interpolates linearly', () => {
    expect(lerpScalar(0, 10, 0.5)).toBe(5);
    expect(lerpScalar(10, 20, 0.25)).toBe(12.5);
  });

  test('Law 9: createTransition starts at progress 0', () => {
    const t = createTransition(1, 2);
    expect(t.progress).toBe(0);
    expect(t.elapsedMs).toBe(0);
    expect(t.durationMs).toBeGreaterThan(0);
  });

  test('Law 10: advanceTransition increases progress', () => {
    const t = createTransition(1, 2);
    const advanced = advanceTransition(t, t.durationMs / 2);
    expect(advanced.progress).toBeCloseTo(0.5, 3);
    expect(advanced.elapsedMs).toBe(t.durationMs / 2);
  });

  test('Law 11: advanceTransition clamps at 1.0', () => {
    const t = createTransition(1, 2);
    const advanced = advanceTransition(t, t.durationMs * 2);
    expect(advanced.progress).toBe(1);
  });

  test('Law 12: isTransitionComplete returns true at progress 1', () => {
    const t = createTransition(1, 2);
    expect(isTransitionComplete(t)).toBe(false);
    const done = advanceTransition(t, t.durationMs);
    expect(isTransitionComplete(done)).toBe(true);
  });

  test('Law 13: interpolateCamera at progress 0 returns from state', () => {
    const t = createTransition(1, 2);
    const cam = interpolateCamera(t);
    expect(cam.position[0]).toBeCloseTo(t.from.position[0], 3);
    expect(cam.position[1]).toBeCloseTo(t.from.position[1], 3);
    expect(cam.position[2]).toBeCloseTo(t.from.position[2], 3);
  });

  test('Law 14: interpolateCamera at progress 1 returns to state', () => {
    const t = createTransition(1, 2);
    const done = advanceTransition(t, t.durationMs);
    const cam = interpolateCamera(done);
    expect(cam.position[0]).toBeCloseTo(done.to.position[0], 3);
    expect(cam.position[1]).toBeCloseTo(done.to.position[1], 3);
    expect(cam.position[2]).toBeCloseTo(done.to.position[2], 3);
  });

  test('Law 15: operator override takes precedence over transition', () => {
    const override = activateOverride([10, 20, 30], [0, 0, 0], 90, Date.now());
    const t = createTransition(1, 2);
    const cam = resolveCamera(1, t, override);
    expect(cam.position).toEqual([10, 20, 30]);
    expect(cam.fov).toBe(90);
  });

  test('Law 16: deactivateOverride returns to INITIAL_OVERRIDE', () => {
    const override = deactivateOverride();
    expect(override).toEqual(INITIAL_OVERRIDE);
    expect(override.active).toBe(false);
  });

  test('Law 17: resolveCamera falls back to static position when no transition', () => {
    const cam = resolveCamera(3, null, INITIAL_OVERRIDE);
    const expected = CAMERA_STATES[ACT_CAMERA_MAP[3]];
    expect(cam.position).toEqual(expected.position);
    expect(cam.fov).toBe(expected.fov);
  });

  test('Law 18: speedMultiplier scales transition duration', () => {
    const normal = createTransition(1, 2, 1.0);
    const fast = createTransition(1, 2, 2.0);
    expect(fast.durationMs).toBe(Math.round(normal.durationMs / 2));
  });

  test('Law 19: getTransitionDuration returns defined value for listed pair', () => {
    expect(getTransitionDuration(1, 2)).toBe(2500);
    expect(getTransitionDuration(7, 4)).toBe(2500);
  });

  test('Law 20: getTransitionDuration returns 2000 fallback for unlisted pair', () => {
    expect(getTransitionDuration(1, 7)).toBe(2000);
  });

  test('Law 21: cameraStateForAct returns correct mapping', () => {
    expect(cameraStateForAct(1)).toBe('void');
    expect(cameraStateForAct(6)).toBe('gate');
    expect(cameraStateForAct(7)).toBe('measure');
  });
});
