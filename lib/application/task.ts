import path from 'path';
import { Effect } from 'effect';
import { knowledgePaths } from '../domain/ids';
import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../domain/identity';
import type { ScenarioTaskPacket, StepResolution, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../domain/types';
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
import { runProjection, type ProjectionIncremental } from './projections/runner';

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
  const knowledgeFingerprint = fingerprintProjectionOutput({
    screens: Object.values(input.catalog.screenBundles).map((entry) => ({
      surface: entry.surface.fingerprint,
      elements: entry.elements.fingerprint,
      hints: entry.hints?.fingerprint ?? null,
      postures: entry.postures?.fingerprint ?? null,
    })),
    patterns: input.catalog.mergedPatterns,
    evidence: input.catalog.evidenceRecords.map((entry) => entry.fingerprint),
  });

  const screens = Object.keys(input.catalog.screenBundles)
    .sort((left, right) => left.localeCompare(right))
    .map((screenId) => screenCandidate(input.catalog, screenId as ScreenId))
    .filter(Boolean) as StepTaskScreenCandidate[];

  const runtimeKnowledge = {
    knowledgeFingerprint,
    sharedPatterns: input.catalog.mergedPatterns,
    screens,
    evidenceRefs: input.catalog.evidenceRecords.map((entry) => entry.artifactPath).sort((left, right) => left.localeCompare(right)),
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
      runtimeKnowledge,
    };
    return {
      ...task,
      taskFingerprint: fingerprintProjectionOutput(task),
    };
  });

  const packet: Omit<ScenarioTaskPacket, 'taskFingerprint'> = {
    kind: 'scenario-task-packet',
    adoId: input.compileSnapshot.adoId,
    revision: input.compileSnapshot.scenario.source.revision,
    title: input.compileSnapshot.scenario.metadata.title,
    suite: input.compileSnapshot.scenario.metadata.suite,
    knowledgeFingerprint,
    steps,
  };

  return {
    ...packet,
    taskFingerprint: fingerprintProjectionOutput(packet),
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
      ...catalog.evidenceRecords.map((entry) => fingerprintProjectionArtifact('evidence', entry.artifactPath, entry.artifact)),
    ];
    const packet = buildTaskPacket({ compileSnapshot, catalog });
    const outputFingerprint = fingerprintProjectionOutput(packet);

    return yield* runProjection<
      { taskPacket: ScenarioTaskPacket; taskPath: string },
      TaskProjectionResult
    >({
      projection: 'task',
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
      buildAndWrite: () => Effect.gen(function* () {
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
