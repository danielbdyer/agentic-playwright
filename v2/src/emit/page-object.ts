/**
 * pages/<screen>.page.ts: one class per screen, one member per facet. The page
 * object is the only place locators live; each member's doc comment carries
 * the facet id, why the element is named the way it is, and the fallback
 * locator memory verified, so a reviewer can judge it without opening the
 * catalog.
 */
import type { Facet, FacetLocator } from '../contract/schemas.js';
import { ToolError } from '../core/errors.js';
import { escapeRegExp, pascalCase } from '../core/text.js';
import { renderLocator } from '../locator/locator.js';
import { HASH_PLACEHOLDER, stampHash } from './keep.js';
import { INITIAL_LEX_STATE, lexLine } from './lex.js';
import type { MemberInfo } from './naming.js';
import { fileStem, importSpecifier, isMemberFacet, memberTable, overridesPath, pageClassName, pageObjectPath } from './naming.js';
import type { EmitLayout, EmitRoute, RenderedPageObject } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';
import { docText, indent, quote, separated, toFileText } from './writer.js';

export const overridesClassName = (screen: string): string => `${pascalCase(screen)}PageOverrides`;

/**
 * Member names an overrides file defines: identifiers declared at class-body
 * level (getters, methods, fields), constructor excluded. Bracket depth is
 * tracked so statements inside method bodies are never mistaken for members.
 */
