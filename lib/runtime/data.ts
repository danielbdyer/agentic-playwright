import { Match, pipe } from 'effect';
import { formatRefPath } from '../domain/ref-path';
import type { ValueRef } from '../domain/types';

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

  return pipe(
    Match.type<ValueRef>(),
    Match.discriminatorsExhaustive('kind')({
      'literal': (r) => r.value,
      'fixture-path': (r) => {
        const resolved = lookupPath(fixtures, r.path.segments);
        return resolved === undefined || resolved === null ? undefined : String(resolved);
      },
      'parameter-row': (r) => {
        const row = fixtures.dataRow as Record<string, unknown> | undefined;
        const resolved = row?.[r.name];
        return resolved === undefined || resolved === null ? undefined : String(resolved);
      },
      'generated-token': (r) => {
        const resolved = (fixtures.generatedTokens as Record<string, unknown> | undefined)?.[r.token];
        return resolved === undefined || resolved === null ? r.token : String(resolved);
      },
      'posture-sample': () => undefined,
    }),
  )(raw);
}

export function describeValueRef(raw: ValueRef): string {
  return pipe(
    Match.type<ValueRef>(),
    Match.discriminatorsExhaustive('kind')({
      'fixture-path': (r) => formatRefPath(r.path),
      'literal': (r) => r.value,
      'generated-token': (r) => r.token,
      'parameter-row': (r) => `${r.name}[${r.rowIndex}]`,
      'posture-sample': (r) => `${r.element}.${r.posture}[${r.sampleIndex}]`,
    }),
  )(raw);
}
