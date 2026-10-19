import { describe, expect, it } from 'vitest';
import { diffSummaries, normalizeRouteUrl, routeDrift, routeUrlRelativeTo, summaryFromFingerprint } from '../../../src/memory/route.js';
import { lockedFileCount, withFileLock } from '../../../src/memory/lock.js';
import { thrown } from './helpers.js';

const FINGERPRINT = {
  hash: 'sha256:a',
  landmarks: ['search', 'banner', 'main', 'banner'],
  roleCounts: { button: 3, textbox: 1, heading: 2, generic: 40, link: 0 },
  dataBlocks: 14,
};

describe('route urls', () => {
  it('are stored relative without a leading slash, or absolute', () => {
    expect(normalizeRouteUrl('/PolicySearch')).toBe('PolicySearch');
    expect(normalizeRouteUrl('//PolicySearch?x=1')).toBe('PolicySearch?x=1');
    expect(normalizeRouteUrl('https://app.example/Policies/')).toBe('https://app.example/Policies/');
    expect(thrown(() => normalizeRouteUrl('  ')).family).toBe('invalid-input');
  });

  it('can be made relative to a profile baseURL', () => {
    expect(routeUrlRelativeTo('https://app.example/Module/PolicySearch', 'https://app.example/Module')).toBe('PolicySearch');
    expect(routeUrlRelativeTo('https://app.example/Module/PolicySearch', 'https://app.example/Module/')).toBe('PolicySearch');
    expect(routeUrlRelativeTo('https://app.example/Module/', 'https://app.example/Module')).toBe('');
    expect(routeUrlRelativeTo('https://other.example/X', 'https://app.example/Module')).toBe('https://other.example/X');
  });
});

describe('route summaries', () => {
  it('keep landmarks (sorted, distinct), interactive role counts, and data blocks', () => {
    expect(summaryFromFingerprint(FINGERPRINT)).toEqual({
      landmarks: ['banner', 'main', 'search'],
      interactiveRoles: { button: 3, textbox: 1 },
      dataBlocks: 14,
    });
  });

  it('diff into readable lines', () => {
    const before = summaryFromFingerprint(FINGERPRINT);
    const after = { landmarks: ['banner', 'main', 'navigation'], interactiveRoles: { button: 1, textbox: 1, link: 4 }, dataBlocks: 12 };
    expect(diffSummaries(before, after)).toEqual(['landmark search missing', 'landmark navigation added', 'button 3 → 1', 'link 0 → 4', 'data-blocks 14 → 12']);
    expect(diffSummaries(before, before)).toEqual([]);
  });

  it('drift is structural when a summary was recorded, else any hash change', () => {
    const summary = summaryFromFingerprint(FINGERPRINT);
    expect(routeDrift({ fingerprint: 'sha256:a', summary }, { ...FINGERPRINT, hash: 'sha256:copy-changed' })).toEqual({ changed: false, diff: [] });
    expect(routeDrift({ fingerprint: 'sha256:a', summary }, { ...FINGERPRINT, landmarks: ['banner', 'main'] })).toEqual({ changed: true, diff: ['landmark search missing'] });
    expect(routeDrift({ fingerprint: 'sha256:a' }, { ...FINGERPRINT, hash: 'sha256:b' }).changed).toBe(true);
    expect(routeDrift({ fingerprint: 'sha256:a' }, FINGERPRINT)).toEqual({ changed: false, diff: [] });
    expect(routeDrift(undefined, FINGERPRINT)).toEqual({ changed: false, diff: [] });
  });
});

describe('per-file lock', () => {
  it('runs holders of one file one at a time, in arrival order, and releases on failure', async () => {
    const order: string[] = [];
    const slow = (name: string, ms: number, fail = false) =>
      withFileLock('/tmp/x/catalog.yaml', async () => {
        order.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, ms));
        order.push(`${name}:end`);
        if (fail) throw new Error(name);
        return name;
      });
    const results = await Promise.allSettled([slow('a', 20, true), slow('b', 1), slow('c', 5)]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(lockedFileCount()).toBe(0);
  });

  it('does not serialize different files', async () => {
    const order: string[] = [];
    await Promise.all([
      withFileLock('/tmp/x/a.yaml', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push('a');
      }),
      withFileLock('/tmp/x/b.yaml', async () => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['b', 'a']);
  });
});
