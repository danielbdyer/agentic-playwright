/**
 * The handler helpers that need no browser: "@param" substitution, the
 * preflight status rules, the preflight receipt log, and the route
 * landmarks memory now keeps (the fix to memory's route handling).
 */
import { promises as fs } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import type { Candidate, Facet, PreflightEntry } from '../../../src/contract/schemas.js';
import { loadScreen, mintFacet, queryMemory, setRoute } from '../../../src/memory/index.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { lookupParam, paramNamesIn, substituteAtParams, substituteOptional } from '../../../src/tools/handlers/support/params.js';
import { checkedScreenStatus, flowStatus } from '../../../src/tools/handlers/support/preflight.js';
import { appendPreflightReceipt, lastPreflightReceipt, preflightLogPath } from '../../../src/tools/handlers/memory.js';
import { recalledResolution, rememberResolution } from '../../../src/tools/handlers/support/page-state.js';
import { regeneratePageObject, regenerationNote } from '../../../src/tools/handlers/support/page-objects.js';
import { emitFiles, layoutOf, renderPageObject } from '../../../src/emit/index.js';
import { makeWorkspace, removeWorkspace } from './helpers.js';

describe('@param substitution', () => {
  it('replaces whole and embedded references, exact key first, then case-insensitively', () => {
    expect(substituteAtParams('@policyNumber', { policyNumber: 'POL-001' })).toEqual({ text: 'POL-001', used: true });
    expect(substituteAtParams('Dear @First @last,', { first: 'Ada', last: 'Lovelace' }).text).toBe('Dear Ada Lovelace,');
    expect(lookupParam('Name', { name: 'lower', Name: 'exact' })).toBe('exact');
  });

  it('leaves e-mail addresses and plain text alone', () => {
    expect(substituteAtParams('qa@example.com', undefined)).toEqual({ text: 'qa@example.com', used: false });
    expect(substituteAtParams('no references', {})).toEqual({ text: 'no references', used: false });
    expect(paramNamesIn('Enter @policyNumber for @holder, mail a@b.c')).toEqual(['policyNumber', 'holder']);
  });

  it('refuses a reference with no value, naming it', () => {
    expect(() => substituteAtParams('@secret', { other: 'x' })).toThrow(ToolError);
    try {
      substituteAtParams('@secret', undefined, 'expected');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).family).toBe('invalid-input');
      expect((error as ToolError).message).toMatch(/expected references @secret/);
    }
  });

  it('passes numbers and absent values through', () => {
    expect(substituteOptional(3, { a: 'b' })).toEqual({ value: 3, used: false });
    expect(substituteOptional(undefined, undefined)).toEqual({ value: undefined, used: false });
  });
});

const facet = (id: string, status: Facet['status']): Facet => ({
  id, screen: id.split(':')[0]!, kind: 'element', displayName: id, aliases: [], locators: [{ strategy: 'text', value: id }], status,
  provenance: { mintedAt: '2026-01-01T00:00:00.000Z', instrument: 'human' },
});

const entry = (id: string, status: PreflightEntry['status']): PreflightEntry => ({ id, status });

