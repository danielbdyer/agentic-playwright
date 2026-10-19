import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { Facet } from '../../../src/contract/schemas.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import {
  checkFacetsOnPage,
  findFacet,
  loadScreen,
  preflightEntries,
  readEvents,
  recordPreflight,
  saveScreen,
  screenPreflightStatus,
  summarizePreflight,
} from '../../../src/memory/index.js';
import { facet, removeWorkspace, steppingClock, tempWorkspace } from './helpers.js';

const PAGE = `<!doctype html>
<html><body>
  <header role="banner"><nav aria-label="Main"><a href="#">Policies</a></nav></header>
  <main>
    <div role="search">
      <input aria-label="Search Policy" placeholder="Search Policy">
      <button>Search</button>
    </div>
    <button>Edit</button><button>Edit</button>
    <button>Save</button>
    <div id="spinner" style="display:none">Loading</div>
    <button id="twin-hidden" style="display:none">Apply</button><button>Apply</button>
    <table>
      <tr><td>POL-001</td><td>Active</td></tr>
      <tr><td>POL-002</td><td>Lapsed</td></tr>
    </table>
  </main>
</body></html>`;

const S = 'policy-search';
const f = (local: string, rest: Partial<Facet>): Facet => facet({ id: `${S}:${local}`, ...rest });

const FACETS: readonly Facet[] = [
  f('policy-number-input', { locators: [{ strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } }] }),
  f('delete-button', { locators: [{ strategy: 'role-name', role: 'button', name: 'Delete' }, { strategy: 'css', value: '#delete' }] }),
  f('edit-button', { locators: [{ strategy: 'role-name', role: 'button', name: 'Edit' }] }),
  f('spinner', { locators: [{ strategy: 'css', value: '#spinner' }] }),
  f('save-button', { locators: [{ strategy: 'role-name', role: 'button', name: 'Store' }, { strategy: 'text', value: 'Save' }] }),
  f('apply-button', { locators: [{ strategy: 'css', value: 'button:text-is("Apply")', visibleOnly: true }] }),
  f('result-row', { kind: 'row', parameter: 'policyNumber', locators: [{ strategy: 'row-text', value: '{policyNumber}' }] }),
  f('broken', { locators: [{ strategy: 'css', value: 'div[[[' }] }),
  f('retired-thing', { status: 'retired', locators: [{ strategy: 'role-name', role: 'button', name: 'Gone' }] }),
];

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.setContent(PAGE);
});

afterEach(async () => {
  await page.close();
});

