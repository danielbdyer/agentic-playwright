import { expect, test } from '@playwright/test';
import {
  INITIAL_FINALE_STATE,
  triggerFinale,
  advanceFinale,
  getFinaleSchedule,
  convergenceNarration,
  THRESHOLD_MET_SCHEDULE,
  NO_PROPOSALS_SCHEDULE,
  BUDGET_EXHAUSTED_SCHEDULE,
  type ConvergenceReason,
  type ConvergenceMetrics,
} from '../lib/domain/projection/convergence-finale';

// ─── Helpers ───

const baseMetrics: ConvergenceMetrics = {
  iteration: 5,
  knowledgeHitRate: 0.89,
  passRate: 0.84,
  scenariosPassed: 42,
  totalScenarios: 50,
  proposalsPending: 3,
  proposalsActivated: 38,
  remainingGaps: 7,
};

test.describe('Convergence finale state machine laws', () => {

  test('Law 1: INITIAL_FINALE_STATE is idle with no active schedule', () => {
    expect(INITIAL_FINALE_STATE.active).toBe(false);
    expect(INITIAL_FINALE_STATE.reason).toBeNull();
    expect(INITIAL_FINALE_STATE.schedule).toBeNull();
    expect(INITIAL_FINALE_STATE.visual.phase).toBe('idle');
    expect(INITIAL_FINALE_STATE.visual.complete).toBe(false);
  });

  test('Law 2: triggerFinale activates the FSM with correct schedule', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    expect(state.active).toBe(true);
    expect(state.reason).toBe('threshold-met');
    expect(state.schedule).toBe(THRESHOLD_MET_SCHEDULE);
    expect(state.visual.tint).toBe('green');
    expect(state.metrics).toEqual(baseMetrics);
  });

  test('Law 3: threshold-met uses green tint', () => {
    expect(getFinaleSchedule('threshold-met').tint).toBe('green');
  });

  test('Law 4: no-proposals uses amber tint', () => {
    expect(getFinaleSchedule('no-proposals').tint).toBe('amber');
  });

  test('Law 5: budget-exhausted uses neutral tint', () => {
    expect(getFinaleSchedule('budget-exhausted').tint).toBe('neutral');
  });

  test('Law 6: max-iterations uses same schedule as budget-exhausted', () => {
    const s1 = getFinaleSchedule('budget-exhausted');
    const s2 = getFinaleSchedule('max-iterations');
    expect(s1.totalDurationMs).toBe(s2.totalDurationMs);
    expect(s1.phases.length).toBe(s2.phases.length);
  });

  test('Law 7: threshold-met has all 6 visual phases', () => {
    const schedule = THRESHOLD_MET_SCHEDULE;
    const phaseNames = schedule.phases.map((p) => p.phase);
    expect(phaseNames).toContain('crystallize');
    expect(phaseNames).toContain('glass-dissolve');
    expect(phaseNames).toContain('radial-wave');
    expect(phaseNames).toContain('ambient-crescendo');
    expect(phaseNames).toContain('narration');
    expect(phaseNames).toContain('summary-transition');
  });

  test('Law 8: budget-exhausted skips ceremony — only narration and summary', () => {
    const schedule = BUDGET_EXHAUSTED_SCHEDULE;
    const phaseNames = schedule.phases.map((p) => p.phase);
    expect(phaseNames).not.toContain('crystallize');
    expect(phaseNames).not.toContain('glass-dissolve');
    expect(phaseNames).not.toContain('radial-wave');
    expect(phaseNames).toContain('narration');
    expect(phaseNames).toContain('summary-transition');
  });

  test('Law 9: advanceFinale on idle state returns same state', () => {
    const result = advanceFinale(INITIAL_FINALE_STATE, 1000);
    expect(result).toBe(INITIAL_FINALE_STATE);
  });

  test('Law 10: advanceFinale at t=0 shows first active phase', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    const advanced = advanceFinale(state, 100);
    expect(advanced.visual.activePhases.has('crystallize')).toBe(true);
    expect(advanced.visual.crystallizeProgress).toBeGreaterThan(0);
    expect(advanced.visual.crystallizeProgress).toBeLessThan(1);
  });

  test('Law 11: advanceFinale at mid-point shows multiple overlapping phases', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    // At 2500ms: crystallize (0-2000) ending, glass-dissolve (1000-3000) mid,
    // radial-wave (2000-4000) starting, ambient-crescendo (2000-5000) starting
    const advanced = advanceFinale(state, 2500);
    expect(advanced.visual.glassDissolution).toBeGreaterThan(0);
    expect(advanced.visual.waveRadius).toBeGreaterThan(0);
  });

  test('Law 12: advanceFinale past total duration marks complete', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    const advanced = advanceFinale(state, THRESHOLD_MET_SCHEDULE.totalDurationMs + 100);
    expect(advanced.visual.complete).toBe(true);
    expect(advanced.visual.phase).toBe('summary');
  });

  test('Law 13: glass dissolution for threshold-met reaches 1.0', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    const advanced = advanceFinale(state, 4000); // After glass-dissolve ends at 3000
    expect(advanced.visual.glassDissolution).toBeCloseTo(1.0, 2);
  });

  test('Law 14: glass dissolution for no-proposals caps at 0.8', () => {
    const state = triggerFinale('no-proposals', baseMetrics, 0);
    const advanced = advanceFinale(state, 4000); // After glass-dissolve ends at 3000
    expect(advanced.visual.glassDissolution).toBeLessThanOrEqual(0.8);
  });

  test('Law 15: glass dissolution for budget-exhausted stays at 0', () => {
    const state = triggerFinale('budget-exhausted', baseMetrics, 0);
    const advanced = advanceFinale(state, 5000);
    expect(advanced.visual.glassDissolution).toBe(0);
  });

  test('Law 16: ambient multiplier reaches 1.5 for triumph', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    const advanced = advanceFinale(state, 6000); // After ambient-crescendo ends at 5000
    expect(advanced.visual.ambientMultiplier).toBeCloseTo(1.5, 2);
  });

  test('Law 17: ambient multiplier stays at 1.0 for budget-exhausted', () => {
    const state = triggerFinale('budget-exhausted', baseMetrics, 0);
    const advanced = advanceFinale(state, 5000);
    expect(advanced.visual.ambientMultiplier).toBeCloseTo(1.0, 2);
  });

  test('Law 18: bloom multiplier reaches 1.2 for triumph', () => {
    const state = triggerFinale('threshold-met', baseMetrics, 0);
    const advanced = advanceFinale(state, 6000);
    expect(advanced.visual.bloomMultiplier).toBeCloseTo(1.2, 2);
  });

  test('Law 19: convergenceNarration for threshold-met includes hit rate and scenario count', () => {
    const text = convergenceNarration('threshold-met', baseMetrics);
    expect(text).toContain('Converged at iteration 5');
    expect(text).toContain('89%');
    expect(text).toContain('42/50');
  });

  test('Law 20: convergenceNarration for no-proposals includes remaining gaps', () => {
    const text = convergenceNarration('no-proposals', baseMetrics);
    expect(text).toContain('No further proposals');
    expect(text).toContain('7 knowledge gaps');
  });

  test('Law 21: convergenceNarration for budget-exhausted includes pending proposals', () => {
    const text = convergenceNarration('budget-exhausted', baseMetrics);
    expect(text).toContain('Budget exhausted');
    expect(text).toContain('3 proposals still pending');
  });

  test('Law 22: convergenceNarration for max-iterations mentions iterations', () => {
    const text = convergenceNarration('max-iterations', baseMetrics);
    expect(text).toContain('Maximum iterations reached');
    expect(text).toContain('89%');
  });

  test('Law 23: all four convergence reasons produce valid schedules', () => {
    const reasons: readonly ConvergenceReason[] = ['threshold-met', 'no-proposals', 'budget-exhausted', 'max-iterations'];
    reasons.forEach((reason) => {
      const schedule = getFinaleSchedule(reason);
      expect(schedule.totalDurationMs).toBeGreaterThan(0);
      expect(schedule.phases.length).toBeGreaterThan(0);
      expect(schedule.tint).toBeTruthy();
    });
  });

  test('Law 24: phase timings are non-negative and well-ordered', () => {
    const schedules = [THRESHOLD_MET_SCHEDULE, NO_PROPOSALS_SCHEDULE, BUDGET_EXHAUSTED_SCHEDULE];
    schedules.forEach((schedule) => {
      schedule.phases.forEach((timing) => {
        expect(timing.startMs).toBeGreaterThanOrEqual(0);
        expect(timing.endMs).toBeGreaterThan(timing.startMs);
        expect(timing.endMs).toBeLessThanOrEqual(schedule.totalDurationMs);
      });
    });
  });
});
