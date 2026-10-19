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
 *
 * The stored shapes are the contract's schemas (FacetSchema,
 * FacetLocatorSchema, ScreenRouteSchema, ProvenanceSchema), and the known
 * keys and non-string fields are read off them, so an additive contract
 * change (a new optional locator field) round-trips without touching this
 * file: known fields keep their fixed order, new ones follow alphabetically.
 */
import YAML, { LineCounter, isNode, type Document } from 'yaml';
import { z } from 'zod';
import { ToolError } from '../core/errors.js';
import {
  FacetLocatorSchema,
  FacetSchema,
  LocatorScopeSchema,
  ProvenanceSchema,
  ScreenRouteSchema,
  type Facet,
  type FacetLocator,
} from '../contract/schemas.js';
import { isSlug, parseFacetId } from './ids.js';
import type { CatalogRoute, RouteSummary, ScreenCatalog } from './types.js';

// ─── Stored shapes (the contract's, plus the route summary) ────────────────

const SummaryStored = z.object({
  landmarks: z.array(z.string()).default([]),
  interactiveRoles: z.record(z.string(), z.number().int().min(0)).default({}),
  dataBlocks: z.number().int().min(0).default(0),
});

const RouteStored = ScreenRouteSchema.extend({ summary: SummaryStored.optional() });

const FacetStored = FacetSchema.extend({
  // The file's screen is the facets' screen; a per-facet copy is accepted and ignored.
  screen: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  locators: z.array(FacetLocatorSchema).default([]),
});

const CatalogStored = z.object({
  screen: z.string(),
  route: RouteStored.optional(),
  facets: z.array(FacetStored).default([]),
});

type AnySchema = z.ZodType;

const unwrap = (schema: AnySchema): AnySchema => {
  let current = schema;
  while (current instanceof z.ZodOptional || current instanceof z.ZodDefault || current instanceof z.ZodNullable) current = current.unwrap() as AnySchema;
  return current;
};

const shapeOf = (schema: AnySchema): Readonly<Record<string, AnySchema>> => {
  const inner = unwrap(schema);
  return inner instanceof z.ZodObject ? (inner.shape as Record<string, AnySchema>) : {};
};

const keysOf = (schema: AnySchema): readonly string[] => Object.keys(shapeOf(schema));

const FACET_SCOPE = FacetSchema.shape.scope;

/** Every object shape in the file, for unknown-key reporting and scalar typing. */
const SHAPES: readonly AnySchema[] = [CatalogStored, RouteStored, SummaryStored, FacetStored, FACET_SCOPE, FacetLocatorSchema, LocatorScopeSchema, ProvenanceSchema];

/** Keys whose values are numbers or booleans; every other scalar in the file is read as a string. */
const TYPED_KEYS: ReadonlySet<string> = new Set(
  SHAPES.flatMap((shape) =>
    Object.entries(shapeOf(shape))
      .filter(([, field]) => {
        const inner = unwrap(field);
        return inner instanceof z.ZodNumber || inner instanceof z.ZodBoolean;
      })
      .map(([key]) => key),
  ),
);

/** Keys holding a record of numbers (e.g. interactiveRoles), whose values keep their type. */
const NUMBER_RECORD_KEYS: ReadonlySet<string> = new Set(
  SHAPES.flatMap((shape) =>
    Object.entries(shapeOf(shape))
      .filter(([, field]) => {
        const inner = unwrap(field);
        return inner instanceof z.ZodRecord && unwrap(inner.def.valueType as AnySchema) instanceof z.ZodNumber;
      })
      .map(([key]) => key),
  ),
);

// ─── Reading ───────────────────────────────────────────────────────────────

export interface ParsedCatalog {
  readonly catalog: ScreenCatalog;
  readonly warnings: readonly string[];
}

type Raw = Record<string, unknown>;
const isRecord = (value: unknown): value is Raw => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Scalars to strings where the schema wants strings (YAML reads `10001` as a
 * number, and a human may type `testCase: 10001` or `name: 2024`), and null
 * (`role:` with nothing after it) to absent.
 */
const normalizeScalars = (value: unknown, key: string | undefined, insideNumberRecord: boolean): unknown => {
  if (Array.isArray(value)) return value.map((item) => normalizeScalars(item, undefined, false));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, normalizeScalars(v, k, key !== undefined && NUMBER_RECORD_KEYS.has(key))]),
    );
  }
  if (insideNumberRecord || (key !== undefined && TYPED_KEYS.has(key))) return value;
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' ? String(value) : value;
};

const unknownKeys = (raw: unknown, schema: AnySchema, where: string): string[] => {
  const known = keysOf(schema);
  return isRecord(raw) ? Object.keys(raw).filter((key) => !known.includes(key)).map((key) => (where.length > 0 ? `${where}.${key}` : key)) : [];
};

