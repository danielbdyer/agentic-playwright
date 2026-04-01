import { Effect } from 'effect';
import { bindScenarioStep } from '../domain/governance/binding';
import { createDiagnostic } from '../domain/governance/diagnostics';
import { TesseractError } from '../domain/kernel/errors';
import type { AdoId } from '../domain/kernel/identity';
import { compileStepProgram } from '../domain/execution/program';
import type { BoundScenario, CompilerDiagnostic } from '../domain/types';
import { validateBoundScenario } from '../domain/validation';
import { isBlocked, isReviewRequired } from '../domain/types/shared-context';
import { loadWorkspaceCatalog } from './catalog';
import { deriveGovernanceState } from './catalog/envelope';
import { trySync } from './effect';
import type { ProjectPaths } from './paths';
import { boundPath, relativeProjectPath } from './paths';
import { FileSystem } from './ports';
import type { WorkspaceSession } from './workspace-session';

function createStepDiagnostics(options: {
  reasons: readonly string[];
  adoId: AdoId;
  stepIndex: number;
  artifactPath: string;
  contentHash: string;
  revision: number;
  confidence: BoundScenario['steps'][number]['confidence'];
}): CompilerDiagnostic[] {
  return options.reasons.map((reason) =>
    createDiagnostic({
      code: reason,
      severity: 'error',
      message: `Step ${options.stepIndex} is ${reason.replace(/-/g, ' ')}`,
      adoId: options.adoId,
      stepIndex: options.stepIndex,
      artifactPath: options.artifactPath,
      provenance: {
        contentHash: options.contentHash,
        confidence: options.confidence,
        scenarioPath: options.artifactPath,
        sourceRevision: options.revision,
      },
    }),
  );
}

export function bindScenario(options: { adoId: AdoId; paths: ProjectPaths; session?: WorkspaceSession }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.session?.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const scenarioArtifact = yield* Effect.succeed(
      catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId),
    ).pipe(Effect.filterOrFail(
      (entry): entry is NonNullable<typeof entry> => entry != null,
      () => new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${options.adoId}`),
    ));
    const snapshotArtifact = yield* Effect.succeed(
      catalog.snapshots.find((entry) => entry.artifact.id === options.adoId),
    ).pipe(Effect.filterOrFail(
      (entry): entry is NonNullable<typeof entry> => entry != null,
      () => new TesseractError('snapshot-not-found', `Unable to find snapshot for ADO ${options.adoId}`),
    ));

    const scenarioFile = scenarioArtifact.absolutePath;
    const scenario = scenarioArtifact.artifact;
    const _snapshot = snapshotArtifact.artifact;
    const screenElementsByScreen = options.session?.screenIndexes.screenElements
      ?? new Map(catalog.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const screenPosturesByScreen = options.session?.screenIndexes.screenPostures
      ?? new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const surfaceGraphsByScreen = options.session?.screenIndexes.surfaceGraphs
      ?? new Map(catalog.surfaces.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const snapshotTemplates = new Set(catalog.knowledgeSnapshots.map((entry) => entry.relativePath));
    const stepsWithDiagnostics = scenario.steps.map((step) => {
      const boundStep = bindScenarioStep(
        {
          ...step,
          program: step.resolution ? compileStepProgram(step) : undefined,
        },
        {
          screenElements: step.screen ? screenElementsByScreen.get(step.screen) : undefined,
          screenPostures: step.screen ? screenPosturesByScreen.get(step.screen) : undefined,
          surfaceGraph: step.screen ? surfaceGraphsByScreen.get(step.screen) : undefined,
          availableSnapshotTemplates: snapshotTemplates,
        },
      );
      const stepDiagnostics = createStepDiagnostics({
        reasons: boundStep.binding.reasons,
        adoId: scenario.source.ado_id,
        stepIndex: step.index,
        artifactPath: relativeProjectPath(options.paths, scenarioFile),
        contentHash: scenario.source.content_hash,
        revision: scenario.source.revision,
        confidence: step.confidence,
      });
      return { boundStep, stepDiagnostics };
    });
    const boundSteps: BoundScenario['steps'] = stepsWithDiagnostics.map(({ boundStep }) => boundStep);
    const diagnostics: CompilerDiagnostic[] = stepsWithDiagnostics.flatMap(({ stepDiagnostics }) => stepDiagnostics);

    const boundScenario: BoundScenario = {
      ...scenario,
      kind: 'bound-scenario',
      version: 1,
      stage: 'preparation',
      scope: 'scenario',
      ids: {
        adoId: scenario.source.ado_id,
        suite: scenario.metadata.suite,
        runId: null,
        stepIndex: null,
        dataset: null,
        runbook: null,
        resolutionControl: null,
      },
      fingerprints: {
        artifact: scenario.source.content_hash,
        content: scenario.source.content_hash,
        knowledge: null,
        controls: null,
        task: null,
        run: null,
      },
      lineage: {
        sources: [relativeProjectPath(options.paths, scenarioFile)],
        parents: [relativeProjectPath(options.paths, snapshotArtifact.absolutePath)],
        handshakes: ['preparation'],
      },
      governance: deriveGovernanceState({
        hasBlocked: boundSteps.some((step) => isBlocked(step.binding)),
        hasReviewRequired: boundSteps.some((step) => isReviewRequired(step.binding)),
      }),
      payload: {
        source: scenario.source,
        metadata: scenario.metadata,
        preconditions: scenario.preconditions,
        steps: boundSteps,
        postconditions: scenario.postconditions,
        diagnostics,
      },
      diagnostics,
      steps: boundSteps,
    };

    const outputPath = boundPath(options.paths, options.adoId);
    yield* fs.writeJson(outputPath, boundScenario);

    return {
      boundScenario: yield* trySync(
        () => validateBoundScenario(boundScenario),
        'bound-scenario-validation-failed',
        `Bound scenario ${options.adoId} failed validation`,
      ),
      boundPath: outputPath,
      hasUnbound: boundSteps.some((step) => step.binding.kind === 'unbound'),
    };
  }).pipe(Effect.withSpan('bind-scenario', { attributes: { adoId: options.adoId } }));
}
