import type { ResolutionObservation, StepAction, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate, TranslationReceipt } from '../../domain/types';
import { normalizedCombined, bestAliasMatch, uniqueSorted } from './shared';
import { requiresElement } from './resolve-action';
import type { RuntimeStepAgentContext } from './types';


function overlayAliases(record: StepTask['runtimeKnowledge']['confidenceOverlays'][number]): string[] {
  return uniqueSorted([
    ...record.learnedAliases,
    record.element ?? '',
    record.screen ?? '',
    record.snapshotTemplate ?? '',
  ]);
}

export function resolveWithConfidenceOverlay(
  task: StepTask,
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
  const overlays = task.runtimeKnowledge.confidenceOverlays;
  const overlayRefIds = new Set<string>();

  let screen = approvedScreen;
  if (!screen) {
    const matchedScreen = overlays
      .filter((record) => record.screen)
      .map((record) => ({ record, match: bestAliasMatch(normalized, overlayAliases(record)) }))
      .filter((entry) => entry.match !== null)
      .sort((left, right) => right.match!.score - left.match!.score)[0];
    if (matchedScreen?.record.screen) {
      screen = task.runtimeKnowledge.screens.find((candidate) => candidate.screen === matchedScreen.record.screen) ?? null;
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
          source: 'overlay',
          summary: 'Approved-equivalent confidence overlays supplied a deterministic target.',
          detail: {
            overlayRefs: overlayRefs.join(','),
          },
        }
      : undefined,
  };
}

export async function resolveWithTranslation(
  task: StepTask,
  translator: RuntimeStepAgentContext['translate'],
): Promise<{
  translation: TranslationReceipt | null;
  screen: StepTaskScreenCandidate | null;
  element: StepTaskElementCandidate | null;
  overlayRefs: string[];
  observation?: ResolutionObservation | undefined;
}> {
  if (!translator) {
    return { translation: null, screen: null, element: null, overlayRefs: [] };
  }

  const translation = await translator({
    version: 1,
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
    controlsFingerprint: task.runtimeKnowledge.confidenceFingerprint ?? null,
    normalizedIntent: task.normalizedIntent,
    actionText: task.actionText,
    expectedText: task.expectedText,
    allowedActions: task.allowedActions,
    screens: task.runtimeKnowledge.screens.map((screen) => ({
      screen: screen.screen,
      aliases: uniqueSorted([screen.screen, ...screen.screenAliases]),
      elements: screen.elements.map((element) => ({
        element: element.element,
        aliases: uniqueSorted([element.element, element.name ?? '', ...element.aliases]),
        postures: element.postures,
        snapshotTemplates: screen.sectionSnapshots,
      })),
    })),
    evidenceRefs: task.runtimeKnowledge.evidenceRefs,
    overlayRefs: task.runtimeKnowledge.confidenceOverlays.map((record) => record.id),
  });

  const selectedElement = translation.selected?.kind === 'element'
    ? task.runtimeKnowledge.screens
        .find((screen) => screen.screen === translation.selected?.screen)
        ?.elements.find((element) => element.element === translation.selected?.element) ?? null
    : null;
  const selectedScreenId = translation.selected?.kind === 'element'
    ? translation.selected.screen ?? null
    : translation.selected?.kind === 'screen'
      ? translation.selected.screen ?? null
      : null;
  const selectedScreen = selectedScreenId
    ? task.runtimeKnowledge.screens.find((screen) => screen.screen === selectedScreenId) ?? null
    : null;
  const overlayRefs = uniqueSorted(translation.candidates.flatMap((candidate) => candidate.sourceRefs));

  return {
    translation,
    screen: selectedScreen,
    element: selectedElement,
    overlayRefs,
    observation: translation.matched
      ? {
          source: 'translation',
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
