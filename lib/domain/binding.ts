import { deriveCapabilities, findCapability } from './grammar';
import { normalizeIntentText } from './inference';
import type { SnapshotTemplateId } from './identity';
import { capabilityForInstruction, compileStepProgram, type StepProgram } from './program';
import type { PostureContractIssueCode } from './posture-contract';
import { validatePostureContract } from './posture-contract';
import type { BoundStep, Governance, ScenarioStep, ScreenElements, ScreenPostures, SurfaceGraph } from './types';

export type StepBindingReason =
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

  return reasons;
}

function hasExplicitResolution(step: ScenarioStep): boolean {
  const resolution = step.resolution;
  return Boolean(
    resolution
    && (resolution.action || resolution.screen || resolution.element || resolution.posture || resolution.override || resolution.snapshot_template),
  );
}

function normalizedIntentForStep(step: ScenarioStep): string {
  return uniqueSorted([normalizeIntentText(step.action_text), normalizeIntentText(step.expected_text)]).join(' => ');
}

function governanceForBinding(kind: BoundStep['binding']['kind'], step: ScenarioStep): Governance {
  if (kind === 'unbound') {
    return 'blocked';
  }
  if (step.confidence === 'agent-proposed' || step.confidence === 'agent-verified') {
    return 'review-required';
  }
  return 'approved';
}

export function bindScenarioStep(
  step: ScenarioStep & { program?: StepProgram | undefined },
  context: StepBindingContext,
): BoundStep {
  const reasons: StepBindingReason[] = [];
  const explicit = hasExplicitResolution(step);
  const referencedScreen = step.screen;

  if (!explicit) {
    return {
      ...step,
      binding: {
        kind: 'deferred',
        reasons: [],
        ruleId: null,
        normalizedIntent: normalizedIntentForStep(step),
        knowledgeRefs: [],
        supplementRefs: [],
        evidenceIds: [],
        governance: governanceForBinding('deferred', step),
        reviewReasons: [],
      },
    };
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
  const bindingKind = uniqueReasons.length > 0 ? 'unbound' : 'bound';
  const confidence = uniqueReasons.length > 0
    ? 'unbound'
    : (step.confidence === 'intent-only' ? 'human' : step.confidence);
  const reviewReasons = uniqueSorted([
    ...uniqueReasons,
    ...(step.confidence === 'agent-proposed' || step.confidence === 'agent-verified' ? [step.confidence] : []),
  ]);

  return {
    ...step,
    confidence,
    binding: {
      kind: bindingKind,
      reasons: uniqueReasons,
      ruleId: null,
      normalizedIntent: normalizedIntentForStep(step),
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance: governanceForBinding(bindingKind, step),
      reviewReasons,
    },
  };
}