describe('checkFacetsOnPage (real Chromium)', () => {
  it('reports ok, missing, stale (ambiguous, hidden, fallback-only), and unchecked', async () => {
    const checks = await checkFacetsOnPage(page, FACETS);
    const byId = Object.fromEntries(preflightEntries(checks).map((e) => [e.id.split(':')[1], e]));

    expect(byId['policy-number-input']).toEqual({
      id: `${S}:policy-number-input`,
      status: 'ok',
      matches: 1,
      locator: "page.getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })",
    });
    expect(byId['delete-button']).toMatchObject({ status: 'missing', matches: 0, detail: 'no locator matches anything' });
    expect(byId['edit-button']).toMatchObject({ status: 'stale', matches: 2, detail: 'ambiguous: 2 visible matches' });
    expect(byId['spinner']).toMatchObject({ status: 'stale', matches: 0, detail: '1 match, none visible' });
    expect(byId['save-button']).toMatchObject({ status: 'stale', detail: "no match; fallback page.getByText('Save', { exact: true }) matches one" });
    expect(byId['apply-button']).toMatchObject({ status: 'ok', matches: 1 });
    expect(byId['result-row']).toMatchObject({ status: 'unchecked', detail: 'needs parameter {policyNumber}' });
    expect(byId['broken']?.status).toBe('unchecked');
    expect(byId['broken']?.detail).toMatch(/^could not check: /);
    expect(byId['retired-thing']).toBeUndefined();

    expect(summarizePreflight(preflightEntries(checks))).toEqual({ ok: 2, stale: 3, missing: 1, unchecked: 2 });
    expect(screenPreflightStatus(preflightEntries(checks), false)).toBe('missing');
  });

  it('leaves out a fallback that cannot be counted instead of hiding the best locator’s result', async () => {
    const [check] = await checkFacetsOnPage(page, [f('gone', { locators: [{ strategy: 'role-name', role: 'button', name: 'Delete' }, { strategy: 'css', value: 'div[[[' }] })]);
    expect(check?.entry).toMatchObject({ status: 'missing', matches: 0 });
    expect(check?.attempts.map((a) => a.outcome)).toEqual(['not-found']);
  });

  it('checks a row facet once its parameter has a value', async () => {
    const [ok] = await checkFacetsOnPage(page, [FACETS[6]!], { policyNumber: 'POL-002' });
    expect(ok?.entry).toMatchObject({ status: 'ok', matches: 1 });
    const [none] = await checkFacetsOnPage(page, [FACETS[6]!], { policyNumber: 'POL-999' });
    expect(none?.entry.status).toBe('missing');
  });

  it('reports one resolution attempt per locator counted', async () => {
    const checks = await checkFacetsOnPage(page, FACETS);
    const attempts = Object.fromEntries(checks.map((c) => [c.entry.id.split(':')[1], c.attempts.map((a) => a.outcome)]));
    expect(attempts['policy-number-input']).toEqual(['ok']);
    expect(attempts['delete-button']).toEqual(['not-found', 'not-found']);
    expect(attempts['edit-button']).toEqual(['ambiguous']);
    expect(attempts['spinner']).toEqual(['not-visible']);
    expect(attempts['save-button']).toEqual(['not-found', 'ok']);
    expect(attempts['result-row']).toEqual([]);
    expect(checks.flatMap((c) => c.attempts).every((a) => a.source === 'preflight')).toBe(true);
  });

  it('an ok screen with a drifted fingerprint is stale', () => {
    expect(screenPreflightStatus([{ id: 'a:b', status: 'ok' }], true)).toBe('stale');
    expect(screenPreflightStatus([{ id: 'a:b', status: 'ok' }], false)).toBe('ok');
  });
});

describe('recordPreflight', () => {
  let ws: Workspace;
  const options = { now: steppingClock() };

  beforeEach(async () => {
    ws = await tempWorkspace();
    await saveScreen(ws, { screen: S, facets: [FACETS[0]!, f('results-table', { locators: [{ strategy: 'role-name', role: 'table', name: 'Results' }] })] }, options);
  });

  afterEach(async () => {
    await removeWorkspace(ws);
  });

  const preflight = async (): Promise<readonly string[]> => {
    const { catalog } = await loadScreen(ws, S, options);
    const checks = await checkFacetsOnPage(page, catalog.facets);
    return (await recordPreflight(ws, checks, { ...options, pageFingerprint: 'sha256:page', runId: 'pf-1' })).staled;
  };

  it('appends the attempts as resolved events with the page fingerprint', async () => {
    await preflight();
    const { events } = await readEvents(ws, S);
    const resolved = events.filter((e) => e.kind === 'resolved');
    expect(resolved).toHaveLength(2);
    expect(resolved.every((e) => e.kind === 'resolved' && e.source === 'preflight' && e.pageFingerprint === 'sha256:page' && e.runId === 'pf-1')).toBe(true);
    expect((await findFacet(ws, `${S}:policy-number-input`, options))?.locators[0]?.health).toBe('1/1');
  });

  it('never stales a facet preflight has not seen (it may only exist after an action)', async () => {
    for (let i = 0; i < 6; i += 1) expect(await preflight()).toEqual([]);
    const table = await findFacet(ws, `${S}:results-table`, options);
    expect(table?.status).toBe('candidate');
    expect(table?.locators[0]?.health).toBe('0/0');
  });

  it('stales a facet preflight once saw, when it keeps failing past the floor', async () => {
    expect(await preflight()).toEqual([]);
    await page.setContent('<main><p>The search box was removed in this release.</p></main>');
    expect(await preflight()).toEqual([]);
    expect(await preflight()).toEqual([]);
    expect(await preflight()).toEqual([`${S}:policy-number-input`]);
    expect((await findFacet(ws, `${S}:policy-number-input`, options))?.status).toBe('stale');
  });
});
