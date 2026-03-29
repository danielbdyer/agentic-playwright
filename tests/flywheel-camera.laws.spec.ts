import { expect, test } from '@playwright/test';
import { CAMERA_STATES, TRANSITION_DURATIONS } from '../dashboard/src/hooks/use-camera-choreography';
import type { FlywheelAct } from '../dashboard/src/types';

test.describe('Camera choreography laws', () => {
  test('Law 1: CAMERA_STATES has exactly 7 entries (acts 1-7)', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      expect(CAMERA_STATES[act]).toBeDefined();
      expect(CAMERA_STATES[act].name).toBeTruthy();
    });
  });

  test('Law 2: all positions are 3D vectors', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      const state = CAMERA_STATES[act];
      expect(state.position).toHaveLength(3);
      expect(state.target).toHaveLength(3);
      state.position.forEach((v) => expect(typeof v).toBe('number'));
      state.target.forEach((v) => expect(typeof v).toBe('number'));
    });
  });

  test('Law 3: all FOVs are positive', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      expect(CAMERA_STATES[act].fov).toBeGreaterThan(0);
    });
  });

  test('Law 4: every consecutive act pair has a defined transition duration', () => {
    const pairs = ['1->2', '2->3', '3->4', '4->5', '5->6', '6->7'];
    pairs.forEach((key) => {
      expect(TRANSITION_DURATIONS[key]).toBeDefined();
      expect(TRANSITION_DURATIONS[key]).toBeGreaterThan(0);
    });
  });

  test('Law 5: loop transition 7->4 exists', () => {
    expect(TRANSITION_DURATIONS['7->4']).toBeDefined();
    expect(TRANSITION_DURATIONS['7->4']).toBeGreaterThan(0);
  });
});
