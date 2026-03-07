import { normalizeHtmlText } from './hash';
import { createElementId, createPostureId, createScreenId, createSnapshotTemplateId } from './identity';
import { knowledgePaths } from './ids';
import type { AdoSnapshot, Confidence, ScenarioStep, ScreenElements, ScreenHints, ScreenPostures, SharedPatterns, SurfaceGraph } from './types';

export interface InferenceKnowledge {
  surfaceGraphs: Record<string, SurfaceGraph>;
  screenElements: Record<string, ScreenElements>;
  screenHints: Record<string, ScreenHints>;
  screenPostures: Record<string, ScreenPostures>;
  sharedPatterns: SharedPatterns;
}

export interface StepInferenceResult {
  step: ScenarioStep;
  ruleId: string | null;
  normalizedIntent: string;
  knowledgeRefs: string[];
  supplementRefs: string[];
  reviewReasons: string[];
}

interface StepInferenceContext {
  previousScreen: string | null;
  dataRow: Record<string, string> | null;
}

interface AliasMatch {
  score: number;
  alias: string;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

export function normalizeIntentText(value: string): string {
  return normalizeHtmlText(value).toLowerCase();
}

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bestAliasMatch(normalizedText: string, aliases: string[]): AliasMatch | null {
  let best: AliasMatch | null = null;

  for (const alias of uniqueSorted(aliases.map((entry) => normalizeIntentText(entry)))) {
    if (!alias || !normalizedText.includes(alias)) {
      continue;
    }

    const candidate: AliasMatch = { alias, score: alias.length };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

function patternAliases(patterns: SharedPatterns, key: keyof SharedPatterns['actions']): string[] {
  return patterns.actions[key]?.aliases ?? [];
}

function resolveAction(normalizedAction: string, patterns: SharedPatterns): { action: ScenarioStep['action']; ruleId: string | null } {
  if (bestAliasMatch(normalizedAction, patternAliases(patterns, 'navigate'))) {
    return { action: 'navigate', ruleId: patterns.actions.navigate.id };
  }
  if (bestAliasMatch(normalizedAction, patternAliases(patterns, 'input'))) {
    return { action: 'input', ruleId: patterns.actions.input.id };
  }
  if (bestAliasMatch(normalizedAction, patternAliases(patterns, 'click'))) {
    return { action: 'click', ruleId: patterns.actions.click.id };
  }
  if (bestAliasMatch(normalizedAction, patternAliases(patterns, 'assert-snapshot'))) {
    return { action: 'assert-snapshot', ruleId: patterns.actions['assert-snapshot'].id };
  }
  return { action: 'custom', ruleId: null };
}

function screenAliases(screenId: string, hints: ScreenHints | undefined): string[] {
  return uniqueSorted([
    screenId,
    humanizeIdentifier(screenId),
    ...(hints?.screenAliases ?? []),
  ]);
}

function elementAliases(elementId: string, elements: ScreenElements, hints: ScreenHints | undefined): string[] {
  const element = elements.elements[elementId];
  const hint = hints?.elements[elementId];
  return uniqueSorted([
    elementId,
    humanizeIdentifier(elementId),
    element?.name ?? '',
    ...(hint?.aliases ?? []),
  ]);
}

function resolveScreen(normalizedCombined: string, action: ScenarioStep['action'], knowledge: InferenceKnowledge, previousScreen: string | null): { screen: string | null; usedHint: boolean } {
  let best: { screen: string; score: number; usedHint: boolean } | null = null;

  for (const screenId of Object.keys(knowledge.surfaceGraphs)) {
    const hints = knowledge.screenHints[screenId];
    const match = bestAliasMatch(normalizedCombined, screenAliases(screenId, hints));
    if (!match) {
      continue;
    }

    const usedHint = Boolean(hints && bestAliasMatch(normalizedCombined, hints.screenAliases));
    const candidate = { screen: screenId, score: match.score, usedHint };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (best) {
    return { screen: best.screen, usedHint: best.usedHint };
  }

  if (action !== 'navigate' && previousScreen) {
    return { screen: previousScreen, usedHint: false };
  }

  return { screen: null, usedHint: false };
}

function resolveElement(normalizedCombined: string, screen: string | null, knowledge: InferenceKnowledge): { element: string | null; usedHint: boolean } {
  if (!screen) {
    return { element: null, usedHint: false };
  }

  const elements = knowledge.screenElements[screen];
  const hints = knowledge.screenHints[screen];
  if (!elements) {
    return { element: null, usedHint: false };
  }

  let best: { element: string; score: number; usedHint: boolean } | null = null;
  for (const elementId of Object.keys(elements.elements)) {
    const aliases = elementAliases(elementId, elements, hints);
    const match = bestAliasMatch(normalizedCombined, aliases);
    if (!match) {
      continue;
    }

    const usedHint = Boolean(hints?.elements[elementId] && bestAliasMatch(normalizedCombined, hints.elements[elementId].aliases));
    const candidate = { element: elementId, score: match.score, usedHint };
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return { element: best?.element ?? null, usedHint: best?.usedHint ?? false };
}

function resolvePosture(normalizedCombined: string, screen: string | null, element: string | null, knowledge: InferenceKnowledge): string | null {
  for (const [postureId, descriptor] of Object.entries(knowledge.sharedPatterns.postures)) {
    if (bestAliasMatch(normalizedCombined, descriptor.aliases)) {
      return postureId;
    }
  }

  if (!screen || !element) {
    return null;
  }

  const postures = knowledge.screenPostures[screen]?.postures[element];
  if (postures?.valid) {
    return 'valid';
  }

  return null;
}

function resolveOverride(
  screen: string | null,
  element: string | null,
  posture: string | null,
  context: StepInferenceContext,
  knowledge: InferenceKnowledge,
): { override: string | null; usedHint: boolean } {
  if (!screen || !element) {
    return { override: null, usedHint: false };
  }

  if (posture === 'empty') {
    return { override: '', usedHint: false };
  }

  const hint = knowledge.screenHints[screen]?.elements[element];
  if (hint?.defaultValueRef) {
    return { override: hint.defaultValueRef, usedHint: true };
  }

  const parameterValue = hint?.parameter ? context.dataRow?.[hint.parameter] : undefined;
  if (parameterValue !== undefined) {
    return { override: parameterValue, usedHint: true };
  }

  return { override: null, usedHint: false };
}

function resolveSnapshotTemplate(normalizedCombined: string, screen: string | null, element: string | null, knowledge: InferenceKnowledge): { snapshotTemplate: string | null; usedHint: boolean } {
  if (!screen || !element) {
    return { snapshotTemplate: null, usedHint: false };
  }

  const hint = knowledge.screenHints[screen]?.elements[element];
  if (hint?.snapshotAliases) {
    let best: { snapshotTemplate: string; score: number } | null = null;
    for (const [snapshotTemplate, aliases] of Object.entries(hint.snapshotAliases)) {
      const match = bestAliasMatch(normalizedCombined, aliases);
      if (!match) {
        continue;
      }
      const candidate = { snapshotTemplate, score: match.score };
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
    if (best) {
      return { snapshotTemplate: best.snapshotTemplate, usedHint: true };
    }
  }

  const surfaceGraph = knowledge.surfaceGraphs[screen];
  const elements = knowledge.screenElements[screen];
  const surfaceId = element && elements?.elements[element]?.surface;
  const surface = surfaceId ? surfaceGraph?.surfaces[surfaceId] : undefined;
  const section = surface && surfaceGraph ? surfaceGraph.sections[surface.section] : undefined;
  return { snapshotTemplate: section?.snapshot ?? null, usedHint: false };
}

function confidenceForStep(step: ScenarioStep): Confidence {
  if (step.action === 'custom') {
    return 'unbound';
  }

  const requiresElement = step.action === 'input' || step.action === 'click' || step.action === 'assert-snapshot';
  const missingScreen = !step.screen;
  const missingElement = requiresElement && !step.element;
  const missingSnapshot = step.action === 'assert-snapshot' && !step.snapshot_template;

  return missingScreen || missingElement || missingSnapshot ? 'unbound' : 'compiler-derived';
}

function knowledgeRefsForStep(step: ScenarioStep): string[] {
  const refs: string[] = [];
  if (step.screen) {
    refs.push(knowledgePaths.surface(step.screen));
  }
  if (step.screen && step.element) {
    refs.push(knowledgePaths.elements(step.screen));
  }
  if (step.screen && step.action === 'input' && step.posture) {
    refs.push(knowledgePaths.postures(step.screen));
  }
  if (step.snapshot_template) {
    refs.push(`knowledge/${step.snapshot_template}`);
  }
  return uniqueSorted(refs);
}

export function inferScenarioSteps(snapshot: AdoSnapshot, knowledge: InferenceKnowledge): StepInferenceResult[] {
  const results: StepInferenceResult[] = [];
  let previousScreen: string | null = null;
  const dataRow = snapshot.dataRows[0] ?? null;

  for (const rawStep of snapshot.steps) {
    const normalizedAction = normalizeIntentText(rawStep.action);
    const normalizedExpected = normalizeIntentText(rawStep.expected);
    const normalizedCombined = uniqueSorted([normalizedAction, normalizedExpected]).join(' => ');
    const normalizedSearch = `${normalizedAction} ${normalizedExpected}`.trim();
    const actionResult = resolveAction(normalizedAction, knowledge.sharedPatterns);
    const reviewReasons: string[] = [];
    const supplementRefs = [knowledgePaths.patterns()];
    const screenResult = resolveScreen(normalizedSearch, actionResult.action, knowledge, previousScreen);
    if (screenResult.usedHint && screenResult.screen) {
      supplementRefs.push(knowledgePaths.hints(createScreenId(screenResult.screen)));
    }
    const elementResult = resolveElement(normalizedSearch, screenResult.screen, knowledge);
    if (elementResult.usedHint && screenResult.screen) {
      supplementRefs.push(knowledgePaths.hints(createScreenId(screenResult.screen)));
    }

    const posture = actionResult.action === 'input'
      ? resolvePosture(normalizedSearch, screenResult.screen, elementResult.element, knowledge)
      : null;
    const overrideResult = actionResult.action === 'input'
      ? resolveOverride(screenResult.screen, elementResult.element, posture, { previousScreen, dataRow }, knowledge)
      : { override: null, usedHint: false };
    if (overrideResult.usedHint && screenResult.screen) {
      supplementRefs.push(knowledgePaths.hints(createScreenId(screenResult.screen)));
    }
    const snapshotResult = actionResult.action === 'assert-snapshot'
      ? resolveSnapshotTemplate(normalizedSearch, screenResult.screen, elementResult.element, knowledge)
      : { snapshotTemplate: null, usedHint: false };
    if (snapshotResult.usedHint && screenResult.screen) {
      supplementRefs.push(knowledgePaths.hints(createScreenId(screenResult.screen)));
    }

    if (actionResult.action === 'custom') {
      reviewReasons.push('unsupported-action');
    }
    if (!screenResult.screen) {
      reviewReasons.push('missing-screen');
    }
    if ((actionResult.action === 'input' || actionResult.action === 'click' || actionResult.action === 'assert-snapshot') && !elementResult.element) {
      reviewReasons.push('missing-element');
    }
    if (actionResult.action === 'assert-snapshot' && !snapshotResult.snapshotTemplate) {
      reviewReasons.push('missing-snapshot-template');
    }

    const step: ScenarioStep = {
      index: rawStep.index,
      intent: normalizeHtmlText(rawStep.action),
      action: actionResult.action,
      screen: screenResult.screen ? createScreenId(screenResult.screen) : null,
      element: elementResult.element ? createElementId(elementResult.element) : null,
      posture: posture ? createPostureId(posture) : null,
      override: overrideResult.override,
      snapshot_template: snapshotResult.snapshotTemplate ? createSnapshotTemplateId(snapshotResult.snapshotTemplate) : null,
      confidence: 'unbound',
    };

    step.confidence = confidenceForStep(step);

    if (step.screen) {
      previousScreen = step.screen;
    }

    results.push({
      step,
      ruleId: actionResult.ruleId,
      normalizedIntent: normalizedCombined,
      knowledgeRefs: knowledgeRefsForStep(step),
      supplementRefs: uniqueSorted(supplementRefs),
      reviewReasons: uniqueSorted(reviewReasons),
    });
  }

  return results;
}






