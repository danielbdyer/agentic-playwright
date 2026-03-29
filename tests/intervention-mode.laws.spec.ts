import { expect, test } from '@playwright/test';
import {
  burstParticleProps,
  shouldTriggerIntervention,
} from '../dashboard/src/hooks/use-intervention-mode';

test.describe('InterventionMode laws', () => {

  test('Law 1: approved burst uses green particles directed toward observatory', () => {
    const props = burstParticleProps('approved', 0.5);
    expect(props.color).toBe('#22c55e');
    expect(props.directionBias[0]).toBeGreaterThan(0); // Toward observatory (right)
    expect(props.count).toBeGreaterThan(0);
  });

  test('Law 2: skipped burst uses red particles scattered uniformly', () => {
    const props = burstParticleProps('skipped', 0.5);
    expect(props.color).toBe('#ef4444');
    expect(props.directionBias[0]).toBe(0); // No directional bias
    expect(props.directionBias[1]).toBe(0);
    expect(props.directionBias[2]).toBe(0);
  });

  test('Law 3: approved produces more particles than skipped', () => {
    const approved = burstParticleProps('approved', 0.5);
    const skipped = burstParticleProps('skipped', 0.5);
    expect(approved.count).toBeGreaterThan(skipped.count);
  });

  test('Law 4: shouldTriggerIntervention accepts valid pause reasons', () => {
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'approve-proposal' })).toBe(true);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'interpret-step' })).toBe(true);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'author-knowledge' })).toBe(true);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'investigate-hotspot' })).toBe(true);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'validate-calibration' })).toBe(true);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'request-rerun' })).toBe(true);
  });

  test('Law 5: shouldTriggerIntervention rejects unknown reasons', () => {
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: 'unknown' })).toBe(false);
    expect(shouldTriggerIntervention({ workItemId: 'w1', screen: 's', element: null, reason: '' })).toBe(false);
  });

  test('Law 6: exactly 6 valid pause reasons are recognized', () => {
    const validReasons = [
      'approve-proposal', 'interpret-step', 'author-knowledge',
      'investigate-hotspot', 'validate-calibration', 'request-rerun',
    ];
    const results = validReasons.map((r) =>
      shouldTriggerIntervention({ workItemId: 'w', screen: 's', element: null, reason: r }),
    );
    expect(results.every(Boolean)).toBe(true);
    expect(results).toHaveLength(6);
  });
});
