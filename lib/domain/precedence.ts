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

export type ResolutionPrecedenceRung = (typeof resolutionPrecedenceLaw)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedenceLaw)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedenceLaw)[number];

export function chooseByPrecedence<TEntry, TRung extends string>(
  candidates: ReadonlyArray<{ rung: TRung; value: TEntry | null | undefined }>,
  law: ReadonlyArray<TRung>,
): TEntry | null {
  return law.reduce<TEntry | null>(
    (winner, rung) => {
      if (winner !== null) return winner;
      const match = candidates.find((candidate) => candidate.rung === rung);
      return match?.value !== null && match?.value !== undefined ? match.value : null;
    },
    null,
  );
}

export function precedenceWeight<TRung extends string>(
  law: ReadonlyArray<TRung>,
  rung: TRung,
  base = 100,
): number {
  const index = law.indexOf(rung);
  return index >= 0 ? (law.length - index) * base : 0;
}
