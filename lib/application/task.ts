import path from 'path';
import { Effect } from 'effect';
import { knowledgePaths } from '../domain/ids';
import type { TesseractError } from '../domain/errors';
import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../domain/identity';
import type { ScenarioTaskPacket, StepResolution, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../domain/types';
import { controlResolutionForStep, runtimeControlsForScenario } from './controls';
import type { CompileSnapshot } from './compile-snapshot';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { relativeProjectPath, taskPacketPath } from './paths';
import { FileSystem } from './ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { type ProjectionIncremental } from './projections/runner';
import { runIncrementalStage } from './pipeline';

export interface TaskProjectionResult {
  taskPacket: ScenarioTaskPacket;
  taskPath: string;
  incremental: ProjectionIncremental;
}

function taskManifestPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.tasksDir, `${adoId}.manifest.json`);
}

function stepResolution(step: CompileSnapshot['boundScenario']['steps'][number]): StepResolution | null {
  if (step.resolution) {
    return step.resolution;
  }
  if (step.binding.kind !== 'bound') {
    return null;
  }
  return {
    action: step.action,
    screen: step.screen ?? null,
    element: step.element ?? null,
    posture: step.posture ?? null,
    override: step.override ?? null,
    snapshot_template: step.snapshot_template ?? null,
  };
}

function screenCandidate(catalog: WorkspaceCatalog, screenId: ScreenId): StepTaskScreenCandidate | null {
  const bundleEntry = catalog.screenBundles[screenId];
  if (!bundleEntry) {
    return null;
  }

  const sectionSnapshots = [...new Set(Object.values(bundleEntry.bundle.surfaceGraph.sections)
    .map((section) => section.snapshot)
    .filter(Boolean) as SnapshotTemplateId[])]
    .sort((left, right) => left.localeCompare(right));

  const elements = Object.entries(bundleEntry.bundle.mergedElements)
    .map(([elementId, element]) => {
      const hint = bundleEntry.hints?.artifact.elements[elementId];
      const postures = bundleEntry.postures?.artifact.postures[elementId]
        ? Object.keys(bundleEntry.postures.artifact.postures[elementId]).sort((left, right) => left.localeCompare(right)) as PostureId[]
        : [];
      const candidate: StepTaskElementCandidate = {
        element: elementId as ElementId,
        role: element.role,
        name: element.name ?? null,
        surface: element.surface,
        widget: element.widget,
        affordance: element.affordance ?? null,
        aliases: [...new Set([elementId, element.name ?? '', ...(hint?.aliases ?? [])].filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)),
        locator: element.locator ?? [],
        postures,
        defaultValueRef: hint?.defaultValueRef ?? null,
        parameter: hint?.parameter ?? null,
        snapshotAliases: hint?.snapshotAliases,
      };
      return candidate;
    })
    .sort((left, right) => left.element.localeCompare(right.element));

  return {
    screen: screenId,
    url: bundleEntry.bundle.surfaceGraph.url,
    screenAliases: [...new Set([screenId, ...(bundleEntry.hints?.artifact.screenAliases ?? [])])].sort((left, right) => left.localeCompare(right)),
    knowledgeRefs: [
      knowledgePaths.surface(screenId),
      knowledgePaths.elements(screenId),
      ...(bundleEntry.postures ? [knowledgePaths.postures(screenId)] : []),
    ],
    supplementRefs: [
      ...(bundleEntry.hints ? [knowledgePaths.hints(screenId)] : []),
    ],
    elements,
    sectionSnapshots,
  };
}