describe('preflight status rules', () => {
  const facets = [facet('s:a', 'trusted'), facet('s:b', 'candidate')];

  it('missing only when a trusted facet matches nothing; any other drift is stale', () => {
    expect(checkedScreenStatus([entry('s:a', 'ok'), entry('s:b', 'ok')], facets, false)).toBe('ok');
    expect(checkedScreenStatus([entry('s:a', 'missing'), entry('s:b', 'ok')], facets, false)).toBe('missing');
    expect(checkedScreenStatus([entry('s:a', 'ok'), entry('s:b', 'missing')], facets, false)).toBe('stale');
    expect(checkedScreenStatus([entry('s:a', 'stale'), entry('s:b', 'ok')], facets, false)).toBe('stale');
    expect(checkedScreenStatus([entry('s:a', 'ok'), entry('s:b', 'unchecked')], facets, true)).toBe('stale');
    expect(checkedScreenStatus([entry('s:a', 'unchecked')], facets, false)).toBe('ok');
  });

  it('judges a flow by its facets, and leaves it unchecked when its screens were not checked', () => {
    const entries = new Map([['s:a', entry('s:a', 'ok')], ['s:b', entry('s:b', 'stale')], ['s:c', entry('s:c', 'unchecked')]]);
    const checked = new Set(['s']);
    expect(flowStatus('f', ['s:a'], entries, checked)).toEqual({ id: 'f', status: 'ok' });
    expect(flowStatus('f', ['s:a', 's:b'], entries, checked)).toMatchObject({ status: 'stale', detail: 'facet(s) stale: s:b' });
    expect(flowStatus('f', ['s:a', 's:gone'], entries, checked)).toMatchObject({ status: 'missing', detail: 'facet(s) missing: s:gone' });
    expect(flowStatus('f', ['s:c'], entries, checked)).toMatchObject({ status: 'unchecked' });
    expect(flowStatus('f', ['s:a', 'login:user'], entries, checked)).toMatchObject({ status: 'unchecked', detail: expect.stringContaining('login') });
    expect(flowStatus('f', [], entries, checked)).toMatchObject({ status: 'unchecked' });
  });
});

describe('verified resolutions remembered for mint and enrich', () => {
  it('keeps verified locators only, newest last', () => {
    const resolved = { locator: { strategy: 'text' as const, value: 'x' }, expression: "page.getByText('x', { exact: true })", alternatives: [] };
    rememberResolution('snap-a', 'c1', { ...resolved, verified: false });
    expect(recalledResolution('snap-a', 'c1')).toBeUndefined();
    rememberResolution('snap-a', 'c1', { ...resolved, verified: true });
    expect(recalledResolution('snap-a', 'c1')?.verified).toBe(true);
    for (let i = 0; i < 600; i += 1) rememberResolution(`snap-bulk-${i}`, 'c1', { ...resolved, verified: true });
    expect(recalledResolution('snap-a', 'c1')).toBeUndefined();
    expect(recalledResolution('snap-bulk-599', 'c1')).toBeDefined();
  });
});

describe('page-object regeneration notes', () => {
  it('says what enrich changed on disk, and stays quiet when nothing did', () => {
    expect(regenerationNote({ status: 'regenerated', path: 'pages/a.page.ts', orphaned: [] })).toBe('regenerated pages/a.page.ts');
    expect(regenerationNote({ status: 'regenerated', path: 'pages/a.page.ts', orphaned: ['member x'] })).toMatch(/orphaned: member x/);
    expect(regenerationNote({ status: 'skipped', path: 'pages/a.page.ts', reason: 'conflict: hand edited' })).toMatch(/not regenerated \(conflict: hand edited\)/);
    expect(regenerationNote({ status: 'unchanged', path: 'pages/a.page.ts' })).toBeNull();
    expect(regenerationNote({ status: 'absent', path: 'pages/a.page.ts' })).toBeNull();
  });
});

