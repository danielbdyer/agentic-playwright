/**
 * Catalog-driven generation laws (Z11g.c).
 *
 * Pin the anti-parallel-apparatus discipline from the substrate-
 * ladder plan (`docs/v2-substrate-ladder-plan.md §§5.5, 9.3`):
 * the synthetic-app's `SurfaceRenderer` must be a total projection
 * of `workshop/substrate/`'s `SurfaceRole` closed union. A role
 * in the union without a renderer projection is a build break;
 * a renderer handler without a projection entry is a law
 * violation.
 *
 *   L-CatalogDriven:
 *     `SURFACE_ROLE_PROJECTION` is keyed by exactly the
 *     `SURFACE_ROLE_VALUES` set (no missing, no orphan).
 *     TypeScript provides the first gate at type-check time;
 *     a runtime symmetric-difference check provides the second.
 *
 *   L-Projection-Total:
 *     Every role in `SURFACE_ROLE_VALUES` has a declared
 *     strategy in the projection record.
 *
 *   L-Projection-Terminal:
 *     Every `'specialized'` projection entry corresponds to an
 *     explicit `if (spec.role === '<role>')` branch in
 *     `SurfaceRenderer.tsx`; every `'generic'` entry is absent
 *     from that grep (actually falls through to the catchall).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SURFACE_ROLE_VALUES } from '../../workshop/substrate/surface-spec';
import {
  SURFACE_ROLE_PROJECTION,
  type SurfaceRoleProjection,
} from '../../workshop/synthetic-app/catalog-projection';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SURFACE_RENDERER_PATH = path.join(
  REPO_ROOT,
  'workshop/synthetic-app/src/SurfaceRenderer.tsx',
);

describe('catalog-driven generation laws (Z11g.c)', () => {
  test('L-CatalogDriven: projection record keys match SURFACE_ROLE_VALUES exactly', () => {
    const projectionKeys = new Set(Object.keys(SURFACE_ROLE_PROJECTION));
    const roleValues = new Set<string>(SURFACE_ROLE_VALUES);
    // Missing: roles in the union without a projection entry.
    // (Caught at type-check, but the runtime check survives
    // casts and adds a legible failure message.)
    const missing = [...roleValues].filter((r) => !projectionKeys.has(r));
    expect(missing, `roles missing from SURFACE_ROLE_PROJECTION: ${JSON.stringify(missing)}`).toEqual([]);
    // Orphan: projection entries that don't correspond to a role.
    const orphan = [...projectionKeys].filter((k) => !roleValues.has(k));
    expect(orphan, `orphan keys in SURFACE_ROLE_PROJECTION: ${JSON.stringify(orphan)}`).toEqual([]);
  });

  test('L-Projection-Total: every role has a strategy + non-empty rationale', () => {
    for (const role of SURFACE_ROLE_VALUES) {
      const entry = SURFACE_ROLE_PROJECTION[role];
      expect(entry, `missing projection for role "${role}"`).toBeDefined();
      expect(entry.strategy).toMatch(/^(specialized|generic)$/);
      expect(entry.rationale.length).toBeGreaterThan(0);
    }
  });

  test('L-Projection-Terminal: specialized entries have explicit renderer branches; generic entries do not', () => {
    const rendererSource = readFileSync(SURFACE_RENDERER_PATH, 'utf-8');
    const specialized: string[] = [];
    const generic: string[] = [];
    for (const role of SURFACE_ROLE_VALUES) {
      const entry: SurfaceRoleProjection = SURFACE_ROLE_PROJECTION[role];
      if (entry.strategy === 'specialized') specialized.push(role);
      else generic.push(role);
    }
    const hasExplicitBranch = (role: string): boolean =>
      // Match either `spec.role === 'X'` or `case 'X':` in the
      // renderer source; both patterns can evolve without the law
      // forcing a specific shape.
      new RegExp(
        `spec\\.role\\s*===\\s*['"]${role}['"]|case\\s+['"]${role}['"]\\s*:`,
      ).test(rendererSource);

    // Specialized: every entry must have a branch.
    const specializedMissingBranch = specialized.filter((r) => !hasExplicitBranch(r));
    expect(
      specializedMissingBranch,
      `specialized projection entries without a matching renderer branch: ${JSON.stringify(specializedMissingBranch)}`,
    ).toEqual([]);

    // Generic: no entry should have a branch (that'd make the
    // strategy misclassified).
    const genericWithBranch = generic.filter((r) => hasExplicitBranch(r));
    expect(
      genericWithBranch,
      `generic projection entries with an explicit renderer branch (should be reclassified 'specialized'): ${JSON.stringify(genericWithBranch)}`,
    ).toEqual([]);
  });

  test('sanity: SURFACE_ROLE_VALUES exists and is non-empty', () => {
    // Prevents a silent pass if the array gets emptied by mistake
    // — the other laws would all pass vacuously.
    expect(SURFACE_ROLE_VALUES.length).toBeGreaterThan(0);
    // Mirror discipline: the count should match the type's
    // declared size. If this assertion fires after a legitimate
    // addition to the union, update both this number and the
    // SURFACE_ROLE_VALUES array in the same commit — that's the
    // anti-parallel-apparatus discipline at work.
    expect(SURFACE_ROLE_VALUES.length).toBe(28);
  });
});
