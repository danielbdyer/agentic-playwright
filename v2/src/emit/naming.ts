/**
 * Names and paths. Every identifier emission writes comes from here, so the
 * spec, the page object and the flow agree on a member name without talking
 * to each other: the same facets in the same catalog order always produce the
 * same names.
 */
import path from 'node:path';
import type { Facet, LocatorSpec } from '../contract/schemas.js';
import { ToolError } from '../core/errors.js';
import { camelCase, pascalCase, slugify } from '../core/text.js';
import { locatorParams } from '../locator/locator.js';
import type { EmitLayout, FlowParam } from './types.js';
import { DEFAULT_LAYOUT } from './types.js';

/** Words that cannot name a local variable or parameter in strict-mode TypeScript (plus a few that would read badly). */
export const RESERVED_WORDS: ReadonlySet<string> = new Set([
  'arguments', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'eval', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'implements', 'import', 'in',
  'instanceof', 'interface', 'let', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
  'NaN', 'Infinity', 'any', 'boolean', 'number', 'string', 'symbol', 'never', 'unknown', 'object',
]);

/** Member names a page object must not use: its own members, and Object.prototype names that would break it. */
const MEMBER_RESERVED: ReadonlySet<string> = new Set([
  'page', 'goto', 'constructor', 'then', 'toString', 'toJSON', 'valueOf', 'toLocaleString', 'hasOwnProperty',
  'isPrototypeOf', 'propertyIsEnumerable', '__proto__', 'prototype',
]);

export const isIdentifier = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

/**
 * An identifier for `raw` that is not in `taken`: `raw` itself when it is
 * already a valid identifier, otherwise its camelCase; reserved words get
 * `reservedSuffix`; collisions try `collisionSuffix` (when given), then 2, 3, …
 */
export const uniqueIdentifier = (
  raw: string,
  taken: ReadonlySet<string>,
  reservedSuffix: string,
  reserved: ReadonlySet<string> = RESERVED_WORDS,
  collisionSuffix?: string,
): string => {
  const base0 = isIdentifier(raw) ? raw : camelCase(raw);
  const base = reserved.has(base0) ? `${base0}${reservedSuffix}` : base0;
  if (!taken.has(base)) return base;
  const suffixed = collisionSuffix === undefined ? null : `${base}${collisionSuffix}`;
  if (suffixed !== null && !taken.has(suffixed) && !reserved.has(suffixed)) return suffixed;
  const next = (n: number): string => (taken.has(`${base}${n}`) ? next(n + 1) : `${base}${n}`);
  return next(2);
};

/** Assign identifiers to names in order, each unique against `initiallyTaken` and the ones before it (a taken name tries `collisionSuffix`, then 2, 3, …). */
export const assignIdentifiers = (
  names: readonly string[],
  initiallyTaken: ReadonlySet<string>,
  reservedSuffix: string,
  collisionSuffix?: string,
): ReadonlyMap<string, string> =>
  names.reduce<{ readonly map: ReadonlyMap<string, string>; readonly taken: ReadonlySet<string> }>(
    (acc, name) => {
      if (acc.map.has(name)) return acc;
      const id = uniqueIdentifier(name, acc.taken, reservedSuffix, RESERVED_WORDS, collisionSuffix);
      return { map: new Map([...acc.map, [name, id]]), taken: new Set([...acc.taken, id]) };
    },
    { map: new Map(), taken: initiallyTaken },
  ).map;

// ─── Page-object members ────────────────────────────────────────────────────

export const localId = (facetId: string): string => {
  const colon = facetId.indexOf(':');
  return colon === -1 ? facetId : facetId.slice(colon + 1);
};

const singularize = (word: string): string => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s')) return word.slice(0, -1);
  return word;
};

