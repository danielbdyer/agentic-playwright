import type { PrecedenceLadder } from './precedence';

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
} as const satisfies PrecedenceLadder<
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
} as const satisfies PrecedenceLadder<
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
} as const satisfies PrecedenceLadder<'cli-flag' | 'runbook' | 'repo-default'>;

export const precedencePolicies = {
  resolution: resolutionPrecedencePolicy,
  dataResolution: dataResolutionPrecedencePolicy,
  runSelection: runSelectionPrecedencePolicy,
} as const;

export type ResolutionPrecedenceRung = (typeof resolutionPrecedencePolicy.rungs)[number];
export type DataResolutionPrecedenceRung = (typeof dataResolutionPrecedencePolicy.rungs)[number];
export type RunSelectionPrecedenceRung = (typeof runSelectionPrecedencePolicy.rungs)[number];
