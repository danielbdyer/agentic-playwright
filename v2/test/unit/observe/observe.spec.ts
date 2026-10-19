import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { isToolError } from '../../../src/core/errors.js';
import { CandidateSchema, SnapshotDeltaSchema, SnapshotSchema, type Candidate } from '../../../src/contract/schemas.js';
import { audit, capCandidates, diffSnapshots, observePage, pageVariant, parseScope, snapshotFromRecord, type NodeCategory } from '../../../src/observe/observe.js';
import { POLICY_SEARCH, html, launch, startServer, type TestServer } from './helpers.js';

const RAW_PII = ['jane.doe@example.com', '555-123-4567', 'john@x.com', 'ann@example.org', 'secret'];

let browser: Browser;
let server: TestServer;
let page: Page;

beforeAll(async () => {
  browser = await launch();
  server = await startServer({ '/PolicySearch': html(POLICY_SEARCH()) });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${server.url}/PolicySearch?policy=POL-001&email=jane.doe@example.com#tab=1`);
});

afterAll(async () => {
  await browser.close();
  await server.close();
});

describe('observePage: snapshot shape', () => {
  it('produces a contract Snapshot whose candidates match CandidateSchema exactly', async () => {
    const { snapshot, record } = await observePage(page, { pageId: 'page-1', pii: 'standard', maxCandidates: 500 });
    expect(SnapshotSchema.parse(snapshot)).toEqual(snapshot);
    record.candidates.forEach((candidate) => expect(CandidateSchema.strict().parse(candidate)).toEqual(candidate));
    expect(snapshot.variant).toBe('reactive');
    expect((await pageVariant(page)).variant).toBe('reactive');
    expect(snapshot.scope).toBe('page');
    expect(snapshot.fingerprint.runtimeGlobal).toBe('OutSystems');
    expect(snapshot.fingerprint.path).toBe('/PolicySearch');
    expect(snapshot.fingerprint.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.totalCandidates).toBe(record.candidates.length);
    expect(snapshot.truncated).toBe(false);
    const filter = snapshot.candidates.find((c) => c.name === 'Filter');
    expect(filter).toMatchObject({ role: 'generic', namingSource: 'content', affordance: 'handler-owner', dataBlock: 'SearchBlock', landmark: 'search' });
    expect(record.alerts).toEqual(['3 policies found for <email>']);
    expect(record.categories[filter?.ref ?? '']).toBe('control');
  });

  it('agrees with the browser on names of visible role-bearing controls', async () => {
    const { record } = await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: 500 });
    expect(record.nameAgreement.compared).toBeGreaterThan(15);
    expect(record.nameAgreement.disagreements).toEqual([]);
    expect(record.nameAgreement.agreed).toBe(record.nameAgreement.compared);
  });
});

describe('observePage: PII gate', () => {
  it('redacts names, row text, ARIA text, title and URL in standard mode', async () => {
    const { snapshot, record } = await observePage(page, { pageId: 'page-1', pii: 'standard', maxCandidates: 500 });
    const serialized = JSON.stringify({ snapshot, record });
    RAW_PII.forEach((raw) => expect(serialized).not.toContain(raw));
    expect(snapshot.title).toBe('Policy Search - <email>');
    expect(snapshot.url).toBe(`${server.url}/PolicySearch?policy=<redacted>&email=<redacted>#<redacted>`);
    expect(snapshot.aria).toContain('<email>');
    expect(snapshot.aria).toContain('<phone>');
    const row = record.candidates.find((c) => c.role === 'row' && c.name.startsWith('POL-001'));
    expect(row?.name).toBe('POL-001 Jane Doe <email> Active Edit');
    const edit = record.candidates.find((c) => c.name === 'Edit');
    expect(edit?.rowText).toBe('POL-001 Jane Doe <email> Active Edit');
  });

  it('keeps exact text when PII is off, and drops row text in strict mode', async () => {
    const off = await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: 500 });
    expect(off.snapshot.title).toBe('Policy Search - jane.doe@example.com');
    const strict = await observePage(page, { pageId: 'page-1', pii: 'strict', maxCandidates: 500 });
    expect(strict.record.candidates.some((c) => c.rowText !== undefined)).toBe(false);
  });
});

