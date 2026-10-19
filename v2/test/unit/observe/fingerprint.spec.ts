import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { PageFingerprintSchema } from '../../../src/contract/schemas.js';
import { buildFingerprint, diffFingerprints, fingerprintBasis, pathOf } from '../../../src/observe/fingerprint.js';
import type { FingerprintInputs } from '../../../src/observe/in-page/walker.js';
import { observePage } from '../../../src/observe/observe.js';
import { POLICY_SEARCH, launch, openFixture } from './helpers.js';

const inputs = (overrides: Partial<FingerprintInputs> = {}): FingerprintInputs => ({
  title: 'Policy Search',
  landmarks: ['main', 'banner', 'search'],
  roleCounts: { button: 3, link: 5, row: 4 },
  interactive: 8,
  rolelessInteractive: 1,
  placeholderOnlyInputs: 1,
  dataBlocks: 12,
  dataBlockNames: ['SearchBlock', 'Layout', 'SearchBlock'],
  runtimeGlobal: 'OutSystems',
  ...overrides,
});

describe('fingerprint (pure)', () => {
  it('hashes only the stable projection', () => {
    const base = buildFingerprint(inputs(), 'https://app.example.com/PolicySearch?q=1', 'standard');
    expect(PageFingerprintSchema.parse(base)).toEqual(base);
    expect(base.path).toBe('/PolicySearch');
    expect(base.landmarks).toEqual(['banner', 'main', 'search']);
    // Data-dependent counts, title and URL do not move the hash.
    const moreRows = buildFingerprint(
      inputs({ roleCounts: { button: 3, link: 9, row: 40 }, interactive: 12, dataBlocks: 30, title: 'Policy Search (40)' }),
      'https://app.example.com/Other',
      'standard',
    );
    expect(moreRows.hash).toBe(base.hash);
    // Structure does.
    expect(buildFingerprint(inputs({ landmarks: ['main'] }), 'https://x/', 'standard').hash).not.toBe(base.hash);
    expect(buildFingerprint(inputs({ roleCounts: { button: 3, link: 5, checkbox: 1 } }), 'https://x/', 'standard').hash).not.toBe(base.hash);
    expect(buildFingerprint(inputs({ dataBlockNames: ['SearchBlock'] }), 'https://x/', 'standard').hash).not.toBe(base.hash);
    expect(buildFingerprint(inputs({ runtimeGlobal: null }), 'https://x/', 'standard').hash).not.toBe(base.hash);
  });

  it('redacts title and path', () => {
    const fingerprint = buildFingerprint(inputs({ title: 'Customer jane@x.com' }), 'https://x/customers/jane@x.com/edit?id=9', 'standard');
    expect(fingerprint.title).toBe('Customer <email>');
    expect(fingerprint.path).toBe('/customers/<email>/edit');
    expect(pathOf('not a url?x=1', 'standard')).toBe('not a url');
  });

  it('describes differences, structure first', () => {
    const a = buildFingerprint(inputs(), 'https://x/a', 'off');
    const b = buildFingerprint(inputs({ landmarks: ['main', 'navigation'], roleCounts: { button: 2, checkbox: 1 }, title: 'Other' }), 'https://x/b', 'off');
    expect(diffFingerprints(a, b)).toEqual([
      'landmarks added: navigation',
      'landmarks removed: banner, search',
      'interactive roles added: checkbox',
      'interactive roles removed: link, row',
      'path: /a → /b',
      'title: "Policy Search" → "Other"',
    ]);
    expect(diffFingerprints(a, a)).toEqual([]);
    const renamed = buildFingerprint(inputs({ dataBlockNames: ['Layout', 'SearchBlockV2'] }), 'https://x/a', 'off');
    // The fingerprint carries its block names, so the diff names them without the record bases.
    expect(diffFingerprints(a, renamed)).toEqual(['data-blocks added: SearchBlockV2', 'data-blocks removed: SearchBlock']);
    const { dataBlockNames: _omitA, ...legacyA } = a;
    const { dataBlockNames: _omitB, ...legacyB } = renamed;
    expect(diffFingerprints(legacyA, legacyB)).toEqual(['structure digest changed (data-block names)']);
    expect(
      diffFingerprints(a, renamed, { before: fingerprintBasis(inputs()), after: fingerprintBasis(inputs({ dataBlockNames: ['Layout', 'SearchBlockV2'] })) }),
    ).toEqual(['data-blocks added: SearchBlockV2', 'data-blocks removed: SearchBlock']);
  });
});

describe('fingerprint (live page)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launch();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('is stable when only the row data changes, and moves when the structure does', async () => {
    const original = await openFixture(browser);
    const otherRows = POLICY_SEARCH()
      .replace(/<tbody id="results-body">[\s\S]*?<\/tbody>/, `<tbody id="results-body">${
        ['POL-101', 'POL-102', 'POL-103', 'POL-104', 'POL-105']
          .map((id) => `<tr><td>${id}</td><td>Someone Else</td><td>x@y.org</td><td>Lapsed</td><td><a href="#e">Edit</a></td></tr>`)
          .join('')
      }</tbody>`)
      .replace('3 policies found', '5 policies found');
    const differentData = await openFixture(browser, otherRows);
    const withSidebar = await openFixture(browser, POLICY_SEARCH().replace('<footer', '<aside aria-label="Help">Tips</aside><footer'));
    const a = (await observePage(original, { pageId: 'a' })).snapshot.fingerprint;
    const b = (await observePage(differentData, { pageId: 'b' })).snapshot.fingerprint;
    const c = (await observePage(withSidebar, { pageId: 'c' })).snapshot.fingerprint;
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
    expect(diffFingerprints(a, c)).toContain('landmarks added: complementary');
  });
});
