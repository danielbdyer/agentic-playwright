/**
 * ManifestCone laws.
 *
 *   L-Apex-Preserved:           cone.apex === supplied manifest.
 *   L-BaseNames-Closed:         baseNames is the closed set
 *                               registered in the type.
 *   L-Projection-Order-Stable:  projection() preserves
 *                               manifest.verbs order.
 *   L-Missing-Empty-When-Total: when lookup never returns null,
 *                               missingProjections is empty.
 *   L-Missing-All-When-Empty:   when lookup always returns null,
 *                               missingProjections is the full
 *                               verb set.
 */

import { describe, test, expect } from 'vitest';
import {
  manifestCone,
  type ManifestBaseProjection,
} from '../../product/domain/manifest/manifest-cone';
import type { Manifest } from '../../product/domain/manifest/manifest';
import type { VerbEntry } from '../../product/domain/manifest/verb-entry';

const stubManifest: Manifest = {
  kind: 'product-manifest',
  version: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  verbs: [
    { name: 'observe', category: 'observation' } as unknown as VerbEntry,
    { name: 'interact', category: 'interact' } as unknown as VerbEntry,
    { name: 'navigate', category: 'interact' } as unknown as VerbEntry,
  ],
};

describe('ManifestCone', () => {
  const cone = manifestCone(stubManifest);

  test('L-Apex-Preserved: cone.apex is the supplied manifest', () => {
    expect(cone.apex).toBe(stubManifest);
  });

  test('L-BaseNames-Closed: baseNames covers the registered projections', () => {
    const expected: readonly ManifestBaseProjection[] = [
      'probe-fixture',
      'verb-classifier',
      'rung3-classifier',
      'runtime-handler',
      'mcp-tool',
    ];
    expect(cone.baseNames).toEqual(expected);
  });

  test('L-Projection-Order-Stable: projection() preserves verbs order', () => {
    const result = cone.projection('probe-fixture', () => 'present' as const);
    expect(result.map((e) => e.verb.name)).toEqual(['observe', 'interact', 'navigate']);
  });

  test('L-Missing-Empty-When-Total: missingProjections returns [] when lookup never returns null', () => {
    const missing = cone.missingProjections(
      'verb-classifier',
      () => 'always-found',
    );
    expect(missing).toEqual([]);
  });

  test('L-Missing-All-When-Empty: missingProjections returns full verb set when lookup always returns null', () => {
    const missing = cone.missingProjections('mcp-tool', () => null);
    expect(missing.map((v) => v.name)).toEqual(['observe', 'interact', 'navigate']);
  });

  test('partial-projection: missingProjections returns only verbs lacking the projection', () => {
    const missing = cone.missingProjections(
      'rung3-classifier',
      (verb) => (verb.name === 'observe' ? 'has-classifier' : null),
    );
    expect(missing.map((v) => v.name)).toEqual(['interact', 'navigate']);
  });
});
