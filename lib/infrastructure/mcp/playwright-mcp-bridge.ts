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
import type { TesseractError } from '../../domain/errors';

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
  readonly goto: (url: string) => Promise<unknown>;
  readonly screenshot: (options?: { fullPage?: boolean }) => Promise<Buffer>;
  readonly locator: (selector: string) => { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> };
  readonly url: () => string;
  readonly content: () => Promise<string>;
}): PlaywrightBridgePort {
  return {
    isAvailable: () => Effect.succeed(true),

    execute: (action) => Effect.tryPromise({
      try: async () => {
        switch (action.kind) {
          case 'click':
            if (!action.selector) return { success: false, action: 'click', data: null, error: 'selector required' };
            await page.click(action.selector);
            return { success: true, action: 'click' as const, data: { selector: action.selector } };

          case 'fill':
            if (!action.selector || action.value === undefined) return { success: false, action: 'fill', data: null, error: 'selector and value required' };
            await page.fill(action.selector, action.value);
            return { success: true, action: 'fill' as const, data: { selector: action.selector, value: action.value } };

          case 'navigate':
            if (!action.url) return { success: false, action: 'navigate', data: null, error: 'url required' };
            await page.goto(action.url);
            return { success: true, action: 'navigate' as const, data: { url: action.url } };

          case 'screenshot': {
            const buffer = await page.screenshot({ fullPage: false });
            return { success: true, action: 'screenshot' as const, data: { imageBase64: buffer.toString('base64') } };
          }

          case 'query': {
            if (!action.selector) return { success: false, action: 'query', data: null, error: 'selector required' };
            const box = await page.locator(action.selector).boundingBox();
            return { success: true, action: 'query' as const, data: { boundingBox: box } };
          }

          case 'aria-snapshot': {
            const html = await page.content();
            return { success: true, action: 'aria-snapshot' as const, data: { length: html.length } };
          }

          default:
            return { success: false, action: action.kind, data: null, error: `Unknown action: ${action.kind}` };
        }
      },
      catch: (err) => ({ _tag: 'TesseractError' as const, message: String(err) }) as TesseractError,
    }),

    currentUrl: () => Effect.sync(() => page.url()),
  };
}
