import { Effect } from 'effect';
import YAML from 'yaml';
import { createDiagnostic } from '../domain/diagnostics';
import { inferSnapshotScenario, loadInferenceKnowledge } from './inference';
import { deriveCapabilities, findCapability } from '../domain/grammar';
import { normalizeIntentText } from '../domain/inference';
import type { AdoId, ScreenId } from '../domain/identity';
import { capabilityForInstruction, compileStepProgram, traceStepProgram } from '../domain/program';
import type { PostureContractIssueCode} from '../domain/posture-contract';
import { validatePostureContract } from '../domain/posture-contract';
import type { BoundScenario, CompilerDiagnostic, ScreenElements, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateAdoSnapshot, validateBoundScenario, validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { FileSystem } from './ports';
import { walkFiles } from './artifacts';
import type {
  ProjectPaths} from './paths';
import {
  boundPath,
  elementsPath,
  knowledgeArtifactPath,
  posturesPath,
  relativeProjectPath,
  snapshotPath,
  surfacePath,
} from './paths';
import { trySync } from './effect';
import { TesseractError } from '../domain/errors';

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function contractIssueToReason(code: PostureContractIssueCode): PostureContractIssueCode {
  switch (code) {
    case 'unknown-posture':
    case 'missing-posture-values':
    case 'unknown-effect-target':
    case 'ambiguous-effect-target':
      return code;
  }
}

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

function loadScreenElements(paths: ProjectPaths, screen: ScreenId, cache: Map<ScreenId, ScreenElements>) {
  return Effect.gen(function* () {
    const cached = cache.get(screen);
    if (cached) {
      return cached;
    }

    const fs = yield* FileSystem;
    const target = elementsPath(paths, screen);
    const exists = yield* fs.exists(target);
    if (!exists) {
      return undefined;
    }

    const raw = yield* fs.readText(target);
    const parsed = yield* trySync(
      () => validateScreenElements(YAML.parse(raw)),
      'elements-validation-failed',
      `Elements file for ${screen} failed validation`,
    );
    cache.set(screen, parsed);
    return parsed;
  });
}

function loadScreenPostures(paths: ProjectPaths, screen: ScreenId, cache: Map<ScreenId, ScreenPostures>) {
  return Effect.gen(function* () {
    const cached = cache.get(screen);
    if (cached) {
      return cached;
    }

    const fs = yield* FileSystem;
    const target = posturesPath(paths, screen);
    const exists = yield* fs.exists(target);
    if (!exists) {
      return undefined;
    }

    const raw = yield* fs.readText(target);
    const parsed = yield* trySync(
      () => validateScreenPostures(YAML.parse(raw)),
      'postures-validation-failed',
      `Postures file for ${screen} failed validation`,
    );
    cache.set(screen, parsed);
    return parsed;
  });
}

function loadSurfaceGraph(paths: ProjectPaths, screen: ScreenId, cache: Map<ScreenId, SurfaceGraph>) {
  return Effect.gen(function* () {
    const cached = cache.get(screen);
    if (cached) {
      return cached;
    }

    const fs = yield* FileSystem;
    const target = surfacePath(paths, screen);
    const exists = yield* fs.exists(target);
    if (!exists) {
      return undefined;
    }

    const raw = yield* fs.readText(target);
    const parsed = yield* trySync(
      () => validateSurfaceGraph(YAML.parse(raw)),
      'surface-validation-failed',
      `Surface graph for ${screen} failed validation`,
    );
    cache.set(screen, parsed);
    return parsed;
  });
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
    const inferredByIndex = new Map(inferSnapshotScenario(snapshot, inferenceKnowledge).map((entry) => [entry.step.index, entry]));

    const elementsCache = new Map<ScreenId, ScreenElements>();
    const posturesCache = new Map<ScreenId, ScreenPostures>();
    const surfacesCache = new Map<ScreenId, SurfaceGraph>();
    const diagnostics: CompilerDiagnostic[] = [];
    const boundSteps: BoundScenario['steps'] = [];

    for (const step of scenario.steps) {
      const reasons: string[] = [];
      const program = compileStepProgram(step);
      const trace = traceStepProgram(program);
      const referencedScreen = step.screen ?? trace.screens[0];
      const inferred = inferredByIndex.get(step.index);
      let screenElements: ScreenElements | undefined;
      let screenPostures: ScreenPostures | undefined;
      let surfaceGraph: SurfaceGraph | undefined;

      if (trace.hasEscapeHatch) {
        const escapeInstruction = program.instructions.find((instruction) => instruction.kind === 'custom-escape-hatch');
        reasons.push(escapeInstruction?.reason ?? 'unsupported-action');
      }

      if (referencedScreen) {
        screenElements = yield* loadScreenElements(options.paths, referencedScreen, elementsCache);
        screenPostures = yield* loadScreenPostures(options.paths, referencedScreen, posturesCache);
        surfaceGraph = yield* loadSurfaceGraph(options.paths, referencedScreen, surfacesCache);

        if (!screenElements) {
          reasons.push('unknown-screen');
        }
        if (!surfaceGraph) {
          reasons.push('missing-surface-graph');
        }
      }

      if ((step.action === 'input' || step.action === 'click' || step.action === 'assert-snapshot') && !step.element) {
        reasons.push('missing-element');
      }

      if (step.element && screenElements && !screenElements.elements[step.element]) {
        reasons.push('unknown-element');
      }

      if (step.element && screenElements && surfaceGraph) {
        const element = screenElements.elements[step.element];
        if (element && !surfaceGraph.surfaces[element.surface]) {
          reasons.push('unknown-surface');
        }
      }

      if (step.action === 'input' && step.posture && step.element) {
        if (!screenPostures || !surfaceGraph || !screenElements) {
          reasons.push('unknown-posture');
        } else {
          const postureIssues = validatePostureContract({
            elementId: step.element,
            postureId: step.posture,
            postures: screenPostures,
            elements: screenElements,
            surfaceGraph,
          });
          reasons.push(...postureIssues.map((issue) => contractIssueToReason(issue.code)));
        }
      }

      for (const snapshotTemplate of trace.snapshotTemplates) {
        const exists = yield* fs.exists(knowledgeArtifactPath(options.paths, snapshotTemplate));
        if (!exists) {
          reasons.push('missing-snapshot-template');
        }
      }

      if (!trace.hasEscapeHatch && surfaceGraph && screenElements) {
        const capabilities = deriveCapabilities(surfaceGraph, screenElements);
        for (const instruction of program.instructions) {
          if (instruction.kind === 'custom-escape-hatch') {
            reasons.push('unsupported-capability');
            continue;
          }

          if (instruction.kind === 'navigate') {
            const capability = findCapability(capabilities, 'screen', instruction.screen);
            if (!capability || !capability.operations.includes(capabilityForInstruction(instruction))) {
              reasons.push('unsupported-capability');
            }
            continue;
          }

          const capability = findCapability(capabilities, 'element', instruction.element);
          if (!capability || !capability.operations.includes(capabilityForInstruction(instruction))) {
            reasons.push('unsupported-capability');
          }
        }
      }

      const uniqueReasons = uniqueSorted(reasons);
      for (const reason of uniqueReasons) {
        diagnostics.push(
          createDiagnostic({
            code: reason,
            severity: 'error',
            message: `Step ${step.index} is ${reason.replace(/-/g, ' ')}`,
            adoId: scenario.source.ado_id,
            stepIndex: step.index,
            artifactPath: relativeProjectPath(options.paths, scenarioFile),
            provenance: {
              contentHash: scenario.source.content_hash,
              confidence: step.confidence,
              scenarioPath: relativeProjectPath(options.paths, scenarioFile),
              sourceRevision: scenario.source.revision,
            },
          }),
        );
      }

      const needsReview = uniqueReasons.length > 0 || step.confidence === 'agent-proposed' || step.confidence === 'agent-verified';
      const reviewReasons = uniqueSorted([
        ...(inferred?.reviewReasons ?? []),
        ...uniqueReasons,
        ...(step.confidence === 'agent-proposed' || step.confidence === 'agent-verified' ? [step.confidence] : []),
      ]);
      const confidence = uniqueReasons.length > 0 ? 'unbound' : step.confidence;

      boundSteps.push({
        ...step,
        confidence,
        program,
        binding: {
          kind: (uniqueReasons.length > 0 ? 'unbound' : 'bound') as 'unbound' | 'bound',
          reasons: uniqueReasons,
          ruleId: inferred?.ruleId ?? null,
          normalizedIntent: inferred?.normalizedIntent ?? normalizeIntentText(step.intent),
          knowledgeRefs: inferred?.knowledgeRefs ?? [],
          supplementRefs: inferred?.supplementRefs ?? [],
          evidenceIds: [],
          governance: (needsReview ? 'review-required' : 'approved') as 'review-required' | 'approved',
          reviewReasons,
        },
      });
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


