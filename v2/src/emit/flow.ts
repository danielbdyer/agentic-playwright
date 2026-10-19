/**
 * flows/<name>.ts: a recorded deterministic flow (log in, seed a record, reach
 * a screen) as a plain async function over the same page objects the specs
 * use. Secret parameters are never written; the spec passes them from the
 * environment through the requireEnv helper exported here, so the spec still
 * imports nothing from Tesseract.
 */
import type { Facet } from '../contract/schemas.js';
import { ToolError } from '../core/errors.js';
import { HASH_PLACEHOLDER, stampHash } from './keep.js';
import type { MemberInfo } from './naming.js';
import {
  RESERVED_WORDS,
  assignIdentifiers,
  fileStem,
  flowFilePath,
  flowFunctionName,
  flowParamIdentifiers,
  flowParamsTypeName,
  importSpecifier,
  memberTable,
  pageClassName,
  pageObjectPath,
} from './naming.js';
import type { EmitLayout, EmitRoute, FlowRecording, FlowRecordingStep, RenderedFlow } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';
import { commentText, indent, quote, separated, toFileText } from './writer.js';

const unique = <T>(items: readonly T[]): readonly T[] => [...new Set(items)];

const invalid = (message: string, detail?: Record<string, unknown>): ToolError => new ToolError('invalid-input', message, detail);

const toMap = <V>(source: ReadonlyMap<string, V> | Readonly<Record<string, V>>): ReadonlyMap<string, V> =>
  source instanceof Map ? source : new Map(Object.entries(source as Readonly<Record<string, V>>));

export interface FlowOptions {
  readonly layout?: EmitLayout;
}

interface Resolved {
  /** The statement, given the page-object variable for each screen. */
  readonly statement: (po: (screen: string) => string) => string;
  readonly screen: string | null;
  readonly facetId: string | null;
  readonly usesPage: boolean;
  readonly usesParams: boolean;
}

/**
 * Render flows/<name>.ts from a recording.
 *
 * `facetsById` must hold every non-retired facet of each screen the flow
 * touches, in catalog order (a Map, or a record in insertion order), so member
 * names match the page objects. `routesByScreen` gives goto() targets; a
 * navigate step on a screen without a route falls back to page.goto(url).
 */
