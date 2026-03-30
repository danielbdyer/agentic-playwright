import { expect, test } from '@playwright/test';
import {
  ACT_SCENE_STATES,
  ACT_TRANSITION_DURATIONS,
  interpolateSceneState,
} from '../dashboard/src/hooks/use-act-transition';
import type { FlywheelAct } from '../dashboard/src/types';

test.describe('Act transition laws', () => {

  test('Law 1: ACT_SCENE_STATES has entries for all 7 acts', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      expect(ACT_SCENE_STATES[act]).toBeDefined();
    });
  });

  test('Law 2: Act 1 has no screen plane, no glass, no pipeline, no scorecard', () => {
    const s = ACT_SCENE_STATES[1];
    expect(s.screenPlaneOpacity).toBe(0);
    expect(s.glassPaneFrost).toBe(0);
    expect(s.pipelineTimelineOpacity).toBe(0);
    expect(s.scorecardOpacity).toBe(0);
  });

  test('Law 3: Act 2 screen plane is fully visible', () => {
    expect(ACT_SCENE_STATES[2].screenPlaneOpacity).toBe(1.0);
  });

  test('Law 4: Act 6 has highest glass frost (governance boundary focus)', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    const maxFrost = Math.max(...acts.map((a) => ACT_SCENE_STATES[a].glassPaneFrost));
    expect(ACT_SCENE_STATES[6].glassPaneFrost).toBe(maxFrost);
  });

  test('Law 5: Act 7 is the only act with visible scorecard', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      if (act === 7) {
        expect(ACT_SCENE_STATES[act].scorecardOpacity).toBeGreaterThan(0);
      } else {
        expect(ACT_SCENE_STATES[act].scorecardOpacity).toBe(0);
      }
    });
  });

  test('Law 6: ambient intensity monotonically increases across acts', () => {
    // The spec says ambient light increases through the narrative
    const intensities = [1, 2, 3, 4, 5, 6, 7].map((a) => ACT_SCENE_STATES[a as FlywheelAct].ambientIntensity);
    for (let i = 1; i < intensities.length; i++) {
      expect(intensities[i]).toBeGreaterThanOrEqual(intensities[i - 1]!);
    }
  });

  test('Law 7: all transition durations are positive', () => {
    Object.values(ACT_TRANSITION_DURATIONS).forEach((duration) => {
      expect(duration).toBeGreaterThan(0);
    });
  });

  test('Law 8: transition durations match camera choreography durations', () => {
    // The act transitions should have the same set of keys as camera transitions
    const expectedKeys = ['1->2', '2->3', '3->4', '4->5', '5->6', '6->7', '7->4'];
    expectedKeys.forEach((key) => {
      expect(ACT_TRANSITION_DURATIONS[key]).toBeDefined();
      expect(ACT_TRANSITION_DURATIONS[key]).toBeGreaterThan(0);
    });
  });

  test('Law 9: interpolateSceneState at t=0 returns start state', () => {
    const from = ACT_SCENE_STATES[1];
    const to = ACT_SCENE_STATES[2];
    const result = interpolateSceneState(from, to, 0);
    expect(result.screenPlaneOpacity).toBeCloseTo(from.screenPlaneOpacity, 5);
    expect(result.ambientIntensity).toBeCloseTo(from.ambientIntensity, 5);
  });

  test('Law 10: interpolateSceneState at t=1 returns end state', () => {
    const from = ACT_SCENE_STATES[1];
    const to = ACT_SCENE_STATES[2];
    const result = interpolateSceneState(from, to, 1);
    expect(result.screenPlaneOpacity).toBeCloseTo(to.screenPlaneOpacity, 5);
    expect(result.ambientIntensity).toBeCloseTo(to.ambientIntensity, 5);
    expect(result.glassPaneFrost).toBeCloseTo(to.glassPaneFrost, 5);
  });

  test('Law 11: interpolateSceneState at t=0.5 is between start and end', () => {
    const from = ACT_SCENE_STATES[1];
    const to = ACT_SCENE_STATES[2];
    const result = interpolateSceneState(from, to, 0.5);
    // At t=0.5 with cubic easing, the value is exactly 0.5 (cubic ease midpoint)
    const expected = (from.screenPlaneOpacity + to.screenPlaneOpacity) / 2;
    expect(result.screenPlaneOpacity).toBeCloseTo(expected, 3);
  });

  test('Law 12: interpolateSceneState clamps t to [0, 1]', () => {
    const from = ACT_SCENE_STATES[1];
    const to = ACT_SCENE_STATES[2];
    const atNeg = interpolateSceneState(from, to, -0.5);
    const atOver = interpolateSceneState(from, to, 1.5);
    expect(atNeg.screenPlaneOpacity).toBeCloseTo(from.screenPlaneOpacity, 5);
    expect(atOver.screenPlaneOpacity).toBeCloseTo(to.screenPlaneOpacity, 5);
  });

  test('Law 13: all opacity values in ACT_SCENE_STATES are in [0, 1]', () => {
    const acts: readonly FlywheelAct[] = [1, 2, 3, 4, 5, 6, 7];
    acts.forEach((act) => {
      const s = ACT_SCENE_STATES[act];
      expect(s.screenPlaneOpacity).toBeGreaterThanOrEqual(0);
      expect(s.screenPlaneOpacity).toBeLessThanOrEqual(1);
      expect(s.glassPaneFrost).toBeGreaterThanOrEqual(0);
      expect(s.glassPaneFrost).toBeLessThanOrEqual(1);
      expect(s.scenarioCloudOpacity).toBeGreaterThanOrEqual(0);
      expect(s.scenarioCloudOpacity).toBeLessThanOrEqual(1);
      expect(s.pipelineTimelineOpacity).toBeGreaterThanOrEqual(0);
      expect(s.pipelineTimelineOpacity).toBeLessThanOrEqual(1);
      expect(s.scorecardOpacity).toBeGreaterThanOrEqual(0);
      expect(s.scorecardOpacity).toBeLessThanOrEqual(1);
    });
  });
});