/** "results-table" → "resultRow": strip a container suffix, singularise, append Row. */
export const rowMemberName = (local: string): string => {
  const words = local.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0);
  const stripped = words.length > 0 && /^(table|grid|list|rows?|repeater)$/i.test(words[words.length - 1]!) ? words.slice(0, -1) : words;
  const singular = stripped.length === 0 ? [] : [...stripped.slice(0, -1), singularize(stripped[stripped.length - 1]!)];
  return camelCase([...singular, 'row'].join(' '));
};

export type SelectStyle = 'native' | 'helper' | 'none';

export interface MemberInfo {
  readonly facetId: string;
  readonly screen: string;
  /** Getter or method name on the page object. */
  readonly name: string;
  /** Method parameters, in order; empty for a getter. Matches the {param} placeholders of `locator`. */
  readonly params: readonly string[];
  /** The placeholder names the parameters came from (same order); differs from `params` only for reserved words. */
  readonly placeholders: readonly string[];
  /** The facet's best locator (its first), with placeholders renamed to `params` where needed. */
  readonly locator: LocatorSpec;
  /** How a select step on this facet is emitted: selectOption, a page-object helper, or not at all. */
  readonly selectStyle: SelectStyle;
  readonly selectHelper: string | null;
}

/** Facets that become page-object members: not retired, not routes (those are goto()), and with a locator. */
export const isMemberFacet = (facet: Facet): boolean =>
  facet.status !== 'retired' && facet.kind !== 'route' && facet.locators.length > 0;

const renamePlaceholders = (spec: LocatorSpec, renames: ReadonlyMap<string, string>): LocatorSpec => {
  if (renames.size === 0) return spec;
  const swap = (text: string | undefined): string | undefined =>
    text?.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => {
      const renamed = renames.get(name);
      return renamed === undefined ? match : `{${renamed}}`;
    });
  return {
    ...spec,
    ...(spec.value !== undefined ? { value: swap(spec.value) } : {}),
    ...(spec.name !== undefined ? { name: swap(spec.name) } : {}),
    ...(spec.scope !== undefined
      ? { scope: { ...spec.scope, ...(spec.scope.rowText !== undefined ? { rowText: swap(spec.scope.rowText) } : {}) } }
      : {}),
  };
};

const selectStyleOf = (facet: Facet, role: string | undefined): SelectStyle => {
  const tag = facet.tag?.toLowerCase();
  const listy = role === 'combobox' || role === 'listbox';
  if (tag === 'select' || (tag === undefined && (role === undefined || listy))) return 'native';
  if (facet.kind === 'element' && listy) return 'helper';
  return 'none';
};

const hasFrozenMember = (facet: Facet): boolean => facet.member !== undefined && facet.member.trim().length > 0;

const baseMemberName = (facet: Facet): string => {
  if (hasFrozenMember(facet)) {
    const member = facet.member!.trim();
    return isIdentifier(member) ? member : camelCase(member);
  }
  const local = localId(facet.id);
  return facet.kind === 'row' ? rowMemberName(local) : camelCase(local);
};

/** Facets whose frozen `member` holds its name: every non-route facet that has one, retired ones included. */
const holdsFrozenName = (facet: Facet): boolean => hasFrozenMember(facet) && facet.kind !== 'route';

/**
 * Member names for one screen's facets. A name is `facet.member`, frozen when
 * the facet was minted (memory.mint writes it), or, for a catalog written
 * before members were frozen, derived from the local id. Frozen names are
 * claimed first, in catalog order, and a retired facet keeps its frozen name
 * reserved, so minting or retiring another facet never renames a member and a
 * new facet never takes a retired one's name. Derived names follow in catalog
 * order (retired facets without a frozen name are skipped, as they always
 * were), a taken name getting a numeric suffix; select helpers are named right
 * after their facet.
 */
