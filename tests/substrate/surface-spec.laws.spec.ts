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
