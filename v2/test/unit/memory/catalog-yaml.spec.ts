import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { parseCatalogYaml, serializeCatalog } from '../../../src/memory/catalog-yaml.js';
import type { ScreenCatalog } from '../../../src/memory/types.js';
import { facet, thrown } from './helpers.js';

const CATALOG: ScreenCatalog = {
  screen: 'policy-search',
  route: {
    url: 'PolicySearch',
    variant: 'reactive',
    title: 'Policy Search',
    fingerprint: 'sha256:abc',
    summary: { landmarks: ['banner', 'main', 'navigation', 'search'], interactiveRoles: { textbox: 1, button: 3 }, dataBlocks: 14 },
  },
  facets: [
    facet({
      id: 'policy-search:search-button',
      role: 'button',
      displayName: 'Search',
      aliases: ['search button'],
      locators: [{ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' }, health: '4/4' }],
      status: 'trusted',
    }),
    facet({
      id: 'policy-search:policy-number-input',
      role: 'textbox',
      tag: 'input',
      displayName: 'Policy number search field',
      aliases: ['search field', 'policy number'],
      namingSource: 'placeholder',
      affordance: 'native',
      scope: { landmark: 'search', dataBlock: 'SearchBlock' },
      locators: [
        { strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' }, health: '12/12' },
        { strategy: 'css', value: '#b3-Input_Search', health: '3/12', note: 'structural id, fragile' },
        { strategy: 'text', value: '100', exact: true, visibleOnly: true, nth: 0, health: '0/0' },
      ],
      provenance: { mintedAt: '2026-09-20T14:02:11Z', instrument: 'app.observe', session: 's-1', model: 'claude', testCase: '10001', snapshotId: 'snap-1', candidateRef: 'c1' },
      evidence: '.tesseract/evidence/policy-search.jsonl#ev-20260920140211-1a2b3c4d',
    }),
  ],
};

const FILE = '.tesseract/catalog/policy-search.yaml';

describe('catalog YAML', () => {
  it('round-trips: parse then serialize is byte-identical (health aside: it is re-projected from evidence by the store)', () => {
    const withoutHealth: ScreenCatalog = { ...CATALOG, facets: CATALOG.facets.map((f) => ({ ...f, locators: f.locators.map(({ health: _h, ...l }) => l) })) };
    const text = serializeCatalog(withoutHealth);
    const { catalog, warnings } = parseCatalogYaml(text, FILE, 'policy-search');
    expect(warnings).toEqual([]);
    expect(serializeCatalog(catalog)).toBe(text);
    // With health projected back on, the bytes match the original file too.
    const healths = new Map(CATALOG.facets.flatMap((f) => f.locators.map((l, i) => [`${f.id}#${i}`, l.health] as const)));
    const reprojected = { ...catalog, facets: catalog.facets.map((f) => ({ ...f, locators: f.locators.map((l, i) => ({ ...l, health: healths.get(`${f.id}#${i}`) })) })) };
    expect(serializeCatalog(reprojected)).toBe(serializeCatalog(CATALOG));
  });

  it('writes block style with a fixed key order, facets sorted by id', () => {
    const text = serializeCatalog(CATALOG);
    expect(text).not.toMatch(/\{ ?strategy/); // no flow maps for locators
    expect(text).toContain('note: structural id, fragile');
    expect(text.indexOf('policy-search:policy-number-input')).toBeLessThan(text.indexOf('policy-search:search-button'));
    expect(text).toContain('testCase: "10001"');
    const facetBlock = text.slice(text.indexOf('- id: policy-search:policy-number-input'));
    const keys = [...facetBlock.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]).slice(0, 11);
    expect(keys).toEqual(['kind', 'displayName', 'aliases', 'role', 'tag', 'namingSource', 'affordance', 'scope', 'locators', 'status', 'provenance']);
    // The interactive-role counts are written sorted.
    expect(text.indexOf('button: 3')).toBeLessThan(text.indexOf('textbox: 1'));
  });

  it('keeps the note intact (the vision example parses "note: a, b" in a flow map into two keys)', () => {
    const { catalog } = parseCatalogYaml(serializeCatalog(CATALOG), FILE, 'policy-search');
    const css = catalog.facets[0]!.locators.find((l) => l.strategy === 'css');
    expect(css?.note).toBe('structural id, fragile');
  });

  it('ignores health and expression on load (they are projections)', () => {
    const text = serializeCatalog(CATALOG).replace('health: 12/12', 'health: 99/99').replace('note: structural', 'expression: page.x()\n        note: structural');
    const { catalog } = parseCatalogYaml(text, FILE, 'policy-search');
    expect(catalog.facets[0]!.locators.every((l) => l.health === undefined && l.expression === undefined)).toBe(true);
  });

  it('strips a BOM and reads bare numbers as strings', () => {
    const text = `﻿${serializeCatalog(CATALOG).replace('testCase: "10001"', 'testCase: 10001').replace('session: s-1', 'session: 42')}`;
    const { catalog } = parseCatalogYaml(text, FILE, 'policy-search');
    expect(catalog.facets[0]!.provenance.testCase).toBe('10001');
    expect(catalog.facets[0]!.provenance.session).toBe('42');
  });

  it('keeps typed fields typed and treats an empty value as absent', () => {
    const text = serializeCatalog(CATALOG).replace('    tag: input\n', '    tag:\n');
    const { catalog } = parseCatalogYaml(text, FILE, 'policy-search');
    const input = catalog.facets[0]!;
    expect(input.tag).toBeUndefined();
    const text100 = input.locators.find((l) => l.strategy === 'text');
    expect(text100).toMatchObject({ value: '100', exact: true, visibleOnly: true, nth: 0 });
    expect(catalog.route?.summary?.interactiveRoles).toEqual({ button: 3, textbox: 1 });
  });

  it('reports unknown keys as warnings', () => {
    const text = serializeCatalog(CATALOG).replace('    status: trusted\n', '    status: trusted\n    owner: qa-team\n');
    const { warnings } = parseCatalogYaml(text, FILE, 'policy-search');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/unknown key facets\[1\]\.owner/);
  });

  it('reads an empty file as an empty catalog', () => {
    expect(parseCatalogYaml('', FILE, 'policy-search').catalog).toEqual({ screen: 'policy-search', facets: [] });
  });

  describe('malformed files are malformed-response errors with file and line', () => {
    it('YAML syntax error', () => {
      const error = thrown(() => parseCatalogYaml('screen: policy-search\nfacets:\n  - id: [unclosed\n', FILE, 'policy-search'));
      expect(error.family).toBe('malformed-response');
      expect(error.detail).toMatchObject({ file: FILE });
      expect(error.message).toContain(FILE);
    });

    it('duplicate keys', () => {
      const error = thrown(() => parseCatalogYaml('screen: policy-search\nscreen: other\n', FILE, 'policy-search'));
      expect(error.family).toBe('malformed-response');
      expect(error.detail).toMatchObject({ line: 2 });
    });

    it('schema violation points at the offending line', () => {
      const text = serializeCatalog(CATALOG).replace('status: trusted', 'status: approved');
      const error = thrown(() => parseCatalogYaml(text, FILE, 'policy-search'));
      expect(error.family).toBe('malformed-response');
      const line = text.split('\n').findIndex((l) => l.includes('status: approved')) + 1;
      expect(error.detail).toMatchObject({ file: FILE, line });
      expect(error.message).toMatch(/facets\[1\]\.status/);
    });

    it('a facet id from another screen, a duplicate id, a mismatched screen', () => {
      const foreign = serializeCatalog(CATALOG).replace('id: policy-search:search-button', 'id: other:search-button');
      expect(thrown(() => parseCatalogYaml(foreign, FILE, 'policy-search')).message).toMatch(/must be "policy-search:/);
      const dup = serializeCatalog(CATALOG).replace('id: policy-search:search-button', 'id: policy-search:policy-number-input');
      expect(thrown(() => parseCatalogYaml(dup, FILE, 'policy-search')).message).toMatch(/duplicate facet id/);
      expect(thrown(() => parseCatalogYaml(serializeCatalog(CATALOG), FILE, 'claims')).message).toMatch(/named for "claims"/);
    });

    it('not a mapping', () => {
      expect(thrown(() => parseCatalogYaml('- a\n- b\n', FILE, 'policy-search')).family).toBe('malformed-response');
    });
  });

  it('produces YAML any reader parses to the same data', () => {
    const data = YAML.parse(serializeCatalog(CATALOG)) as { facets: Array<{ id: string; screen?: string }> };
    expect(data.facets.map((f) => f.id)).toEqual(['policy-search:policy-number-input', 'policy-search:search-button']);
    expect(data.facets.every((f) => f.screen === undefined)).toBe(true);
  });
});
