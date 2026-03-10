import { knowledgePaths } from '../../domain/ids';
import type { ResolutionProposalDraft, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';

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
