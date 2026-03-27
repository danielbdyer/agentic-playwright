/**
 * Headed Harness — launches a Playwright browser and wires it into Tesseract.
 *
 * This is the entry point for headed mode: the dashboard server calls this
 * to create a live browser session that's visible in the spatial dashboard
 * and accessible via browser_* MCP tools.
 *
 * Architecture:
 *   launchHeadedHarness()
 *     → chromium.launch({ headless: false })
 *     → browser.newPage()
 *     → createPlaywrightBridge(page)
 *     → returns { page, bridge, dispose }
 *
 * The bridge is injected into the composition layer, making the Page
 * available to both the resolution pipeline AND the MCP tool server.
 *
 * Thread safety: the Page is owned by the Effect fiber during resolution.
 * Browser MCP tools are safe during fiber pause (read-only always safe,
 * write actions only during pause).
 */

import { createPlaywrightBridge, type PlaywrightBridgePort } from './mcp/playwright-mcp-bridge';

// ─── Types ───

export interface HeadedHarnessOptions {
  /** Browser to use. Default: 'chromium'. */
  readonly browser?: 'chromium' | 'firefox' | 'webkit';
  /** Launch in headless mode (for CI with browser tools). Default: false. */
  readonly headless?: boolean;
  /** Browser channel (e.g., 'chrome', 'msedge'). */
  readonly channel?: string;
  /** Viewport dimensions. Default: 1280x720. */
  readonly viewport?: { readonly width: number; readonly height: number };
  /** Initial URL to navigate to. */
  readonly initialUrl?: string;
}

export interface HeadedHarness {
  /** The Playwright Page — shared between resolution pipeline and MCP tools. */
  readonly page: unknown;
  /** The bridge port — injectable into composition layer. */
  readonly bridge: PlaywrightBridgePort;
  /** Current page URL. */
  readonly currentUrl: () => string;
  /** Clean shutdown: close page and browser. */
  readonly dispose: () => Promise<void>;
}

// ─── Factory ───

/** Launch a headed browser session and return a wired harness.
 *
 *  Usage:
 *    const harness = await launchHeadedHarness({ initialUrl: 'http://localhost:3000' });
 *    const context = createLocalServiceContext(rootDir, {
 *      posture: { headed: true },
 *      playwrightBridge: harness.bridge,
 *    });
 *
 *  The harness.bridge can also be passed to createDashboardMcpServer
 *  to expose browser_* MCP tools.
 */
export async function launchHeadedHarness(
  options: HeadedHarnessOptions = {},
): Promise<HeadedHarness> {
  // Dynamic import — Playwright may not be installed in all environments
  const pw = await import('@playwright/test');
  const browserType = options.browser === 'firefox'
    ? pw.firefox
    : options.browser === 'webkit'
      ? pw.webkit
      : pw.chromium;

  const browser = await browserType.launch({
    headless: options.headless ?? false,
    ...(options.channel ? { channel: options.channel } : {}),
  });

  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  if (options.initialUrl) {
    await page.goto(options.initialUrl);
  }

  const bridge = createPlaywrightBridge(page as unknown as Parameters<typeof createPlaywrightBridge>[0]);

  return {
    page,
    bridge,
    currentUrl: () => page.url(),
    dispose: async () => {
      await context.close();
      await browser.close();
    },
  };
}

// ─── Async Bridge Adapter ───
// The dashboard server (CJS) needs a plain async interface, not Effect.
// This adapter wraps the Effect-based PlaywrightBridgePort for direct use.

export interface AsyncPlaywrightBridge {
  readonly execute: (action: {
    readonly kind: string;
    readonly selector?: string;
    readonly value?: string;
    readonly url?: string;
  }) => Promise<{
    readonly success: boolean;
    readonly action: string;
    readonly data: unknown;
    readonly error?: string;
  }>;
  readonly currentUrl: () => Promise<string | null>;
  readonly isAvailable: () => Promise<boolean>;
}

/** Create a plain async bridge from a Playwright Page.
 *  Used by dashboard/server.cjs which can't import Effect directly. */
export function createAsyncPlaywrightBridge(page: {
  readonly click: (selector: string) => Promise<void>;
  readonly fill: (selector: string, value: string) => Promise<void>;
  readonly goto: (url: string) => Promise<unknown>;
  readonly screenshot: (options?: { fullPage?: boolean }) => Promise<Buffer>;
  readonly locator: (selector: string) => { boundingBox: () => Promise<{ x: number; y: number; width: number; height: number } | null> };
  readonly url: () => string;
  readonly content: () => Promise<string>;
}): AsyncPlaywrightBridge {
  return {
    execute: async (action) => {
      try {
        switch (action.kind) {
          case 'click':
            if (!action.selector) return { success: false, action: 'click', data: null, error: 'selector required' };
            await page.click(action.selector);
            return { success: true, action: 'click', data: { selector: action.selector } };

          case 'fill':
            if (!action.selector || action.value === undefined) return { success: false, action: 'fill', data: null, error: 'selector and value required' };
            await page.fill(action.selector, action.value);
            return { success: true, action: 'fill', data: { selector: action.selector } };

          case 'navigate':
            if (!action.url) return { success: false, action: 'navigate', data: null, error: 'url required' };
            await page.goto(action.url);
            return { success: true, action: 'navigate', data: { url: action.url } };

          case 'screenshot': {
            const buffer = await page.screenshot({ fullPage: false });
            return { success: true, action: 'screenshot', data: { imageBase64: buffer.toString('base64'), width: 1280, height: 720 } };
          }

          case 'query':
            if (!action.selector) return { success: false, action: 'query', data: null, error: 'selector required' };
            return { success: true, action: 'query', data: { boundingBox: await page.locator(action.selector).boundingBox() } };

          case 'aria-snapshot': {
            const html = await page.content();
            return { success: true, action: 'aria-snapshot', data: { length: html.length } };
          }

          default:
            return { success: false, action: action.kind, data: null, error: `Unknown action: ${action.kind}` };
        }
      } catch (err) {
        return { success: false, action: action.kind, data: null, error: String(err) };
      }
    },
    currentUrl: async () => page.url(),
    isAvailable: async () => true,
  };
}