export const memberTable = (facets: readonly Facet[]): ReadonlyMap<string, MemberInfo> => {
  const frozen = facets.filter(holdsFrozenName).reduce<{ readonly names: ReadonlyMap<string, string>; readonly taken: ReadonlySet<string> }>(
    (acc, facet) => {
      if (acc.names.has(facet.id)) return acc;
      const name = uniqueIdentifier(baseMemberName(facet), acc.taken, 'Element', MEMBER_RESERVED);
      return { names: new Map([...acc.names, [facet.id, name]]), taken: new Set([...acc.taken, name]) };
    },
    { names: new Map(), taken: MEMBER_RESERVED },
  );
  return facets.filter(isMemberFacet).reduce<{ readonly table: ReadonlyMap<string, MemberInfo>; readonly taken: ReadonlySet<string> }>(
    (acc, facet) => {
      if (acc.table.has(facet.id)) return acc;
      const name = frozen.names.get(facet.id) ?? uniqueIdentifier(baseMemberName(facet), acc.taken, 'Element', MEMBER_RESERVED);
      const best = facet.locators[0]!;
      const raw = locatorParams(best);
      const ordered = facet.parameter !== undefined && raw.includes(facet.parameter)
        ? [facet.parameter, ...raw.filter((p) => p !== facet.parameter)]
        : [...raw];
      const paramIds = assignIdentifiers(ordered, new Set(), 'Value');
      const renames = new Map([...paramIds].filter(([from, to]) => from !== to));
      const style = selectStyleOf(facet, facet.role ?? best.role);
      const takenWithName = new Set([...acc.taken, name]);
      const helper = style === 'helper' ? uniqueIdentifier(`select${pascalCase(name)}`, takenWithName, 'Option', MEMBER_RESERVED) : null;
      const info: MemberInfo = {
        facetId: facet.id,
        screen: facet.screen,
        name,
        params: ordered.map((p) => paramIds.get(p) ?? p),
        placeholders: ordered,
        locator: renamePlaceholders(best, renames),
        selectStyle: style,
        selectHelper: helper,
      };
      return {
        table: new Map([...acc.table, [facet.id, info]]),
        taken: helper === null ? takenWithName : new Set([...takenWithName, helper]),
      };
    },
    { table: new Map(), taken: frozen.taken },
  ).table;
};

/** Every identifier a screen's page object uses or reserves: members, select helpers, retired facets' frozen names. */
const namesInUse = (facets: readonly Facet[]): ReadonlySet<string> => {
  const table = memberTable(facets);
  return new Set([
    ...MEMBER_RESERVED,
    ...[...table.values()].flatMap((member) => (member.selectHelper === null ? [member.name] : [member.name, member.selectHelper])),
    ...facets.filter(holdsFrozenName).map(baseMemberName),
  ]);
};

/**
 * Freeze page-object member names (memory.mint calls this): every member
 * facet without a frozen `member` gets the name it is emitted under today, and
 * `added` (a facet new to the screen, if any) gets its derived name, made
 * unique against every name the screen uses or reserves. From then on the
 * names are data, so emission order no longer decides them.
 */
export const freezeMemberNames = (facets: readonly Facet[], added?: Facet): { readonly facets: readonly Facet[]; readonly added?: Facet } => {
  const table = memberTable(facets);
  const frozen = facets.map((facet) => {
    const name = table.get(facet.id)?.name;
    return hasFrozenMember(facet) || name === undefined ? facet : { ...facet, member: name };
  });
  if (added === undefined || added.kind === 'route') return { facets: frozen, ...(added !== undefined ? { added } : {}) };
  const member = uniqueIdentifier(baseMemberName(added), namesInUse(frozen), 'Element', MEMBER_RESERVED);
  return { facets: frozen, added: { ...added, member } };
};

export const pageClassName = (screen: string): string => `${pascalCase(screen)}Page`;

// ─── Tags ───────────────────────────────────────────────────────────────────

/**
 * A Playwright tag for an ADO tag: "@" + the tag with whitespace, ";" and ","
 * turned into "-". Playwright refuses a details tag without "@" and splits a
 * title tag at whitespace, so the raw ADO tags travel in an annotation instead.
 */
