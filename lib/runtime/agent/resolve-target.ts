import { createPostureId, createSnapshotTemplateId } from '../../domain/identity';
import { knowledgePaths } from '../../domain/ids';
import type { ResolutionTarget, StepAction, StepResolution, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';
import { bestAliasMatch, humanizeIdentifier, normalizedCombined, uniqueSorted } from './shared';
import { selectedDataset, selectedRunbook } from './select-controls';
import type { RuntimeStepAgentContext } from './types';

export function resolveScreen(task: StepTask, action: StepAction | null, controlResolution: StepResolution | null, previousResolution: ResolutionTarget | null | undefined): { screen: StepTaskScreenCandidate | null; supplementRefs: string[] } {
  if (task.explicitResolution?.screen) {
    const explicit = task.runtimeKnowledge.screens.find((screen) => screen.screen === task.explicitResolution?.screen) ?? null;
    return { screen: explicit, supplementRefs: [] };
  }
  if (controlResolution?.screen) {
    const controlled = task.runtimeKnowledge.screens.find((screen) => screen.screen === controlResolution.screen) ?? null;
    return { screen: controlled, supplementRefs: [] };
  }

  const normalized = normalizedCombined(task);
  let best: { screen: StepTaskScreenCandidate; score: number } | null = null;
  for (const screen of task.runtimeKnowledge.screens) {
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
      supplementRefs: best.screen.supplementRefs,
    };
  }

  if (action !== 'navigate' && previousResolution?.screen) {
    const carried = task.runtimeKnowledge.screens.find((screen) => screen.screen === previousResolution.screen) ?? null;
    return { screen: carried, supplementRefs: carried?.supplementRefs ?? [] };
  }

  return { screen: null, supplementRefs: [] };
}

export function resolveElement(task: StepTask, screen: StepTaskScreenCandidate | null, controlResolution: StepResolution | null): { element: StepTaskElementCandidate | null; supplementRefs: string[] } {
  if (!screen) {
    return { element: null, supplementRefs: [] };
  }

  if (task.explicitResolution?.element) {
    const explicit = screen.elements.find((element) => element.element === task.explicitResolution?.element) ?? null;
    return { element: explicit, supplementRefs: explicit ? screen.supplementRefs : [] };
  }
  if (controlResolution?.element) {
    const controlled = screen.elements.find((element) => element.element === controlResolution.element) ?? null;
    return { element: controlled, supplementRefs: controlled ? screen.supplementRefs : [] };
  }

  const normalized = normalizedCombined(task);
  let best: { element: StepTaskElementCandidate; score: number } | null = null;
  for (const element of screen.elements) {
    const aliases = uniqueSorted([element.element, humanizeIdentifier(element.element), element.name ?? '', ...element.aliases]);
    const match = bestAliasMatch(normalized, aliases);
    if (!match) {
      continue;
    }
    if (!best || match.score > best.score) {
      best = { element, score: match.score };
    }
  }

  return {
    element: best?.element ?? null,
    supplementRefs: best ? screen.supplementRefs : [],
  };
}

export function resolvePosture(task: StepTask, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): { posture: ReturnType<typeof createPostureId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.posture) {
    return { posture: task.explicitResolution.posture, supplementRefs: [] };
  }
  if (controlResolution?.posture) {
    return { posture: controlResolution.posture, supplementRefs: [] };
  }
  const normalized = normalizedCombined(task);
  for (const [postureId, descriptor] of Object.entries(task.runtimeKnowledge.sharedPatterns.postures)) {
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
  task: StepTask,
  screen: StepTaskScreenCandidate | null,
  element: StepTaskElementCandidate | null,
  posture: ReturnType<typeof createPostureId> | null,
  controlResolution: StepResolution | null,
  context: RuntimeStepAgentContext,
): { override: string | null; source: import('../../domain/types').StepWinningSource } {
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

export function resolveSnapshot(task: StepTask, screen: StepTaskScreenCandidate | null, element: StepTaskElementCandidate | null, controlResolution: StepResolution | null): { snapshotTemplate: ReturnType<typeof createSnapshotTemplateId> | null; supplementRefs: string[] } {
  if (task.explicitResolution?.snapshot_template) {
    return { snapshotTemplate: task.explicitResolution.snapshot_template, supplementRefs: [] };
  }
  if (controlResolution?.snapshot_template) {
    return { snapshotTemplate: controlResolution.snapshot_template, supplementRefs: [] };
  }
  const normalized = normalizedCombined(task);
  for (const [snapshotTemplate, aliases] of Object.entries(element?.snapshotAliases ?? {})) {
    if (bestAliasMatch(normalized, aliases)) {
      return { snapshotTemplate: createSnapshotTemplateId(snapshotTemplate), supplementRefs: screen?.supplementRefs ?? [] };
    }
  }
  if ((screen?.sectionSnapshots.length ?? 0) === 1) {
    return { snapshotTemplate: screen?.sectionSnapshots[0] ?? null, supplementRefs: [] };
  }
  return { snapshotTemplate: null, supplementRefs: [] };
}
