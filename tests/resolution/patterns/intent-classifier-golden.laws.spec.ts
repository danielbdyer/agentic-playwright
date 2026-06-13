/**
 * Intent-classifier golden corpus (Cycle 11 / G8).
 *
 * Praxis audit §G8: the classifier was evaluated only end-to-end
 * through a browser; its laws (ZC37) pinned a handful of anecdotes.
 * A classifier regression that broke the cohort would only surface
 * on a live run.
 *
 * This is the offline golden: every phrasing the cohort fixtures
 * actually use (TodoMVC, httpbin, outsystems-com, saucedemo), plus
 * canonical shape exemplars, labeled with the expected
 * verb/role/name. It runs the SAME classification path the cohort
 * runner runs (stripHtml → inferAllowedActions → classifyIntent) in
 * milliseconds, so a classifier change that breaks a real cohort
 * phrasing fails here, not on a network run.
 *
 *   ZC49     every golden phrasing classifies to its expected
 *            verb + (role/name) shape.
 *   ZC49.b   the corpus covers every verb the runner executes.
 */

import { describe, test, expect } from 'vitest';
import { classifyIntent } from '../../../product/domain/resolution/patterns/intent-classifier';
import {
  stripHtml,
  inferAllowedActions,
} from '../../../workshop/customer-backlog/application/intent-helpers';
import type { ClassifiedIntent } from '../../../product/domain/resolution/patterns/rung-kernel';

interface GoldenCase {
  /** Raw ADO action text (HTML-wrapped, as the fixtures store it). */
  readonly action: string;
  readonly expectVerb: ClassifiedIntent['verb'];
  readonly expectRole?: string | null;
  /** Substring the classifier should extract (case-insensitive
   *  compare). Omit to skip the name assertion. */
  readonly expectNameSubstring?: string;
  /** Provenance: which cohort fixture this phrasing comes from. */
  readonly from: string;
}

// Real phrasings from the committed cohort fixtures, plus a few
// canonical exemplars. When a new fixture introduces a phrasing,
// add it here — this corpus is the classifier's regression net.
const GOLDEN: readonly GoldenCase[] = [
  // ── TodoMVC ──
  { action: '<p>Navigate to the TodoMVC application</p>', expectVerb: 'navigate', expectNameSubstring: 'TodoMVC', from: 'todomvc/91001' },
  { action: '<p>Enter a sample todo in the new-todo input field</p>', expectVerb: 'input', expectRole: 'textbox', expectNameSubstring: 'new-todo input', from: 'todomvc/91002.pre' },
  { action: '<p>Press Enter to add the todo</p>', expectVerb: 'press', expectNameSubstring: 'Enter', from: 'todomvc/91002.pre' },
  { action: '<p>Click the toggle checkbox next to the todo</p>', expectVerb: 'click', expectRole: 'checkbox', expectNameSubstring: 'toggle', from: 'todomvc/91002' },
  { action: '<p>Verify the items-left count decreases by one</p>', expectVerb: 'observe', expectRole: null, from: 'todomvc/91002' },
  { action: '<p>Click the Active filter link</p>', expectVerb: 'click', expectRole: 'link', expectNameSubstring: 'Active', from: 'todomvc/91003' },
  // ── outsystems-com ──
  { action: '<p>Click the Accept Cookies button</p>', expectVerb: 'click', expectRole: 'button', expectNameSubstring: 'Accept Cookies', from: 'outsystems-com/pre' },
  { action: '<p>Click the EN button</p>', expectVerb: 'click', expectRole: 'button', expectNameSubstring: 'EN', from: 'outsystems-com/pre' },
  { action: '<p>Verify the English language link is visible</p>', expectVerb: 'observe', expectRole: 'link', expectNameSubstring: 'English language', from: 'outsystems-com/91201' },
  { action: '<p>Click the Deutsch language link</p>', expectVerb: 'click', expectRole: 'link', expectNameSubstring: 'Deutsch language', from: 'outsystems-com/91203' },
  // ── saucedemo ──
  { action: '<p>Verify the Username field is visible</p>', expectVerb: 'observe', expectRole: 'textbox', expectNameSubstring: 'Username', from: 'saucedemo/91301' },
  { action: '<p>Enter the standard username into the Username field</p>', expectVerb: 'input', expectRole: 'textbox', expectNameSubstring: 'Username', from: 'saucedemo/91302' },
  { action: '<p>Click the Login button</p>', expectVerb: 'click', expectRole: 'button', expectNameSubstring: 'Login', from: 'saucedemo/91303' },
  // ── canonical exemplars ──
  { action: 'Click the Submit button', expectVerb: 'click', expectRole: 'button', expectNameSubstring: 'Submit', from: 'canonical' },
  { action: 'Navigate to the Login page', expectVerb: 'navigate', expectNameSubstring: 'Login', from: 'canonical' },
];

function classifyLikeRunner(action: string): ClassifiedIntent | null {
  const plain = stripHtml(action);
  return classifyIntent(plain, inferAllowedActions(plain));
}

describe('Cycle 11 / G8 — intent-classifier golden corpus', () => {
  for (const g of GOLDEN) {
    test(`ZC49 [${g.from}]: "${stripHtml(g.action)}" → ${g.expectVerb}`, () => {
      const intent = classifyLikeRunner(g.action);
      expect(intent, `classifier returned null for "${g.action}"`).not.toBeNull();
      expect(intent!.verb).toBe(g.expectVerb);
      if (g.expectRole !== undefined) {
        expect(intent!.targetShape.role ?? null).toBe(g.expectRole);
      }
      if (g.expectNameSubstring !== undefined) {
        const got = (intent!.targetShape.name ?? intent!.targetShape.nameSubstring ?? '').toLowerCase();
        expect(got).toContain(g.expectNameSubstring.toLowerCase());
      }
    });
  }

  test('ZC49.b: the golden corpus covers every verb the runner executes', () => {
    const covered = new Set(GOLDEN.map((g) => g.expectVerb));
    // navigate, click, input, observe, press are the verbs the
    // cohort runner narrative-executes; select has no fixtures yet.
    for (const verb of ['navigate', 'click', 'input', 'observe', 'press'] as const) {
      expect(covered.has(verb), `golden corpus missing verb '${verb}'`).toBe(true);
    }
  });
});
