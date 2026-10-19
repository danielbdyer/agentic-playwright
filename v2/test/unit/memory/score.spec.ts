import { describe, expect, it } from 'vitest';
import type { Facet } from '../../../src/contract/schemas.js';
import { landmarkCue, queryFacets, rankScored, scoreFacets, STATUS_WEIGHT } from '../../../src/memory/score.js';
import { facet } from './helpers.js';

/** The five §5.3-style facets the scoring was prototyped against (reader §6.4). */
const POLICY_SEARCH: readonly Facet[] = [
  facet({ id: 'policy-search:policy-number-input', role: 'textbox', displayName: 'Policy number search field', aliases: ['search field', 'policy number'], status: 'trusted' }),
  facet({ id: 'policy-search:search-button', role: 'button', displayName: 'Search', aliases: ['search button'], status: 'candidate' }),
  facet({ id: 'policy-search:results-table', role: 'table', displayName: 'Search Results', status: 'candidate' }),
  facet({ id: 'policy-search:route', kind: 'route', displayName: 'Policy Search', aliases: ['policy search screen'], status: 'trusted' }),
  facet({ id: 'policy-search:filter', role: 'generic', displayName: 'Filter', status: 'candidate' }),
];

const healthy = (): number => 1;
const top = (phrase: string): Array<[string, number]> =>
  queryFacets({ phrase }, POLICY_SEARCH, healthy).map((f) => [f.id.split(':')[1]!, Math.round(f.score * 1000) / 1000]);

describe('memory.query scoring reproduces the prototyped table', () => {
  it.each([
    // Reader §6.4 table: route 1.0 / input 0.62 / button 0.40; input 1.0 / route 0.33; button 0.85;
    // results 0.70 / route 0.41 / input 0.36; input 0.44 (a known false positive through "number").
    // Pinned here at three decimals, exactly as the prototype printed them.
    ['Navigate to Policy Search screen', [['route', 1], ['policy-number-input', 0.623], ['search-button', 0.403]]],
    ['Enter policy number in search field', [['policy-number-input', 1], ['route', 0.333]]],
    ['Click Search button', [['search-button', 0.85]]],
    ['Verify search results show policy', [['results-table', 0.696], ['route', 0.41], ['policy-number-input', 0.362]]],
    ['Enter claim number', [['policy-number-input', 0.438]]],
    ['Click the Filter link', [['filter', 0.365]]],
  ] as const)('%s', (phrase, expected) => {
    expect(top(phrase)).toEqual(expected);
  });
});

