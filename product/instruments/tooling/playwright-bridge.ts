/**
 * Playwright Bridge Factory — Effect-based adapter that wraps a
 * Playwright Page in the PlaywrightBridgePort (declared in
 * product/application/ports.ts).
 *
 * Graduated from dashboard/mcp/playwright-mcp-bridge.ts at
 * step-4c.headed-harness-graduate: the port types already moved to
 * product/application/ports at step-4c.final-sweep; the factory now
 * joins them so the headed harness and any future product-internal
 * consumer can construct a live bridge without reaching into dashboard/.
 *
 * Architecture:
 *   Dashboard MCP: structured observation (knowledge, queue, fitness)
 *   Playwright MCP: live DOM interaction (click, fill, navigate, screenshot)
 *   This factory: wraps Page methods in the BrowserAction / BrowserActionResult
 *                 interface, with transient-error classification + retry +
 *                 a per-page action queue that serializes calls.
 *
 * The bridge is a progressive enhancement: when Playwright is available
 * in headed mode, agents get direct DOM access in addition to the
 * dashboard's observation surface.
 */

import { Effect } from 'effect';
import { TesseractError } from '../../domain/kernel/errors';
import { navigationOptionsForUrl } from '../../runtime/adapters/navigation-strategy';
import { RETRY_POLICIES, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';
import type { BrowserAction, PlaywrightBridgePort } from '../../application/ports';

class PlaywrightBridgeTransientError extends TesseractError {
  override readonly _tag = 'PlaywrightBridgeTransientError' as const;

  constructor(message: string, cause?: unknown) {
    super('playwright-bridge-transient', message, cause);
    this.name = 'PlaywrightBridgeTransientError';
  }
}

/** Hardened transient detection: explicit error codes + message patterns. */
function isPlaywrightTransient(cause: unknown): boolean {
  if (!(cause instanceof Error)) {
    return false;
  }
  const name = cause.name ?? '';
  if (name === 'TimeoutError' || name === 'NavigationTimedoutError') return true;
  return /timeout|timed?\s*out|closed|disconnected|target page|target closed|session closed|connection refused|ECONNRESET|ECONNREFUSED|net::ERR_/i.test(cause.message);
}

/**
 * Simple in-process action queue for serializing Playwright page operations.
 * Prevents concurrent click/fill/navigate calls from corrupting page state.
 */
function createActionQueue() {
  let pending: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
      const next = pending.then(fn, fn);
      pending = next.then(() => {}, () => {});
      return next;
    },
  };
}

/** Create a live Playwright bridge from a Playwright Page object.
 *  Only used in headed mode when a real browser is controlled by Playwright.
 *
 *  Usage:
 *    const page = await browser.newPage();
 *    const bridge = createPlaywrightBridge(page);
 *    Layer.succeed(PlaywrightBridge, bridge);
 */
export function createPlaywrightBridge(page: {
  readonly click: (selector: string) => Promise<void>;
  readonly fill: (selector: string, value: string) => Promise<void>;
  readonly goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  readonly screenshot: (options?: { fullPage?: boolean }) => Promise<Buffer>;
  readonly locator: (selector: string) => { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> };
  readonly url: () => string;
  readonly content: () => Promise<string>;
}): PlaywrightBridgePort {
  const queue = createActionQueue();

  return {
    isAvailable: () => Effect.succeed(true),

    execute: (action) => Effect.tryPromise({
      try: () => queue.enqueue(async () => {
        switch (action.kind) {
          case 'click':
            if (!action.selector) return { success: false, action: 'click' as const, data: null, error: 'selector required' };
            await page.click(action.selector);
            return { success: true, action: 'click' as const, data: { selector: action.selector } };

          case 'fill':
            if (!action.selector || action.value === undefined) return { success: false, action: 'fill' as const, data: null, error: 'selector and value required' };
            await page.fill(action.selector, action.value);
            return { success: true, action: 'fill' as const, data: { selector: action.selector, value: action.value } };

          case 'navigate': {
            if (!action.url) return { success: false, action: 'navigate' as const, data: null, error: 'url required' };
            const navOpts = navigationOptionsForUrl(action.url);
            await page.goto(action.url, { waitUntil: navOpts.waitUntil, timeout: navOpts.timeout });
            return { success: true, action: 'navigate' as const, data: { url: action.url } };
          }

          case 'screenshot': {
            const buffer = await page.screenshot({ fullPage: false });
            const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
            if (buffer.length > MAX_SCREENSHOT_BYTES) {
              return { success: true, action: 'screenshot' as const, data: { error: `Screenshot too large (${buffer.length} bytes, max ${MAX_SCREENSHOT_BYTES})`, truncated: true, sizeBytes: buffer.length } };
            }
            return { success: true, action: 'screenshot' as const, data: { imageBase64: buffer.toString('base64'), sizeBytes: buffer.length } };
          }

          case 'query': {
            if (!action.selector) return { success: false, action: 'query' as const, data: null, error: 'selector required' };
            const box = await page.locator(action.selector).boundingBox();
            return { success: true, action: 'query' as const, data: { boundingBox: box } };
          }

          case 'aria-snapshot': {
            const html = await page.content();
            return { success: true, action: 'aria-snapshot' as const, data: { length: html.length } };
          }

          default:
            return { success: false, action: action.kind as BrowserAction['kind'], data: null, error: `Unknown action: ${action.kind}` };
        }
      }),
      catch: (err) => isPlaywrightTransient(err)
        ? new PlaywrightBridgeTransientError('Transient Playwright bridge failure', err)
        : new TesseractError('playwright-bridge-failed', String(err), err),
    }).pipe(
      Effect.retryOrElse(
        retryScheduleForTaggedErrors(
          RETRY_POLICIES.playwrightBridgeTransient,
          (error) => error._tag === 'PlaywrightBridgeTransientError',
        ),
        (error) => Effect.fail(error),
      ),
    ),

    currentUrl: () => Effect.sync(() => page.url()),
    release: () => Effect.void,
  };
}

/**
 * Scoped constructor for Playwright bridge handles.
 * Places page/session cleanup in the release action.
 */
export function createScopedPlaywrightBridge(
  page: {
    readonly click: (selector: string) => Promise<void>;
    readonly fill: (selector: string, value: string) => Promise<void>;
    readonly goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
    readonly screenshot: (options?: { fullPage?: boolean }) => Promise<Buffer>;
    readonly locator: (selector: string) => { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> };
    readonly url: () => string;
    readonly content: () => Promise<string>;
    readonly close?: () => Promise<void>;
  },
){
  return Effect.acquireRelease(
    Effect.succeed(createPlaywrightBridge(page)),
    () => page.close
      ? Effect.promise(() => page.close!()).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void,
  );
}
