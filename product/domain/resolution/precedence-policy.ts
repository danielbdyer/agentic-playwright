import type { PrecedenceLadder } from './precedence';

/** @deprecated Use `PrecedenceLadder<TRung>` directly. Retained
 *  as a type alias for source-compatibility with existing callers
 *  until the next rename pass. */
export type OrderedPrecedencePolicy<TRung extends string> = PrecedenceLadder<TRung>;

export const resolutionPrecedencePolicy = {
  concern: 'resolution',
  rungs: [
    'explicit',
    'control',
    'approved-screen-knowledge',
    'shared-patterns',
    'prior-evidence',
    'semantic-dictionary',
    'approved-equivalent-overlay',
    'structured-translation',
    'live-dom',
    'agent-interpreted',
    'needs-human',
  ],
} as const satisfies OrderedPrecedencePolicy<
  | 'explicit'
  | 'control'
  | 'approved-screen-knowledge'
  | 'shared-patterns'
  | 'prior-evidence'
  | 'semantic-dictionary'
  | 'approved-equivalent-overlay'
  | 'structured-translation'
  | 'live-dom'
  | 'agent-interpreted'
  | 'needs-human'
>;

export const dataResolutionPrecedencePolicy = {
  concern: 'data-resolution',
  rungs: [
    'explicit',
    'runbook-dataset-binding',
    'dataset-default',
    'hint-default-value',
    'posture-sample',
    'generated-token',
  ],
} as const satisfies OrderedPrecedencePolicy<
  | 'explicit'
  | 'runbook-dataset-binding'
  | 'dataset-default'
  | 'hint-default-value'
  | 'posture-sample'
  | 'generated-token'
>;

export const runSelectionPrecedencePolicy = {
  concern: 'run-selection',
  rungs: [
    'cli-flag',
    'runbook',
    'repo-default',
  ],
} as const satisfies OrderedPrecedencePolicy<'cli-flag' | 'runbook' | 'repo-default'>;

export const precedencePolicies = {
  resolution: resolutionPrecedencePolicy,
  dataResolution: dataResolutionPrecedencePolicy,
  runSelection: runSelectionPrecedencePolicy,
} as const;

export type ResolutionPrecedenceRung = (typeof resolutionPrecedencePolicy.rungs)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedencePolicy.rungs)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedencePolicy.rungs)[number];