describe('memory.query laws', () => {
  it('is deterministic', () => {
    const a = queryFacets({ phrase: 'Verify search results show policy' }, POLICY_SEARCH, healthy);
    const b = queryFacets({ phrase: 'Verify search results show policy' }, [...POLICY_SEARCH].reverse(), healthy);
    expect(b).toEqual(a);
  });

  it('returns at most the limit, every result above 0.3, best first', () => {
    const many: Facet[] = Array.from({ length: 30 }, (_, i) =>
      facet({ id: `grid:save-button-${i}`, role: 'button', displayName: `Save button ${i}`, aliases: ['save'], status: i % 2 === 0 ? 'trusted' : 'candidate' }),
    );
    const results = queryFacets({ phrase: 'Click Save' }, many, healthy);
    expect(results.length).toBe(8);
    expect(results.every((r) => r.score > 0.3)).toBe(true);
    expect(results.map((r) => r.score)).toEqual([...results.map((r) => r.score)].sort((x, y) => y - x));
    expect(queryFacets({ phrase: 'Click Save', limit: 3 }, many, healthy)).toHaveLength(3);
  });

  it('never ranks trusted below candidate at equal phrase score × health', () => {
    const twins = [
      facet({ id: 'a:save-candidate', role: 'button', displayName: 'Save', status: 'candidate' }),
      facet({ id: 'a:save-trusted', role: 'button', displayName: 'Save', status: 'trusted' }),
    ];
    const results = scoreFacets({ phrase: 'Click Save' }, twins, healthy);
    expect(results[0]!.phraseScore).toBe(results[1]!.phraseScore);
    expect(rankScored(results).map((r) => r.status)).toEqual(['trusted', 'candidate']);
  });

  it('weights by status and health, and excludes retired facets', () => {
    const save = (status: Facet['status']): Facet => facet({ id: `a:save-${status}`, role: 'button', displayName: 'Save', status });
    const scored = scoreFacets({ phrase: 'Save' }, [save('trusted'), save('candidate'), save('stale'), save('retired')], healthy);
    expect(scored.map((r) => [r.status, r.score])).toEqual([
      ['trusted', STATUS_WEIGHT.trusted],
      ['candidate', STATUS_WEIGHT.candidate],
      ['stale', STATUS_WEIGHT.stale],
    ]);
    const halfHealthy = queryFacets({ phrase: 'Save' }, [save('trusted')], () => 0.5);
    expect(halfHealthy[0]!.score).toBe(0.5);
    expect(queryFacets({ phrase: 'Save' }, [save('trusted')], () => 0.2)).toEqual([]);
  });

  it('filters by kind', () => {
    const results = queryFacets({ phrase: 'Policy Search', kind: 'route' }, POLICY_SEARCH, healthy);
    expect(results.map((r) => r.id)).toEqual(['policy-search:route']);
  });

  it('applies an explicit landmark hint: boost inside, penalty outside', () => {
    const links = [
      facet({ id: 'shell:home-nav', role: 'link', displayName: 'Home', scope: { landmark: 'navigation' }, status: 'trusted' }),
      facet({ id: 'shell:home-footer', role: 'link', displayName: 'Home', scope: { landmark: 'contentinfo' }, status: 'trusted' }),
    ];
    const results = scoreFacets({ phrase: 'Click Home link', landmark: 'contentinfo' }, links, healthy);
    const byId = Object.fromEntries(results.map((r) => [r.id, r.phraseScore]));
    // Same best name ("Home") and role factor; only the scope factor differs: 1.1 inside, 0.7 outside.
    expect(byId['shell:home-nav']! / byId['shell:home-footer']!).toBeCloseTo(0.7 / 1.1, 10);
  });

  it('derives a landmark from the phrase as a boost only', () => {
    expect(landmarkCue('Click Home in the footer')).toBe('contentinfo');
    expect(landmarkCue('Open the side bar menu')).toBe('navigation');
    expect(landmarkCue('Enter policy number in search field')).toBe('search');
    expect(landmarkCue('Click Save')).toBeUndefined();
    const inSearch = facet({ id: 'a:go', role: 'button', displayName: 'Go fetch', scope: { landmark: 'search' } });
    const inMain = facet({ id: 'a:go-main', role: 'button', displayName: 'Go fetch', scope: { landmark: 'main' } });
    const unscoped = facet({ id: 'a:go-none', role: 'button', displayName: 'Go fetch' });
    const [s, m, u] = scoreFacets({ phrase: 'press fetch in search' }, [inSearch, inMain, unscoped], healthy);
    expect(s!.phraseScore).toBeCloseTo(u!.phraseScore * 1.1, 10);
    // Outside the mentioned landmark: no penalty (same as a facet with no landmark).
    expect(m!.phraseScore).toBe(u!.phraseScore);
  });

  it('returns nothing for an empty catalog or an empty phrase, and is safe on prototype-ish tokens', () => {
    expect(queryFacets({ phrase: 'Click Search' }, [], healthy)).toEqual([]);
    expect(queryFacets({ phrase: '' }, POLICY_SEARCH, healthy)).toEqual([]);
    expect(() => queryFacets({ phrase: 'constructor toString __proto__ button' }, POLICY_SEARCH, healthy)).not.toThrow();
  });
});
