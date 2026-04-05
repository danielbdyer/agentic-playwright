import { expect, test } from '@playwright/test';
import { groupBy, sortByStringKey, uniqueSorted } from '../../lib/domain/kernel/collections';
import { mulberry32, randomWord , LAW_SEED_COUNT } from '../support/random';

test('uniqueSorted is deterministic and idempotent across random string sets', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
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
