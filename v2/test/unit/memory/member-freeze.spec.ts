/**
 * Page-object member names are frozen at mint: minting or retiring another
 * facet must never rename a member that already-emitted specs call.
 */
import { describe, expect, it } from 'vitest';
import type { Facet } from '../../../src/contract/schemas.js';
import { memberTable } from '../../../src/emit/naming.js';
import { renderPageObject } from '../../../src/emit/page-object.js';
import { planMint, type MintPlanInput } from '../../../src/memory/mint.js';
import { freezeMemberNames } from '../../../src/memory/member.js';
import type { ScreenCatalog } from '../../../src/memory/types.js';
import { candidate, counterFactory, facet, verified } from './helpers.js';

const ctx = () => ({ pii: 'standard' as const, now: '2026-10-19T10:00:00.000Z', makeEvent: counterFactory(), pointer: (id: string) => `ev#${id}` });

const resultsTable: Facet = facet({
  id: 'policy-search:results-table',
  kind: 'row',
  role: 'row',
  tag: 'tr',
  parameter: 'policyNumber',
  status: 'trusted',
  locators: [{ strategy: 'row-text', value: '{policyNumber}' }],
});
const searchButton: Facet = facet({
  id: 'policy-search:search-button',
  role: 'button',
  tag: 'button',
  status: 'trusted',
  locators: [{ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } }],
});
const region: Facet = facet({
  id: 'policy-search:region',
  role: 'combobox',
  tag: 'div',
  status: 'trusted',
  locators: [{ strategy: 'role-name', role: 'combobox', name: 'Region' }],
});

/** A catalog written before member names were frozen: no facet has `member`. */
const legacy: ScreenCatalog = { screen: 'policy-search', facets: [region, resultsTable, searchButton] };

const names = (facets: readonly Facet[]): Record<string, string> =>
  Object.fromEntries([...memberTable(facets).values()].map((m) => [m.facetId, m.selectHelper === null ? m.name : `${m.name}/${m.selectHelper}`]));

const rowLocator = { strategy: 'row-text' as const, role: 'row', value: '{policyNumber}', scope: { landmark: 'main' as const } };

const mintRow = (catalog: ScreenCatalog, name: string): ReturnType<typeof planMint> => {
  const input: MintPlanInput = {
    screen: 'policy-search',
    draft: { name, displayName: name.replace(/-/g, ' '), kind: 'row', parameter: 'policyNumber', locator: { ...rowLocator, value: `{policyNumber}`, ...(name === 'result-row' ? {} : { role: 'row', scope: { landmark: 'region' } }) } },
    candidate: candidate({ ref: 'c9', role: 'row', name: 'POL-001 Jane', namingSource: 'content', tag: 'tr', placeholder: undefined, landmark: 'main' }),
    snapshotId: 'snap-1',
    verified: verified(rowLocator),
    provenance: { instrument: 'app.observe' },
  };
  return planMint(catalog, input, ctx());
};

describe('member names are frozen at mint', () => {
  it('a facet whose derived name collides, and whose id sorts first, does not take the existing member name', () => {
    expect(names(legacy.facets)['policy-search:results-table']).toBe('resultRow');
    const plan = mintRow(legacy, 'result-row');
    expect(plan.created).toBe(true);
    // The existing row facet keeps resultRow (existing specs call policySearch.resultRow(...)); the new one is suffixed.
    expect(names(plan.catalog.facets)).toMatchObject({
      'policy-search:results-table': 'resultRow',
      'policy-search:result-row': 'resultRow2',
      'policy-search:search-button': 'searchButton',
      'policy-search:region': 'region/selectRegion',
    });
    expect(plan.facet.member).toBe('resultRow2');
    expect(plan.catalog.facets.find((f) => f.id === 'policy-search:results-table')?.member).toBe('resultRow');
    // The page object regenerated right after the mint calls the old facet's locator under the old name.
    const page = renderPageObject('policy-search', null, plan.catalog.facets, null);
    expect(page.members).toMatchObject({ 'policy-search:results-table': 'resultRow', 'policy-search:result-row': 'resultRow2' });
    expect(page.text).toContain("  resultRow(policyNumber: string): Locator {\n    return this.page.getByRole('row').filter({ hasText: policyNumber });");
  });

  it('retiring the facet that holds the base name renames nobody, and a later facet does not inherit the retired name', () => {
    const minted = mintRow(legacy, 'result-row').catalog;
    const retired: ScreenCatalog = {
      ...minted,
      facets: minted.facets.map((f) => (f.id === 'policy-search:results-table' ? { ...f, status: 'retired' as const } : f)),
    };
    expect(names(retired.facets)['policy-search:result-row']).toBe('resultRow2');
    expect(names(retired.facets)['policy-search:results-table']).toBeUndefined();
    const again = mintRow(retired, 'result-rows');
    expect(again.facet.member).toBe('resultRow3');
    expect(names(again.catalog.facets)).toMatchObject({ 'policy-search:result-row': 'resultRow2', 'policy-search:result-rows': 'resultRow3' });
  });

  it('freezing a catalog written before names were frozen keeps every current name, select helpers included', () => {
    const crowded: readonly Facet[] = [
      facet({ id: 'policy-search:a-region', role: 'combobox', tag: 'div', locators: [{ strategy: 'role-name', role: 'combobox', name: 'A' }], member: 'region' }),
      ...legacy.facets,
      facet({ id: 'policy-search:select-region', locators: [{ strategy: 'text', value: 'Pick' }] }),
      facet({ id: 'policy-search:zz-old', locators: [{ strategy: 'text', value: 'Old' }], status: 'retired' }),
    ];
    const before = names(crowded);
    const frozen = freezeMemberNames(crowded).facets;
    expect(names(frozen)).toEqual(before);
    expect(frozen.filter((f) => f.status !== 'retired').every((f) => typeof f.member === 'string')).toBe(true);
    expect(frozen.find((f) => f.id === 'policy-search:zz-old')?.member).toBeUndefined();
  });

  it('a re-mint of an existing facet freezes the catalog without changing any name', () => {
    const before = names(legacy.facets);
    const input: MintPlanInput = {
      screen: 'policy-search',
      draft: { name: 'search-button', displayName: 'Search button', locator: searchButton.locators[0]! },
      candidate: candidate({ role: 'button', name: 'Search', namingSource: 'content', tag: 'button', placeholder: undefined }),
      snapshotId: 'snap-1',
      verified: verified(searchButton.locators[0]!),
      provenance: { instrument: 'app.observe' },
    };
    const plan = planMint(legacy, input, ctx());
    expect(plan.created).toBe(false);
    expect(plan.facet.member).toBe('searchButton');
    expect(names(plan.catalog.facets)).toEqual(before);
  });
});
