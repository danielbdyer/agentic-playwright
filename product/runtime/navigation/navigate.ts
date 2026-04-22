/**
 * navigate — page-level URL transition verb (v2.2.0).
 *
 * This file holds the type declarations the manifest entry
 * references; the runtime implementation (page.goto + outcome
 * classification) lands when a caller needs it at runtime. Today
 * the probe IR at rung 2 and rung 3 tests the verb's classifier
 * surface; runtime implementation follows as Step-7+ wires
 * the verb into the authoring flow.
 */

/** The request shape navigate accepts. */
export interface NavigateRequest {
  /** Destination URL. Can be absolute or relative to the current
   *  base URL. The substrate server accepts any path (the shell
   *  renders based on `?shape=...`), so relative paths resolve
   *  cleanly. */
  readonly url: string;
  /** Optional wait strategy controlling when navigation is
   *  considered complete. Defaults to `load`. */
  readonly waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Optional timeout in milliseconds. Defaults to a
   *  substrate-typical 5 seconds. */
  readonly timeoutMs?: number;
}

/** The outcome shape navigate produces on success. */
export interface NavigateOutcome {
  /** The final URL Playwright reports after navigation settles
   *  (which may differ from the requested URL when redirects fire). */
  readonly reachedUrl: string;
  /** HTTP status code for the main-frame response. Null when
   *  navigating to a data: / about: / blob: URL. */
  readonly statusCode: number | null;
  /** Wall-clock elapsed time in milliseconds. */
  readonly elapsedMs: number;
}
