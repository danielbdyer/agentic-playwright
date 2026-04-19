/**
 * Fixture Extractor — Law Tests
 *
 * Invariants:
 *  1. extractJsonResponses filters to 2xx JSON responses
 *  2. extractJsonResponses skips non-JSON content types
 *  3. inferFieldType classifies JavaScript types correctly
 *  4. extractFields extracts top-level keys from objects
 *  5. extractFields handles arrays (extracts from first element)
 *  6. generateFixtureRows limits to maxRows
 *  7. buildFixtureDataset selects the most data-rich response
 *  8. buildFixtureDataset returns null for empty HAR
 *  9. extractJsonResponses handles malformed JSON gracefully
 * 10. generateFixtureRows excludes nested objects and arrays from row fields
 */

import { expect, test } from '@playwright/test';
import {
  extractJsonResponses,
  inferFieldType,
  extractFields,
  generateFixtureRows,
  buildFixtureDataset,
  type HarLog,
} from '../../workshop/synthesis/fixture-extractor';

// ─── Helpers ────────────────────────────────────────────────────────────────

function har(entries: Array<{ url: string; status: number; mime: string; body?: string }>): HarLog {
  return {
    log: {
      entries: entries.map((e) => ({
        request: { method: 'GET', url: e.url },
        response: {
          status: e.status,
          content: { mimeType: e.mime, text: e.body },
        },
      })),
    },
  };
}

// ─── Law 1 ──────────────────────────────────────────────────────────────────

test('Law 1: extractJsonResponses filters to 2xx JSON responses', () => {
  const h = har([
    { url: '/api/data', status: 200, mime: 'application/json', body: '{"a":1}' },
    { url: '/api/fail', status: 500, mime: 'application/json', body: '{"error":true}' },
    { url: '/api/ok', status: 201, mime: 'application/json', body: '{"b":2}' },
  ]);
  const responses = extractJsonResponses(h);
  expect(responses).toHaveLength(2);
  expect(responses.every((r) => r.status >= 200 && r.status < 300)).toBe(true);
});

// ─── Law 2 ──────────────────────────────────────────────────────────────────

test('Law 2: extractJsonResponses skips non-JSON content types', () => {
  const h = har([
    { url: '/page', status: 200, mime: 'text/html', body: '<html></html>' },
    { url: '/api', status: 200, mime: 'application/json', body: '{"x":1}' },
  ]);
  const responses = extractJsonResponses(h);
  expect(responses).toHaveLength(1);
});

// ─── Law 3 ──────────────────────────────────────────────────────────────────

test('Law 3: inferFieldType classifies JavaScript types correctly', () => {
  expect(inferFieldType('hello')).toBe('string');
  expect(inferFieldType(42)).toBe('number');
  expect(inferFieldType(true)).toBe('boolean');
  expect(inferFieldType(null)).toBe('null');
  expect(inferFieldType(undefined)).toBe('null');
  expect(inferFieldType([1, 2])).toBe('array');
  expect(inferFieldType({ a: 1 })).toBe('object');
});

// ─── Law 4 ──────────────────────────────────────────────────────────────────

test('Law 4: extractFields extracts top-level keys from objects', () => {
  const fields = extractFields({ name: 'Alice', age: 30, active: true });
  expect(fields).toHaveLength(3);
  expect(fields.find((f) => f.path === 'name')!.type).toBe('string');
  expect(fields.find((f) => f.path === 'age')!.type).toBe('number');
});

// ─── Law 5 ──────────────────────────────────────────────────────────────────

test('Law 5: extractFields handles arrays (extracts from first element)', () => {
  const fields = extractFields([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
  expect(fields).toHaveLength(2);
  expect(fields.find((f) => f.path === 'id')).toBeDefined();
});

// ─── Law 6 ──────────────────────────────────────────────────────────────────

test('Law 6: generateFixtureRows limits to maxRows', () => {
  const data = Array.from({ length: 100 }, (_, i) => ({ id: i }));
  const rows = generateFixtureRows(data, 5);
  expect(rows).toHaveLength(5);
});

// ─── Law 7 ──────────────────────────────────────────────────────────────────

test('Law 7: buildFixtureDataset selects the most data-rich response', () => {
  const h = har([
    { url: '/api/simple', status: 200, mime: 'application/json', body: '{"a":1}' },
    { url: '/api/rich', status: 200, mime: 'application/json', body: JSON.stringify([{ a: 1, b: 2, c: 3, d: 4 }]) },
  ]);
  const dataset = buildFixtureDataset(h, 'test-screen');
  expect(dataset).not.toBeNull();
  expect(dataset!.sourceUrl).toBe('/api/rich'); // Array with more fields wins
});

// ─── Law 8 ──────────────────────────────────────────────────────────────────

test('Law 8: buildFixtureDataset returns null for empty HAR', () => {
  const h = har([]);
  expect(buildFixtureDataset(h, 'test')).toBeNull();
});

// ─── Law 9 ──────────────────────────────────────────────────────────────────

test('Law 9: extractJsonResponses handles malformed JSON gracefully', () => {
  const h = har([
    { url: '/api/bad', status: 200, mime: 'application/json', body: 'not json{{{' },
    { url: '/api/good', status: 200, mime: 'application/json', body: '{"ok":true}' },
  ]);
  const responses = extractJsonResponses(h);
  expect(responses).toHaveLength(1);
});

// ─── Law 10 ─────────────────────────────────────────────────────────────────

test('Law 10: generateFixtureRows excludes nested objects and arrays', () => {
  const data = { name: 'Alice', meta: { x: 1 }, tags: ['a', 'b'] };
  const rows = generateFixtureRows(data);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.fields.has('name')).toBe(true);
  expect(rows[0]!.fields.has('meta')).toBe(false);
  expect(rows[0]!.fields.has('tags')).toBe(false);
});
