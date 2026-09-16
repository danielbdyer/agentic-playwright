/**
 * Study partition laws — the clean-room rule at route granularity
 * (docs/v2-cold-start-cohort-spike.md §4.4, applied to a real
 * Reactive host in workshop/substrate-study/corpus/).
 *
 *   L-Partition-Declared:      the manifest loads and reports zero
 *                              structural violations (disjoint
 *                              route classes; held-out room remains).
 *   L-HeldOut-Refused:         every heldOut and outOfScope route,
 *                              and any undeclared route, is refused
 *                              by assertHarvestAllowed with a
 *                              HeldOutRouteContactAttempt.
 *   L-Study-Allowed:           every study route is allowed, in bare,
 *                              absolute, trailing-slash, and query
 *                              forms.
 *   L-Foreign-Origin-Refused:  a URL outside the declared base is
 *                              refused even if its path matches a
 *                              study route name.
 */

import { describe, test, expect } from 'vitest';
import {
  assertHarvestAllowed,
  classifyRoute,
  harvestAllowed,
  HeldOutRouteContactAttempt,
  loadStudyPartition,
  partitionViolations,
  routeOf,
} from '../../workshop/substrate-study/application/study-partition';

const ROOT = process.cwd();
const manifest = loadStudyPartition(ROOT, 'outsystems-ui-website');

describe('Study partition — clean-room laws', () => {
  test('L-Partition-Declared: manifest loads with zero violations', () => {
    expect(manifest.$schemaVersion).toBe(1);
    expect(manifest.baseUrl.endsWith('/')).toBe(true);
    expect(partitionViolations(manifest)).toEqual([]);
    expect(manifest.routes.heldOut.length).toBeGreaterThan(0);
  });

  test('L-HeldOut-Refused: held-out, out-of-scope, and undeclared routes are refused', () => {
    for (const route of [...manifest.routes.heldOut, ...manifest.routes.outOfScope, 'NotADeclaredScreen']) {
      const url = `${manifest.baseUrl}${route}`;
      expect(harvestAllowed(manifest, url)).toBe(false);
      expect(() => assertHarvestAllowed(manifest, url)).toThrow(HeldOutRouteContactAttempt);
    }
    expect(classifyRoute(manifest, `${manifest.baseUrl}${manifest.routes.heldOut[0]}`)).toBe('held-out');
    expect(classifyRoute(manifest, `${manifest.baseUrl}${manifest.routes.outOfScope[0]}`)).toBe('out-of-scope');
    expect(classifyRoute(manifest, `${manifest.baseUrl}NotADeclaredScreen`)).toBe('unknown');
  });

  test('L-Study-Allowed: study routes are allowed in every URL spelling', () => {
    for (const route of manifest.routes.study) {
      const spellings = [
        route,
        `${manifest.baseUrl}${route}`,
        `${manifest.baseUrl}${route}/`,
        `${manifest.baseUrl}${route}?x=1#frag`,
      ];
      for (const spelling of spellings) {
        expect(classifyRoute(manifest, spelling)).toBe('study');
        expect(() => assertHarvestAllowed(manifest, spelling.startsWith('http') ? spelling : `${manifest.baseUrl}${spelling}`)).not.toThrow();
      }
    }
    expect(routeOf(manifest, manifest.baseUrl)).toBe('');
    expect(routeOf(manifest, manifest.baseUrl.replace(/\/$/, ''))).toBe('');
  });

  test('L-Foreign-Origin-Refused: a study route name on another origin is refused', () => {
    const foreign = `https://example.invalid/OutSystemsUIWebsite/${manifest.routes.study[1]}`;
    expect(harvestAllowed(manifest, foreign)).toBe(false);
    expect(() => assertHarvestAllowed(manifest, foreign)).toThrow(HeldOutRouteContactAttempt);
  });

  test('L-Partition-Violations-Detected: overlapping or empty classes are reported', () => {
    const overlapping = {
      ...manifest,
      routes: { study: ['A', 'B'], heldOut: ['b', 'C'], outOfScope: ['C'] },
    };
    const violations = partitionViolations(overlapping);
    expect(violations.some((v) => v.includes("'b' is both study and heldOut"))).toBe(true);
    expect(violations.some((v) => v.includes("'c' is both heldOut and outOfScope"))).toBe(true);
    const spent = { ...manifest, routes: { study: ['A'], heldOut: [], outOfScope: [] } };
    expect(partitionViolations(spent).some((v) => v.includes('no held-out routes remain'))).toBe(true);
  });
});
