import type { RuntimeScenarioMode } from '../ports';
import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog, ArtifactEnvelope } from '../catalog';
import type {
  AdoSnapshot,
  BoundScenario,
  ExecutionPosture,
  RuntimeDatasetBinding,
  RuntimeRunbookControl,
  Scenario,
  ScenarioTaskPacket,
  StepTask,
} from '../../domain/types';
import type { AdoId, ScreenId } from '../../domain/identity';
import { activeDatasetForRun, findRunbook } from '../controls';

const fixtureReferencePattern = /^\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}$/;

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)) as T[];
}

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

function taskStepsForRun(taskSteps: readonly StepTask[], resolutionControlName?: string | null): StepTask[] {
  return taskSteps.map((step) => ({
    ...step,
    controlResolution: resolutionControlName
      ? (step.runtimeKnowledge.controls.resolutionControls.find((entry) => entry.name === resolutionControlName && entry.stepIndex === step.index)?.resolution ?? step.controlResolution)
      : step.controlResolution,
  }));
}

export interface SelectedRunContext {
  runId: string;
  scenarioEntry: ArtifactEnvelope<Scenario>;
  boundScenarioEntry: ArtifactEnvelope<BoundScenario>;
  taskPacketEntry: ArtifactEnvelope<ScenarioTaskPacket>;
  snapshotEntry: ArtifactEnvelope<AdoSnapshot>;
  activeRunbook: RuntimeRunbookControl | null;
  activeDataset: RuntimeDatasetBinding | null;
  posture: ExecutionPosture;
  mode: RuntimeScenarioMode;
  steps: StepTask[];
  screenIds: ScreenId[];
  fixtures: Record<string, unknown>;
  context: {
    adoId: AdoId;
    revision: number;
    contentHash: string;
  };
  translationEnabled: boolean;
  translationCacheEnabled: boolean;
}

export function selectRunContext(input: {
  adoId: AdoId;
  catalog: WorkspaceCatalog;
  paths: ProjectPaths;
  runbookName?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic';
  posture?: ExecutionPosture | undefined;
  executionContextPosture: ExecutionPosture;
}): SelectedRunContext {
  const scenarioEntry = input.catalog.scenarios.find((entry) => entry.artifact.source.ado_id === input.adoId);
  const boundScenarioEntry = input.catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === input.adoId);
  const taskPacketEntry = input.catalog.taskPackets.find((entry) => entry.artifact.adoId === input.adoId);
  const snapshotEntry = input.catalog.snapshots.find((entry) => entry.artifact.id === input.adoId);

  if (!scenarioEntry || !boundScenarioEntry || !taskPacketEntry || !snapshotEntry) {
    throw new Error(`Missing scenario, bound scenario, task packet, or snapshot for ${input.adoId}`);
  }

  const activeRunbook = findRunbook(input.catalog, {
    runbookName: input.runbookName ?? null,
    scenario: scenarioEntry.artifact,
  });
  const activeDataset = activeDatasetForRun(taskPacketEntry.artifact.steps[0]?.runtimeKnowledge.controls ?? {
    datasets: [],
    resolutionControls: [],
    runbooks: [],
  }, activeRunbook);
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const posture = input.posture ?? input.executionContextPosture;
  const mode = input.interpreterMode ?? activeRunbook?.interpreterMode ?? posture.interpreterMode ?? 'diagnostic';
  const steps = taskStepsForRun(taskPacketEntry.artifact.steps, activeRunbook?.resolutionControl ?? null);
  const fixtureIds = uniqueSorted([
    ...scenarioEntry.artifact.preconditions.map((precondition) => precondition.fixture),
    ...steps.flatMap((step) =>
      step.runtimeKnowledge.screens.flatMap((screen) =>
        screen.elements
          .map((element) => fixtureIdFromTemplateValue(element.defaultValueRef))
          .filter((value): value is string => value !== null),
      ),
    ),
  ]);
  const screenIds = uniqueSorted(
    steps.flatMap((step) => step.runtimeKnowledge.screens.map((screen) => screen.screen)),
  ) as ScreenId[];

  return {
    runId,
    scenarioEntry,
    boundScenarioEntry,
    taskPacketEntry,
    snapshotEntry,
    activeRunbook,
    activeDataset,
    posture,
    mode,
    steps,
    screenIds,
    fixtures: defaultFixtures({
      fixtureIds,
      dataRow: snapshotEntry.artifact.dataRows[0] ?? null,
      datasetFixtures: activeDataset?.fixtures,
      generatedTokens: activeDataset?.generatedTokens,
    }),
    context: {
      adoId: input.adoId,
      revision: scenarioEntry.artifact.source.revision,
      contentHash: scenarioEntry.artifact.source.content_hash,
    },
    translationEnabled: activeRunbook?.translationEnabled ?? true,
    translationCacheEnabled: activeRunbook?.translationCacheEnabled ?? true,
  };
}
