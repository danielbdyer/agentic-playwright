import path from 'path';
import { Effect } from 'effect';
import { normalizeIntentText } from '../../domain/knowledge/inference';
import { TesseractError } from '../../domain/kernel/errors';
import {
  type AdoId,
} from '../../domain/kernel/identity';
import type { StepResolution } from '../../domain/intent/types';
import type { InterfaceResolutionContext } from '../../domain/knowledge/types';
import type {
  GroundedStep,
  ScenarioInterpretationSurface,
  ScenarioKnowledgeSlice,
  StepGrounding,
} from '../../domain/resolution/types';
import type { ApplicationInterfaceGraph, SelectorCanon, StateTransitionGraph } from '../../domain/target/interface-graph';
import { isBlocked, isReviewRequired } from '../../domain/governance/workflow-types';
import { controlResolutionForStep, runtimeControlsForScenario } from '../governance/controls';
import type { CompileSnapshot } from './compile-snapshot';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from '../catalog';
import { deriveGovernanceState } from '../catalog/envelope';
import { buildInterfaceResolutionContext } from './interface-resolution';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath, taskPacketPath } from '../paths';
import { FileSystem } from '../ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from '../projections/cache';
import { type ProjectionIncremental } from '../projections/runner';
import { runIncrementalStage } from '../pipeline';

export interface TaskProjectionResult {
  surface: ScenarioInterpretationSurface;
  surfacePath: string;
  incremental: ProjectionIncremental;
}

type StepTaskSeed = Omit<GroundedStep, 'grounding' | 'stepFingerprint' | 'taskFingerprint'>;
type CompileSnapshotInput = Pick<
  CompileSnapshot,
  'adoId' | 'scenario' | 'scenarioPath' | 'boundScenario' | 'boundPath' | 'hasUnbound'
>;

function taskManifestPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.tasksDir, `${adoId}.manifest.json`);
}

function stepResolution(step: CompileSnapshot['boundScenario']['steps'][number]): StepResolution | null {
  if (step.resolution) return step.resolution;
  if (step.binding.kind !== 'bound') return null;
  return {
    action: step.action,
    screen: step.screen ?? null,
    element: step.element ?? null,
    posture: step.posture ?? null,
    override: step.override ?? null,
    snapshot_template: step.snapshot_template ?? null,
    route_state: step.route_state ?? null,
  };
}

