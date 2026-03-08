import { Effect } from 'effect';
import { createDiagnostic } from '../domain/diagnostics';
import { inferSnapshotScenario, loadInferenceKnowledge } from './inference';
import { deriveCapabilities, findCapability } from '../domain/grammar';
import { normalizeIntentText } from '../domain/inference';
import type { AdoId } from '../domain/identity';
import { capabilityForInstruction, compileStepProgram, traceStepProgram } from '../domain/program';
import type { PostureContractIssueCode} from '../domain/posture-contract';
import { validatePostureContract } from '../domain/posture-contract';
import type { BoundScenario, CompilerDiagnostic, ScreenElements, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateBoundScenario } from '../domain/validation';
import { loadWorkspaceCatalog } from './catalog';
import { FileSystem } from './ports';
import type {
  ProjectPaths} from './paths';
import {
  boundPath,
  knowledgeArtifactPath,
  relativeProjectPath,
} from './paths';
import { trySync } from './effect';
import { TesseractError } from '../domain/errors';
import type { WorkspaceSession } from './workspace-session';

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
    const inferenceKnowledge = options.session?.inferenceKnowledge ?? (yield* loadInferenceKnowledge({ paths: options.paths, catalog }));
    const inferredByIndex = new Map(inferSnapshotScenario(snapshot, inferenceKnowledge).map((entry) => [entry.step.index, entry]));
    const elementsByScreen = options.session?.screenIndexes.screenElements
      ?? new Map(catalog.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const posturesByScreen = options.session?.screenIndexes.screenPostures
      ?? new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact] as const));
    const surfacesByScreen = options.session?.screenIndexes.surfaceGraphs
      ?? new Map(catalog.surfaces.map((entry) => [entry.artifact.screen, entry.artifact] as const));
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
        screenElements = elementsByScreen.get(referencedScreen);
        screenPostures = posturesByScreen.get(referencedScreen);
        surfaceGraph = surfacesByScreen.get(referencedScreen);

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


