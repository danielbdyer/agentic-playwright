/**
 * "Exactly one visible element" — the check v1 named everywhere and ran
 * nowhere. v1 accepted `count() === 1` (getByText counts hidden nodes) or the
 * first strategy with any match at all. Here a target is acted on only when
 * exactly one *visible* element matches, and when it does not, the counts
 * say which way it failed: nothing matched, only hidden things matched, or
 * several visible things matched.
 */
import type { Locator } from '@playwright/test';
import { ToolError } from '../core/errors.js';

export interface MatchCounts {
  /** Elements the locator matches, hidden or not. */
  readonly total: number;
  /** Of those, the ones Playwright considers visible. */
  readonly visible: number;
}

export interface UniqueTarget {
  /** The visible-filtered locator, which resolves to exactly one element. */
  readonly locator: Locator;
  readonly matches: MatchCounts;
}

/** Snapshot counts; non-retrying. Throws only if the page itself is gone. */
export const countMatches = async (locator: Locator): Promise<MatchCounts> => {
  const [total, visible] = await Promise.all([locator.count(), locator.filter({ visible: true }).count()]);
  return { total, visible };
};

/** A short human description of a locator, e.g. `getByRole('button', { name: 'Save' })`. */
export const describeLocator = (locator: Locator): string => String(locator);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 'es'}`;

/**
 * Check uniqueness and return the visible-filtered locator with its counts.
 * Throws ToolError: not-found (0 matches), not-visible (matches, none
 * visible), ambiguous (more than one visible). The counts are in `detail`.
 */
export const resolveUnique = async (locator: Locator, description: string): Promise<UniqueTarget> => {
  const matches = await countMatches(locator);
  const detail = { total: matches.total, visible: matches.visible, locator: describeLocator(locator) };
  if (matches.total === 0) {
    throw new ToolError('not-found', `${description}: nothing on the page matches`, detail);
  }
  if (matches.visible === 0) {
    throw new ToolError('not-visible', `${description}: ${plural(matches.total, 'match')}, none visible`, detail);
  }
  if (matches.visible > 1) {
    throw new ToolError('ambiguous', `${description}: ${matches.visible} visible matches (${matches.total} in total); scope it by landmark, block, or row`, detail);
  }
  return { locator: locator.filter({ visible: true }), matches };
};

/** The visible-filtered locator when exactly one visible element matches; ToolError otherwise. */
export const requireUnique = async (locator: Locator, description: string): Promise<Locator> =>
  (await resolveUnique(locator, description)).locator;

/**
 * Wait (up to the budget) for at least one visible match, without failing.
 * Narrative execution races the page: the previous action's re-render may
 * still be in flight, so give the target a chance to appear before counting.
 */
export const settleVisible = async (locator: Locator, timeoutMs: number): Promise<void> => {
  await locator
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible', timeout: Math.max(1, timeoutMs) })
    .catch(() => undefined);
};