const collectUnknownKeys = (raw: Raw): string[] => {
  const facets = Array.isArray(raw.facets) ? raw.facets : [];
  const route = raw.route;
  return [
    ...unknownKeys(raw, CatalogStored, ''),
    ...unknownKeys(route, RouteStored, 'route'),
    ...(isRecord(route) ? unknownKeys(route.summary, SummaryStored, 'route.summary') : []),
    ...facets.flatMap((facet: unknown, i: number) => {
      if (!isRecord(facet)) return [];
      const where = `facets[${i}]`;
      const locators = Array.isArray(facet.locators) ? facet.locators : [];
      return [
        ...unknownKeys(facet, FacetStored, where),
        ...unknownKeys(facet.scope, FACET_SCOPE, `${where}.scope`),
        ...unknownKeys(facet.provenance, ProvenanceSchema, `${where}.provenance`),
        ...locators.flatMap((locator: unknown, j: number) => [
          ...unknownKeys(locator, FacetLocatorSchema, `${where}.locators[${j}]`),
          ...(isRecord(locator) ? unknownKeys(locator.scope, LocatorScopeSchema, `${where}.locators[${j}].scope`) : []),
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

/** `expression` and `health` are projections: accepted on load and dropped (health is rewritten from evidence on save). */
const stripProjections = (locator: FacetLocator): FacetLocator => {
  const { expression: _expression, health: _health, ...rest } = locator;
  return rest;
};

const byId = (a: Facet, b: Facet): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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
    const at = lineOf(doc, counter, ['facets', i, 'id']);
    const id = parseFacetId(stored.id);
    if (id === null || id.screen !== screen || !isSlug(id.local)) throw malformed(file, at, `facet id "${stored.id}" must be "${screen}:<kebab-case-name>"`);
    if (seen.has(stored.id)) throw malformed(file, at, `duplicate facet id "${stored.id}"`);
    seen.add(stored.id);
    if (stored.screen !== undefined && stored.screen !== screen) {
      warnings.push(`${file}: facet ${stored.id} says screen "${stored.screen}"; the file's screen "${screen}" wins`);
    }
    return { ...stored, screen, locators: stored.locators.map(stripProjections) };
  });

  const route: CatalogRoute | undefined = data.route;
  return { catalog: { screen, ...(route !== undefined ? { route } : {}), facets: [...facets].sort(byId) }, warnings };
};

// ─── Writing ───────────────────────────────────────────────────────────────

/** Fixed key order per level; keys the contract adds later follow, alphabetically. */
const ORDER = {
  catalog: ['screen', 'route', 'facets'],
  route: ['url', 'variant', 'title', 'fingerprint', 'summary'],
  summary: ['landmarks', 'interactiveRoles', 'dataBlocks'],
  facet: ['id', 'kind', 'displayName', 'aliases', 'role', 'tag', 'namingSource', 'affordance', 'scope', 'locators', 'parameter', 'member', 'status', 'provenance', 'evidence'],
  facetScope: ['landmark', 'dataBlock'],
  locator: ['strategy', 'role', 'name', 'exact', 'value', 'attribute', 'scope', 'visibleOnly', 'nth', 'health', 'note'],
  locatorScope: ['landmark', 'landmarkName', 'dataBlock', 'rowText'],
  provenance: ['mintedAt', 'instrument', 'session', 'model', 'testCase', 'snapshotId', 'candidateRef', 'flow'],
} as const;

const compareKeys = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The object's defined entries in `order`, then any others alphabetically;
 * `nested` maps a key to the writer for its (object) value.
 */
const ordered = (
  value: object,
  order: readonly string[],
  nested: Readonly<Record<string, (v: unknown) => unknown>> = {},
  omit: readonly string[] = [],
): Raw => {
  const entries = Object.entries(value).filter(([key, v]) => v !== undefined && !omit.includes(key));
  const rank = (key: string): number => (order.includes(key) ? order.indexOf(key) : order.length);
  return Object.fromEntries(
    entries
      .sort(([a], [b]) => rank(a) - rank(b) || compareKeys(a, b))
      .map(([key, v]) => [key, nested[key] !== undefined ? nested[key](v) : v]),
  );
};

const isEmptyObject = (value: unknown): boolean => isRecord(value) && Object.values(value).every((v) => v === undefined);

const sortedRecord = (record: unknown): Raw =>
  Object.fromEntries(Object.entries(record as Record<string, unknown>).sort(([a], [b]) => compareKeys(a, b)));

const summaryOut = (summary: unknown): Raw =>
  ordered(summary as RouteSummary, ORDER.summary, { landmarks: (v) => [...(v as string[])], interactiveRoles: sortedRecord });

const routeOut = (route: CatalogRoute): Raw => ordered(route, ORDER.route, { summary: summaryOut });

const locatorOut = (locator: FacetLocator): Raw =>
  ordered(locator, ORDER.locator, { scope: (v) => ordered(v as object, ORDER.locatorScope) }, isEmptyObject(locator.scope) ? ['scope', 'expression'] : ['expression']);

const facetOut = (facet: Facet): Raw =>
  ordered(
    facet,
    ORDER.facet,
    {
      aliases: (v) => [...(v as string[])],
      scope: (v) => ordered(v as object, ORDER.facetScope),
      locators: (v) => (v as FacetLocator[]).map(locatorOut),
      provenance: (v) => ordered(v as object, ORDER.provenance),
    },
    // screen is the file's; an empty scope says nothing.
    isEmptyObject(facet.scope) ? ['screen', 'scope'] : ['screen'],
  );

const header = (screen: string): string =>
  `# Facet catalog for screen "${screen}", maintained by tesseract-qa.\n` +
  `# Edit status by hand to promote, demote, or retire a facet; health is derived from .tesseract/evidence/${screen}.jsonl.\n`;

/**
 * Serialize a catalog. The caller passes facets with their `health` strings
 * already projected and locators already ordered (see projectCatalog); this
 * function only fixes the layout.
 */
export const serializeCatalog = (catalog: ScreenCatalog): string => {
  const body = ordered(
    { screen: catalog.screen, route: catalog.route, facets: [...catalog.facets].sort(byId) },
    ORDER.catalog,
    { route: (v) => routeOut(v as CatalogRoute), facets: (v) => (v as Facet[]).map(facetOut) },
  );
  return header(catalog.screen) + YAML.stringify(body, { lineWidth: 0, minContentWidth: 0, indent: 2 });
};
