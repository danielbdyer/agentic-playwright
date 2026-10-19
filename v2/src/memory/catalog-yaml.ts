/**
 * The catalog file format, `.tesseract/catalog/<screen>.yaml`. A reviewer
 * reads it in a pull request, so it is block style with a fixed key order,
 * facets sorted by id, and locators as block maps (a flow map would turn
 * `note: structural id, fragile` into two keys). Writing is a pure function
 * of the catalog, so load-then-save is byte-identical.
 *
 * Reading is strict about structure and lenient about scalars: a BOM is
 * stripped, duplicate keys are errors, a bare `testCase: 10001` is read as
 * the string it is, unknown keys become warnings, and any failure is a
 * ToolError('malformed-response') naming the file and line.
 */
import YAML, { LineCounter, isNode, type Document } from 'yaml';
import { z } from 'zod';
import { ToolError } from '../core/errors.js';
import {
  AffordanceSchema,
  FacetKindSchema,
  FacetSchema,
  FacetStatusSchema,
  LandmarkRoleSchema,
  LocatorStrategySchema,
  NamingSourceSchema,
  ProvenanceSchema,
  VariantSchema,
  type Facet,
  type FacetLocator,
} from '../contract/schemas.js';
import { isSlug, parseFacetId } from './ids.js';
import type { CatalogRoute, RouteSummary, ScreenCatalog } from './types.js';

// ─── Stored shapes ─────────────────────────────────────────────────────────

const LocatorScopeStored = z.object({
  landmark: LandmarkRoleSchema.optional(),
  landmarkName: z.string().optional(),
  dataBlock: z.string().optional(),
  rowText: z.string().optional(),
});

const LocatorStored = z.object({
  strategy: LocatorStrategySchema,
  role: z.string().optional(),
  name: z.string().optional(),
  exact: z.boolean().optional(),
  value: z.string().optional(),
  attribute: z.string().optional(),
  scope: LocatorScopeStored.optional(),
  nth: z.number().int().min(0).optional(),
  // Projections: accepted on load and ignored (health is rewritten from evidence on save).
  expression: z.string().optional(),
  health: z.string().optional(),
  note: z.string().optional(),
});

const FacetStored = z.object({
  id: z.string(),
  screen: z.string().optional(),
  kind: FacetKindSchema,
  displayName: z.string(),
  aliases: z.array(z.string()).default([]),
  role: z.string().optional(),
  tag: z.string().optional(),
  namingSource: NamingSourceSchema.optional(),
  affordance: AffordanceSchema.optional(),
  scope: z.object({ landmark: LandmarkRoleSchema.optional(), dataBlock: z.string().optional() }).optional(),
  locators: z.array(LocatorStored).default([]),
  parameter: z.string().optional(),
  member: z.string().optional(),
  status: FacetStatusSchema,
  provenance: ProvenanceSchema,
  evidence: z.string().optional(),
});

const SummaryStored = z.object({
  landmarks: z.array(z.string()).default([]),
  interactiveRoles: z.record(z.string(), z.number().int().min(0)).default({}),
  dataBlocks: z.number().int().min(0).default(0),
});

const RouteStored = z.object({
  url: z.string(),
  variant: VariantSchema.optional(),
  title: z.string().optional(),
  fingerprint: z.string().optional(),
  summary: SummaryStored.optional(),
});

const CatalogStored = z.object({
  screen: z.string(),
  route: RouteStored.optional(),
  facets: z.array(FacetStored).default([]),
});

/** Keys each level knows; anything else is reported, not silently dropped. */
const KNOWN_KEYS = {
  catalog: ['screen', 'route', 'facets'],
  route: ['url', 'variant', 'title', 'fingerprint', 'summary'],
  summary: ['landmarks', 'interactiveRoles', 'dataBlocks'],
  facet: ['id', 'screen', 'kind', 'displayName', 'aliases', 'role', 'tag', 'namingSource', 'affordance', 'scope', 'locators', 'parameter', 'member', 'status', 'provenance', 'evidence'],
  facetScope: ['landmark', 'dataBlock'],
  locator: ['strategy', 'role', 'name', 'exact', 'value', 'attribute', 'scope', 'nth', 'expression', 'health', 'note'],
  locatorScope: ['landmark', 'landmarkName', 'dataBlock', 'rowText'],
  provenance: ['mintedAt', 'instrument', 'session', 'model', 'testCase', 'snapshotId', 'candidateRef', 'flow'],
} as const;

// ─── Reading ───────────────────────────────────────────────────────────────

export interface ParsedCatalog {
  readonly catalog: ScreenCatalog;
  readonly warnings: readonly string[];
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Keys whose values are not strings; every other scalar in the file is read as a string. */
const NON_STRING_KEYS = new Set(['exact', 'nth', 'dataBlocks']);

/**
 * Scalars to strings (YAML reads `10001` as a number and `yes` stays a
 * string, but a human may type `testCase: 10001` or `name: 2024`), and null
 * (`role:` with nothing after it) to absent.
 */
const normalizeScalars = (value: unknown, key: string | undefined, insideCounts: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeScalars(item, undefined, false));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, normalizeScalars(v, k, key === 'interactiveRoles')]),
    );
  }
  if (insideCounts || (key !== undefined && NON_STRING_KEYS.has(key))) return value;
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : value;
};

