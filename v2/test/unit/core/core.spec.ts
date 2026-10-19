import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { redact, redactText, redactUrl, redactDeep } from '../../../src/core/pii.js';
import { tokenize, phraseSimilarity, slugify, camelCase, pascalCase, quote, stripHtml } from '../../../src/core/text.js';
import { stableStringify, fingerprintOf, newId } from '../../../src/core/hash.js';
import { renderLocator, toPlaywrightLocator, substituteParams, locatorParams } from '../../../src/locator/locator.js';
import { buildReceipt } from '../../../src/receipts/receipts.js';
import { replaceRegion, toolTable, renderSkill, driftedFiles, writeGenerated } from '../../../src/tools/generate.js';
import { loadWorkspace, resolveInside } from '../../../src/workspace/workspace.js';
import { loadProfile, resolveUrl } from '../../../src/workspace/profiles.js';
import { ToolError } from '../../../src/core/errors.js';

describe('pii', () => {
  it('redacts substrings by type and keeps the rest', () => {
    expect(redact('Customer jane.doe@example.com called 555-123-4567', 'standard')).toBe('Customer <email> called <phone>');
    expect(redact('Account 123456789012 for POL-001', 'standard')).toBe('Account <number> for POL-001');
    expect(redact('SSN 123-45-6789', 'standard')).toBe('SSN <ssn>');
    expect(redact('Order 4821 shipped', 'standard')).toBe('Order 4821 shipped');
    expect(redact('Order 4821 shipped', 'strict')).toBe('Order <number> shipped');
    expect(redact('jane@example.com', 'off')).toBe('jane@example.com');
    expect(redactText('a@b.co and c@d.io', 'standard').redacted).toEqual(['email', 'email']);
  });

  it('redacts query values and fragments in URLs', () => {
    expect(redactUrl('https://app.example.com/App/Detail?id=123&email=a@b.co#top', 'standard')).toBe(
      'https://app.example.com/App/Detail?id=<redacted>&email=<redacted>#<redacted>',
    );
    expect(redactUrl('https://app.example.com/App/PolicySearch', 'standard')).toBe('https://app.example.com/App/PolicySearch');
  });

  it('redacts deeply and never rewrites keys', () => {
    expect(redactDeep({ 'a@b.co': ['x@y.io', 1] }, 'standard')).toEqual({ 'a@b.co': ['<email>', 1] });
  });

  it('scrubs secrets from receipts whatever the PII mode', () => {
    const receipt = buildReceipt(
      { at: 't', session: 's', tool: 'flow.run', input: { name: 'login', params: { password: 'hunter2' }, token: 'abc' }, outcome: 'succeeded', durationMs: 1 },
      'off',
    );
    expect(receipt.input).toEqual({ name: 'login', params: '<secret>', token: '<secret>' });
  });
});

describe('text', () => {
  it('tokenizes with stopwords, stemming, and camelCase splitting', () => {
    expect(tokenize('Enter the policyNumber in the search fields')).toEqual(['enter', 'policy', 'number', 'search', 'field']);
  });

  it('scores phrases by coverage, tempered by Jaccard', () => {
    expect(phraseSimilarity('Search Policy', 'Search Policy')).toBe(1);
    expect(phraseSimilarity('search field', 'Search Policy')).toBeGreaterThan(phraseSimilarity('search field', 'Claims'));
    expect(phraseSimilarity('', 'x')).toBe(0);
  });

  it('builds slugs and identifiers safely', () => {
    expect(slugify('Verify policy search returns matching policy')).toBe('verify-policy-search-returns-matching-policy');
    expect(camelCase('policy-number-input')).toBe('policyNumberInput');
    expect(camelCase('3rd party')).toBe('_3rdParty');
    expect(pascalCase('policy-search')).toBe('PolicySearch');
    expect(quote("it's\nfine")).toBe("'it\\'s\\nfine'");
    expect(quote('a b')).toBe("'a\\u2028b'");
  });

  it('strips tags before decoding entities', () => {
    expect(stripHtml('<P>Verify amount &gt; 0 and &lt; 100</P>')).toBe('Verify amount > 0 and < 100');
    expect(stripHtml('<div>Enter &lt;username&gt;</div><div>then</div>')).toBe('Enter <username> then');
  });
});

