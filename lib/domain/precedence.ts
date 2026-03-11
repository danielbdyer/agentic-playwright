export const resolutionPrecedenceLaw = [
  'explicit',
  'control',
  'approved-screen-knowledge',
  'shared-patterns',
  'prior-evidence',
  'approved-equivalent-overlay',
  'structured-translation',
  'live-dom',
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

export type ResolutionPrecedenceRung = (typeof resolutionPrecedenceLaw)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedenceLaw)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedenceLaw)[number];

export function chooseByPrecedence<TEntry, TRung extends string>(
  candidates: ReadonlyArray<{ rung: TRung; value: TEntry | null | undefined }>,
  law: ReadonlyArray<TRung>,
): TEntry | null {
  for (const rung of law) {
    const match = candidates.find((candidate) => candidate.rung === rung);
    if (match?.value !== null && match?.value !== undefined) {
      return match.value;
    }
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
