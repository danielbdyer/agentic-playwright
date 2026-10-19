import { describe, expect, it } from 'vitest';
import {
  aliasesFor,
  bindValue,
  displayNameFor,
  facetDraft,
  paramName,
  parameterizeLocator,
  relativeRoute,
  routeFromSnapshot,
  rowLocator,
  screenSegment,
} from '../../../src/driver/index.js';
import { classifyStep, intentForAssertion, screenNameFromUrl } from '../../../src/resolve/index.js';
import { POLICY_SEARCH, snapshot } from './fixtures.js';

const byRef = (ref: string) => POLICY_SEARCH.find((c) => c.ref === ref)!;

describe('driver naming', () => {
  it('reads and binds "@param" references', () => {
    expect(paramName('@policyNumber')).toBe('policyNumber');
    expect(paramName('POL-001')).toBeNull();
    expect(bindValue('@policyNumber', { policyNumber: 'POL-001' })).toBe('POL-001');
    expect(bindValue('@missing', {})).toBe('@missing');
    expect(bindValue('plain text', { policyNumber: 'POL-001' })).toBe('plain text');
  });

  it('records routes relative to the profile baseURL, without query or hash', () => {
    const base = 'http://app.test/PolicyApp/';
    expect(relativeRoute('http://app.test/PolicyApp/PolicySearch', base)).toBe('PolicySearch');
    expect(relativeRoute('http://app.test/PolicyApp/PolicyDetail?id=POL-001#top', base)).toBe('PolicyDetail');
    expect(relativeRoute('http://app.test/PolicyApp/', base)).toBe('');
    expect(relativeRoute('http://other.test/X', base)).toBe('http://other.test/X');
    expect(routeFromSnapshot(snapshot(), base)).toEqual({
      url: 'PolicySearch',
      variant: 'reactive',
      fingerprint: 'sha256:abc',
      title: 'Policy Search',
      landmarks: ['banner', 'main', 'navigation', 'search'],
    });
  });

  it('names a screen URL the OutSystems way, and agrees with screenNameFromUrl', () => {
    expect(screenSegment('Policy Search')).toBe('PolicySearch');
    expect(screenSegment('claims')).toBe('Claims');
    expect(screenNameFromUrl(`http://x/${screenSegment('Policy Search')}`)).toBe('policy-search');
  });

  it('writes the data row value back as its {param} placeholder, so a facet is not bound to one row', () => {
    const scoped = parameterizeLocator({ strategy: 'role-name', role: 'link', name: 'Edit', scope: { landmark: 'main', rowText: 'POL-001' } }, { policyNumber: 'POL-001' }, null);
    expect(scoped).toEqual({ locator: { strategy: 'role-name', role: 'link', name: 'Edit', scope: { landmark: 'main', rowText: '{policyNumber}' } }, parameter: 'policyNumber' });
    const row = parameterizeLocator({ strategy: 'row-text', value: 'POL-001' }, { policyNumber: 'POL-001' }, 'policyNumber');
    expect(row.locator.value).toBe('{policyNumber}');
    const untouched = parameterizeLocator({ strategy: 'role-name', role: 'button', name: 'Search' }, { policyNumber: 'POL-001' }, null);
    expect(untouched.parameter).toBeNull();
  });

  it('locates a row by its parameter, scoped by its landmark', () => {
    expect(rowLocator(byRef('c8'), '@policyNumber', { policyNumber: 'POL-001' })).toEqual({
      locator: { strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } },
      parameter: 'policyNumber',
    });
    expect(rowLocator(byRef('c8'), 'POL-001', {})?.locator.value).toBe('POL-001');
    expect(rowLocator(byRef('c8'), '@unknown', {})).toBeNull();
    expect(rowLocator(byRef('c8'), null, {})).toBeNull();
  });

  it('names facets with the author’s words and keeps their wording as aliases', () => {
    const fill = classifyStep('Enter @policyNumber in search field', '', ['policyNumber']);
    expect(displayNameFor(fill, byRef('c4'))).toBe('Policy number search field');
    expect(aliasesFor(fill, byRef('c4'))).toEqual(expect.arrayContaining(['search field', 'policy number', 'Search Policy']));
    const click = classifyStep('Click Search button', '', []);
    expect(displayNameFor(click, byRef('c5'))).toBe('Search button');
    const heading = intentForAssertion(classifyStep('Navigate to Policy Search screen', 'Policy Search screen loads', []), classifyStep('Navigate to Policy Search screen', 'Policy Search screen loads', []).assertions[0]!);
    expect(displayNameFor(heading, byRef('c3'))).toBe('Policy Search heading');
    const rows = classifyStep('Verify search results show policy', '', ['policyNumber'], { priorValues: ['@policyNumber'] });
    expect(displayNameFor(intentForAssertion(rows, rows.assertions[0]!), byRef('c8'))).toBe('Policy number row');
  });

  it('drafts a facet the way memory.mint takes it', () => {
    const fill = classifyStep('Enter @policyNumber in search field', '', ['policyNumber']);
    const draft = facetDraft({ screen: 'policy-search', intent: fill, candidate: byRef('c4'), locator: { strategy: 'role-name', role: 'textbox', name: 'Search Policy' } });
    expect(draft).toMatchObject({
      name: 'policy-number-input',
      kind: 'element',
      displayName: 'Policy number search field',
      role: 'textbox',
      namingSource: 'placeholder',
      scope: { landmark: 'search', dataBlock: 'Policy.SearchBlock' },
      locator: { strategy: 'role-name', role: 'textbox', name: 'Search Policy' },
    });
    const row = facetDraft({ screen: 'policy-search', intent: classifyStep('Verify search results show policy', '', ['policyNumber'], { priorValues: ['@policyNumber'] }), candidate: byRef('c8'), parameter: 'policyNumber' });
    expect(row).toMatchObject({ kind: 'row', parameter: 'policyNumber' });
  });
});
