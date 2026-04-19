import type { UnknownRecord } from '../primitives';
import { expectRecord } from '../primitives';

export function coerceRecord(value: unknown, path: string): UnknownRecord {
  return expectRecord(value, path);
}

export function coerceNullableRecord(value: unknown, path: string): UnknownRecord {
  return expectRecord(value ?? {}, path);
}
