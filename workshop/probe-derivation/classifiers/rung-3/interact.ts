/**
 * interact — rung-3 classifier.
 *
 * The second browser-bound verb that benefits from rung-3. Where
 * rung-2 read world-setup hooks to simulate declared failure
 * families, rung-3 actually attempts the Playwright action and
 * observes its real failure mode.
 *
 * ## Classification logic (mirrors the real interact verb's ordering)
 *
 *   1. Extract input.facet-id + input.action (+ optional value).
 *   2. Wait a short 50ms to let React effects (e.g., detach hooks)
 *      settle after navigation.
 *   3. `count() === 0`  → failed/timeout (detached / never rendered).
 *   4. `!isVisible()`   → failed/not-visible (display:none renderer
 *                        output excludes from accessibility tree).
 *   5. `!isEnabled()`   → failed/not-enabled (disabled attribute).
 *   6. Attempt the action with a short timeout.
 *      - Resolves → matched/null.
 *      - "Element is not an <input>" error → failed/assertion-like
 *        (fill() on a non-input element posing as textbox).
 *      - Any other error → failed/unclassified.
 *
 * This ordering mirrors the real interact verb's `assertPrecondition`
 * + `classifyThrownError` sequence: preconditions first, action
 * second. Classification families map cleanly onto each stage.
 *
 * ## Element lookup
 *
 * Uses `data-facet-id` — the stable attribute every synthetic-app
 * renderer stamps. Role-based lookup would be ambiguous on a page
 * that renders multiple buttons with the same role, and the
 * observe verb's role+name strategy doesn't transfer to interact's
 * facet-id-keyed input shape.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import type { Rung3Classifier } from './port';

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
      const facetId = typeof input['facet-id'] === 'string' ? input['facet-id'] : null;
      const action = typeof input['action'] === 'string' ? input['action'] : null;
      if (facetId === null || action === null) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const value = typeof input['value'] === 'string' ? input['value'] : '';
      const locator = page.locator(`[data-facet-id="${facetId}"]`);

      // Let React settle (detach hooks, etc.).
      await page.waitForTimeout(SETTLE_DELAY_MS);

      if ((await locator.count()) === 0) {
        return { classification: 'failed' as const, errorFamily: 'timeout' };
      }
      if (!(await locator.isVisible())) {
        return { classification: 'failed' as const, errorFamily: 'not-visible' };
      }
      if (!(await locator.isEnabled())) {
        return { classification: 'failed' as const, errorFamily: 'not-enabled' };
      }

      try {
        if (action === 'click') {
          await locator.click({ timeout: ACTION_TIMEOUT_MS });
        } else if (action === 'input') {
          await locator.fill(value, { timeout: ACTION_TIMEOUT_MS });
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
