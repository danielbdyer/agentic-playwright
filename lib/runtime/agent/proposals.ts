import { knowledgePaths } from '../../domain/ids';
import type { InterfaceResolutionContext, ResolutionProposalDraft, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';

export function proposalForSupplementGap(task: StepTask, screen: StepTaskScreenCandidate, element: StepTaskElementCandidate): ResolutionProposalDraft[] {
  return [{
    artifactType: 'hints',
    targetPath: knowledgePaths.hints(screen.screen),
    title: `Capture phrasing for step ${task.index}`,
    patch: {
      screen: screen.screen,
      element: element.element,
      alias: task.actionText,
    },
    rationale: 'Runtime resolved the step through live DOM after approved knowledge exhausted its deterministic priors.',
  }];
}

export function applyProposalDraftsToRuntimeContext(
  resolutionContext: InterfaceResolutionContext,
  proposalDrafts: readonly ResolutionProposalDraft[],
): void {
  for (const proposal of proposalDrafts) {
    if (proposal.artifactType !== 'hints') {
      continue;
    }
    const screenId = typeof proposal.patch.screen === 'string' ? proposal.patch.screen : null;
    const elementId = typeof proposal.patch.element === 'string' ? proposal.patch.element : null;
    const alias = typeof proposal.patch.alias === 'string' ? proposal.patch.alias : null;
    if (!screenId || !elementId || !alias) {
      continue;
    }

    const screen = resolutionContext.screens.find((entry) => entry.screen === screenId) ?? null;
    const element = screen?.elements.find((entry) => entry.element === elementId) ?? null;
    if (!element) {
      continue;
    }
    if (!element.aliases.includes(alias)) {
      element.aliases = [...element.aliases, alias].sort((left, right) => left.localeCompare(right));
    }
  }
}
