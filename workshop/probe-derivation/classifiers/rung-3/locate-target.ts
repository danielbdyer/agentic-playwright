/**
 * Rung-3 target location — turns a parsed ProbeTarget into the pair
 * of Playwright locators the live classifiers read:
 *
 *   a11y — the query the real verb would use. Role targets go
 *          through `getByRole` (accname-aware: aria-label, <label>,
 *          placeholder and content all resolve — verified against
 *          Chromium on 2026-09-16); placeholder targets through
 *          `getByPlaceholder`; text targets through `getByText`
 *          (exact), the only query that reaches a roleless surface.
 *   dom  — a role-agnostic handle on the `data-surface-*` attributes
 *          every synthetic surface stamps. It is the tie-breaker
 *          that distinguishes "detached" (no DOM presence) from
 *          "hidden" (DOM present but excluded from the a11y tree).
 *
 * Shared by the interact and observe rung-3 classifiers so both
 * agree with rung-2's `surfaceMatchesTarget` on what a target means.
 */

import type { Locator, Page } from '@playwright/test';
import { foldProbeTarget, type ProbeTarget } from '../../probe-target';

type PlaywrightRole = Parameters<Page['getByRole']>[0];

/** CSS attribute-selector literal for a string value. */
function attr(name: string, value: string): string {
  return `[${name}=${JSON.stringify(value)}]`;
}

export interface LocatedTarget {
  readonly a11y: Locator;
  readonly dom: Locator;
}

export function locateProbeTarget(page: Page, target: ProbeTarget): LocatedTarget {
  return foldProbeTarget<LocatedTarget>(target, {
    role: (t) => {
      // Row scoping (C7): the row's accessible name comes from its
      // cells, so `getByRole('row', { name })` (substring by default)
      // is the real verb's query; the DOM handle uses :has().
      const scope = t.inRow !== undefined ? page.getByRole('row', { name: t.inRow }) : page;
      const domScope = t.inRow !== undefined
        ? `${attr('data-surface-role', 'row')}:has(${attr('data-surface-name', t.inRow)}) `
        : '';
      return {
        a11y: t.name !== undefined
          ? scope.getByRole(t.role as PlaywrightRole, { name: t.name })
          : scope.getByRole(t.role as PlaywrightRole),
        // The DOM handle accepts either the declared name OR the
        // placeholder as the name — a placeholder-only textbox has no
        // data-surface-name, and its accessible name IS the
        // placeholder.
        dom: t.name !== undefined
          ? page.locator(
              `${domScope}${attr('data-surface-role', t.role)}:is(${attr('data-surface-name', t.name)}, ${attr('data-surface-placeholder', t.name)})`,
            )
          : page.locator(`${domScope}${attr('data-surface-role', t.role)}`),
      };
    },
    placeholder: (t) => ({
      a11y: page.getByPlaceholder(t.placeholder, { exact: true }),
      dom: page.locator(attr('data-surface-placeholder', t.placeholder)),
    }),
    text: (t) => ({
      a11y: page.getByText(t.text, { exact: true }),
      dom: page.locator(attr('data-surface-name', t.text)),
    }),
  });
}
