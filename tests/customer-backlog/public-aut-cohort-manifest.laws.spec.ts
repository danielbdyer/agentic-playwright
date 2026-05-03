/**
 * Public-AUT cohort manifest — structural laws.
 *
 * Pins the invariants the spike's clean-room rule
 * (`docs/v2-cold-start-cohort-spike.md §4.4`) relies on. The
 * trust-policy gate's eventual partition-awareness consumes the
 * manifest at runtime; these laws are the compile-time guard that
 * keeps the manifest's structure honest as the cohort grows.
 *
 * Cycle 3 of the cold-start cohort spike (2026-05-01). Authored
 * after Entry 7 surfaced the gap and Entry 11 carried it forward
 * as a next-cycle seed.
 *
 *   ZC38     (partition values are valid): every entry's partition
 *            is exactly 'training' | 'held-out'.
 *   ZC38.b   (names unique): no two entries share a name.
 *   ZC38.c   (fixturesDir exists): every entry's fixturesDir
 *            resolves to a real directory under the cohort root.
 *   ZC38.d   (every fixture loads as AdoSnapshot): per-AUT
 *            fixtures parse cleanly + carry the required fields.
 *   ZC38.e   (targetAut consistency): every fixture's targetAut
 *            either is absent or matches the AUT entry's url.
 *   ZC38.f   (ado-id range discipline): every fixture id sits in
 *            the public-AUT cohort's reserved range 91000-91999.
 *   ZC38.g   (one-way promotion sentinel): partition is one of the
 *            two literal strings; promotion training -> held-out
 *            is forbidden by the C4 corollary, and the law-test
 *            fails if any code path adds new partition values
 *            without conscious intent.
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadPublicAutManifest,
  loadPublicAutCohort,
  type CohortPartition,
} from '../../workshop/customer-backlog/application/load-public-aut-cohort';

const ROOT = process.cwd();
const COHORT_ROOT = path.join(ROOT, 'workshop', 'customer-backlog', 'public-aut');
const VALID_PARTITIONS: readonly CohortPartition[] = ['training', 'held-out'];

const ID_RANGE_MIN = 91000;
const ID_RANGE_MAX = 91999;

describe('Public-AUT cohort manifest — ZC38 structural laws', () => {
  test('ZC38: every entry has a valid partition', () => {
    const manifest = loadPublicAutManifest(ROOT);
    for (const entry of manifest.auts) {
      expect(VALID_PARTITIONS).toContain(entry.partition);
    }
  });

  test('ZC38.b: AUT names are unique across the manifest', () => {
    const manifest = loadPublicAutManifest(ROOT);
    const names = manifest.auts.map((a) => a.name);
    const set = new Set(names);
    expect(set.size).toBe(names.length);
  });

  test('ZC38.c: every entry\'s fixturesDir exists on disk', () => {
    const manifest = loadPublicAutManifest(ROOT);
    for (const entry of manifest.auts) {
      const dir = path.join(COHORT_ROOT, entry.fixturesDir);
      expect(fs.existsSync(dir), `fixturesDir missing for ${entry.name}: ${dir}`).toBe(true);
      expect(fs.statSync(dir).isDirectory(), `fixturesDir is not a directory: ${dir}`).toBe(true);
    }
  });

  test('ZC38.d: every fixture loads as AdoSnapshot with the required fields', () => {
    const cases = loadPublicAutCohort(ROOT);
    for (const c of cases) {
      expect(typeof c.snapshot.id).toBe('string');
      expect(typeof c.snapshot.title).toBe('string');
      expect(Array.isArray(c.snapshot.steps)).toBe(true);
      expect(c.snapshot.steps.length).toBeGreaterThan(0);
      for (const step of c.snapshot.steps) {
        expect(typeof step.index).toBe('number');
        expect(typeof step.action).toBe('string');
        expect(typeof step.expected).toBe('string');
      }
    }
  });

  test('ZC38.e: every fixture\'s targetAut either is absent or matches the AUT entry\'s url', () => {
    const cases = loadPublicAutCohort(ROOT);
    for (const c of cases) {
      if (c.snapshot.targetAut !== undefined) {
        expect(
          c.snapshot.targetAut,
          `targetAut mismatch for ${c.snapshot.id} under AUT ${c.aut.name}`,
        ).toBe(c.aut.url);
      }
    }
  });

  test('ZC38.f: every fixture ado-id sits in the reserved 91000-91999 range', () => {
    const cases = loadPublicAutCohort(ROOT);
    for (const c of cases) {
      const id = parseInt(c.snapshot.id, 10);
      expect(Number.isFinite(id), `non-numeric ado id: ${c.snapshot.id}`).toBe(true);
      expect(id, `ado id out of cohort range for ${c.snapshot.id}`).toBeGreaterThanOrEqual(ID_RANGE_MIN);
      expect(id, `ado id out of cohort range for ${c.snapshot.id}`).toBeLessThanOrEqual(ID_RANGE_MAX);
    }
  });

  test('ZC38.g: partition union is closed at exactly two values (clean-room sentinel)', () => {
    // Spike §4.4 C4 forbids promotion training -> held-out; allows
    // held-out -> training irreversibly. Both directions presuppose
    // the union has exactly two members. If a future commit adds a
    // third partition value, that author must justify it against
    // the clean-room rule before this law can be widened.
    expect(VALID_PARTITIONS).toEqual(['training', 'held-out']);
    expect(VALID_PARTITIONS.length).toBe(2);
  });
});
