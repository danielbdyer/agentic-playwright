import { expect, test } from '@playwright/test';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../lib/domain/precedence';
import { createStrategyRegistry, type StrategyRegistry } from '../lib/runtime/agent/strategy-registry';
import type { ResolutionStrategy, StrategyAttemptResult } from '../lib/runtime/agent/strategy';
import { LAW_SEED_COUNT } from './support/random';

// ─── Helpers ─────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function stubStrategy(name: string, rungs: readonly ResolutionPrecedenceRung[]): ResolutionStrategy {
  return {
    name,
    rungs,
    requiresAccumulator: false,
    attempt: async (): Promise<StrategyAttemptResult> => ({ receipt: null, events: [] }),
  };
}

/** Pick a random non-empty subset of rungs. */
function randomRungSubset(next: () => number): readonly ResolutionPrecedenceRung[] {
  const count = 1 + Math.floor(next() * resolutionPrecedenceLaw.length);
  const shuffled = [...resolutionPrecedenceLaw].sort(() => next() - 0.5);
  return shuffled.slice(0, count);
}

/** Build a registry that covers all rungs via random strategy partitions. */
function buildTotalRegistry(next: () => number): StrategyRegistry {
  const remaining = new Set<ResolutionPrecedenceRung>(resolutionPrecedenceLaw);
  const strategies: ResolutionStrategy[] = [];
  let strategyIndex = 0;

  while (remaining.size > 0) {
    const available = [...remaining];
    const count = 1 + Math.floor(next() * Math.min(3, available.length));
    const picked = available
      .sort(() => next() - 0.5)
      .slice(0, count) as ResolutionPrecedenceRung[];
    strategies.push(stubStrategy(`strategy-${strategyIndex}`, picked));
    picked.forEach((rung) => remaining.delete(rung));
    strategyIndex += 1;
  }

  return createStrategyRegistry(strategies);
}

// ─── Law 1: Registry covers all rungs in precedence order ────────────────

test('Law 1: Registry covers all rungs in precedence order', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const registry = buildTotalRegistry(next);

    const registeredRungs = registry.registeredRungs();
    const ordered = resolutionPrecedenceLaw.filter((rung) =>
      registeredRungs.includes(rung),
    );

    // Registered rungs must appear in the same relative order as the precedence law.
    expect(registeredRungs).toEqual(ordered);
  }
});

// ─── Law 2: Strategy lookup is O(1) via Map ─────────────────────────────

test('Law 2: Strategy lookup is O(1) via Map — every registered rung resolves', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const registry = buildTotalRegistry(next);

    for (const rung of registry.registeredRungs()) {
      const strategy = registry.lookup(rung);
      expect(strategy).toBeDefined();
      expect(strategy!.rungs).toContain(rung);
    }
  }
});

// ─── Law 3: New strategy registration doesn't modify existing entries ────

test('Law 3: Registration returns a new registry without modifying the original', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const rungs = randomRungSubset(next);
    const original = createStrategyRegistry([stubStrategy('original', rungs)]);
    const originalRungs = original.registeredRungs();

    const remainingRungs = resolutionPrecedenceLaw.filter(
      (rung) => !rungs.includes(rung),
    );
    if (remainingRungs.length === 0) continue;

    const additionalRungs = remainingRungs.slice(
      0,
      1 + Math.floor(next() * Math.min(3, remainingRungs.length)),
    ) as ResolutionPrecedenceRung[];
    const updated = original.register(stubStrategy('additional', additionalRungs));

    // Original is unchanged.
    expect(original.registeredRungs()).toEqual(originalRungs);
    // Updated has the new rungs.
    for (const rung of additionalRungs) {
      expect(updated.lookup(rung)?.name).toBe('additional');
    }
    // Original rungs still resolve to original strategy in updated registry
    // (unless overwritten, in which case they resolve to the new one).
    for (const rung of rungs) {
      if (additionalRungs.includes(rung)) {
        expect(updated.lookup(rung)?.name).toBe('additional');
      } else {
        expect(updated.lookup(rung)?.name).toBe('original');
      }
    }
  }
});

// ─── Law 4: Rung ordering is preserved after registration ───────────────

test('Law 4: strategiesInOrder respects precedence law after registration', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const registry = buildTotalRegistry(next);
    const ordered = registry.strategiesInOrder();

    // For each consecutive pair, the first rung of the earlier strategy
    // must appear before the first rung of the later strategy in the law.
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const firstRungA = resolutionPrecedenceLaw.findIndex((rung) =>
        ordered[i]!.rungs.includes(rung),
      );
      const firstRungB = resolutionPrecedenceLaw.findIndex((rung) =>
        ordered[i + 1]!.rungs.includes(rung),
      );
      expect(firstRungA).toBeLessThan(firstRungB);
    }
  }
});

// ─── Law 5: Registry is a total function over all valid rungs ───────────

test('Law 5: isTotal is true iff every precedence rung has a strategy', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);

    // Total registry
    const total = buildTotalRegistry(next);
    expect(total.isTotal()).toBe(true);

    // Partial registry (subset of rungs)
    const partialRungs = randomRungSubset(mulberry32(seed + 1000));
    const partial = createStrategyRegistry([stubStrategy('partial', partialRungs)]);
    const expectTotal = resolutionPrecedenceLaw.every((rung) =>
      partialRungs.includes(rung),
    );
    expect(partial.isTotal()).toBe(expectTotal);
  }
});

// ─── Supplemental: empty registry ───────────────────────────────────────

test('Empty registry has no registered rungs and is not total', () => {
  const empty = createStrategyRegistry();
  expect(empty.registeredRungs()).toEqual([]);
  expect(empty.strategiesInOrder()).toEqual([]);
  expect(empty.isTotal()).toBe(false);
});
