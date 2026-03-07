import { formatRefPath } from '../domain/ref-path';
import { ValueRef } from '../domain/types';

function lookupPath(fixtures: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = fixtures;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function resolveDataValue(
  fixtures: Record<string, unknown>,
  raw: ValueRef | null | undefined,
): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  switch (raw.kind) {
    case 'literal':
      return raw.value;
    case 'fixture-path': {
      const resolved = lookupPath(fixtures, raw.path.segments);
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    }
    case 'parameter-row': {
      const row = fixtures.dataRow as Record<string, unknown> | undefined;
      const resolved = row?.[raw.name];
      return resolved === undefined || resolved === null ? undefined : String(resolved);
    }
    case 'generated-token': {
      const resolved = (fixtures.generatedTokens as Record<string, unknown> | undefined)?.[raw.token];
      return resolved === undefined || resolved === null ? raw.token : String(resolved);
    }
    case 'posture-sample':
      return undefined;
    default:
      return undefined;
  }
}

export function describeValueRef(raw: ValueRef): string {
  switch (raw.kind) {
    case 'fixture-path':
      return formatRefPath(raw.path);
    case 'literal':
      return raw.value;
    case 'generated-token':
      return raw.token;
    case 'parameter-row':
      return `${raw.name}[${raw.rowIndex}]`;
    case 'posture-sample':
      return `${raw.element}.${raw.posture}[${raw.sampleIndex}]`;
    default:
      return '';
  }
}