describe('workspace-backed helpers', () => {
  let workspace: Workspace;

  beforeEach(async () => {
    workspace = await makeWorkspace({});
  });

  afterEach(async () => {
    await removeWorkspace(workspace);
  });

  it('appends preflight receipts and reads back the most recent well-formed one', async () => {
    expect(await lastPreflightReceipt(workspace)).toBeNull();
    const result = {
      screens: [{ screen: 'policy-search', url: 'PolicySearch', status: 'ok' as const, fingerprintChanged: false, fingerprintDiff: [], facets: [entry('policy-search:a', 'ok')] }],
      flows: [],
      summary: { ok: 1, stale: 0, missing: 0, unchecked: 0 },
    };
    await appendPreflightReceipt(workspace, result, { at: '2026-10-01T00:00:00.000Z', session: 's1', profile: 'qa' });
    await appendPreflightReceipt(workspace, { ...result, summary: { ...result.summary, ok: 0, stale: 1 } }, { at: '2026-10-02T00:00:00.000Z' });
    await fs.appendFile(preflightLogPath(workspace), '{"not":"a receipt"}\nnot json\n');
    const last = await lastPreflightReceipt(workspace);
    expect(last).toMatchObject({ at: '2026-10-02T00:00:00.000Z', summary: { stale: 1 } });
    const lines = (await fs.readFile(preflightLogPath(workspace), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[0]!)).toMatchObject({ at: '2026-10-01T00:00:00.000Z', session: 's1', profile: 'qa' });
  });

  it('keeps route landmarks through mint, setRoute and query (so goto() can wait for main)', async () => {
    const candidate: Candidate = {
      ref: 'c1', role: 'heading', name: 'Policy Search', namingSource: 'content', affordance: 'none', interactive: false, tag: 'h1', landmark: 'main',
      visible: true, enabled: true, inViewport: true,
    };
    await mintFacet(workspace, {
      screen: 'policy-search', draft: { name: 'heading', displayName: 'Policy Search heading' }, candidate, snapshotId: 'snap-1', provenance: { instrument: 'human' },
      route: { url: '/PolicySearch', landmarks: ['search', 'main', 'main'] },
    });
    expect((await loadScreen(workspace, 'policy-search')).catalog.route).toMatchObject({ url: 'PolicySearch', landmarks: ['main', 'search'] });
    const yaml = await fs.readFile(`${workspace.paths.catalog}/policy-search.yaml`, 'utf8');
    expect(yaml).toMatch(/landmarks:\n\s+- main\n\s+- search/);

    // A later route update without landmarks keeps them while the URL is the same; a new URL starts clean.
    await setRoute(workspace, 'policy-search', { url: 'PolicySearch', fingerprint: 'sha256:abc' });
    expect((await loadScreen(workspace, 'policy-search')).catalog.route?.landmarks).toEqual(['main', 'search']);
    expect((await queryMemory(workspace, { screen: 'policy-search', phrase: 'heading' })).route?.landmarks).toEqual(['main', 'search']);
    await setRoute(workspace, 'policy-search', { url: 'PolicySearch2' });
    expect((await loadScreen(workspace, 'policy-search')).catalog.route?.landmarks).toBeUndefined();
  });

  it('regenerates an existing page object after concurrent mints with every facet in it, and reports a hand-edited one instead of overwriting it', async () => {
    const button = (name: string): Candidate => ({
      ref: `c-${name}`, role: 'button', name, namingSource: 'content', affordance: 'native', interactive: true, tag: 'button', visible: true, enabled: true, inViewport: true,
    });
    const mint = (name: string) =>
      mintFacet(workspace, { screen: 'orders', draft: { name: name.toLowerCase(), displayName: `${name} button`, locator: { strategy: 'role-name', role: 'button', name } }, candidate: button(name), snapshotId: 'snap-1', provenance: { instrument: 'human' } });
    await mint('First');
    const absent = await regeneratePageObject(workspace, 'orders');
    expect(absent.status).toBe('absent');
    const initial = await loadScreen(workspace, 'orders');
    await emitFiles(workspace, { pageObjects: [renderPageObject('orders', null, initial.catalog.facets, null, { layout: layoutOf(workspace) })], flows: [] });

    const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
    const results = await Promise.all(names.map(async (name) => { await mint(name); return regeneratePageObject(workspace, 'orders'); }));
    expect(results.some((r) => r.status === 'regenerated')).toBe(true);
    const text = await fs.readFile(`${workspace.paths.root}/pages/orders.page.ts`, 'utf8');
    for (const name of names) expect(text).toContain(`name: '${name}'`);

    await fs.writeFile(`${workspace.paths.root}/pages/orders.page.ts`, text.replace("name: 'Alpha'", "name: 'Alpha (edited)'"));
    await mint('Golf');
    const skipped = await regeneratePageObject(workspace, 'orders');
    expect(skipped.status).toBe('skipped');
    expect(regenerationNote(skipped)).toMatch(/not regenerated \(conflict: /);
    expect(await fs.readFile(`${workspace.paths.root}/pages/orders.page.ts`, 'utf8')).toContain('Alpha (edited)');
  });
});
