/**
 * Deferred Screenshot Encoding — collects raw screenshot buffers during
 * step execution and batch-encodes them in the background.
 *
 * At scale (1000 scenarios × 10 steps × 30% capture rate = 3000 screenshots),
 * synchronous JPEG encoding blocks the step loop. This module defers encoding
 * to a post-step batch phase:
 *
 *   1. During step execution: collect raw Buffer (fast, ~1ms)
 *   2. Between steps or at iteration end: batch encode to JPEG (background)
 *   3. Write manifest with encoded file paths
 *
 * All policy functions are pure. Side effects (encoding, disk I/O) are
 * confined to the flush operation.
 */

import type { ScreenshotManifestEntry, ScreenshotReason } from './screenshot-policy';

// ─── Pending Screenshot ───

export interface PendingScreenshot {
  /** Step identifier: `${adoId}:${runId}:${stepIndex}`. */
  readonly stepKey: string;
  /** Screen the screenshot was captured on. */
  readonly screenId: string;
  /** Why this screenshot was captured. */
  readonly reason: ScreenshotReason;
  /** Capture priority from the policy decision. */
  readonly priority: number;
  /** Raw screenshot buffer (unencoded). */
  readonly buffer: Buffer;
  /** Timestamp of capture. */
  readonly capturedAt: string;
}

// ─── Batch Collector ───

export interface ScreenshotCollector {
  /** Add a pending screenshot to the batch. */
  add(screenshot: PendingScreenshot): void;
  /** Get all pending screenshots, sorted by priority (highest first). */
  readonly pending: readonly PendingScreenshot[];
  /** Number of pending screenshots. */
  readonly size: number;
  /** Clear all pending screenshots after flush. */
  clear(): void;
  /** Estimated memory usage in bytes. */
  readonly estimatedBytes: number;
}

/**
 * Create a screenshot collector with an optional memory budget.
 *
 * When the budget is exceeded, lowest-priority screenshots are evicted
 * to stay within bounds. Default budget: 100MB.
 */
export function createScreenshotCollector(
  memoryBudgetBytes: number = 100 * 1024 * 1024,
): ScreenshotCollector {
  let screenshots: PendingScreenshot[] = [];
  let totalBytes = 0;

  function evictIfNeeded(): void {
    if (totalBytes <= memoryBudgetBytes) return;
    // Sort by priority ascending (lowest first) and remove until under budget
    screenshots.sort((a, b) => a.priority - b.priority);
    while (totalBytes > memoryBudgetBytes && screenshots.length > 0) {
      const evicted = screenshots.shift()!;
      totalBytes -= evicted.buffer.length;
    }
    // Re-sort by priority descending for consistent output
    screenshots.sort((a, b) => b.priority - a.priority);
  }

  return {
    add(screenshot: PendingScreenshot): void {
      screenshots.push(screenshot);
      totalBytes += screenshot.buffer.length;
      evictIfNeeded();
    },

    get pending(): readonly PendingScreenshot[] {
      return [...screenshots].sort((a, b) => b.priority - a.priority);
    },

    get size(): number {
      return screenshots.length;
    },

    clear(): void {
      screenshots = [];
      totalBytes = 0;
    },

    get estimatedBytes(): number {
      return totalBytes;
    },
  };
}

// ─── Encoding Policy ───

/**
 * Determine JPEG quality based on screenshot reason.
 * Critical captures (failure, agent-interpretation) get higher quality.
 * Informational captures (first-step, hot-screen) get lower quality.
 *
 * Pure function: reason → quality (1-100).
 */
export function qualityForReason(reason: ScreenshotReason): number {
  switch (reason) {
    case 'step-failure': return 60;
    case 'agent-interpretation': return 55;
    case 'rung-drift': return 50;
    case 'hot-screen': return 40;
    case 'health-critical': return 45;
    case 'first-step': return 30;
    case 'none': return 30;
  }
}

// ─── Manifest Builder ───

/**
 * Build manifest entries from pending screenshots.
 * Pure function: pending screenshots + output dir → manifest entries.
 */
export function buildManifestEntries(
  screenshots: readonly PendingScreenshot[],
  outputDir: string,
): readonly ScreenshotManifestEntry[] {
  return screenshots.map((screenshot): ScreenshotManifestEntry => ({
    stepKey: screenshot.stepKey,
    screenId: screenshot.screenId,
    reason: screenshot.reason,
    priority: screenshot.priority,
    capturedAt: screenshot.capturedAt,
    filePath: `${outputDir}/${screenshot.stepKey.replace(/[:/]/g, '-')}.jpg`,
  }));
}
