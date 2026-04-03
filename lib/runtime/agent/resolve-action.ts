import { normalizeIntentText, decomposeIntent } from '../../domain/knowledge/inference';
import { knowledgePaths } from '../../domain/kernel/ids';
import type { InterfaceResolutionContext, StepAction, StepResolution, GroundedStep } from '../../domain/types';
import { bestAliasMatch } from './shared';

/** Map from canonical action verbs (from role-affordances) to step actions. */
const VERB_TO_STEP_ACTION: Readonly<Record<string, StepAction>> = {
  click: 'click',
  fill: 'input',
  clear: 'input',
  check: 'click',
  uncheck: 'click',
  select: 'input',
  'get-value': 'assert-snapshot',
};

export function allowedActionFallback(task: GroundedStep): StepAction | null {
  const normalized = normalizeIntentText(task.actionText);

  // E1: Try intent decomposition first — canonicalized verb is more reliable
  // than prefix matching (e.g. "hit the return" → verb="click" via synonym)
  const decomposed = decomposeIntent(normalized);
  if (decomposed.verb) {
    const mapped = VERB_TO_STEP_ACTION[decomposed.verb];
    if (mapped && (task.allowedActions.length === 0 || task.allowedActions.includes(mapped))) {
      return mapped;
    }
  }

  // Legacy prefix fallback
  if (normalized.startsWith('navigate') || normalized.startsWith('load') || normalized.startsWith('open') || normalized.startsWith('go to')) {
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

export function resolveAction(task: GroundedStep, controlResolution: StepResolution | null, resolutionContext?: Pick<InterfaceResolutionContext, 'sharedPatterns'>): { action: StepAction | null; supplementRefs: string[] } {
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