function groundedStepTask(input: { step: StepTaskSeed; resolutionContext: InterfaceResolutionContext }): StepGrounding {
  const screens = input.resolutionContext.screens;
  const normalized = normalizeIntentText(`${input.step.actionText} ${input.step.expectedText}`);
  const matchedScreens = screens.filter((screen) =>
    screen.screenAliases.some((alias) => {
      const normalizedAlias = normalizeIntentText(alias);
      return normalizedAlias.length > 0 && normalized.includes(normalizedAlias);
    }),
  );
  const preferredScreen = input.step.explicitResolution?.screen ?? input.step.controlResolution?.screen ?? null;
  const candidateScreens = preferredScreen
    ? screens.filter((screen) => screen.screen === preferredScreen)
    : matchedScreens.length > 0
      ? matchedScreens
      : screens;
  const preferredElement = input.step.explicitResolution?.element ?? input.step.controlResolution?.element ?? null;
  const candidateElements = candidateScreens.flatMap((screen) =>
    screen.elements.filter((element) => {
      if (preferredElement) return element.element === preferredElement;
      return element.aliases.some((alias) => {
        const normalizedAlias = normalizeIntentText(alias);
        return normalizedAlias.length > 0 && normalized.includes(normalizedAlias);
      });
    }),
  );
  const groundedElements = preferredElement && candidateElements.length === 0
    ? candidateScreens.flatMap((screen) => screen.elements.filter((element) => element.element === preferredElement))
    : candidateElements;
  const groundedScreens = groundedElements.length > 0
    ? candidateScreens.filter((screen) => groundedElements.some((element) => screen.elements.some((candidate) => candidate.element === element.element)))
    : candidateScreens;
  const exactAction = input.step.explicitResolution?.action
    ?? input.step.controlResolution?.action
    ?? (input.step.allowedActions.length === 1 ? input.step.allowedActions[0] : null);
  const targetRefs = [...new Set(groundedElements.flatMap((element) => element.targetRef ? [element.targetRef] : []))].sort((left, right) => left.localeCompare(right));
  const targetRefSet = new Set(targetRefs);
  const stateGraph = input.resolutionContext.stateGraph ?? null;
  const eventSignatureRefs = stateGraph
    ? stateGraph.eventSignatures
      .flatMap((event) => targetRefSet.has(event.targetRef) && (!exactAction || event.dispatch.action === exactAction)
        ? [{ ref: event.ref, score: event.aliases.some((alias) => normalized.includes(normalizeIntentText(alias))) ? 3 : 0 }]
        : [])
      .sort((left, right) => right.score - left.score || left.ref.localeCompare(right.ref))
      .map((event) => event.ref)
    : [];
  const eventSignatureRefSet = new Set(eventSignatureRefs);
  // Pre-filter matched events once instead of repeated .filter() calls
  const matchedEvents = stateGraph
    ? stateGraph.eventSignatures.filter((event) => eventSignatureRefSet.has(event.ref))
    : [];
  const expectedTransitionRefs = [...new Set(matchedEvents.flatMap((event) => event.effects.transitionRefs))].sort((left, right) => left.localeCompare(right));
  const effectAssertions = [...new Set(matchedEvents.flatMap((event) => event.effects.assertions))].sort((left, right) => left.localeCompare(right));
  const requiredStateRefs = [...new Set(matchedEvents.flatMap((event) => event.requiredStateRefs))].sort((left, right) => left.localeCompare(right));
  const forbiddenStateRefs = [...new Set(matchedEvents.flatMap((event) => event.forbiddenStateRefs))].sort((left, right) => left.localeCompare(right));
  const resultStateRefs = [...new Set(matchedEvents.flatMap((event) => event.effects.resultStateRefs))].sort((left, right) => left.localeCompare(right));
  return {
    targetRefs,
    selectorRefs: [...new Set(groundedElements.flatMap((element) => element.selectorRefs ?? []))].sort((left, right) => left.localeCompare(right)),
    fallbackSelectorRefs: [...new Set(groundedScreens.flatMap((screen) => screen.elements.flatMap((element) => element.selectorRefs ?? [])))].sort((left, right) => left.localeCompare(right)),
    routeVariantRefs: [...new Set(groundedScreens.flatMap((screen) => screen.routeVariantRefs ?? []))].sort((left, right) => left.localeCompare(right)),
    assertionAnchors: [...new Set(groundedScreens.flatMap((screen) => screen.sectionSnapshots.map((snapshot) => `snapshot-anchor:${screen.screen}:${snapshot}`)))].sort((left, right) => left.localeCompare(right)),
    effectAssertions,
    requiredStateRefs,
    forbiddenStateRefs,
    eventSignatureRefs,
    expectedTransitionRefs,
    resultStateRefs,
  };
}

function buildKnowledgeSlice(input: {
  resolutionContext: InterfaceResolutionContext;
  interfaceGraph: ApplicationInterfaceGraph;
  stateGraph: StateTransitionGraph;
  runtimeControls: ReturnType<typeof runtimeControlsForScenario>;
}): ScenarioKnowledgeSlice {
  const screenRefs = input.resolutionContext.screens.map((screen) => screen.screen).sort((left, right) => left.localeCompare(right));
  const targetRefs = [...new Set(input.resolutionContext.screens.flatMap((screen) =>
    screen.elements.flatMap((element) => [element.targetRef]),
  ))].sort((left, right) => left.localeCompare(right));
  const controlRefs = [
    ...input.runtimeControls.datasets.map((entry) => entry.artifactPath),
    ...input.runtimeControls.runbooks.map((entry) => entry.artifactPath),
    ...input.runtimeControls.resolutionControls.map((entry) => entry.artifactPath),
  ].sort((left, right) => left.localeCompare(right));

  return {
    routeRefs: input.interfaceGraph.routeRefs,
    routeVariantRefs: [...new Set(input.resolutionContext.screens.flatMap((screen) => screen.routeVariantRefs ?? []))].sort((left, right) => left.localeCompare(right)),
    screenRefs,
    targetRefs,
    stateRefs: input.stateGraph.states
      .flatMap((state) => screenRefs.includes(state.screen) ? [state.ref] : [])
      .sort((left, right) => left.localeCompare(right)),
    eventSignatureRefs: input.stateGraph.eventSignatures
      .flatMap((event) => screenRefs.includes(event.screen) ? [event.ref] : [])
      .sort((left, right) => left.localeCompare(right)),
    transitionRefs: input.stateGraph.transitions
      .flatMap((transition) => screenRefs.includes(transition.screen) ? [transition.ref] : [])
      .sort((left, right) => left.localeCompare(right)),
    evidenceRefs: input.resolutionContext.evidenceRefs,
    controlRefs,
  };
}

