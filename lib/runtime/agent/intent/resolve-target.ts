import { createPostureId } from '../../../domain/kernel/identity';
import { knowledgePaths } from '../../../domain/kernel/ids';
import type {
  GroundedStep,
  ResolutionTarget,
  StepAction,
  StepResolution,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
  StepWinningSource,
} from '../../../domain/types';
import { bestAliasMatch, humanizeIdentifier, normalizedCombined, uniqueSorted } from '../shared';
import { selectedDataset, selectedRunbook } from '../resolution/select-controls';
import type { RuntimeStepAgentContext } from '../types';

function groundedScreens(task: GroundedStep, context: RuntimeStepAgentContext): readonly StepTaskScreenCandidate[] {
  const allowedRouteVariantRefs = new Set(task.grounding.routeVariantRefs);
  if (allowedRouteVariantRefs.size === 0) {
    return context.resolutionContext.screens;
  }
  return context.resolutionContext.screens.filter((screen) => screen.routeVariantRefs.some((ref) => allowedRouteVariantRefs.has(ref)));
}

export function resolveScreen(
  task: GroundedStep,
  action: StepAction | null,
  controlResolution: StepResolution | null,
  previousResolution: ResolutionTarget | null | undefined,
  context: RuntimeStepAgentContext,
): { screen: StepTaskScreenCandidate | null; supplementRefs: readonly string[] } {
  const screens = groundedScreens(task, context);
  if (task.explicitResolution?.screen) {
    const explicit = screens.find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return { screen: explicit, supplementRefs: [] };
  }
  if (controlResolution?.screen) {
    const controlled = screens.find((screen) => screen.screen === controlResolution.screen) ?? null;
    return { screen: controlled, supplementRefs: [] };
  }

  const normalized = normalizedCombined(task);
  let best: { screen: StepTaskScreenCandidate; score: number } | null = null;
  for (const screen of screens) {
    const aliases = uniqueSorted([screen.screen, humanizeIdentifier(screen.screen), ...screen.screenAliases]);
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    if (!best || match.score > best.score) {
      best = { screen, score: match.score };
    }
  }
  if (best) {
    return {
      screen: best.screen,
      supplementRefs: [...best.screen.supplementRefs],
    };
  }

  if (action !== 'navigate' && previousResolution?.screen) {
    const carried = screens.find((screen) => screen.screen === previousResolution.screen) ?? null;
    return { screen: carried, supplementRefs: [...(carried?.supplementRefs ?? [])] };
  }

  return { screen: null, supplementRefs: [] };
}

export function resolvePosture(
  task: GroundedStep,
  element: StepTaskElementCandidate | null,
  controlResolution: StepResolution | null,
  context: RuntimeStepAgentContext,
): { posture: ReturnType<typeof createPostureId> | null; supplementRefs: readonly string[] } {
  if (task.explicitResolution?.posture) {
    return { posture: task.explicitResolution.posture, supplementRefs: [] };
  }
  if (controlResolution?.posture) {
    return { posture: controlResolution.posture, supplementRefs: [] };
  }
  const normalized = normalizedCombined(task);
  for (const [postureId, descriptor] of Object.entries(context.resolutionContext.sharedPatterns.postures)) {
    if (bestAliasMatch(normalized, descriptor.aliases)) {
      return { posture: createPostureId(postureId), supplementRefs: [knowledgePaths.patterns()] };
    }
  }
  if (element?.postures.some((posture) => posture === createPostureId('valid'))) {
    return { posture: createPostureId('valid'), supplementRefs: [] };
  }
  return { posture: null, supplementRefs: [] };
}

function datasetElementKey(screen: string, element: string): string {
  return `${screen}.${element}`;
}

function generatedTokenKey(screen: string, element: string): string {
  return `${screen}.${element}`;
}

export function resolveOverride(
  task: GroundedStep,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  posture: ReturnType<typeof createPostureId> | null,
  controlResolution: StepResolution | null,
  context: RuntimeStepAgentContext,
): { override: string | null; source: StepWinningSource } {
  if (task.explicitResolution?.override !== undefined) {
    return { override: task.explicitResolution.override ?? null, source: 'scenario-explicit' };
  }
  if (controlResolution?.override !== undefined) {
    return { override: controlResolution.override ?? null, source: 'resolution-control' };
  }
  if (!element) {
    return { override: null, source: 'none' };
  }
  if (task.explicitResolution?.posture === 'empty') {
    return { override: '', source: 'scenario-explicit' };
  }
  if (controlResolution?.posture === 'empty') {
    return { override: '', source: 'resolution-control' };
  }

  const dataset = selectedDataset(task, context);
  if (screen && dataset) {
    const datasetValue = dataset.elementDefaults[datasetElementKey(screen.screen, element.element)];
    if (datasetValue !== undefined) {
      return {
        override: datasetValue,
        source: context.controlSelection?.dataset || selectedRunbook(task, context)?.dataset ? 'runbook-dataset' : 'default-dataset',
      };
    }
  }

  if (element.defaultValueRef) {
    return { override: element.defaultValueRef, source: 'knowledge-hint' };
  }

  if (posture) {
    return { override: null, source: 'posture-sample' };
  }

  if (screen) {
    return {
      override: `<<generated:${generatedTokenKey(screen.screen, element.element)}>>`,
      source: 'generated-token',
    };
  }

  return { override: null, source: 'none' };
}

