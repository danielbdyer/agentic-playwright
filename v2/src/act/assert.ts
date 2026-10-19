/**
 * Web-first assertions with the observed value.
 *
 * v1 had no assertion at all: its runner recorded "observe" steps as
 * succeeded without checking anything. Here each assertion is the same
 * auto-waiting `expect` the emitted test will run, on the same raw locator
 * (no visibility filter, so strictness behaves as it will in CI), and the
 * actual state is read afterwards whether it passed or not. ADO's expected
 * text is often a paraphrase ("the count decreases by one"); `observed` is
 * what lets the caller tell a paraphrase from a real mismatch.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { ToolError } from '../core/errors.js';
import { escapeRegExp } from '../core/text.js';
import type { AssertionKind } from '../contract/schemas.js';
import { classifyPlaywrightError, summarizeExpectMessage } from './classify.js';

export const DEFAULT_ASSERTION_TIMEOUT_MS = 5_000;
/** Reading the state after the expect: the element was just there, so this is short. */
const OBSERVE_TIMEOUT_MS = 1_000;
const MAX_OBSERVED_TEXT = 1_000;

export type Observed = string | number | boolean | null;

export interface AssertionResult {
  readonly passed: boolean;
  /**
   * The state actually on the page: trimmed innerText (whitespace collapsed)
   * for text kinds, inputValue for value, count, url, title, and the raw
   * boolean state for visible/hidden (isVisible), enabled/disabled
   * (isEnabled), and checked/unchecked (isChecked). null when no element
   * matched (visible/hidden then read false: nothing is visible).
   */
  readonly observed: Observed;
  /** On failure: Playwright's first line plus its Expected/Received lines, ANSI-stripped. */
  readonly message?: string;
}

export interface AssertionOptions {
  readonly timeoutMs?: number;
}

export const PAGE_ASSERTION_KINDS: readonly AssertionKind[] = ['url', 'title'];

export const isPageAssertion = (kind: AssertionKind): boolean => PAGE_ASSERTION_KINDS.includes(kind);

/** "/pattern/flags" → RegExp; anything else → null. Stateful flags (g, y) are dropped. */
export const parseRegexLiteral = (text: string): RegExp | null => {
  const match = /^\/(.+)\/([dgimsuvy]*)$/s.exec(text);
  if (match === null) return null;
  try {
    return new RegExp(match[1] ?? '', (match[2] ?? '').replace(/[gy]/g, ''));
  } catch {
    return null;
  }
};

/**
 * What a url assertion compares against: a /regex/ literal as a RegExp, an
 * absolute URL exactly, anything else as a substring (so "/PolicySearch"
 * passes on any environment's host). Exported so the emitter renders the
 * same matcher the live check used.
 */
export const urlExpectation = (expected: string): string | RegExp => {
  const regex = parseRegexLiteral(expected);
  if (regex !== null) return regex;
  if (/^[a-z][a-z0-9+.-]*:/i.test(expected)) return expected;
  return new RegExp(escapeRegExp(expected));
};

/** Titles compare exactly (whitespace-normalized by Playwright) unless given as a /regex/ literal. */
export const titleExpectation = (expected: string): string | RegExp => parseRegexLiteral(expected) ?? expected;

interface PlannedAssertion {
  readonly run: () => Promise<void>;
  readonly observe: () => Promise<Observed>;
}

const requireTarget = (locator: Locator | null, kind: AssertionKind): Locator => {
  if (locator === null) throw new ToolError('invalid-input', `a ${kind} assertion needs a target`, { assertion: kind });
  return locator;
};

const requireExpected = (expected: string | number | undefined, kind: AssertionKind): string => {
  if (expected === undefined) throw new ToolError('invalid-input', `a ${kind} assertion needs an expected value`, { assertion: kind });
  return String(expected);
};

const requireCount = (expected: string | number | undefined): number => {
  const text = requireExpected(expected, 'count').trim();
  const count = Number(text);
  if (text.length === 0 || !Number.isInteger(count) || count < 0) {
    throw new ToolError('invalid-input', `a count assertion needs a non-negative integer, got ${JSON.stringify(expected)}`, { assertion: 'count' });
  }
  return count;
};

const collapse = (text: string): string => {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_OBSERVED_TEXT ? `${collapsed.slice(0, MAX_OBSERVED_TEXT)}…` : collapsed;
};

/** Read a single element's state, or null when nothing matches or the read fails. */
const readOne = async <T extends Observed>(locator: Locator, read: (target: Locator) => Promise<T>): Promise<Observed> => {
  if ((await locator.count()) === 0) return null;
  return read(locator);
};