export function buildScenarioInterpretationSurface(input: {
  paths: ProjectPaths;
  compileSnapshot: CompileSnapshotInput;
  catalog: WorkspaceCatalog;
  interfaceGraph?: ApplicationInterfaceGraph | null | undefined;
  selectorCanon?: SelectorCanon | null | undefined;
  stateGraph?: StateTransitionGraph | null | undefined;
}): ScenarioInterpretationSurface {
  const runtimeControls = runtimeControlsForScenario(input.catalog, input.compileSnapshot.scenario);
  const interfaceGraph = input.interfaceGraph ?? null;
  const selectorCanon = input.selectorCanon ?? null;
  const stateGraph = input.stateGraph ?? null;
  if (!interfaceGraph || !selectorCanon || !stateGraph) {
    throw new TesseractError(
      'task-missing-runtime-graphs',
      `Missing interface graph, selector canon, or state graph for scenario ${input.compileSnapshot.adoId}`,
    );
  }
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
    interfaceGraph: interfaceGraph.fingerprint,
    selectorCanon: selectorCanon.fingerprint,
    stateGraph: stateGraph.fingerprint,
  });
  const controlsFingerprint = fingerprintProjectionOutput(runtimeControls);
  const resolutionContext = buildInterfaceResolutionContext({
    catalog: input.catalog,
    knowledgeFingerprint,
    runtimeControls,
    interfaceGraph,
    selectorCanon,
    stateGraph,
  });

  const steps = input.compileSnapshot.boundScenario.steps.map((step) => {
    const task: StepTaskSeed = {
      index: step.index,
      intent: step.intent,
      actionText: step.action_text,
      expectedText: step.expected_text,
      normalizedIntent: step.binding.normalizedIntent,
      allowedActions: step.resolution?.action ? [step.resolution.action] : ['navigate', 'input', 'click', 'assert-snapshot'],
      explicitResolution: stepResolution(step),
      controlResolution: controlResolutionForStep(runtimeControls, step.index),
    };
    const groundedTask = { ...task, grounding: groundedStepTask({ step: task, resolutionContext }) };
    const stepFingerprint = fingerprintProjectionOutput(groundedTask);
    return { ...groundedTask, stepFingerprint, taskFingerprint: stepFingerprint };
  });

  const governance = deriveGovernanceState({
    hasBlocked: input.compileSnapshot.boundScenario.steps.some((step) => isBlocked(step.binding)),
    hasReviewRequired: input.compileSnapshot.boundScenario.steps.some((step) => isReviewRequired(step.binding)),
  });
  const payload: ScenarioInterpretationSurface['payload'] = {
    adoId: input.compileSnapshot.adoId,
    revision: input.compileSnapshot.scenario.source.revision,
    title: input.compileSnapshot.scenario.metadata.title,
    suite: input.compileSnapshot.scenario.metadata.suite,
    knowledgeFingerprint,
    interface: {
      fingerprint: interfaceGraph.fingerprint,
      artifactPath: relativeProjectPath(input.paths, input.paths.interfaceGraphIndexPath),
    },
    selectors: {
      fingerprint: selectorCanon.fingerprint,
      artifactPath: relativeProjectPath(input.paths, input.paths.selectorCanonPath),
    },
    stateGraph: {
      fingerprint: stateGraph.fingerprint,
      artifactPath: relativeProjectPath(input.paths, input.paths.stateGraphPath),
    },
    knowledgeSlice: buildKnowledgeSlice({
      resolutionContext,
      interfaceGraph,
      stateGraph,
      runtimeControls,
    }),
    steps,
    resolutionContext,
  };

  const surface: Omit<ScenarioInterpretationSurface, 'surfaceFingerprint'> = {
    kind: 'scenario-interpretation-surface',
    version: 1,
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
      sources: [
        input.compileSnapshot.scenarioPath,
        ...runtimeControls.datasets.map((entry) => entry.artifactPath),
        ...runtimeControls.runbooks.map((entry) => entry.artifactPath),
        ...runtimeControls.resolutionControls.map((entry) => entry.artifactPath),
      ],
      parents: [input.compileSnapshot.boundPath],
      handshakes: ['preparation'],
    },
    governance,
    payload,
  };

  const surfaceFingerprint = fingerprintProjectionOutput(surface);
  return {
    ...surface,
    fingerprints: {
      ...surface.fingerprints,
      artifact: surfaceFingerprint,
      task: surfaceFingerprint,
    },
    surfaceFingerprint,
  };
}

