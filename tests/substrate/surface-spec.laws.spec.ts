/**
 * SurfaceSpec — structural laws.
 *
 *   SS1. Defaults are applied only when a field is absent.
 *   SS2. isSurfaceHidden returns true iff visibility is a non-visible value.
 *   SS3. isSurfaceFillRejecting fires only for (role=textbox, backing=div-with-role).
 */

import { describe, test, expect } from 'vitest';
import {
  SURFACE_SPEC_DEFAULTS,
  isSurfaceFillRejecting,
  isSurfaceHidden,
  type SurfaceSpec,
} from '../../workshop/substrate/surface-spec';

describe('SurfaceSpec laws', () => {
  test('SS1: defaults include visible/enabled/native-input', () => {
    expect(SURFACE_SPEC_DEFAULTS.visibility).toBe('visible');
    expect(SURFACE_SPEC_DEFAULTS.enabled).toBe(true);
    expect(SURFACE_SPEC_DEFAULTS.inputBacking).toBe('native-input');
  });

  test('SS2: isSurfaceHidden distinguishes visible from every other value', () => {
    const base: SurfaceSpec = { role: 'button', name: 'x' };
    expect(isSurfaceHidden({ ...base, visibility: 'visible' })).toBe(false);
    expect(isSurfaceHidden({ ...base })).toBe(false); // default visible
    for (const vis of ['display-none', 'visibility-hidden', 'off-screen', 'zero-size'] as const) {
      expect(isSurfaceHidden({ ...base, visibility: vis })).toBe(true);
    }
  });

  test('SS3: isSurfaceFillRejecting fires only for textbox + div-with-role', () => {
    expect(isSurfaceFillRejecting({ role: 'textbox', inputBacking: 'div-with-role' })).toBe(true);
    expect(isSurfaceFillRejecting({ role: 'textbox', inputBacking: 'native-input' })).toBe(false);
    expect(isSurfaceFillRejecting({ role: 'textbox', inputBacking: 'contenteditable' })).toBe(false);
    expect(isSurfaceFillRejecting({ role: 'textbox', inputBacking: 'native-textarea' })).toBe(false);
    expect(isSurfaceFillRejecting({ role: 'button', inputBacking: 'div-with-role' })).toBe(false);
  });
});

/**
 * Reality-study axes (docs/v2-substrate-reality-study.md §4).
 *
 *   SS4. accessibleNameOf: explicit naming (aria-label / label-for /
 *        label-wrap) yields `name`; `naming: 'none'` yields the
 *        placeholder; `generic` yields null; non-form-control roles
 *        yield `name`.
 *   SS5. isSurfaceRoleless is true only for the `generic` role.
 *   SS6. isSurfaceFillRejecting is true for a generic surface (a
 *        roleless <div> is never an <input>).
 *   SS7. SURFACE_SPEC_DEFAULTS names the naming + clickable defaults.
 */
import {
  FORM_CONTROL_NAMING_VALUES,
  accessibleNameOf,
  isFormControlRole,
  isSurfaceRoleless,
} from '../../workshop/substrate/surface-spec';

describe('SurfaceSpec reality-study axis laws', () => {
  test('SS4: accessibleNameOf follows the naming axis', () => {
    for (const naming of ['aria-label', 'label-for', 'label-wrap'] as const) {
      expect(accessibleNameOf({ role: 'textbox', name: 'Email', naming, placeholder: 'you@example' })).toBe('Email');
    }
    expect(accessibleNameOf({ role: 'textbox', naming: 'none', placeholder: 'Search products' })).toBe('Search products');
    expect(accessibleNameOf({ role: 'textbox', naming: 'none' })).toBeNull();
    // No explicit name but a placeholder: the placeholder names it
    // whichever mechanism is selected (there is nothing else).
    expect(accessibleNameOf({ role: 'searchbox', placeholder: 'Find' })).toBe('Find');
    expect(accessibleNameOf({ role: 'generic', name: 'Filter', clickable: true })).toBeNull();
    expect(accessibleNameOf({ role: 'button', name: 'Save' })).toBe('Save');
    expect(accessibleNameOf({ role: 'link' })).toBeNull();
    expect(FORM_CONTROL_NAMING_VALUES).toEqual(['aria-label', 'label-for', 'label-wrap', 'none']);
    expect(isFormControlRole('textbox')).toBe(true);
    expect(isFormControlRole('button')).toBe(false);
  });

  test('SS5: isSurfaceRoleless is true only for generic', () => {
    expect(isSurfaceRoleless({ role: 'generic', name: 'Filter' })).toBe(true);
    expect(isSurfaceRoleless({ role: 'button', name: 'Filter' })).toBe(false);
    expect(isSurfaceRoleless({ role: 'region' })).toBe(false);
  });

  test('SS6: a generic surface rejects fill', () => {
    expect(isSurfaceFillRejecting({ role: 'generic', name: 'Filter', clickable: true })).toBe(true);
  });

  test('SS7: defaults name the naming + clickable axes', () => {
    expect(SURFACE_SPEC_DEFAULTS.naming).toBe('aria-label');
    expect(SURFACE_SPEC_DEFAULTS.clickable).toBe(false);
  });
});
