/**
 * Review findings on the memory service: a repair locator added by enrich
 * becomes the facet's best locator (and the regenerated page object uses it),
 * reads never write, verb-named elements are found by memory.query, and one
 * test.run counts as one run toward promotion however many receipts it has.
 */
import { promises as fs } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocatorSpec } from '../../../src/contract/schemas.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { emitFiles, layoutOf, pageObjectPath, renderPageObject } from '../../../src/emit/index.js';
import { renderLocator } from '../../../src/locator/locator.js';
import {
  catalogFile,
  enrichFacet,
  evidenceFile,
  facetsByIds,
  findFacet,
  foldEvents,
  loadScreen,
  mintFacet,
  queryFacets,
  queryMemory,
  readEvents,
  recordResolutions,
  recordTestRun,
  recordTestRuns,
  type MintInput,
} from '../../../src/memory/index.js';
import { resolveInside } from '../../../src/workspace/workspace.js';
import { candidate, counterFactory, facet, readText, removeWorkspace, steppingClock, tempWorkspace, verified } from './helpers.js';

const SCREEN = 'policy-search';
const SEARCH_INPUT: LocatorSpec = { strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } };
const SEARCH_BUTTON: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } };

const inputMint = (overrides: Partial<MintInput> = {}): MintInput => ({
  screen: SCREEN,
  draft: { name: 'search-policy', displayName: 'Search policy field' },
  candidate: candidate(),
  snapshotId: 'snap-1',
  verified: verified(SEARCH_INPUT),
  provenance: { instrument: 'app.observe' },
  ...overrides,
});

const buttonMint = (overrides: Partial<MintInput> = {}): MintInput =>
  inputMint({
    draft: { name: 'search-button', displayName: 'Search button' },
    candidate: candidate({ ref: 'c2', role: 'button', name: 'Search', namingSource: 'content', tag: 'button', placeholder: undefined, id: undefined, idKind: undefined }),
    verified: verified(SEARCH_BUTTON),
    ...overrides,
  });

let ws: Workspace;
let options: { now: () => Date };

beforeEach(async () => {
  ws = await tempWorkspace();
  options = { now: steppingClock() };
});

afterEach(async () => {
  await removeWorkspace(ws);
});

const evidenceText = async (): Promise<string> => fs.readFile(evidenceFile(ws, SCREEN), 'utf8').catch(() => '');

/** Render pages/<screen>.page.ts from the catalog through the emit library and write it; returns the file text. */
const regenerate = async (): Promise<string> => {
  const loaded = await loadScreen(ws, SCREEN, options);
  const rendered = renderPageObject(SCREEN, loaded.catalog.route ?? null, loaded.catalog.facets, null, { layout: layoutOf(ws) });
  await emitFiles(ws, { pageObjects: [rendered], flows: [] });
  return readText(resolveInside(ws, pageObjectPath(SCREEN, layoutOf(ws))));
};

