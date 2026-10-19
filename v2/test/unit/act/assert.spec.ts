import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import { parseRegexLiteral, runAssertion, titleExpectation, urlExpectation } from '../../../src/act/assert.js';
import { html, startServer, type FixtureServer } from './fixtures.js';

const FAIL = { timeoutMs: 300 } as const;

let browser: Browser;
let page: Page;
let server: FixtureServer;

const TODO = html(
  `<main>
     <h1>Todos</h1>
     <ul aria-label="Todo list"><li>Buy milk</li><li>Walk dog</li><li>Pay rent</li></ul>
     <span id="left">0 items left</span>
     <label>Name <input value="Ada"></label>
     <button>Save</button>
     <button disabled>Delete</button>
     <label><input type="checkbox" checked> Remember me</label>
     <label><input type="checkbox"> Subscribe</label>
     <div id="secret" hidden>Secret</div>
     <p id="greeting">  Welcome   back,
        Ada  </p>
     <button>Twin</button><button>Twin</button>
   </main>`,
  'Todo App',
);

beforeAll(async () => {
  browser = await chromium.launch();
  server = await startServer({ '/items/42': TODO });
  page = await browser.newPage();
  await page.goto(`${server.url}/items/42?tab=details`);
});

afterAll(async () => {
  await browser.close();
  await server.close();
});

