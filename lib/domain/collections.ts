export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

export function sortByStringKey<T>(values: Iterable<T>, keyOf: (value: T) => string): T[] {
  return [...values].sort((left, right) => compareStrings(keyOf(left), keyOf(right)));
}

export function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return sortByStringKey(new Set(values), (value) => value) as T[];
}

export function groupBy<T, K extends string>(values: Iterable<T>, keyOf: (value: T) => K): Record<K, T[]> {
  const groups = [...values].reduce<Map<K, T[]>>((acc, value) => {
    const key = keyOf(value);
    return acc.set(key, [...(acc.get(key) ?? []), value]);
  }, new Map());
  return Object.fromEntries(sortByStringKey(groups.entries(), ([key]) => key)) as Record<K, T[]>;
}
