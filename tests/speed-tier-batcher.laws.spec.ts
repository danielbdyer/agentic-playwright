import { expect, test } from '@playwright/test';
import {
  SPEED_TIERS,
  classifyEventImportance,
  classifyEvent,
  batchEvents,
  computeStaggerDelay,
  changeSpeedTier,
  BASE_STAGGER_DELAYS,
  type BatchingLevel,
  type EventImportance,
} from '../lib/domain/speed-tier-batcher';

test.describe('SpeedTierBatcher laws', () => {

  test('Law 1: exactly 7 speed tiers defined', () => {
    expect(SPEED_TIERS).toHaveLength(7);
  });

  test('Law 2: speed tiers are monotonically increasing', () => {
    for (let i = 1; i < SPEED_TIERS.length; i++) {
      expect(SPEED_TIERS[i]!.speed).toBeGreaterThan(SPEED_TIERS[i - 1]!.speed);
    }
  });

  test('Law 3: stagger multipliers decrease as speed increases', () => {
    for (let i = 1; i < SPEED_TIERS.length; i++) {
      expect(SPEED_TIERS[i]!.staggerMultiplier).toBeLessThan(SPEED_TIERS[i - 1]!.staggerMultiplier);
    }
  });

  test('Law 4: convergence-evaluated is always highest importance', () => {
    expect(classifyEventImportance('convergence-evaluated')).toBe('convergence');
  });

  test('Law 5: iteration events are iteration importance', () => {
    expect(classifyEventImportance('iteration-start')).toBe('iteration');
    expect(classifyEventImportance('iteration-summary')).toBe('iteration');
  });

  test('Law 6: probe events are lowest non-ambient importance', () => {
    expect(classifyEventImportance('element-probed')).toBe('probe-level');
    expect(classifyEventImportance('surface-discovered')).toBe('probe-level');
  });

  test('Law 7: unknown events are classified as ambient', () => {
    expect(classifyEventImportance('diagnostics')).toBe('ambient');
    expect(classifyEventImportance('connected')).toBe('ambient');
    expect(classifyEventImportance('unknown-type')).toBe('ambient');
  });

  test('Law 8: at batching=none, all events are rendered', () => {
    const types = ['convergence-evaluated', 'iteration-start', 'element-probed', 'progress'];
    types.forEach((type) => {
      expect(classifyEvent(type, 'none')).toBe('render');
    });
  });

  test('Law 9: at convergence-only, only convergence events render', () => {
    expect(classifyEvent('convergence-evaluated', 'convergence-only')).toBe('render');
    expect(classifyEvent('iteration-start', 'convergence-only')).toBe('batch');
    expect(classifyEvent('element-probed', 'convergence-only')).toBe('skip');
  });

  test('Law 10: at iteration-only, iterations and convergence render', () => {
    expect(classifyEvent('convergence-evaluated', 'iteration-only')).toBe('render');
    expect(classifyEvent('iteration-start', 'iteration-only')).toBe('render');
    expect(classifyEvent('stage-lifecycle', 'iteration-only')).toBe('batch');
    expect(classifyEvent('element-probed', 'iteration-only')).toBe('skip');
  });

  test('Law 11: at per-screen, step-level and above render', () => {
    expect(classifyEvent('step-executing', 'per-screen')).toBe('render');
    expect(classifyEvent('scenario-executed', 'per-screen')).toBe('render');
    expect(classifyEvent('element-probed', 'per-screen')).toBe('batch');
    expect(classifyEvent('progress', 'per-screen')).toBe('skip');
  });

  test('Law 12: batchEvents produces single-event batches for rendered events', () => {
    const events = [
      { type: 'convergence-evaluated', sequenceNumber: 1, data: {} },
      { type: 'element-probed', sequenceNumber: 2, data: {} },
      { type: 'iteration-start', sequenceNumber: 3, data: {} },
    ];
    const batches = batchEvents(events, 'iteration-only');

    // convergence and iteration rendered individually, probed is batched between them
    const rendered = batches.filter((b) => b.events.length === 1);
    expect(rendered.length).toBeGreaterThanOrEqual(2);
  });

  test('Law 13: batchEvents skips events marked skip', () => {
    const events = [
      { type: 'progress', sequenceNumber: 1, data: {} },
      { type: 'diagnostics', sequenceNumber: 2, data: {} },
    ];
    const batches = batchEvents(events, 'iteration-only');
    expect(batches).toHaveLength(0);
  });

  test('Law 14: computeStaggerDelay scales with multiplier', () => {
    const base = computeStaggerDelay('element-probed', 1.0);
    const fast = computeStaggerDelay('element-probed', 0.1);
    const slow = computeStaggerDelay('element-probed', 2.0);
    expect(fast).toBeLessThan(base);
    expect(slow).toBeGreaterThan(base);
  });

  test('Law 15: computeStaggerDelay uses 50ms default for unknown types', () => {
    const delay = computeStaggerDelay('unknown-event', 1.0);
    expect(delay).toBe(50);
  });

  test('Law 16: changeSpeedTier up from 1× goes to 5×', () => {
    const next = changeSpeedTier(1.0, 'up');
    expect(next.speed).toBe(5.0);
  });

  test('Law 17: changeSpeedTier down from 1× goes to 0.5×', () => {
    const prev = changeSpeedTier(1.0, 'down');
    expect(prev.speed).toBe(0.5);
  });

  test('Law 18: changeSpeedTier clamps at boundaries', () => {
    expect(changeSpeedTier(100.0, 'up').speed).toBe(100.0);
    expect(changeSpeedTier(0.5, 'down').speed).toBe(0.5);
  });

  test('Law 19: BASE_STAGGER_DELAYS has entries for all major event types', () => {
    const required = [
      'element-probed', 'scenario-compiled', 'scenario-executed',
      'step-bound', 'convergence-evaluated', 'trust-policy-evaluated',
    ];
    required.forEach((type) => {
      expect(typeof BASE_STAGGER_DELAYS[type]).toBe('number');
    });
  });

  test('Law 20: every speed tier has a non-empty label', () => {
    SPEED_TIERS.forEach((tier) => {
      expect(tier.label.length).toBeGreaterThan(0);
      expect(tier.label).toContain('×');
    });
  });
});
