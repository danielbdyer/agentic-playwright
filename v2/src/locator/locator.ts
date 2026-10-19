/**
 * Locator specs → Playwright locators, and → the code expression that appears
 * in page objects. One function builds both, so what Tesseract verified on the
 * live page is exactly what the emitted test runs.
 */
import type { Locator, Page, FrameLocator } from '@playwright/test';
import { ToolError } from '../core/errors.js';
import { quote } from '../core/text.js';
import type { LocatorSpec, LocatorScope } from '../contract/schemas.js';

type Root = Page | Locator | FrameLocator;

const PARAM_REF = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const PARAM_ANY = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Substitute `{name}` placeholders. Throws invalid-input when a parameter is missing. */
export const substituteParams = (text: string, params: Readonly<Record<string, string>> | undefined): string =>
  text.replace(PARAM_ANY, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined) throw new ToolError('invalid-input', `locator parameter {${name}} has no value`, { parameter: name });
    return value;
  });

export const locatorParams = (spec: LocatorSpec): readonly string[] => {
  const texts = [spec.value, spec.name, spec.scope?.rowText].filter((t): t is string => typeof t === 'string');
  return [...new Set(texts.flatMap((t) => [...t.matchAll(PARAM_ANY)].map((m) => m[1]!)))];
};

/** `[attr="value"]`: a test id addressed by its attribute, independent of Playwright's testIdAttribute setting. */
const attributeSelector = (attribute: string, value: string): string => `[${attribute}=${JSON.stringify(value)}]`;

const defaultExact = (spec: LocatorSpec): boolean => spec.exact ?? (spec.strategy === 'role-name' || spec.strategy === 'text' || spec.strategy === 'label' || spec.strategy === 'placeholder');

const applyScope = (root: Root, scope: LocatorScope | undefined, params?: Readonly<Record<string, string>>, page?: Page): Root => {
  if (scope === undefined) return root;
  let current: Root = root;
  if (scope.landmark !== undefined) {
    current = scope.landmarkName !== undefined
      ? current.getByRole(scope.landmark as Parameters<Page['getByRole']>[0], { name: scope.landmarkName, exact: true })
      : current.getByRole(scope.landmark as Parameters<Page['getByRole']>[0]);
  }
  // Every block of that name: a block that occurs several times must be counted, never picked by position.
  if (scope.dataBlock !== undefined) {
    current = current.locator(`[data-block=${JSON.stringify(scope.dataBlock)}]`);
  }
  if (scope.rowText !== undefined) {
    const text = substituteParams(scope.rowText, params);
    current = scope.rowExact === true && page !== undefined
      ? current.getByRole('row').filter({ has: page.getByRole('cell', { name: text, exact: true }) })
      : current.getByRole('row').filter({ hasText: text });
  }
  return current;
};

/** Build the live Playwright locator for a spec. */
export const toPlaywrightLocator = (page: Page, spec: LocatorSpec, params?: Readonly<Record<string, string>>): Locator => {
  const root = applyScope(page, spec.scope, params, page);
  const exact = defaultExact(spec);
  const value = (): string => {
    if (spec.value === undefined || spec.value.length === 0) {
      throw new ToolError('invalid-input', `locator strategy ${spec.strategy} needs a value`);
    }
    return substituteParams(spec.value, params);
  };
  let locator: Locator;
  switch (spec.strategy) {
    case 'role-name': {
      if (spec.role === undefined) throw new ToolError('invalid-input', 'role-name locator needs a role');
      const role = spec.role as Parameters<Page['getByRole']>[0];
      locator = spec.name !== undefined && spec.name.length > 0
        ? root.getByRole(role, { name: substituteParams(spec.name, params), exact })
        : root.getByRole(role);
      break;
    }
    case 'label':
      locator = root.getByLabel(value(), { exact });
      break;
    case 'placeholder':
      locator = root.getByPlaceholder(value(), { exact });
      break;
    case 'text':
      locator = root.getByText(value(), { exact });
      break;
    case 'test-id':
      // Always the attribute itself: getByTestId follows the runner's testIdAttribute, which the customer's config may change.
      locator = root.locator(attributeSelector(spec.attribute ?? 'data-testid', value()));
      break;
    case 'css':
      locator = root.locator(value());
      break;
    case 'row-text':
      locator = root.getByRole((spec.role ?? 'row') as Parameters<Page['getByRole']>[0]).filter({ hasText: value() });
      break;
    default: {
      const never: never = spec.strategy;
      throw new ToolError('invalid-input', `unknown locator strategy ${String(never)}`);
    }
  }
  const visible = spec.visibleOnly === true ? locator.filter({ visible: true }) : locator;
  return spec.nth !== undefined ? visible.nth(spec.nth) : visible;
};

