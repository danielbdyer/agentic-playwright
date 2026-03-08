import { Effect } from 'effect';
import YAML from 'yaml';
import { bindScenarioStep } from '../domain/binding';
import { createDiagnostic } from '../domain/diagnostics';
import { TesseractError } from '../domain/errors';
import { inferScenarioSteps as inferSnapshotScenario } from '../domain/inference';
import type { AdoId } from '../domain/identity';
import { compileStepProgram } from '../domain/program';
import type { BoundScenario, CompilerDiagnostic } from '../domain/types';
import { validateAdoSnapshot, validateBoundScenario, validateScenario } from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import {
  availableSnapshotTemplates,
  createScreenKnowledgeCache,
  listKnowledgeSnapshotArtifacts,
  loadInferenceKnowledge,
  loadScreenKnowledgeBundle,
} from './knowledge';
import type { ProjectPaths } from './paths';
import { boundPath, relativeProjectPath, snapshotPath } from './paths';
import { FileSystem } from './ports';

function findScenarioPath(paths: ProjectPaths, adoId: AdoId) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const matches = (yield* walkFiles(fs, paths.scenariosDir)).filter((filePath) => filePath.endsWith(`${adoId}.scenario.yaml`));
    if (matches.length === 0) {
      return yield* Effect.fail(new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${adoId}`));
    }

    const [scenarioPath] = matches;
    if (!scenarioPath) {
      return yield* Effect.fail(new TesseractError('scenario-not-found', `Unable to find scenario for ADO ${adoId}`));
    }

    return scenarioPath;
  });
}

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

export function bindScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const scenarioFile = yield* findScenarioPath(options.paths, options.adoId);
    const scenarioText = yield* fs.readText(scenarioFile);
    const scenario = yield* trySync(
      () => validateScenario(YAML.parse(scenarioText)),
      'scenario-validation-failed',
      `Scenario ${options.adoId} failed validation`,
    );
    const rawSnapshot = yield* fs.readJson(snapshotPath(options.paths, options.adoId));
    const snapshot = yield* trySync(
      () => validateAdoSnapshot(rawSnapshot),
      'snapshot-validation-failed',
      `Snapshot ${options.adoId} failed validation`,
    );
    const inferenceKnowledge = yield* loadInferenceKnowledge({ paths: options.paths });
    const inferredByIndex = new Map(
      inferSnapshotScenario(snapshot, inferenceKnowledge).map((entry) => [entry.step.index, entry] as const),
    );
    const screenKnowledgeCache = createScreenKnowledgeCache();
    const snapshotTemplates = availableSnapshotTemplates(yield* listKnowledgeSnapshotArtifacts({ paths: options.paths }));
    const diagnostics: CompilerDiagnostic[] = [];
    const boundSteps: BoundScenario['steps'] = [];

    for (const step of scenario.steps) {
      const inferred = inferredByIndex.get(step.index) ?? null;
      const screenKnowledge = step.screen
        ? yield* loadScreenKnowledgeBundle({ paths: options.paths, screen: step.screen, cache: screenKnowledgeCache })
        : null;
      const boundStep = bindScenarioStep(
        {
          ...step,
          program: compileStepProgram(step),
        },
        {
          inferred,
          screenElements: screenKnowledge?.elements?.artifact,
          screenPostures: screenKnowledge?.postures?.artifact,
          surfaceGraph: screenKnowledge?.surfaceGraph?.artifact,
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
