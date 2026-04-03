/**
 * Law tests for the per-scenario semantic dictionary cache.
 *
 * Invariants:
 *   1. has() returns false for uncached keys.
 *   2. set() + has() returns true.
 *   3. get() returns the cached value (including null for negative cache).
 *   4. Eviction fires when maxEntries is exceeded, clearing oldest half.
 *   5. size tracks the current number of cached entries.
 */
import { test, expect } from '@playwright/test';
import { createSemanticDictCache } from '../lib/runtime/agent/semantic-dict-cache';

test.describe('SemanticDictCache', () => {
  test('has() returns false for uncached keys', () => {
    const cache = createSemanticDictCache();
    expect(cache.has('click submit button')).toBe(false);
  });

  test('set() + has() returns true', () => {
    const cache = createSemanticDictCache();
    cache.set('click submit button', { entry: { id: 'test' } } as never);
    expect(cache.has('click submit button')).toBe(true);
  });

  test('get() returns the cached value', () => {
    const cache = createSemanticDictCache();
    const match = { entry: { id: 'test-entry' } } as never;
    cache.set('click submit', match);
    expect(cache.get('click submit')).toBe(match);
  });

  test('caches null for negative results', () => {
    const cache = createSemanticDictCache();
    cache.set('unknown intent', null);
    expect(cache.has('unknown intent')).toBe(true);
    expect(cache.get('unknown intent')).toBeNull();
  });

  test('evicts oldest half when maxEntries is exceeded', () => {
    const cache = createSemanticDictCache(4);
    cache.set('a', null);
    cache.set('b', null);
    cache.set('c', null);
    cache.set('d', null);
    expect(cache.stats.size).toBe(4);

    // Adding a 5th entry triggers eviction of oldest half (a, b)
    cache.set('e', null);
    expect(cache.stats.size).toBeLessThanOrEqual(4);
    // The newest entries should survive
    expect(cache.has('d')).toBe(true);
    expect(cache.has('e')).toBe(true);
  });

  test('size tracks current entries via stats', () => {
    const cache = createSemanticDictCache();
    expect(cache.stats.size).toBe(0);
    cache.set('x', null);
    expect(cache.stats.size).toBe(1);
    cache.set('y', null);
    expect(cache.stats.size).toBe(2);
  });
});
