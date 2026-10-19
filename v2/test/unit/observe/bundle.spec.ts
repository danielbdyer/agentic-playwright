import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { IN_PAGE_BUNDLE, IN_PAGE_BUNDLE_HASH } from '../../../src/observe/in-page/bundle.generated.js';
import { inPage } from '../../../src/observe/in-page/runtime.js';
import { observePage } from '../../../src/observe/observe.js';
import { awaitHydration } from '../../../src/observe/hydration.js';
import { resolveCandidateLocator } from '../../../src/observe/ladder.js';
import { launch, openFixture } from './helpers.js';

const v2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const script = path.join(v2Root, 'scripts', 'build-inpage.mjs');
const generated = path.join(v2Root, 'src', 'observe', 'in-page', 'bundle.generated.ts');

const runBuild = (...args: string[]): { readonly status: number | null; readonly output: string } => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: v2Root, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

describe('in-page bundle', () => {
  it('is up to date with walker.ts (the drift check CI runs)', () => {
    const result = runBuild('--check');
    expect(result.output).toContain('up to date');
    expect(result.status).toBe(0);
  });

  it('detects a stale generated file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'inpage-'));
    try {
      const copy = path.join(dir, 'bundle.generated.ts');
      writeFileSync(copy, readFileSync(generated, 'utf8').replace('describeRef', 'describeRefX'));
      const stale = runBuild('--check', '--out', copy);
      expect(stale.status).toBe(1);
      expect(stale.output).toContain('stale');
      expect(runBuild('--out', copy).status).toBe(0);
      expect(runBuild('--check', '--out', copy).status).toBe(0);
      expect(readFileSync(copy, 'utf8')).toBe(readFileSync(generated, 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('carries the hash of its own text and no transpiler helpers', () => {
    expect(IN_PAGE_BUNDLE_HASH).toBe(`sha256:${createHash('sha256').update(IN_PAGE_BUNDLE).digest('hex')}`);
    expect(IN_PAGE_BUNDLE).toContain('var __tesseractInPage');
    expect(IN_PAGE_BUNDLE).not.toMatch(/__name\(|require\(|import\s/);
  });
});

describe('in-page runtime hygiene', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await launch();
  });
  afterAll(async () => {
    await browser.close();
  });

  it('leaves no globals on the page except window.__tesseract', async () => {
    const page = await openFixture(browser);
    const before = new Set(await page.evaluate(() => Object.getOwnPropertyNames(window)));
    await inPage(page, 'signals');
    await inPage(page, 'structuralSignature');
    await awaitHydration(page, { budgetMs: 3_000 });
    const { record } = await observePage(page, { pageId: 'p' });
    await resolveCandidateLocator(page, record.snapshotId, record.candidates.find((c) => c.name === 'Filter')?.ref ?? '');
    const added = (await page.evaluate(() => Object.getOwnPropertyNames(window))).filter((name) => !before.has(name));
    expect(added).toEqual(['__tesseract']);
    await page.close();
  });

  it('works on a fresh page whose first evaluation is an element-bound call', async () => {
    // v1's walker only worked when another evaluate had leaked a __name shim first.
    const page = await browser.newPage();
    await page.setContent('<main><div onclick="void 0">Only clickable</div></main>');
    const { record } = await observePage(page, { pageId: 'fresh' });
    const resolved = await resolveCandidateLocator(page, record.snapshotId, record.candidates.find((c) => c.name === 'Only clickable')?.ref ?? '');
    expect(resolved.verified).toBe(true);
    await page.close();
  });
});