describe('hash', () => {
  it('is order-insensitive for keys and stable for dates', () => {
    expect(stableStringify({ b: 1, a: [2, undefined] })).toBe('{"a":[2,null],"b":1}');
    expect(stableStringify({ at: new Date(0) })).toBe('{"at":"1970-01-01T00:00:00.000Z"}');
    expect(fingerprintOf({ a: 1, b: 2 })).toBe(fingerprintOf({ b: 2, a: 1 }));
    expect(newId('ev', new Date('2026-10-19T05:00:00Z'))).toMatch(/^ev-20261019050000-[0-9a-f]{8}$/);
  });
});

describe('locator', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(`
      <header role="banner"><nav><a href="#">Policy Search</a></nav></header>
      <main>
        <h1>Policy Search</h1><h2>Policy Search Results</h2>
        <div role="search" data-block="Policy.SearchBlock">
          <input placeholder="Search Policy" id="b3-Input_Search"><button>Search</button>
          <span os-test-id="FilterToggle">Filter</span>
        </div>
        <label for="n">Notes</label><textarea id="n"></textarea>
        <table><tr><td>POL-001</td><td><a href="#">Edit</a></td></tr><tr><td>POL-002</td><td><a href="#">Edit</a></td></tr></table>
      </main>`);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('renders the expression the page object will contain', () => {
    expect(renderLocator({ strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } }, { root: 'this.page' })).toBe(
      "this.page.getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })",
    );
    expect(renderLocator({ strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } }, { root: 'this.page', params: 'identifiers' })).toBe(
      "this.page.getByRole('main').getByRole('row').filter({ hasText: policyNumber })",
    );
    expect(renderLocator({ strategy: 'text', value: 'POL-{n}' }, { params: 'identifiers' })).toBe('page.getByText(`POL-${n}`, { exact: true })');
    expect(renderLocator({ strategy: 'test-id', value: 'FilterToggle', attribute: 'os-test-id' })).toBe(
      'page.locator(\'[os-test-id="FilterToggle"]\')',
    );
    expect(renderLocator({ strategy: 'role-name', role: 'link', name: 'Edit', scope: { rowText: '{policyNumber}' } }, { params: { policyNumber: 'POL-002' } })).toBe(
      "page.getByRole('row').filter({ hasText: 'POL-002' }).getByRole('link', { name: 'Edit', exact: true })",
    );
  });

  it('compiles to live locators that resolve exactly the intended element', async () => {
    const count = async (spec: Parameters<typeof toPlaywrightLocator>[1], params?: Record<string, string>): Promise<number> =>
      toPlaywrightLocator(page, spec, params).count();
    expect(await count({ strategy: 'role-name', role: 'heading', name: 'Policy Search' })).toBe(1);
    expect(await count({ strategy: 'role-name', role: 'heading', name: 'Policy Search', exact: false })).toBe(2);
    expect(await count({ strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } })).toBe(1);
    expect(await count({ strategy: 'placeholder', value: 'Search Policy' })).toBe(1);
    expect(await count({ strategy: 'label', value: 'Notes' })).toBe(1);
    expect(await count({ strategy: 'test-id', value: 'FilterToggle', attribute: 'os-test-id' })).toBe(1);
    expect(await count({ strategy: 'css', value: '#b3-Input_Search' })).toBe(1);
    expect(await count({ strategy: 'role-name', role: 'link', name: 'Edit' })).toBe(2);
    expect(await count({ strategy: 'role-name', role: 'link', name: 'Edit', scope: { rowText: '{p}' } }, { p: 'POL-002' })).toBe(1);
    expect(await count({ strategy: 'row-text', value: 'POL-001' })).toBe(1);
    expect(await count({ strategy: 'role-name', role: 'textbox', scope: { dataBlock: 'Policy.SearchBlock' } })).toBe(1);
  });

  it('matches a row by a whole cell when rowExact is set, so prefixes do not collide', async () => {
    const other = await browser.newPage();
    await other.setContent('<table><tr><td>POL-30</td><td><a href="#">Edit</a></td></tr><tr><td>POL-300</td><td><a href="#">Edit</a></td></tr></table>');
    const substring = { strategy: 'role-name' as const, role: 'link', name: 'Edit', scope: { rowText: 'POL-30' } };
    expect(await toPlaywrightLocator(other, substring).count()).toBe(2);
    const exact = { ...substring, scope: { rowText: 'POL-30', rowExact: true } };
    expect(await toPlaywrightLocator(other, exact).count()).toBe(1);
    expect(renderLocator(exact, { root: 'this.page' })).toBe(
      "this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: 'POL-30', exact: true }) }).getByRole('link', { name: 'Edit', exact: true })",
    );
    await other.close();
  });

  it('refuses missing parameters and reports the ones a spec uses', () => {
    expect(() => substituteParams('{x}', {})).toThrow(ToolError);
    expect(locatorParams({ strategy: 'role-name', role: 'link', name: 'Edit', scope: { rowText: '{policyNumber}' } })).toEqual(['policyNumber']);
  });
});

