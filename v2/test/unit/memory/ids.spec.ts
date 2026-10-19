import { describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { thrown } from './helpers.js';
import { facetIdFrom, localIdFor, locatorKeyOf, parseFacetId, requireFacetId, screenOf } from '../../../src/memory/ids.js';

describe('facet ids (laws lifted from v1 facet-record.laws)', () => {
  it('round-trips through facetIdFrom and parseFacetId', () => {
    const id = facetIdFrom('policy-search', 'policy-number-input');
    expect(id).toBe('policy-search:policy-number-input');
    expect(parseFacetId(id)).toEqual({ screen: 'policy-search', local: 'policy-number-input' });
    expect(screenOf(id)).toBe('policy-search');
  });

  it('rejects empty segments, colons, and non-kebab segments', () => {
    for (const [screen, local] of [['', 'x'], ['x', ''], ['a:b', 'c'], ['a', 'b:c'], ['Policy', 'x'], ['policy', 'Number'], ['-x', 'y'], ['x', 'y z']] as const) {
      expect(() => facetIdFrom(screen, local)).toThrow(ToolError);
    }
  });

  it('parseFacetId returns null for anything but two non-empty segments', () => {
    for (const bad of ['no-colon', 'too:many:colons', ':x', 'x:', '']) expect(parseFacetId(bad)).toBeNull();
  });

  it('requireFacetId throws invalid-input on malformed ids', () => {
    expect(() => requireFacetId('Bad:Id')).toThrow(/kebab-case/);
    expect(thrown(() => requireFacetId('nope')).family).toBe('invalid-input');
  });

  it('derives the local id from name, else display name', () => {
    expect(localIdFor({ displayName: 'Policy number search field' })).toBe('policy-number-search-field');
    expect(localIdFor({ name: 'policy-number-input', displayName: 'Policy number' })).toBe('policy-number-input');
    expect(localIdFor({ name: '  ', displayName: 'Search' })).toBe('search');
  });
});

describe('locator keys', () => {
  it('ignore expression, health, and note', () => {
    const base = { strategy: 'role-name' as const, role: 'button', name: 'Search' };
    const key = locatorKeyOf(base);
    expect(key).toMatch(/^[0-9a-f]{12}$/);
    expect(locatorKeyOf({ ...base, expression: 'anything' })).toBe(key);
    expect(locatorKeyOf({ ...base, health: '3/4', note: 'n' } as never)).toBe(key);
  });

  it('treat specs that build the same Playwright locator as one (exact defaults to true for role-name)', () => {
    expect(locatorKeyOf({ strategy: 'role-name', role: 'button', name: 'Search', exact: true })).toBe(
      locatorKeyOf({ strategy: 'role-name', role: 'button', name: 'Search' }),
    );
  });

  it('distinguish different targets and scopes', () => {
    const a = locatorKeyOf({ strategy: 'role-name', role: 'button', name: 'Search' });
    expect(locatorKeyOf({ strategy: 'role-name', role: 'button', name: 'Find' })).not.toBe(a);
    expect(locatorKeyOf({ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } })).not.toBe(a);
  });
});