describe('observePage: cap', () => {
  it('drops non-interactive first, then invisible, then disabled, then off-viewport', async () => {
    const { record } = await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: 500 });
    const interactive = record.candidates.filter((c) => c.interactive);
    const n = interactive.length;

    const onlyControls = await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: n });
    expect(onlyControls.snapshot.candidates.every((c) => c.interactive)).toBe(true);
    expect(onlyControls.snapshot.candidates).toHaveLength(n);
    expect(onlyControls.snapshot.truncated).toBe(true);
    expect(onlyControls.snapshot.totalCandidates).toBe(record.candidates.length);

    const names = async (max: number): Promise<readonly string[]> =>
      (await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: max })).snapshot.candidates.map((c) => c.name);
    expect(await names(n - 1)).not.toContain('Hidden action');
    const minusThree = await names(n - 3);
    expect(minusThree).not.toContain('Delete');
    expect(minusThree).not.toContain('Archive');
    expect(minusThree).toContain('Load more');
    expect(await names(n - 4)).not.toContain('Load more');
    // Survivors keep document order.
    const kept = (await observePage(page, { pageId: 'page-1', pii: 'off', maxCandidates: n - 4 })).snapshot.candidates.map((c) => c.ref);
    expect(kept).toEqual([...kept].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  });

  it('drops cells before landmarks among informational nodes', () => {
    const base = { namingSource: 'content' as const, affordance: 'none' as const, interactive: false, tag: 'div', visible: true, enabled: true, inViewport: true };
    const candidates: Candidate[] = [
      { ...base, ref: 'c1', role: 'main', name: '' },
      { ...base, ref: 'c2', role: 'cell', name: 'A' },
      { ...base, ref: 'c3', role: 'heading', name: 'Title' },
    ];
    const categories: Record<string, NodeCategory> = { c1: 'landmark', c2: 'cell', c3: 'heading' };
    expect(capCandidates(candidates, categories, 2).map((c) => c.ref)).toEqual(['c1', 'c3']);
    expect(capCandidates(candidates, categories, 1).map((c) => c.ref)).toEqual(['c1']);
  });
});

describe('observePage: scope', () => {
  it('scopes to a landmark', async () => {
    const { snapshot } = await observePage(page, { pageId: 'page-1', scope: 'search', pii: 'off' });
    expect(snapshot.scope).toBe('search');
    expect(snapshot.candidates.filter((c) => c.interactive).map((c) => c.name)).toEqual(['Search Policy', 'Search', 'Filter']);
    expect(snapshot.aria.startsWith('- search:')).toBe(true);
    expect(snapshot.aria).not.toContain('navigation');
  });

  it('scopes to a block', async () => {
    const { snapshot } = await observePage(page, { pageId: 'page-1', scope: 'block:ResultsTable', pii: 'off' });
    expect(snapshot.scope).toBe('block:ResultsTable');
    expect(snapshot.candidates.every((c) => c.dataBlock === 'ResultsTable')).toBe(true);
    expect(snapshot.aria).toContain('- table');
  });

  it('rejects a malformed scope and reports a missing one with what exists', async () => {
    expect(() => parseScope('sidebar')).toThrow(/unknown scope/);
    expect(() => parseScope('block:')).toThrow(/needs a data-block name/);
    expect(parseScope(undefined)).toEqual({ kind: 'page' });
    const missing = await observePage(page, { pageId: 'page-1', scope: 'complementary' }).catch((e: unknown) => e);
    expect(isToolError(missing) && missing.family).toBe('not-found');
    expect(isToolError(missing) && missing.message).toMatch(/landmarks present: banner, contentinfo, form, main, navigation, region, search/);
    const missingBlock = await observePage(page, { pageId: 'page-1', scope: 'block:Nope' }).catch((e: unknown) => e);
    expect(isToolError(missingBlock) && missingBlock.message).toMatch(/blocks present: .*SearchBlock/);
  });
});

