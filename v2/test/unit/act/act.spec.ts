import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import { performAction, type ActionResult } from '../../../src/act/act.js';
import { hang, html, startServer, type FixtureServer } from './fixtures.js';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let server: FixtureServer;

beforeAll(async () => {
  browser = await chromium.launch();
  server = await startServer({
    '/start': html('<a href="/next">Next</a> <a href="/hang">Hang</a>', 'Start'),
    '/next': html('<h1>Next page</h1>', 'Next'),
    '/hang': hang,
  });
});

afterAll(async () => {
  await browser.close();
  await server.close();
});

beforeEach(async () => {
  context = await browser.newContext();
  page = await context.newPage();
});

afterEach(async () => {
  await context.close();
});

const failure = (result: ActionResult): { family: string; message: string } => {
  if (result.outcome !== 'failed') throw new Error(`expected a failure, got ${JSON.stringify(result)}`);
  return { family: result.family, message: result.message };
};

describe('performAction: actions that succeed', () => {
  it('clicks a button (a real Locator, so a detached-this call would fail)', async () => {
    await page.setContent(`
      <button onclick="const c = document.getElementById('count'); c.textContent = String(Number(c.textContent) + 1)">Increment</button>
      <output id="count">0</output>`);
    const result = await performAction(page, page.getByRole('button', { name: 'Increment' }), 'click', undefined);
    expect(result).toEqual({ outcome: 'succeeded', matches: { total: 1, visible: 1 } });
    expect(await page.locator('#count').textContent()).toBe('1');
  });

  it('fills a field, replacing what was there', async () => {
    await page.setContent('<label>Policy number <input value="OLD-999"></label>');
    const field = page.getByLabel('Policy number');
    const result = await performAction(page, field, 'fill', 'POL-001');
    expect(result.outcome).toBe('succeeded');
    expect(await field.inputValue()).toBe('POL-001');
  });

  it('fills with an empty string to clear a field', async () => {
    await page.setContent('<label>Notes <input value="something"></label>');
    expect((await performAction(page, page.getByLabel('Notes'), 'fill', '')).outcome).toBe('succeeded');
    expect(await page.getByLabel('Notes').inputValue()).toBe('');
  });

  it('selects a native <select> option by label, then by value', async () => {
    await page.setContent(`
      <label>State <select><option value="">--</option><option value="CA">California</option><option value="NY">New York</option></select></label>`);
    const select = page.getByLabel('State');
    const byLabel = await performAction(page, select, 'select', 'New York');
    expect(byLabel).toMatchObject({ outcome: 'succeeded', select: { via: 'native', matchedBy: 'label' } });
    expect(await select.inputValue()).toBe('NY');
    const byValue = await performAction(page, select, 'select', 'CA');
    expect(byValue).toMatchObject({ outcome: 'succeeded', select: { via: 'native', matchedBy: 'value' } });
    expect(await select.inputValue()).toBe('CA');
  });

  it('selects from a custom ARIA combobox by opening it and clicking the option in its popup', async () => {
    await page.setContent(`
      <span id="status-label">Status</span>
      <div role="combobox" id="status" tabindex="0" aria-labelledby="status-label" aria-expanded="false" aria-controls="status-list">Choose…</div>
      <ul role="listbox" aria-label="Legend"><li role="option">Active</li></ul>
      <ul role="listbox" id="status-list" hidden><li role="option">Active</li><li role="option">Inactive</li></ul>
      <script>
        const combo = document.getElementById('status');
        const list = document.getElementById('status-list');
        combo.addEventListener('click', () => { list.hidden = false; combo.setAttribute('aria-expanded', 'true'); });
        list.addEventListener('click', (event) => {
          const option = event.target.closest('[role=option]');
          if (!option) return;
          combo.textContent = option.textContent;
          list.hidden = true;
          combo.setAttribute('aria-expanded', 'false');
        });
      </script>`);
    const combo = page.getByRole('combobox', { name: 'Status' });
    // "Active" is also visible in the legend listbox: only the aria-controls popup scoping makes it unique.
    const result = await performAction(page, combo, 'select', 'Inactive');
    expect(result).toMatchObject({ outcome: 'succeeded', select: { via: 'combobox', typed: false, listboxId: 'status-list' } });
    expect(await page.locator('#status').textContent()).toBe('Inactive');
    const again = await performAction(page, combo, 'select', 'Active');
    expect(again).toMatchObject({ outcome: 'succeeded', select: { via: 'combobox', listboxId: 'status-list' } });
    expect(await page.locator('#status').textContent()).toBe('Active');
  });

  it('types into an editable combobox when options only render for typed text', async () => {
    await page.setContent(`
      <label for="city">City</label>
      <input id="city" role="combobox" aria-autocomplete="list" aria-expanded="false">
      <div id="popup"></div>
      <script>
        const cities = ['Lisbon', 'London', 'Paris'];
        const city = document.getElementById('city');
        const popup = document.getElementById('popup');
        city.addEventListener('input', () => {
          const q = city.value.toLowerCase();
          popup.innerHTML = q ? '<ul role="listbox">' + cities.filter((c) => c.toLowerCase().startsWith(q)).map((c) => '<li role="option">' + c + '</li>').join('') + '</ul>' : '';
        });
        popup.addEventListener('click', (event) => {
          const option = event.target.closest('[role=option]');
          if (option) { city.value = option.textContent + ' (chosen)'; popup.innerHTML = ''; }
        });
      </script>`);
    const result = await performAction(page, page.getByRole('combobox', { name: 'City' }), 'select', 'Paris');
    expect(result).toMatchObject({ outcome: 'succeeded', select: { via: 'combobox', typed: true, typedInto: 'combobox' } });
    expect(await page.locator('#city').inputValue()).toBe('Paris (chosen)');
  });

  it('types into the popup search box a DropdownSearch-style widget focuses on open', async () => {
    await page.setContent(`
      <div role="combobox" id="product" aria-label="Product" tabindex="0" aria-expanded="false">Select a product</div>
      <div id="panel" hidden><input id="filter" aria-label="Search products"><ul role="listbox" id="items"></ul></div>
      <script>
        const products = ['Auto', 'Home', 'Life', 'Travel'];
        const combo = document.getElementById('product');
        const panel = document.getElementById('panel');
        const filter = document.getElementById('filter');
        const items = document.getElementById('items');
        combo.addEventListener('click', () => { panel.hidden = false; combo.setAttribute('aria-expanded', 'true'); filter.focus(); });
        filter.addEventListener('input', () => {
          const q = filter.value.toLowerCase();
          items.innerHTML = q ? products.filter((p) => p.toLowerCase().includes(q)).map((p) => '<li role="option">' + p + '</li>').join('') : '';
        });
        items.addEventListener('click', (event) => {
          const option = event.target.closest('[role=option]');
          if (option) { combo.textContent = option.textContent; panel.hidden = true; }
        });
      </script>`);
    const result = await performAction(page, page.getByRole('combobox', { name: 'Product' }), 'select', 'Life');
    expect(result).toMatchObject({ outcome: 'succeeded', select: { via: 'combobox', typed: true, typedInto: 'focused' } });
    expect(await page.locator('#product').textContent()).toBe('Life');
  });

  it('selects an option inside a listbox target directly', async () => {
    await page.setContent(`
      <ul role="listbox" aria-label="Colors" id="colors">
        <li role="option" aria-selected="false">Red</li><li role="option" aria-selected="false">Blue</li>
      </ul>
      <script>
        document.getElementById('colors').addEventListener('click', (event) => {
          for (const o of document.querySelectorAll('[role=option]')) o.setAttribute('aria-selected', String(o === event.target));
        });
      </script>`);
    const result = await performAction(page, page.getByRole('listbox', { name: 'Colors' }), 'select', 'Blue');
    expect(result).toMatchObject({ outcome: 'succeeded', select: { via: 'listbox' } });
    expect(await page.getByRole('option', { name: 'Blue' }).getAttribute('aria-selected')).toBe('true');
  });

  it('checks and unchecks a native checkbox and an ARIA checkbox', async () => {
    await page.setContent(`
      <label><input type="checkbox"> Agree</label>
      <div role="checkbox" aria-checked="false" tabindex="0" aria-label="Subscribe"
           onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')">Subscribe</div>`);
    const agree = page.getByRole('checkbox', { name: 'Agree' });
    const subscribe = page.getByRole('checkbox', { name: 'Subscribe' });
    expect((await performAction(page, agree, 'check', undefined)).outcome).toBe('succeeded');
    expect(await agree.isChecked()).toBe(true);
    expect((await performAction(page, agree, 'uncheck', undefined)).outcome).toBe('succeeded');
    expect(await agree.isChecked()).toBe(false);
    expect((await performAction(page, subscribe, 'check', undefined)).outcome).toBe('succeeded');
    expect(await subscribe.getAttribute('aria-checked')).toBe('true');
    expect((await performAction(page, subscribe, 'uncheck', undefined)).outcome).toBe('succeeded');
    expect(await subscribe.getAttribute('aria-checked')).toBe('false');
  });

  it('presses Enter in a field and the handler runs; normalizes the key name', async () => {
    await page.setContent(`
      <input aria-label="Search" onkeydown="if (event.key === 'Enter') document.getElementById('out').textContent = 'searched:' + this.value">
      <p id="out"></p>`);
    const search = page.getByRole('textbox', { name: 'Search' });
    await performAction(page, search, 'fill', 'POL-001');
    const result = await performAction(page, search, 'press', 'enter');
    expect(result).toEqual({ outcome: 'succeeded', matches: { total: 1, visible: 1 }, key: 'Enter' });
    expect(await page.locator('#out').textContent()).toBe('searched:POL-001');
  });

  it('presses a key on the page keyboard when there is no target', async () => {
    await page.setContent(`
      <p id="out"></p>
      <script>document.addEventListener('keydown', (e) => { document.getElementById('out').textContent = e.key; });</script>`);
    const result = await performAction(page, null, 'press', 'Escape');
    expect(result).toEqual({ outcome: 'succeeded', key: 'Escape' });
    expect(await page.locator('#out').textContent()).toBe('Escape');
  });

  it('hovers an element', async () => {
    await page.setContent(`
      <span onmouseenter="document.getElementById('tip').hidden = false">Hover me</span>
      <span id="tip" hidden>Tooltip text</span>`);
    expect((await performAction(page, page.getByText('Hover me'), 'hover', undefined)).outcome).toBe('succeeded');
    expect(await page.locator('#tip').isVisible()).toBe(true);
  });

  it('hovers a disabled button (no enabled pre-check for hover)', async () => {
    await page.setContent('<button disabled title="Not yet">Later</button>');
    expect((await performAction(page, page.getByRole('button', { name: 'Later' }), 'hover', undefined)).outcome).toBe('succeeded');
  });

  it('navigates to an absolute URL', async () => {
    const result = await performAction(page, null, 'navigate', `${server.url}/next`);
    expect(result).toEqual({ outcome: 'succeeded' });
    expect(await page.title()).toBe('Next');
  });

  it('waits for a target that renders after the previous action', async () => {
    await page.setContent(`<script>setTimeout(() => { document.body.insertAdjacentHTML('beforeend', '<button>Late</button>'); }, 300);</script>`);
    const result = await performAction(page, page.getByRole('button', { name: 'Late' }), 'click', undefined, { timeoutMs: 3000 });
    expect(result.outcome).toBe('succeeded');
  });

  it('acts on the visible twin and reports hidden twins in the counts', async () => {
    await page.setContent(`
      <nav style="display:none"><a href="#m" onclick="document.title='mobile'">Save</a></nav>
      <a href="#d" onclick="document.title='desktop'">Save</a>`);
    const result = await performAction(page, page.getByText('Save'), 'click', undefined);
    expect(result).toEqual({ outcome: 'succeeded', matches: { total: 2, visible: 1 } });
    expect(await page.title()).toBe('desktop');
  });
});

