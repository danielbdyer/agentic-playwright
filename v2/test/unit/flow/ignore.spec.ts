/**
 * Observation never sees Tesseract's own UI: everything under an element
 * marked data-tesseract-ignore (light DOM or open shadow root) is skipped by
 * the walk, the fingerprint signals, and the structural signature, so the
 * recorder's Stop button cannot become a candidate, a facet, or drift.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { inPage } from '../../../src/observe/in-page/runtime.js';
import { observePage } from '../../../src/observe/index.js';
import { RECORDER_SCRIPT, recorderCall } from '../../../src/flow/index.js';

const BASE = `<!doctype html><html><head><title>Ignore</title></head><body>
<main><h1>Orders</h1><button id="kept">Kept action</button><input aria-label="Order number"></main>
</body></html>`;

const WITH_IGNORED = BASE.replace(
  '</body>',
  `<div data-tesseract-ignore><button>Ignored action</button><a href="#x">Ignored link</a><nav aria-label="Ignored nav"></nav></div>
   <div data-tesseract-ignore id="open-host"></div>
   <script>document.getElementById('open-host').attachShadow({ mode: 'open' }).innerHTML = '<button>Shadow ignored</button>';</script>
</body>`,
);

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

afterAll(async () => {
  await browser.close();
});

describe('observe skips [data-tesseract-ignore] subtrees', () => {
  it('in the walk, the fingerprint signals, and the structural signature', async () => {
    await page.setContent(BASE);
    const plainSignals = await inPage(page, 'signals');
    const plainSignature = await inPage(page, 'structuralSignature');
    const plainWalk = await inPage(page, 'walk', { snapshotId: 'snap-plain' });

    await page.setContent(WITH_IGNORED);
    const walked = await inPage(page, 'walk', { snapshotId: 'snap-ignored' });
    expect(walked.nodes.map((n) => n.name)).toEqual(plainWalk.nodes.map((n) => n.name));
    expect(walked.nodes.some((n) => /ignored/i.test(n.name))).toBe(false);
    const signals = await inPage(page, 'signals');
    expect(signals.fingerprint).toEqual(plainSignals.fingerprint);
    expect(await inPage(page, 'structuralSignature')).toBe(plainSignature);

    // The elements are really there and visible to Playwright.
    expect(await page.getByRole('button', { name: 'Ignored action' }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Shadow ignored' }).count()).toBe(1);
  });

  it('in the snapshot the recorder and app.observe take', async () => {
    await page.setContent(BASE);
    const plain = await observePage(page, { pageId: 'p-test' });
    await page.setContent(WITH_IGNORED);
    const { snapshot, record } = await observePage(page, { pageId: 'p-test' });
    expect(snapshot.candidates.map((c) => `${c.role}:${c.name}`)).toEqual(plain.snapshot.candidates.map((c) => `${c.role}:${c.name}`));
    expect(snapshot.candidates.some((c) => /ignored/i.test(c.name))).toBe(false);
    expect(record.fingerprint.hash).toBe(plain.record.fingerprint.hash);
  });

  it('including the recorder Stop button, which lives in a closed shadow root', async () => {
    await page.setContent(BASE);
    const before = await observePage(page, { pageId: 'p-test' });
    await page.evaluate(RECORDER_SCRIPT);
    await page.evaluate(recorderCall('configure', { active: true, token: 't', stopButton: true }));
    expect(await page.locator('[data-tesseract-ignore]').count()).toBe(1);
    const after = await observePage(page, { pageId: 'p-test' });
    expect(after.snapshot.candidates).toEqual(before.snapshot.candidates);
    expect(after.record.fingerprint.hash).toBe(before.record.fingerprint.hash);
    expect(after.snapshot.aria).not.toContain('Stop recording');
    await page.evaluate(recorderCall('configure', { active: false }));
    expect(await page.locator('[data-tesseract-ignore]').count()).toBe(0);
  });
});