describe('observePage: aria cap and screenshot', () => {
  it('caps ARIA text on a line boundary with a marker', async () => {
    const { snapshot, record } = await observePage(page, { pageId: 'page-1', pii: 'off', maxAriaBytes: 400 });
    expect(Buffer.byteLength(snapshot.aria, 'utf8')).toBeLessThanOrEqual(400);
    expect(snapshot.aria).toMatch(/\n# truncated: \d+ more lines \(cap 400 bytes\)$/);
    expect(snapshot.truncated).toBe(true);
    expect(record.aria.length).toBeGreaterThan(snapshot.aria.length);
    expect(record.aria.startsWith(snapshot.aria.split('\n# truncated')[0] ?? '')).toBe(true);
  });

  it('writes a screenshot when asked', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'observe-shot-'));
    try {
      const { snapshot, screenshot } = await observePage(page, { pageId: 'page-1', includeScreenshot: true, screenshotDir: dir });
      expect(screenshot?.subarray(0, 4).toString('hex')).toBe('89504e47');
      expect(snapshot.screenshotPath).toBe(path.join(dir, `${snapshot.snapshotId}.png`));
      expect(existsSync(snapshot.screenshotPath ?? '')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('audit', () => {
  it('reports testability findings', async () => {
    const { snapshot } = await observePage(page, { pageId: 'page-1', pii: 'off', audit: true, maxCandidates: 500 });
    const kinds = new Map((snapshot.audit ?? []).map((finding) => [finding.kind, finding]));
    const nameOf = (ref: string): string => snapshot.candidates.find((c) => c.ref === ref)?.name ?? '';
    expect(kinds.get('roleless-clickable')?.refs.map(nameOf)).toEqual(['Help', 'Filter', 'Open details']);
    expect(kinds.get('placeholder-only-input')?.refs.map(nameOf)).toEqual(['Search Policy']);
    expect(kinds.get('unnamed-control')?.refs.length).toBe(4);
    const structural = kinds.get('structural-id-only')?.refs.map((ref) => snapshot.candidates.find((c) => c.ref === ref)?.id);
    expect(structural).toEqual(['b6-Select_Status', 'b9-Input_Code2']);
    // Per-row Edit links are disambiguated by their rows, so they are not duplicates.
    expect(kinds.has('duplicate-name')).toBe(false);
    expect(kinds.has('missing-landmarks')).toBe(false);
  });

  it('flags true duplicates and a page with no main landmark', () => {
    const base = { role: 'button', namingSource: 'content' as const, affordance: 'native' as const, interactive: true, tag: 'button', visible: true, enabled: true, inViewport: true };
    const findings = audit([{ ...base, ref: 'c1', name: 'Save' }, { ...base, ref: 'c2', name: 'Save' }], { landmarks: [] });
    expect(findings.map((f) => f.kind)).toEqual(['duplicate-name', 'missing-landmarks']);
    expect(findings[0]?.refs).toEqual(['c1', 'c2']);
  });
});

describe('diffSnapshots', () => {
  it('reports what an action added and removed, and the alerts now showing', async () => {
    const page2 = await browser.newPage();
    try {
      await page2.goto(`${server.url}/PolicySearch`);
      const before = await observePage(page2, { pageId: 'page-2', pii: 'standard' });
      await page2.evaluate(() => {
        document.querySelector('#results-body tr:last-child')?.remove();
        const alert = document.createElement('div');
        alert.setAttribute('role', 'alert');
        alert.textContent = 'Policy POL-003 deleted by ann@example.org';
        document.querySelector('main')?.prepend(alert);
      });
      const after = await observePage(page2, { pageId: 'page-2', pii: 'standard' });
      const delta = diffSnapshots(before.record, after.record);
      expect(SnapshotDeltaSchema.parse(delta)).toEqual(delta);
      expect(delta.snapshotId).toBe(after.record.snapshotId);
      expect(delta.urlChanged).toBe(false);
      expect(delta.fingerprintChanged).toBe(false);
      expect(delta.alerts).toEqual(['Policy POL-003 deleted by <email>', '3 policies found for <email>']);
      expect(delta.added[0]).toMatchObject({ role: 'alert', name: 'Policy POL-003 deleted by <email>' });
      expect(delta.removed).toContainEqual({ role: 'link', name: 'Edit' });
      expect(delta.removed).toContainEqual({ role: 'row', name: 'POL-003 Ann Poe <email> Active Edit' });
      expect(diffSnapshots(before.record, after.record, ['custom']).alerts).toEqual(['custom']);
    } finally {
      await page2.close();
    }
  });

  it('re-serves a stored record as a capped Snapshot', async () => {
    const { record } = await observePage(page, { pageId: 'page-1', pii: 'standard', maxCandidates: 500 });
    const snapshot = snapshotFromRecord(record, { maxCandidates: 5 });
    expect(SnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.candidates).toHaveLength(5);
    expect(snapshot.truncated).toBe(true);
  });
});
