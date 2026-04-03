/**
 * CDP Screencast — streams live frames from a Playwright-controlled browser
 * via Chrome DevTools Protocol `Page.startScreencast`.
 *
 * Architecture:
 *   Playwright page → CDPSession → Page.screencastFrame events
 *     → callback(ScreenCapturedEvent) → DashboardPort / WS broadcast
 *
 * The CDP screencast is the compositor-level capture: it shows exactly what
 * the browser renders, including animations, scrolls, and agent interactions.
 * Frames arrive as JPEG base64 at a configurable quality and resolution.
 *
 * CDP throttles frame emission natively — a new frame is only sent after
 * the previous one is acknowledged. This creates natural backpressure
 * without any explicit rate limiting on our side.
 *
 * Fallback: when CDP is unavailable (non-Chromium, headless restrictions,
 * or Playwright version mismatch), the caller should fall back to the
 * LiveDomPortal iframe approach.
 */

import type { ScreenCapturedEvent } from '../../domain/types/dashboard';

// ─── Types ───

export interface CdpScreencastOptions {
  /** JPEG quality 1-100. Lower = smaller frames, fewer tokens. Default: 60. */
  readonly quality?: number;
  /** Max width in CSS pixels. Frames are downscaled to fit. Default: 1280. */
  readonly maxWidth?: number;
  /** Max height in CSS pixels. Default: 720. */
  readonly maxHeight?: number;
  /**
   * Minimum interval between emitted frames in ms. Default: 0 (no throttle).
   * CDP's ack-based protocol provides natural backpressure — a new frame is
   * only sent after the previous one is acknowledged. Setting this to 0 lets
   * the compositor stream at its native rate (~30-60fps on headed browsers).
   */
  readonly minIntervalMs?: number;
}

export interface ScreencastHandle {
  /** Stop the screencast and release the CDP session. Idempotent. */
  readonly stop: () => Promise<void>;
}

// ─── CDP Session Typing (subset of Playwright's CDPSession) ───

interface CdpSession {
  send(method: 'Page.startScreencast', params: {
    readonly format: 'jpeg' | 'png';
    readonly quality?: number;
    readonly maxWidth?: number;
    readonly maxHeight?: number;
    readonly everyNthFrame?: number;
  }): Promise<void>;
  send(method: 'Page.stopScreencast'): Promise<void>;
  send(method: 'Page.screencastFrameAck', params: { readonly sessionId: number }): Promise<void>;
  on(event: 'Page.screencastFrame', handler: (params: {
    readonly data: string;
    readonly metadata: {
      readonly offsetTop: number;
      readonly pageScaleFactor: number;
      readonly deviceWidth: number;
      readonly deviceHeight: number;
      readonly scrollOffsetX: number;
      readonly scrollOffsetY: number;
      readonly timestamp?: number;
    };
    readonly sessionId: number;
  }) => void): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: 'Page.screencastFrame', handler: (...args: any[]) => void): void;
  detach(): Promise<void>;
}

/** Playwright page with CDP access via context.newCDPSession(page).
 *  Playwright 1.50+ moved CDP session creation from page to context. */
interface PlaywrightPageWithCdp {
  context(): { newCDPSession(page: unknown): Promise<CdpSession> };
  url(): string;
}

// ─── Implementation ───

const isPlaywrightCdpCapable = (page: unknown): page is PlaywrightPageWithCdp => {
  if (typeof page !== 'object' || page === null) return false;
  const p = page as Record<string, unknown>;
  if (typeof p.context !== 'function' || typeof p.url !== 'function') return false;
  const ctx = (p.context as () => unknown)();
  return typeof ctx === 'object' && ctx !== null && 'newCDPSession' in ctx;
};

/**
 * Start a CDP screencast on a Playwright page.
 *
 * Returns a handle with a `stop()` method. Frames are delivered to `onFrame`
 * as `ScreenCapturedEvent` objects (same shape the dashboard WebSocket expects).
 *
 * Returns `null` when the page doesn't support CDP (Firefox, WebKit, or
 * when createCDPSession is unavailable). The caller should fall back to
 * the LiveDomPortal in that case.
 */
