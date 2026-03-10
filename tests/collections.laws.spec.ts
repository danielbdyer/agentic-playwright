import { expect, test } from '@playwright/test';
import { groupBy, stableSortByKey, uniqueSorted } from '../lib/domain/collections';

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let t = Math.imul(current ^ (current >>> 15), 1 | current);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('uniqueSorted is idempotent and deterministic for randomized string sets', () => {
  for (let seed = 1; seed <= 80; seed += 1) {
    const next = mulberry32(seed);
    const values = Array.from({ length: 40 }, () => {
      const value = `v-${Math.floor(next() * 12)}`;
      return next() > 0.75 ? '' : value;
    });

    const once = uniqueSorted(values, { filterEmpty: true });
    const twice = uniqueSorted(once, { filterEmpty: true });

    expect(twice).toEqual(once);
    expect([...once]).toEqual([...once].sort((left, right) => left.localeCompare(right)));
    expect(new Set(once).size).toBe(once.length);
  }
});

test('stableSortByKey preserves tie order and deterministic ordering', () => {
  const input = [
    { id: '3', family: 'b' },
    { id: '1', family: 'a' },
    { id: '2', family: 'a' },
    { id: '4', family: 'b' },
  ];

  const sorted = stableSortByKey(input, (entry) => entry.family);

  expect(sorted.map((entry) => entry.id)).toEqual(['1', '2', '3', '4']);
  expect(sorted.filter((entry) => entry.family === 'a').map((entry) => entry.id)).toEqual(['1', '2']);
  expect(sorted.filter((entry) => entry.family === 'b').map((entry) => entry.id)).toEqual(['3', '4']);
});

test('groupBy groups deterministically when consumed through uniqueSorted keys', () => {
  const grouped = groupBy(
    [
      { id: 'a1', kind: 'surface' },
      { id: 'e1', kind: 'element' },
      { id: 's2', kind: 'surface' },
      { id: 'e2', kind: 'element' },
    ],
    (entry) => entry.kind,
  );

  const keys = uniqueSorted(Object.keys(grouped));
  expect(keys).toEqual(['element', 'surface']);
  expect(grouped.element?.map((entry) => entry.id)).toEqual(['e1', 'e2']);
  expect(grouped.surface?.map((entry) => entry.id)).toEqual(['a1', 's2']);
});