export const sanitizeTag = (raw: string): string | null => {
  const body = raw
    .trim()
    .replace(/^@+/, '')
    .replace(/[\s;,]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return body.length === 0 ? null : `@${body}`;
};

export const specTags = (adoTags: readonly string[], extra: readonly string[], priority: number | undefined): readonly string[] => {
  const all = [...adoTags, ...extra, ...(priority !== undefined ? [`P${priority}`] : [])]
    .map(sanitizeTag)
    .filter((tag): tag is string => tag !== null);
  return [...new Set(all)];
};

// ─── Flows ──────────────────────────────────────────────────────────────────

export const flowFunctionName = (name: string): string =>
  uniqueIdentifier(camelCase(name), new Set(['page', 'test', 'expect', 'requireEnv', 'params']), 'Flow');

export const flowParamsTypeName = (name: string): string => `${pascalCase(name)}Params`;

/** Flow parameter name → property name in the flow's params interface (shared by the flow file and the specs calling it). */
export const flowParamIdentifiers = (params: readonly FlowParam[]): ReadonlyMap<string, string> =>
  assignIdentifiers(params.map((p) => p.name), new Set(), 'Value');

/** Environment variable a spec reads a flow parameter from: TESSERACT_PARAM_<NAME>. */
export const paramEnvName = (name: string): string => `TESSERACT_PARAM_${name.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;

// ─── Paths ──────────────────────────────────────────────────────────────────

/** A workspace-relative directory in POSIX form; refuses absolute paths and "..". */
export const normalizeRelativePath = (raw: string, what: string): string => {
  const posix = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/');
  if (posix.length === 0 || posix.startsWith('/') || /^[A-Za-z]:/.test(posix) || posix.split('/').some((s) => s === '..' || s === '.')) {
    throw new ToolError('invalid-input', `${what} must be a relative path inside the workspace: ${raw}`);
  }
  return posix;
};

export const fileStem = (name: string): string => slugify(name, 120);

export const pageObjectPath = (screen: string, layout: EmitLayout = DEFAULT_LAYOUT): string =>
  `${normalizeRelativePath(layout.pagesDir, 'pagesDir')}/${fileStem(screen)}.page.ts`;

export const overridesPath = (screen: string, layout: EmitLayout = DEFAULT_LAYOUT): string =>
  `${normalizeRelativePath(layout.pagesDir, 'pagesDir')}/${fileStem(screen)}.page.overrides.ts`;

export const flowFilePath = (name: string, layout: EmitLayout = DEFAULT_LAYOUT): string =>
  `${normalizeRelativePath(layout.flowsDir, 'flowsDir')}/${fileStem(name)}.ts`;

export const safeAdoId = (adoId: string): string => {
  const safe = adoId.replace(/[^A-Za-z0-9_-]/g, '');
  if (safe.length === 0) throw new ToolError('invalid-input', `test case id cannot name a file: ${adoId}`);
  return safe;
};

/** tests/<area>/<adoId>-<slug(title)>.spec.ts; each area segment is slugified. */
export const specPath = (adoId: string, title: string, area: string, layout: EmitLayout = DEFAULT_LAYOUT): string => {
  const areaPath = area
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment.trim().length > 0)
    .map((segment) => slugify(segment))
    .join('/');
  const dir = normalizeRelativePath(layout.testsDir, 'testsDir');
  return `${dir}/${areaPath.length > 0 ? `${areaPath}/` : ''}${safeAdoId(adoId)}-${slugify(title, 60)}.spec.ts`;
};

/** Extensionless relative import specifier from one workspace file to another. */
export const importSpecifier = (fromFile: string, toFile: string): string => {
  const relative = path.posix.relative(path.posix.dirname(fromFile), toFile).replace(/\.tsx?$/, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
};
