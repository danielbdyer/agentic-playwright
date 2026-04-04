/**
 * Law-style tests for the dogfood orchestrator.
 *
 * Laws verified:
 * - Default config produces safe, bounded values
 * - shouldContinueLoop respects iteration, cost, and convergence bounds
 * - shouldContinueLoop detects Lyapunov fixed points
 * - shouldContinueLoop stops when termination bound exceeds budget
 * - Phase plan has correct ordering, canonical names, and count
 * - Phase ordering is strictly ascending
 * - autoApprove flag controls the approve phase's requiresAutoApprove
 */

import { expect, test } from '@playwright/test';
import {
  defaultDogfoodConfig,
  shouldContinueLoop,
  createDogfoodPlan,
  isPhasesOrdered,
  phaseNames,
  type DogfoodConfig,
  type LoopMetrics,
} from '../lib/application/improvement/dogfood-orchestrator';

// ─── Fixtures ───

function createMetrics(overrides: Partial<LoopMetrics> = {}): LoopMetrics {
  return {
    knowledgeHitRate: 0.5,
    proposalYield: 0.5,
    translationPrecision: 0.5,
    convergenceVelocity: 0.1,
    costSoFar: 0,
    energyHistory: [],
    ...overrides,
  };
}

function createConfig(overrides: Partial<DogfoodConfig> = {}): DogfoodConfig {
  return { ...defaultDogfoodConfig(), ...overrides };
}

// ─── Law: Default config is safe and bounded ───

test('default config has positive maxIterations', () => {
  const config = defaultDogfoodConfig();
  expect(config.maxIterations).toBeGreaterThan(0);
});

test('default config has positive maxCost', () => {
  const config = defaultDogfoodConfig();
  expect(config.maxCost).toBeGreaterThan(0);
});

test('default config convergenceThreshold is in (0, 1]', () => {
  const config = defaultDogfoodConfig();
  expect(config.convergenceThreshold).toBeGreaterThan(0);
  expect(config.convergenceThreshold).toBeLessThanOrEqual(1);
});

test('default config autoApprove is false', () => {
  const config = defaultDogfoodConfig();
  expect(config.autoApprove).toBe(false);
});

test('default config maxIterations is finite', () => {
  const config = defaultDogfoodConfig();
  expect(Number.isFinite(config.maxIterations)).toBe(true);
});

test('default config maxCost is finite', () => {
  const config = defaultDogfoodConfig();
  expect(Number.isFinite(config.maxCost)).toBe(true);
});

// ─── Law: shouldContinueLoop respects iteration bound ───

