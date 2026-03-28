import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog, ArtifactEnvelope } from '../catalog';
import type {
  AdoSnapshot,
  ExecutionPosture,
  RuntimeInterpreterMode,
  RuntimeDatasetBinding,
  RuntimeRunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  ScenarioRunPlan,
  StepResolution,
} from '../../domain/types';
import type { AdoId, ScreenId } from '../../domain/identity';
import { uniqueSorted } from '../../domain/collections';
import { TesseractError } from '../../domain/errors';
import { activeDatasetForRun, findRunbook } from '../controls';
import { chooseByPrecedence, runSelectionPrecedenceLaw } from '../../domain/precedence';

const fixtureReferencePattern = /^\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}$/;

function fixtureIdFromTemplateValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(fixtureReferencePattern);
  return match?.[1] ?? null;
}

function defaultFixtures(input: {
  fixtureIds: string[];
  dataRow: Record<string, string> | null;
  datasetFixtures?: Record<string, unknown> | undefined;
  generatedTokens?: Record<string, string> | undefined;
}): Record<string, unknown> {
  const fixtures: Record<string, unknown> = {};
  for (const fixtureId of input.fixtureIds) {
    switch (fixtureId) {
      case 'demoSession':
        fixtures.demoSession = { baseURL: 'http://example.test' };
        break;
      case 'activePolicy':
        fixtures.activePolicy = { number: input.dataRow?.policyNumber ?? 'POL-001' };
        break;
      default:
        fixtures[fixtureId] = {};
        break;
    }
  }
  if (input.dataRow) {
    fixtures.dataRow = input.dataRow;
  }
  if (input.datasetFixtures) {
    Object.assign(fixtures, input.datasetFixtures);
  }
  fixtures.generatedTokens = {
    ...(fixtures.generatedTokens as Record<string, unknown> | undefined),
    ...(input.generatedTokens ?? {}),
  };
  return fixtures;
}

function taskStepsForRun(surface: ScenarioInterpretationSurface, resolutionControlName?: string | null): ScenarioInterpretationSurface['payload']['steps'] {
  if (!resolutionControlName) {
    return surface.payload.steps;
  }
  // Pre-index controls by (name, stepIndex): O(C) build, then O(1) per step
  const controlIndex = new Map<number, StepResolution>();
  for (const ctrl of surface.payload.resolutionContext.controls.resolutionControls) {
    if (ctrl.name === resolutionControlName) {
      controlIndex.set(ctrl.stepIndex, ctrl.resolution);
    }
  }
  return surface.payload.steps.map((step) => ({
    ...step,
    controlResolution: controlIndex.get(step.index) ?? step.controlResolution,
  }));
}

export function loadScenarioInterpretationSurfaceFromCatalog(
  catalog: WorkspaceCatalog,
  adoId: AdoId,
): ArtifactEnvelope<ScenarioInterpretationSurface> {
  const surface = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === adoId) ?? null;
  if (!surface) {
    throw new TesseractError('run-plan-missing-surface', `Missing scenario interpretation surface for ${adoId}`);
  }
  return surface;
}

