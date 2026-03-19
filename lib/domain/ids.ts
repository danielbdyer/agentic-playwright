import type {
  AdoId,
  CanonicalTargetRef,
  ElementId,
  PostureId,
  RouteId,
  RouteVariantId,
  ScreenId,
  SnapshotTemplateId,
  SurfaceId,
} from './identity';

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
  route: (routeId: RouteId | string): string => joinGraphId('route', routeId),
  routeVariant: (routeId: RouteId | string, variantId: RouteVariantId | string): string => joinGraphId('route-variant', routeId, variantId),
  screen: (screenId: ScreenId): string => joinGraphId('screen', screenId),
  screenHints: (screenId: ScreenId): string => joinGraphId('screen-hints', screenId),
  pattern: (patternId: string): string => joinGraphId('pattern', normalizePathFragment(patternId)),
  confidenceOverlay: (recordId: string): string => joinGraphId('confidence-overlay', normalizePathFragment(recordId)),
  dataset: (datasetId: string): string => joinGraphId('dataset', normalizePathFragment(datasetId)),
  resolutionControl: (controlId: string): string => joinGraphId('resolution-control', normalizePathFragment(controlId)),
  runbook: (runbookId: string): string => joinGraphId('runbook', normalizePathFragment(runbookId)),
  section: (screenId: ScreenId, sectionId: string): string => joinGraphId('section', screenId, sectionId),
  surface: (screenId: ScreenId, surfaceId: SurfaceId): string => joinGraphId('surface', screenId, surfaceId),
  element: (screenId: ScreenId, elementId: ElementId): string => joinGraphId('element', screenId, elementId),
  target: (targetRef: CanonicalTargetRef | string): string => joinGraphId('target', targetRef),
  snapshotAnchor: (screenId: ScreenId, snapshotTemplateId: SnapshotTemplateId | string): string =>
    joinGraphId('snapshot-anchor', screenId, normalizePathFragment(snapshotTemplateId)),
  harvestRun: (runId: string): string => joinGraphId('harvest-run', runId),
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
  participant: (participantId: string): string => joinGraphId('participant', normalizePathFragment(participantId)),
  intervention: (interventionId: string): string => joinGraphId('intervention', normalizePathFragment(interventionId)),
  improvementRun: (improvementRunId: string): string => joinGraphId('improvement-run', normalizePathFragment(improvementRunId)),
  acceptanceDecision: (decisionId: string): string => joinGraphId('acceptance-decision', normalizePathFragment(decisionId)),
};

export const mcpUris = {
  graph: 'tesseract://graph',
  screenTemplate: 'tesseract://screen/{screenId}',
  scenarioTemplate: 'tesseract://scenario/{adoId}',
  impactTemplate: 'tesseract://impact/{nodeId}',
} as const;

export const knowledgePaths = {
  routes: (app: string): string => `knowledge/routes/${app}.routes.yaml`,
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
