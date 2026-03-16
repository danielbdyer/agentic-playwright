import type { ArtifactConfidenceRecord, ResolutionObservation, StepAction, GroundedStep, StepTaskElementCandidate, StepTaskScreenCandidate, TranslationReceipt } from '../../domain/types';
import { normalizedCombined, bestAliasMatch, uniqueSorted } from './shared';
import { requiresElement } from './resolve-action';
import type { RuntimeStepAgentContext } from './types';

function overlayAliases(record: ArtifactConfidenceRecord): string[] {
  return uniqueSorted([
    ...record.learnedAliases,
    record.element ?? '',
    record.screen ?? '',
    record.snapshotTemplate ?? '',
  ]);
}

function translationCandidateScreens(task: GroundedStep, context: RuntimeStepAgentContext): StepTaskScreenCandidate[] {
  const normalized = normalizedCombined(task);
  const explicitScreen = task.explicitResolution?.screen ?? task.controlResolution?.screen ?? null;
  const screens = context.resolutionContext.screens;
  if (explicitScreen) {
    const selected = screens.find((screen) => screen.screen === explicitScreen);
    return selected ? [selected] : screens.slice(0, 1);
  }

  const ranked = screens
    .map((screen) => ({
      screen,
      score: bestAliasMatch(normalized, uniqueSorted([screen.screen, ...screen.screenAliases]))?.score ?? 0,
    }))
    .sort((left, right) => right.score - left.score || left.screen.screen.localeCompare(right.screen.screen));
  const positive = ranked.filter((entry) => entry.score > 0).map((entry) => entry.screen);
  return (positive.length > 0 ? positive : ranked.map((entry) => entry.screen)).slice(0, 3);
}

function translationCandidateElements(task: GroundedStep, screen: StepTaskScreenCandidate): StepTaskElementCandidate[] {
  const normalized = normalizedCombined(task);
  const explicitElement = task.explicitResolution?.element ?? task.controlResolution?.element ?? null;
  const allowedTargetRefs = new Set(task.grounding.targetRefs);
  const elements = allowedTargetRefs.size === 0
    ? screen.elements
    : screen.elements.filter((element) => allowedTargetRefs.has(element.targetRef));
  if (explicitElement) {
    const selected = elements.find((element) => element.element === explicitElement);
    return selected ? [selected] : elements.slice(0, 1);
  }

  const ranked = elements
    .map((element) => ({
      element,
      score: bestAliasMatch(normalized, uniqueSorted([element.element, element.name ?? '', ...element.aliases]))?.score ?? 0,
    }))
    .sort((left, right) => right.score - left.score || left.element.element.localeCompare(right.element.element));
  const positive = ranked.filter((entry) => entry.score > 0).map((entry) => entry.element);
  return (positive.length > 0 ? positive : ranked.map((entry) => entry.element)).slice(0, 8);
}