describe('findings 0/11: a locator added by enrich becomes the best locator', () => {
  it('a lower-ladder repair locator goes first even while the drifted role-name is still above the floor (3/4)', async () => {
    await mintFacet(ws, inputMint(), options); // 1/1
    await recordResolutions(ws, [
      { facetId: `${SCREEN}:search-policy`, outcome: 'ok', source: 'run' },
      { facetId: `${SCREEN}:search-policy`, outcome: 'ok', source: 'run' },
      { facetId: `${SCREEN}:search-policy`, outcome: 'not-found', source: 'run' },
    ], options); // 3/4: drifted, still healthy by rate
    const before = await regenerate();
    expect(before).toContain(`return ${renderLocator(SEARCH_INPUT, { root: 'this.page' })};`);

    const testId: LocatorSpec = { strategy: 'test-id', value: 'SearchInput', attribute: 'os-test-id' };
    const { facet: enriched, changes } = await enrichFacet(ws, { facetId: `${SCREEN}:search-policy`, locator: testId, evidence: { snapshotId: 'snap-2', ref: 'c1' } }, options);
    expect(enriched.locators.map((l) => [l.strategy, l.health])).toEqual([['test-id', '0/0'], ['role-name', '3/4']]);
    expect(changes).toContain(`locator added first (unverified): ${renderLocator(testId)}`);

    const after = await regenerate();
    expect(after).toContain(`return ${renderLocator(testId, { root: 'this.page' })};`);
    expect(after).not.toContain(`return ${renderLocator(SEARCH_INPUT, { root: 'this.page' })};`);
    // Stored that way too: a fresh read agrees, and the run evidence goes to the new locator.
    expect((await findFacet(ws, `${SCREEN}:search-policy`, options))?.locators[0]?.strategy).toBe('test-id');
    await recordTestRun(ws, { runId: 'run-a', testCaseId: '1', facetIds: [`${SCREEN}:search-policy`], outcome: 'passed' }, options);
    expect((await findFacet(ws, `${SCREEN}:search-policy`, options))?.locators.map((l) => [l.strategy, l.health])).toEqual([['test-id', '1/1'], ['role-name', '3/4']]);
  });

  it('a verified css repair goes first over an ambiguous role-name at 4/5, and the message says what is stored', async () => {
    await mintFacet(ws, buttonMint(), options); // 1/1
    await recordResolutions(ws, Array.from({ length: 3 }, () => ({ facetId: `${SCREEN}:search-button`, outcome: 'ok' as const, source: 'run' as const })), options);
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-button`, outcome: 'ambiguous', source: 'run' }], options); // 4/5
    const css: LocatorSpec = { strategy: 'css', value: '#SearchBtn' };
    const { facet: repaired, changes } = await enrichFacet(ws, { facetId: `${SCREEN}:search-button`, locator: css, verified: verified(css), evidence: { snapshotId: 'snap-2', ref: 'c2' } }, options);
    expect(repaired.locators.map((l) => [l.strategy, l.health])).toEqual([['css', '1/1'], ['role-name', '4/5']]);
    expect(changes[0]).toBe(`locator added first (verified): ${renderLocator(css)}`);
    expect(await regenerate()).toContain(`return ${renderLocator(css, { root: 'this.page' })};`);
  });

  it('once the new locator fails, ordering by health takes over again', async () => {
    await mintFacet(ws, buttonMint(), options);
    const css: LocatorSpec = { strategy: 'css', value: '#SearchBtn' };
    await enrichFacet(ws, { facetId: `${SCREEN}:search-button`, locator: css, evidence: { snapshotId: 'snap-2', ref: 'c2' } }, options);
    expect((await findFacet(ws, `${SCREEN}:search-button`, options))?.locators[0]?.strategy).toBe('css');
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-button`, outcome: 'not-found', source: 'run' }], options);
    expect((await findFacet(ws, `${SCREEN}:search-button`, options))?.locators.map((l) => [l.strategy, l.health])).toEqual([['role-name', '1/1'], ['css', '0/1']]);
  });

  it('naming a fallback the facet already has moves it first (a repair onto a known locator)', async () => {
    await mintFacet(ws, buttonMint(), options);
    const css: LocatorSpec = { strategy: 'css', value: '#SearchBtn' };
    await enrichFacet(ws, { facetId: `${SCREEN}:search-button`, locator: css, evidence: { snapshotId: 'snap-2', ref: 'c2' } }, options);
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-button`, locator: css, outcome: 'not-visible', source: 'act' }], options);
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-button`, outcome: 'ambiguous', source: 'run' }], options);
    expect((await findFacet(ws, `${SCREEN}:search-button`, options))?.locators.map((l) => [l.strategy, l.health])).toEqual([['role-name', '1/2'], ['css', '0/1']]);
    const { facet: repaired, changes } = await enrichFacet(ws, { facetId: `${SCREEN}:search-button`, locator: css, verified: verified(css), evidence: { snapshotId: 'snap-3', ref: 'c2' } }, options);
    expect(repaired.locators.map((l) => [l.strategy, l.health])).toEqual([['css', '1/2'], ['role-name', '1/2']]);
    expect(changes).toEqual([`locator moved first (verified): ${renderLocator(css)}`]);
    expect(await regenerate()).toContain(`return ${renderLocator(css, { root: 'this.page' })};`);
  });

  it('a re-mint does not displace a healthy locator (ordering otherwise prefers health, then the ladder)', async () => {
    await mintFacet(ws, buttonMint({ verified: undefined }), options); // derived role-name, unverified
    const text: LocatorSpec = { strategy: 'text', value: 'Search' };
    const again = await mintFacet(ws, buttonMint({ verified: verified(text) }), options);
    expect(again.facet.locators.map((l) => l.strategy)).toEqual(['role-name', 'text']);
  });
});