function buildTaskPacket(input: {
  compileSnapshot: CompileSnapshot;
  catalog: WorkspaceCatalog;
}): ScenarioTaskPacket {
  const runtimeControls = runtimeControlsForScenario(input.catalog, input.compileSnapshot.scenario);
  const knowledgeFingerprint = fingerprintProjectionOutput({
    screens: Object.values(input.catalog.screenBundles).map((entry) => ({
      surface: entry.surface.fingerprint,
      elements: entry.elements.fingerprint,
      hints: entry.hints?.fingerprint ?? null,
      postures: entry.postures?.fingerprint ?? null,
    })),
    patterns: input.catalog.mergedPatterns,
    evidence: input.catalog.evidenceRecords.map((entry) => entry.fingerprint),
    confidence: input.catalog.confidenceCatalog?.fingerprint ?? null,
  });
  const controlsFingerprint = fingerprintProjectionOutput(runtimeControls);
  const confidenceOverlays = (input.catalog.confidenceCatalog?.artifact.records ?? [])
    .filter((record) => record.status === 'approved-equivalent');

  const screens = Object.keys(input.catalog.screenBundles)
    .sort((left, right) => left.localeCompare(right))
    .map((screenId) => screenCandidate(input.catalog, screenId as ScreenId))
    .filter(Boolean) as StepTaskScreenCandidate[];

  const runtimeKnowledgeSession = {
    knowledgeFingerprint,
    confidenceFingerprint: input.catalog.confidenceCatalog?.fingerprint ?? null,
    sharedPatterns: input.catalog.mergedPatterns,
    screens,
    evidenceRefs: input.catalog.evidenceRecords.map((entry) => entry.artifactPath).sort((left, right) => left.localeCompare(right)),
    confidenceOverlays,
    controls: runtimeControls,
  };

  const steps = input.compileSnapshot.boundScenario.steps.map((step) => {
    const task: Omit<StepTask, 'taskFingerprint'> = {
      index: step.index,
      intent: step.intent,
      actionText: step.action_text,
      expectedText: step.expected_text,
      normalizedIntent: step.binding.normalizedIntent,
      allowedActions: step.resolution?.action ? [step.resolution.action] : ['navigate', 'input', 'click', 'assert-snapshot'],
      explicitResolution: stepResolution(step),
      controlResolution: controlResolutionForStep(runtimeControls, step.index),
      knowledgeRef: 'scenario',
    };
    return {
      ...task,
      taskFingerprint: fingerprintProjectionOutput(task),
    };
  });

  const governance = input.compileSnapshot.boundScenario.steps.some((step) => step.binding.governance === 'blocked')
    ? 'blocked'
    : input.compileSnapshot.boundScenario.steps.some((step) => step.binding.governance === 'review-required')
      ? 'review-required'
      : 'approved';
  const packet: Omit<ScenarioTaskPacket, 'taskFingerprint'> = {
    kind: 'scenario-task-packet',
    version: 2,
    stage: 'preparation',
    scope: 'scenario',
    ids: {
      adoId: input.compileSnapshot.adoId,
      suite: input.compileSnapshot.scenario.metadata.suite,
      dataset: runtimeControls.datasets.find((entry) => entry.isDefault)?.name ?? null,
      runbook: runtimeControls.runbooks.find((entry) => entry.isDefault)?.name ?? null,
      resolutionControl: runtimeControls.resolutionControls[0]?.name ?? null,
    },
    fingerprints: {
      artifact: '',
      content: input.compileSnapshot.scenario.source.content_hash,
      knowledge: knowledgeFingerprint,
      controls: controlsFingerprint,
      task: null,
      run: null,
    },
    lineage: {
      sources: [input.compileSnapshot.scenarioPath, ...runtimeControls.datasets.map((entry) => entry.artifactPath), ...runtimeControls.runbooks.map((entry) => entry.artifactPath), ...runtimeControls.resolutionControls.map((entry) => entry.artifactPath)],
      parents: [input.compileSnapshot.boundPath],
      handshakes: ['preparation'],
    },
    governance,
    payload: {
      adoId: input.compileSnapshot.adoId,
      revision: input.compileSnapshot.scenario.source.revision,
      title: input.compileSnapshot.scenario.metadata.title,
      suite: input.compileSnapshot.scenario.metadata.suite,
      knowledgeFingerprint,
      runtimeKnowledgeSession,
      steps,
    },
    adoId: input.compileSnapshot.adoId,
    revision: input.compileSnapshot.scenario.source.revision,
    title: input.compileSnapshot.scenario.metadata.title,
    suite: input.compileSnapshot.scenario.metadata.suite,
    knowledgeFingerprint,
    runtimeKnowledgeSession,
    steps,
  };

  const taskFingerprint = fingerprintProjectionOutput(packet);
  return {
    ...packet,
    fingerprints: {
      ...packet.fingerprints,
      artifact: taskFingerprint,
      task: taskFingerprint,
    },
    taskFingerprint,
  };
}

