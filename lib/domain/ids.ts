import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId, SurfaceId } from './identity';

const separators = {
  graph: ':',
  path: '/',
} as const;

function normalizePathFragment(value: string): string {
  return value.replace(/\\/g, separators.path);
}

function joinGraphId(...parts: ReadonlyArray<string | number>): string {
  return parts.join(separators.graph);
}

export const graphIds = {
  snapshot: {
    ado: (adoId: AdoId): string => joinGraphId('snapshot', 'ado', adoId),
    knowledge: (relativePath: SnapshotTemplateId | string): string => joinGraphId('snapshot', 'knowledge', normalizePathFragment(relativePath)),
  },
  screen: (screenId: ScreenId): string => joinGraphId('screen', screenId),
  screenHints: (screenId: ScreenId): string => joinGraphId('screen-hints', screenId),
  pattern: (patternId: string): string => joinGraphId('pattern', normalizePathFragment(patternId)),
  dataset: (datasetId: string): string => joinGraphId('dataset', normalizePathFragment(datasetId)),
  resolutionControl: (controlId: string): string => joinGraphId('resolution-control', normalizePathFragment(controlId)),
  runbook: (runbookId: string): string => joinGraphId('runbook', normalizePathFragment(runbookId)),
  section: (screenId: ScreenId, sectionId: string): string => joinGraphId('section', screenId, sectionId),
  surface: (screenId: ScreenId, surfaceId: SurfaceId): string => joinGraphId('surface', screenId, surfaceId),
  element: (screenId: ScreenId, elementId: ElementId): string => joinGraphId('element', screenId, elementId),
  posture: (screenId: ScreenId, elementId: ElementId, postureId: PostureId): string => joinGraphId('posture', screenId, elementId, postureId),
  capability: {
    screen: (screenId: ScreenId): string => joinGraphId('capability', 'screen', screenId),
    surface: (screenId: ScreenId, surfaceId: SurfaceId): string => joinGraphId('capability', 'surface', screenId, surfaceId),
    element: (screenId: ScreenId, elementId: ElementId): string => joinGraphId('capability', 'element', screenId, elementId),
  },
  scenario: (adoId: AdoId): string => joinGraphId('scenario', adoId),
  step: (adoId: AdoId, index: number): string => joinGraphId('step', adoId, index),
  stepPrefix: (adoId: AdoId): string => joinGraphId('step', adoId, ''),
  generatedSpec: (adoId: AdoId): string => joinGraphId('generated-spec', adoId),
  generatedTrace: (adoId: AdoId): string => joinGraphId('generated-trace', adoId),
  generatedReview: (adoId: AdoId): string => joinGraphId('generated-review', adoId),
  evidence: (relativePath: string): string => joinGraphId('evidence', normalizePathFragment(relativePath)),
  policyDecision: (decisionId: string): string => joinGraphId('policy-decision', decisionId),
};

export const mcpUris = {
  graph: 'tesseract://graph',
  screenTemplate: 'tesseract://screen/{screenId}',
  scenarioTemplate: 'tesseract://scenario/{adoId}',
  impactTemplate: 'tesseract://impact/{nodeId}',
} as const;

export const knowledgePaths = {
  surface: (screenId: ScreenId): string => `knowledge/surfaces/${screenId}.surface.yaml`,
  elements: (screenId: ScreenId): string => `knowledge/screens/${screenId}.elements.yaml`,
  postures: (screenId: ScreenId): string => `knowledge/screens/${screenId}.postures.yaml`,
  hints: (screenId: ScreenId): string => `knowledge/screens/${screenId}.hints.yaml`,
  patterns: (): string => 'knowledge/patterns/core.patterns.yaml',
} as const;

export const controlPaths = {
  dataset: (name: string): string => `controls/datasets/${name}.dataset.yaml`,
  resolution: (name: string): string => `controls/resolution/${name}.resolution.yaml`,
  runbook: (name: string): string => `controls/runbooks/${name}.runbook.yaml`,
} as const;
