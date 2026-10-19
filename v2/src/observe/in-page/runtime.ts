/**
 * Node side of the in-page bridge. Every call evaluates the prebuilt bundle
 * as a string, never a function literal, so the host's transpiler cannot
 * inject helpers into what runs in the customer's page. The bundle's own
 * names are local to the evaluated arrow; the only globals the walker
 * leaves are `window.__tesseract` and a mutation-counter key during waits.
 */
import type { Locator, Page } from '@playwright/test';
import { IN_PAGE_BUNDLE } from './bundle.generated.js';
import type * as Walker from './walker.js';

type InPageApi = typeof Walker;

type ArgsOf<F> = F extends (...args: infer A) => unknown ? A : never;
type ResultOf<F> = F extends (...args: never[]) => infer R ? R : never;
type RestOf<A> = A extends [unknown, ...infer R] ? R : never;

/** Functions that run against the page as a whole. */
export type PageFunction =
  | 'walk'
  | 'signals'
  | 'structuralSignature'
  | 'installMutationCounter'
  | 'readMutationCount'
  | 'disconnectMutationCounter'
  | 'pollHydration'
  | 'describeRef'
  | 'refStatus';

/** Functions whose first parameter is the element a locator resolved to. */
export type ElementFunction = 'isRef';

/** Functions whose first parameter is every element a locator resolved to. */
export type ElementsFunction = 'indexOfRef';

/** The expression page.evaluate receives: the bundle, then one call with JSON arguments. */
export const inPageExpression = (fn: string, args: readonly unknown[]): string =>
  `(() => {\n${IN_PAGE_BUNDLE}\nreturn __tesseractInPage.${fn}(...${JSON.stringify(args)});\n})()`;

/** Run one in-page function against the page's main world. */
export const inPage = async <K extends PageFunction>(
  page: Page,
  fn: K,
  ...args: ArgsOf<InPageApi[K]>
): Promise<ResultOf<InPageApi[K]>> => (await page.evaluate(inPageExpression(fn, args))) as ResultOf<InPageApi[K]>;

const elementBodies = new Map<string, (element: Element, args: unknown[]) => unknown>();

/**
 * Element-bound calls need the element as an argument, which a string
 * expression cannot receive. A Function built from a string body is the
 * transpiler-proof equivalent: Playwright serializes it by toString(), and
 * that text is exactly the bundle plus one call.
 */
const elementFunction = (fn: string): ((element: Element, args: unknown[]) => unknown) => {
  const cached = elementBodies.get(fn);
  if (cached !== undefined) return cached;
  const built = new Function('element', 'args', `${IN_PAGE_BUNDLE}\nreturn __tesseractInPage.${fn}(element, ...args);`) as (
    element: Element,
    args: unknown[],
  ) => unknown;
  elementBodies.set(fn, built);
  return built;
};

/** Run one element-bound in-page function on the single element `locator` resolves to. */
export const inElement = async <K extends ElementFunction>(
  locator: Locator,
  fn: K,
  args: RestOf<ArgsOf<InPageApi[K]>>,
  timeoutMs = 2_000,
): Promise<ResultOf<InPageApi[K]>> =>
  (await locator.evaluate(elementFunction(fn), [...args] as unknown[], { timeout: timeoutMs })) as ResultOf<InPageApi[K]>;

/** Run one in-page function over every element `locator` resolves to (no waiting). */
export const inElements = async <K extends ElementsFunction>(
  locator: Locator,
  fn: K,
  args: RestOf<ArgsOf<InPageApi[K]>>,
): Promise<ResultOf<InPageApi[K]>> =>
  (await locator.evaluateAll(
    elementFunction(fn) as unknown as (elements: Element[], args: unknown[]) => unknown,
    [...args] as unknown[],
  )) as ResultOf<InPageApi[K]>;
