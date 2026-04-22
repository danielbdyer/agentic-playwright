/**
 * observe — rung-3 classifier.
 *
 * First-principles revision (Step-6 F4). Queries the real rendered
 * DOM via Playwright's accessibility-aware locator plus a role-
 * agnostic `data-surface-role` DOM locator as a fallback to
 * distinguish "element hidden from a11y tree" from "element not in
 * DOM at all."
 *
 * Classification logic:
 *   1. Extract probe.input.target.{role, name}.
 *   2. Check DOM: if no element matches `data-surface-role=<role>`
 *      (+ optional `data-surface-name`), classify as timeout.
 *   3. Check DOM-visibility: if `isVisible()` is false on the DOM
 *      locator, classify as not-visible.
 *   4. Attempt accessibility-tree query: `getByRole(role, { name })`.
 *      If found + visible → matched. If the DOM locator was visible
 *      but a11y query fails, the element is DOM-present but
 *      role-exposed-differently — classify as not-visible (from the
 *      accessibility perspective).
 *
 * This mirrors the real observe verb's ARIA-first contract while
 * using the DOM fallback to produce a precise error family for
 * display:none cases.
 */

import { Effect } from 'effect';
import type { Page, Locator } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import type { Rung3Classifier } from './port';

type PlaywrightRole = Parameters<Page['getByRole']>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractTarget(input: unknown): { role: PlaywrightRole; name?: string } | null {
  if (!isRecord(input)) return null;
  const target = input['target'];
  if (!isRecord(target)) return null;
  const roleRaw = typeof target['role'] === 'string' ? target['role'] : null;
  if (roleRaw === null) return null;
  const out: { role: PlaywrightRole; name?: string } = { role: roleRaw as PlaywrightRole };
  if (typeof target['name'] === 'string') out.name = target['name'] as string;
  return out;
}

function locateTarget(
  page: Page,
  target: { role: PlaywrightRole; name?: string },
): { a11y: Locator; dom: Locator } {
  const a11y = target.name !== undefined
    ? page.getByRole(target.role, { name: target.name })
    : page.getByRole(target.role);
  const domSelector = target.name !== undefined
    ? `[data-surface-role="${target.role}"][data-surface-name="${target.name}"]`
    : `[data-surface-role="${target.role}"]`;
  const dom = page.locator(domSelector);
  return { a11y, dom };
}

function classifyObserve(
  probe: Probe,
  rawPage: unknown,
): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const page = rawPage as Page;
      const target = extractTarget(probe.input);
      if (target === null) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const { a11y, dom } = locateTarget(page, target);

      // Settle to let React effects (e.g. detach) land.
      await page.waitForTimeout(50);

      if ((await dom.count()) === 0) {
        return { classification: 'failed' as const, errorFamily: 'timeout' };
      }
      if (!(await dom.isVisible())) {
        return { classification: 'failed' as const, errorFamily: 'not-visible' };
      }
      // Element is in DOM AND DOM-visible. Verify the accessibility
      // tree exposes it — if not, the surface is DOM-present but
      // a11y-hidden, which observe treats as not-visible.
      if ((await a11y.count()) === 0) {
        return { classification: 'failed' as const, errorFamily: 'not-visible' };
      }
      return { classification: 'matched' as const, errorFamily: null };
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export const observeRung3Classifier: Rung3Classifier = {
  verb: 'observe',
  classify: classifyObserve,
};
