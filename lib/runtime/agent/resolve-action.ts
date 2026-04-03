import { normalizeIntentText } from '../../domain/knowledge/inference';
import { knowledgePaths } from '../../domain/kernel/ids';
import type { InterfaceResolutionContext, StepAction, StepResolution, GroundedStep } from '../../domain/types';
import { bestAliasMatch } from './shared';

// ─── Deterministic verb→action classification ───
//
// This is structural action classification, not synonym comprehension.
// The verb prefix deterministically maps to an action type, the same way
// ARIA roles map to affordances. Comprehension of WHICH element is meant
// stays with the LLM; classification of WHAT action type stays here.

const CLICK_PREFIXES = ['click', 'press', 'tap', 'hit', 'activate', 'trigger', 'select', 'use'] as const;
const INPUT_PREFIXES = ['enter', 'type', 'input', 'key in', 'fill in', 'fill', 'provide', 'supply', 'put in', 'put'] as const;
const NAVIGATE_PREFIXES = ['navigate', 'load', 'open', 'go to', 'go', 'visit', 'access', 'pull up', 'bring up', 'browse to', 'switch to'] as const;
const ASSERT_PREFIXES = ['verify', 'assert', 'confirm', 'check', 'ensure', 'validate', 'see that', 'make sure', 'observe'] as const;

function matchesPrefix(normalized: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (!normalized.startsWith(prefix)) return false;
    // Ensure the prefix is a whole word (followed by space, end, or non-alpha)
    const nextChar = normalized[prefix.length];
    return !nextChar || nextChar === ' ' || !/[a-z]/.test(nextChar);
  });
}

export function allowedActionFallback(task: GroundedStep): StepAction | null {
  const normalized = normalizeIntentText(task.actionText);
  if (matchesPrefix(normalized, NAVIGATE_PREFIXES)) return 'navigate';
  if (matchesPrefix(normalized, INPUT_PREFIXES)) return 'input';
  if (matchesPrefix(normalized, CLICK_PREFIXES)) return 'click';
  if (matchesPrefix(normalized, ASSERT_PREFIXES)) return 'assert-snapshot';
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
