import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { isToolError } from '../../../src/core/errors.js';
import { toPlaywrightLocator } from '../../../src/locator/locator.js';
import { CandidateSchema, ResolvedLocatorSchema, type Candidate } from '../../../src/contract/schemas.js';
import {
  countMatches,
  cssForId,
  generateRungs,
  nameForLocator,
  proposeLocator,
  resolveCandidateLocator,
  scopeVariants,
} from '../../../src/observe/ladder.js';
import { observePage } from '../../../src/observe/observe.js';
import type { RefDescription } from '../../../src/observe/in-page/walker.js';
import { launch, openFixture } from './helpers.js';

let browser: Browser;
let page: Page;
let snapshotId: string;
let candidates: readonly Candidate[];

const refOf = (name: string, nth = 0): string => {
  const ref = candidates.filter((c) => c.name === name)[nth]?.ref;
  if (ref === undefined) throw new Error(`no candidate ${name}#${nth}`);
  return ref;
};

beforeAll(async () => {
  browser = await launch();
  page = await openFixture(browser);
  const { record } = await observePage(page, { pageId: 'p1', pii: 'off', maxCandidates: 500 });
  snapshotId = record.snapshotId;
  candidates = record.candidates;
});

afterAll(async () => {
  await browser.close();
});

const desc = (fields: Partial<RefDescription>): RefDescription => ({
  ref: 'c1',
  role: 'button',
  name: '',
  namingSource: 'none',
  affordance: 'native',
  interactive: true,
  category: 'control',
  tag: 'button',
  visible: true,
  ...fields,
});

describe('ladder: pure rung generation', () => {
  it('orders rungs role-name, label, placeholder, text, test-id, css', () => {
    const rungs = generateRungs(desc({
      role: 'textbox', name: 'Policy holder', namingSource: 'label-for', labelText: 'Policy holder', placeholder: 'e.g. Jane',
      testId: 'holder', testIdAttribute: 'os-test-id', id: 'Input_PolicyHolder', idKind: 'designer', tag: 'input',
    }));
    expect(rungs.map((r) => r.strategy)).toEqual(['role-name', 'label', 'placeholder', 'test-id', 'css']);
    expect(rungs[3]).toMatchObject({ value: 'holder', attribute: 'os-test-id' });
    expect(rungs[4]).toMatchObject({ value: '#Input_PolicyHolder' });
  });

  it('never offers a css rung for a structural id, and no role-name rung for generic', () => {
    const rungs = generateRungs(desc({ role: 'generic', name: 'Filter', namingSource: 'content', id: 'b3-Filter', idKind: 'structural', tag: 'div' }));
    expect(rungs.map((r) => r.strategy)).toEqual(['text']);
  });

  it('selects rows by cell text and scopes per-row controls by row', () => {
    const row = generateRungs(desc({ role: 'row', name: 'POL-001 Jane jane@x.com', category: 'row', rowCells: ['POL-001', 'jane@x.com'], namingSource: 'content' }));
    expect(row[0]).toEqual({ strategy: 'row-text', role: 'row', value: 'POL-001' });
    expect(row.some((r) => r.value === 'jane@x.com')).toBe(false);
    const scopes = scopeVariants(desc({ role: 'link', name: 'Edit', landmark: 'main', dataBlock: 'Results', rowCells: ['POL-001', 'Edit'] }));
    expect(scopes).toEqual([
      undefined,
      { landmark: 'main' },
      { landmark: 'main', dataBlock: 'Results' },
      { rowText: 'POL-001' },
      { landmark: 'main', dataBlock: 'Results', rowText: 'POL-001' },
    ]);
  });

  it('cuts long names to a fragment and strips icon glyphs', () => {
    expect(nameForLocator('Save')).toEqual({ value: 'Save', exact: true });
    expect(nameForLocator(' Search')).toEqual({ value: 'Search', exact: false });
    const long = nameForLocator('word '.repeat(40));
    expect(long?.exact).toBe(false);
    expect((long?.value.length ?? 0) <= 60).toBe(true);
    expect(cssForId('a:b')).toBe('[id="a:b"]');
  });

  it('proposes an unverified locator from a stored candidate, skipping redacted text', () => {
    const candidate = CandidateSchema.parse({
      ref: 'c4', role: 'textbox', name: 'Search Policy', namingSource: 'placeholder', affordance: 'native', interactive: true,
      tag: 'input', landmark: 'search', placeholder: 'Search Policy', visible: true, enabled: true, inViewport: true,
    });
    expect(proposeLocator(candidate)).toEqual({ strategy: 'role-name', role: 'textbox', name: 'Search Policy', exact: true, scope: { landmark: 'search' } });
    const redacted = { ...candidate, role: 'cell', name: 'Contact <email>', namingSource: 'content' as const, placeholder: undefined, landmark: undefined };
    expect(proposeLocator(redacted)).toBeNull();
  });
});

