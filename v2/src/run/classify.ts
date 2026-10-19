/**
 * Run failures → what they mean for the catalog and for the QA lead.
 *
 * The error family comes from act's classifier (one reading of Playwright's
 * messages for both authoring and runs), with two run-only cases it cannot
 * see: a web-first `expect` failure (whose "Received: <element(s) not
 * found>" is a missing element, not an assertion), and the test-level
 * timeout ("Test timeout of 30000ms exceeded"), whose call log still says
 * what the step was waiting for.
 *
 * The failure type is the verdict:
 *   drift          not-found / ambiguous / not-visible, and the error names a
 *                  locator of a facet the failing step uses — the page moved;
 *   candidate-bug  toHaveText / toContainText / toHaveValue / toHaveCount saw
 *                  something else — the application may be wrong;
 *   environment    navigation timeouts (including goto() waiting for the main
 *                  landmark), net:: errors, 5xx, a missing runtime secret —
 *                  the environment, not the test;
 *   unknown        anything else.
 */
import type { ErrorFamily } from '../core/errors.js';
import { classifyPlaywrightError, stripAnsi } from '../act/classify.js';
import type { Facet, FailureType, LocatorSpec } from '../contract/schemas.js';
import { renderLocator } from '../locator/locator.js';

export interface FailureClass {
  readonly family: ErrorFamily;
  readonly failureType: FailureType;
  /** The facet whose locator the error names (drift). */
  readonly facet?: string;
  /** One readable line or two: what failed, expected and received, what it was waiting for. */
  readonly message: string;
}

const MAX_MESSAGE = 800;

const LOCATOR_FAMILIES: ReadonlySet<ErrorFamily> = new Set(['not-found', 'ambiguous', 'not-visible']);

