export const resolutionPrecedenceLaw = [
  'explicit',
  'control',
  'approved-screen-knowledge',
  'shared-patterns',
  'prior-evidence',
  'approved-equivalent-overlay',
  'structured-translation',
  'live-dom',
  'agent-interpreted',
  'needs-human',
] as const;

export const dataResolutionPrecedenceLaw = [
  'explicit',
  'runbook-dataset-binding',
  'dataset-default',
  'hint-default-value',
  'posture-sample',
  'generated-token',
] as const;

export const runSelectionPrecedenceLaw = [
  'cli-flag',
  'runbook',
  'repo-default',
] as const;

/**
 * Route navigation precedence law:
 * 1) explicit scenario URL / route-state request
 * 2) runbook route binding
 * 3) approved route knowledge variants
 * 4) screen canonical url fallback
 */
export const routeSelectionPrecedenceLaw = [
  'explicit-url',
  'runbook-binding',
  'route-knowledge',
  'screen-default',
] as const;

export type ResolutionPrecedenceRung = (typeof resolutionPrecedenceLaw)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedenceLaw)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedenceLaw)[number];
export type RouteSelectionPrecedenceRung = (typeof routeSelectionPrecedenceLaw)[number];

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

export function precedenceWeight<TRung extends string>(
  law: ReadonlyArray<TRung>,
  rung: TRung,
  base = 100,
): number {
  const index = law.indexOf(rung);
  return index >= 0 ? (law.length - index) * base : 0;
}
