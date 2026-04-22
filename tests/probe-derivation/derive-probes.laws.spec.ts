/**
 * Probe IR spike — laws for the Step 5 probe-derivation pass.
 *
 * Verifies:
 *   - The fixture-spec parser accepts the three representative
 *     fixture files.
 *   - The derivation pass turns the manifest × fixtures into the
 *     expected `Probe[]`.
 *   - The coverage summary reports the expected buckets.
 *   - The spike-gate (≥80%) is an explicit pass/fail computation.
 *
 * @see docs/v2-direction.md §6 Step 5
 * @see docs/v2-substrate.md §6a
 */

import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Manifest } from '../../product/domain/manifest/manifest';
import {
  parseFixtureDocument,
  loadFixtureDocumentForVerb,
} from '../../workshop/probe-derivation/fixture-loader';
import {
  deriveProbesFromInputs,
  deriveProbesFromDisk,
} from '../../workshop/probe-derivation/derive-probes';
import {
  summarizeCoverage,
  COVERAGE_PASS_THRESHOLD,
  type ProbeFixtureDocument,
} from '../../workshop/probe-derivation/probe-ir';

const REPO_ROOT = path.resolve(__dirname, '../..');

function loadManifest(): Manifest {
  const p = path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json');
  return JSON.parse(readFileSync(p, 'utf-8')) as Manifest;
}

describe('probe IR fixture-loader laws', () => {
  test('loads the observe.probe.yaml fixture and parses 2 fixtures', () => {
    const doc = loadFixtureDocumentForVerb(
      REPO_ROOT,
      'observe',
      'product/instruments/observation/aria.ts',
    );
    expect(doc).not.toBeNull();
    expect(doc!.verb).toBe('observe');
    expect(doc!.schemaVersion).toBe(1);
    expect(doc!.fixtures).toHaveLength(2);
    expect(doc!.fixtures[0]!.name).toBe('visible-button-on-known-screen');
    expect(doc!.fixtures[0]!.expected.classification).toBe('matched');
    expect(doc!.fixtures[0]!.expected.errorFamily).toBeNull();
    expect(doc!.fixtures[1]!.expected.errorFamily).toBe('not-visible');
  });

  test('loads the test-compose.probe.yaml fixture', () => {
    const doc = loadFixtureDocumentForVerb(
      REPO_ROOT,
      'test-compose',
      'product/instruments/codegen/spec-codegen.ts',
    );
    expect(doc).not.toBeNull();
    expect(doc!.verb).toBe('test-compose');
    // Gap-4 resolution (Slice C): test-compose's manifest entry
    // now declares assertion-like; the failed-path fixture
    // retargets to that family. The validator IS an assertion,
    // so shape-validation failures classify there.
    expect(doc!.fixtures.some((f) => f.expected.errorFamily === 'assertion-like')).toBe(true);
  });

  test('loads the facet-query.probe.yaml fixture', () => {
    const doc = loadFixtureDocumentForVerb(
      REPO_ROOT,
      'facet-query',
      'product/domain/memory/facet-record.ts',
    );
    // facet-query declares declaredIn = product/domain/memory/facet-record.ts
    // which shares a folder with facet-query.probe.yaml — exactly the
    // co-location discipline readiness §4.3 names.
    expect(doc).not.toBeNull();
    expect(doc!.verb).toBe('facet-query');
    expect(doc!.fixtures).toHaveLength(3);
  });

  test('parseFixtureDocument rejects a non-mapping root', () => {
    expect(() => parseFixtureDocument('- just-a-list', 'test.yaml')).toThrow();
  });

  test('parseFixtureDocument rejects unknown classification values', () => {
    const bad = [
      'verb: observe',
      'schemaVersion: 1',
      'fixtures:',
      '  - name: x',
      '    description: x',
      '    input: {}',
      '    expected:',
      '      classification: mystery',
      '      error-family: null',
    ].join('\n');
    expect(() => parseFixtureDocument(bad, 'test.yaml')).toThrow(/classification/);
  });

  test('parseFixtureDocument accepts syntheticInput: true with no fixtures', () => {
    const doc = parseFixtureDocument(
      ['verb: reason-synthesize', 'schemaVersion: 1', 'syntheticInput: true', 'fixtures: []'].join('\n'),
      'test.yaml',
    );
    expect(doc.syntheticInput).toBe(true);
    expect(doc.fixtures).toHaveLength(0);
  });
});

