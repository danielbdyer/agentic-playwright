/**
 * Parsers for the XML fields of a test case work item. All pure: string in,
 * structure plus warnings out. Nothing here throws on malformed input; a field
 * that cannot be read yields what could be read and a warning, because one
 * odd case must not fail a suite fetch.
 */
import { stripHtml } from '../core/text.js';
import {
  childElements,
  findElement,
  findElements,
  localName,
  markupOf,
  nameIs,
  numericReference,
  parseXml,
  textOf,
  type XmlElement,
} from './xml.js';

// ─── HTML step text → plain text ───────────────────────────────────────────

/** Named HTML entities ADO's rich-text editor emits that core stripHtml does not decode. None is markup-significant. */
const EXTRA_HTML_ENTITIES: Readonly<Record<string, string>> = {
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', divide: '÷', laquo: '«', raquo: '»', euro: '€', pound: '£',
  cent: '¢', yen: '¥', sect: '§', para: '¶', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾', iexcl: '¡', iquest: '¿',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü', Ouml: 'Ö', Auml: 'Ä',
  ccedil: 'ç', Ccedil: 'Ç', agrave: 'à', egrave: 'è', ecirc: 'ê', acirc: 'â', ocirc: 'ô', szlig: 'ß', zwnj: '', zwj: '',
  ensp: ' ', emsp: ' ', thinsp: ' ',
};

/** Characters that must stay encoded until after tags are stripped, or decoding would invent tags. */
const MARKUP_SIGNIFICANT: Readonly<Record<string, string>> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };

/**
 * Turn the HTML of one step field into plain text.
 *
 * Order matters (v1 bug 1): tags are stripped BEFORE entities are decoded, so
 * "Verify amount &gt; 0 and &lt; 100" keeps its text instead of losing
 * everything between the decoded "<" and ">". core/text.ts stripHtml already
 * strips first and decodes `&amp;` last. This pre-pass only adds what it does
 * not cover: numeric references (`&#160;`, `&#x2019;`) and common named
 * entities. A reference that decodes to `<`, `>` or `&` is rewritten to its
 * named form so stripHtml still decodes it after stripping. Because `&amp;`
 * is never touched here, "&amp;#60;" stays the literal text "&#60;".
 */
export const htmlToText = (html: string): string =>
  stripHtml(
    html.replace(/&(#[xX]?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (match, body: string) => {
      if (body.startsWith('#')) {
        const decoded = numericReference(body);
        return decoded === null ? match : MARKUP_SIGNIFICANT[decoded] ?? decoded;
      }
      return EXTRA_HTML_ENTITIES[body] ?? match;
    }),
  );

// ─── Steps ─────────────────────────────────────────────────────────────────

export interface ParsedStep {
  readonly kind: 'step';
  /** ADO step id (the `id` attribute). Ids have gaps; they are not positions. */
  readonly id: string;
  /** "ActionStep" or "ValidateStep" as ADO wrote it; "" when absent. */
  readonly type: string;
  readonly action: string;
  readonly expected: string;
}

export interface ParsedCompref {
  readonly kind: 'compref';
  /** The compref element's own id inside the parent's XML (the prefix of expanded stepIdentifiers). */
  readonly id: string;
  /** Work item id of the Shared Steps item; null when the attribute is missing or not a number. */
  readonly ref: number | null;
  /** Steps some serializations nest inside the compref: the parent's own steps that FOLLOW the shared step. */
  readonly children: readonly StepsNode[];
}

export type StepsNode = ParsedStep | ParsedCompref;

export interface ParsedSteps {
  readonly nodes: readonly StepsNode[];
  readonly warnings: readonly string[];
}

/** ADO marks rich-text (HTML) fields isformatted="true"; "false" is plain text, where "<Enter>" is text, not a tag. */
const isPlainText = (field: XmlElement): boolean =>
  Object.entries(field.attributes).some(([name, value]) => name.toLowerCase() === 'isformatted' && value.trim().toLowerCase() === 'false');

const parameterizedText = (step: XmlElement, position: number): string => {
  const strings = childElements(step, 'parameterizedString');
  const field = strings[position];
  if (field === undefined) return '';
  return isPlainText(field) ? textOf(field).replace(/\s+/g, ' ').trim() : htmlToText(markupOf(field));
};

interface Counter {
  next: number;
}

const parseNodes = (container: XmlElement, warnings: string[], synthetic: Counter): readonly StepsNode[] =>
  childElements(container).flatMap((element): StepsNode[] => {
    if (nameIs(element, 'step')) {
      const rawId = element.attributes.id?.trim() ?? '';
      synthetic.next += 1;
      const id = rawId.length > 0 ? rawId : `?${synthetic.next}`;
      if (rawId.length === 0) warnings.push(`a step has no id attribute; it is identified as "${id}" and cannot be published per step`);
      return [{ kind: 'step', id, type: element.attributes.type ?? '', action: parameterizedText(element, 0), expected: parameterizedText(element, 1) }];
    }
    if (nameIs(element, 'compref')) {
      const rawId = element.attributes.id?.trim() ?? '';
      synthetic.next += 1;
      const id = rawId.length > 0 ? rawId : `?${synthetic.next}`;
      const refText = element.attributes.ref?.trim() ?? '';
      const ref = /^\d+$/.test(refText) ? Number(refText) : null;
      if (ref === null) warnings.push(`shared step reference "${id}" has no valid ref attribute ("${refText}"); it cannot be expanded`);
      return [{ kind: 'compref', id, ref, children: parseNodes(element, warnings, synthetic) }];
    }
    return [];
  });