test('shouldContinueLoop returns false at maxIterations', () => {
  const config = createConfig({ maxIterations: 5 });
  const metrics = createMetrics();
  expect(shouldContinueLoop(5, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns false beyond maxIterations', () => {
  const config = createConfig({ maxIterations: 5 });
  const metrics = createMetrics();
  expect(shouldContinueLoop(6, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns true before maxIterations with low metrics', () => {
  const config = createConfig({ maxIterations: 10 });
  const metrics = createMetrics({ knowledgeHitRate: 0.3 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(true);
});

test('shouldContinueLoop returns true at iteration 0 with defaults', () => {
  const config = defaultDogfoodConfig();
  const metrics = createMetrics();
  expect(shouldContinueLoop(0, metrics, config)).toBe(true);
});

// ─── Law: shouldContinueLoop respects cost bound ───

test('shouldContinueLoop returns false when cost meets maxCost', () => {
  const config = createConfig({ maxCost: 100 });
  const metrics = createMetrics({ costSoFar: 100 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns false when cost exceeds maxCost', () => {
  const config = createConfig({ maxCost: 100 });
  const metrics = createMetrics({ costSoFar: 150 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns true when cost is below maxCost', () => {
  const config = createConfig({ maxCost: 100 });
  const metrics = createMetrics({ costSoFar: 50, knowledgeHitRate: 0.3 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(true);
});

// ─── Law: shouldContinueLoop respects convergence threshold ───

test('shouldContinueLoop returns false when hitRate meets threshold', () => {
  const config = createConfig({ convergenceThreshold: 0.85 });
  const metrics = createMetrics({ knowledgeHitRate: 0.85 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns false when hitRate exceeds threshold', () => {
  const config = createConfig({ convergenceThreshold: 0.85 });
  const metrics = createMetrics({ knowledgeHitRate: 0.95 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop returns true when hitRate is below threshold', () => {
  const config = createConfig({ convergenceThreshold: 0.85 });
  const metrics = createMetrics({ knowledgeHitRate: 0.5 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(true);
});

test('shouldContinueLoop stops at threshold 1.0 when rate is 1.0', () => {
  const config = createConfig({ convergenceThreshold: 1.0 });
  const metrics = createMetrics({ knowledgeHitRate: 1.0 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

// ─── Law: shouldContinueLoop detects Lyapunov fixed point ───

test('shouldContinueLoop detects fixed point from flat energy history', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.5, 0.5, 0.5],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(false);
});

test('shouldContinueLoop detects fixed point within epsilon', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.5, 0.5005, 0.4998],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(false);
});

test('shouldContinueLoop does not trigger fixed point with only 2 values', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.5, 0.5],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(true);
});

test('shouldContinueLoop continues with decreasing energy history', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.8, 0.6, 0.4],
  });
  // Energy is still decreasing significantly, should continue
  expect(shouldContinueLoop(1, metrics, config)).toBe(true);
});

// ─── Law: shouldContinueLoop stops when termination bound exceeds budget ───

test('shouldContinueLoop stops when estimated bound exceeds remaining iterations', () => {
  const config = createConfig({ maxIterations: 5, convergenceThreshold: 0.95 });
  // Energy = 1 - hitRate. History: [0.9, 0.88] => rate ~0.02, target = 0.05
  // Bound = ceil((0.88 - 0.05) / 0.02) = ceil(41.5) = 42, remaining = 3
  const metrics = createMetrics({
    knowledgeHitRate: 0.12,
    energyHistory: [0.9, 0.88],
    costSoFar: 0,
  });
  expect(shouldContinueLoop(2, metrics, config)).toBe(false);
});

test('shouldContinueLoop continues when estimated bound is within budget', () => {
  const config = createConfig({ maxIterations: 100, convergenceThreshold: 0.85 });
  // Energy history: [0.5, 0.3] => rate = 0.2, target = 0.15
  // Bound = ceil((0.3 - 0.15) / 0.2) = ceil(0.75) = 1, remaining = 98
  const metrics = createMetrics({
    knowledgeHitRate: 0.7,
    energyHistory: [0.5, 0.3],
    costSoFar: 0,
  });
  expect(shouldContinueLoop(2, metrics, config)).toBe(true);
});

// ─── Law: Multiple stopping conditions combine correctly ───

test('iteration bound takes precedence over good metrics', () => {
  const config = createConfig({ maxIterations: 3 });
  const metrics = createMetrics({ knowledgeHitRate: 0.1, costSoFar: 0 });
  expect(shouldContinueLoop(3, metrics, config)).toBe(false);
});

test('cost bound takes precedence at iteration 0', () => {
  const config = createConfig({ maxCost: 50 });
  const metrics = createMetrics({ costSoFar: 50, knowledgeHitRate: 0.1 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('all bounds below threshold means continue', () => {
  const config = createConfig({ maxIterations: 20, maxCost: 500, convergenceThreshold: 0.9 });
  const metrics = createMetrics({ knowledgeHitRate: 0.4, costSoFar: 100 });
  expect(shouldContinueLoop(5, metrics, config)).toBe(true);
});

// ─── Law: Phase plan has correct structure ───

test('createDogfoodPlan returns 6 phases', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  expect(plan).toHaveLength(6);
});

test('createDogfoodPlan phase names are canonical', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const names = phaseNames(plan);
  expect(names).toEqual(['discover', 'compile', 'run', 'propose', 'approve', 'rerun']);
});

test('createDogfoodPlan phases are strictly ordered', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  expect(isPhasesOrdered(plan)).toBe(true);
});

test('createDogfoodPlan phase orders are 0 through 5', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const orders = plan.map((p) => p.order);
  expect(orders).toEqual([0, 1, 2, 3, 4, 5]);
});

test('createDogfoodPlan every phase has a non-empty description', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  for (const phase of plan) {
    expect(phase.description.length).toBeGreaterThan(0);
  }
});

// ─── Law: autoApprove controls the approve phase ───

test('autoApprove=false marks approve phase as requiresAutoApprove=true', () => {
  const plan = createDogfoodPlan(createConfig({ autoApprove: false }));
  const approvePhase = plan.find((p) => p.name === 'approve')!;
  expect(approvePhase.requiresAutoApprove).toBe(true);
});

test('autoApprove=true marks approve phase as requiresAutoApprove=false', () => {
  const plan = createDogfoodPlan(createConfig({ autoApprove: true }));
  const approvePhase = plan.find((p) => p.name === 'approve')!;
  expect(approvePhase.requiresAutoApprove).toBe(false);
});

test('non-approve phases always have requiresAutoApprove=false', () => {
  for (const autoApprove of [true, false]) {
    const plan = createDogfoodPlan(createConfig({ autoApprove }));
    const nonApprovePhases = plan.filter((p) => p.name !== 'approve');
    for (const phase of nonApprovePhases) {
      expect(phase.requiresAutoApprove).toBe(false);
    }
  }
});

// ─── Law: isPhasesOrdered rejects misordered sequences ───

test('isPhasesOrdered rejects reversed phases', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const reversed = [...plan].reverse();
  expect(isPhasesOrdered(reversed)).toBe(false);
});

test('isPhasesOrdered rejects duplicate orders', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const duplicated = plan.map((p) => ({ ...p, order: 0 }));
  expect(isPhasesOrdered(duplicated)).toBe(false);
});

test('isPhasesOrdered accepts empty array', () => {
  expect(isPhasesOrdered([])).toBe(true);
});

test('isPhasesOrdered accepts single element', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  expect(isPhasesOrdered([plan[0]!])).toBe(true);
});

// ─── Law: phaseNames is consistent with plan ───

test('phaseNames returns names in same order as plan', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const names = phaseNames(plan);
  expect(names).toEqual(plan.map((p) => p.name));
});

test('phaseNames of empty plan is empty', () => {
  expect(phaseNames([])).toEqual([]);
});

// ─── Law: shouldContinueLoop is pure (same inputs => same outputs) ───

test('shouldContinueLoop is deterministic', () => {
  const config = createConfig();
  const metrics = createMetrics({ knowledgeHitRate: 0.6, energyHistory: [0.8, 0.6, 0.4] });
  const result1 = shouldContinueLoop(3, metrics, config);
  const result2 = shouldContinueLoop(3, metrics, config);
  expect(result1).toBe(result2);
});

// ─── Law: Boundary values ───

test('shouldContinueLoop at iteration 0 with zero cost and zero hitRate continues', () => {
  const config = createConfig();
  const metrics = createMetrics({ knowledgeHitRate: 0, costSoFar: 0 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(true);
});

test('shouldContinueLoop with maxIterations=0 always stops', () => {
  const config = createConfig({ maxIterations: 0 });
  const metrics = createMetrics();
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop with maxCost=0 always stops', () => {
  const config = createConfig({ maxCost: 0 });
  const metrics = createMetrics({ costSoFar: 0 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

test('shouldContinueLoop with convergenceThreshold=0 always stops', () => {
  const config = createConfig({ convergenceThreshold: 0 });
  const metrics = createMetrics({ knowledgeHitRate: 0 });
  expect(shouldContinueLoop(0, metrics, config)).toBe(false);
});

// ─── Law: createDogfoodPlan does not mutate config ───

test('createDogfoodPlan does not mutate the config', () => {
  const config = createConfig({ autoApprove: false });
  const configBefore = JSON.stringify(config);
  createDogfoodPlan(config);
  expect(JSON.stringify(config)).toBe(configBefore);
});

// ─── Law: shouldContinueLoop with empty energy history ───

test('shouldContinueLoop with empty energyHistory continues normally', () => {
  const config = createConfig({ maxIterations: 10 });
  const metrics = createMetrics({ knowledgeHitRate: 0.5, energyHistory: [] });
  expect(shouldContinueLoop(1, metrics, config)).toBe(true);
});

test('shouldContinueLoop with single energyHistory value continues normally', () => {
  const config = createConfig({ maxIterations: 10 });
  const metrics = createMetrics({ knowledgeHitRate: 0.5, energyHistory: [0.5] });
  expect(shouldContinueLoop(1, metrics, config)).toBe(true);
});

// ─── Law: Fixed point with large spread does not trigger ───

test('shouldContinueLoop with large spread in last 3 values continues', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.9, 0.5, 0.1],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(true);
});

// ─── Law: Plan stability across multiple calls ───

test('createDogfoodPlan produces identical plans for identical configs', () => {
  const config = createConfig();
  const plan1 = createDogfoodPlan(config);
  const plan2 = createDogfoodPlan(config);
  expect(plan1).toEqual(plan2);
});

test('createDogfoodPlan with autoApprove=true differs only in approve phase', () => {
  const planFalse = createDogfoodPlan(createConfig({ autoApprove: false }));
  const planTrue = createDogfoodPlan(createConfig({ autoApprove: true }));
  for (let i = 0; i < planFalse.length; i++) {
    if (planFalse[i]!.name === 'approve') {
      expect(planFalse[i]!.requiresAutoApprove).not.toBe(planTrue[i]!.requiresAutoApprove);
    } else {
      expect(planFalse[i]).toEqual(planTrue[i]);
    }
  }
});

// ─── Law: shouldContinueLoop monotonicity — stricter config always stops sooner ───

test('lower maxIterations stops sooner', () => {
  const metrics = createMetrics({ knowledgeHitRate: 0.3 });
  const strict = createConfig({ maxIterations: 3 });
  const loose = createConfig({ maxIterations: 100 });
  // At iteration 3, strict stops, loose continues
  expect(shouldContinueLoop(3, metrics, strict)).toBe(false);
  expect(shouldContinueLoop(3, metrics, loose)).toBe(true);
});

test('lower maxCost stops sooner', () => {
  const metrics = createMetrics({ knowledgeHitRate: 0.3, costSoFar: 50 });
  const strict = createConfig({ maxCost: 50 });
  const loose = createConfig({ maxCost: 500 });
  expect(shouldContinueLoop(1, metrics, strict)).toBe(false);
  expect(shouldContinueLoop(1, metrics, loose)).toBe(true);
});

test('lower convergenceThreshold stops sooner', () => {
  const metrics = createMetrics({ knowledgeHitRate: 0.6 });
  const strict = createConfig({ convergenceThreshold: 0.6 });
  const loose = createConfig({ convergenceThreshold: 0.9 });
  expect(shouldContinueLoop(1, metrics, strict)).toBe(false);
  expect(shouldContinueLoop(1, metrics, loose)).toBe(true);
});

// ─── Law: Phase plan structural invariants ───

test('every phase name is unique', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const names = phaseNames(plan);
  expect(new Set(names).size).toBe(names.length);
});

test('every phase order is unique', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const orders = plan.map((p) => p.order);
  expect(new Set(orders).size).toBe(orders.length);
});

test('discover is always first phase', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  expect(plan[0]!.name).toBe('discover');
  expect(plan[0]!.order).toBe(0);
});

test('rerun is always last phase', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const last = plan[plan.length - 1]!;
  expect(last.name).toBe('rerun');
  expect(last.order).toBe(5);
});

test('compile follows discover', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const discoverIdx = plan.findIndex((p) => p.name === 'discover');
  const compileIdx = plan.findIndex((p) => p.name === 'compile');
  expect(compileIdx).toBe(discoverIdx + 1);
});

test('run follows compile', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const compileIdx = plan.findIndex((p) => p.name === 'compile');
  const runIdx = plan.findIndex((p) => p.name === 'run');
  expect(runIdx).toBe(compileIdx + 1);
});

test('propose follows run', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const runIdx = plan.findIndex((p) => p.name === 'run');
  const proposeIdx = plan.findIndex((p) => p.name === 'propose');
  expect(proposeIdx).toBe(runIdx + 1);
});

test('approve follows propose', () => {
  const plan = createDogfoodPlan(defaultDogfoodConfig());
  const proposeIdx = plan.findIndex((p) => p.name === 'propose');
  const approveIdx = plan.findIndex((p) => p.name === 'approve');
  expect(approveIdx).toBe(proposeIdx + 1);
});

// ─── Law: defaultDogfoodConfig round-trip stability ───

test('defaultDogfoodConfig is structurally equal across calls', () => {
  const a = defaultDogfoodConfig();
  const b = defaultDogfoodConfig();
  expect(a).toEqual(b);
});

test('defaultDogfoodConfig returns a new object each call', () => {
  const a = defaultDogfoodConfig();
  const b = defaultDogfoodConfig();
  expect(a).not.toBe(b);
});

// ─── Law: shouldContinueLoop edge — energy history with all same values ───

test('shouldContinueLoop stops with 4+ identical energy values', () => {
  const config = createConfig({ maxIterations: 100 });
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.5, 0.5, 0.5, 0.5],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(false);
});

// ─── Law: shouldContinueLoop with long energy history only looks at last 3 ───

test('shouldContinueLoop fixed point detection uses last 3 values regardless of history length', () => {
  const config = createConfig({ maxIterations: 100 });
  // Long history, but last 3 are flat
  const metrics = createMetrics({
    knowledgeHitRate: 0.5,
    energyHistory: [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5],
  });
  expect(shouldContinueLoop(1, metrics, config)).toBe(false);
});
