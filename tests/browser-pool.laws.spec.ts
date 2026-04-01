/**
 * Law tests for browser pool pure policy functions.
 *
 * Invariants:
 *   1. Same-origin URLs get 'light' reset strategy.
 *   2. Cross-origin URLs get 'full' reset strategy.
 *   3. Missing URLs get 'full' reset strategy.
 *   4. Warm-up URL extraction returns unique entry points, capped by maxUrls.
 *   5. No-op pool returns null on acquire and no-ops on release.
 */
import { describe, it, expect } from 'vitest';
import {
  determineResetStrategy,
  extractWarmUpUrls,
  createNoOpBrowserPool,
} from '../lib/application/browser-pool';

describe('determineResetStrategy', () => {
  it('same-origin URLs get light reset', () => {
    expect(determineResetStrategy(
      'https://example.com/page-a',
      'https://example.com/page-b',
    )).toBe('light');
  });

  it('cross-origin URLs get full reset', () => {
    expect(determineResetStrategy(
      'https://example.com/page-a',
      'https://other.com/page-b',
    )).toBe('full');
  });

  it('null previous URL gets full reset', () => {
    expect(determineResetStrategy(null, 'https://example.com/page')).toBe('full');
  });

  it('null next URL gets full reset', () => {
    expect(determineResetStrategy('https://example.com/page', null)).toBe('full');
  });

  it('both null gets full reset', () => {
    expect(determineResetStrategy(null, null)).toBe('full');
  });
});

describe('extractWarmUpUrls', () => {
  it('extracts unique entry-point URLs from scenarios', () => {
    const scenarios = [
      { url: 'https://a.com' },
      { url: 'https://b.com' },
      { url: 'https://a.com' }, // duplicate
    ];
    const urls = extractWarmUpUrls(scenarios, 10);
    expect(urls).toEqual(['https://a.com', 'https://b.com']);
  });

  it('caps at maxUrls', () => {
    const scenarios = Array.from({ length: 20 }, (_, i) => ({
      url: `https://site-${i}.com`,
    }));
    const urls = extractWarmUpUrls(scenarios, 3);
    expect(urls.length).toBeLessThanOrEqual(3);
  });

  it('returns empty for empty scenarios', () => {
    expect(extractWarmUpUrls([], 5)).toEqual([]);
  });

  it('skips scenarios without URL', () => {
    const scenarios = [
      { url: 'https://a.com' },
      { url: null },
      {},
      { url: 'https://b.com' },
    ];
    const urls = extractWarmUpUrls(scenarios, 10);
    expect(urls).toEqual(['https://a.com', 'https://b.com']);
  });
});

describe('createNoOpBrowserPool', () => {
  it('acquire returns an overflow handle with null page', async () => {
    const pool = createNoOpBrowserPool();
    const handle = await pool.acquire();
    expect(handle.page).toBeNull();
    expect(handle.overflow).toBe(true);
  });

  it('release is a no-op', async () => {
    const pool = createNoOpBrowserPool();
    const handle = await pool.acquire();
    // Should not throw
    await pool.release(handle);
  });

  it('stats track acquisitions', async () => {
    const pool = createNoOpBrowserPool();
    await pool.acquire();
    await pool.acquire();
    expect(pool.stats.totalAcquired).toBe(2);
  });
});