/** Matchers whose mismatch means the page shows other content than the case expects. */
const CONTENT_MATCHERS = /\.(toHaveText|toContainText|toHaveValue|toHaveCount)\(/;

const EXPECT_FAILURE = /expect\((?:locator|page|received)\)\.\w+\(.*\)\s*failed|^(?:Error: )?expect\(/m;

const ENVIRONMENT = [
  /net::ERR_[A-Z_]+/,
  /\bECONNREFUSED\b|\bECONNRESET\b|\bENOTFOUND\b|\bEAI_AGAIN\b/,
  /\bpage\.(?:goto|reload|goBack|goForward|waitForURL|waitForLoadState|waitForNavigation)\b/,
  /\bnavigating to "/,
  // A page object's goto() waits for the main landmark: a page that never shows one did not load.
  /locator\.waitFor:[\s\S]*waiting for getByRole\('main'\)/,
  /\b5\d\d (?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\b/i,
  /\b(?:status|status code|HTTP)[: ]+5\d\d\b/i,
  /Target page, context or browser has been closed|[Bb]rowser has been closed|Browser closed/,
  /Set the environment variable TESSERACT_PARAM_/,
];

const firstLine = (text: string): string => text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';

const capped = (text: string): string => (text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE)}…` : text);

/** The readable part of an expect failure: first line, Locator, Expected and Received lines. */
const expectSummary = (text: string): string => {
  const body = text.split(/\n\s*Call log:/)[0] ?? text;
  const lines = body.split('\n').map((line) => line.trim().replace(/\s{2,}/g, ' '));
  const keep = lines.filter((line) => /^(Locator|Expected|Received)\b/.test(line));
  return capped([firstLine(body), ...keep].filter((line) => line.length > 0).join('; '));
};

/** The error family of a run failure message. */
export const familyOf = (raw: string): { readonly family: ErrorFamily; readonly message: string; readonly expect: boolean } => {
  const text = stripAnsi(raw);
  if (EXPECT_FAILURE.test(text)) {
    const message = expectSummary(text);
    if (/strict mode violation/.test(text)) return { family: 'ambiguous', message, expect: true };
    if (/<element\(s\) not found>|element\(s\) not found/.test(text)) return { family: 'not-found', message, expect: true };
    if (/toBeVisible\(/.test(text) && /Received:\s*hidden/.test(text)) return { family: 'not-visible', message, expect: true };
    if (/Test timeout of \d+ms exceeded/.test(text)) return { family: 'timeout', message, expect: true };
    return { family: 'assertion-like', message, expect: true };
  }
  const testTimeout = /Test timeout of \d+ms exceeded/.test(text);
  const timeoutName = testTimeout || /^(?:\w+\.)?TimeoutError\b/.test(text.trimStart());
  const classified = classifyPlaywrightError({ name: timeoutName ? 'TimeoutError' : 'Error', message: text });
  return { family: classified.family, message: capped(classified.message), expect: false };
};

/** Playwright prints locators without their root; drop every `page.` that roots a chain. */
const rootless = (expression: string): string => expression.replace(/(^|[^\w$.])page\./g, '$1');

const squash = (text: string): string => text.replace(/\s+/g, '');

const PARAM = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const WILDCARD = '\u0000';

/**
 * The expressions a locator can appear as in an error: rendered with the
 * data row's values (or a wildcard for a value not known here), with and
 * without its scope (Playwright may print a scoped chain differently).
 */
const expressionsOf = (locator: LocatorSpec, params: Readonly<Record<string, string>>): readonly string[] => {
  const names = [...new Set([locator.value, locator.name, locator.scope?.rowText].flatMap((text) => (text === undefined ? [] : [...text.matchAll(PARAM)].map((m) => m[1]!))))];
  const values = Object.fromEntries(names.map((name) => [name, params[name] ?? WILDCARD]));
  const bare: LocatorSpec = { ...locator, expression: undefined };
  const full = renderLocator(bare, { params: values });
  const unscoped = locator.scope === undefined ? null : renderLocator({ ...bare, scope: undefined }, { params: values });
  return [full, ...(unscoped === null ? [] : [unscoped])].map((expression) => squash(rootless(expression)));
};

/** Whether `text` contains `expression`, where WILDCARD stands for any run of characters. */
const appearsIn = (text: string, expression: string): boolean => {
  const parts = expression.split(WILDCARD).filter((part) => part.length > 0);
  if (parts.length === 0) return false;
  const fold = (from: number, index: number): boolean => {
    if (index === parts.length) return true;
    const at = text.indexOf(parts[index]!, from);
    return at >= 0 && fold(at + parts[index]!.length, index + 1);
  };
  return fold(0, 0);
};

/** How much of an expression is literal text (wildcards match anything, so they say nothing). */
const specificity = (expression: string): number => expression.split(WILDCARD).join('').length;

/**
 * The facet whose locator the error text names. Expressions are matched as
 * substrings, so a page-level `getByRole('button', { name: 'Save' })` also
 * appears inside a dialog's `getByRole('dialog').getByRole('button', …)`:
 * the most specific (longest) match wins. Among equally specific matches,
 * the step's facets come first, then any other facet the test uses (a
 * failure in a beforeEach flow has no step); a full-expression match before
 * an unscoped one.
 */
export const facetNamedBy = (
  raw: string,
  stepFacets: readonly Facet[],
  otherFacets: readonly Facet[],
  params: Readonly<Record<string, string>> = {},
): string | undefined => {
  const text = squash(stripAnsi(raw));
  const ranked = [...stepFacets, ...otherFacets.filter((facet) => !stepFacets.some((s) => s.id === facet.id))];
  for (const exact of [true, false]) {
    const hits = ranked.flatMap((facet, order) => {
      const lengths = facet.locators.flatMap((locator) => {
        const [full, ...rest] = expressionsOf(locator, params);
        return (exact ? [full!] : rest).filter((expression) => appearsIn(text, expression)).map(specificity);
      });
      return lengths.length === 0 ? [] : [{ id: facet.id, length: Math.max(...lengths), order }];
    });
    const best = [...hits].sort((a, b) => b.length - a.length || a.order - b.order)[0];
    if (best !== undefined) return best.id;
  }
  return undefined;
};

/** Classify one failure message against the facets of the step it happened in. */
export const classifyRunFailure = (
  raw: string,
  stepFacets: readonly Facet[],
  otherFacets: readonly Facet[] = [],
  params: Readonly<Record<string, string>> = {},
): FailureClass => {
  const text = stripAnsi(raw);
  const { family, message, expect } = familyOf(text);
  if (LOCATOR_FAMILIES.has(family)) {
    const facet = facetNamedBy(text, stepFacets, otherFacets, params);
    if (facet !== undefined) return { family, failureType: 'drift', facet, message };
  }
  if (expect && family === 'assertion-like' && CONTENT_MATCHERS.test(text)) return { family, failureType: 'candidate-bug', message };
  if (ENVIRONMENT.some((pattern) => pattern.test(text))) {
    const environmentFamily: ErrorFamily = /Set the environment variable/.test(text)
      ? 'not-configured'
      : family === 'unclassified' || family === 'assertion-like'
        ? 'unavailable'
        : family;
    return { family: environmentFamily, failureType: 'environment', message };
  }
  return { family, failureType: 'unknown', message };
};
