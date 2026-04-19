/**
 * Playwright Screen Observer — live DOM observation adapter.
 *
 * Implements ScreenObservationPort using existing Playwright integration:
 *   - resolveLocator from lib/runtime/locate.ts (locator strategy matching)
 *   - captureAriaYaml from lib/playwright/aria.ts (ARIA tree capture)
 *   - describeLocatorStrategy from lib/runtime/locate.ts (strategy description)
 *
 * One screen observation: navigate → ARIA snapshot → batch element queries.
 * ~100-300ms per screen, ~5-10 API calls, reuses 660 lines of existing code.
 */

import { Effect } from 'effect';
import type { Page } from '@playwright/test';
import type { ScreenObservationPort, ScreenObservationResult } from '../../application/ports';
import type { LocatorStrategy } from '../../domain/governance/workflow-types';
import type { ElementSig } from '../../domain/knowledge/types';
import { resolveLocator, describeLocatorStrategy } from '../../playwright/locate';
import { captureAriaYaml } from '../../playwright/aria';
import { TesseractError } from '../../domain/kernel/errors';
import { navigationOptionsForUrl } from '../../runtime/adapters/navigation-strategy';

/** Observe a single element by trying its locator strategies in order. Pure async. */
async function observeElement(
  page: Page,
  element: { readonly element: string; readonly locator: readonly LocatorStrategy[]; readonly role: string; readonly name: string | null },
): Promise<ScreenObservationResult['elementObservations'][number]> {
  try {
    const elementSig: ElementSig = {
      role: element.role,
      name: element.name ?? null,
      locator: element.locator.length > 0 ? [...element.locator] : undefined,
      surface: '' as ElementSig['surface'],
      widget: '' as ElementSig['widget'],
    };
    const resolved = await resolveLocator(page, elementSig);

    const visibleCount = await resolved.locator.count().catch(() => 0);
    if (visibleCount === 0) {
      return {
        element: element.element,
        found: false,
        visible: false,
        enabled: false,
        ariaLabel: null,
        locatorRung: resolved.strategyIndex,
        locatorStrategy: describeLocatorStrategy(resolved.strategy),
      };
    }

    const first = resolved.locator.first();
    const [visible, enabled, ariaLabel] = await Promise.all([
      first.isVisible().catch(() => false),
      first.isEnabled().catch(() => false),
      first.getAttribute('aria-label').catch(() => null),
    ]);

    return {
      element: element.element,
      found: true,
      visible,
      enabled,
      ariaLabel,
      locatorRung: resolved.strategyIndex,
      locatorStrategy: describeLocatorStrategy(resolved.strategy),
    };
  } catch {
    return {
      element: element.element,
      found: false,
      visible: false,
      enabled: false,
      ariaLabel: null,
      locatorRung: -1,
      locatorStrategy: 'error',
    };
  }
}

/** Observe an entire screen: navigate, capture ARIA, batch-query elements. */
async function observeScreen(
  page: Page,
  input: Parameters<ScreenObservationPort['observe']>[0],
): Promise<ScreenObservationResult> {
  // Step 1: Navigate if URL provided and different from current
  if (input.url) {
    const currentUrl = page.url();
    if (input.url !== currentUrl && !currentUrl.includes(input.url)) {
      const navOpts = navigationOptionsForUrl(input.url);
      await page.goto(input.url, { waitUntil: navOpts.waitUntil, timeout: navOpts.timeout }).catch(() => {});
    }
  }

  // Step 2: Capture ARIA snapshot of the full page
  const ariaResult = await captureAriaYaml(page.locator('body'));
  const ariaSnapshot = ariaResult.ok ? ariaResult.value : null;

  // Step 3: Batch-query all elements in parallel
  const elementObservations = await Promise.all(
    input.elements.map((element) => observeElement(page, element)),
  );

  return { url: page.url(), ariaSnapshot, elementObservations };
}

/** Create a Playwright-backed screen observer.
 *  Reuses existing locator resolution, ARIA capture, and strategy matching. */
export function createPlaywrightScreenObserver(page: Page): ScreenObservationPort {
  return {
    observe: (input) => Effect.tryPromise({
      try: () => observeScreen(page, input),
      catch: (error) => new TesseractError('screen-observation-failed', `Screen observation failed: ${error}`, error),
    }).pipe(Effect.withSpan('playwright-screen-observation')),
  };
}
