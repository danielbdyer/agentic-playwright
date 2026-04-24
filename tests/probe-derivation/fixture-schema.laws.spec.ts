/**
 * Fixture schema architecture laws (Z11g.a).
 *
 * Walk every `*.probe.yaml` under `product/` and pin two
 * contracts the substrate-ladder plan commits to at
 * `docs/v2-substrate-ladder-plan.md §§5.2, 9.1`:
 *
 *   L-Fixture-Schema:
 *     Every probe fixture validates against the schema-1
 *     grammar. Top-level keys are exactly
 *     {verb, schemaVersion, fixtures} (+ optional
 *     `syntheticInput`). Unknown top-level keys fail the
 *     build. `parseFixtureDocument` parses without throwing.
 *
 *   L-Fixture-World-Manifest-Aligned:
 *     Every fixture's declared `expected.error-family` (when
 *     non-null) is a member of the manifest's
 *     `errorFamilies` list for that verb. A fixture that
 *     declares an error family the manifest does not know
 *     about is a manifest-drift build error.
 *
 * These laws are the cold gate the cross-rung parity laws
 * of Z11g.b rely on: if fixtures drift from the manifest or
 * the schema grammar, cross-rung parity has no stable
 * denominator.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { parseFixtureDocument } from '../../workshop/probe-derivation/fixture-loader';
import type { Manifest } from '../../product/domain/manifest/manifest';

const REPO_ROOT = path.resolve(__dirname, '../..');
const PRODUCT_ROOT = path.join(REPO_ROOT, 'product');
const MANIFEST_PATH = path.join(PRODUCT_ROOT, 'manifest/manifest.json');

/** Schema-1 top-level key allowlist per plan §5.2. */
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'verb',
  'schemaVersion',
  'fixtures',
  'syntheticInput',
]);

function walkProbeFixtures(rootDir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(rootDir);
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Recurse, but skip node_modules / dist if they creep into product.
      if (entry === 'node_modules' || entry === 'dist') continue;
      results.push(...walkProbeFixtures(fullPath));
    } else if (entry.endsWith('.probe.yaml')) {
      results.push(fullPath);
    }
  }
  return results;
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
}

describe('fixture schema architecture laws (Z11g.a)', () => {
  const fixturePaths = walkProbeFixtures(PRODUCT_ROOT);

  test('fixtures-exist: the audit scope is non-empty', () => {
    // Sanity: prevents a silent pass if the walker stops finding
    // fixtures (e.g., a refactor moves them outside product/).
    expect(fixturePaths.length).toBeGreaterThan(0);
  });

  test('L-Fixture-Schema (top-level-keys): every fixture uses only schema-1 top-level keys', () => {
    for (const fixturePath of fixturePaths) {
      const raw = YAML.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>;
      const actualKeys = Object.keys(raw);
      const unknownKeys = actualKeys.filter((k) => !ALLOWED_TOP_LEVEL_KEYS.has(k));
      expect(
        unknownKeys,
        `${path.relative(REPO_ROOT, fixturePath)}: unknown top-level keys ${JSON.stringify(unknownKeys)}. Allowed: ${JSON.stringify([...ALLOWED_TOP_LEVEL_KEYS])}`,
      ).toEqual([]);
    }
  });

  test('L-Fixture-Schema (parser-clean): every fixture parses without grammar violation', () => {
    for (const fixturePath of fixturePaths) {
      const yamlText = readFileSync(fixturePath, 'utf-8');
      expect(() => parseFixtureDocument(yamlText, fixturePath)).not.toThrow();
    }
  });

  test('L-Fixture-World-Manifest-Aligned: every fixture error-family is manifest-declared for its verb', () => {
    const manifest = loadManifest();
    const errorFamiliesByVerb = new Map<string, ReadonlySet<string>>();
    for (const verb of manifest.verbs) {
      errorFamiliesByVerb.set(verb.name, new Set(verb.errorFamilies ?? []));
    }
    for (const fixturePath of fixturePaths) {
      const doc = parseFixtureDocument(readFileSync(fixturePath, 'utf-8'), fixturePath);
      const known = errorFamiliesByVerb.get(doc.verb);
      expect(
        known,
        `${path.relative(REPO_ROOT, fixturePath)}: verb "${doc.verb}" is not declared in the manifest`,
      ).toBeDefined();
      for (const fx of doc.fixtures) {
        if (fx.expected.errorFamily === null) continue;
        expect(
          known!.has(fx.expected.errorFamily),
          `${path.relative(REPO_ROOT, fixturePath)}: fixture "${fx.name}" declares error-family "${fx.expected.errorFamily}", which is not in manifest.verbs[${doc.verb}].errorFamilies: ${JSON.stringify([...known!])}`,
        ).toBe(true);
      }
    }
  });
});