describe('runAssertion: pass and fail for every kind, with observed values', () => {
  it('visible', async () => {
    expect(await runAssertion(page, 'visible', page.getByRole('button', { name: 'Save' }), undefined)).toEqual({ passed: true, observed: true });
    const hidden = await runAssertion(page, 'visible', page.locator('#secret'), undefined, FAIL);
    expect(hidden).toMatchObject({ passed: false, observed: false });
    expect(hidden.message).toContain('toBeVisible');
    const missing = await runAssertion(page, 'visible', page.getByRole('button', { name: 'Nope' }), undefined, FAIL);
    expect(missing).toMatchObject({ passed: false, observed: false });
    expect(missing.message).toContain('element(s) not found');
  });

  it('hidden', async () => {
    expect(await runAssertion(page, 'hidden', page.locator('#secret'), undefined)).toEqual({ passed: true, observed: false });
    expect(await runAssertion(page, 'hidden', page.getByText('No such thing'), undefined)).toEqual({ passed: true, observed: false });
    const shown = await runAssertion(page, 'hidden', page.getByRole('heading', { name: 'Todos' }), undefined, FAIL);
    expect(shown).toMatchObject({ passed: false, observed: true });
  });

  it('text (exact, whitespace-normalized)', async () => {
    expect(await runAssertion(page, 'text', page.locator('#greeting'), 'Welcome back, Ada')).toEqual({ passed: true, observed: 'Welcome back, Ada' });
    const wrong = await runAssertion(page, 'text', page.locator('#greeting'), 'Welcome', FAIL);
    expect(wrong).toMatchObject({ passed: false, observed: 'Welcome back, Ada' });
    // A near-miss makes Playwright print a diff; the summary still names both sides.
    expect(wrong.message).toContain('Expected: "Welcome"');
    expect(wrong.message).toContain('Received: "  Welcome   back,');
    expect(wrong.message).not.toMatch(/\u001b\[/);
  });

  it('text: a paraphrase ("the count decreases by one") fails and shows what the page says', async () => {
    const result = await runAssertion(page, 'text', page.locator('#left'), '1 item left', FAIL);
    expect(result).toMatchObject({ passed: false, observed: '0 items left' });
    expect(result.message).toBe('expect(locator).toHaveText(expected) failed; Expected: "1 item left"; Received: "0 items left"');
  });

  it('text: a missing element fails with observed null', async () => {
    const result = await runAssertion(page, 'text', page.locator('#nope'), 'anything', FAIL);
    expect(result).toMatchObject({ passed: false, observed: null });
    expect(result.message).toContain('element(s) not found');
  });

  it('contains-text', async () => {
    expect(await runAssertion(page, 'contains-text', page.locator('#greeting'), 'back')).toEqual({ passed: true, observed: 'Welcome back, Ada' });
    expect(await runAssertion(page, 'contains-text', page.locator('#greeting'), 'Goodbye', FAIL)).toMatchObject({
      passed: false,
      observed: 'Welcome back, Ada',
    });
  });

  it('value', async () => {
    expect(await runAssertion(page, 'value', page.getByLabel('Name'), 'Ada')).toEqual({ passed: true, observed: 'Ada' });
    const wrong = await runAssertion(page, 'value', page.getByLabel('Name'), 'Grace', FAIL);
    expect(wrong).toMatchObject({ passed: false, observed: 'Ada' });
    expect(wrong.message).toContain('toHaveValue');
  });

  it('url: substring, /regex/, and absolute', async () => {
    const url = `${server.url}/items/42?tab=details`;
    expect(await runAssertion(page, 'url', null, '/items/42')).toEqual({ passed: true, observed: url });
    expect(await runAssertion(page, 'url', null, '/\\/items\\/\\d+/')).toEqual({ passed: true, observed: url });
    expect(await runAssertion(page, 'url', null, url)).toEqual({ passed: true, observed: url });
    const wrong = await runAssertion(page, 'url', null, '/PolicySearch', FAIL);
    expect(wrong).toMatchObject({ passed: false, observed: url });
    expect(wrong.message).toContain('toHaveURL');
    expect(await runAssertion(page, 'url', null, `${server.url}/items/42`, FAIL)).toMatchObject({ passed: false });
  });

  it('title', async () => {
    expect(await runAssertion(page, 'title', null, 'Todo App')).toEqual({ passed: true, observed: 'Todo App' });
    expect(await runAssertion(page, 'title', null, '/^Todo/')).toEqual({ passed: true, observed: 'Todo App' });
    expect(await runAssertion(page, 'title', null, 'Todo', FAIL)).toMatchObject({ passed: false, observed: 'Todo App' });
  });

  it('count (number or numeric string)', async () => {
    const items = page.getByRole('listitem');
    expect(await runAssertion(page, 'count', items, 3)).toEqual({ passed: true, observed: 3 });
    expect(await runAssertion(page, 'count', items, '3')).toEqual({ passed: true, observed: 3 });
    const wrong = await runAssertion(page, 'count', items, 2, FAIL);
    expect(wrong).toMatchObject({ passed: false, observed: 3 });
    expect(wrong.message).toContain('toHaveCount');
    expect(await runAssertion(page, 'count', page.getByRole('listitem', { name: 'Nope' }), 0)).toEqual({ passed: true, observed: 0 });
  });

  it('enabled', async () => {
    expect(await runAssertion(page, 'enabled', page.getByRole('button', { name: 'Save' }), undefined)).toEqual({ passed: true, observed: true });
    expect(await runAssertion(page, 'enabled', page.getByRole('button', { name: 'Delete' }), undefined, FAIL)).toMatchObject({
      passed: false,
      observed: false,
    });
  });

  it('disabled', async () => {
    expect(await runAssertion(page, 'disabled', page.getByRole('button', { name: 'Delete' }), undefined)).toEqual({ passed: true, observed: false });
    expect(await runAssertion(page, 'disabled', page.getByRole('button', { name: 'Save' }), undefined, FAIL)).toMatchObject({
      passed: false,
      observed: true,
    });
  });

  it('checked', async () => {
    expect(await runAssertion(page, 'checked', page.getByRole('checkbox', { name: 'Remember me' }), undefined)).toEqual({ passed: true, observed: true });
    expect(await runAssertion(page, 'checked', page.getByRole('checkbox', { name: 'Subscribe' }), undefined, FAIL)).toMatchObject({
      passed: false,
      observed: false,
    });
  });

  it('unchecked', async () => {
    expect(await runAssertion(page, 'unchecked', page.getByRole('checkbox', { name: 'Subscribe' }), undefined)).toEqual({ passed: true, observed: false });
    expect(await runAssertion(page, 'unchecked', page.getByRole('checkbox', { name: 'Remember me' }), undefined, FAIL)).toMatchObject({
      passed: false,
      observed: true,
    });
  });

  it('checked on something that is not a checkbox fails with the reason', async () => {
    const result = await runAssertion(page, 'checked', page.getByRole('button', { name: 'Save' }), undefined, FAIL);
    expect(result).toMatchObject({ passed: false, observed: null });
    expect(result.message).toContain('Not a checkbox');
  });

  it('waits for the state to arrive (web-first)', async () => {
    const live = await browser.newPage();
    await live.setContent(`<p id="status">Saving…</p><script>setTimeout(() => { document.getElementById('status').textContent = 'Saved'; }, 300);</script>`);
    expect(await runAssertion(live, 'text', live.locator('#status'), 'Saved', { timeoutMs: 3000 })).toEqual({ passed: true, observed: 'Saved' });
    await live.close();
  });
});

describe('runAssertion: errors that are not results', () => {
  const rejectsWith = async (call: () => Promise<unknown>, family: string): Promise<void> => {
    await expect(call()).rejects.toSatisfy((error: unknown) => error instanceof ToolError && error.family === family);
  };

  it('invalid-input for an element kind without a target', async () => {
    await rejectsWith(() => runAssertion(page, 'visible', null, undefined), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'text', null, 'x'), 'invalid-input');
  });

  it('invalid-input for a missing or malformed expected value', async () => {
    await rejectsWith(() => runAssertion(page, 'text', page.locator('#left'), undefined), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'url', null, undefined), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'count', page.getByRole('listitem'), 'three'), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'count', page.getByRole('listitem'), -1), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'count', page.getByRole('listitem'), 1.5), 'invalid-input');
    await rejectsWith(() => runAssertion(page, 'visible', page.locator('h1'), undefined, { timeoutMs: 0 }), 'invalid-input');
  });

  it('ambiguous when the target matches several elements (the emitted test would fail the same way)', async () => {
    await rejectsWith(() => runAssertion(page, 'visible', page.getByRole('button', { name: 'Twin' }), undefined, FAIL), 'ambiguous');
    await rejectsWith(() => runAssertion(page, 'text', page.getByRole('button', { name: 'Twin' }), 'Twin', FAIL), 'ambiguous');
  });

  it('unavailable when the page is gone', async () => {
    const doomed = await browser.newPage();
    await doomed.close();
    await rejectsWith(() => runAssertion(doomed, 'visible', doomed.locator('body'), undefined, FAIL), 'unavailable');
  });
});

describe('expectation helpers', () => {
  it('parses /regex/ literals and ignores stateful flags', () => {
    expect(parseRegexLiteral('/a+b/i')?.flags).toBe('i');
    expect(parseRegexLiteral('/a+b/g')?.flags).toBe('');
    expect(parseRegexLiteral('plain')).toBeNull();
    expect(parseRegexLiteral('/[/')).toBeNull();
  });

  it('url: substring by default, exact when absolute, regex when slash-delimited', () => {
    const sub = urlExpectation('/PolicySearch?x=1');
    expect(sub).toBeInstanceOf(RegExp);
    expect((sub as RegExp).test('https://qa.example.com/App/PolicySearch?x=1')).toBe(true);
    expect((sub as RegExp).test('https://qa.example.com/App/PolicySearchXx=1')).toBe(false);
    expect(urlExpectation('https://qa.example.com/App')).toBe('https://qa.example.com/App');
    expect(urlExpectation('/\\d+$/')).toEqual(/\d+$/);
  });

  it('title: exact unless slash-delimited', () => {
    expect(titleExpectation('Policy Search')).toBe('Policy Search');
    expect(titleExpectation('/Policy/')).toEqual(/Policy/);
  });
});
