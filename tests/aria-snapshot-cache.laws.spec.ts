/**
 * Law tests for the per-step ARIA snapshot cache.
 *
 * Invariants:
 *   1. First call on a fresh cache is a miss.
 *   2. Second call within TTL is a hit (returns cached value).
 *   3. Cache returns null for non-Playwright pages.
 *   4. invalidate() forces next call to be a miss.
 *   5. Hit/miss counters are accurate.
 */
import { describe, it, expect } from 'vitest';
import { createAriaSnapshotCache } from '../lib/runtime/agent/aria-snapshot-cache';

function makeMockPage(snapshot: object | null = { role: 'WebArea', name: 'Test' }) {
  let callCount = 0;
  return {
    accessibility: {
      async snapshot(_opts: { interestingOnly: boolean }) {
        callCount++;
        return snapshot;
      },
    },
    get callCount() { return callCount; },
  };
}

describe('AriaSnapshotCache', () => {
  it('first call is a miss, second within TTL is a hit', async () => {
    const cache = createAriaSnapshotCache();
    const page = makeMockPage();

    const snap1 = await cache.get(page);
    expect(snap1).not.toBeNull();
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(0);
    expect(page.callCount).toBe(1);

    const snap2 = await cache.get(page);
    expect(snap2).toBe(snap1);
    expect(cache.misses).toBe(1);
    expect(cache.hits).toBe(1);
    expect(page.callCount).toBe(1); // No additional DOM call
  });

  it('returns null for non-Playwright pages', async () => {
    const cache = createAriaSnapshotCache();
    const result = await cache.get(null);
    expect(result).toBeNull();
    expect(cache.misses).toBe(1);
  });

  it('returns null when snapshot() returns null', async () => {
    const cache = createAriaSnapshotCache();
    const page = makeMockPage(null);
    const result = await cache.get(page);
    expect(result).toBeNull();
  });

  it('invalidate forces next call to be a miss', async () => {
    const cache = createAriaSnapshotCache();
    const page = makeMockPage();

    await cache.get(page);
    expect(cache.misses).toBe(1);

    cache.invalidate();

    await cache.get(page);
    expect(cache.misses).toBe(2);
    expect(page.callCount).toBe(2);
  });

  it('truncates long snapshots', async () => {
    const bigSnapshot = { role: 'WebArea', children: Array.from({ length: 200 }, (_, i) => ({ role: 'text', name: `item-${i}-${'x'.repeat(20)}` })) };
    const cache = createAriaSnapshotCache();
    const page = makeMockPage(bigSnapshot);

    const result = await cache.get(page, 512);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(520); // 512 + small overflow from newline search
  });
});