export async function startCdpScreencast(
  page: unknown,
  onFrame: (frame: ScreenCapturedEvent) => void,
  options: CdpScreencastOptions = {},
): Promise<ScreencastHandle | null> {
  if (!isPlaywrightCdpCapable(page)) return null;

  const quality = options.quality ?? 60;
  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 720;
  const minIntervalMs = options.minIntervalMs ?? 0;

  let session: CdpSession;
  try {
    session = await page.context().newCDPSession(page);
  } catch {
    return null;
  }

  let stopped = false;
  let lastFrameAt = 0;

  const frameHandler = (params: {
    readonly data: string;
    readonly metadata: {
      readonly deviceWidth: number;
      readonly deviceHeight: number;
    };
    readonly sessionId: number;
  }): void => {
    if (stopped) return;

    // Optional throttle: when minIntervalMs > 0, skip frames that arrive
    // too fast. When 0 (default), CDP's ack-based backpressure is the
    // only rate limit — the compositor streams at its native rate.
    const now = Date.now();
    if (minIntervalMs > 0 && now - lastFrameAt < minIntervalMs) {
      session.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
      return;
    }
    lastFrameAt = now;

    // Emit the frame as a ScreenCapturedEvent
    onFrame({
      imageBase64: params.data,
      width: params.metadata.deviceWidth,
      height: params.metadata.deviceHeight,
      url: (page as PlaywrightPageWithCdp).url(),
    });

    // Ack the frame so CDP sends the next one (natural backpressure)
    session.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  };

  session.on('Page.screencastFrame', frameHandler);

  try {
    await session.send('Page.startScreencast', {
      format: 'jpeg',
      quality,
      maxWidth,
      maxHeight,
      everyNthFrame: 1,
    });
  } catch {
    // CDP not supported or session detached
    session.off('Page.screencastFrame', frameHandler);
    try { await session.detach(); } catch { /* cleanup best-effort */ }
    return null;
  }

  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      session.off('Page.screencastFrame', frameHandler);
      try { await session.send('Page.stopScreencast'); } catch { /* already stopped */ }
      try { await session.detach(); } catch { /* already detached */ }
    },
  };
}

/**
 * Wrap a BrowserPoolPort with a persistent CDP screencast that follows
 * whichever page is currently active.
 *
 * Lifecycle:
 *   acquire → start screencast on new page (stop previous if any)
 *   release → keep streaming (page still shows last AUT state)
 *   close   → stop all
 *
 * This gives continuous frame coverage rather than ~1 frame per page.
 * The compositor keeps rendering frames even after Playwright finishes
 * interacting, so the dashboard always shows the latest AUT state.
 */
export function withScreencast<
  TPool extends {
    acquire(): Promise<{ readonly id: string; readonly page: unknown; readonly overflow: boolean }>;
    release(handle: { readonly id: string; readonly page: unknown; readonly overflow: boolean }, strategy?: string): Promise<void>;
    close(): Promise<void>;
    readonly stats: unknown;
    warmUp?(urls: readonly string[]): Promise<void>;
  },
>(
  pool: TPool,
  onFrame: (frame: ScreenCapturedEvent) => void,
  options?: CdpScreencastOptions,
): TPool {
  // Only one active screencast at a time — follows the most recently acquired page
  let activeSession: ScreencastHandle | null = null;
  let activeHandleId: string | null = null;

  const wrapped = {
    ...pool,

    async acquire() {
      const handle = await pool.acquire();

      // Swap screencast to the new page — stop old session first
      if (activeSession) {
        await activeSession.stop().catch(() => {});
        activeSession = null;
        activeHandleId = null;
      }

      const screencast = await startCdpScreencast(handle.page, onFrame, options);
      if (screencast) {
        activeSession = screencast;
        activeHandleId = handle.id;
      }
      return handle;
    },

    async release(handle: { readonly id: string; readonly page: unknown; readonly overflow: boolean }, strategy?: string) {
      // Don't stop the screencast on release — keep streaming the last frame.
      // The compositor continues rendering, giving the dashboard a live view
      // of the AUT's final state until the next page is acquired.
      return pool.release(handle, strategy);
    },

    async close() {
      if (activeSession) {
        await activeSession.stop().catch(() => {});
        activeSession = null;
        activeHandleId = null;
      }
      return pool.close();
    },
  };

  // Preserve the stats getter — Object spread eagerly evaluates getters
  Object.defineProperty(wrapped, 'stats', {
    get: () => pool.stats,
    enumerable: true,
  });

  // Preserve warmUp if it exists
  if ('warmUp' in pool && typeof pool.warmUp === 'function') {
    (wrapped as Record<string, unknown>).warmUp = pool.warmUp.bind(pool);
  }

  return wrapped as TPool;
}
