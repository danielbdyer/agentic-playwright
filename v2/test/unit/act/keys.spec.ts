import { describe, expect, it } from 'vitest';
import { describeAllowedKeys, isKnownKey, normalizeKey } from '../../../src/act/keys.js';

describe('normalizeKey', () => {
  it('accepts canonical Playwright names unchanged', () => {
    for (const key of ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowDown', 'PageUp', 'Home', 'F5', 'Space']) {
      expect(normalizeKey(key)).toBe(key);
    }
  });

  it('folds case, spacing, and common author spellings', () => {
    expect(normalizeKey('enter')).toBe('Enter');
    expect(normalizeKey('ENTER')).toBe('Enter');
    expect(normalizeKey('esc')).toBe('Escape');
    expect(normalizeKey('return')).toBe('Enter');
    expect(normalizeKey('page down')).toBe('PageDown');
    expect(normalizeKey('arrow-up')).toBe('ArrowUp');
    expect(normalizeKey('down')).toBe('ArrowDown');
    expect(normalizeKey('  tab  ')).toBe('Tab');
    expect(normalizeKey('f12')).toBe('F12');
  });

  it('accepts single characters case-sensitively', () => {
    expect(normalizeKey('a')).toBe('a');
    expect(normalizeKey('A')).toBe('A');
    expect(normalizeKey('7')).toBe('7');
    expect(normalizeKey('/')).toBe('/');
    expect(normalizeKey('+')).toBe('+');
    expect(normalizeKey(' ')).toBe(' ');
  });

  it('normalizes chords and requires modifiers before the last key', () => {
    expect(normalizeKey('ctrl+a')).toBe('Control+a');
    expect(normalizeKey('Shift + Tab')).toBe('Shift+Tab');
    expect(normalizeKey('Control+Shift+K')).toBe('Control+Shift+K');
    expect(normalizeKey('mod+s')).toBe('ControlOrMeta+s');
    expect(normalizeKey('cmd+Enter')).toBe('Meta+Enter');
    expect(normalizeKey('Shift++')).toBe('Shift++');
    expect(normalizeKey('a+b')).toBeNull();
    expect(normalizeKey('Enter+a')).toBeNull();
  });

  it('rejects words that are not keys (v1 pressed "Submit")', () => {
    expect(normalizeKey('Submit')).toBeNull();
    expect(normalizeKey('Search button')).toBeNull();
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey('\u0007')).toBeNull();
    expect(normalizeKey('😀')).toBeNull();
    expect(isKnownKey('Submit')).toBe(false);
    expect(isKnownKey('Enter')).toBe(true);
  });

  it('describes the allowlist for error messages', () => {
    const text = describeAllowedKeys();
    expect(text).toContain('Enter');
    expect(text).toContain('F1-F12');
    expect(text).toContain('single character');
  });
});
