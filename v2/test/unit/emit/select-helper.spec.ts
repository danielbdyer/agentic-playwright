/**
 * The emitted custom-dropdown helper replays what app.act's select verified
 * (act.ts selectCustom): an option the target already shows is clicked
 * directly; otherwise the dropdown opens, the option is looked for in its
 * popup, and the value is typed when the option only renders for typed text.
 * Each widget is driven by performAction and by the emitted page object
 * (transpiled and imported), in real Chromium.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { performAction } from '../../../src/act/act.js';
import { renderPageObject } from '../../../src/emit/index.js';
import { facet } from './fixtures.js';

const v2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const facets = [
  facet({ id: 'shop:status', role: 'combobox', tag: 'div', namingSource: 'aria-labelledby', locators: [{ strategy: 'role-name', role: 'combobox', name: 'Status' }] }),
  facet({ id: 'shop:city', role: 'combobox', tag: 'input', namingSource: 'label-for', locators: [{ strategy: 'role-name', role: 'combobox', name: 'City' }] }),
  facet({ id: 'shop:product', role: 'combobox', tag: 'div', namingSource: 'aria-label', locators: [{ strategy: 'role-name', role: 'combobox', name: 'Product' }] }),
  facet({ id: 'shop:colors', role: 'listbox', tag: 'ul', namingSource: 'aria-label', locators: [{ strategy: 'role-name', role: 'listbox', name: 'Colors' }] }),
];

/** An ARIA combobox whose popup is named by aria-controls; "Active" is also visible in an unrelated listbox. */
const STATUS = `
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
  </script>`;

/** An editable combobox that renders options only for typed text. */
const CITY = `
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
  </script>`;

/** An OutSystems DropdownSearch-style widget: opening focuses a search box; options render only after typing. */
const PRODUCT = `
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
  </script>`;

/** An open listbox: clicking anywhere in it selects what is under the pointer (its centre is "Green"). */
const COLORS = `
  <ul role="listbox" aria-label="Colors" id="colors" style="margin:0;padding:0;list-style:none">
    <li role="option" aria-selected="false" style="height:20px">Red</li>
    <li role="option" aria-selected="false" style="height:20px">Green</li>
    <li role="option" aria-selected="false" style="height:20px">Blue</li>
  </ul>
  <script>
    window.clicks = [];
    document.getElementById('colors').addEventListener('click', (event) => {
      const option = event.target.closest('[role=option]');
      window.clicks.push(option ? option.textContent : 'listbox');
      for (const o of document.querySelectorAll('[role=option]')) o.setAttribute('aria-selected', String(o === option));
    });
  </script>`;

interface ShopPage {
  selectStatus(value: string): Promise<void>;
  selectCity(value: string): Promise<void>;
  selectProduct(value: string): Promise<void>;
  selectColors(value: string): Promise<void>;
}

let browser: Browser;
let dir: string;
let ShopPageClass: new (page: Page) => ShopPage;

beforeAll(async () => {
  browser = await chromium.launch();
  const rendered = renderPageObject('shop', null, facets, null);
  const js = ts.transpileModule(rendered.text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  await fs.mkdir(path.join(v2Root, '.tmp'), { recursive: true });
  dir = await fs.mkdtemp(path.join(v2Root, '.tmp', 'select-helper-'));
  const file = path.join(dir, 'shop.page.mjs');
  await fs.writeFile(file, js);
  const loaded = (await import(pathToFileURL(file).href)) as { readonly ShopPage: new (page: Page) => ShopPage };
  ShopPageClass = loaded.ShopPage;
}, 30_000);

afterAll(async () => {
  await browser.close();
  if (dir !== undefined) await fs.rm(dir, { recursive: true, force: true });
});

const withPage = async (html: string, run: (page: Page) => Promise<void>): Promise<void> => {
  const page = await browser.newPage();
  page.setDefaultTimeout(4_000);
  try {
    await page.setContent(html);
    await run(page);
  } finally {
    await page.close();
  }
};

describe('emitted select helper replays app.act select', () => {
  it('opens a combobox and picks the option inside its aria-controls popup (an identical option elsewhere is ignored)', async () => {
    await withPage(STATUS, async (page) => {
      expect(await performAction(page, page.getByRole('combobox', { name: 'Status' }), 'select', 'Active')).toMatchObject({ outcome: 'succeeded', select: { via: 'combobox', typed: false } });
    });
    await withPage(STATUS, async (page) => {
      await new ShopPageClass(page).selectStatus('Active');
      expect(await page.locator('#status').textContent()).toBe('Active');
      await new ShopPageClass(page).selectStatus('Inactive');
      expect(await page.locator('#status').textContent()).toBe('Inactive');
    });
  });

  it('types into an editable combobox when the option only renders for typed text', async () => {
    await withPage(CITY, async (page) => {
      expect(await performAction(page, page.getByRole('combobox', { name: 'City' }), 'select', 'Paris')).toMatchObject({ outcome: 'succeeded', select: { typed: true, typedInto: 'combobox' } });
    });
    await withPage(CITY, async (page) => {
      await new ShopPageClass(page).selectCity('Paris');
      expect(await page.locator('#city').inputValue()).toBe('Paris (chosen)');
    });
  });

  it('types into the search box a DropdownSearch focuses on open', async () => {
    await withPage(PRODUCT, async (page) => {
      expect(await performAction(page, page.getByRole('combobox', { name: 'Product' }), 'select', 'Life')).toMatchObject({ outcome: 'succeeded', select: { typed: true, typedInto: 'focused' } });
    });
    await withPage(PRODUCT, async (page) => {
      await new ShopPageClass(page).selectProduct('Life');
      expect(await page.locator('#product').textContent()).toBe('Life');
    });
  });

  it('clicks the option of an open listbox directly, never the listbox centre', async () => {
    await withPage(COLORS, async (page) => {
      expect(await performAction(page, page.getByRole('listbox', { name: 'Colors' }), 'select', 'Blue')).toMatchObject({ outcome: 'succeeded', select: { via: 'listbox' } });
      expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(['Blue']);
    });
    await withPage(COLORS, async (page) => {
      await new ShopPageClass(page).selectColors('Blue');
      expect(await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)).toEqual(['Blue']);
      expect(await page.getByRole('option', { name: 'Blue' }).getAttribute('aria-selected')).toBe('true');
    });
  });

  it('emits the shared picker once, after the class, only when a generated helper uses it', () => {
    const text = renderPageObject('shop', null, facets, null).text;
    expect(text.match(/async function selectCustomOption\(/g)).toHaveLength(1);
    expect(text).toContain('  async selectStatus(value: string): Promise<void> {\n    await selectCustomOption(this.status, value);\n  }');
    const overrides = [
      "import type { Page } from '@playwright/test';",
      'export class ShopPageOverrides {',
      '  readonly page: Page;',
      '  constructor(page: Page) { this.page = page; }',
      '  async selectStatus(_value: string): Promise<void> {}',
      '  async selectCity(_value: string): Promise<void> {}',
      '  async selectProduct(_value: string): Promise<void> {}',
      '  async selectColors(_value: string): Promise<void> {}',
      '}',
    ].join('\n');
    expect(renderPageObject('shop', null, facets, overrides).text).not.toContain('selectCustomOption');
  });
});
