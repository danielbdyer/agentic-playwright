import { Effect } from 'effect';
import { bindScenarioStep } from '../domain/binding';
import { createDiagnostic } from '../domain/diagnostics';
import { TesseractError } from '../domain/errors';
import type { AdoId } from '../domain/identity';
import { compileStepProgram } from '../domain/program';
import type { BoundScenario, CompilerDiagnostic } from '../domain/types';
import { validateBoundScenario } from '../domain/validation';
import { loadWorkspaceCatalog } from './catalog';
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
    const scenarioArtifact = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
    if (!scenarioArtifact) {
      return yield* Effect.fail(new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${options.adoId}`));
    }
    const snapshotArtifact = catalog.snapshots.find((entry) => entry.artifact.id === options.adoId);
    if (!snapshotArtifact) {
      return yield* Effect.fail(new TesseractError('snapshot-not-found', `Unable to find snapshot for ADO ${options.adoId}`));
    }

    const scenarioFile = scenarioArtifact.absolutePath;
    const scenario = scenarioArtifact.artifact;
    const snapshot = snapshotArtifact.artifact;
    const screenElementsByScreen = options.session?.screenIndexes.screenElements
      ?? new Map(catalog.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const screenPosturesByScreen = options.session?.screenIndexes.screenPostures
      ?? new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const surfaceGraphsByScreen = options.session?.screenIndexes.surfaceGraphs
      ?? new Map(catalog.surfaces.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const snapshotTemplates = new Set(catalog.knowledgeSnapshots.map((entry) => entry.relativePath));
    const diagnostics: CompilerDiagnostic[] = [];
    const boundSteps: BoundScenario['steps'] = [];

    for (const step of scenario.steps) {
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
      diagnostics.push(...createStepDiagnostics({
        reasons: boundStep.binding.reasons,
        adoId: scenario.source.ado_id,
        stepIndex: step.index,
        artifactPath: relativeProjectPath(options.paths, scenarioFile),
        contentHash: scenario.source.content_hash,
        revision: scenario.source.revision,
        confidence: step.confidence,
      }));
      boundSteps.push(boundStep);
    }

    const boundScenario: BoundScenario = {
      ...scenario,
      kind: 'bound-scenario',
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
  });
}