describe('probe derivation laws', () => {
  test('deriveProbesFromInputs produces a probe per fixture entry', () => {
    const manifest: Manifest = {
      kind: 'product-manifest',
      version: 1,
      generatedAt: '2026-04-19T00:00:00.000Z',
      verbs: [
        {
          name: 'observe',
          category: 'observe',
          summary: '',
          inputs: { typeName: 'X', declaredIn: 'X' },
          outputs: { typeName: 'Y', declaredIn: 'Y' },
          errorFamilies: [],
          sinceVersion: '2.1.0',
          declaredIn: 'stub',
        },
      ],
    };
    const fixtureDoc: ProbeFixtureDocument = {
      verb: 'observe',
      schemaVersion: 1,
      declaredIn: 'observe.probe.yaml',
      fixtures: [
        {
          name: 'a',
          description: 'A',
          input: {},
          expected: { classification: 'matched', errorFamily: null },
        },
        {
          name: 'b',
          description: 'B',
          input: {},
          expected: { classification: 'failed', errorFamily: 'timeout' },
        },
      ],
    };
    const fixtureByVerb = new Map([['observe', fixtureDoc]]);
    const derivation = deriveProbesFromInputs({ manifest, fixtureByVerb });
    expect(derivation.probes).toHaveLength(2);
    expect(derivation.probes[0]!.id).toBe('probe:observe:a');
    expect(derivation.probes[1]!.id).toBe('probe:observe:b');
    expect(derivation.uncoveredVerbs).toEqual([]);
    expect(derivation.unfixturableVerbs).toEqual([]);
  });

  test('verbs with no fixture land in uncoveredVerbs', () => {
    const manifest: Manifest = {
      kind: 'product-manifest',
      version: 1,
      generatedAt: '2026-04-19T00:00:00.000Z',
      verbs: [
        {
          name: 'orphan',
          category: 'diagnostic',
          summary: '',
          inputs: { typeName: 'X', declaredIn: 'X' },
          outputs: { typeName: 'Y', declaredIn: 'Y' },
          errorFamilies: [],
          sinceVersion: '2.1.0',
          declaredIn: 'stub',
        },
      ],
    };
    const derivation = deriveProbesFromInputs({ manifest, fixtureByVerb: new Map() });
    expect(derivation.probes).toHaveLength(0);
    expect(derivation.uncoveredVerbs).toEqual(['orphan']);
  });

  test('verbs with syntheticInput land in unfixturableVerbs', () => {
    const manifest: Manifest = {
      kind: 'product-manifest',
      version: 1,
      generatedAt: '2026-04-19T00:00:00.000Z',
      verbs: [
        {
          name: 'reason-synthesize',
          category: 'reason',
          summary: '',
          inputs: { typeName: 'X', declaredIn: 'X' },
          outputs: { typeName: 'Y', declaredIn: 'Y' },
          errorFamilies: [],
          sinceVersion: '2.1.0',
          declaredIn: 'stub',
        },
      ],
    };
    const doc: ProbeFixtureDocument = {
      verb: 'reason-synthesize',
      schemaVersion: 1,
      fixtures: [],
      syntheticInput: true,
      declaredIn: 'reason-synthesize.probe.yaml',
    };
    const derivation = deriveProbesFromInputs({
      manifest,
      fixtureByVerb: new Map([['reason-synthesize', doc]]),
    });
    expect(derivation.probes).toHaveLength(0);
    expect(derivation.unfixturableVerbs).toEqual(['reason-synthesize']);
    expect(derivation.uncoveredVerbs).toEqual([]);
  });
});

describe('spike coverage verdict', () => {
  test('threshold is 80% per the spike protocol', () => {
    expect(COVERAGE_PASS_THRESHOLD).toBe(0.8);
  });

  test('summarizeCoverage computes buckets and passesGate', () => {
    const report = summarizeCoverage({
      derivation: {
        probes: Array.from({ length: 4 }, (_, i) => ({
          id: `probe:v:${i}`,
          verb: 'v',
          fixtureName: String(i),
          declaredIn: 'x',
          expected: { classification: 'matched' as const, errorFamily: null },
          input: {},
          worldSetup: undefined,
          exercises: [],
        })),
        uncoveredVerbs: ['w'],
        unfixturableVerbs: [],
      },
      totalDeclaredVerbs: 5,
      probesCompletingAsExpected: 4,
    });
    expect(report.coveredVerbs).toBe(4);
    expect(report.coveragePercentage).toBeCloseTo(0.8);
    expect(report.passesGate).toBe(true);
  });

  test('the Step 5 spike against the current manifest produces a coverage verdict', () => {
    const { manifest, derivation } = deriveProbesFromDisk(REPO_ROOT);
    const report = summarizeCoverage({
      derivation,
      totalDeclaredVerbs: manifest.verbs.length,
      probesCompletingAsExpected: derivation.probes.length, // Step 5 stub: assume all complete
    });
    // The current manifest has 8 verbs; Step 5 now covers all 8.
    // Coverage = 8/8 = 100% ≥ 80% — gate PASSES. Every declared
    // verb has a fixture YAML; the probe-IR surface is complete
    // for the manifest v1 seed set.
    expect(report.totalDeclaredVerbs).toBe(manifest.verbs.length);
    expect(report.coveredVerbs).toBe(8);
    expect(report.uncoveredVerbs).toEqual([]);
    // The coverage gate is passing at the maximum — the probe IR's
    // structural floor is live and its ceiling for the seed manifest
    // is reached. Per docs/v2-probe-ir-spike.md §7, this is one
    // of three graduation verdicts the spike must produce.
    expect(report.passesGate).toBe(true);
    // Every synthesized probe carries its fixture's expected
    // classification and a valid probe ID.
    for (const probe of derivation.probes) {
      expect(probe.id).toMatch(/^probe:[^:]+:[^:]+$/);
      expect(['matched', 'failed', 'ambiguous']).toContain(probe.expected.classification);
    }
  });
});
