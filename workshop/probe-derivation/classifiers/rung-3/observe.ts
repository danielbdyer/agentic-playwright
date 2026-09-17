/**
 * observe — rung-3 classifier.
 *
 * First-principles revision (Step-6 F4). Queries the real rendered
 * DOM via Playwright's accessibility-aware locator plus a role-
 * agnostic `data-surface-*` DOM locator as a fallback to distinguish
 * "element hidden from a11y tree" from "element not in DOM at all."
 *
 * Classification logic:
 *   1. Parse probe.input.target (role / placeholder / text).
 *   2. Check DOM: if no element matches the data-surface handle,
 *      classify as timeout.
 *   3. Check DOM-visibility: if `isVisible()` is false on the DOM
 *      locator, classify as not-visible.
 *   4. Attempt the query the real verb would use (getByRole /
 *      getByPlaceholder / getByText). If found → matched. If the DOM
 *      locator was visible but the query fails, the element is
 *      DOM-present but exposed differently — classify as not-visible
 *      (from the accessibility perspective).
 *
 * This mirrors the real observe verb's ARIA-first contract while
 * using the DOM fallback to produce a precise error family for
 * display:none cases.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import { parseProbeTarget } from '../../probe-target';
import type { Rung3Classifier } from './port';
import { locateProbeTarget } from './locate-target';

function classifyObserve(
  probe: Probe,
  rawPage: unknown,
): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const page = rawPage as Page;
      const target = parseProbeTarget(probe.input);
      if (target === null) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const { a11y, dom } = locateProbeTarget(page, target);

      // Settle to let React effects (e.g. detach) land.
      await page.waitForTimeout(50);

      if ((await dom.count()) === 0) {
        return { classification: 'failed' as const, errorFamily: 'timeout' };
      }
      if (!(await dom.isVisible())) {
        return { classification: 'failed' as const, errorFamily: 'not-visible' };
      }
      // Element is in DOM AND DOM-visible. Verify the verb's own
      // query reaches it — if not, the surface is DOM-present but
      // not exposed the way the query expects; observe treats that
      // as not-visible.
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
