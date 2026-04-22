/**
 * interact — rung-3 classifier.
 *
 * First-principles revision (Step-6 F4): locates by role+name via
 * Playwright's accessibility-aware queries (matching the real
 * interact verb's semantics) and maps each real Playwright outcome
 * to a declared error family.
 *
 * Classification logic mirrors the real interact verb's
 * precondition ordering:
 *
 *   1. settle: waitForTimeout(50ms) to let React effects land.
 *   2. count() === 0 (via data-surface-id fallback OR role+name)
 *      → failed/timeout (detached / never rendered).
 *   3. !isVisible()                → failed/not-visible.
 *   4. !isEnabled()                → failed/not-enabled.
 *   5. attempt action:
 *        click(timeout: 1500)      → matched OR error.
 *        fill(timeout: 1500)       → matched OR error.
 *      - error.message ~ "Element is not an <input>" → assertion-like.
 *      - other error → unclassified.
 *
 * Element lookup: role + accessible name is the primary path. For
 * elements hidden from the accessibility tree (display:none), role-
 * query finds nothing, so we also check data-surface-id as a
 * fallback to distinguish detached from hidden.
 */

import { Effect } from 'effect';
import type { Page, Locator } from '@playwright/test';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';
import type { Rung3Classifier } from './port';

type PlaywrightRole = Parameters<Page['getByRole']>[0];

const ACTION_TIMEOUT_MS = 1_500;
const SETTLE_DELAY_MS = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractTarget(input: unknown): { role: PlaywrightRole; name?: string } | null {
  if (!isRecord(input)) return null;
  const target = input['target'];
  if (!isRecord(target)) return null;
  const role = typeof target['role'] === 'string' ? (target['role'] as PlaywrightRole) : null;
  if (role === null) return null;
  const out: { role: PlaywrightRole; name?: string } = { role };
  if (typeof target['name'] === 'string') out.name = target['name'] as string;
  return out;
}

/** Locate the target element. Returns both the accessibility-tree
 *  locator (role + name) and a role-agnostic DOM locator via the
 *  `data-surface-role`/`data-surface-name` attributes every synthetic
 *  surface stamps. The DOM lookup is the tie-breaker that
 *  distinguishes "detached" (no DOM presence) from "hidden" (DOM
 *  present but display:none excludes from the a11y tree). */
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
      const target = extractTarget(input);
      if (action === null || target === null) {
        return { classification: 'failed' as const, errorFamily: 'unclassified' };
      }
      const value = typeof input['value'] === 'string' ? input['value'] : '';
      const { a11y, dom } = locateTarget(page, target);

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
      // back to the DOM locator when a11y locator is empty (rare;
      // would mean the element has the role but not the expected
      // name in the a11y tree).
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
