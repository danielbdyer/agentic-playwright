export function compareByLocale(left: string, right: string): number {
  return left.localeCompare(right);
}

export function compareByKey<T>(keyOf: (value: T) => string): (left: T, right: T) => number {
  return (left, right) => compareByLocale(keyOf(left), keyOf(right));
}

export function stableSortByKey<T>(values: readonly T[], keyOf: (value: T) => string): T[] {
  return [...values].sort(compareByKey(keyOf));
}

export function uniqueSorted<T extends string>(values: Iterable<T>, options?: { filterEmpty?: boolean | undefined }): T[] {
  const filtered = options?.filterEmpty
    ? [...values].filter((value) => value.length > 0)
    : [...values];
  return [...new Set(filtered)].sort(compareByLocale) as T[];
}

export function groupBy<T, K extends string>(values: Iterable<T>, keyOf: (value: T) => K): Record<K, T[]> {
  const grouped = {} as Record<K, T[]>;
  for (const value of values) {
    const key = keyOf(value);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(value);
  }
  return grouped;
}
