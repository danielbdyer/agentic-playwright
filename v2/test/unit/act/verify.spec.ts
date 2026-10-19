import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import { countMatches, describeLocator, requireUnique, resolveUnique, settleVisible } from '../../../src/act/verify.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(`
    <main>
      <button>Only</button>
      <button>Twice</button><button>Twice</button>
      <span style="display:none">Ghost</span>
      <a style="display:none">Save</a><a>Save</a>
    </main>`);
});

afterAll(async () => {
  await browser.close();
});

const familyOf = async (call: () => Promise<unknown>): Promise<{ family: string; detail: unknown }> => {
  try {
    await call();
  } catch (error) {
    if (error instanceof ToolError) return { family: error.family, detail: error.detail };
    throw error;
  }
  throw new Error('expected a ToolError');
};

describe('countMatches', () => {
  it('counts all and visible matches separately (getByText counts hidden nodes)', async () => {
    expect(await countMatches(page.getByText('Save'))).toEqual({ total: 2, visible: 1 });
    expect(await countMatches(page.getByText('Ghost'))).toEqual({ total: 1, visible: 0 });
    expect(await countMatches(page.getByRole('button', { name: 'Twice' }))).toEqual({ total: 2, visible: 2 });
    expect(await countMatches(page.getByRole('button', { name: 'None' }))).toEqual({ total: 0, visible: 0 });
  });
});

describe('requireUnique', () => {
  it('returns the visible-filtered locator for exactly one visible match', async () => {
    const unique = await requireUnique(page.getByText('Save'), 'the Save link');
    expect(await unique.count()).toBe(1);
    expect(describeLocator(unique)).toBe("getByText('Save').filter({ visible: true })");
    const { matches } = await resolveUnique(page.getByRole('button', { name: 'Only' }), 'Only');
    expect(matches).toEqual({ total: 1, visible: 1 });
  });

  it('not-found / not-visible / ambiguous, with counts in detail', async () => {
    expect(await familyOf(() => requireUnique(page.getByRole('button', { name: 'None' }), 'None'))).toMatchObject({
      family: 'not-found',
      detail: { total: 0, visible: 0 },
    });
    expect(await familyOf(() => requireUnique(page.getByText('Ghost'), 'Ghost'))).toMatchObject({
      family: 'not-visible',
      detail: { total: 1, visible: 0 },
    });
    expect(await familyOf(() => requireUnique(page.getByRole('button', { name: 'Twice' }), 'Twice'))).toMatchObject({
      family: 'ambiguous',
      detail: { total: 2, visible: 2, locator: "getByRole('button', { name: 'Twice' })" },
    });
  });
});

describe('settleVisible', () => {
  it('returns once something visible appears, and quietly when nothing does', async () => {
    const live = await browser.newPage();
    await live.setContent(`<script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<p>Ready</p>'), 200);</script>`);
    await settleVisible(live.getByText('Ready'), 3000);
    expect(await live.getByText('Ready').isVisible()).toBe(true);
    const started = Date.now();
    await settleVisible(live.getByText('Never'), 200);
    expect(Date.now() - started).toBeLessThan(2000);
    await live.close();
  });
});