const unknownKeys = (raw: unknown, known: readonly string[], where: string): string[] =>
  isRecord(raw) ? Object.keys(raw).filter((key) => !known.includes(key)).map((key) => `${where}.${key}`) : [];

const collectUnknownKeys = (raw: Raw): string[] => {
  const facets = Array.isArray(raw.facets) ? raw.facets : [];
  const route = raw.route;
  return [
    ...unknownKeys(raw, KNOWN_KEYS.catalog, '(root)').map((key) => key.replace('(root).', '')),
    ...unknownKeys(route, KNOWN_KEYS.route, 'route'),
    ...(isRecord(route) ? unknownKeys(route.summary, KNOWN_KEYS.summary, 'route.summary') : []),
    ...facets.flatMap((facet: unknown, i: number) => {
      if (!isRecord(facet)) return [];
      const where = `facets[${i}]`;
      const locators = Array.isArray(facet.locators) ? facet.locators : [];
      return [
        ...unknownKeys(facet, KNOWN_KEYS.facet, where),
        ...unknownKeys(facet.scope, KNOWN_KEYS.facetScope, `${where}.scope`),
        ...unknownKeys(facet.provenance, KNOWN_KEYS.provenance, `${where}.provenance`),
        ...locators.flatMap((locator: unknown, j: number) => [
          ...unknownKeys(locator, KNOWN_KEYS.locator, `${where}.locators[${j}]`),
          ...(isRecord(locator) ? unknownKeys(locator.scope, KNOWN_KEYS.locatorScope, `${where}.locators[${j}].scope`) : []),
        ]),
      ];
    }),
  ];
};

/** 1-based line of the deepest existing node on a path, for error messages. */
const lineOf = (doc: Document, counter: LineCounter, path: readonly PropertyKey[]): number | undefined => {
  for (let depth = path.length; depth >= 0; depth -= 1) {
    const node = depth === 0 ? doc.contents : doc.getIn(path.slice(0, depth) as unknown[], true);
    if (isNode(node) && node.range !== undefined && node.range !== null) return counter.linePos(node.range[0]).line;
  }
  return undefined;
};

const malformed = (file: string, line: number | undefined, message: string): ToolError =>
  new ToolError('malformed-response', `${file}${line !== undefined ? `:${line}` : ''}: ${message}`, { file, ...(line !== undefined ? { line } : {}) });

const pathText = (path: readonly PropertyKey[]): string =>
  path.map((part, i) => (typeof part === 'number' ? `[${part}]` : `${i === 0 ? '' : '.'}${String(part)}`)).join('') || '(root)';

const stripLocatorProjections = (locator: z.infer<typeof LocatorStored>): FacetLocator => {
  const { expression: _expression, health: _health, ...rest } = locator;
  return rest;
};

/**
 * Parse catalog text. `file` is used in messages only; `screen` is the screen
 * the file name says it holds, and the file must agree.
 */
export const parseCatalogYaml = (text: string, file: string, screen: string): ParsedCatalog => {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const counter = new LineCounter();
  const doc = YAML.parseDocument(source, { uniqueKeys: true, prettyErrors: true, lineCounter: counter });
  const first = doc.errors[0];
  if (first !== undefined) {
    throw malformed(file, first.linePos?.[0]?.line, first.message.split('\n')[0] ?? first.message);
  }
  const raw: unknown = doc.toJS({ maxAliasCount: 50 });
  if (raw === null || raw === undefined) return { catalog: { screen, facets: [] }, warnings: [`${file} is empty`] };
  if (!isRecord(raw)) throw malformed(file, 1, 'expected a mapping with screen, route, and facets');

  const parsed = CatalogStored.safeParse(normalizeScalars(raw, undefined, false));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path ?? [];
    throw malformed(file, lineOf(doc, counter, path), `${pathText(path)}: ${issue?.message ?? 'invalid catalog'}`);
  }
  const data = parsed.data;
  if (data.screen !== screen) {
    throw malformed(file, lineOf(doc, counter, ['screen']), `screen is "${data.screen}" but the file is named for "${screen}"`);
  }

  const warnings = collectUnknownKeys(raw).map((key) => `${file}: unknown key ${key} is ignored and will be dropped on the next save`);
  const seen = new Set<string>();
  const facets = data.facets.map((stored, i): Facet => {
    const where = ['facets', i];
    const id = parseFacetId(stored.id);
    if (id === null || id.screen !== screen || !isSlug(id.local)) {
      throw malformed(file, lineOf(doc, counter, [...where, 'id']), `facet id "${stored.id}" must be "${screen}:<kebab-case-name>"`);
    }
    if (seen.has(stored.id)) throw malformed(file, lineOf(doc, counter, [...where, 'id']), `duplicate facet id "${stored.id}"`);
    seen.add(stored.id);
    if (stored.screen !== undefined && stored.screen !== screen) {
      warnings.push(`${file}: facet ${stored.id} says screen "${stored.screen}"; the file's screen "${screen}" wins`);
    }
    const { screen: _screen, locators, ...rest } = stored;
    const facet: Facet = { ...rest, screen, locators: locators.map(stripLocatorProjections) };
    // Belt and braces: whatever this file accepts must be a contract Facet.
    const checked = FacetSchema.safeParse(facet);
    if (!checked.success) throw malformed(file, lineOf(doc, counter, where), `facet ${stored.id}: ${checked.error.issues[0]?.message ?? 'invalid'}`);
    return facet;
  });

  const route: CatalogRoute | undefined = data.route;
  return {
    catalog: { screen, ...(route !== undefined ? { route } : {}), facets: [...facets].sort(byId) },
    warnings,
  };
};