export function buildInterpretationSurfaceProjection(options:
  | { paths: ProjectPaths; compileSnapshot: CompileSnapshot; catalog?: WorkspaceCatalog; interfaceGraph?: ApplicationInterfaceGraph | null | undefined; selectorCanon?: SelectorCanon | null | undefined; stateGraph?: StateTransitionGraph | null | undefined }
  | { paths: ProjectPaths; adoId: AdoId; catalog?: WorkspaceCatalog; interfaceGraph?: ApplicationInterfaceGraph | null | undefined; selectorCanon?: SelectorCanon | null | undefined; stateGraph?: StateTransitionGraph | null | undefined }): Effect.Effect<TaskProjectionResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'compile' }));
    const compileSnapshot: CompileSnapshotInput = 'compileSnapshot' in options
      ? options.compileSnapshot
      : (() => {
          const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
          if (!scenario || !boundScenario) {
            throw new TesseractError(
              'task-missing-compile-snapshot',
              `Missing scenario or bound scenario for ${options.adoId}`,
            );
          }
          return {
            adoId: options.adoId,
            scenario: scenario.artifact,
            scenarioPath: scenario.absolutePath,
            boundScenario: boundScenario.artifact,
            boundPath: boundScenario.absolutePath,
            hasUnbound: boundScenario.artifact.steps.some((step) => step.binding.kind === 'unbound'),
          } satisfies CompileSnapshotInput;
        })();

    const packetPath = taskPacketPath(options.paths, compileSnapshot.adoId);
    const manifestPathValue = taskManifestPath(options.paths, compileSnapshot.adoId);
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('scenario', relativeProjectPath(options.paths, compileSnapshot.scenarioPath), compileSnapshot.scenario),
      fingerprintProjectionArtifact('bound', relativeProjectPath(options.paths, compileSnapshot.boundPath), compileSnapshot.boundScenario),
      ...catalog.routeManifests.map((entry) => fingerprintProjectionArtifact('harvest-manifest', entry.artifactPath, entry.artifact)),
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
      ...(options.interfaceGraph ? [fingerprintProjectionArtifact('interface-graph', options.paths.interfaceGraphIndexPath, options.interfaceGraph)] : []),
      ...(options.selectorCanon ? [fingerprintProjectionArtifact('selector-canon', options.paths.selectorCanonPath, options.selectorCanon)] : []),
      ...(options.stateGraph ? [fingerprintProjectionArtifact('state-graph', options.paths.stateGraphPath, options.stateGraph)] : []),
    ];
    const surface = buildScenarioInterpretationSurface({
      paths: options.paths,
      compileSnapshot,
      catalog,
      interfaceGraph: options.interfaceGraph ?? catalog.interfaceGraph?.artifact ?? null,
      selectorCanon: options.selectorCanon ?? catalog.selectorCanon?.artifact ?? null,
      stateGraph: options.stateGraph ?? catalog.stateGraph?.artifact ?? null,
    });
    const outputFingerprint = fingerprintProjectionOutput(surface);

    return yield* runIncrementalStage<
      Omit<TaskProjectionResult, 'incremental'>,
      TaskProjectionResult,
      TaskProjectionResult,
      TesseractError
    >({
      name: 'task',
      manifestPath: manifestPathValue,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => Effect.gen(function* () {
        const exists = yield* fs.exists(packetPath);
        if (!exists) return { status: 'missing-output' as const };
        const raw = yield* fs.readJson(packetPath);
        return { status: 'ok' as const, outputFingerprint: fingerprintProjectionOutput(raw) };
      }),
      persist: () => Effect.gen(function* () {
        yield* fs.writeJson(packetPath, surface);
        return {
          result: { surface, surfacePath: packetPath },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, packetPath),
            relativeProjectPath(options.paths, manifestPathValue),
          ],
        };
      }),
      withCacheHit: (incremental) => ({ surface, surfacePath: packetPath, incremental }),
      withCacheMiss: (built, incremental) => ({ ...built, incremental }),
    });
  });
}