export function prepareScenarioRunPlan(input: {
  surface: ScenarioInterpretationSurface;
  catalog: WorkspaceCatalog;
  paths: ProjectPaths;
  runbookName?: string | undefined;
  interpreterMode?: RuntimeInterpreterMode;
  providerId?: string | undefined;
  posture?: ExecutionPosture | undefined;
  executionContextPosture: ExecutionPosture;
}): ScenarioRunPlan {
  const scenarioEntry = input.catalog.scenarios.find((entry) => entry.artifact.source.ado_id === input.surface.payload.adoId) ?? null;
  const snapshotEntry = input.catalog.snapshots.find((entry) => entry.artifact.id === input.surface.payload.adoId) ?? null;
  if (!scenarioEntry || !snapshotEntry) {
    throw new TesseractError('run-plan-missing-scenario', `Missing scenario or snapshot for ${input.surface.payload.adoId}`);
  }

  const activeRunbook = findRunbook(input.catalog, {
    runbookName: input.runbookName ?? null,
    scenario: scenarioEntry.artifact,
  });
  const activeDataset = activeDatasetForRun(input.surface.payload.resolutionContext.controls, activeRunbook);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const posture = input.posture ?? input.executionContextPosture;
  const mode = chooseByPrecedence([
    { rung: 'cli-flag', value: input.interpreterMode ?? null },
    { rung: 'runbook', value: activeRunbook?.interpreterMode ?? null },
    { rung: 'repo-default', value: posture.interpreterMode ?? 'diagnostic' },
  ], runSelectionPrecedenceLaw) ?? 'diagnostic';
  const steps = taskStepsForRun(input.surface, activeRunbook?.resolutionControl ?? null);
  const fixtureIds = uniqueSorted([
    ...scenarioEntry.artifact.preconditions.map((precondition) => precondition.fixture),
    ...steps.flatMap((step) =>
        input.surface.payload.resolutionContext.screens.flatMap((screen) =>
          screen.elements
            .flatMap((element) => { const r = fixtureIdFromTemplateValue(element.defaultValueRef); return r !== null ? [r] : []; }),
      ),
    ),
  ].filter((value) => value.length > 0));
  const screenIds = uniqueSorted(
    input.surface.payload.resolutionContext.screens.flatMap((screen) => screen.screen.length > 0 ? [screen.screen] : []),
  ) as ScreenId[];

  return {
    kind: 'scenario-run-plan',
    version: 1,
    adoId: input.surface.payload.adoId,
    runId,
    surfaceFingerprint: input.surface.surfaceFingerprint,
    title: input.surface.payload.title,
    suite: input.surface.payload.suite,
    controlsFingerprint: input.surface.fingerprints.controls ?? null,
    posture,
    mode,
    steps,
    resolutionContext: input.surface.payload.resolutionContext,
    screenIds,
    fixtures: defaultFixtures({
      fixtureIds,
      dataRow: snapshotEntry.artifact.dataRows[0] ?? null,
      datasetFixtures: activeDataset?.fixtures,
      generatedTokens: activeDataset?.generatedTokens,
    }),
    controlSelection: {
      runbook: activeRunbook?.name ?? null,
      dataset: activeDataset?.name ?? null,
      resolutionControl: activeRunbook?.resolutionControl ?? null,
    },
    controlArtifactPaths: {
      runbook: activeRunbook
        ? input.catalog.runbooks.find((entry) => entry.artifact.name === activeRunbook.name)?.artifactPath ?? null
        : null,
      dataset: activeDataset
        ? input.catalog.datasets.find((entry) => entry.artifact.name === activeDataset.name)?.artifactPath ?? null
        : null,
    },
    context: {
      adoId: input.surface.payload.adoId,
      revision: scenarioEntry.artifact.source.revision,
      contentHash: scenarioEntry.artifact.source.content_hash,
    },
    translationEnabled: activeRunbook?.translationEnabled ?? true,
    translationCacheEnabled: activeRunbook?.translationCacheEnabled ?? true,
    providerId: chooseByPrecedence([
      { rung: 'cli-flag', value: input.providerId ?? null },
      { rung: 'runbook', value: activeRunbook?.providerId ?? null },
      { rung: 'repo-default', value: 'deterministic-runtime-step-agent' },
    ], runSelectionPrecedenceLaw) ?? 'deterministic-runtime-step-agent',
    recoveryPolicy: activeRunbook?.recoveryPolicy,
  };
}

export interface SelectedRunContext {
  runId: string;
  scenarioEntry: ArtifactEnvelope<Scenario>;
  snapshotEntry: ArtifactEnvelope<AdoSnapshot>;
  surfaceEntry: ArtifactEnvelope<ScenarioInterpretationSurface>;
  activeRunbook: RuntimeRunbookControl | null;
  activeDataset: RuntimeDatasetBinding | null;
  plan: ScenarioRunPlan;
}

export function selectRunContext(input: {
  adoId: AdoId;
  catalog: WorkspaceCatalog;
  paths: ProjectPaths;
  runbookName?: string | undefined;
  interpreterMode?: RuntimeInterpreterMode;
  providerId?: string | undefined;
  posture?: ExecutionPosture | undefined;
  executionContextPosture: ExecutionPosture;
}): SelectedRunContext {
  const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(input.catalog, input.adoId);
  const scenarioEntry = input.catalog.scenarios.find((entry) => entry.artifact.source.ado_id === input.adoId) ?? null;
  const snapshotEntry = input.catalog.snapshots.find((entry) => entry.artifact.id === input.adoId) ?? null;
  if (!scenarioEntry || !snapshotEntry) {
    throw new TesseractError('run-plan-missing-scenario', `Missing scenario or snapshot for ${input.adoId}`);
  }
  const activeRunbook = findRunbook(input.catalog, {
    runbookName: input.runbookName ?? null,
    scenario: scenarioEntry.artifact,
  });
  const activeDataset = activeDatasetForRun(surfaceEntry.artifact.payload.resolutionContext.controls, activeRunbook);
  const plan = prepareScenarioRunPlan({
    surface: surfaceEntry.artifact,
    catalog: input.catalog,
    paths: input.paths,
    ...(input.runbookName ? { runbookName: input.runbookName } : {}),
    ...(input.interpreterMode ? { interpreterMode: input.interpreterMode } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.posture ? { posture: input.posture } : {}),
    executionContextPosture: input.executionContextPosture,
  });
  return {
    runId: plan.runId,
    scenarioEntry,
    snapshotEntry,
    surfaceEntry,
    activeRunbook,
    activeDataset,
    plan,
  };
}