export const renderFlow = (
  recording: FlowRecording,
  facetsById: ReadonlyMap<string, Facet> | Readonly<Record<string, Facet>>,
  routesByScreen: ReadonlyMap<string, EmitRoute | null> | Readonly<Record<string, EmitRoute | null>>,
  options: FlowOptions = {},
): RenderedFlow => {
  const layout = options.layout ?? DEFAULT_LAYOUT;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(recording.name)) throw invalid(`flow name must be kebab-case: ${recording.name}`);
  const filePath = flowFilePath(recording.name, layout);
  const facets = toMap(facetsById);
  const routes = toMap(routesByScreen);
  const tables = new Map(
    unique([...facets.values()].map((facet) => facet.screen)).map((screen) => [
      screen,
      memberTable([...facets.values()].filter((facet) => facet.screen === screen)),
    ]),
  );
  const paramIds = flowParamIdentifiers(recording.params);
  const paramFor = (name: string, where: string): string => {
    const id = paramIds.get(name);
    if (id === undefined) throw invalid(`${where}: flow ${recording.name} has no parameter ${name}`);
    return `params.${id}`;
  };

  const indexes = recording.steps.map((step) => step.index);
  if (indexes.some((index, i) => indexes.indexOf(index) !== i)) throw invalid(`flow ${recording.name} has duplicate step indexes`);
  const steps = [...recording.steps].sort((a, b) => a.index - b.index);

  const valueOf = (step: FlowRecordingStep, where: string): { readonly text: string; readonly usesParams: boolean } => {
    if (step.value === undefined) throw invalid(`${where}: ${step.action} needs a value`);
    return 'literal' in step.value
      ? { text: quote(step.value.literal), usesParams: false }
      : { text: paramFor(step.value.param, where), usesParams: true };
  };

  const resolveStep = (step: FlowRecordingStep): Resolved => {
    const where = `flow ${recording.name} step ${step.index}`;
    const facet = step.facetId === undefined ? undefined : facets.get(step.facetId);
    if (step.facetId !== undefined && facet === undefined) {
      throw new ToolError('not-found', `${where}: facet ${step.facetId} was not passed to renderFlow`, { facetId: step.facetId });
    }
    if (facet?.status === 'retired') throw new ToolError('not-found', `${where}: facet ${facet.id} is retired; record the flow again`, { facetId: facet.id });
    const member: MemberInfo | undefined = facet === undefined ? undefined : tables.get(facet.screen)?.get(facet.id);

    if (step.action === 'navigate' && (facet === undefined || facet.kind === 'route')) {
      const screen = facet?.screen ?? step.screen;
      const route = routes.get(screen) ?? null;
      return route !== null
        ? { statement: (po) => `await ${po(screen)}.goto();`, screen, facetId: facet?.id ?? null, usesPage: false, usesParams: false }
        : { statement: () => `await page.goto(${quote(step.url)});`, screen: null, facetId: null, usesPage: true, usesParams: false };
    }
    if (step.action === 'press' && facet === undefined) {
      const key = step.value !== undefined && 'literal' in step.value ? step.value.literal : undefined;
      if (key === undefined) throw invalid(`${where}: press needs a literal key`);
      return { statement: () => `await page.keyboard.press(${quote(key)});`, screen: null, facetId: null, usesPage: true, usesParams: false };
    }
    if (facet === undefined || member === undefined) {
      throw invalid(`${where}: ${step.action} needs a facet with a locator`);
    }
    const rowArg = member.params.length === 0 ? null : step.value !== undefined && ['click', 'hover', 'check', 'uncheck'].includes(step.action) ? valueOf(step, where) : null;
    if (member.params.length > 0 && rowArg === null) throw invalid(`${where}: facet ${facet.id} selects a row; give the step a value`);
    const access = (po: (screen: string) => string): string => `${po(facet.screen)}.${member.name}${rowArg === null ? '' : `(${rowArg.text})`}`;
    const base = { screen: facet.screen, facetId: facet.id, usesPage: false };
    switch (step.action) {
      case 'navigate':
      case 'click':
        return { ...base, statement: (po) => `await ${access(po)}.click();`, usesParams: rowArg?.usesParams ?? false };
      case 'hover':
      case 'check':
      case 'uncheck':
        return { ...base, statement: (po) => `await ${access(po)}.${step.action}();`, usesParams: rowArg?.usesParams ?? false };
      case 'fill': {
        const value = valueOf(step, where);
        return { ...base, statement: (po) => `await ${access(po)}.fill(${value.text});`, usesParams: value.usesParams };
      }
      case 'select': {
        const value = valueOf(step, where);
        if (member.selectStyle === 'native') {
          return { ...base, statement: (po) => `await ${access(po)}.selectOption(${value.text});`, usesParams: value.usesParams };
        }
        const helper = member.selectHelper;
        if (helper !== null && member.params.length === 0) {
          return { ...base, statement: (po) => `await ${po(facet.screen)}.${helper}(${value.text});`, usesParams: value.usesParams };
        }
        throw invalid(`${where}: facet ${facet.id} is neither a native <select> nor a combobox`);
      }
      case 'press': {
        const key = step.value !== undefined && 'literal' in step.value ? step.value.literal : undefined;
        if (key === undefined) throw invalid(`${where}: press needs a literal key`);
        return { ...base, statement: (po) => `await ${access(po)}.press(${quote(key)});`, usesParams: false };
      }
      default:
        throw invalid(`${where}: unknown action ${step.action}`);
    }
  };

  const resolved = steps.map((step) => ({ step, ...resolveStep(step) }));
  const screens = unique(resolved.flatMap((r) => (r.screen === null ? [] : [r.screen])));
  const fn = flowFunctionName(recording.name);
  const typeName = flowParamsTypeName(recording.name);
  const poVars = assignIdentifiers(screens, new Set([...RESERVED_WORDS, 'page', 'params', 'requireEnv', fn, typeName, ...screens.map(pageClassName)]), 'Page', 'Page');
  const po = (screen: string): string => poVars.get(screen)!;

  const usesPage = screens.length > 0 || resolved.some((r) => r.usesPage);
  const usesParams = resolved.some((r) => r.usesParams);
  const hasParams = recording.params.length > 0;
  const paramsType = hasParams
    ? [`export interface ${typeName} {`, ...recording.params.map((p) => `  readonly ${paramIds.get(p.name)!}: string;`), '}']
    : [`export type ${typeName} = Record<string, never>;`];
  const requireEnv = hasParams
    ? [
        '/** Reads a flow parameter from the environment, so secrets never live in the repository. */',
        'export function requireEnv(name: string): string {',
        '  const value = process.env[name];',
        "  if (value === undefined || value === '') {",
        '    throw new Error(`Set the environment variable ${name} to run this flow.`);',
        '  }',
        '  return value;',
        '}',
      ]
    : [];
  const paramSummary = recording.params.length === 0
    ? 'no parameters'
    : `parameters ${recording.params.map((p) => `${p.name}${p.secret ? ' (secret)' : ''}`).join(', ')}`;
  const body = [
    ...screens.map((screen) => `const ${poVars.get(screen)!} = new ${pageClassName(screen)}(page);`),
    ...resolved.flatMap((r) => [
      `// step ${r.step.index} — ${commentText(`${r.step.action} ${r.facetId ?? r.step.url}`)}`,
      r.statement(po),
    ]),
  ];
  const fnBlock = [
    `/** Flow ${commentText(recording.name)}, recorded with Tesseract: ${steps.length} step${steps.length === 1 ? '' : 's'}, ${commentText(paramSummary)}. */`,
    `export async function ${fn}(${usesPage ? 'page' : '_page'}: Page, ${usesParams ? 'params' : '_params'}: ${typeName}): Promise<void> {`,
    ...indent(1, body),
    '}',
  ];
  const lines = [
    `// Generated by Tesseract from .tesseract/flows/${fileStem(recording.name)}.json — record the flow again, or edit facets in .tesseract/catalog/;`,
    '// regions marked tesseract:keep survive regeneration.',
    HASH_PLACEHOLDER,
    "import type { Page } from '@playwright/test';",
    ...screens.map((screen) => `import { ${pageClassName(screen)} } from ${quote(importSpecifier(filePath, pageObjectPath(screen, layout)))};`),
    '',
    ...separated([paramsType, requireEnv, fnBlock]),
  ];
  return {
    path: filePath,
    text: stampHash(toFileText(lines)),
    name: recording.name,
    functionName: fn,
    screens,
    facetsUsed: unique(resolved.flatMap((r) => (r.facetId === null ? [] : [r.facetId]))),
  };
};

