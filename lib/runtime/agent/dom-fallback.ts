import type { Page } from '@playwright/test';
import { widgetCapabilityContracts } from '../../domain/widgets/contracts';
import type { ResolutionObservation, StepAction, StepTask, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../domain/types';
import { resolveLocator } from '../locate';

function widgetActionForStepAction(action: StepAction | null): 'fill' | 'click' | 'get-value' | null {
  switch (action) {
    case 'input':
      return 'fill';
    case 'click':
      return 'click';
    case 'assert-snapshot':
      return 'get-value';
    default:
      return null;
  }
}

function isElementCompatible(action: StepAction | null, element: StepTaskElementCandidate): boolean {
  const widgetAction = widgetActionForStepAction(action);
  if (!widgetAction) {
    return true;
  }
  const contract = widgetCapabilityContracts[element.widget];
  if (!contract) {
    return action === 'click' ? element.role === 'button' : action === 'assert-snapshot';
  }
  return contract.supportedActions.includes(widgetAction);
}

export async function resolveFromDom(
  page: Page | undefined,
  task: StepTask,
  screen: StepTaskScreenCandidate | null,
  action: StepAction | null,
): Promise<{ element: StepTaskElementCandidate | null; observation?: ResolutionObservation | undefined }> {
  if (!page || !screen || !action) {
    return { element: null };
  }

  const visible: StepTaskElementCandidate[] = [];
  for (const candidate of screen.elements.filter((element) => isElementCompatible(action, element))) {
    const resolved = await resolveLocator(page, {
      role: candidate.role,
      name: candidate.name ?? null,
      testId: null,
      cssFallback: null,
      locator: candidate.locator,
      surface: candidate.surface,
      widget: candidate.widget,
      affordance: candidate.affordance ?? null,
    });
    const count = await resolved.locator.count().catch(() => 0);
    if (count > 0) {
      visible.push(candidate);
    }
  }

  if (visible.length === 1) {
    return {
      element: visible[0] ?? null,
      observation: {
        source: 'dom',
        summary: 'Resolved uniquely visible candidate from live DOM',
        detail: {
          element: visible[0]?.element ?? '',
        },
      },
    };
  }

  return { element: null };
}
