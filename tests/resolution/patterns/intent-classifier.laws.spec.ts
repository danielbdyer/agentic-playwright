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

  // ── Click role-suffix recognition (added cycle 3 of cold-start
  //    cohort spike; see docs/v2-cold-start-todomvc-journal.md
  //    Entries 10-12 for the probe-seed provenance). The classifier
  //    must NOT flatten non-button click targets to role=button.

  test('ZC37.j: "Click the toggle checkbox" emits click + checkbox + substring', () => {
    const intent = classifyIntent('Click the toggle checkbox', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('checkbox');
    expect(intent!.targetShape.nameSubstring).toBe('toggle');
  });

  test('ZC37.k: "Click the Active filter link" emits click + link + substring', () => {
    const intent = classifyIntent('Click the Active filter link', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('link');
    expect(intent!.targetShape.nameSubstring).toBe('Active filter');
  });

  test('ZC37.l: "Click the Settings tab" emits click + tab + substring', () => {
    const intent = classifyIntent('Click the Settings tab', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('tab');
    expect(intent!.targetShape.nameSubstring).toBe('Settings');
  });

  test('ZC37.m: "Click the Notifications switch" emits click + switch + substring', () => {
    const intent = classifyIntent('Click the Notifications switch', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
    expect(intent!.targetShape.role).toBe('switch');
    expect(intent!.targetShape.nameSubstring).toBe('Notifications');
  });

  test('ZC37.n: role-suffix recognition is non-regressive — "Click the Submit button" still emits role=button + name=Submit', () => {
    // Guards against accidentally promoting a generic role-suffix
    // match over the button extractor's submit-synonym handling.
    const intent = classifyIntent('Click the Submit button', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.name).toBe('Submit');
  });

  test('ZC37.o: bare "Click toggle" without a role suffix still emits role=button (fallback)', () => {
    // Only when the suffix word is present does the classifier
    // infer the non-button role; bare clicks still flatten.
    const intent = classifyIntent('Click toggle', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.nameSubstring).toBe('toggle');
  });

  // ── Press verb (cycle 4 of cold-start cohort spike; Probe Seed
  //    2). Keyboard actions are first-class, distinct from clicks.

  test('ZC37.p: "Press Enter" emits press + nameSubstring=Enter', () => {
    const intent = classifyIntent('Press Enter to submit the form', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('press');
    expect(intent!.targetShape.nameSubstring).toBe('Enter');
  });

  test('ZC37.q: "Press the Tab key" emits press + nameSubstring=Tab', () => {
    const intent = classifyIntent('Press the Tab key', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('press');
    expect(intent!.targetShape.nameSubstring).toBe('Tab');
  });

  test('ZC37.r: "Press Escape" emits press, NOT click (the prior baseline misclassified press as click)', () => {
    const intent = classifyIntent('Press Escape to cancel', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('press');
    expect(intent!.verb).not.toBe('click');
  });

  test('ZC37.s: "Click submit" still classifies as click (press detection does not poison click recognition)', () => {
    // The press regex requires literal "press"; click recognition
    // is unaffected by the new branch.
    const intent = classifyIntent('Click submit', someClick());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('click');
  });

  // ── Observe role-suffix recognition (cycle 6 of cold-start cohort
  //    spike; Probe Seed 10). The classifier's observe extractor
  //    must honor role-suffix words ("the X button is visible") just
  //    like the click extractor does, so the runner can probe the
  //    correct DOM target instead of falling back to text-search on
  //    the assertion phrasing.

  test('ZC37.t: "Verify the Submit Order button is visible" emits observe + button + Submit Order', () => {
    const intent = classifyIntent('Verify the Submit Order button is visible', someObserve());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('observe');
    expect(intent!.targetShape.role).toBe('button');
    expect(intent!.targetShape.nameSubstring).toBe('Submit Order');
  });

  test('ZC37.u: "Verify the Customer Name field is visible" emits observe + textbox + Customer Name', () => {
    const intent = classifyIntent('Verify the Customer Name field is visible', someObserve());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('observe');
    expect(intent!.targetShape.role).toBe('textbox');
    expect(intent!.targetShape.nameSubstring).toBe('Customer Name');
  });

  test('ZC37.v: "Check the Settings link appears" emits observe + link + Settings', () => {
    const intent = classifyIntent('Check the Settings link appears', someObserve());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('observe');
    expect(intent!.targetShape.role).toBe('link');
    expect(intent!.targetShape.nameSubstring).toBe('Settings');
  });

  test('ZC37.w: observe steps without a role-suffix word still emit nameSubstring only (fallthrough preserved)', () => {
    // "Verify the success message" has no role-suffix word; the
    // existing OBSERVE_RE path must still fire.
    const intent = classifyIntent('Verify the success message appears', someObserve());
    expect(intent).not.toBeNull();
    expect(intent!.verb).toBe('observe');
    expect(intent!.targetShape.role).toBeUndefined();
    expect(intent!.targetShape.nameSubstring).toBeDefined();
  });
});
