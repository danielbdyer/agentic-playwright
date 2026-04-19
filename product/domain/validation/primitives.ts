import { SchemaError } from '../kernel/errors';

export type UnknownRecord = Record<string, unknown>;

export function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new SchemaError('expected object', path);
  }
  return value as UnknownRecord;
}

export function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SchemaError('expected array', path);
  }
  return value;
}

export function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new SchemaError('expected string', path);
  }
  return value;
}

export function expectOptionalString(value: unknown, path: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return expectString(value, path);
}

export function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new SchemaError('expected number', path);
  }
  return value;
}

export function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SchemaError('expected boolean', path);
  }
  return value;
}

export function expectEnum<T extends string>(value: unknown, path: string, members: readonly T[]): T {
  const parsed = expectString(value, path);
  if (!members.includes(parsed as T)) {
    throw new SchemaError(`expected one of ${members.join(', ')}`, path);
  }
  return parsed as T;
}

export function expectId<T>(value: unknown, path: string, create: (raw: string) => T): T {
  return create(expectString(value, path));
}

export function expectOptionalId<T>(value: unknown, path: string, create: (raw: string) => T): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return create(expectString(value, path));
}

export function expectStringArray(value: unknown, path: string): string[] {
  return expectArray(value, path).map((entry, index) => expectString(entry, `${path}[${index}]`));
}

export function expectIdArray<T>(value: unknown, path: string, create: (raw: string) => T): T[] {
  return expectArray(value, path).map((entry, index) => expectId(entry, `${path}[${index}]`, create));
}

export function expectStringRecord(value: unknown, path: string): Record<string, string> {
  const record = expectRecord(value, path);
  return Object.fromEntries(
    Object.entries(record).map(([key, entryValue]) => [key, expectString(entryValue, `${path}.${key}`)]),
  );
}
