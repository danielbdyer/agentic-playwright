/**
 * The app.* and memory.* handlers against real Chromium and the
 * OutSystems-shaped fixture app, in the order an agent uses them: open the
 * login screen, observe, act from snapshot candidates (secrets via params),
 * assert, mint what was verified, query it back, enrich, act on a facet,
 * preflight; then a release renames the search placeholder and preflight
 * notices, and the facet is repaired in place.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { emitFiles, layoutOf, renderPageObject } from '../../../src/emit/index.js';
import { loadScreen, readEvents, setRoute } from '../../../src/memory/index.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { makeHarness, makeWorkspace, readAuthoringReceipts, refOf, removeWorkspace, type Harness } from './helpers.js';

describe('app.* and memory.* handlers on the fixture app', () => {
  let app: FixtureApp;
  let workspace: Workspace;
  let h: Harness;
  let pageId = '';
  let searchSnapshotId = '';
  let searchInputRef = '';
  let inputLocator: Record<string, unknown> = {};

  beforeAll(async () => {
    app = await startFixtureApp();
    workspace = await makeWorkspace({ qa: { baseURL: app.baseURL } });
    h = makeHarness(workspace);
  });

  afterAll(async () => {
    await h?.close();
    await app?.close();
    if (workspace !== undefined) await removeWorkspace(workspace);
  });

  it('opens the login screen with a profile and no authentication, and waits for hydration', async () => {
    const opened = await h.call('app.open', { url: 'Login', profile: 'qa' });
    pageId = opened.pageId;
    expect(opened).toMatchObject({ attached: false, profile: 'qa', variant: 'reactive', title: 'Sign in' });
    expect(opened.finalUrl).toBe(`${app.baseURL}Login`);
    expect(opened.hydration.settled).toBe(true);
  });

  it('observes with an intent (ranked hints) and an audit, and saves the snapshot', async () => {
    const snap = await h.call('app.observe', { pageId, intent: 'Enter @username in the Username field', audit: true, includeScreenshot: true });
    expect(snap.screenshotPath).toBe(`.tesseract/snapshots/${snap.snapshotId}.png`);
    expect((await fs.stat(path.join(workspace.paths.root, snap.screenshotPath!))).size).toBeGreaterThan(1000);
    const username = refOf(snap, 'textbox', 'Username');
    expect(snap.hints?.[0]?.ref).toBe(username);
    // Every control on the login screen is labelled and the page has a main landmark: nothing to report.
    expect(snap.audit).toEqual([]);
    await expect(fs.access(path.join(workspace.paths.snapshots, `${snap.snapshotId}.json`))).resolves.toBeUndefined();

    const filled = await h.call('app.act', {
      pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: username }, value: '@username', params: { username: 'qa.user' },
    });
    expect(filled.outcome).toBe('succeeded');
    expect(filled.resolved?.verified).toBe(true);
    expect(filled.resolved?.expression).toContain("getByRole('textbox', { name: 'Username', exact: true })");
    expect(filled.postState?.snapshotId).toMatch(/^snap-/);

    // A password typed as a literal (which the playbook forbids) still never reaches a receipt.
    const password = await h.call('app.act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Password') }, value: 'correct-horse' });
    expect(password.outcome).toBe('succeeded');

    // The click cites the first snapshot even though each act observed the page since: it is re-anchored.
    const clicked = await h.call('app.act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'button', 'Log in') } });
    expect(clicked.outcome).toBe('succeeded');
    expect(clicked.postState?.urlChanged).toBe(true);
    expect(clicked.postState?.url).toMatch(/PolicySearch$/);

    const receipts = await readAuthoringReceipts(workspace);
    expect(receipts).not.toContain('correct-horse');
    expect(receipts).not.toContain('qa.user');
    expect(receipts).toContain('"value":"<secret>"');
  });

  it('asserts the url, and reports a failed assertion with what it observed', async () => {
    const url = await h.call('app.assert', { pageId, assertion: 'url', expected: 'PolicySearch' });
    expect(url).toMatchObject({ passed: true });
    const title = await h.call('app.assert', { pageId, assertion: 'title', expected: 'Claims', timeoutMs: 300 });
    expect(title).toMatchObject({ passed: false, observed: 'Policy Search' });
  });

  it('fills and clicks from a scoped observation; the locator keeps the scope the agent observed', async () => {
    const snap = await h.call('app.observe', { pageId, scope: 'search', intent: 'Enter @policyNumber in search field', audit: true });
    searchSnapshotId = snap.snapshotId;
    searchInputRef = refOf(snap, 'textbox', 'Search Policy');
    expect(snap.hints?.[0]?.ref).toBe(searchInputRef);
    expect(snap.scope).toBe('search');
    expect(snap.audit?.map((finding) => finding.kind)).toEqual(expect.arrayContaining(['placeholder-only-input', 'roleless-clickable']));

    const filled = await h.call('app.act', {
      pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: searchInputRef }, value: '@policyNumber', params: { policyNumber: 'POL-001' },
      decision: { testCase: '10001', step: 2, chose: searchInputRef, reason: 'only textbox in the search landmark', host: { model: 'test-model' } },
    });
    expect(filled.outcome).toBe('succeeded');
    expect(filled.resolved?.expression).toBe("page.getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })");
    inputLocator = filled.resolved!.locator as Record<string, unknown>;

    const clicked = await h.call('app.act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'button', 'Search') } });
    expect(clicked.outcome).toBe('succeeded');
    expect(clicked.postState?.alerts).toContain('1 policy found');
    expect(clicked.postState?.added.some((c) => c.role === 'row' && c.name.includes('POL-001'))).toBe(true);
  });

  it('asserts row text through a parameterized locator', async () => {
    const row = await h.call('app.assert', {
      pageId, assertion: 'contains-text', target: { locator: { strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } } },
      expected: '@policyNumber', params: { policyNumber: 'POL-001' },
    });
    expect(row.passed).toBe(true);
    // Values that came in through params are masked in what the tool reports (secrets travel that way).
    expect(row.observed).toContain('<secret>');
    expect(row.observed).toContain('Ada Lovelace');
    expect(String(row.observed)).not.toContain('POL-001');
    expect(row.resolved?.verified).toBe(true);

    const missing = await h.call('app.assert', {
      pageId, assertion: 'visible', target: { locator: { strategy: 'row-text', value: '{policyNumber}' } }, params: { policyNumber: 'POL-999' }, timeoutMs: 300,
    });
    expect(missing).toMatchObject({ passed: false, observed: false });
    expect(missing.resolved?.verified).toBe(false);
  });

  it('rejects an unknown @param instead of typing it literally', async () => {
    const failure = await h.failure('app.act', { pageId, action: 'fill', target: { locator: inputLocator }, value: '@missing', params: { other: 'x' } });
    expect(failure.family).toBe('invalid-input');
    expect(failure.message).toContain('@missing');
  });

  it('mints facets from what was verified, sets the route with its landmarks, and queries them back', async () => {
    const main = await h.call('app.observe', { pageId, scope: 'main' });
    const heading = refOf(main, 'heading', 'Policy Search');
    const row = refOf(main, 'row', /POL-001/);

    const minted = await Promise.all([
      h.call('memory.mint', { screen: 'policy-search', facet: { name: 'heading', kind: 'element', displayName: 'Policy Search heading' }, evidence: { snapshotId: main.snapshotId, ref: heading }, route: { url: 'PolicySearch' } }),
      h.call('memory.mint', {
        screen: 'policy-search', facet: { name: 'policy-number-input', kind: 'element', displayName: 'Policy number search field', aliases: ['search field'], locator: inputLocator as never },
        evidence: { snapshotId: searchSnapshotId, ref: searchInputRef }, decision: { testCase: '10001', host: { model: 'test-model' } },
      }),
      h.call('memory.mint', { screen: 'policy-search', facet: { name: 'results', kind: 'row', displayName: 'Search results row', parameter: 'policyNumber', locator: { strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } } }, evidence: { snapshotId: main.snapshotId, ref: row } }),
    ]);
    expect(minted.map((m) => m.facet.id)).toEqual(['policy-search:heading', 'policy-search:policy-number-input', 'policy-search:results']);
    expect(minted.every((m) => m.created && m.facet.status === 'candidate')).toBe(true);
    const input = minted[1]!.facet;
    expect(input.provenance).toMatchObject({ instrument: 'app.act', session: 'test-session', model: 'test-model', testCase: '10001', snapshotId: searchSnapshotId, candidateRef: searchInputRef });
    // The locator app.act verified counts as the facet's first successful resolution.
    expect(input.locators[0]?.health).toBe('1/1');
    // The heading had no draft locator: the ladder resolved it on the live page, inside main.
    expect(minted[0]!.facet.locators[0]?.expression).toBe("page.getByRole('main').getByRole('heading', { name: 'Policy Search', exact: true })");

    const loaded = await loadScreen(workspace, 'policy-search');
    expect(loaded.catalog.route).toMatchObject({ url: 'PolicySearch', variant: 'reactive' });
    expect(loaded.catalog.route?.landmarks).toEqual(expect.arrayContaining(['main', 'search']));

    const hit = await h.call('memory.query', { screen: 'policy-search', phrase: 'Enter policy number in search field' });
    expect(hit.facets[0]?.id).toBe('policy-search:policy-number-input');
    expect(hit.screenKnown).toBe(true);
    expect(hit.route?.landmarks).toEqual(expect.arrayContaining(['main']));
  });

  it('rejects a mint that cites a missing snapshot or an unknown ref', async () => {
    expect((await h.failure('memory.mint', { screen: 'policy-search', facet: { displayName: 'Ghost' }, evidence: { snapshotId: 'snap-20990101000000-deadbeef', ref: 'c1' } })).family).toBe('stale-snapshot');
    expect((await h.failure('memory.mint', { screen: 'policy-search', facet: { displayName: 'Ghost' }, evidence: { snapshotId: searchSnapshotId, ref: 'c9999' } })).family).toBe('invalid-input');
  });

  it('enriches a facet with an alias, and acts on a facet target leaving evidence', async () => {
    const enriched = await h.call('memory.enrich', { facetId: 'policy-search:policy-number-input', aliases: ['policy box'], evidence: { snapshotId: searchSnapshotId, ref: searchInputRef } });
    expect(enriched.facet.aliases).toContain('policy box');
    expect(enriched.changes.join('\n')).toMatch(/policy box/);
    expect(enriched.facet.locators).toHaveLength(1);

    const acted = await h.call('app.act', { pageId, action: 'fill', target: { facetId: 'policy-search:policy-number-input' }, value: 'POL-002' });
    expect(acted).toMatchObject({ outcome: 'succeeded', facetId: 'policy-search:policy-number-input' });
    expect(acted.resolved?.verified).toBe(true);
    const asserted = await h.call('app.assert', { pageId, assertion: 'value', target: { facetId: 'policy-search:policy-number-input' }, expected: 'POL-002' });
    expect(asserted.passed).toBe(true);

    const { events } = await readEvents(workspace, 'policy-search');
    const uses = events.filter((e) => e.kind === 'resolved' && e.facetId === 'policy-search:policy-number-input');
    expect(uses.map((e) => (e.kind === 'resolved' ? `${e.source}:${e.outcome}` : ''))).toEqual(expect.arrayContaining(['act:ok', 'assert:ok']));

    // A candidate the agent acts on that memory already holds is named, so it enriches instead of minting a twin.
    const snap = await h.call('app.observe', { pageId, scope: 'search' });
    const again = await h.call('app.act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Search Policy') } });
    expect(again.facetId).toBe('policy-search:policy-number-input');
  });

  it('reports an unknown facet or page as not-found', async () => {
    expect((await h.failure('app.act', { pageId, action: 'click', target: { facetId: 'policy-search:nope' } })).family).toBe('not-found');
    expect((await h.failure('app.observe', { pageId: 'p999' })).family).toBe('not-found');
    expect((await h.failure('app.act', { pageId: 'p999', action: 'click', target: { facetId: 'policy-search:heading' } })).family).toBe('not-found');
  });

  it('preflights the screen: ok, and the first clean preflight records the route fingerprint', async () => {
    const result = await h.call('memory.preflight', { screen: 'policy-search', pageId, flows: ['login'] });
    const screen = result.screens[0]!;
    expect(screen).toMatchObject({ screen: 'policy-search', url: 'PolicySearch', status: 'ok', fingerprintChanged: false });
    expect(Object.fromEntries(screen.facets.map((f) => [f.id, f.status]))).toEqual({
      'policy-search:heading': 'ok',
      'policy-search:policy-number-input': 'ok',
      'policy-search:results': 'unchecked',
    });
    expect(result.flows).toEqual([expect.objectContaining({ id: 'login', status: 'missing' })]);
    expect(result.summary).toMatchObject({ ok: 2, unchecked: 1, missing: 1 });
    const loaded = await loadScreen(workspace, 'policy-search');
    expect(loaded.catalog.route?.fingerprint).toMatch(/^sha256:/);
    expect(loaded.catalog.route?.summary?.landmarks).toEqual(expect.arrayContaining(['main', 'search']));
    // The caller's page is used, not closed.
    expect(h.runtime.ctx.browser.list().map((p) => p.pageId)).toContain(pageId);
  });

  it('after a release renames the search placeholder, preflight reports the input and the screen', async () => {
    app.setVariant('v2-renamed-search');
    const result = await h.call('memory.preflight', { screen: 'policy-search', pageId });
    const screen = result.screens[0]!;
    const inputEntry = screen.facets.find((f) => f.id === 'policy-search:policy-number-input')!;
    expect(['stale', 'missing']).toContain(inputEntry.status);
    expect(inputEntry.locator).toContain('Search Policy');
    expect(['stale', 'missing']).toContain(screen.status);
    expect(screen.facets.find((f) => f.id === 'policy-search:heading')?.status).toBe('ok');
    // A placeholder rename changes no structure, so the fingerprint itself holds.
    expect(screen.fingerprintChanged).toBe(false);
  });

  it('reports a structural fingerprint drift with its diff', async () => {
    const loaded = await loadScreen(workspace, 'policy-search');
    const route = loaded.catalog.route!;
    // Pretend the route was recorded when the page also had a complementary landmark and two more buttons.
    const summary = route.summary!;
    await setRoute(workspace, 'policy-search', { url: route.url, fingerprint: route.fingerprint! }, {
      ...summary,
      landmarks: [...summary.landmarks, 'complementary'].sort(),
      interactiveRoles: { ...summary.interactiveRoles, button: (summary.interactiveRoles.button ?? 0) + 2 },
    });
    const result = await h.call('memory.preflight', { screen: 'policy-search', pageId });
    const screen = result.screens[0]!;
    expect(screen.fingerprintChanged).toBe(true);
    expect(screen.fingerprintDiff).toEqual(expect.arrayContaining(['landmark complementary missing']));
    expect(screen.fingerprintDiff.some((d) => /^button \d+ → \d+$/.test(d))).toBe(true);
    expect(['stale', 'missing']).toContain(screen.status);
  });

  it('repairs in place: act on the renamed input, enrich the facet, and the existing page object is regenerated', async () => {
    // A page object exists from an earlier emit.
    const before = await loadScreen(workspace, 'policy-search');
    const rendered = renderPageObject('policy-search', before.catalog.route ?? null, before.catalog.facets, null, { layout: layoutOf(workspace) });
    await emitFiles(workspace, { pageObjects: [rendered], flows: [] });
    const pagePath = path.join(workspace.paths.root, 'pages', 'policy-search.page.ts');
    expect(await fs.readFile(pagePath, 'utf8')).toContain("name: 'Search Policy'");

    await h.call('app.open', { pageId, url: 'PolicySearch' });
    const snap = await h.call('app.observe', { pageId, scope: 'search', intent: 'Enter policy number in search field' });
    const input = refOf(snap, 'textbox', 'Find a policy');
    const tried = await h.call('app.act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: input }, value: 'POL-001' });
    expect(tried.outcome).toBe('succeeded');
    const enriched = await h.call('memory.enrich', { facetId: 'policy-search:policy-number-input', locator: tried.resolved!.locator, evidence: { snapshotId: snap.snapshotId, ref: input } });
    expect(enriched.changes.join('\n')).toMatch(/regenerated pages\/policy-search\.page\.ts/);
    expect(enriched.facet.locators[0]?.name).toBe('Find a policy');
    const text = await fs.readFile(pagePath, 'utf8');
    expect(text).toContain("getByRole('search').getByRole('textbox', { name: 'Find a policy', exact: true })");

    const after = await h.call('memory.preflight', { screen: 'policy-search', pageId });
    expect(after.screens[0]!.facets.find((f) => f.id === 'policy-search:policy-number-input')?.status).toBe('ok');
  });

  it('navigates relative to the profile baseURL with app.act navigate', async () => {
    const moved = await h.call('app.act', { pageId, action: 'navigate', value: 'Claims' });
    expect(moved.outcome).toBe('succeeded');
    expect(moved.postState?.url).toMatch(/\/PolicyApp\/Claims$/);
    expect(moved.postState?.urlChanged).toBe(true);
    const selected = await h.call('app.act', { pageId, action: 'select', target: { locator: { strategy: 'label', value: 'Claim status' } }, value: 'Closed' });
    expect(selected).toMatchObject({ outcome: 'succeeded', select: { via: 'native' } });
    const count = await h.call('app.assert', { pageId, assertion: 'text', target: { locator: { strategy: 'text', value: '7 closed claims' } }, expected: '7 closed claims' });
    expect(count.passed).toBe(true);
  });

  it('returns page-side failures as results, not errors', async () => {
    const missing = await h.call('app.act', { pageId, action: 'click', target: { locator: { strategy: 'role-name', role: 'button', name: 'No such button' } }, timeoutMs: 300 });
    expect(missing).toMatchObject({ outcome: 'failed', errorFamily: 'not-found' });
    expect(missing.resolved?.verified).toBe(false);
    expect(missing.postState).toBeUndefined();
  });
});
