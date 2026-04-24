/**
 * Intent classifier — Z11a.4b baseline.
 *
 * Turns raw ADO action text (from `GroundedStep.actionText`) plus
 * the parser-narrowed `allowedActions` into a `ClassifiedIntent`
 * consumable by pattern matchers. This is the lightweight regex-
 * based classifier; it's the floor, not the ceiling.
 *
 * **Upgrade path (Z11d):** the classifier becomes the consumer of
 * `Reasoning.select`. The regex heuristics become the deterministic-
 * adapter fallback for when the live-LLM adapter is unavailable.
 * The output shape (`ClassifiedIntent`) stays stable across the
 * upgrade — only the producer changes.
 *
 * **Scope**: the classifier is intentionally narrow. It recognizes
 * a small number of high-signal instruction shapes ("Click X
 * button", "Enter Y in the Z field", "Navigate to Q") and returns
 * `null` on shapes it doesn't recognize. Returning null falls the
 * pattern-resolution strategy through to the next rung — that's the
 * correct behavior when we can't classify, not a failure.
 *
 * Pure — no Effect imports.
 */

import type { StepAction } from '../../governance/workflow-types';
import type { ClassifiedIntent, PatternVerb, TargetShapeHint } from './rung-kernel';

// ─── Shape-extraction regexes ────────────────────────────────

/** "Click the Submit button", "Click Save", "Click Cancel button" */
const CLICK_BUTTON_RE = /\bclick(?:s)?\s+(?:(?:the|a|an)\s+)?([a-zA-Z][\w-]*(?:\s+[a-zA-Z][\w-]*){0,3})\s+button\b/i;
/** "Click Submit" — no "button" suffix. Lower-confidence. */
const CLICK_BARE_RE = /\bclick(?:s)?\s+(?:(?:the|a|an)\s+)?([a-zA-Z][\w-]*)\b/i;
/** "Enter X into the Y field", "Type foo in bar field", "Fill in the Name field with Alice" */
const INPUT_FIELD_RE = /\b(?:enter|type|fill\s+in|input|populate|set)\s+(?:.+?\s+)?(?:in(?:to)?|as|into|with|for)\s+(?:(?:the|a|an)\s+)?([a-zA-Z][\w-]*(?:\s+[a-zA-Z][\w-]*){0,3})\s+field\b/i;
/** "Navigate to the Login page", "Go to Dashboard" */
const NAVIGATE_RE = /\b(?:navigate\s+to|go\s+to|open)\s+(?:(?:the|a|an)\s+)?([a-zA-Z][\w-]*(?:\s+[a-zA-Z][\w-]*){0,4})\b/i;
/** "Observe X", "Verify X appears", "Check X" */
const OBSERVE_RE = /\b(?:observe|verify|check|confirm\s+that|ensure)\s+(?:.+?\s+)?(?:the\s+)?([a-zA-Z][\w-]*(?:\s+[a-zA-Z][\w-]*){0,3})\b/i;

const SUBMIT_SYNONYMS_RE = /\b(submit|save|confirm|apply|continue)\b/i;

// ─── Verb resolution ─────────────────────────────────────────

function actionToVerb(action: StepAction): PatternVerb | null {
  switch (action) {
    case 'click':           return 'click';
    case 'input':           return 'input';
    case 'navigate':        return 'navigate';
    case 'assert-snapshot': return 'observe';
    case 'custom':          return null;
  }
}

function preferredVerbFromText(actionText: string, allowedActions: readonly StepAction[]): PatternVerb | null {
  // Text-shape detection has priority; it encodes the operator's
  // actual intent even if the parser narrowed allowedActions too
  // conservatively.
  if (CLICK_BUTTON_RE.test(actionText) || CLICK_BARE_RE.test(actionText)) return 'click';
  if (INPUT_FIELD_RE.test(actionText)) return 'input';
  if (NAVIGATE_RE.test(actionText)) return 'navigate';
  if (OBSERVE_RE.test(actionText)) return 'observe';

  // Fall back to the parser's narrowed action, if any.
  if (allowedActions.length === 0) return null;
  return actionToVerb(allowedActions[0]!);
}

// ─── Target-shape extraction per verb ───────────────────────

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function extractClickTarget(actionText: string): TargetShapeHint {
  const buttonMatch = CLICK_BUTTON_RE.exec(actionText);
  if (buttonMatch) {
    const rawName = normalizeName(buttonMatch[1]!);
    const hint: TargetShapeHint = {
      role: 'button',
      nameSubstring: rawName,
    };
    // If the name is a canonical submit synonym (single word from
    // SUBMIT_SYNONYMS_RE), also emit an exact-name hint so the
    // exact-match matcher fires at M0.
    const submitMatch = SUBMIT_SYNONYMS_RE.exec(rawName);
    if (submitMatch && rawName.toLowerCase() === submitMatch[1]!.toLowerCase()) {
      return { ...hint, name: capitalize(submitMatch[1]!) };
    }
    return hint;
  }

  const bareMatch = CLICK_BARE_RE.exec(actionText);
  if (bareMatch) {
    const rawName = normalizeName(bareMatch[1]!);
    const hint: TargetShapeHint = {
      role: 'button',
      nameSubstring: rawName,
    };
    // Bare "Click Save" → submit synonym → also emit exact name
    // (mirrors the CLICK_BUTTON_RE branch's submit-synonym handling).
    const submitMatch = SUBMIT_SYNONYMS_RE.exec(rawName);
    if (submitMatch && rawName.toLowerCase() === submitMatch[1]!.toLowerCase()) {
      return { ...hint, name: capitalize(submitMatch[1]!) };
    }
    return hint;
  }

  return {};
}

function extractInputTarget(actionText: string): TargetShapeHint {
  const match = INPUT_FIELD_RE.exec(actionText);
  if (!match) return {};
  return {
    role: 'textbox',
    nameSubstring: normalizeName(match[1]!),
  };
}

function extractNavigateTarget(actionText: string): TargetShapeHint {
  const match = NAVIGATE_RE.exec(actionText);
  if (!match) return {};
  return {
    nameSubstring: normalizeName(match[1]!),
  };
}

function extractObserveTarget(actionText: string): TargetShapeHint {
  const match = OBSERVE_RE.exec(actionText);
  if (!match) return {};
  return {
    nameSubstring: normalizeName(match[1]!),
  };
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Entry point ────────────────────────────────────────────

export function classifyIntent(
  actionText: string,
  allowedActions: readonly StepAction[],
): ClassifiedIntent | null {
  const verb = preferredVerbFromText(actionText, allowedActions);
  if (!verb) return null;

  const targetShape: TargetShapeHint = (() => {
    switch (verb) {
      case 'click':    return extractClickTarget(actionText);
      case 'input':    return extractInputTarget(actionText);
      case 'navigate': return extractNavigateTarget(actionText);
      case 'observe':  return extractObserveTarget(actionText);
      case 'select':   return {};  // no selector patterns in Z11a.4b
    }
  })();

  return {
    verb,
    targetShape,
    originalActionText: actionText,
  };
}
