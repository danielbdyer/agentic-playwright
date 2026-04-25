/**
 * PartialIso<A, B> abstraction laws + applications.
 *
 *   L-Forward-RoundTrip: inverse(forward(a)) ≡ a for every a.
 *   L-Invalid-Inverse: malformed B values return null from
 *     inverse.
 *
 * Applied to:
 *   - Cohort ⇄ string  (cohortIso)
 *   - WorldShape ⇄ URL (worldShapeUrlIso)
 */

import { describe, test, expect } from 'vitest';
import { partialIsoLaws } from '../../product/domain/algebra/partial-iso';
import { cohortIso, type Cohort } from '../../workshop/compounding/domain/cohort';
import {
  worldShapeUrlIso,
  type WorldShape,
} from '../../workshop/substrate/world-shape';
import type { SurfaceSpec } from '../../workshop/substrate/surface-spec';

describe('PartialIso<A, B> applications', () => {
  describe('cohortIso', () => {
    const cohorts: readonly Cohort[] = [
      {
        kind: 'probe-surface',
        cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
      },
      {
        kind: 'scenario-trajectory',
        scenarioId: 'scenario-1',
        topologyId: 'topology-A',
      },
      { kind: 'customer-compilation', corpus: 'resolvable' },
    ];

    test('L-Forward-RoundTrip + L-Invalid-Inverse via partialIsoLaws', () => {
      const report = partialIsoLaws({
        iso: cohortIso,
        forwardSamples: cohorts,
        invalidInverseSamples: ['garbage', 'probe-surface:bad', ''],
      });
      expect(report.violations).toEqual([]);
    });
  });

  describe('worldShapeUrlIso', () => {
    const surfaceA: SurfaceSpec = { role: 'button', name: 'A' };
    const shapes: readonly WorldShape[] = [
      { surfaces: [] },
      { surfaces: [surfaceA] },
      { surfaces: [surfaceA], preset: 'login-form' },
    ];

    test('L-Forward-RoundTrip + L-Invalid-Inverse via partialIsoLaws', () => {
      const iso = worldShapeUrlIso('http://example.com/');
      const report = partialIsoLaws({
        iso,
        forwardSamples: shapes,
        invalidInverseSamples: [
          'http://example.com/no-query',
          'http://example.com/?other=foo',
          'http://example.com/?shape=not-json',
        ],
      });
      expect(report.violations).toEqual([]);
    });
  });
});
