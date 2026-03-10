import {
  compareByKey,
  compareByLocale,
  groupBy,
  stableSortByKey,
  uniqueSorted as domainUniqueSorted,
} from '../domain/collections';

export { compareByKey, compareByLocale, groupBy, stableSortByKey };

export function uniqueSorted<T extends string>(values: Iterable<T>): T[] {
  return domainUniqueSorted(values, { filterEmpty: true });
}
