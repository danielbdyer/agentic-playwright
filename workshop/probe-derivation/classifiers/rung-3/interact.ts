/**
 * interact — rung-3 classifier.
 *
 * First-principles revision (Step-6 F4): locates the target via
 * Playwright's accessibility-aware queries (matching the real
 * interact verb's semantics) and maps each real Playwright outcome
 * to a declared error family.
 *
 * Classification logic mirrors the real interact verb's
 * precondition ordering:
 *
 *   1. settle: waitForTimeout(50ms) to let React effects land.
 *   2. dom.count() === 0            → failed/timeout (detached /
 *                                     never rendered).
 *   3. !isVisible()                 → failed/not-visible.
 *   4. !isEnabled()                 → failed/not-enabled.
 *   5. attempt action:
 *        click(timeout: 1500)       → matched OR error.
 *        fill(timeout: 1500)        → matched OR error.
 *      - error.message ~ "Element is not an <input>" → assertion-like.
 *      - other error → unclassified.
 *
 * Element lookup is shared with observe (locate-target.ts): the
 * a11y locator is the primary path; the `data-surface-*` DOM handle
 * distinguishes detached from hidden.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import { parseProbeTarget } from '../../probe-target';
import type { Rung3Classifier } from './port';
import { locateProbeTarget } from './locate-target';

const ACTION_TIMEOUT_MS = 1_500;
const SETTLE_DELAY_MS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classifyInteract(
  probe: Probe,
  rawPage: unknown,
): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const page = rawPage as Page;
      const input = probe.input;
      if (!isRecord(input)) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const action = typeof input['action'] === 'string' ? input['action'] : null;
      const target = parseProbeTarget(input);
      if (action === null || target === null) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const value = typeof input['value'] === 'string' ? input['value'] : '';
      const { a11y, dom } = locateProbeTarget(page, target);

      // Let React effects (e.g. detach hooks) land.
      await page.waitForTimeout(SETTLE_DELAY_MS);

      const domCount = await dom.count();
      if (domCount === 0) {
        // Nothing in the DOM at all — element was detached or never
        // rendered. Classify as timeout.
        return { classification: 'failed' as const, errorFamily: 'timeout' };
      }
      // Element is in DOM. Check visibility via the DOM locator (not
      // the a11y locator — display:none excludes from a11y entirely,
      // making the a11y locator's visibility query misleading).
      if (!(await dom.isVisible())) {
        return { classification: 'failed' as const, errorFamily: 'not-visible' };
      }
      if (!(await dom.isEnabled())) {
        return { classification: 'failed' as const, errorFamily: 'not-enabled' };
      }

      // For the action, prefer the a11y locator when present — it
      // exercises the same query the real interact verb uses. Fall
      // back to the DOM locator when the a11y locator is empty (would
      // mean the element has the role but not the expected name in
      // the a11y tree).
      const actionLocator = (await a11y.count()) > 0 ? a11y : dom;

      try {
        if (action === 'click') {
          await actionLocator.click({ timeout: ACTION_TIMEOUT_MS });
        } else if (action === 'input') {
          await actionLocator.fill(value, { timeout: ACTION_TIMEOUT_MS });
        } else {
          return { classification: 'failed' as const, errorFamily: 'unclassified' };
        }
        return { classification: 'matched' as const, errorFamily: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/Element is not an? <input>|Node is not an HTMLInputElement/i.test(msg)) {
          return { classification: 'failed' as const, errorFamily: 'assertion-like' };
        }
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

export const interactRung3Classifier: Rung3Classifier = {
  verb: 'interact',
  classify: classifyInteract,
};
