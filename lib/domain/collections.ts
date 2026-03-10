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
  const groups = new Map<K, T[]>();
  for (const value of values) {
    const key = keyOf(value);
    const existing = groups.get(key) ?? [];
    existing.push(value);
    groups.set(key, existing);
  }
  return Object.fromEntries(sortByStringKey(groups.entries(), ([key]) => key)) as Record<K, T[]>;
}