export function resolveWithConfidenceOverlay(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
  action: StepAction | null,
  approvedScreen: StepTaskScreenCandidate | null,
  approvedElement: StepTaskElementCandidate | null,
  snapshotTemplate: import('../../domain/identity').SnapshotTemplateId | null,
): {
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  posture: import('../../domain/identity').PostureId | null;
  snapshotTemplate: import('../../domain/identity').SnapshotTemplateId | null;
  overlayRefs: string[];
  observation?: ResolutionObservation | undefined;
} {
  const normalized = normalizedCombined(task);
  const overlays = context.resolutionContext.confidenceOverlays;
  const overlayRefIds = new Set<string>();

  let screen = approvedScreen;
  if (!screen) {
    const matchedScreen = overlays
      .filter((record) => record.screen)
      .map((record) => ({ record, match: bestAliasMatch(normalized, overlayAliases(record)) }))
      .filter((entry) => entry.match !== null)
      .sort((left, right) => right.match!.score - left.match!.score)[0];
    if (matchedScreen?.record.screen) {
      screen = context.resolutionContext.screens.find((candidate) => candidate.screen === matchedScreen.record.screen) ?? null;
      overlayRefIds.add(matchedScreen.record.id);
    }
  }

  let element = approvedElement;
  if (screen && !element && requiresElement(action)) {
    const matchedElement = overlays
      .filter((record) => record.screen === screen?.screen && record.element)
      .map((record) => ({ record, match: bestAliasMatch(normalized, overlayAliases(record)) }))
      .filter((entry) => entry.match !== null)
      .sort((left, right) => right.match!.score - left.match!.score)[0];
    if (matchedElement?.record.element) {
      element = screen.elements.find((candidate) => candidate.element === matchedElement.record.element) ?? null;
      overlayRefIds.add(matchedElement.record.id);
    }
  }

  const postureRecord = screen && element
    ? overlays.find((record) => record.screen === screen.screen && record.element === element.element && record.posture)
    : null;
  if (postureRecord?.posture) {
    overlayRefIds.add(postureRecord.id);
  }

  const snapshotRecord = screen
    ? overlays.find((record) => record.screen === screen.screen && record.snapshotTemplate)
    : null;
  if (snapshotRecord?.snapshotTemplate) {
    overlayRefIds.add(snapshotRecord.id);
  }

  const overlayRefs = uniqueSorted([...overlayRefIds]);
  return {
    screen,
    element,
    posture: postureRecord?.posture ?? null,
    snapshotTemplate: snapshotTemplate ?? snapshotRecord?.snapshotTemplate ?? null,
    overlayRefs,
    observation: overlayRefs.length > 0
      ? {
          source: 'approved-equivalent-overlay',
          summary: 'Approved-equivalent confidence overlays supplied a deterministic target.',
          detail: {
            overlayRefs: overlayRefs.join(','),
          },
        }
      : undefined,
  };
}

export async function resolveWithTranslation(
  task: GroundedStep,
  context: RuntimeStepAgentContext,
): Promise<{
  translation: TranslationReceipt | null;
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  overlayRefs: string[];
  observation?: ResolutionObservation | undefined;
}> {
  if (!context.translate) {
    return { translation: null, screen: null, element: null, overlayRefs: [] };
  }

  const candidateScreens = translationCandidateScreens(task, context);
  const translation = await context.translate({
    version: 1,
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: context.resolutionContext.knowledgeFingerprint,
    controlsFingerprint: context.resolutionContext.confidenceFingerprint ?? null,
    normalizedIntent: task.normalizedIntent,
    actionText: task.actionText,
    expectedText: task.expectedText,
    allowedActions: task.allowedActions,
    screens: candidateScreens.map((screen) => ({
      screen: screen.screen,
      aliases: uniqueSorted([screen.screen, ...screen.screenAliases]),
      elements: translationCandidateElements(task, screen).map((element) => ({
        element: element.element,
        aliases: uniqueSorted([element.element, element.name ?? '', ...element.aliases]),
        postures: element.postures,
        snapshotTemplates: screen.sectionSnapshots,
      })),
    })),
    evidenceRefs: context.resolutionContext.evidenceRefs,
    overlayRefs: context.resolutionContext.confidenceOverlays.map((record) => record.id),
  });

  const selectedElement = translation.selected?.kind === 'element'
    ? context.resolutionContext.screens
        .find((screen) => screen.screen === translation.selected?.screen)
        ?.elements.find((element) => element.element === translation.selected?.element) ?? null
    : null;
  const selectedScreenId = translation.selected?.kind === 'element'
    ? translation.selected.screen ?? null
    : translation.selected?.kind === 'screen'
      ? translation.selected.screen ?? null
      : null;
  const selectedScreen = selectedScreenId
    ? context.resolutionContext.screens.find((screen) => screen.screen === selectedScreenId) ?? null
    : null;
  const overlayRefs = uniqueSorted(translation.candidates.flatMap((candidate) => candidate.sourceRefs));

  return {
    translation,
    screen: selectedScreen,
    element: selectedElement,
    overlayRefs,
    observation: translation.matched
      ? {
          source: 'structured-translation',
          summary: translation.rationale,
          detail: translation.selected
            ? {
                target: translation.selected.target,
                score: String(translation.selected.score),
              }
            : undefined,
        }
      : undefined,
  };
}