export function buildTaskPacketProjection(options:
  | { paths: ProjectPaths; compileSnapshot: CompileSnapshot; catalog?: WorkspaceCatalog }
  | { paths: ProjectPaths; adoId: AdoId; catalog?: WorkspaceCatalog }): Effect.Effect<TaskProjectionResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const compileSnapshot = 'compileSnapshot' in options
      ? options.compileSnapshot
      : (() => {
          const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          if (!scenario || !boundScenario) {
            throw new Error(`Missing scenario or bound scenario for ${options.adoId}`);
          }
          return {
            adoId: options.adoId,
            scenario: scenario.artifact,
            scenarioPath: scenario.absolutePath,
            boundScenario: boundScenario.artifact,
            boundPath: boundScenario.absolutePath,
            taskPacket: {} as ScenarioTaskPacket,
            taskPath: '',
            hasUnbound: boundScenario.artifact.steps.some((step) => step.binding.kind === 'unbound'),
          } satisfies CompileSnapshot;
        })();

    const packetPath = taskPacketPath(options.paths, compileSnapshot.adoId);
    const manifestPath = taskManifestPath(options.paths, compileSnapshot.adoId);
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('scenario', relativeProjectPath(options.paths, compileSnapshot.scenarioPath), compileSnapshot.scenario),
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, compileSnapshot.boundPath), compileSnapshot.boundScenario),
      ...catalog.surfaces.map((entry) => fingerprintProjectionArtifact('surface', entry.artifactPath, entry.artifact)),
      ...catalog.screenElements.map((entry) => fingerprintProjectionArtifact('elements', entry.artifactPath, entry.artifact)),
      ...catalog.screenHints.map((entry) => fingerprintProjectionArtifact('hints', entry.artifactPath, entry.artifact)),
      ...catalog.screenPostures.map((entry) => fingerprintProjectionArtifact('postures', entry.artifactPath, entry.artifact)),
      ...catalog.patternDocuments.map((entry) => fingerprintProjectionArtifact('patterns', entry.artifactPath, entry.artifact)),
      ...catalog.datasets.map((entry) => fingerprintProjectionArtifact('dataset-control', entry.artifactPath, entry.artifact)),
      ...catalog.resolutionControls.map((entry) => fingerprintProjectionArtifact('resolution-control', entry.artifactPath, entry.artifact)),
      ...catalog.runbooks.map((entry) => fingerprintProjectionArtifact('runbook-control', entry.artifactPath, entry.artifact)),
      ...catalog.evidenceRecords.map((entry) => fingerprintProjectionArtifact('evidence', entry.artifactPath, entry.artifact)),
      ...(catalog.confidenceCatalog ? [fingerprintProjectionArtifact('confidence-overlay-catalog', catalog.confidenceCatalog.artifactPath, catalog.confidenceCatalog.artifact)] : []),
    ];
    const packet = buildTaskPacket({ compileSnapshot, catalog });
    const outputFingerprint = fingerprintProjectionOutput(packet);

    return yield* runIncrementalStage<
      Omit<TaskProjectionResult, 'incremental'>,
      TaskProjectionResult,
      TaskProjectionResult,
      TesseractError
    >({
      name: 'task',
      manifestPath,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => Effect.gen(function* () {
        const exists = yield* fs.exists(packetPath);
        if (!exists) {
          return { status: 'missing-output' as const };
        }
        const raw = yield* fs.readJson(packetPath);
        return {
          status: 'ok' as const,
          outputFingerprint: fingerprintProjectionOutput(raw),
        };
      }),
      persist: () => Effect.gen(function* () {
        yield* fs.writeJson(packetPath, packet);
        return {
          result: {
            taskPacket: packet,
            taskPath: packetPath,
          },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, packetPath),
            relativeProjectPath(options.paths, manifestPath),
          ],
        };
      }),
      withCacheHit: (incremental) => ({
        taskPacket: packet,
        taskPath: packetPath,
        incremental,
      }),
      withCacheMiss: (built, incremental) => ({
        ...built,
        incremental,
      }),
    });
  });
}