export const overriddenMembers = (overridesText: string): ReadonlySet<string> => {
  const memberPattern =
    /^\s*(?:(?:public|protected|private|readonly|static|async|override|declare|abstract|accessor)\s+)*(?:(?:get|set)\s+)?\*?\s*#?([A-Za-z_$][\w$]*)\s*(?:[(:=<;?!]|$)/;
  const lines = overridesText.replace(/\r\n?/g, '\n').split('\n');
  return lines.reduce<{ readonly names: ReadonlySet<string>; readonly depth: number; readonly state: typeof INITIAL_LEX_STATE }>(
    (acc, line) => {
      const match = acc.depth === 1 && !acc.state.inBlockComment ? memberPattern.exec(line) : null;
      const name = match?.[1];
      const lexed = lexLine(line, acc.state);
      const names = name !== undefined && name !== 'constructor' && !/^\s*\/[/*]/.test(line) ? new Set([...acc.names, name]) : acc.names;
      return { names, depth: acc.depth + lexed.depthDelta, state: lexed.state };
    },
    { names: new Set(), depth: 0, state: INITIAL_LEX_STATE },
  ).names;
};

const describeNaming = (facet: Facet, member: MemberInfo): string => {
  const role = facet.role ?? member.locator.role ?? facet.kind;
  const byText = member.locator.strategy === 'row-text' || member.locator.scope?.rowText !== undefined;
  const naming = member.params.length > 0
    ? `${role} selected by ${byText ? 'the text it contains' : 'its name'} (${member.params.join(', ')})`
    : facet.namingSource === undefined ? role : facet.namingSource === 'none' ? `unnamed ${role}` : `${facet.namingSource}-named ${role}`;
  const landmark = facet.scope?.landmark ?? member.locator.scope?.landmark;
  return landmark === undefined ? naming : `${naming} in the ${landmark} landmark`;
};

const fallbackText = (fallback: FacetLocator | undefined): string => {
  if (fallback === undefined) return '';
  const expression = (() => {
    try {
      return renderLocator(fallback, { root: 'this.page', params: 'identifiers' });
    } catch {
      return `${fallback.strategy} ${fallback.value ?? fallback.name ?? ''}`.trim();
    }
  })();
  return `; fallback: ${expression} (${fallback.health ?? 'not yet run'})`;
};

const facetDoc = (facet: Facet, member: MemberInfo): readonly string[] => {
  const summary = `facet ${facet.id} — ${describeNaming(facet, member)}${fallbackText(facet.locators[1])}`;
  if (facet.status !== 'stale') return [`/** ${docText(summary)} */`];
  return [
    '/**',
    ` * ${docText(summary)}`,
    ` * @deprecated stale: this locator stopped resolving reliably; re-observe the ${docText(facet.screen)} screen to repair the facet.`,
    ' */',
  ];
};

const memberLines = (facet: Facet, member: MemberInfo): readonly string[] => {
  const expression = renderLocator(member.locator, { root: 'this.page', params: 'identifiers' });
  const signature = member.params.length === 0
    ? `get ${member.name}(): Locator {`
    : `${member.name}(${member.params.map((p) => `${p}: string`).join(', ')}): Locator {`;
  return [...facetDoc(facet, member), signature, `  return ${expression};`, '}'];
};

const helperLines = (facet: Facet, member: MemberInfo, helper: string): readonly string[] => {
  const params = [...member.params.map((p) => `${p}: string`), 'value: string'];
  const target = member.params.length === 0 ? `this.${member.name}` : `this.${member.name}(${member.params.join(', ')})`;
  return [
    `/** select ${facet.id} — custom combobox: opens it, then picks the option by its accessible name */`,
    `async ${helper}(${params.join(', ')}): Promise<void> {`,
    `  await ${target}.click();`,
    `  await this.page.getByRole('option', { name: value, exact: true }).click();`,
    '}',
  ];
};

/** goto() target: relative routes lose any leading slash so a baseURL with an app prefix (https://host/App/) is kept. */
export const routeUrl = (route: EmitRoute): string => (/^[a-z][a-z0-9+.-]*:/i.test(route.url) ? route.url : route.url.replace(/^\/+/, ''));

const waitsForMain = (route: EmitRoute, facets: readonly Facet[]): boolean =>
  (route.landmarks ?? []).includes('main') ||
  facets.some((facet) => isMemberFacet(facet) && (facet.scope?.landmark ?? facet.locators[0]?.scope?.landmark) === 'main');

const gotoLines = (screen: string, route: EmitRoute, facets: readonly Facet[]): readonly string[] => {
  const url = routeUrl(route);
  const main = waitsForMain(route, facets);
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
  const where = absolute ? url : url === '' ? 'the baseURL' : `${url} (relative to baseURL)`;
  return [
    `/** route ${screen} — opens ${docText(where)}${main ? ' and waits for the main landmark' : ''} */`,
    'async goto(): Promise<void> {',
    `  await this.page.goto(${quote(url)});`,
    ...(main ? ["  await this.page.getByRole('main').waitFor();"] : []),
    '}',
  ];
};

export interface PageObjectOptions {
  readonly layout?: EmitLayout;
}

/**
 * Render pages/<screen>.page.ts.
 *
 * `facets` is the screen's catalog in order (retired facets and route facets
 * produce no member; route facets are what goto() stands for). `route` gives
 * goto() its URL; without one the page object has no goto(). When
 * `overridesText` (the contents of <screen>.page.overrides.ts) is given, the
 * class extends <Pascal>PageOverrides, inherits `page` and the constructor from
 * it, and leaves out every member the overrides define.
 */
export const renderPageObject = (
  screen: string,
  route: EmitRoute | null,
  facets: readonly Facet[],
  overridesText: string | null,
  options: PageObjectOptions = {},
): RenderedPageObject => {
  const layout = options.layout ?? DEFAULT_LAYOUT;
  const filePath = pageObjectPath(screen, layout);
  const className = pageClassName(screen);
  const foreign = facets.filter((facet) => facet.screen !== screen);
  if (foreign.length > 0) {
    throw new ToolError('invalid-input', `facets passed for screen ${screen} belong to another screen: ${foreign.map((f) => f.id).join(', ')}`);
  }
  const table = memberTable(facets);
  const overrideClass = overridesClassName(screen);
  if (overridesText !== null && !new RegExp(`export\\s+(?:abstract\\s+)?class\\s+${escapeRegExp(overrideClass)}\\b`).test(overridesText)) {
    throw new ToolError('conflict', `${overridesPath(screen, layout)} must export class ${overrideClass} for ${className} to extend it`, {
      path: overridesPath(screen, layout),
    });
  }
  const overridden = overridesText === null ? new Set<string>() : overriddenMembers(overridesText);
  const overridesFile = `${fileStem(screen)}.page.overrides.ts`;
  const overriddenNote = (name: string, what: string): readonly string[] => [`// ${name} (${what}) is defined in ${overridesFile}`];

  const memberBlocks = facets.flatMap((facet): readonly (readonly string[])[] => {
    if (facet.status === 'retired' || facet.kind === 'route') return [];
    const member = table.get(facet.id);
    if (member === undefined) return [[`// facet ${facet.id} has no locator yet; observe the ${screen} screen to give it one`]];
    const main = overridden.has(member.name) ? overriddenNote(member.name, `facet ${facet.id}`) : memberLines(facet, member);
    const helper = member.selectHelper === null
      ? []
      : overridden.has(member.selectHelper)
        ? [overriddenNote(member.selectHelper, `select helper for ${facet.id}`)]
        : [helperLines(facet, member, member.selectHelper)];
    return [main, ...helper];
  });
  const gotoBlock = route === null ? [] : overridden.has('goto') ? [overriddenNote('goto', `route ${screen}`)] : [gotoLines(screen, route, facets)];
  const usesLocator = memberBlocks.some((block) => block.some((line) => line.endsWith('): Locator {')));
  const ownsPage = overridesText === null;
  const typeImports = [...(usesLocator ? ['Locator'] : []), ...(ownsPage ? ['Page'] : [])];
  const constructorBlock = ownsPage ? [['readonly page: Page;'], ['constructor(page: Page) {', '  this.page = page;', '}']] : [];
  const classBody = separated([...constructorBlock, ...gotoBlock, ...memberBlocks]);

  const lines = [
    `// Generated by Tesseract from .tesseract/catalog/${fileStem(screen)}.yaml — edit facets there, or members in ${overridesFile};`,
    '// regions marked tesseract:keep survive regeneration.',
    HASH_PLACEHOLDER,
    ...(typeImports.length > 0 ? [`import type { ${typeImports.join(', ')} } from '@playwright/test';`] : []),
    ...(ownsPage ? [] : [`import { ${overrideClass} } from ${quote(importSpecifier(filePath, overridesPath(screen, layout)))};`]),
    '',
    `export class ${className}${ownsPage ? '' : ` extends ${overrideClass}`} {`,
    ...indent(1, classBody),
    '}',
  ];
  const members = Object.fromEntries([...table.values()].map((member) => [member.facetId, member.name]));
  return { path: filePath, text: stampHash(toFileText(lines)), screen, className, members };
};

/** A starting point for <screen>.page.overrides.ts (written only when a human asks for one; never regenerated). */
export const renderOverridesScaffold = (screen: string): string =>
  toFileText([
    `// Hand-written overrides for ${pageClassName(screen)}. Tesseract never rewrites this file: a member defined here`,
    '// replaces the generated member of the same name the next time the page object is generated.',
    "import type { Page } from '@playwright/test';",
    '',
    `export class ${overridesClassName(screen)} {`,
    '  readonly page: Page;',
    '',
    '  constructor(page: Page) {',
    '    this.page = page;',
    '  }',
    '',
    "  // Example (add Locator to the type import):",
    '  // get searchButton(): Locator {',
    "  //   return this.page.getByRole('button', { name: 'Search', exact: true });",
    '  // }',
    '}',
  ]);