const plan = (page: Page, kind: AssertionKind, locator: Locator | null, expected: string | number | undefined, timeout: number): PlannedAssertion => {
  const opts = { timeout };
  const observeOpts = { timeout: OBSERVE_TIMEOUT_MS };
  switch (kind) {
    case 'visible':
    case 'hidden': {
      const target = requireTarget(locator, kind);
      return {
        run: () => (kind === 'visible' ? expect(target).toBeVisible(opts) : expect(target).toBeHidden(opts)),
        // isVisible does not wait and reads false for a missing element.
        observe: () => target.isVisible(),
      };
    }
    case 'text': {
      const target = requireTarget(locator, kind);
      const text = requireExpected(expected, kind);
      return {
        run: () => expect(target).toHaveText(text, opts),
        observe: () => readOne(target, async (t) => collapse(await t.innerText(observeOpts))),
      };
    }
    case 'contains-text': {
      const target = requireTarget(locator, kind);
      const text = requireExpected(expected, kind);
      return {
        run: () => expect(target).toContainText(text, opts),
        observe: () => readOne(target, async (t) => collapse(await t.innerText(observeOpts))),
      };
    }
    case 'value': {
      const target = requireTarget(locator, kind);
      const value = requireExpected(expected, kind);
      return {
        run: () => expect(target).toHaveValue(value, opts),
        observe: () => readOne(target, (t) => t.inputValue(observeOpts)),
      };
    }
    case 'count': {
      const target = requireTarget(locator, kind);
      const count = requireCount(expected);
      return {
        run: () => expect(target).toHaveCount(count, opts),
        observe: () => target.count(),
      };
    }
    case 'enabled':
    case 'disabled': {
      const target = requireTarget(locator, kind);
      return {
        run: () => (kind === 'enabled' ? expect(target).toBeEnabled(opts) : expect(target).toBeDisabled(opts)),
        observe: () => readOne(target, (t) => t.isEnabled(observeOpts)),
      };
    }
    case 'checked':
    case 'unchecked': {
      const target = requireTarget(locator, kind);
      return {
        run: () => expect(target).toBeChecked({ ...opts, checked: kind === 'checked' }),
        observe: () => readOne(target, (t) => t.isChecked(observeOpts)),
      };
    }
    case 'url': {
      const matcher = urlExpectation(requireExpected(expected, kind));
      return { run: () => expect(page).toHaveURL(matcher, opts), observe: async () => page.url() };
    }
    case 'title': {
      const matcher = titleExpectation(requireExpected(expected, kind));
      return { run: () => expect(page).toHaveTitle(matcher, opts), observe: () => page.title() };
    }
    default: {
      const never: never = kind;
      throw new ToolError('invalid-input', `unknown assertion kind ${String(never)}`);
    }
  }
};

/** An `expect` that ran and did not hold, as opposed to an error raised while running it. */
const isExpectFailure = (error: unknown): boolean =>
  error instanceof Error && ('matcherResult' in error || /^expect\(/.test(error.message.trimStart()));

/**
 * Evaluate one assertion. Throws ToolError for problems with the request or
 * the target rather than the page's state: invalid-input (missing target
 * for an element kind, missing or malformed expected), ambiguous (the
 * locator matches several elements where one is required — the emitted
 * test would fail the same way), unavailable (the page is gone). Anything
 * else is a result: passed or not, with what was observed.
 */
export const runAssertion = async (
  page: Page,
  kind: AssertionKind,
  locator: Locator | null,
  expected: string | number | undefined,
  options: AssertionOptions = {},
): Promise<AssertionResult> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ASSERTION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ToolError('invalid-input', `timeoutMs must be a positive number, got ${timeoutMs}`);
  }
  const assertion = plan(page, kind, locator, expected, timeoutMs);
  const failure = await assertion.run().then(
    () => null,
    (error: unknown) => ({ error }),
  );
  let message: string | undefined;
  if (failure !== null) {
    if (isExpectFailure(failure.error)) {
      message = summarizeExpectMessage(failure.error);
    } else {
      const classified = classifyPlaywrightError(failure.error);
      if (classified.family === 'ambiguous' || classified.family === 'unavailable') {
        throw new ToolError(classified.family, classified.message, { assertion: kind });
      }
      // e.g. "Not a checkbox or radio button": the assertion cannot hold on this target.
      message = classified.message;
    }
  }
  const observed = await assertion.observe().catch((): Observed => null);
  return message === undefined ? { passed: true, observed } : { passed: false, observed, message };
};