/**
 * Parse Microsoft.VSTS.TCM.Steps into a tree of steps and shared-step
 * references, keeping each step's ADO id and type. A self-closing or empty
 * `<parameterizedString/>` is an empty string in its own position (v1 bug 2
 * shifted the expected text into the action).
 */
export const parseStepsXml = (xml: string | null | undefined): ParsedSteps => {
  if (typeof xml !== 'string' || xml.trim().length === 0) return { nodes: [], warnings: [] };
  const document = parseXml(xml);
  const container = findElement(document, 'steps') ?? document;
  const warnings: string[] = [];
  const nodes = parseNodes(container, warnings, { next: 0 });
  if (nodes.length === 0 && /<\s*(step|compref)\b/i.test(xml)) warnings.push('the steps field could not be read; no steps were found in it');
  return { nodes, warnings };
};

// ─── Parameters ────────────────────────────────────────────────────────────

/** Parameter names declared in Microsoft.VSTS.TCM.Parameters, in order, de-duplicated case-insensitively. */
export const parseParameterNames = (xml: string | null | undefined): readonly string[] => {
  if (typeof xml !== 'string' || xml.trim().length === 0) return [];
  const names = findElements(parseXml(xml), 'param')
    .map((param) => (param.attributes.name ?? '').trim())
    .filter((name) => name.length > 0);
  return unionNames([names]);
};

/** Union of name lists, first spelling wins, compared case-insensitively (ADO parameter names are). */
export const unionNames = (lists: readonly (readonly string[])[]): readonly string[] =>
  lists.flat().reduce<readonly string[]>(
    (acc, name) => (acc.some((seen) => seen.toLowerCase() === name.toLowerCase()) ? acc : [...acc, name]),
    [],
  );

// ─── Data rows ─────────────────────────────────────────────────────────────

export interface ParsedDataSource {
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly warnings: readonly string[];
  /** Set when the case binds a shared parameter set instead of local rows. */
  readonly sharedParameterSetIds?: readonly number[];
}

const sharedParameterIds = (json: string): readonly number[] | null => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const ids = (parsed as { sharedParameterDataSetIds?: unknown }).sharedParameterDataSetIds;
    return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return null;
  }
};

/**
 * Read local data rows from Microsoft.VSTS.TCM.LocalDataSource, a serialized
 * .NET DataSet: `<NewDataSet><xs:schema …/><Table1><name>value</name>…</Table1>…`.
 * Each non-schema child of the data set is a row and each child of a row is a
 * cell. Self-closing cells (`<amount/>`) are empty strings, and every declared
 * parameter is present in every row (empty when the row omits it), so
 * `dataRows[i][name]` is always defined for `name` in `parameters`.
 *
 * Values are XML-decoded and otherwise kept verbatim: they are test data, not
 * HTML.
 *
 * A case bound to shared parameters stores JSON here instead; those are not
 * read yet, and the case gets a warning rather than silently having no rows.
 */
export const parseDataSource = (source: string | null | undefined, parameters: readonly string[] = []): ParsedDataSource => {
  if (typeof source !== 'string' || source.trim().length === 0) return { rows: [], warnings: [] };
  const trimmed = source.trim();
  if (trimmed.startsWith('{')) {
    const ids = sharedParameterIds(trimmed);
    if (ids === null) return { rows: [], warnings: ['the local data source is neither a data set nor shared-parameter JSON; no data rows were read'] };
    return {
      rows: [],
      sharedParameterSetIds: ids,
      warnings: [
        `the case uses shared parameters${ids.length > 0 ? ` (data sets ${ids.join(', ')})` : ''}; shared parameters not supported yet, so no data rows were read`,
      ],
    };
  }
  const document = parseXml(trimmed);
  const dataSet = childElements(document)[0];
  if (dataSet === undefined) return { rows: [], warnings: ['the local data source has no data set element; no data rows were read'] };
  const rows = childElements(dataSet)
    .filter((row) => localName(row.name).toLowerCase() !== 'schema')
    .map((row) => {
      const cells = Object.fromEntries(childElements(row).map((cell) => [localName(cell.name), textOf(cell)] as const));
      const filled = Object.fromEntries(parameters.filter((name) => !(name in cells)).map((name) => [name, ''] as const));
      return { ...cells, ...filled };
    });
  return { rows, warnings: [] };
};

// ─── Tags and scalars ──────────────────────────────────────────────────────

export const splitTags = (value: unknown): readonly string[] =>
  typeof value === 'string'
    ? value
        .split(';')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

export const asText = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

export const asInteger = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};
