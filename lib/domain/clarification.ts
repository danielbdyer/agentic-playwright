import type { ResolutionPrecedenceRung } from './precedence';
import type {
  ClarificationContext,
  ClarificationQuestion,
  ClarificationRequest,
} from './types/resolution';

/**
 * Build a structured clarification request when the resolution pipeline
 * exhausts all rungs and is about to escalate to `needs-human`.
 *
 * Pure function — no side effects, no mutation.
 */
export function buildClarificationRequest(
  stepIndex: number,
  actionText: string,
  screenId: string | null,
  failedRungs: readonly ResolutionPrecedenceRung[],
  nearestCandidates: readonly string[],
  consoleErrors: readonly string[],
): ClarificationRequest {
  const context: ClarificationContext = {
    actionText,
    screenId,
    attemptedStrategies: failedRungs.map(String),
    nearestCandidates,
    consoleErrors,
  };

  const questions: readonly ClarificationQuestion[] = [
    ...buildNavigationQuestions(stepIndex, nearestCandidates, screenId),
    ...buildLocatorQuestions(stepIndex, nearestCandidates, actionText),
    ...buildPreconditionQuestions(stepIndex, consoleErrors),
    ...buildAffordanceQuestions(stepIndex, nearestCandidates, actionText),
  ];

  return {
    kind: 'clarification-request',
    stepIndex,
    failedRungs,
    questions,
    context,
  };
}

function buildNavigationQuestions(
  stepIndex: number,
  nearestCandidates: readonly string[],
  screenId: string | null,
): readonly ClarificationQuestion[] {
  return nearestCandidates.length === 0
    ? [
        {
          id: `clarify-${stepIndex}-navigation-0`,
          category: 'navigation',
          question: screenId === null
            ? 'Could not identify the current screen. Which screen should this step target?'
            : `No matching elements found on screen "${screenId}". Is the correct screen active?`,
          suggestedActions: [
            'Add a screen hint to knowledge/screens/',
            'Verify navigation steps preceding this action',
            ...(screenId === null ? ['Provide a screen identifier for this step'] : []),
          ],
        },
      ]
    : [];
}

function buildLocatorQuestions(
  stepIndex: number,
  nearestCandidates: readonly string[],
  actionText: string,
): readonly ClarificationQuestion[] {
  return nearestCandidates.length > 0
    ? [
        {
          id: `clarify-${stepIndex}-locator-0`,
          category: 'locator' as const,
          question: `Found ${nearestCandidates.length} candidate(s) but none matched for action "${actionText}". Which element is correct?`,
          suggestedActions: [
            ...nearestCandidates.map((c) => `Verify candidate: ${c}`),
            'Add an explicit resolution control for this step',
            'Add element aliases to the screen knowledge file',
          ],
        },
      ]
    : [];
}

function buildPreconditionQuestions(
  stepIndex: number,
  consoleErrors: readonly string[],
): readonly ClarificationQuestion[] {
  return consoleErrors.length > 0
    ? [
        {
          id: `clarify-${stepIndex}-precondition-0`,
          category: 'precondition' as const,
          question: `Console errors detected (${consoleErrors.length}). The application may be in a broken state.`,
          suggestedActions: [
            'Check application health before retrying',
            ...consoleErrors.slice(0, 3).map((e) => `Review error: ${e}`),
          ],
        },
      ]
    : [];
}

function buildAffordanceQuestions(
  stepIndex: number,
  nearestCandidates: readonly string[],
  actionText: string,
): readonly ClarificationQuestion[] {
  return nearestCandidates.length === 0
    ? [
        {
          id: `clarify-${stepIndex}-affordance-0`,
          category: 'affordance' as const,
          question: `No known affordance for "${actionText}". Is this action supported by the target widget?`,
          suggestedActions: [
            'Add a component knowledge file for the target widget',
            'Add widget affordance hints to the screen knowledge',
          ],
        },
      ]
    : [];
}
