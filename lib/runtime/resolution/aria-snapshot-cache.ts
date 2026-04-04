/**
 * ARIA Snapshot Cache — reuses accessibility snapshots within a single step's
 * resolution attempts to avoid redundant DOM traversals.
 *
 * During resolution, the same step may attempt multiple rungs (live-dom,
 * rung 8 LLM-DOM, rung 9 agent-interpreted) — each calling
 * `page.accessibility.snapshot()`. The DOM is stable across these attempts
 * (typically < 500ms), so we cache the snapshot per step.
 *
 * Pure cache with TTL-based invalidation. Not shared across steps.
 */

/** Maximum age for a cached snapshot before it's considered stale. */
const SNAPSHOT_TTL_MS = 500;

interface CachedSnapshot {
  readonly snapshot: string | null;
  readonly capturedAt: number;
}

/**
 * Per-step ARIA snapshot cache.
 *
 * Usage:
 *   const cache = createAriaSnapshotCache();
 *   // First call captures from page:
 *   const snap1 = await cache.get(page, maxChars);
 *   // Second call (within TTL) returns cached:
 *   const snap2 = await cache.get(page, maxChars);
 *   // Invalidate on navigation:
 *   cache.invalidate();
 */
export interface AriaSnapshotCache {
  /** Get a cached or fresh ARIA snapshot. Returns null if page lacks accessibility API. */
  get(page: unknown, maxChars?: number): Promise<string | null>;
  /** Invalidate the cache (e.g., after page.goto or state change). */
  invalidate(): void;
  /** Number of cache hits since creation (for diagnostics). */
  readonly hits: number;
  /** Number of cache misses since creation (for diagnostics). */
  readonly misses: number;
}

type PlaywrightPageLike = {
  accessibility: { snapshot: (opts: { interestingOnly: boolean }) => Promise<unknown> };
};

function isPlaywrightPageLike(page: unknown): page is PlaywrightPageLike {
  return typeof page === 'object' && page !== null && 'accessibility' in page;
}

const DOM_SNAPSHOT_MAX_CHARS = 2048;

function truncateSnapshot(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  return lastNewline > maxChars * 0.5
    ? truncated.slice(0, lastNewline) + '\n...'
    : truncated + '...';
}

export function createAriaSnapshotCache(): AriaSnapshotCache {
  let cached: CachedSnapshot | null = null;
  let hitCount = 0;
  let missCount = 0;

  return {
    async get(page: unknown, maxChars: number = DOM_SNAPSHOT_MAX_CHARS): Promise<string | null> {
      // Return cached if fresh
      if (cached && (Date.now() - cached.capturedAt) < SNAPSHOT_TTL_MS) {
        hitCount++;
        return cached.snapshot;
      }

      // Capture fresh
      missCount++;
      if (!isPlaywrightPageLike(page)) {
        cached = { snapshot: null, capturedAt: Date.now() };
        return null;
      }

      try {
        const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
        if (!snapshot) {
          cached = { snapshot: null, capturedAt: Date.now() };
          return null;
        }
        const text = JSON.stringify(snapshot, null, 2);
        const result = truncateSnapshot(text, maxChars);
        cached = { snapshot: result, capturedAt: Date.now() };
        return result;
      } catch {
        cached = { snapshot: null, capturedAt: Date.now() };
        return null;
      }
    },

    invalidate() {
      cached = null;
    },

    get hits() { return hitCount; },
    get misses() { return missCount; },
  };
}