export interface RenderOptions {
  /** Expression for the root, e.g. "page" or "this.page". */
  readonly root?: string;
  /**
   * How `{param}` placeholders render: as identifiers (for a page-object
   * method taking the parameter) or substituted with literal values.
   */
  readonly params?: 'identifiers' | Readonly<Record<string, string>>;
}

const renderText = (text: string, params: RenderOptions['params']): string => {
  if (params === undefined || params === 'identifiers') {
    const whole = PARAM_REF.exec(text);
    if (whole !== null) return whole[1]!;
    if (PARAM_ANY.test(text)) {
      PARAM_ANY.lastIndex = 0;
      const template = text.replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${').replace(PARAM_ANY, (_m, name: string) => `\${${name}}`);
      return `\`${template}\``;
    }
    return quote(text);
  }
  return quote(substituteParams(text, params));
};

/**
 * The code for attributeSelector(attribute, value): a literal when the value
 * has no `{param}` (or params are substituted), else a template literal that
 * builds the same selector from the method's parameters at run time.
 */
const renderAttributeSelector = (attribute: string, value: string, params: RenderOptions['params']): string => {
  if (params !== undefined && params !== 'identifiers') return quote(attributeSelector(attribute, substituteParams(value, params)));
  PARAM_ANY.lastIndex = 0;
  if (!PARAM_ANY.test(value)) return quote(attributeSelector(attribute, value));
  PARAM_ANY.lastIndex = 0;
  const escapedAttribute = attribute.replace(/[`\\]/g, '\\$&').replace(/\$\{/g, '\\${');
  return `\`[${escapedAttribute}=\${JSON.stringify(${renderText(value, params)})}]\``;
};

const renderScope = (root: string, scope: LocatorScope | undefined, params: RenderOptions['params']): string => {
  if (scope === undefined) return root;
  let expr = root;
  if (scope.landmark !== undefined) {
    expr += scope.landmarkName !== undefined
      ? `.getByRole(${quote(scope.landmark)}, { name: ${quote(scope.landmarkName)}, exact: true })`
      : `.getByRole(${quote(scope.landmark)})`;
  }
  if (scope.dataBlock !== undefined) {
    expr += `.locator(${quote(`[data-block=${JSON.stringify(scope.dataBlock)}]`)})`;
  }
  if (scope.rowText !== undefined) {
    expr += scope.rowExact === true
      ? `.getByRole('row').filter({ has: ${root}.getByRole('cell', { name: ${renderText(scope.rowText, params)}, exact: true }) })`
      : `.getByRole('row').filter({ hasText: ${renderText(scope.rowText, params)} })`;
  }
  return expr;
};

/** The Playwright code expression for a spec, e.g. `page.getByRole('search').getByRole('textbox', { name: 'Search Policy' })`. */
export const renderLocator = (spec: LocatorSpec, options: RenderOptions = {}): string => {
  const params = options.params;
  const base = renderScope(options.root ?? 'page', spec.scope, params);
  const exact = defaultExact(spec);
  const exactOpt = (on: boolean): string => (on ? ', { exact: true }' : '');
  const v = (): string => renderText(spec.value ?? '', params);
  let expr: string;
  switch (spec.strategy) {
    case 'role-name':
      expr = spec.name !== undefined && spec.name.length > 0
        ? `${base}.getByRole(${quote(spec.role ?? 'generic')}, { name: ${renderText(spec.name, params)}${exact ? ', exact: true' : ''} })`
        : `${base}.getByRole(${quote(spec.role ?? 'generic')})`;
      break;
    case 'label':
      expr = `${base}.getByLabel(${v()}${exactOpt(exact)})`;
      break;
    case 'placeholder':
      expr = `${base}.getByPlaceholder(${v()}${exactOpt(exact)})`;
      break;
    case 'text':
      expr = `${base}.getByText(${v()}${exactOpt(exact)})`;
      break;
    case 'test-id':
      expr = `${base}.locator(${renderAttributeSelector(spec.attribute ?? 'data-testid', spec.value ?? '', params)})`;
      break;
    case 'css':
      expr = `${base}.locator(${v()})`;
      break;
    case 'row-text':
      expr = `${base}.getByRole(${quote(spec.role ?? 'row')}).filter({ hasText: ${v()} })`;
      break;
    default: {
      const never: never = spec.strategy;
      throw new ToolError('invalid-input', `unknown locator strategy ${String(never)}`);
    }
  }
  const visible = spec.visibleOnly === true ? `${expr}.filter({ visible: true })` : expr;
  return spec.nth !== undefined ? `${visible}.nth(${spec.nth})` : visible;
};

/** A spec with its derived expression filled in (for outputs). */
export const withExpression = (spec: LocatorSpec): LocatorSpec => ({ ...spec, expression: renderLocator(spec) });

/** Stable identity for comparing two specs (expression ignored). */
export const locatorKey = (spec: LocatorSpec): string => renderLocator({ ...spec, expression: undefined });