describe('workspace and profiles', () => {
  it('loads config, profiles, and refuses paths that escape the root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tqa-ws-'));
    try {
      await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
      await writeFile(path.join(root, '.tesseract', 'config.json'), JSON.stringify({ testsDir: 'e2e', observe: { maxCandidates: 50 } }));
      await writeFile(path.join(root, '.tesseract', 'profiles', 'qa.json'), JSON.stringify({ baseURL: 'https://qa.example.com/App/' }));
      const ws = await loadWorkspace(root, { AZURE_DEVOPS_PROJECT: 'Fabrikam' });
      expect(ws.config.testsDir).toBe('e2e');
      expect(ws.config.observe.maxCandidates).toBe(50);
      expect(ws.config.observe.maxAriaBytes).toBe(32 * 1024);
      expect(ws.config.ado.project).toBe('Fabrikam');
      expect(ws.paths.tests).toBe(path.join(root, 'e2e'));
      expect(() => resolveInside(ws, '../etc/passwd')).toThrow(ToolError);
      const profile = await loadProfile(ws, 'qa', {});
      expect(profile?.baseURL).toBe('https://qa.example.com/App/');
      expect(resolveUrl('PolicySearch', profile)).toBe('https://qa.example.com/App/PolicySearch');
      expect(resolveUrl('/PolicySearch', profile)).toBe('https://qa.example.com/App/PolicySearch');
      expect(resolveUrl('https://other.example.com/', profile)).toBe('https://other.example.com/');
      const overridden = await loadProfile(ws, 'qa', { TESSERACT_BASE_URL: 'https://preview-42.example.com/App/' });
      expect(overridden?.baseURL).toBe('https://preview-42.example.com/App/');
      await expect(loadProfile(ws, 'missing', {})).rejects.toThrow(/profile not found/);
      await expect(loadProfile(ws, '../x', {})).rejects.toThrow(/invalid profile name/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('generation from the declaration', () => {
  it('replaces only the marked region', () => {
    const doc = 'a\n<!-- tesseract:generated:tools:start -->\nold\n<!-- tesseract:generated:tools:end -->\nb\n';
    expect(replaceRegion(doc, 'new', 'x.md')).toBe('a\n<!-- tesseract:generated:tools:start -->\nnew\n<!-- tesseract:generated:tools:end -->\nb\n');
    expect(() => replaceRegion('no markers', 'x', 'x.md')).toThrow(/markers/);
  });

  it('lists all sixteen tools in the table and frames the skill', () => {
    const table = toolTable();
    expect(table.split('\n').filter((l) => l.startsWith('| `'))).toHaveLength(16);
    expect(table).toMatch(/\| `app\.open` \| `app_open` \| A \|/);
    expect(renderSkill('# P\n')).toMatch(/^---\nname: tesseract-qa\ndescription: /);
  });

  it('detects drift and regenerates in a scratch copy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tqa-gen-'));
    try {
      const marker = '<!-- tesseract:generated:tools:start -->\n<!-- tesseract:generated:tools:end -->\n';
      await writeFile(path.join(root, 'PLAYBOOK.md'), `# Playbook\n\n${marker}`);
      await writeFile(path.join(root, 'README.md'), `# Readme\n\n${marker}`);
      expect((await driftedFiles(root)).map((f) => path.basename(f)).sort()).toEqual(['PLAYBOOK.md', 'README.md', 'SKILL.md']);
      await writeGenerated(root);
      expect(await driftedFiles(root)).toEqual([]);
      const skill = await readFile(path.join(root, 'plugin', 'skills', 'tesseract-qa', 'SKILL.md'), 'utf8');
      expect(skill).toMatch(/app_observe/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
