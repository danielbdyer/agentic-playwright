/**
 * Concurrent Graph Building — Law Tests (W5.16)
 *
 * Verifies that concurrent and sequential graph node building
 * produce identical results via Effect.all pattern:
 *   - Concurrent == sequential (identical collections)
 *   - All builders are invoked
 *   - Fingerprint is build-order independent
 *   - Error propagation
 *   - Edge cases
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  buildNodesConcurrently,
  buildNodesSequentially,
  fingerprintBuildResult,
  type GraphNodeCollection,
} from '../lib/application/concurrent-graph-builder';
import { mulberry32, randomWord, randomInt } from './support/random';

// ─── Helpers ───

function makeBuilder<T>(kind: string, nodes: readonly T[]): Effect.Effect<GraphNodeCollection<T>, never, never> {
  return Effect.succeed({ kind, nodes });
}

function randomBuilders(next: () => number, count: number): Record<string, Effect.Effect<GraphNodeCollection<string>, never, never>> {
  const builders: Record<string, Effect.Effect<GraphNodeCollection<string>, never, never>> = {};
  for (let i = 0; i < count; i++) {
    const kind = `kind-${i}-${randomWord(next)}`;
    const nodeCount = randomInt(next, 0, 20);
    const nodes = Array.from({ length: nodeCount }, () => randomWord(next));
    builders[kind] = makeBuilder(kind, nodes);
  }
  return builders;
}

// ─── Law 1: Concurrent and sequential produce identical collections ───

test('Law 1: concurrent and sequential produce identical node collections (150 seeds)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const builders = randomBuilders(next, randomInt(next, 1, 8));

    const concurrent = await Effect.runPromise(buildNodesConcurrently(builders));
    const sequential = await Effect.runPromise(buildNodesSequentially(builders));

    // Same keys
    const concurrentKeys = Object.keys(concurrent.collections).sort();
    const sequentialKeys = Object.keys(sequential.collections).sort();
    expect(concurrentKeys).toEqual(sequentialKeys);

    // Same node counts and content per key
    for (const key of concurrentKeys) {
      const cc = concurrent.collections[key]!;
      const sc = sequential.collections[key]!;
      expect(cc.kind).toBe(sc.kind);
      expect(cc.nodes).toEqual(sc.nodes);
    }
  }
});

// ─── Law 2: All builders are invoked (every key appears in result) ───

test('Law 2: every builder key appears in result (150 seeds)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const builders = randomBuilders(next, randomInt(next, 1, 10));
    const builderKeys = Object.keys(builders).sort();

    const result = await Effect.runPromise(buildNodesConcurrently(builders));
    const resultKeys = Object.keys(result.collections).sort();

    expect(resultKeys).toEqual(builderKeys);
  }
});

// ─── Law 3: Fingerprint is identical regardless of build strategy ───

test('Law 3: fingerprint is build-order independent (150 seeds)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const builders = randomBuilders(next, randomInt(next, 1, 8));

    const concurrent = await Effect.runPromise(buildNodesConcurrently(builders));
    const sequential = await Effect.runPromise(buildNodesSequentially(builders));

    expect(fingerprintBuildResult(concurrent)).toBe(fingerprintBuildResult(sequential));
  }
});

// ─── Law 4: Empty builders produce empty result ───

test('Law 4: empty builders produce empty collections', async () => {
  const result = await Effect.runPromise(buildNodesConcurrently({}));
  expect(Object.keys(result.collections)).toHaveLength(0);
  expect(result.buildOrder).toHaveLength(0);
});

// ─── Law 5: Single builder produces same result as direct call ───

test('Law 5: single builder matches direct call (150 seeds)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const kind = `single-${randomWord(next)}`;
    const nodes = Array.from({ length: randomInt(next, 1, 15) }, () => randomWord(next));
    const builder = makeBuilder(kind, nodes);

    const result = await Effect.runPromise(buildNodesConcurrently({ [kind]: builder }));
    const direct = await Effect.runPromise(builder);

    expect(result.collections[kind]!.nodes).toEqual(direct.nodes);
  }
});

// ─── Law 6: Error in one builder propagates ───

test('Law 6: error in one builder propagates correctly', async () => {
  const good = makeBuilder('good', ['a', 'b']);
  const bad: Effect.Effect<GraphNodeCollection<string>, Error, never> = Effect.fail(new Error('builder-failed'));

  const result = await Effect.runPromise(
    Effect.either(buildNodesConcurrently({ good, bad })),
  );

  expect(result._tag).toBe('Left');
});

// ─── Law 7: Fingerprint determinism — same input always same fingerprint ───

test('Law 7: fingerprint is deterministic for identical inputs (150 seeds)', async () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next1 = mulberry32(seed);
    const next2 = mulberry32(seed);
    const builders1 = randomBuilders(next1, 5);
    const builders2 = randomBuilders(next2, 5);

    const result1 = await Effect.runPromise(buildNodesConcurrently(builders1));
    const result2 = await Effect.runPromise(buildNodesConcurrently(builders2));

    expect(fingerprintBuildResult(result1)).toBe(fingerprintBuildResult(result2));
  }
});
