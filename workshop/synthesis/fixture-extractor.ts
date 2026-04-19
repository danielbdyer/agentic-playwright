/**
 * Fixture Extractor — auto-generate test data fixtures from HAR network captures.
 *
 * Parses HAR files to extract JSON API responses, infers schema, and generates
 * dataset fixtures that can be bound to screen elements. Eliminates manual
 * fixture authoring when the capture phase has recorded network traffic.
 *
 * All functions are pure — no side effects, no mutation.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single API response extracted from a HAR entry. */
export interface ExtractedApiResponse {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: unknown;
}

/** A field extracted from a JSON API response. */
export interface ExtractedField {
  readonly path: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  readonly sampleValue: unknown;
}

/** A generated fixture row derived from API response data. */
export interface GeneratedFixtureRow {
  readonly fields: ReadonlyMap<string, unknown>;
}

/** A complete fixture dataset derived from HAR responses. */
export interface GeneratedFixtureDataset {
  readonly screenId: string;
  readonly sourceUrl: string;
  readonly fields: readonly ExtractedField[];
  readonly rows: readonly GeneratedFixtureRow[];
  readonly generatedAt: string;
}

// ─── HAR entry type (minimal, matching HAR 1.2 spec) ────────────────────────

export interface HarEntry {
  readonly request: {
    readonly method: string;
    readonly url: string;
  };
  readonly response: {
    readonly status: number;
    readonly content: {
      readonly mimeType: string;
      readonly text?: string | undefined;
    };
  };
}

export interface HarLog {
  readonly log: {
    readonly entries: readonly HarEntry[];
  };
}

// ─── Pure functions ─────────────────────────────────────────────────────────

/** Extract JSON API responses from HAR entries. Filters to JSON content types with 2xx status. */
export function extractJsonResponses(har: HarLog): readonly ExtractedApiResponse[] {
  return har.log.entries
    .filter((entry) =>
      entry.response.status >= 200
      && entry.response.status < 300
      && entry.response.content.mimeType.includes('json')
      && entry.response.content.text,
    )
    .map((entry) => {
      let body: unknown;
      try {
        body = JSON.parse(entry.response.content.text!);
      } catch {
        body = null;
      }
      return {
        url: entry.request.url,
        method: entry.request.method,
        status: entry.response.status,
        contentType: entry.response.content.mimeType,
        body,
      };
    })
    .filter((r) => r.body !== null);
}

/** Infer field type from a JavaScript value. */
export function inferFieldType(value: unknown): ExtractedField['type'] {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

/**
 * Extract top-level fields from a JSON object or array of objects.
 * For arrays, extracts fields from the first element.
 */
export function extractFields(body: unknown): readonly ExtractedField[] {
  const target = Array.isArray(body) ? body[0] : body;
  if (!target || typeof target !== 'object') return [];

  return Object.entries(target as Record<string, unknown>).map(([key, value]) => ({
    path: key,
    type: inferFieldType(value),
    sampleValue: value,
  }));
}

/**
 * Generate fixture rows from an API response body.
 * If the body is an array, each element becomes a row.
 * If it's an object, it becomes a single row.
 */
export function generateFixtureRows(body: unknown, maxRows: number = 10): readonly GeneratedFixtureRow[] {
  const items = Array.isArray(body) ? body.slice(0, maxRows) : [body];
  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      fields: new Map(Object.entries(item).filter(([, v]) => inferFieldType(v) !== 'object' && inferFieldType(v) !== 'array')),
    }));
}

/**
 * Build a complete fixture dataset from a HAR file for a given screen.
 * Selects the most data-rich JSON response (most fields in an array response).
 */
export function buildFixtureDataset(
  har: HarLog,
  screenId: string,
): GeneratedFixtureDataset | null {
  const responses = extractJsonResponses(har);
  if (responses.length === 0) return null;

  // Pick the response with the most fields (prefer arrays for tabular data)
  const scored = responses.map((r) => {
    const fields = extractFields(r.body);
    const isArray = Array.isArray(r.body);
    return { response: r, fields, score: fields.length * (isArray ? 2 : 1) };
  });

  const best = scored.reduce((a, b) => b.score > a.score ? b : a);
  const rows = generateFixtureRows(best.response.body);

  return {
    screenId,
    sourceUrl: best.response.url,
    fields: best.fields,
    rows,
    generatedAt: new Date().toISOString(),
  };
}
