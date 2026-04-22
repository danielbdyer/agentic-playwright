/**
 * observe — rung-3 classifier.
 *
 * Per the Step-6 sign-off, observe is one of the two browser-bound
 * verbs that benefits from rung 3. At rung 2 the classifier read
 * world-setup hooks; at rung 3 it queries the real rendered DOM
 * via Playwright's accessibility-aware locators.
 *
 * ## Classification logic
 *
 * Given the probe's `input.target` ({ role, name? }):
 *   1. `page.getByRole(role, { name })` → locator.
 *   2. `locator.waitFor({ state: 'visible', timeout: 1000 })`.
 *      - Resolves → element is visible → matched/null.
 *      - TimeoutError → element not found in the accessibility
 *        tree within the timeout → failed/not-visible.
 *      - Other error → failed/unclassified.
 *
 * ## Why this maps display:none to not-visible
 *
 * The synthetic substrate renders the hide-target hook by applying
 * `style.display: none`. Browsers exclude display:none elements
 * from the accessibility tree, so `getByRole` finds nothing — the
 * timeout fires. We map timeout → not-visible because that's what
 * the hidden world-shape should elicit from the observe verb
 * semantically. The distinction between "element exists but is
 * hidden" and "element never existed" collapses at rung 3 (both
 * classify as not-visible), which is honest: the observe verb's
 * contract is "can you see it?" — both hidden and missing answer
 * no.
 *
 * A future `intent-delay` or `load-delay` hook would route to the
 * timeout family explicitly; that's substrate work, not this
 * classifier's concern today.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import type { Rung3Classifier } from './port';

/** Playwright's `getByRole` takes a narrow string union as its
 *  first parameter. No `AriaRole` type is exported; we recover the
 *  union via `Parameters<Page['getByRole']>[0]`. */
type PlaywrightRole = Parameters<Page['getByRole']>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classifyObserve(
  probe: Probe,
  rawPage: unknown,
): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const page = rawPage as Page;
      const input = probe.input;
      if (!isRecord(input) || !isRecord(input['target'])) {
        return { classification: 'failed', errorFamily: 'unclassified' } as const;
      }
      const target = input['target'] as Record<string, unknown>;
      const roleRaw = typeof target['role'] === 'string' ? target['role'] : null;
      if (roleRaw === null) {
        return { classification: 'failed', errorFamily: 'unclassified' } as const;
      }
      const role = roleRaw as PlaywrightRole;
      const name = typeof target['name'] === 'string' ? (target['name'] as string) : undefined;
      const locator = name !== undefined
        ? page.getByRole(role, { name })
        : page.getByRole(role);
      try {
        await locator.waitFor({ state: 'visible', timeout: 1000 });
        return { classification: 'matched' as const, errorFamily: null };
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') {
          return { classification: 'failed' as const, errorFamily: 'not-visible' };
        }
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
    },
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause)),
  });
}

export const observeRung3Classifier: Rung3Classifier = {
  verb: 'observe',
  classify: classifyObserve,
};
