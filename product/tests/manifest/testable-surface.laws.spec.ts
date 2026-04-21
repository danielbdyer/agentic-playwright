/**
 * TestableSurface laws — the pure projection from the manifest
 * into the tuple workshop's probe-derivation reads.
 *
 * Pins:
 *   L1. Every declared verb projects to exactly one TestableSurface.
 *   L2. projectManifestToTestableSurfaces preserves verb order.
 *   L3. Every TestableSurface carries a composition-path from the
 *       closed CompositionPathKind union (compile-time by virtue
 *       of the fold; runtime asserted against the default mapper).
 *   L4. foldCompositionPath is exhaustive — every composition-path
 *       kind lands in exactly one branch.
 *   L5. defaultCompositionPathForCategory is total over VerbCategory.
 *   L6. The error-family list on a TestableSurface is the verb's
 *       declared list, unmodified.
 *
 * @see docs/v2-direction.md §6 Step 5
 * @see product/domain/manifest/testable-surface.ts
 */

import { describe, test, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Manifest } from '../../domain/manifest/manifest';
import type { VerbCategory } from '../../domain/manifest/verb-entry';
import {
  projectManifestToTestableSurfaces,
  projectVerbToTestableSurface,
  defaultCompositionPathForCategory,
  foldCompositionPath,
  type CompositionPath,
  type CompositionPathKind,
} from '../../domain/manifest/testable-surface';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function loadManifest(): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json'), 'utf-8'),
  ) as Manifest;
}

describe('TestableSurface laws', () => {
  test('L1: every declared verb projects to exactly one TestableSurface', () => {
    const manifest = loadManifest();
    const surfaces = projectManifestToTestableSurfaces(manifest);
    expect(surfaces).toHaveLength(manifest.verbs.length);
    for (let i = 0; i < manifest.verbs.length; i++) {
      expect(surfaces[i]!.verb).toBe(manifest.verbs[i]!.name);
    }
  });

  test('L2: projection preserves verb order', () => {
    const manifest = loadManifest();
    const surfaces = projectManifestToTestableSurfaces(manifest);
    expect(surfaces.map((s) => s.verb)).toEqual(manifest.verbs.map((v) => v.name));
  });

  test('L3: every TestableSurface carries a composition-path with a closed-union kind', () => {
    const manifest = loadManifest();
    const surfaces = projectManifestToTestableSurfaces(manifest);
    const validKinds: ReadonlySet<CompositionPathKind> = new Set<CompositionPathKind>([
      'atomic',
      'memory-read',
      'memory-write',
      'world-observation',
      'external-source',
      'ledger-append',
      'unfixturable',
    ]);
    for (const surface of surfaces) {
      expect(validKinds.has(surface.compositionPath.kind)).toBe(true);
    }
  });

  test('L4: foldCompositionPath lands every kind in exactly one branch', () => {
    const pathsToTest: readonly CompositionPath[] = [
      { kind: 'atomic' },
      { kind: 'memory-read', catalogScope: 'global' },
      { kind: 'memory-write', catalogScope: 'screen-scoped' },
      { kind: 'world-observation', substrate: 'synthetic' },
      { kind: 'external-source', sourceTag: 'ado' },
      { kind: 'ledger-append', ledgerName: 'proposals' },
      { kind: 'unfixturable', reason: 'open-prompt' },
    ];
    const tagged = pathsToTest.map((p) =>
      foldCompositionPath(p, {
        atomic: () => 'atomic',
        memoryRead: () => 'memory-read',
        memoryWrite: () => 'memory-write',
        worldObservation: () => 'world-observation',
        externalSource: () => 'external-source',
        ledgerAppend: () => 'ledger-append',
        unfixturable: () => 'unfixturable',
      }),
    );
    expect(tagged).toEqual(pathsToTest.map((p) => p.kind));
  });

  test('L5: defaultCompositionPathForCategory is total over VerbCategory', () => {
    const categories: readonly VerbCategory[] = [
      'intent',
      'observe',
      'interact',
      'memory',
      'reason',
      'compose',
      'execute',
      'governance',
      'diagnostic',
    ];
    for (const cat of categories) {
      const path = defaultCompositionPathForCategory(cat);
      // No exception thrown; `kind` is a member of the closed union.
      expect(typeof path.kind).toBe('string');
    }
  });

  test('L6: TestableSurface preserves the verb\'s declared error-family list unmodified', () => {
    const manifest = loadManifest();
    for (const verb of manifest.verbs) {
      const surface = projectVerbToTestableSurface(verb);
      expect(surface.errorFamilies).toEqual(verb.errorFamilies);
    }
  });

  test('The current 8 manifest verbs classify across 4 composition paths', () => {
    // Manifest snapshot at Step-5 entry: 8 verbs, categories
    // (intent × 1, observe × 1, interact × 1, compose × 1, memory × 4).
    // Confirms the default classifier decomposes them as expected.
    const manifest = loadManifest();
    const byKind = new Map<CompositionPathKind, string[]>();
    for (const verb of manifest.verbs) {
      const surface = projectVerbToTestableSurface(verb);
      const existing = byKind.get(surface.compositionPath.kind) ?? [];
      byKind.set(surface.compositionPath.kind, [...existing, verb.name]);
    }
    // At the Step-5 entry, we expect the distribution:
    //   external-source:   1 (intent-fetch)
    //   world-observation: 2 (observe, interact)
    //   atomic:            1 (test-compose)
    //   memory-read:       4 (facet-mint, facet-query, facet-enrich, locator-health-track)
    // The memory verbs all default to memory-read today; fixture
    // overrides will refine facet-mint/enrich/locator-health-track
    // to memory-write / ledger-append in later commits.
    expect(byKind.get('external-source')).toEqual(['intent-fetch']);
    expect(byKind.get('world-observation')?.sort()).toEqual(['interact', 'observe']);
    expect(byKind.get('atomic')).toEqual(['test-compose']);
    expect((byKind.get('memory-read') ?? []).length).toBe(4);
  });
});
