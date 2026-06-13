/**
 * Unified pattern-registry resolution laws (Cycle 11 / G7).
 *
 * Praxis audit §G7: the product's pattern/matcher kernel never
 * executed against a real page (`surfaceIndexFromStage` returned
 * EMPTY). These laws prove the cohort's structured rung now runs
 * the product's ACTUAL registry over a built SurfaceIndex — the
 * unification, exercised purely (the browser harvest is integration-
 * tested by the live cohort run).
 *
 *   ZC51     a unique role+name surface resolves via the product
 *            registry (role-and-name-exact).
 *   ZC51.b   a unique role+name-substring surface resolves
 *            (role-and-name-substring).
 *   ZC51.c   a link inside a navigation landmark resolves via the
 *            product's link-in-nav-landmark matcher.
 *   ZC51.d   ambiguous (two same-role+name) surfaces → no structured
 *            match (the cohort falls through to the degraded rung).
 *   ZC51.e   no surface of the role → no structured match.
 */

import { describe, test, expect } from 'vitest';
import { surfaceIndexFromList } from '../../product/domain/resolution/patterns/surface-index';
import type { IndexedSurface, ClassifiedIntent } from '../../product/domain/resolution/patterns/rung-kernel';
import { resolveViaPatternRegistry } from '../../workshop/customer-backlog/application/surface-harvest';

function intent(over: Partial<ClassifiedIntent['targetShape']> & { verb?: ClassifiedIntent['verb'] }): ClassifiedIntent {
  const { verb = 'click', ...shape } = over;
  return { verb, targetShape: shape, originalActionText: 'test' };
}

function surface(over: Partial<IndexedSurface>): IndexedSurface {
  return { surfaceId: 's', role: 'button', name: null, landmarkRole: null, classes: [], ...over };
}

describe('Cycle 11 / G7 — product pattern registry over a live SurfaceIndex', () => {
  test('ZC51: unique role+name resolves via the product registry', () => {
    const index = surfaceIndexFromList([
      surface({ surfaceId: 'b0', role: 'button', name: 'Submit' }),
      surface({ surfaceId: 'b1', role: 'button', name: 'Cancel' }),
    ]);
    const candidate = resolveViaPatternRegistry(intent({ role: 'button', name: 'Submit' }), index);
    expect(candidate).not.toBeNull();
    expect(candidate!.targetSurfaceId).toBe('b0');
  });

  test('ZC51.b: unique role+name-substring resolves', () => {
    const index = surfaceIndexFromList([
      surface({ surfaceId: 'b0', role: 'button', name: 'Submit Order' }),
      surface({ surfaceId: 'b1', role: 'button', name: 'Cancel' }),
    ]);
    const candidate = resolveViaPatternRegistry(intent({ role: 'button', nameSubstring: 'submit' }), index);
    expect(candidate).not.toBeNull();
    expect(candidate!.targetSurfaceId).toBe('b0');
  });

  test('ZC51.c: a link inside a navigation landmark resolves via link-in-nav', () => {
    const index = surfaceIndexFromList([
      surface({ surfaceId: 'nav', role: 'navigation', landmarkRole: 'navigation' }),
      surface({ surfaceId: 'l0', role: 'link', name: 'Dashboard', landmarkRole: 'navigation' }),
    ]);
    const candidate = resolveViaPatternRegistry(intent({ verb: 'click', role: 'link', name: 'Dashboard' }), index);
    expect(candidate).not.toBeNull();
    expect(candidate!.targetSurfaceId).toBe('l0');
  });

  test('ZC51.d: ambiguous role+name → no structured match (falls through)', () => {
    const index = surfaceIndexFromList([
      surface({ surfaceId: 'b0', role: 'button', name: 'Submit' }),
      surface({ surfaceId: 'b1', role: 'button', name: 'Submit' }),
    ]);
    expect(resolveViaPatternRegistry(intent({ role: 'button', name: 'Submit' }), index)).toBeNull();
  });

  test('ZC51.e: no surface of the role → no structured match', () => {
    const index = surfaceIndexFromList([surface({ surfaceId: 'l0', role: 'link', name: 'Submit' })]);
    expect(resolveViaPatternRegistry(intent({ role: 'button', name: 'Submit' }), index)).toBeNull();
  });
});
