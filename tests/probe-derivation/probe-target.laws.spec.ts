/**
 * ProbeTarget — laws for the target grammar rung-2 and rung-3 share
 * (docs/v2-substrate-reality-study.md §§2, 4).
 *
 *   PT1. parse precedence: role > placeholder > text when several
 *        keys are present; null when none.
 *   PT2. role target matches on the substrate's accname semantics:
 *        a placeholder-only textbox is reachable by role + placeholder
 *        text (accname 2D, verified empirically 2026-09-16).
 *   PT3. a role target never matches a `generic` surface — roleless
 *        surfaces have no role-addressable name.
 *   PT4. text target is role-agnostic: it matches a generic surface
 *        AND a button with the same visible text.
 *   PT5. placeholder target matches only a surface declaring that
 *        placeholder.
 *   PT6. findSurfaceForTarget searches nested children depth-first.
 */

import { describe, test, expect } from 'vitest';
import {
  findSurfaceForTarget,
  parseProbeTarget,
  surfaceMatchesTarget,
} from '../../workshop/probe-derivation/probe-target';
import type { SurfaceSpec } from '../../workshop/substrate/surface-spec';

describe('ProbeTarget laws', () => {
  test('PT1: parse precedence role > placeholder > text; null when absent', () => {
    expect(parseProbeTarget({ target: { role: 'button', name: 'Go', placeholder: 'p', text: 't' } }))
      .toEqual({ kind: 'role', role: 'button', name: 'Go' });
    expect(parseProbeTarget({ target: { placeholder: 'Search', text: 't' } }))
      .toEqual({ kind: 'placeholder', placeholder: 'Search' });
    expect(parseProbeTarget({ target: { text: 'Filter' } })).toEqual({ kind: 'text', text: 'Filter' });
    expect(parseProbeTarget({ target: {} })).toBeNull();
    expect(parseProbeTarget({})).toBeNull();
    expect(parseProbeTarget(null)).toBeNull();
  });

  test('PT2: role target reaches a placeholder-only textbox by its placeholder text', () => {
    const search: SurfaceSpec = { role: 'textbox', naming: 'none', placeholder: 'Search products' };
    expect(surfaceMatchesTarget(search, { kind: 'role', role: 'textbox', name: 'Search products' })).toBe(true);
    // An explicit aria-label wins over the placeholder for the name.
    const labelled: SurfaceSpec = { role: 'textbox', name: 'Query', placeholder: 'Search products' };
    expect(surfaceMatchesTarget(labelled, { kind: 'role', role: 'textbox', name: 'Search products' })).toBe(false);
    expect(surfaceMatchesTarget(labelled, { kind: 'role', role: 'textbox', name: 'Query' })).toBe(true);
  });

  test('PT3: a role target never matches a generic (roleless) surface', () => {
    const roleless: SurfaceSpec = { role: 'generic', name: 'Filter', clickable: true };
    expect(surfaceMatchesTarget(roleless, { kind: 'role', role: 'generic', name: 'Filter' })).toBe(false);
    expect(surfaceMatchesTarget(roleless, { kind: 'role', role: 'button', name: 'Filter' })).toBe(false);
  });

  test('PT4: text target is role-agnostic', () => {
    const roleless: SurfaceSpec = { role: 'generic', name: 'Filter', clickable: true };
    const button: SurfaceSpec = { role: 'button', name: 'Filter' };
    expect(surfaceMatchesTarget(roleless, { kind: 'text', text: 'Filter' })).toBe(true);
    expect(surfaceMatchesTarget(button, { kind: 'text', text: 'Filter' })).toBe(true);
    expect(surfaceMatchesTarget(button, { kind: 'text', text: 'Filters' })).toBe(false);
  });

  test('PT5: placeholder target matches only a surface declaring that placeholder', () => {
    const search: SurfaceSpec = { role: 'textbox', naming: 'none', placeholder: 'Search products' };
    const named: SurfaceSpec = { role: 'textbox', name: 'Search products' };
    expect(surfaceMatchesTarget(search, { kind: 'placeholder', placeholder: 'Search products' })).toBe(true);
    expect(surfaceMatchesTarget(named, { kind: 'placeholder', placeholder: 'Search products' })).toBe(false);
  });

  test('PT6: findSurfaceForTarget searches nested children depth-first', () => {
    const world: readonly SurfaceSpec[] = [
      {
        role: 'main',
        children: [
          { role: 'search', children: [{ role: 'generic', name: 'Filter', clickable: true, surfaceId: 'deep' }] },
        ],
      },
      { role: 'generic', name: 'Filter', surfaceId: 'shallow-later' },
    ];
    expect(findSurfaceForTarget(world, { kind: 'text', text: 'Filter' })?.surfaceId).toBe('deep');
    expect(findSurfaceForTarget(world, { kind: 'text', text: 'Nope' })).toBeNull();
  });
});