describe('ladder: live resolution', () => {
  it('resolves the placeholder-named search textbox by role and name, verified', async () => {
    const result = await resolveCandidateLocator(page, snapshotId, refOf('Search Policy'));
    ResolvedLocatorSchema.parse(result);
    expect(result.verified).toBe(true);
    expect(result.locator).toMatchObject({ strategy: 'role-name', role: 'textbox', name: 'Search Policy' });
    expect(result.expression).toBe("page.getByRole('textbox', { name: 'Search Policy', exact: true })");
    expect(await toPlaywrightLocator(page, result.locator).count()).toBe(1);
  });

  it('resolves duplicate per-row "Edit" links through the row scope', async () => {
    const result = await resolveCandidateLocator(page, snapshotId, refOf('Edit', 1));
    expect(result.verified).toBe(true);
    expect(result.locator.scope).toEqual({ rowText: 'POL-002' });
    expect(result.expression).toBe("page.getByRole('row').filter({ hasText: 'POL-002' }).getByRole('link', { name: 'Edit', exact: true })");
    const unscoped = result.alternatives[0];
    expect(unscoped?.matches).toBe(3);
    expect(unscoped?.rejectedBecause).toBe('3 visible matches');
    // The chosen locator really is the second row's link.
    expect(await toPlaywrightLocator(page, result.locator).getAttribute('href')).toBe('#edit/2');
  });

  it('resolves the roleless Filter clickable by exact text', async () => {
    const result = await resolveCandidateLocator(page, snapshotId, refOf('Filter'));
    expect(result.verified).toBe(true);
    expect(result.locator).toMatchObject({ strategy: 'text', value: 'Filter', exact: true });
    expect(result.expression).toBe("page.getByText('Filter', { exact: true })");
  });

  it('honours aria-labelledby over aria-label in the chosen name', async () => {
    const result = await resolveCandidateLocator(page, snapshotId, refOf('From labelledby'));
    expect(result.verified).toBe(true);
    expect(result.locator.name).toBe('From labelledby');
  });

  it('falls through to test-id and designer-id css for unnamed controls', async () => {
    const icon = candidates.find((c) => c.testId === 'CloseIcon');
    const byTestId = await resolveCandidateLocator(page, snapshotId, icon?.ref ?? '');
    expect(byTestId.locator).toMatchObject({ strategy: 'test-id', value: 'CloseIcon', attribute: 'os-test-id' });
    expect(byTestId.verified).toBe(true);
    const discount = candidates.find((c) => c.id === 'Input_Discount');
    const byCss = await resolveCandidateLocator(page, snapshotId, discount?.ref ?? '');
    expect(byCss.locator).toMatchObject({ strategy: 'css', value: '#Input_Discount' });
    expect(byCss.verified).toBe(true);
  });

  it('verifies a role-only locator when the role alone is unique (unnamed landmark, unlabelled select)', async () => {
    const main = candidates.find((c) => c.role === 'main');
    const resolvedMain = await resolveCandidateLocator(page, snapshotId, main?.ref ?? '');
    expect(resolvedMain).toMatchObject({ verified: true, expression: "page.getByRole('main')" });
    const select = candidates.find((c) => c.id === 'b6-Select_Status');
    const resolvedSelect = await resolveCandidateLocator(page, snapshotId, select?.ref ?? '');
    expect(resolvedSelect).toMatchObject({ verified: true, expression: "page.getByRole('combobox')" });
  });

  it('returns an unverified nth locator when only a structural id identifies the element', async () => {
    const code = candidates.find((c) => c.id === 'b9-Input_Code2');
    const result = await resolveCandidateLocator(page, snapshotId, code?.ref ?? '');
    expect(result.verified).toBe(false);
    expect(result.locator.nth).toBeTypeOf('number');
    expect(result.expression).not.toContain('b9-');
    expect(await toPlaywrightLocator(page, result.locator).getAttribute('id')).toBe('b9-Input_Code2');
  });

  it('counts total and visible matches', async () => {
    expect(await countMatches(page, { strategy: 'role-name', role: 'link', name: 'Edit' })).toEqual({ total: 3, visible: 3 });
    expect(await countMatches(page, { strategy: 'text', value: 'Hidden action' })).toEqual({ total: 1, visible: 0 });
  });

  it('reports a stale snapshot after the page is observed again, and an unknown ref', async () => {
    const page2 = await openFixture(browser);
    try {
      const first = await observePage(page2, { pageId: 'p2', pii: 'off' });
      await observePage(page2, { pageId: 'p2', pii: 'off' });
      const error = await resolveCandidateLocator(page2, first.record.snapshotId, 'c1').catch((e: unknown) => e);
      expect(isToolError(error) && error.family).toBe('stale-snapshot');
      const second = await observePage(page2, { pageId: 'p2', pii: 'off' });
      const unknown = await resolveCandidateLocator(page2, second.record.snapshotId, 'c999').catch((e: unknown) => e);
      expect(isToolError(unknown) && unknown.family).toBe('not-found');
      await page2.reload();
      const navigated = await resolveCandidateLocator(page2, second.record.snapshotId, 'c1').catch((e: unknown) => e);
      expect(isToolError(navigated) && navigated.family).toBe('stale-snapshot');
    } finally {
      await page2.close();
    }
  });
});