describe('performAction: failure families', () => {
  it('not-found when nothing matches', async () => {
    await page.setContent('<button>Save</button>');
    const result = await performAction(page, page.getByRole('button', { name: 'Submit' }), 'click', undefined, { timeoutMs: 300 });
    expect(result).toMatchObject({ outcome: 'failed', family: 'not-found', matches: { total: 0, visible: 0 } });
    expect(failure(result).message).toContain("getByRole('button', { name: 'Submit' })");
  });

  it('ambiguous when two visible elements match', async () => {
    await page.setContent('<button>Delete</button><button>Delete</button>');
    const result = await performAction(page, page.getByRole('button', { name: 'Delete' }), 'click', undefined, { timeoutMs: 300 });
    expect(result).toMatchObject({ outcome: 'failed', family: 'ambiguous', matches: { total: 2, visible: 2 } });
  });

  it('not-visible when the only match is hidden', async () => {
    await page.setContent('<button id="ghost" style="display:none">Ghost</button>');
    const result = await performAction(page, page.locator('#ghost'), 'click', undefined, { timeoutMs: 300 });
    expect(result).toMatchObject({ outcome: 'failed', family: 'not-visible', matches: { total: 1, visible: 0 } });
  });

  it('not-visible when an overlay intercepts pointer events', async () => {
    await page.setContent(`
      <button id="covered" style="position:absolute;top:100px;left:10px">Covered</button>
      <div class="overlay" style="position:absolute;top:0;left:0;width:400px;height:400px;z-index:10"></div>`);
    const result = await performAction(page, page.getByRole('button', { name: 'Covered' }), 'click', undefined, { timeoutMs: 800 });
    expect(failure(result).family).toBe('not-visible');
    expect(failure(result).message).toContain('intercepts pointer events');
  });

  it('not-enabled for a disabled button, without waiting out the timeout', async () => {
    await page.setContent('<button disabled>Approve</button>');
    const started = Date.now();
    const result = await performAction(page, page.getByRole('button', { name: 'Approve' }), 'click', undefined, { timeoutMs: 5000 });
    expect(result).toMatchObject({ outcome: 'failed', family: 'not-enabled' });
    expect(failure(result).message).toContain('is disabled');
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('not-enabled for a button inside a disabled fieldset', async () => {
    await page.setContent('<fieldset disabled><button>Submit claim</button></fieldset>');
    const result = await performAction(page, page.getByRole('button', { name: 'Submit claim' }), 'click', undefined, { timeoutMs: 500 });
    expect(failure(result).family).toBe('not-enabled');
  });

  it('not-enabled for fill on a read-only field', async () => {
    await page.setContent('<label>Policy <input readonly value="POL-1"></label>');
    const result = await performAction(page, page.getByLabel('Policy'), 'fill', 'POL-2', { timeoutMs: 500 });
    expect(failure(result)).toMatchObject({ family: 'not-enabled' });
    expect(failure(result).message).toContain('read-only');
  });

  it('not-enabled for a disabled native option', async () => {
    await page.setContent('<label>State <select><option>California</option><option disabled>Texas</option></select></label>');
    const result = await performAction(page, page.getByLabel('State'), 'select', 'Texas', { timeoutMs: 500 });
    expect(failure(result).family).toBe('not-enabled');
  });

  it('assertion-like for an unknown key (v1 pressed "Submit")', async () => {
    await page.setContent('<input aria-label="Search">');
    const result = await performAction(page, page.getByLabel('Search'), 'press', 'Submit');
    expect(failure(result).family).toBe('assertion-like');
    expect(failure(result).message).toContain('unknown key "Submit"');
  });

  it('assertion-like for fill on a div', async () => {
    await page.setContent('<div id="box">Not a field</div>');
    const result = await performAction(page, page.locator('#box'), 'fill', 'x', { timeoutMs: 500 });
    expect(failure(result).family).toBe('assertion-like');
  });

  it('assertion-like for check on something that is not a checkbox', async () => {
    await page.setContent('<div id="box">Not a checkbox</div>');
    const result = await performAction(page, page.locator('#box'), 'check', undefined, { timeoutMs: 500 });
    expect(failure(result).family).toBe('assertion-like');
    expect(failure(result).message).toContain('Not a checkbox');
  });

  it('assertion-like for a native option that does not exist, listing the options', async () => {
    await page.setContent('<label>State <select><option>California</option><option>New York</option></select></label>');
    const result = await performAction(page, page.getByLabel('State'), 'select', 'Texas', { timeoutMs: 500 });
    expect(failure(result).family).toBe('assertion-like');
    expect(failure(result).message).toContain('"California", "New York"');
  });

  it('assertion-like for a custom dropdown without the option, listing what it shows', async () => {
    await page.setContent(`
      <div role="combobox" aria-label="Priority" tabindex="0" onclick="document.getElementById('pl').hidden = false">Pick</div>
      <ul role="listbox" id="pl" hidden><li role="option">High</li><li role="option">Low</li></ul>`);
    const result = await performAction(page, page.getByRole('combobox', { name: 'Priority' }), 'select', 'Urgent', { timeoutMs: 2500 });
    expect(failure(result).family).toBe('assertion-like');
    expect(failure(result).message).toContain('"High", "Low"');
  });

  it('not-found when opening a "dropdown" shows no options at all', async () => {
    await page.setContent('<button>Just a button</button>');
    const result = await performAction(page, page.getByRole('button', { name: 'Just a button' }), 'select', 'Anything', { timeoutMs: 2500 });
    expect(failure(result).family).toBe('not-found');
    expect(failure(result).message).toContain('showed no options');
  });

  it('timeout for a click whose navigation hangs', async () => {
    await page.goto(`${server.url}/start`);
    const result = await performAction(page, page.getByRole('link', { name: 'Hang' }), 'click', undefined, { timeoutMs: 1200 });
    expect(failure(result).family).toBe('timeout');
    expect(failure(result).message).toContain('scheduled navigations');
  });

  it('timeout for a click on an element that never stops moving', async () => {
    await page.setContent(`
      <style>@keyframes slide { from { transform: translateX(0) } to { transform: translateX(200px) } }</style>
      <button style="animation: slide .1s linear infinite">Moving</button>`);
    const result = await performAction(page, page.getByRole('button', { name: 'Moving' }), 'click', undefined, { timeoutMs: 800 });
    expect(failure(result).family).toBe('timeout');
    expect(failure(result).message).toContain('not stable');
  });

  it('timeout for a navigation that never answers', async () => {
    const result = await performAction(page, null, 'navigate', `${server.url}/hang`, { timeoutMs: 600 });
    expect(failure(result).family).toBe('timeout');
  });

  it('invalid-input (returned) for a relative navigate URL that Chromium rejects', async () => {
    const result = await performAction(page, null, 'navigate', 'PolicySearch', { timeoutMs: 1000 });
    expect(failure(result).family).toBe('invalid-input');
  });

  it('unavailable once the page is closed', async () => {
    const doomed = await context.newPage();
    const button = doomed.getByRole('button');
    await doomed.close();
    const result = await performAction(doomed, button, 'click', undefined, { timeoutMs: 300 });
    expect(failure(result).family).toBe('unavailable');
  });
});

describe('performAction: malformed requests throw invalid-input', () => {
  const invalid = async (call: () => Promise<unknown>): Promise<void> => {
    await expect(call()).rejects.toSatisfy((error: unknown) => error instanceof ToolError && error.family === 'invalid-input');
  };

  it('rejects missing targets, values, and keys', async () => {
    await invalid(() => performAction(page, null, 'click', undefined));
    await invalid(() => performAction(page, null, 'hover', undefined));
    await invalid(() => performAction(page, page.locator('input'), 'fill', undefined));
    await invalid(() => performAction(page, page.locator('select'), 'select', ''));
    await invalid(() => performAction(page, null, 'press', undefined));
    await invalid(() => performAction(page, null, 'navigate', undefined));
    await invalid(() => performAction(page, null, 'click', undefined, { timeoutMs: 0 }));
  });
});
