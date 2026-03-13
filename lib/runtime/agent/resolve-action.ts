import { normalizeIntentText } from '../../domain/inference';
import { knowledgePaths } from '../../domain/ids';
import type { InterfaceResolutionContext, StepAction, StepResolution, StepTask } from '../../domain/types';
import { bestAliasMatch } from './shared';

export function allowedActionFallback(task: StepTask): StepAction | null {
  const normalized = normalizeIntentText(task.actionText);
  if (normalized.startsWith('navigate')) {
    return 'navigate';
  }
  if (normalized.startsWith('enter')) {
    return 'input';
  }
  if (normalized.startsWith('click')) {
    return 'click';
  }
  if (normalized.startsWith('verify') || normalized.startsWith('assert')) {
    return 'assert-snapshot';
  }
  return task.allowedActions.length === 1 ? task.allowedActions[0] ?? null : null;
}

export function resolveAction(task: StepTask, controlResolution: StepResolution | null, resolutionContext?: Pick<InterfaceResolutionContext, 'sharedPatterns'>): { action: StepAction | null; supplementRefs: string[] } {
  if (task.explicitResolution?.action) {
    return { action: task.explicitResolution.action, supplementRefs: [] };
  }
  if (controlResolution?.action) {
    return { action: controlResolution.action, supplementRefs: [] };
  }

  const normalized = normalizeIntentText(task.actionText);
  for (const action of task.allowedActions) {
    if (action === 'custom') {
      continue;
    }
    const aliases = resolutionContext?.sharedPatterns.actions[action]?.aliases ?? [];
    if (bestAliasMatch(normalized, aliases)) {
      return {
        action,
        supplementRefs: [knowledgePaths.patterns()],
      };
    }
  }

  return { action: allowedActionFallback(task), supplementRefs: [] };
}

export function requiresElement(action: StepAction | null): boolean {
  return action === 'input' || action === 'click' || action === 'assert-snapshot';
}
