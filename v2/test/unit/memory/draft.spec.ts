import { describe, expect, it } from 'vitest';
import { deriveLocator, idSelector, isEquivalentTarget, mergeAliases, targetIdentity } from '../../../src/memory/draft.js';
import { memberNameFor, memberNames } from '../../../src/memory/member.js';
import { candidate, facet } from './helpers.js';

describe('aliases', () => {
  it('normalizes, lowercases, and de-duplicates against each other and the display name', () => {
    const merged = mergeAliases([], ['  Search   Field ', '"search field"', 'Policy number search field', 'policy number', 'POLICY NUMBER'], 'Policy number search field', 'standard');
    expect(merged.aliases).toEqual(['search field', 'policy number']);
    expect(merged.added).toEqual(['search field', 'policy number']);
  });

  it('drops aliases that are too long, have no words, or exceed the cap of 12', () => {
    const long = 'assert that the claims list is shown with every claim the customer ever filed in the system';
    const many = Array.from({ length: 15 }, (_, i) => `name ${i}`);
    const merged = mergeAliases([], [long, 'the', ...many], 'X', 'standard');
    expect(merged.aliases).toHaveLength(12);
    expect(merged.dropped.some((d) => d.includes('longer than 80'))).toBe(true);
    expect(merged.dropped.some((d) => d.includes('no searchable words'))).toBe(true);
    expect(merged.dropped.filter((d) => d.includes('already 12'))).toHaveLength(3);
  });

  it('keeps existing aliases in place and redacts PII', () => {
    const merged = mergeAliases(['existing'], ['row for jane@example.com'], 'X', 'standard');
    expect(merged.aliases).toEqual(['existing', 'row for <email>']);
  });
});

describe('locator derivation from a candidate', () => {
  it('prefers role and name, scoped to the landmark', () => {
    expect(deriveLocator(candidate(), { kind: 'element' })).toEqual({
      locator: { strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } },
    });
    expect(deriveLocator(candidate({ landmark: 'navigation', landmarkName: 'Main menu', role: 'link', name: 'Policies' }), { kind: 'element' })?.locator.scope).toEqual({
      landmark: 'navigation',
      landmarkName: 'Main menu',
    });
  });

  it('falls back through placeholder, text for a roleless clickable, test id, designer id, role alone, structural id', () => {
    expect(deriveLocator(candidate({ name: '' }), { kind: 'element' })?.locator).toMatchObject({ strategy: 'placeholder', value: 'Search Policy' });
    expect(deriveLocator(candidate({ role: 'generic', name: 'Filter', placeholder: undefined }), { kind: 'element' })?.locator).toMatchObject({ strategy: 'text', value: 'Filter' });
    expect(deriveLocator(candidate({ role: 'generic', name: '', placeholder: undefined, testId: 'filter' }), { kind: 'element' })?.locator).toEqual({ strategy: 'test-id', value: 'filter' });
    expect(deriveLocator(candidate({ role: 'generic', name: '', placeholder: undefined, id: 'Input_Search', idKind: 'designer' }), { kind: 'element' })?.locator).toEqual({ strategy: 'css', value: '#Input_Search' });
    expect(deriveLocator(candidate({ role: 'table', name: '', placeholder: undefined }), { kind: 'element' })?.locator).toEqual({ strategy: 'role-name', role: 'table', scope: { landmark: 'search' } });
    expect(deriveLocator(candidate({ role: 'generic', name: '', placeholder: undefined }), { kind: 'element' })).toEqual({
      locator: { strategy: 'css', value: '#b3-Input_Search' },
      note: 'structural id, fragile',
    });
    expect(deriveLocator(candidate({ role: 'generic', name: '', placeholder: undefined, id: undefined }), { kind: 'element' })).toBeNull();
  });

  it('uses row-text with the parameter for a parameterized row facet', () => {
    expect(deriveLocator(candidate({ role: 'row', name: 'POL-001 Active' }), { kind: 'row', parameter: 'policyNumber' })?.locator).toEqual({
      strategy: 'row-text',
      value: '{policyNumber}',
      scope: { landmark: 'search' },
    });
  });

  it('escapes ids that are not plain CSS identifiers', () => {
    expect(idSelector('b3-Input_Search')).toBe('#b3-Input_Search');
    expect(idSelector('1abc')).toBe('[id="1abc"]');
    expect(idSelector('a"b')).toBe('[id="a\\"b"]');
  });
});

describe('target equivalence', () => {
  const existing = facet({
    id: 'policy-search:search-button',
    role: 'button',
    scope: { landmark: 'search' },
    locators: [{ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } }],
  });

  it('same locator key is equivalent', () => {
    const c = candidate({ role: 'button', name: 'Search' });
    expect(isEquivalentTarget(existing, targetIdentity({ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } }, c, 'search'))).toBe(true);
  });

  it('same role, name (case-insensitively), and landmark is equivalent even with another locator', () => {
    const c = candidate({ role: 'button', name: 'SEARCH', landmark: 'search' });
    expect(isEquivalentTarget(existing, targetIdentity({ strategy: 'css', value: '#b3-Search' }, c, 'search'))).toBe(true);
  });

  it('a different name or landmark is a different target', () => {
    expect(isEquivalentTarget(existing, targetIdentity({ strategy: 'role-name', role: 'button', name: 'Reset' }, candidate({ role: 'button', name: 'Reset' }), 'search'))).toBe(false);
    expect(isEquivalentTarget(existing, targetIdentity({ strategy: 'css', value: '#x' }, candidate({ role: 'button', name: 'Search', landmark: 'navigation' }), undefined))).toBe(false);
  });
});

describe('page-object member names', () => {
  it('camel-cases the local id, honors an explicit member, and avoids reserved names', () => {
    expect(memberNameFor(facet({ id: 'policy-search:policy-number-input' }))).toBe('policyNumberInput');
    expect(memberNameFor(facet({ id: 'policy-search:results-table', member: 'resultRow' }))).toBe('resultRow');
    expect(memberNameFor(facet({ id: 'policy-search:x', member: 'not valid!' }))).toBe('notValid');
    expect(memberNameFor(facet({ id: 'policy-search:page' }))).toBe('pageFacet');
    expect(memberNameFor(facet({ id: 'policy-search:then' }))).toBe('thenFacet');
    expect(memberNameFor(facet({ id: 'policy-search:constructor' }))).toBe('constructorFacet');
    expect(memberNameFor(facet({ id: 'policy-search:2fa-code' }))).toBe('_2faCode');
  });

  it('is unique within a screen, deterministically, and explicit members win their names', () => {
    const facets = [facet({ id: 's:item-1' }), facet({ id: 's:item1' }), facet({ id: 's:z', member: 'item1' })];
    const names = memberNames(facets);
    expect(names).toEqual({ 's:z': 'item1', 's:item-1': 'item12', 's:item1': 'item13' });
    expect(memberNames([...facets].reverse())).toEqual(names);
    expect(memberNameFor(facets[0]!, facets)).toBe('item12');
    expect(new Set(Object.values(names)).size).toBe(3);
    for (const name of Object.values(names)) expect(name).toMatch(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
  });
});
