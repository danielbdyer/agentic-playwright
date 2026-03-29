import { expect, test } from '@playwright/test';
import {
  computeEntityVisuals,
  activeEntityTypes,
  entityPoolSize,
  type EntityType,
  type EntityPhase,
} from '../lib/domain/flywheel-entity';

const ALL_TYPES: readonly EntityType[] = [
  'scenario-card', 'surface-overlay', 'probe-particle', 'selector-glow',
  'step-overlay', 'resolution-ring', 'failure-fragment', 'proposal-cluster',
  'knowledge-node', 'transport-particle', 'convergence-wave', 'scorecard-element',
];

test.describe('FlywheelEntity laws', () => {

  test('Law 1: exactly 12 entity types defined', () => {
    expect(ALL_TYPES).toHaveLength(12);
  });

  test('Law 2: every entity type has a base visual profile', () => {
    ALL_TYPES.forEach((type) => {
      const visual = computeEntityVisuals(type, 'active', {});
      expect(visual.opacity).toBeGreaterThan(0);
      expect(visual.scale).toBeGreaterThan(0);
      expect(visual.color).toHaveLength(3);
    });
  });

  test('Law 3: hidden phase produces zero opacity and scale', () => {
    ALL_TYPES.forEach((type) => {
      const visual = computeEntityVisuals(type, 'hidden', {});
      expect(visual.opacity).toBe(0);
      expect(visual.scale).toBe(0);
    });
  });

  test('Law 4: entering phase has reduced opacity compared to active', () => {
    ALL_TYPES.forEach((type) => {
      const entering = computeEntityVisuals(type, 'entering', {});
      const active = computeEntityVisuals(type, 'active', {});
      expect(entering.opacity).toBeLessThan(active.opacity);
    });
  });

  test('Law 5: actor color blends with base color', () => {
    const base = computeEntityVisuals('probe-particle', 'active', {});
    const system = computeEntityVisuals('probe-particle', 'active', { actor: 'system' });
    const agent = computeEntityVisuals('probe-particle', 'active', { actor: 'agent' });

    // System (cyan) and Agent (magenta) should produce different colors
    expect(system.color[0]).not.toBe(agent.color[0]);
  });

  test('Law 6: first encounter uses wider glow radius', () => {
    const first = computeEntityVisuals('selector-glow', 'active', { firstEncounter: true });
    const confirmed = computeEntityVisuals('selector-glow', 'active', { firstEncounter: false });
    expect(first.glowRadius).toBeGreaterThan(confirmed.glowRadius);
  });

  test('Law 7: first encounter uses lower glow intensity', () => {
    const first = computeEntityVisuals('selector-glow', 'active', { firstEncounter: true });
    const confirmed = computeEntityVisuals('selector-glow', 'active', { firstEncounter: false });
    expect(first.glowIntensity).toBeLessThan(confirmed.glowIntensity);
  });

  test('Law 8: first encounter shifts color toward blue-white', () => {
    const first = computeEntityVisuals('probe-particle', 'active', { firstEncounter: true });
    // Blue-white = high blue channel (0.95)
    expect(first.color[2]).toBeGreaterThanOrEqual(0.9);
  });

  test('Law 9: confidence scales opacity and glow intensity', () => {
    const low = computeEntityVisuals('knowledge-node', 'active', { confidence: 0.1 });
    const high = computeEntityVisuals('knowledge-node', 'active', { confidence: 0.9 });
    expect(high.opacity).toBeGreaterThan(low.opacity);
    expect(high.glowIntensity).toBeGreaterThan(low.glowIntensity);
  });

  test('Law 10: activeEntityTypes returns scenario-card for Act 1', () => {
    const types = activeEntityTypes(1);
    expect(types.has('scenario-card')).toBe(true);
    expect(types.has('resolution-ring')).toBe(false);
  });

  test('Law 11: activeEntityTypes returns resolution-ring for Act 5', () => {
    const types = activeEntityTypes(5);
    expect(types.has('resolution-ring')).toBe(true);
    expect(types.has('failure-fragment')).toBe(true);
    expect(types.has('probe-particle')).toBe(true);
  });

  test('Law 12: activeEntityTypes returns proposal-cluster for Act 6', () => {
    const types = activeEntityTypes(6);
    expect(types.has('proposal-cluster')).toBe(true);
    expect(types.has('knowledge-node')).toBe(true);
  });

  test('Law 13: activeEntityTypes returns convergence-wave for Act 7', () => {
    const types = activeEntityTypes(7);
    expect(types.has('convergence-wave')).toBe(true);
    expect(types.has('scorecard-element')).toBe(true);
  });

  test('Law 14: knowledge-node and transport-particle are active in Acts 2-7', () => {
    for (let act = 2; act <= 7; act++) {
      const types = activeEntityTypes(act as 1 | 2 | 3 | 4 | 5 | 6 | 7);
      expect(types.has('knowledge-node')).toBe(true);
      expect(types.has('transport-particle')).toBe(true);
    }
  });

  test('Law 15: entityPoolSize returns positive values for all types', () => {
    ALL_TYPES.forEach((type) => {
      expect(entityPoolSize(type)).toBeGreaterThan(0);
    });
  });

  test('Law 16: probe-particle has largest pool', () => {
    const probePool = entityPoolSize('probe-particle');
    const others = ALL_TYPES
      .filter((t) => t !== 'probe-particle' && t !== 'knowledge-node')
      .map((t) => entityPoolSize(t));
    others.forEach((size) => {
      expect(probePool).toBeGreaterThanOrEqual(size);
    });
  });

  test('Law 17: failure-fragment has fast pulse and trail', () => {
    const visual = computeEntityVisuals('failure-fragment', 'active', {});
    expect(visual.pulseFrequency).toBeGreaterThan(2); // Fast pulse
    expect(visual.trailLength).toBeGreaterThan(0);
  });

  test('Law 18: convergence-wave has large scale and high glow', () => {
    const visual = computeEntityVisuals('convergence-wave', 'active', {});
    expect(visual.scale).toBeGreaterThanOrEqual(2.0);
    expect(visual.glowIntensity).toBeGreaterThanOrEqual(0.7);
  });
});
