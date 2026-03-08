import { deriveCapabilities, findCapability } from './grammar';
import { normalizeIntentText, type StepInferenceResult } from './inference';
import type { SnapshotTemplateId } from './identity';
import { capabilityForInstruction, compileStepProgram, type StepProgram } from './program';
import type { PostureContractIssueCode } from './posture-contract';
import { validatePostureContract } from './posture-contract';
import type { BoundStep, ScenarioStep, ScreenElements, ScreenPostures, SurfaceGraph } from './types';

export type StepBindingReason =
  | 'unsupported-action'
  | 'missing-screen'
  | 'unknown-screen'
  | 'missing-surface-graph'
  | 'missing-element'
  | 'unknown-element'
  | 'unknown-surface'
  | 'unknown-posture'
  | 'missing-posture-values'
  | 'unknown-effect-target'
  | 'ambiguous-effect-target'
  | 'missing-snapshot-template'
  | 'unsupported-capability';

export type StepReviewReason = StepBindingReason | 'agent-proposed' | 'agent-verified';

export interface StepBindingContext {
  inferred?: StepInferenceResult | null | undefined;
  screenElements?: ScreenElements | undefined;
  screenPostures?: ScreenPostures | undefined;
  surfaceGraph?: SurfaceGraph | undefined;
  availableSnapshotTemplates?: ReadonlySet<SnapshotTemplateId> | undefined;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

function contractIssueToReason(code: PostureContractIssueCode): Extract<StepBindingReason, PostureContractIssueCode> {
  switch (code) {
    case 'unknown-posture':
    case 'missing-posture-values':
    case 'unknown-effect-target':
    case 'ambiguous-effect-target':
      return code;
  }
}

function capabilityReasons(
  step: ScenarioStep & { program?: StepProgram | undefined },
  screenElements: ScreenElements,
  surfaceGraph: SurfaceGraph,
): StepBindingReason[] {
  const reasons: StepBindingReason[] = [];
  const program = step.program ?? compileStepProgram(step);
  const capabilities = deriveCapabilities(surfaceGraph, screenElements);

  for (const instruction of program.instructions) {
    if (instruction.kind === 'custom-escape-hatch') {
      reasons.push(step.action === 'custom' ? 'unsupported-action' : 'unsupported-capability');
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

  return reasons;
}

export function bindScenarioStep(
  step: ScenarioStep & { program?: StepProgram | undefined },
  context: StepBindingContext,
): BoundStep {
  const reasons: StepBindingReason[] = [];
  const referencedScreen = step.screen;

  if (step.action === 'custom') {
    reasons.push('unsupported-action');
  }

  if (!referencedScreen) {
    reasons.push('missing-screen');
  } else {
    if (!context.screenElements) {
      reasons.push('unknown-screen');
    }
    if (!context.surfaceGraph) {
      reasons.push('missing-surface-graph');
    }
  }

  if ((step.action === 'input' || step.action === 'click' || step.action === 'assert-snapshot') && !step.element) {
    reasons.push('missing-element');
  }

  if (step.element && context.screenElements && !context.screenElements.elements[step.element]) {
    reasons.push('unknown-element');
  }

  if (step.element && context.screenElements && context.surfaceGraph) {
    const element = context.screenElements.elements[step.element];
    if (element && !context.surfaceGraph.surfaces[element.surface]) {
      reasons.push('unknown-surface');
    }
  }

  if (step.action === 'input' && step.posture && step.element) {
    if (!context.screenPostures || !context.surfaceGraph || !context.screenElements) {
      reasons.push('unknown-posture');
    } else {
      const postureIssues = validatePostureContract({
        elementId: step.element,
        postureId: step.posture,
        postures: context.screenPostures,
        elements: context.screenElements,
        surfaceGraph: context.surfaceGraph,
      });
      reasons.push(...postureIssues.map((issue) => contractIssueToReason(issue.code)));
    }
  }

  if (step.action === 'assert-snapshot') {
    if (!step.snapshot_template) {
      reasons.push('missing-snapshot-template');
    } else {
      const hasSnapshotTemplate = context.availableSnapshotTemplates?.has(step.snapshot_template) ?? false;
      if (!hasSnapshotTemplate) {
        reasons.push('missing-snapshot-template');
      }
    }
  }

  if (context.surfaceGraph && context.screenElements) {
    reasons.push(...capabilityReasons(step, context.screenElements, context.surfaceGraph));
  }

  const uniqueReasons = uniqueSorted(reasons);
  const needsReview =
    uniqueReasons.length > 0
    || step.confidence === 'agent-proposed'
    || step.confidence === 'agent-verified';
  const reviewReasons = uniqueSorted([
    ...((context.inferred?.reviewReasons ?? []) as StepReviewReason[]),
    ...uniqueReasons,
    ...(step.confidence === 'agent-proposed' || step.confidence === 'agent-verified' ? [step.confidence] : []),
  ]);
  const confidence = uniqueReasons.length > 0 ? 'unbound' : step.confidence;

  return {
    ...step,
    confidence,
    binding: {
      kind: uniqueReasons.length > 0 ? 'unbound' : 'bound',
      reasons: uniqueReasons,
      ruleId: context.inferred?.ruleId ?? null,
      normalizedIntent: context.inferred?.normalizedIntent ?? normalizeIntentText(step.intent),
      knowledgeRefs: context.inferred?.knowledgeRefs ?? [],
      supplementRefs: context.inferred?.supplementRefs ?? [],
      evidenceIds: [],
      governance: needsReview ? 'review-required' : 'approved',
      reviewReasons,
    },
  };
}
