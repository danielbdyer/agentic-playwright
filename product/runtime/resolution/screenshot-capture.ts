/**
 * Screenshot + ARIA-snapshot capture helpers — carved out of
 * resolution-stages.ts at Step 4a per
 * `docs/v2-direction.md §6 Step 4a`.
 *
 * The three export functions are called from rung 8 (LLM-DOM) and
 * rung 9 (agent interpretation) to gather visual + structural
 * context before dispatching a reasoning call. They are pure
 * wrappers over Playwright's snapshot APIs with defensive type
 * guards that degrade gracefully to `null` when the page object
 * does not implement the expected surface.
 */

import type { createPlaywrightDomResolver } from '../adapters/playwright-dom-resolver';

/** Maximum characters for the DOM snapshot passed to the agent
 *  interpreter. Kept at module scope so all three helpers agree on
 *  the default. */
export const DOM_SNAPSHOT_MAX_CHARS = 2048;

type PlaywrightPageLike = Parameters<typeof createPlaywrightDomResolver>[0];

export function isPlaywrightPageLike(page: unknown): page is PlaywrightPageLike {
  return typeof page === 'object' && page !== null && 'accessibility' in page && 'locator' in page;
}

type PlaywrightScreenshotLike = {
  screenshot: (opts: {
    readonly type: 'jpeg';
    readonly quality: number;
    readonly fullPage: boolean;
  }) => Promise<Buffer>;
};

function isPlaywrightScreenshotCapable(page: unknown): page is PlaywrightScreenshotLike {
  return typeof page === 'object' && page !== null && 'screenshot' in page
    && typeof (page as PlaywrightScreenshotLike).screenshot === 'function';
}

/**
 * Capture a raw JPEG screenshot buffer from a live Playwright page.
 * Returns null when no page is available or when capture fails.
 * Used by the deferred screenshot collector to delay base64 encoding.
 */
export async function capturePageScreenshotBuffer(
  page: unknown,
  options?: { readonly quality?: number },
): Promise<Buffer | null> {
  if (!isPlaywrightScreenshotCapable(page)) return null;
  try {
    return await page.screenshot({
      type: 'jpeg',
      quality: options?.quality ?? 50,
      fullPage: false,
    });
  } catch {
    return null;
  }
}

/**
 * Capture a JPEG screenshot from a live Playwright page as a base64
 * string. Returns null when no page is available, when capture
 * fails, or when vision is disabled. Uses JPEG at configurable
 * quality (default 50) to minimise vision token cost.
 */
export async function capturePageScreenshot(
  page: unknown,
  options?: { readonly quality?: number },
): Promise<string | null> {
  const buffer = await capturePageScreenshotBuffer(page, options);
  return buffer ? buffer.toString('base64') : null;
}

/**
 * Capture a truncated ARIA/accessibility snapshot from a live
 * Playwright page. Returns null when no page is available or when
 * capture fails. Pure truncation: slices to `maxChars` without
 * splitting mid-line when possible.
 */
export async function captureTruncatedAriaSnapshot(
  page: unknown,
  maxChars: number = DOM_SNAPSHOT_MAX_CHARS,
): Promise<string | null> {
  if (!isPlaywrightPageLike(page)) return null;
  try {
    const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return null;
    const text = JSON.stringify(snapshot, null, 2);
    if (text.length <= maxChars) return text;
    // Truncate at the last newline boundary within maxChars to
    // avoid mid-line cuts.
    const truncated = text.slice(0, maxChars);
    const lastNewline = truncated.lastIndexOf('\n');
    return lastNewline > maxChars * 0.5
      ? truncated.slice(0, lastNewline) + '\n...'
      : truncated + '...';
  } catch {
    return null;
  }
}