const byId = (a: Facet, b: Facet): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ─── Writing ───────────────────────────────────────────────────────────────

/** Build an object with keys in the given order, dropping undefined values. */
const ordered = (entries: ReadonlyArray<readonly [string, unknown]>): Raw =>
  Object.fromEntries(entries.filter(([, value]) => value !== undefined));

const sortedRecord = (record: Readonly<Record<string, number>>): Raw =>
  Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const orUndefined = <T extends object>(value: T | undefined): T | undefined =>
  value !== undefined && Object.values(value).some((v) => v !== undefined) ? value : undefined;

const summaryOut = (summary: RouteSummary | undefined): Raw | undefined =>
  summary === undefined
    ? undefined
    : ordered([
        ['landmarks', [...summary.landmarks]],
        ['interactiveRoles', sortedRecord(summary.interactiveRoles)],
        ['dataBlocks', summary.dataBlocks],
      ]);

const routeOut = (route: CatalogRoute | undefined): Raw | undefined =>
  route === undefined
    ? undefined
    : ordered([
        ['url', route.url],
        ['variant', route.variant],
        ['title', route.title],
        ['fingerprint', route.fingerprint],
        ['summary', summaryOut(route.summary)],
      ]);

const locatorOut = (locator: FacetLocator): Raw => {
  const scope = orUndefined(locator.scope);
  return ordered([
    ['strategy', locator.strategy],
    ['role', locator.role],
    ['name', locator.name],
    ['exact', locator.exact],
    ['value', locator.value],
    ['attribute', locator.attribute],
    [
      'scope',
      scope === undefined
        ? undefined
        : ordered([
            ['landmark', scope.landmark],
            ['landmarkName', scope.landmarkName],
            ['dataBlock', scope.dataBlock],
            ['rowText', scope.rowText],
          ]),
    ],
    ['nth', locator.nth],
    ['health', locator.health],
    ['note', locator.note],
  ]);
};

const facetOut = (facet: Facet): Raw => {
  const scope = orUndefined(facet.scope);
  const p = facet.provenance;
  return ordered([
    ['id', facet.id],
    ['kind', facet.kind],
    ['displayName', facet.displayName],
    ['aliases', [...facet.aliases]],
    ['role', facet.role],
    ['tag', facet.tag],
    ['namingSource', facet.namingSource],
    ['affordance', facet.affordance],
    ['scope', scope === undefined ? undefined : ordered([['landmark', scope.landmark], ['dataBlock', scope.dataBlock]])],
    ['locators', facet.locators.map(locatorOut)],
    ['parameter', facet.parameter],
    ['member', facet.member],
    ['status', facet.status],
    [
      'provenance',
      ordered([
        ['mintedAt', p.mintedAt],
        ['instrument', p.instrument],
        ['session', p.session],
        ['model', p.model],
        ['testCase', p.testCase],
        ['snapshotId', p.snapshotId],
        ['candidateRef', p.candidateRef],
        ['flow', p.flow],
      ]),
    ],
    ['evidence', facet.evidence],
  ]);
};

const header = (screen: string): string =>
  `# Facet catalog for screen "${screen}", maintained by tesseract-qa.\n` +
  `# Edit status by hand to promote, demote, or retire a facet; health is derived from .tesseract/evidence/${screen}.jsonl.\n`;

/**
 * Serialize a catalog. The caller passes facets with their `health` strings
 * already projected and locators already ordered (see projectCatalog); this
 * function only fixes the layout.
 */
export const serializeCatalog = (catalog: ScreenCatalog): string => {
  const body = ordered([
    ['screen', catalog.screen],
    ['route', routeOut(catalog.route)],
    ['facets', [...catalog.facets].sort(byId).map(facetOut)],
  ]);
  return header(catalog.screen) + YAML.stringify(body, { lineWidth: 0, minContentWidth: 0, indent: 2 });
};
