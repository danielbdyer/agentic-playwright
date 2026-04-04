import type { OrderedPrecedencePolicy } from './precedence-policy';
import {
  dataResolutionPrecedencePolicy,
  precedencePolicies,
  resolutionPrecedencePolicy,
  runSelectionPrecedencePolicy,
} from './precedence-policy';

export const resolutionPrecedenceLaw = resolutionPrecedencePolicy.rungs;

export const dataResolutionPrecedenceLaw = dataResolutionPrecedencePolicy.rungs;

export const runSelectionPrecedenceLaw = runSelectionPrecedencePolicy.rungs;

/**
 * Route navigation precedence law:
 * 1) explicit scenario URL / route-state request
 * 2) runbook route binding
 * 3) approved route knowledge variants
 * 4) screen canonical url fallback
 */
export const routeSelectionPrecedencePolicy = {
  concern: 'route-selection',
  rungs: [
    'explicit-url',
    'runbook-binding',
    'route-knowledge',
    'screen-default',
  ],
} as const satisfies OrderedPrecedencePolicy<
  'explicit-url' | 'runbook-binding' | 'route-knowledge' | 'screen-default'
>;

export const routeSelectionPrecedenceLaw = routeSelectionPrecedencePolicy.rungs;

export type ResolutionPrecedenceRung = (typeof resolutionPrecedenceLaw)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedenceLaw)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedenceLaw)[number];
export type RouteSelectionPrecedenceRung = (typeof routeSelectionPrecedenceLaw)[number];
export { precedencePolicies };

/**
 * Select the highest-precedence candidate value according to a rung law.
 *
 * Complexity: O(R+C) where R = rungs, C = candidates.
 * Candidates are pre-indexed into a Map (O(C) setup), then rungs are walked
 * in order with O(1) lookups and true early-exit on first hit.
 */
export function chooseByPrecedence<TEntry, TRung extends string>(
  candidates: ReadonlyArray<{ rung: TRung; value: TEntry | null | undefined }>,
  law: ReadonlyArray<TRung>,
): TEntry | null {
  const indexed = new Map<TRung, TEntry>();
  for (const candidate of candidates) {
    if (candidate.value !== null && candidate.value !== undefined && !indexed.has(candidate.rung)) {
      indexed.set(candidate.rung, candidate.value);
    }
  }
  for (const rung of law) {
    const value = indexed.get(rung);
    if (value !== undefined) return value;
  }
  return null;
}

/**
 * Precedence-governed dispatch with provenance — the named abstraction.
 *
 * Like chooseByPrecedence, but returns both the winning value AND
 * the rung that produced it. This is the formal "Enveloped<T, { source, rank }>"
 * from the design calculus: every dispatch result carries its provenance.
 *
 * @see docs/design-calculus.md § Abstraction 1: Precedence-Governed Dispatch
 */
export interface PrecedenceResult<TEntry, TRung extends string> {
  readonly value: TEntry;
  readonly rung: TRung;
  readonly rank: number;
}

export function dispatchByPrecedence<TEntry, TRung extends string>(
  candidates: ReadonlyArray<{ rung: TRung; value: TEntry | null | undefined }>,
  law: ReadonlyArray<TRung>,
): PrecedenceResult<TEntry, TRung> | null {
  const indexed = new Map<TRung, TEntry>();
  for (const candidate of candidates) {
    if (candidate.value !== null && candidate.value !== undefined && !indexed.has(candidate.rung)) {
      indexed.set(candidate.rung, candidate.value);
    }
  }
  for (let rank = 0; rank < law.length; rank++) {
    const rung = law[rank]!;
    const value = indexed.get(rung);
    if (value !== undefined) return { value, rung, rank };
  }
  return null;
}

export function precedenceWeight<TRung extends string>(
  law: ReadonlyArray<TRung>,
  rung: TRung,
  base = 100,
): number {
  const index = law.indexOf(rung);
  return index >= 0 ? (law.length - index) * base : 0;
}
