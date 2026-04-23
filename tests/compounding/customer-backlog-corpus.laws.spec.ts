/**
 * Customer-backlog corpus — Z11a.2 structural laws.
 *
 * Pins the resolvable/ + needs-human/ corpuses as real AdoSnapshot
 * shapes so future additions have to conform. Pure filesystem walk
 * + shape assertions; no Effect imports; runs fast.
 *
 *   ZC34   (corpus directory structure): both corpuses exist under
 *          workshop/customer-backlog/fixtures/; files have the
 *          expected extension.
 *   ZC34.b (AdoSnapshot conformance): every case parses and has
 *          the required AdoSnapshot fields.
 *   ZC34.c (ADO id range discipline): resolvable/ ids in
 *          90001-90099; needs-human/ ids in 90101-90199.
 *   ZC34.d (step shape): every step has index + action + expected;
 *          step indexes are 1..N without gaps.
 *   ZC34.e (unique adoId across both corpuses): no id collision.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { AdoSnapshot } from '../../product/domain/intent/types';

const CORPUS_ROOT = path.join(process.cwd(), 'workshop', 'customer-backlog', 'fixtures');
const RESOLVABLE_DIR = path.join(CORPUS_ROOT, 'resolvable');
const NEEDS_HUMAN_DIR = path.join(CORPUS_ROOT, 'needs-human');

function loadCorpus(dir: string): readonly AdoSnapshot[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.ado.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AdoSnapshot);
}

describe('Customer-backlog corpus Z11a.2 — structural laws', () => {
  test('ZC34: corpus directories exist with files', () => {
    expect(fs.existsSync(RESOLVABLE_DIR)).toBe(true);
    expect(fs.existsSync(NEEDS_HUMAN_DIR)).toBe(true);
    const resolvable = loadCorpus(RESOLVABLE_DIR);
    expect(resolvable.length).toBeGreaterThanOrEqual(6);
  });

  test('ZC34.b: every resolvable case is a well-formed AdoSnapshot', () => {
    const cases = loadCorpus(RESOLVABLE_DIR);
    for (const c of cases) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.revision).toBe('number');
      expect(typeof c.title).toBe('string');
      expect(typeof c.suitePath).toBe('string');
      expect(typeof c.areaPath).toBe('string');
      expect(typeof c.iterationPath).toBe('string');
      expect(Array.isArray(c.tags)).toBe(true);
      expect(typeof c.priority).toBe('number');
      expect(Array.isArray(c.steps)).toBe(true);
      expect(c.steps.length).toBeGreaterThan(0);
      expect(Array.isArray(c.parameters)).toBe(true);
      expect(Array.isArray(c.dataRows)).toBe(true);
      expect(typeof c.contentHash).toBe('string');
      expect(typeof c.syncedAt).toBe('string');
    }
  });

  test('ZC34.c: resolvable ids land in 90001-90099', () => {
    const cases = loadCorpus(RESOLVABLE_DIR);
    for (const c of cases) {
      const n = Number(c.id);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(90001);
      expect(n).toBeLessThanOrEqual(90099);
    }
  });

  test('ZC34.c.b: needs-human ids land in 90101-90199 (once the corpus lands)', () => {
    const cases = loadCorpus(NEEDS_HUMAN_DIR);
    for (const c of cases) {
      const n = Number(c.id);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(90101);
      expect(n).toBeLessThanOrEqual(90199);
    }
  });

  test('ZC34.d: every step has index+action+expected and indexes run 1..N contiguous', () => {
    const cases = [...loadCorpus(RESOLVABLE_DIR), ...loadCorpus(NEEDS_HUMAN_DIR)];
    for (const c of cases) {
      for (const step of c.steps) {
        expect(typeof step.index).toBe('number');
        expect(typeof step.action).toBe('string');
        expect(typeof step.expected).toBe('string');
        expect(step.action.length).toBeGreaterThan(0);
        expect(step.expected.length).toBeGreaterThan(0);
      }
      const indexes = c.steps.map((s) => s.index);
      const expected = Array.from({ length: c.steps.length }, (_, i) => i + 1);
      expect(indexes).toEqual(expected);
    }
  });

  test('ZC34.e: ADO ids are unique across both corpuses', () => {
    const all = [...loadCorpus(RESOLVABLE_DIR), ...loadCorpus(NEEDS_HUMAN_DIR)];
    const ids = all.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
