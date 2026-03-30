/**
 * W5.14 -- Parallel Harvest Law Tests
 *
 * Laws verified:
 * 1. Concurrent == sequential results: same screens + same harvestFn produce identical merged output
 * 2. Merge is associative: merge(merge(a,b),c) === merge(a,merge(b,c))
 * 3. Merge identity: merge with EMPTY_MERGED_HARVEST is identity
 * 4. Proposal collection: all proposals from all screens are present in merged output
 * 5. Error aggregation: errors are collected and counted correctly
 * 6. Deterministic output: sorted screens and proposals regardless of input order
 * 7. Lift/merge round-trip: merging lifted results equals direct merge
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  mergeHarvestResults,
  mergeTwoHarvestResults,
  liftHarvestResult,
  EMPTY_MERGED_HARVEST,
  harvestScreensConcurrently,
  type HarvestResult,
  type HarvestProposal,
  type HarvestSharedState,
} from '../lib/application/parallel-harvest';
import { createScreenId, type ScreenId } from '../lib/domain/identity';
import type { SelectorCanon } from '../lib/domain/types';
import { mulberry32, randomWord, randomInt, pick } from './support/random';

// ─── Factories ───

function makeScreenId(name: string): ScreenId {
  return createScreenId(name);
}

function makeProposal(
  screen: ScreenId,
  targetRef: string,
  kind: HarvestProposal['kind'] = 'new-element',
): HarvestProposal {
  return {
    screen,
    targetRef,
    kind,
    confidence: 0.85,
    detail: `Discovered ${kind} at ${targetRef}`,
  };
}

function makeHarvestResult(
  screen: ScreenId,
  proposals: readonly HarvestProposal[] = [],
  error: string | null = null,
): HarvestResult {
  return {
    screen,
    proposals,
    elementsDiscovered: proposals.filter((p) => p.kind === 'new-element').length,
    surfacesDiscovered: proposals.filter((p) => p.kind === 'new-surface').length,
    durationMs: 100,
    error,
  };
}

function randomHarvestResult(next: () => number): HarvestResult {
  const screen = makeScreenId(`screen-${randomWord(next)}`);
  const proposalCount = randomInt(next, 5);
  const kinds: HarvestProposal['kind'][] = ['new-element', 'new-surface', 'selector-update', 'posture-update'];
  const proposals = Array.from({ length: proposalCount }, (_, i) =>
    makeProposal(screen, `target-${i}-${randomWord(next)}`, pick(next, kinds)),
  );
  const hasError = next() < 0.15;
  return makeHarvestResult(screen, proposals, hasError ? `Error on ${screen}` : null);
}

function makeSharedState(): HarvestSharedState {
  const canon: SelectorCanon = {
    kind: 'selector-canon',
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    fingerprint: 'test',
    entries: [],
    summary: {
      totalTargets: 0,
      totalProbes: 0,
      approvedKnowledgeProbeCount: 0,
      discoveryProbeCount: 0,
      degradedProbeCount: 0,
      healthyProbeCount: 0,
    },
  };
  return { selectorCanon: canon, knowledgeCatalog: {} };
}

// ─── Law 1: Concurrent == Sequential Results ───

test.describe('Law 1: Concurrent == Sequential Results', () => {
  test('concurrent and sequential harvest produce identical merged results across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 6);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      // "Sequential" = merge one by one
      const sequential = results
        .map(liftHarvestResult)
        .reduce(mergeTwoHarvestResults, EMPTY_MERGED_HARVEST);

      // "Concurrent" = merge all at once
      const concurrent = mergeHarvestResults(results);

      expect(concurrent).toEqual(sequential);
    }
  });
});

// ─── Law 2: Merge is Associative ───

test.describe('Law 2: Merge is Associative', () => {
  test('merge(merge(a,b),c) === merge(a,merge(b,c)) across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = liftHarvestResult(randomHarvestResult(next));
      const b = liftHarvestResult(randomHarvestResult(next));
      const c = liftHarvestResult(randomHarvestResult(next));

      const leftAssoc = mergeTwoHarvestResults(mergeTwoHarvestResults(a, b), c);
      const rightAssoc = mergeTwoHarvestResults(a, mergeTwoHarvestResults(b, c));

      expect(leftAssoc).toEqual(rightAssoc);
    }
  });
});

// ─── Law 3: Merge Identity ───

test.describe('Law 3: Merge Identity', () => {
  test('merge with EMPTY is identity across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const result = liftHarvestResult(randomHarvestResult(next));

      const leftIdentity = mergeTwoHarvestResults(EMPTY_MERGED_HARVEST, result);
      const rightIdentity = mergeTwoHarvestResults(result, EMPTY_MERGED_HARVEST);

      expect(leftIdentity).toEqual(result);
      expect(rightIdentity).toEqual(result);
    }
  });

  test('EMPTY_MERGED_HARVEST has zero counts', () => {
    expect(EMPTY_MERGED_HARVEST.screens.length).toBe(0);
    expect(EMPTY_MERGED_HARVEST.proposals.length).toBe(0);
    expect(EMPTY_MERGED_HARVEST.totalElementsDiscovered).toBe(0);
    expect(EMPTY_MERGED_HARVEST.totalSurfacesDiscovered).toBe(0);
    expect(EMPTY_MERGED_HARVEST.totalDurationMs).toBe(0);
    expect(EMPTY_MERGED_HARVEST.errorCount).toBe(0);
    expect(EMPTY_MERGED_HARVEST.errors.length).toBe(0);
  });
});

// ─── Law 4: Proposal Collection Completeness ───

test.describe('Law 4: Proposal Collection', () => {
  test('all proposals from all screens present in merged output across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 5);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const totalProposals = results.reduce((sum, r) => sum + r.proposals.length, 0);
      const merged = mergeHarvestResults(results);

      expect(merged.proposals.length).toBe(totalProposals);
    }
  });

  test('total elements and surfaces match sum across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 5);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const expectedElements = results.reduce((s, r) => s + r.elementsDiscovered, 0);
      const expectedSurfaces = results.reduce((s, r) => s + r.surfacesDiscovered, 0);
      const merged = mergeHarvestResults(results);

      expect(merged.totalElementsDiscovered).toBe(expectedElements);
      expect(merged.totalSurfacesDiscovered).toBe(expectedSurfaces);
    }
  });

  test('duration sums correctly across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 5);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const expectedDuration = results.reduce((s, r) => s + r.durationMs, 0);
      const merged = mergeHarvestResults(results);

      expect(merged.totalDurationMs).toBe(expectedDuration);
    }
  });
});

// ─── Law 5: Error Aggregation ───

test.describe('Law 5: Error Aggregation', () => {
  test('error count matches number of results with non-null errors across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 6);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const expectedErrorCount = results.filter((r) => r.error !== null).length;
      const merged = mergeHarvestResults(results);

      expect(merged.errorCount).toBe(expectedErrorCount);
      expect(merged.errors.length).toBe(expectedErrorCount);
    }
  });

  test('all error messages are preserved', () => {
    const okScreen = makeScreenId('ok');
    const fail1Screen = makeScreenId('fail1');
    const fail2Screen = makeScreenId('fail2');
    const results: readonly HarvestResult[] = [
      makeHarvestResult(okScreen, []),
      makeHarvestResult(fail1Screen, [], 'timeout'),
      makeHarvestResult(fail2Screen, [], 'network error'),
    ];

    const merged = mergeHarvestResults(results);
    expect(merged.errorCount).toBe(2);
    expect(merged.errors.map((e) => e.message).sort()).toEqual(['network error', 'timeout']);
  });
});

// ─── Law 6: Deterministic Output ───

test.describe('Law 6: Deterministic Output', () => {
  test('screens are sorted in merged output across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 5);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));
      const merged = mergeHarvestResults(results);

      for (let i = 1; i < merged.screens.length; i += 1) {
        expect((merged.screens[i] as string) >= (merged.screens[i - 1] as string)).toBe(true);
      }
    }
  });

  test('proposals are sorted deterministically in merged output across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 4);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));
      const merged = mergeHarvestResults(results);

      const keys = merged.proposals.map((p) => `${p.screen}:${p.targetRef}:${p.kind}`);
      for (let i = 1; i < keys.length; i += 1) {
        expect(keys[i]! >= keys[i - 1]!).toBeTruthy();
      }
    }
  });

  test('input order does not affect merged output across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + randomInt(next, 4);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const forward = mergeHarvestResults(results);
      const reversed = mergeHarvestResults([...results].reverse());

      expect(forward).toEqual(reversed);
    }
  });
});

// ─── Law 7: Lift/Merge Round-Trip ───

test.describe('Law 7: Lift/Merge Round-Trip', () => {
  test('lift then merge equals direct mergeHarvestResults across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 5);
      const results = Array.from({ length: count }, () => randomHarvestResult(next));

      const viaLift = results
        .map(liftHarvestResult)
        .reduce(mergeTwoHarvestResults, EMPTY_MERGED_HARVEST);
      const viaDirect = mergeHarvestResults(results);

      expect(viaLift).toEqual(viaDirect);
    }
  });

  test('single result lift produces correct MergedHarvestResult', () => {
    const screen = makeScreenId('test-screen');
    const proposals = [makeProposal(screen, 'btn-1'), makeProposal(screen, 'btn-2', 'new-surface')];
    const result = makeHarvestResult(screen, proposals);
    const lifted = liftHarvestResult(result);

    expect(lifted.screens).toEqual([screen]);
    expect(lifted.proposals.length).toBe(2);
    expect(lifted.totalElementsDiscovered).toBe(1);
    expect(lifted.totalSurfacesDiscovered).toBe(1);
    expect(lifted.errorCount).toBe(0);
  });

  test('single error result lift sets errorCount to 1', () => {
    const screen = makeScreenId('error-screen');
    const result = makeHarvestResult(screen, [], 'crashed');
    const lifted = liftHarvestResult(result);

    expect(lifted.errorCount).toBe(1);
    expect(lifted.errors.length).toBe(1);
    expect(lifted.errors[0]?.message).toBe('crashed');
  });
});

// ─── Law 8: Effect-based concurrent harvest ───

test.describe('Law 8: Effect-based Concurrent Harvest', () => {
  test('harvestScreensConcurrently collects results for all screens', async () => {
    const screens = [makeScreenId('s1'), makeScreenId('s2'), makeScreenId('s3')];
    const harvestFn = (screen: ScreenId, _state: HarvestSharedState) =>
      Effect.succeed(makeHarvestResult(screen, [makeProposal(screen, 'el-1')]));

    const results = await Effect.runPromise(
      harvestScreensConcurrently(screens, harvestFn, {
        concurrency: 2,
        sharedState: makeSharedState(),
      }),
    );

    expect(results.length).toBe(3);
    expect(new Set(results.map((r) => r.screen as string)).size).toBe(3);
  });

  test('harvestScreensConcurrently with empty screens returns empty array', async () => {
    const harvestFn = (screen: ScreenId, _state: HarvestSharedState) =>
      Effect.succeed(makeHarvestResult(screen));

    const results = await Effect.runPromise(
      harvestScreensConcurrently([], harvestFn, { sharedState: makeSharedState() }),
    );

    expect(results.length).toBe(0);
  });

  test('harvestScreensConcurrently passes shared state to each screen', async () => {
    const screens = [makeScreenId('a'), makeScreenId('b')];
    const receivedStates: HarvestSharedState[] = [];

    const harvestFn = (screen: ScreenId, state: HarvestSharedState) => {
      receivedStates.push(state);
      return Effect.succeed(makeHarvestResult(screen));
    };

    const sharedState = makeSharedState();
    await Effect.runPromise(
      harvestScreensConcurrently(screens, harvestFn, {
        concurrency: 1,
        sharedState,
      }),
    );

    expect(receivedStates.length).toBe(2);
    // All received states should be the same shared state object
    for (const state of receivedStates) {
      expect(state.selectorCanon.kind).toBe('selector-canon');
    }
  });

  test('concurrent results merged == sequential results merged across 150 seeds', async () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 1 + randomInt(next, 4);
      const screenIds = Array.from({ length: count }, (_, i) =>
        makeScreenId(`screen-${seed}-${i}`),
      );

      // Deterministic harvest function
      const harvestFn = (screen: ScreenId, _state: HarvestSharedState) => {
        const screenStr = screen as string;
        const proposals = [makeProposal(screen, `${screenStr}-el`)];
        return Effect.succeed(makeHarvestResult(screen, proposals));
      };

      const sharedState = makeSharedState();

      // Concurrent (concurrency: 4)
      const concurrentResults = await Effect.runPromise(
        harvestScreensConcurrently(screenIds, harvestFn, {
          concurrency: 4,
          sharedState,
        }),
      );

      // Sequential (concurrency: 1)
      const sequentialResults = await Effect.runPromise(
        harvestScreensConcurrently(screenIds, harvestFn, {
          concurrency: 1,
          sharedState,
        }),
      );

      // Merge both and compare
      const concurrentMerged = mergeHarvestResults(concurrentResults);
      const sequentialMerged = mergeHarvestResults(sequentialResults);

      expect(concurrentMerged).toEqual(sequentialMerged);
    }
  });
});
