/**
 * Console Sentinel — captures browser console messages during step execution.
 *
 * Attaches a Playwright page.on('console') listener before a step runs,
 * collects all messages, and detaches after. Returns immutable ConsoleEntry
 * records for inclusion in the ExecutionObservation.
 *
 * Design:
 * - Listener-based: no polling, no mutation of shared state
 * - Scoped: each sentinel instance captures messages for exactly one step
 * - Filtered: only captures warn/error by default (configurable)
 * - Size-bounded: caps total entries to prevent memory runaway
 */

import type { Page, ConsoleMessage } from 'playwright';
import type { ConsoleEntry } from '../domain/types/execution';

export interface ConsoleSentinelConfig {
  /** Which console levels to capture. Defaults to ['warn', 'error']. */
  readonly levels: readonly ConsoleEntry['level'][];
  /** Maximum entries to collect per step. Defaults to 50. */
  readonly maxEntries: number;
}

const DEFAULT_CONFIG: ConsoleSentinelConfig = {
  levels: ['warn', 'error'],
  maxEntries: 50,
};

/**
 * Sentinel handle returned by `attachConsoleSentinel`.
 * Call `detach()` to stop listening and retrieve collected entries.
 */
export interface ConsoleSentinelHandle {
  /** Stop listening and return all collected console entries (immutable). */
  readonly detach: () => readonly ConsoleEntry[];
}

function mapConsoleLevel(type: string): ConsoleEntry['level'] {
  switch (type) {
    case 'warning': return 'warn';
    case 'error': return 'error';
    case 'info': return 'info';
    case 'debug': return 'debug';
    default: return 'log';
  }
}

/**
 * Attach a console listener to a Playwright page.
 *
 * Returns a handle whose `detach()` method removes the listener and
 * returns all captured entries. The sentinel collects messages into
 * a closure-scoped array (internal mutation is contained and invisible
 * to callers — the returned array is a frozen snapshot).
 */
export function attachConsoleSentinel(
  page: Page,
  config?: Partial<ConsoleSentinelConfig>,
): ConsoleSentinelHandle {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  const levelSet = new Set(resolved.levels);

  // Internal accumulation — contained within the closure, invisible to callers.
  // The detach() method returns an immutable snapshot.
  let entries: ConsoleEntry[] = [];
  let active = true;

  const handler = (msg: ConsoleMessage) => {
    if (!active) return;
    const level = mapConsoleLevel(msg.type());
    if (!levelSet.has(level)) return;
    if (entries.length >= resolved.maxEntries) return;

    entries = [...entries, {
      level,
      text: msg.text(),
      timestamp: new Date().toISOString(),
      url: msg.location()?.url,
    }];
  };

  page.on('console', handler);

  return {
    detach: () => {
      active = false;
      page.removeListener('console', handler);
      const snapshot = Object.freeze([...entries]);
      entries = [];
      return snapshot;
    },
  };
}
