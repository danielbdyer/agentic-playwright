import { expect, test } from '@playwright/test';
import { groupBy, sortByStringKey, uniqueSorted } from '../lib/domain/collections';

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomWord(next: () => number): string {
  const alphabet = 'abcxyz';
  const length = 1 + Math.floor(next() * 6);
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
}

test('uniqueSorted is deterministic and idempotent across random string sets', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const values = Array.from({ length: 40 }, () => randomWord(next));

    const once = uniqueSorted(values);
    const twice = uniqueSorted(once);

    expect(twice).toEqual(once);
    expect(new Set(once).size).toBe(once.length);
    expect(once).toEqual([...once].sort((left, right) => left.localeCompare(right)));
  }
});

test('sortByStringKey is stable for equal keys', () => {
  const values = [
    { key: 'b', value: 1 },
    { key: 'a', value: 2 },
    { key: 'b', value: 3 },
    { key: 'a', value: 4 },
  ];

  const sorted = sortByStringKey(values, (entry) => entry.key);
  expect(sorted).toEqual([
    { key: 'a', value: 2 },
    { key: 'a', value: 4 },
    { key: 'b', value: 1 },
    { key: 'b', value: 3 },
  ]);
});

test('groupBy is deterministic and preserves insertion order per key', () => {
  const values = [
    { category: 'beta', name: 'b1' },
    { category: 'alpha', name: 'a1' },
    { category: 'beta', name: 'b2' },
    { category: 'alpha', name: 'a2' },
  ];

  const grouped = groupBy(values, (entry) => entry.category);

  expect(Object.keys(grouped)).toEqual(['alpha', 'beta']);
  expect(grouped.alpha?.map((entry) => entry.name)).toEqual(['a1', 'a2']);
  expect(grouped.beta?.map((entry) => entry.name)).toEqual(['b1', 'b2']);
  expect(groupBy(Object.values(grouped).flat(), (entry) => entry.category)).toEqual(grouped);
});
