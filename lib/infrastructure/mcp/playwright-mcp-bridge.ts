/**
 * Playwright MCP Bridge — seam for integrating Playwright's browser tools
 * alongside the dashboard's observation tools.
 *
 * Architecture:
 *   Dashboard MCP: structured observation (knowledge, queue, fitness)
 *   Playwright MCP: live DOM interaction (click, fill, navigate, screenshot)
 *   This bridge: coordinates both, routes tool calls to the right handler
 *
 * The bridge is a progressive enhancement: when Playwright is available
 * in headed mode, agents get direct DOM access in addition to the
 * dashboard's observation surface.
 *
 * Integration options:
 *   1. Playwright CLI (`npx playwright`) — direct browser control, simpler
 *   2. Playwright MCP server (`@playwright/mcp`) — structured tool access
 *   3. CDP bridge — Chrome DevTools Protocol for low-level control
 *
 * This module provides the port interface and a disabled adapter.
 * The live adapter is created when a Playwright Page is available.
 */

import { Effect } from 'effect';
import { Context } from 'effect';
import { TesseractError } from '../../domain/kernel/errors';
import { navigationOptionsForUrl } from '../../runtime/adapters/navigation-strategy';
import { RETRY_POLICIES, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';

// ─── Port Interface ───

/** A browser action that can be performed via Playwright or CDP. */
export interface BrowserAction {
  readonly kind: 'click' | 'fill' | 'navigate' | 'screenshot' | 'query' | 'aria-snapshot';
  readonly selector?: string;
  readonly value?: string;
  readonly url?: string;
}

/** Result of a browser action. */
export interface BrowserActionResult {
  readonly success: boolean;
  readonly action: BrowserAction['kind'];
  readonly data: unknown;
  readonly error?: string;
}

/** Port for browser interaction via Playwright or MCP. */
export interface PlaywrightBridgePort {
  /** Whether a live browser session is available. */
  readonly isAvailable: () => Effect.Effect<boolean, never, never>;
  /** Execute a browser action. Returns result or error. */
  readonly execute: (action: BrowserAction) => Effect.Effect<BrowserActionResult, TesseractError>;
  /** Get the current page URL. */
  readonly currentUrl: () => Effect.Effect<string | null, never, never>;
  /** Optional release hook for lifecycle-managed bridge handles. */
  readonly release?: () => Effect.Effect<void, never, never>;
}

// ─── Disabled Adapter (no Playwright available) ───

export const DisabledPlaywrightBridge: PlaywrightBridgePort = {
  isAvailable: () => Effect.succeed(false),
  execute: (action) => Effect.succeed({
    success: false,
    action: action.kind,
    data: null,
    error: 'Playwright bridge not available (headless mode)',
  }),
  currentUrl: () => Effect.succeed(null),
};

// ─── Context Tag ───

export class PlaywrightBridge extends Context.Tag('tesseract/PlaywrightBridge')<PlaywrightBridge, PlaywrightBridgePort>() {}

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
  // Check for known Playwright error class names (version-resilient)
  const name = cause.name ?? '';
  if (name === 'TimeoutError' || name === 'NavigationTimedoutError') return true;
  // Pattern matching on message as fallback — covers network and lifecycle errors
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

// ─── Live Adapter Factory (for headed mode with Playwright Page) ───
// This factory is called when a Playwright Page is available.
// It wraps Page methods in the BrowserAction/BrowserActionResult interface.

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
  // Action queue serializes all page operations to prevent concurrent corruption
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
            // Cap screenshot payload at 5MB to prevent oversized JSON-RPC frames
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
