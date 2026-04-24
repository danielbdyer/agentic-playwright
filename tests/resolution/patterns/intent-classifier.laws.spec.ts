/**
 * Intent classifier — Z11a.4b laws.
 *
 * Pins the regex-based baseline classifier's recognition set. The
 * classifier's expressiveness is deliberately limited — it handles
 * a handful of high-signal instruction shapes and returns null
 * otherwise. Returning null means "pattern-resolution strategy
 * passes this step to the next rung," which is the correct
 * behavior for unrecognized text.
 *
 *   ZC37     exact "Click Submit button" → click + role=button +
 *            exact name (submit synonyms get exact-name hint).
 *   ZC37.b   bare "Click Submit" → click + role=button + substring.
 *   ZC37.c   "Click the Cancel button" → click + role=button +
 *            nameSubstring only (not a submit synonym).
 *   ZC37.d   "Enter foo in the Name field" → input + role=textbox.
 *   ZC37.e   "Navigate to the Login page" → navigate + nameSubstring.
 *   ZC37.f   "Verify the success message" → observe + nameSubstring.
 *   ZC37.g   unrecognized text with no allowedActions → null.
 *   ZC37.h   unrecognized text + allowedActions: ['click'] →
 *            empty targetShape (fallback to parser verb).
 *   ZC37.i   originalActionText preserved through classification.
 */

import { describe, test, expect } from 'vitest';
import type { StepAction } from '../../../product/domain/governance/workflow-types';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';

function someClick(): readonly StepAction[] { return ['click']; }
function someInput(): readonly StepAction[] { return ['input']; }
function someNavigate(): readonly StepAction[] { return ['navigate']; }
function someObserve(): readonly StepAction[] { return ['assert-snapshot']; }
function none(): readonly StepAction[] { return []; }

describe('Z11a.4b — intent classifier', () => {
  test('ZC37: "Click the Submit button" emits click + button + exact "Submit"', () => {
    const intent = classifyIntent('Click the Submit button', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.nameSubstring).toBe('Submit');
    expect(intent!.targetShape.name).toBe('Submit'); // submit synonym → exact-name hint
  });

  test('ZC37.b: bare "Click Save" still classifies click + submit-synonym exact', () => {
    const intent = classifyIntent('Click Save', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    // "Save" is a submit synonym; classifier should still capture it.
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.name).toBe('Save');
  });

  test('ZC37.c: "Click the Cancel button" emits click + button + substring only (not a submit synonym)', () => {
    const intent = classifyIntent('Click the Cancel button', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.nameSubstring).toBe('Cancel');
    expect(intent!.targetShape.name).toBeUndefined();
  });

  test('ZC37.d: "Enter foo into the Name field" emits input + textbox + name substring', () => {
    const intent = classifyIntent('Enter foo into the Name field', someInput());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('input');
    expect(intent!.targetShape.role).toBe('textbox');
    expect(intent!.targetShape.nameSubstring).toBe('Name');
  });

  test('ZC37.e: "Navigate to the Login page" emits navigate + nameSubstring', () => {
    const intent = classifyIntent('Navigate to the Login page', someNavigate());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('navigate');
    expect(intent!.targetShape.nameSubstring).toBe('Login page');
  });

  test('ZC37.f: "Verify the success message appears" emits observe + nameSubstring', () => {
    const intent = classifyIntent('Verify the success message appears', someObserve());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('observe');
    expect(intent!.targetShape.nameSubstring).toBeDefined();
  });

  test('ZC37.g: unrecognized text with no allowedActions returns null', () => {
    const intent = classifyIntent('Perform an unrelated cryptographic attestation', none());
    expect(intent).toBeNull();
  });

  test('ZC37.h: unrecognized text + allowedActions: [click] falls back to verb + empty targetShape', () => {
    const intent = classifyIntent('Do the thing', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBeUndefined();
    expect(intent!.targetShape.name).toBeUndefined();
  });

  test('ZC37.i: originalActionText is preserved across classifications', () => {
    const text = 'Click the Submit button';
    const intent = classifyIntent(text, someClick());
    expect(intent).not.toBeNull();
    expect(intent!.originalActionText).toBe(text);
  });
});
