import { readFileSync } from 'fs';
import path from 'path';
import type { AdoId } from '../domain/identity';
import type { ExecutionPosture, ScenarioRuntimeHandoff } from '../domain/types';
import type { WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { selectRunContext } from './execution/select-run-context';
import { fingerprintProjectionOutput } from './projections/cache';

const DEFAULT_RUNTIME_HANDOFF_POSTURE: ExecutionPosture = {
  interpreterMode: 'diagnostic',
  writeMode: 'persist',
  executionProfile: 'interactive',
  headed: false,
};

export function buildScenarioRuntimeHandoff(input: {
  adoId: AdoId;
  paths: ProjectPaths;
  catalog: WorkspaceCatalog;
  posture?: ExecutionPosture | undefined;
}): ScenarioRuntimeHandoff {
  const posture = input.posture ?? DEFAULT_RUNTIME_HANDOFF_POSTURE;
  const selectedContext = selectRunContext({
    adoId: input.adoId,
    catalog: input.catalog,
    paths: input.paths,
    posture,
    executionContextPosture: posture,
    interpreterMode: posture.interpreterMode === 'dry-run' ? 'dry-run' : 'diagnostic',
  });
  const payload: ScenarioRuntimeHandoff['payload'] = {
    adoId: input.adoId,
    revision: selectedContext.context.revision,
    title: selectedContext.scenarioEntry.artifact.metadata.title,
    suite: selectedContext.scenarioEntry.artifact.metadata.suite,
    screenIds: selectedContext.screenIds,
    steps: selectedContext.steps.map((task) => ({ task, directive: null })),
    resolutionContext: selectedContext.resolutionContext,
    fixtures: selectedContext.fixtures,
    controlSelection: {
      runbook: selectedContext.activeRunbook?.name ?? null,
      dataset: selectedContext.activeDataset?.name ?? null,
      resolutionControl: selectedContext.activeRunbook?.resolutionControl ?? null,
    },
    context: selectedContext.context,
    posture: selectedContext.posture,
    providerId: selectedContext.providerId,
    translationEnabled: selectedContext.translationEnabled,
    translationCacheEnabled: selectedContext.translationCacheEnabled,
    recoveryPolicy: selectedContext.recoveryPolicy,
  };
  const draft: ScenarioRuntimeHandoff = {
    kind: 'scenario-runtime-handoff',
    version: 1,
    stage: 'preparation',
    scope: 'scenario',
    ids: {
      adoId: input.adoId,
      suite: selectedContext.scenarioEntry.artifact.metadata.suite,
      runId: null,
      dataset: selectedContext.activeDataset?.name ?? null,
      runbook: selectedContext.activeRunbook?.name ?? null,
      resolutionControl: selectedContext.activeRunbook?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: '',
      content: selectedContext.context.contentHash,
      knowledge: selectedContext.taskPacketEntry.artifact.payload.knowledgeFingerprint,
      controls: selectedContext.taskPacketEntry.artifact.fingerprints.controls,
      task: selectedContext.taskPacketEntry.artifact.taskFingerprint,
      run: null,
    },
    lineage: {
      sources: [
        selectedContext.taskPacketEntry.artifactPath,
        ...(selectedContext.activeRunbook ? [selectedContext.activeRunbook.artifactPath] : []),
        ...(selectedContext.activeDataset ? [selectedContext.activeDataset.artifactPath] : []),
      ],
      parents: [selectedContext.taskPacketEntry.artifact.taskFingerprint],
      handshakes: ['preparation'],
    },
    governance: selectedContext.taskPacketEntry.artifact.governance,
    payload,
    adoId: payload.adoId,
    revision: payload.revision,
    title: payload.title,
    suite: payload.suite,
    screenIds: payload.screenIds,
    steps: payload.steps,
    resolutionContext: payload.resolutionContext,
    fixtures: payload.fixtures,
    controlSelection: payload.controlSelection,
    context: payload.context,
    posture: payload.posture,
    providerId: payload.providerId,
    translationEnabled: payload.translationEnabled,
    translationCacheEnabled: payload.translationCacheEnabled,
    recoveryPolicy: payload.recoveryPolicy,
  };
  const artifactFingerprint = fingerprintProjectionOutput({
    ids: draft.ids,
    lineage: draft.lineage,
    payload: draft.payload,
  });
  return {
    ...draft,
    fingerprints: {
      ...draft.fingerprints,
      artifact: artifactFingerprint,
    },
  };
}

export function loadScenarioRuntimeHandoff(input: {
  rootDir: string;
  adoId: AdoId | string;
}): ScenarioRuntimeHandoff {
  const filePath = path.join(input.rootDir, '.tesseract', 'tasks', `${input.adoId}.runtime.json`);
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as ScenarioRuntimeHandoff;
}
