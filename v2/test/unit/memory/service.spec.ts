import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LocatorSpec } from '../../../src/contract/schemas.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import {
  catalogFile,
  enrichFacet,
  evidenceFile,
  facetsByIds,
  findFacet,
  foldEvents,
  listScreens,
  loadScreen,
  mintFacet,
  queryMemory,
  readEvents,
  recordAcceptance,
  recordResolutions,
  recordTestRun,
  saveScreen,
  setRoute,
  type MintInput,
} from '../../../src/memory/index.js';
import { candidate, readText, rejected, removeWorkspace, steppingClock, tempWorkspace, verified } from './helpers.js';

const INPUT_LOCATOR: LocatorSpec = { strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } };
const BUTTON_LOCATOR: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } };

const mintInput = (overrides: Partial<MintInput> = {}): MintInput => ({
  screen: 'policy-search',
  draft: { name: 'policy-number-input', displayName: 'Policy number search field', aliases: ['search field'] },
  candidate: candidate(),
  snapshotId: 'snap-1',
  verified: verified(INPUT_LOCATOR),
  provenance: { instrument: 'app.observe', session: 's-1', model: 'claude', testCase: '10001' },
  ...overrides,
});

const buttonInput = (overrides: Partial<MintInput> = {}): MintInput =>
  mintInput({
    draft: { name: 'search-button', displayName: 'Search button' },
    candidate: candidate({ ref: 'c2', role: 'button', name: 'Search', namingSource: 'content', tag: 'button', placeholder: undefined, id: undefined, idKind: undefined }),
    verified: verified(BUTTON_LOCATOR),
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

const evidenceText = async (screen = 'policy-search'): Promise<string> => (await fs.readFile(evidenceFile(ws, screen), 'utf8').catch(() => ''));

describe('mint', () => {
  it('creates a candidate facet with provenance, a verified first attempt, and an evidence pointer', async () => {
    const { facet, created, warnings } = await mintFacet(ws, mintInput(), options);
    expect(created).toBe(true);
    expect(warnings).toEqual([]);
    expect(facet).toMatchObject({
      id: 'policy-search:policy-number-input',
      screen: 'policy-search',
      kind: 'element',
      displayName: 'Policy number search field',
      aliases: ['search field'],
      role: 'textbox',
      tag: 'input',
      namingSource: 'placeholder',
      affordance: 'native',
      scope: { landmark: 'search', dataBlock: 'SearchBlock' },
      status: 'candidate',
      provenance: { instrument: 'app.observe', session: 's-1', model: 'claude', testCase: '10001', snapshotId: 'snap-1', candidateRef: 'c1', mintedAt: '2026-09-20T14:00:00.000Z' },
    });
    expect(facet.locators).toEqual([{ ...INPUT_LOCATOR, health: '1/1', expression: "page.getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })" }]);

    const { events } = await readEvents(ws, 'policy-search');
    expect(events.map((e) => e.kind)).toEqual(['minted', 'resolved']);
    expect(events[1]).toMatchObject({ source: 'mint', outcome: 'ok', matches: 1 });
    expect(facet.evidence).toBe(`.tesseract/evidence/policy-search.jsonl#${events[0]!.eventId}`);
    expect(events.every((e) => e.at === facet.provenance.mintedAt)).toBe(true); // one operation, one instant

    const yaml = await readText(catalogFile(ws, 'policy-search'));
    expect(yaml).toContain('health: 1/1');
    expect(yaml).not.toContain('expression');
  });

  it('derives a locator from the candidate when none is verified, and says so', async () => {
    const { facet, warnings } = await mintFacet(ws, mintInput({ verified: undefined }), options);
    expect(facet.locators[0]).toMatchObject({ ...INPUT_LOCATOR, health: '0/0' });
    expect(warnings.some((w) => w.includes('not verified'))).toBe(true);
    const { events } = await readEvents(ws, 'policy-search');
    expect(events.map((e) => e.kind)).toEqual(['minted']);
    expect(events[0]).toMatchObject({ kind: 'minted', verified: false });
  });

  it('uses draft.locator first and marks it verified only when the resolver verified the same locator', async () => {
    const placeholder: LocatorSpec = { strategy: 'placeholder', value: 'Search Policy' };
    const a = await mintFacet(ws, mintInput({ draft: { name: 'a', displayName: 'A', locator: placeholder }, verified: verified(placeholder) }), options);
    expect(a.facet.locators[0]).toMatchObject({ strategy: 'placeholder', health: '1/1' });
    const b = await mintFacet(
      ws,
      mintInput({ draft: { name: 'b', displayName: 'B', locator: { strategy: 'label', value: 'Policy' } }, candidate: candidate({ ref: 'c9' }), verified: verified(INPUT_LOCATOR) }),
      options,
    );
    expect(b.facet.locators[0]).toMatchObject({ strategy: 'label', health: '0/0' });
  });

  it('folds an equivalent re-mint into the existing facet (created:false, aliases merged)', async () => {
    await mintFacet(ws, mintInput(), options);
    const again = await mintFacet(ws, mintInput({ draft: { name: 'policy-number-input', displayName: 'Policy number search field', aliases: ['policy number', 'Search Field'] } }), options);
    expect(again.created).toBe(false);
    expect(again.facet.aliases).toEqual(['search field', 'policy number']);
    expect(again.facet.locators).toHaveLength(1);
    expect(again.facet.locators[0]?.health).toBe('2/2');
    const { events } = await readEvents(ws, 'policy-search');
    expect(events.map((e) => e.kind)).toEqual(['minted', 'resolved', 'enriched', 'resolved']);
    expect(events[2]).toMatchObject({ via: 'mint', aliasesAdded: ['policy number'] });
  });

  it('treats the same role, name, and landmark as the same element and adds the new locator', async () => {
    await mintFacet(ws, mintInput({ verified: undefined }), options); // derived role-name, unverified
    const placeholder: LocatorSpec = { strategy: 'placeholder', value: 'Search Policy', scope: { landmark: 'search' } };
    const again = await mintFacet(ws, mintInput({ verified: verified(placeholder) }), options);
    expect(again.created).toBe(false);
    expect(again.facet.locators.map((l) => l.strategy)).toEqual(['role-name', 'placeholder']);
  });

  it('an equivalent re-mint that brings a new locator to a stale facet repairs it', async () => {
    await mintFacet(ws, buttonInput(), options);
    await recordResolutions(ws, Array.from({ length: 3 }, () => ({ facetId: 'policy-search:search-button', outcome: 'not-found' as const, source: 'run' as const })), options);
    const textLocator: LocatorSpec = { strategy: 'text', value: 'Search' };
    const again = await mintFacet(ws, buttonInput({ verified: verified(textLocator) }), options);
    expect(again.created).toBe(false);
    expect(again.facet.status).toBe('candidate');
    expect(again.facet.locators[0]).toMatchObject({ strategy: 'text', health: '1/1' });
    expect((await readEvents(ws, 'policy-search')).events.at(-1)).toMatchObject({ kind: 'status', from: 'stale', to: 'candidate', reason: 'repaired' });
  });

  it('is a conflict to mint a different element under an existing id', async () => {
    await mintFacet(ws, mintInput(), options);
    const error = await rejected(
      mintFacet(ws, mintInput({ candidate: candidate({ ref: 'c7', name: 'Search Claims', placeholder: 'Search Claims' }), verified: verified({ strategy: 'role-name', role: 'textbox', name: 'Search Claims' }) }), options),
    );
    expect(error.family).toBe('conflict');
    expect(error.detail).toEqual({ existingId: 'policy-search:policy-number-input' });
  });

  it('is a conflict to mint a locator another facet owns, with a hint to enrich', async () => {
    await mintFacet(ws, mintInput(), options);
    const error = await rejected(mintFacet(ws, mintInput({ draft: { name: 'search-box', displayName: 'Search box' } }), options));
    expect(error.family).toBe('conflict');
    expect(error.detail).toMatchObject({ existingId: 'policy-search:policy-number-input', hint: 'memory.enrich' });
  });

  it('rejects a bad screen name and a candidate with nothing to locate it by', async () => {
    expect((await rejected(mintFacet(ws, mintInput({ screen: 'Policy Search' }), options))).family).toBe('invalid-input');
    const bare = candidate({ role: 'generic', name: '', placeholder: undefined, id: undefined, idKind: undefined });
    expect((await rejected(mintFacet(ws, mintInput({ candidate: bare, verified: undefined }), options))).family).toBe('invalid-input');
  });

  it('sets the route with the mint, without a leading slash', async () => {
    await mintFacet(ws, mintInput({ route: { url: '/PolicySearch', variant: 'reactive', fingerprint: 'sha256:1' }, routeSummary: { landmarks: ['main', 'search'], interactiveRoles: { textbox: 1 }, dataBlocks: 3 } }), options);
    const loaded = await loadScreen(ws, 'policy-search', options);
    expect(loaded.catalog.route).toEqual({ url: 'PolicySearch', variant: 'reactive', fingerprint: 'sha256:1', summary: { landmarks: ['main', 'search'], interactiveRoles: { textbox: 1 }, dataBlocks: 3 } });
    const { events } = await readEvents(ws, 'policy-search');
    expect(events.filter((e) => e.kind === 'route')).toHaveLength(1);
  });
});

describe('enrich', () => {
  it('is not-found for an unknown facet and a conflict for a retired one', async () => {
    expect((await rejected(enrichFacet(ws, { facetId: 'policy-search:nope', aliases: ['x'], evidence: { snapshotId: 's', ref: 'c1' } }, options))).family).toBe('not-found');
    await mintFacet(ws, mintInput(), options);
    const retired = await enrichFacet(ws, { facetId: 'policy-search:policy-number-input', retire: true, evidence: { snapshotId: 's', ref: 'c1' } }, options);
    expect(retired.facet.status).toBe('retired');
    expect(retired.changes).toContain('status: candidate → retired (retired)');
    expect((await rejected(enrichFacet(ws, { facetId: 'policy-search:policy-number-input', aliases: ['x'], evidence: { snapshotId: 's', ref: 'c1' } }, options))).family).toBe('conflict');
  });

  it('adds aliases and renames, keeping the old name findable as an alias', async () => {
    await mintFacet(ws, mintInput(), options);
    const { facet, changes } = await enrichFacet(
      ws,
      { facetId: 'policy-search:policy-number-input', displayName: 'Policy number', aliases: ['policy no', 'search field'], evidence: { snapshotId: 'snap-2', ref: 'c1' } },
      options,
    );
    expect(facet.displayName).toBe('Policy number');
    expect(facet.aliases).toEqual(['search field', 'policy number search field', 'policy no']);
    expect(changes).toEqual(['displayName: "Policy number search field" → "Policy number"', 'aliases added: policy number search field, policy no']);
    const hits = await queryMemory(ws, { screen: 'policy-search', phrase: 'policy number search field' }, options);
    expect(hits.facets[0]?.id).toBe('policy-search:policy-number-input');
  });

  it('puts a repaired locator first when the old one is failing', async () => {
    await mintFacet(ws, buttonInput(), options);
    await recordResolutions(ws, [{ facetId: 'policy-search:search-button', outcome: 'not-found', source: 'run' }], options);
    const repaired: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Find', scope: { landmark: 'search' } };
    const { facet, changes } = await enrichFacet(ws, { facetId: 'policy-search:search-button', locator: repaired, verified: verified(repaired), evidence: { snapshotId: 'snap-2', ref: 'c4' } }, options);
    expect(facet.locators.map((l) => [l.name, l.health])).toEqual([['Find', '1/1'], ['Search', '1/2']]);
    expect(changes[0]).toMatch(/^locator added first \(verified\): page\.getByRole\('search'\)\.getByRole\('button', \{ name: 'Find'/);
  });

  it('orders by health then ladder rank, so a css fallback stays below a healthy role-name', async () => {
    await mintFacet(ws, buttonInput(), options);
    const css: LocatorSpec = { strategy: 'css', value: '#b3-Search' };
    const { facet } = await enrichFacet(ws, { facetId: 'policy-search:search-button', locator: css, evidence: { snapshotId: 'snap-2', ref: 'c2' } }, options);
    expect(facet.locators.map((l) => l.strategy)).toEqual(['role-name', 'css']);
    // An equal-rank verified locator inserted first wins the tie.
    const twin: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Search' };
    const after = await enrichFacet(ws, { facetId: 'policy-search:search-button', locator: twin, verified: verified(twin), evidence: { snapshotId: 'snap-3', ref: 'c2' } }, options);
    expect(after.facet.locators.map((l) => [l.strategy, l.scope?.landmark ?? null])).toEqual([['role-name', null], ['role-name', 'search'], ['css', null]]);
  });

  it('a new locator on a stale facet makes it a candidate again (repaired)', async () => {
    await mintFacet(ws, buttonInput(), options);
    const failures = Array.from({ length: 3 }, () => ({ facetId: 'policy-search:search-button', outcome: 'not-found' as const, source: 'run' as const }));
    const result = await recordResolutions(ws, failures, options);
    expect(result.changes).toEqual([{ facetId: 'policy-search:search-button', from: 'candidate', to: 'stale', reason: 'health-floor' }]);
    const repaired: LocatorSpec = { strategy: 'text', value: 'Search' };
    const { facet, changes } = await enrichFacet(ws, { facetId: 'policy-search:search-button', locator: repaired, verified: verified(repaired), evidence: { snapshotId: 'snap-2', ref: 'c2' } }, options);
    expect(facet.status).toBe('candidate');
    expect(changes).toContain('status: stale → candidate (repaired)');
    expect(facet.locators[0]?.strategy).toBe('text');
  });

  it('refuses a locator another facet owns', async () => {
    await mintFacet(ws, mintInput(), options);
    await mintFacet(ws, buttonInput(), options);
    const error = await rejected(enrichFacet(ws, { facetId: 'policy-search:search-button', locator: INPUT_LOCATOR, evidence: { snapshotId: 's', ref: 'c1' } }, options));
    expect(error.family).toBe('conflict');
    expect(error.detail).toMatchObject({ existingId: 'policy-search:policy-number-input', hint: 'memory.enrich' });
  });
});

describe('evidence from use: resolutions, runs, acceptance', () => {
  it('stales a facet whose locator health falls below the floor, and flags drift on a trusted one', async () => {
    await mintFacet(ws, buttonInput(), options);
    await recordAcceptance(ws, { testCaseId: '10001', facetIds: ['policy-search:search-button'], reviewer: 'qa', decision: 'accept' }, options);
    const result = await recordResolutions(
      ws,
      [
        { facetId: 'policy-search:search-button', outcome: 'not-found', source: 'run', runId: 'r1' },
        { facetId: 'policy-search:search-button', outcome: 'ambiguous', matches: 2, source: 'act' },
        { facetId: 'policy-search:search-button', outcome: 'not-found', source: 'run', runId: 'r2' },
        { facetId: 'policy-search:unknown', outcome: 'ok', source: 'act' },
        { facetId: 'garbage', outcome: 'ok', source: 'act' },
      ],
      options,
    );
    expect(result.changes).toEqual([{ facetId: 'policy-search:search-button', from: 'trusted', to: 'stale', reason: 'health-floor' }]);
    expect(result.drift).toHaveLength(3);
    expect(result.drift[0]).toMatchObject({ facetId: 'policy-search:search-button', outcome: 'not-found' });
    expect(result.unknown.sort()).toEqual(['garbage', 'policy-search:unknown']);
    expect((await findFacet(ws, 'policy-search:search-button', options))?.locators[0]?.health).toBe('1/4');
  });

  it('promotes a candidate after three clean passing runs', async () => {
    await mintFacet(ws, mintInput(), options);
    await mintFacet(ws, buttonInput(), options);
    const ids = ['policy-search:policy-number-input', 'policy-search:search-button'];
    const first = await recordTestRun(ws, { runId: 'r1', testCaseId: '10001', facetIds: ids, outcome: 'passed' }, options);
    expect(first.promoted).toEqual([]);
    await recordTestRun(ws, { runId: 'r2', testCaseId: '10001', facetIds: ids, outcome: 'passed' }, options);
    const third = await recordTestRun(ws, { runId: 'r3', testCaseId: '10001', facetIds: ids, outcome: 'passed' }, options);
    expect(third.promoted.sort()).toEqual(ids);
    const facet = await findFacet(ws, 'policy-search:search-button', options);
    expect(facet?.status).toBe('trusted');
    expect(facet?.locators[0]?.health).toBe('4/4');
  });

  it('a locator failure attributed to a facet blocks its promotion; an assertion failure does not', async () => {
    await mintFacet(ws, mintInput(), options);
    await mintFacet(ws, buttonInput(), options);
    const ids = ['policy-search:policy-number-input', 'policy-search:search-button'];
    const failed = await recordTestRun(ws, { runId: 'r0', testCaseId: '1', facetIds: ids, outcome: 'failed', failedFacet: 'policy-search:search-button', failureFamily: 'not-found' }, options);
    expect(failed.drift).toEqual([]); // candidates do not drift
    await recordTestRun(ws, { runId: 'r1', testCaseId: '1', facetIds: ids, outcome: 'failed', failedFacet: 'policy-search:policy-number-input', failureFamily: 'assertion-like' }, options);
    for (const runId of ['r2', 'r3', 'r4']) await recordTestRun(ws, { runId, testCaseId: '1', facetIds: ids, outcome: 'passed' }, options);
    expect((await findFacet(ws, 'policy-search:search-button', options))?.status).toBe('candidate');
    expect((await findFacet(ws, 'policy-search:policy-number-input', options))?.status).toBe('trusted');
  });

  it('acceptance promotes candidates; rejection records nothing', async () => {
    await mintFacet(ws, mintInput(), options);
    const before = await evidenceText();
    expect(await recordAcceptance(ws, { testCaseId: '10001', facetIds: ['policy-search:policy-number-input'], reviewer: 'qa', decision: 'reject' }, options)).toEqual({ promoted: [], unknown: [] });
    expect(await evidenceText()).toBe(before);
    const accepted = await recordAcceptance(
      ws,
      { testCaseId: '10001', facetIds: ['policy-search:policy-number-input', 'claims:nope'], reviewer: 'qa', decision: 'accept-with-edit' },
      options,
    );
    expect(accepted).toEqual({ promoted: ['policy-search:policy-number-input'], unknown: ['claims:nope'] });
  });
});

describe('the catalog file and the log', () => {
  it('load then save is byte-identical, and a read does not rewrite the file', async () => {
    await mintFacet(ws, mintInput({ route: { url: 'PolicySearch', variant: 'reactive' } }), options);
    await mintFacet(ws, buttonInput(), options);
    await recordResolutions(ws, [{ facetId: 'policy-search:search-button', outcome: 'not-found', source: 'act' }], options);
    const file = catalogFile(ws, 'policy-search');
    const before = await readText(file);
    const stat = await fs.stat(file);
    const loaded = await loadScreen(ws, 'policy-search', options);
    await queryMemory(ws, { screen: 'policy-search', phrase: 'search' }, options);
    expect((await fs.stat(file)).mtimeMs).toBe(stat.mtimeMs);
    await saveScreen(ws, loaded.catalog, options);
    expect(await readText(file)).toBe(before);
  });

  it('records a human status edit in the YAML as a status event, once', async () => {
    await mintFacet(ws, mintInput(), options);
    const file = catalogFile(ws, 'policy-search');
    await fs.writeFile(file, (await readText(file)).replace('status: candidate', 'status: trusted'));
    const loaded = await loadScreen(ws, 'policy-search', options);
    expect(loaded.catalog.facets[0]?.status).toBe('trusted');
    const { events } = await readEvents(ws, 'policy-search');
    expect(events.at(-1)).toMatchObject({ kind: 'status', facetId: 'policy-search:policy-number-input', from: 'candidate', to: 'trusted', reason: 'human', by: 'human' });
    await loadScreen(ws, 'policy-search', options);
    expect((await readEvents(ws, 'policy-search')).events).toHaveLength(events.length);
  });

  it('a human promotion sticks until new evidence says otherwise', async () => {
    await mintFacet(ws, buttonInput(), options);
    await recordResolutions(ws, Array.from({ length: 3 }, () => ({ facetId: 'policy-search:search-button', outcome: 'not-found' as const, source: 'run' as const })), options);
    expect((await findFacet(ws, 'policy-search:search-button', options))?.status).toBe('stale');
    const file = catalogFile(ws, 'policy-search');
    await fs.writeFile(file, (await readText(file)).replace('status: stale', 'status: trusted'));
    const after = await recordResolutions(ws, [{ facetId: 'policy-search:search-button', outcome: 'ok', source: 'act' }], options);
    expect(after.changes).toEqual([]);
    expect((await findFacet(ws, 'policy-search:search-button', options))?.status).toBe('trusted');
  });

  it('never rewrites the evidence log: each operation only appends', async () => {
    const snapshots: string[] = [await evidenceText()];
    const steps: Array<() => Promise<unknown>> = [
      () => mintFacet(ws, mintInput(), options),
      () => mintFacet(ws, buttonInput(), options),
      () => enrichFacet(ws, { facetId: 'policy-search:search-button', aliases: ['find'], evidence: { snapshotId: 's', ref: 'c2' } }, options),
      () => recordResolutions(ws, [{ facetId: 'policy-search:search-button', outcome: 'ok', source: 'act' }], options),
      () => recordTestRun(ws, { runId: 'r', testCaseId: '1', facetIds: ['policy-search:search-button'], outcome: 'passed' }, options),
      () => recordAcceptance(ws, { testCaseId: '1', facetIds: ['policy-search:search-button'], reviewer: 'qa', decision: 'accept' }, options),
      () => setRoute(ws, 'policy-search', { url: 'PolicySearch' }, undefined, options),
      () => loadScreen(ws, 'policy-search', options),
    ];
    for (const step of steps) {
      await step();
      const now = await evidenceText();
      expect(now.startsWith(snapshots.at(-1)!)).toBe(true);
      snapshots.push(now);
    }
    expect(snapshots.at(-1)!.length).toBeGreaterThan(snapshots[1]!.length);
  });

  it('replaying the log gives the stats the catalog shows', async () => {
    await mintFacet(ws, buttonInput(), options);
    await recordResolutions(ws, [{ facetId: 'policy-search:search-button', outcome: 'not-found', source: 'act' }, { facetId: 'policy-search:search-button', outcome: 'ok', source: 'act' }], options);
    const { events } = await readEvents(ws, 'policy-search');
    expect(foldEvents(events)).toEqual(foldEvents(events));
    const loaded = await loadScreen(ws, 'policy-search', options);
    expect(loaded.stats).toEqual(foldEvents(events));
    expect(loaded.catalog.facets[0]?.locators[0]?.health).toBe('2/3');
  });

  it('skips and counts unreadable evidence lines', async () => {
    await mintFacet(ws, mintInput(), options);
    await fs.appendFile(evidenceFile(ws, 'policy-search'), 'not json\n{"v":1,"kind":"from-the-future"}\n');
    const read = await readEvents(ws, 'policy-search');
    expect(read.skipped).toBe(2);
    expect((await loadScreen(ws, 'policy-search', options)).warnings.some((w) => w.includes('2 unreadable'))).toBe(true);
  });

  it('serializes concurrent writers: 20 parallel mints produce one valid catalog with all facets', async () => {
    const mints = Array.from({ length: 20 }, (_, i) =>
      mintFacet(
        ws,
        mintInput({
          draft: { name: `field-${i}`, displayName: `Field ${i}` },
          candidate: candidate({ ref: `c${i}`, name: `Field ${i}`, placeholder: undefined }),
          verified: verified({ strategy: 'role-name', role: 'textbox', name: `Field ${i}` }),
        }),
      ),
    );
    const resolutions = recordResolutions(ws, [{ facetId: 'policy-search:field-0', outcome: 'ok', source: 'act' }]);
    const results = await Promise.all(mints);
    await resolutions;
    expect(results.every((r) => r.created)).toBe(true);
    const loaded = await loadScreen(ws, 'policy-search');
    expect(loaded.catalog.facets).toHaveLength(20);
    const { events, skipped } = await readEvents(ws, 'policy-search');
    expect(skipped).toBe(0);
    expect(events.filter((e) => e.kind === 'minted')).toHaveLength(20);
    expect(events.filter((e) => e.kind === 'resolved' && e.source === 'mint')).toHaveLength(20);
    const files = await fs.readdir(path.dirname(catalogFile(ws, 'policy-search')));
    expect(files).toEqual(['policy-search.yaml']); // no temp files left behind
  });
});

describe('query, find, route', () => {
  beforeEach(async () => {
    await mintFacet(ws, mintInput({ route: { url: 'PolicySearch', variant: 'reactive' } }), options);
    await mintFacet(ws, buttonInput(), options);
    await mintFacet(
      ws,
      mintInput({
        screen: 'claims',
        draft: { name: 'claim-number-input', displayName: 'Claim number field', aliases: ['claim number'] },
        candidate: candidate({ ref: 'c1', name: 'Claim Number', placeholder: 'Claim Number', landmark: 'main' }),
        verified: verified({ strategy: 'role-name', role: 'textbox', name: 'Claim Number' }),
        route: { url: 'Claims' },
      }),
      options,
    );
  });

  it('returns scored facets with the screen route; empty and unknown for an unseen screen', async () => {
    const result = await queryMemory(ws, { screen: 'policy-search', phrase: 'Click Search button' }, options);
    expect(result.screenKnown).toBe(true);
    expect(result.route).toEqual({ url: 'PolicySearch', variant: 'reactive' });
    expect(result.facets[0]).toMatchObject({ id: 'policy-search:search-button', score: 0.85, phraseScore: 1, locatorHealth: 1 });
    expect(result.facets[0]?.locators[0]?.expression).toContain("getByRole('button'");
    expect(await queryMemory(ws, { screen: 'never-seen', phrase: 'anything' }, options)).toEqual({ facets: [], screenKnown: false, warnings: [] });
  });

  it('searches every screen when the screen is omitted and returns the top result’s route', async () => {
    const result = await queryMemory(ws, { phrase: 'Enter claim number' }, options);
    expect(result.facets[0]?.id).toBe('claims:claim-number-input');
    expect(result.route).toEqual({ url: 'Claims' });
    expect(await listScreens(ws)).toEqual(['claims', 'policy-search']);
  });

  it('skips a malformed screen in an all-screens query but fails a named one', async () => {
    await fs.writeFile(catalogFile(ws, 'claims'), 'screen: claims\nfacets: [oops\n');
    const all = await queryMemory(ws, { phrase: 'search button' }, options);
    expect(all.facets[0]?.id).toBe('policy-search:search-button');
    expect(all.warnings.some((w) => w.startsWith('screen claims skipped'))).toBe(true);
    expect((await rejected(queryMemory(ws, { screen: 'claims', phrase: 'x' }, options))).family).toBe('malformed-response');
  });

  it('finds facets by id, in order, with the missing ones listed', async () => {
    expect((await findFacet(ws, 'policy-search:search-button', options))?.displayName).toBe('Search button');
    expect(await findFacet(ws, 'policy-search:nope', options)).toBeNull();
    expect(await findFacet(ws, 'not an id', options)).toBeNull();
    const { facets, missing } = await facetsByIds(ws, ['claims:claim-number-input', 'policy-search:search-button', 'policy-search:nope', 'bad', 'claims:claim-number-input'], options);
    expect(facets.map((f) => f.id)).toEqual(['claims:claim-number-input', 'policy-search:search-button']);
    expect(missing).toEqual(['bad', 'policy-search:nope']);
  });

  it('setRoute keeps unchanged fields for the same URL, starts clean for a new one, and records changes only', async () => {
    const summary = { landmarks: ['main'], interactiveRoles: { button: 1 }, dataBlocks: 2 };
    await setRoute(ws, 'policy-search', { url: '/PolicySearch', fingerprint: 'sha256:2' }, summary, options);
    expect((await loadScreen(ws, 'policy-search', options)).catalog.route).toEqual({ url: 'PolicySearch', variant: 'reactive', fingerprint: 'sha256:2', summary });
    const count = (await readEvents(ws, 'policy-search')).events.length;
    await setRoute(ws, 'policy-search', { url: 'PolicySearch' }, undefined, options);
    expect((await readEvents(ws, 'policy-search')).events).toHaveLength(count);
    const moved = await setRoute(ws, 'policy-search', { url: 'https://other.example/Policies' }, undefined, options);
    expect(moved).toEqual({ url: 'https://other.example/Policies' });
  });
});
