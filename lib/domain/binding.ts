import { deriveCapabilities, findCapability } from './grammar';
import { normalizeIntentText } from './knowledge/inference';
import type { ScreenId, SnapshotTemplateId } from './identity';
import { knowledgePaths } from './ids';
import { capabilityForInstruction, compileStepProgram, type StepProgram } from './program';
import type { PostureContractIssueCode } from './posture-contract';
import { validatePostureContract } from './posture-contract';
import type { BoundStep, Governance, ScenarioStep, ScreenElements, ScreenPostures, SurfaceGraph } from './types';
import { uniqueSorted } from './collections';

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
  const program = step.program ?? compileStepProgram(step);
  const capabilities = deriveCapabilities(surfaceGraph, screenElements);

  return program.instructions.flatMap((instruction): StepBindingReason[] => {
    if (instruction.kind === 'custom-escape-hatch') {
      return ['unsupported-capability'];
    }
    const targetKind = instruction.kind === 'navigate' ? 'screen' as const : 'element' as const;
    const target = instruction.kind === 'navigate' ? instruction.screen : instruction.element;
    const capability = findCapability(capabilities, targetKind, target);
    return !capability || !capability.operations.includes(capabilityForInstruction(instruction))
      ? ['unsupported-capability']
      : [];
  });
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

function knowledgeRefsForScreen(screen: ScreenId | null | undefined, context: StepBindingContext): readonly string[] {
  if (!screen) return [];
  return uniqueSorted([
    ...(context.surfaceGraph ? [knowledgePaths.surface(screen)] : []),
    ...(context.screenElements ? [knowledgePaths.elements(screen)] : []),
  ]);
}

function supplementRefsForScreen(screen: ScreenId | null | undefined): readonly string[] {
  if (!screen) return [];
  return uniqueSorted([knowledgePaths.hints(screen)]);
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
        knowledgeRefs: knowledgeRefsForScreen(referencedScreen, context),
        supplementRefs: supplementRefsForScreen(referencedScreen),
        evidenceIds: [],
        governance: governanceForBinding('deferred', step),
        reviewReasons: [],
      },
    };
  }

  const screenReasons: StepBindingReason[] = !referencedScreen
    ? ['missing-screen']
    : [
        ...(!context.screenElements ? ['unknown-screen' as const] : []),
        ...(!context.surfaceGraph ? ['missing-surface-graph' as const] : []),
      ];

  const elementReasons: StepBindingReason[] = [
    ...((step.action === 'input' || step.action === 'click' || step.action === 'assert-snapshot') && !step.element
      ? ['missing-element' as const] : []),
    ...(step.element && context.screenElements && !context.screenElements.elements[step.element]
      ? ['unknown-element' as const] : []),
    ...(step.element && context.screenElements && context.surfaceGraph
      && context.screenElements.elements[step.element]
      && !context.surfaceGraph.surfaces[context.screenElements.elements[step.element]!.surface]
      ? ['unknown-surface' as const] : []),
  ];

  const postureReasons: StepBindingReason[] = step.action === 'input' && step.posture && step.element
    ? (!context.screenPostures || !context.surfaceGraph || !context.screenElements
        ? ['unknown-posture']
        : validatePostureContract({
            elementId: step.element,
            postureId: step.posture,
            postures: context.screenPostures,
            elements: context.screenElements,
            surfaceGraph: context.surfaceGraph,
          }).map((issue) => contractIssueToReason(issue.code)))
    : [];

  const snapshotReasons: StepBindingReason[] = step.action === 'assert-snapshot'
    ? (!step.snapshot_template
        ? ['missing-snapshot-template']
        : !(context.availableSnapshotTemplates?.has(step.snapshot_template) ?? false)
          ? ['missing-snapshot-template']
          : [])
    : [];

  const capReasons = context.surfaceGraph && context.screenElements
    ? capabilityReasons(step, context.screenElements, context.surfaceGraph)
    : [];

  const reasons: StepBindingReason[] = [
    ...screenReasons,
    ...elementReasons,
    ...postureReasons,
    ...snapshotReasons,
    ...capReasons,
  ];

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
      knowledgeRefs: knowledgeRefsForScreen(referencedScreen, context),
      supplementRefs: supplementRefsForScreen(referencedScreen),
      evidenceIds: [],
      governance: governanceForBinding(bindingKind, step),
      reviewReasons,
    },
  };
}