describe('finding 3: reads never write', () => {
  it('query, load, find and facetsByIds show a human status edit without appending evidence or rewriting the YAML', async () => {
    await mintFacet(ws, inputMint(), options);
    const file = catalogFile(ws, SCREEN);
    await fs.writeFile(file, (await readText(file)).replace('status: candidate', 'status: trusted'));
    const yaml = await readText(file);
    const log = await evidenceText();

    const query = await queryMemory(ws, { screen: SCREEN, phrase: 'search policy field' }, options);
    expect(query.facets[0]).toMatchObject({ id: `${SCREEN}:search-policy`, status: 'trusted' });
    expect((await loadScreen(ws, SCREEN, options)).catalog.facets[0]?.status).toBe('trusted');
    expect((await findFacet(ws, `${SCREEN}:search-policy`, options))?.status).toBe('trusted');
    expect((await facetsByIds(ws, [`${SCREEN}:search-policy`], options)).facets[0]?.status).toBe('trusted');
    expect(await evidenceText()).toBe(log);
    expect(await readText(file)).toBe(yaml);

    // The next write records the human edit, once.
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-policy`, outcome: 'ok', source: 'act' }], options);
    const { events } = await readEvents(ws, SCREEN);
    expect(events.filter((e) => e.kind === 'status')).toEqual([
      expect.objectContaining({ kind: 'status', from: 'candidate', to: 'trusted', reason: 'human', by: 'human' }),
    ]);
    await recordResolutions(ws, [{ facetId: `${SCREEN}:search-policy`, outcome: 'ok', source: 'act' }], options);
    expect((await readEvents(ws, SCREEN)).events.filter((e) => e.kind === 'status')).toHaveLength(1);
  });
});

describe('finding 12: an element named with an action verb is still found', () => {
  const buttons = ['submit', 'cancel', 'clear'].map((name) =>
    facet({
      id: `form:${name}-button`,
      displayName: name[0]!.toUpperCase() + name.slice(1),
      kind: 'element',
      role: 'button',
      status: 'trusted',
      locators: [{ strategy: 'role-name', role: 'button', name: name[0]!.toUpperCase() + name.slice(1) }],
    }),
  );
  const field = facet({ id: 'form:policy-number', displayName: 'Policy number', role: 'textbox', status: 'trusted', locators: [{ strategy: 'label', value: 'Policy number' }] });
  const all = [...buttons, field];
  const top = (phrase: string): string | undefined => queryFacets({ phrase }, all, () => 1)[0]?.id;

  it.each([
    ['Click Submit', 'form:submit-button'],
    ['Press Submit', 'form:submit-button'],
    ['Click Clear', 'form:clear-button'],
    ['Click the Cancel button', 'form:cancel-button'],
    ['Submit', 'form:submit-button'],
    ['Enter the policy number', 'form:policy-number'],
  ])('%s → %s', (phrase, id) => {
    expect(top(phrase)).toBe(id);
  });

  it('"Click Submit button" ranks Submit alone at the top', () => {
    const results = queryFacets({ phrase: 'Click Submit button' }, all, () => 1);
    expect(results[0]?.id).toBe('form:submit-button');
    expect(results.filter((r) => r.score >= results[0]!.score).map((r) => r.id)).toEqual(['form:submit-button']);
  });
});

describe('finding 18: one test.run is one run toward promotion', () => {
  it('three passing receipts of one run (data rows) count as one pass', async () => {
    await mintFacet(ws, buttonMint(), options);
    const row = { runId: 'run-1', testCaseId: '10001', facetIds: [`${SCREEN}:search-button`], outcome: 'passed' as const };
    for (let i = 0; i < 3; i += 1) expect((await recordTestRun(ws, row, options)).promoted).toEqual([]);
    expect((await loadScreen(ws, SCREEN, options)).stats[`${SCREEN}:search-button`]?.passesSinceChange).toBe(1);
    const batched = await recordTestRuns(ws, [row, row, row].map((r) => ({ ...r, runId: 'run-2' })), options);
    expect(batched.promoted).toEqual([]);
    expect((await recordTestRuns(ws, [{ ...row, runId: 'run-3' }], options)).promoted).toEqual([`${SCREEN}:search-button`]);
  });

  it('a run passes a facet only when every receipt of the run that uses it passed', async () => {
    await mintFacet(ws, buttonMint(), options);
    const id = `${SCREEN}:search-button`;
    await recordTestRun(ws, { runId: 'run-1', testCaseId: '1', facetIds: [id], outcome: 'passed' }, options);
    await recordTestRun(ws, { runId: 'run-2', testCaseId: '1', facetIds: [id], outcome: 'passed' }, options);
    // Run 3: row 1 passes, row 2 fails on an assertion (not the facet's fault) — still not a passing run.
    const mixed = await recordTestRuns(ws, [
      { runId: 'run-3', testCaseId: '1', facetIds: [id], outcome: 'passed' },
      { runId: 'run-3', testCaseId: '1', facetIds: [id], outcome: 'failed', failureFamily: 'assertion-like' },
    ], options);
    expect(mixed.promoted).toEqual([]);
    const stats = (await loadScreen(ws, SCREEN, options)).stats[id]!;
    expect([stats.runs, stats.passes, stats.passesSinceChange, stats.failuresSinceChange]).toEqual([3, 2, 2, 0]);
  });

  it('the fold counts at most one pass and one failure per facet per run', () => {
    const makeEvent = counterFactory();
    const id = `${SCREEN}:x`;
    const events = [
      makeEvent({ kind: 'minted', facetId: id, facetKind: 'element', displayName: 'X', provenance: { mintedAt: '2026-09-20T14:00:00.000Z', instrument: 'app.observe' }, locatorKeys: [], locators: [], verified: false }),
      makeEvent({ kind: 'test-run', facetIds: [id], testCaseId: '1', runId: 'r1', outcome: 'passed' }),
      makeEvent({ kind: 'test-run', facetIds: [id], testCaseId: '1', runId: 'r1', outcome: 'passed' }),
      makeEvent({ kind: 'test-run', facetIds: [id], testCaseId: '1', runId: 'r2', outcome: 'failed', failedFacet: id, failureFamily: 'not-found' }),
      makeEvent({ kind: 'test-run', facetIds: [id], testCaseId: '1', runId: 'r2', outcome: 'failed', failedFacet: id, failureFamily: 'not-found' }),
    ];
    const stats = foldEvents(events)[id]!;
    expect([stats.runs, stats.passes, stats.passesSinceChange, stats.failuresSinceChange]).toEqual([2, 1, 1, 1]);
  });
});
