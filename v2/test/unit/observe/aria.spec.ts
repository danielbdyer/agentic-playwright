import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { capAriaText, captureAria, parseAriaSnapshot, redactAriaText } from '../../../src/observe/aria.js';
import { launch, openFixture } from './helpers.js';

describe('parseAriaSnapshot', () => {
  it('parses plain entries with names, attributes and inline text', () => {
    const entries = parseAriaSnapshot([
      '- banner:',
      '  - link "Home":',
      '    - /url: "#home"',
      '  - heading "Policy Search" [level=1]',
      '  - checkbox "Active only" [checked]',
      '  - text: Some text',
      '  - textbox "Notes": hello',
      '  - button',
    ].join('\n'));
    expect(entries.map((e) => [e.role, e.name, e.depth])).toEqual([
      ['banner', null, 0],
      ['link', 'Home', 1],
      ['heading', 'Policy Search', 1],
      ['checkbox', 'Active only', 1],
      ['textbox', 'Notes', 1],
      ['button', null, 1],
    ]);
    expect(entries[2]?.attributes).toEqual({ level: '1' });
    expect(entries[3]?.attributes).toEqual({ checked: true });
    expect(entries[4]?.text).toBe('hello');
  });

  it('parses single-quoted keys, doubled quotes and JSON escapes (the v1 parser dropped these)', () => {
    const entries = parseAriaSnapshot([
      `- 'button "Save: draft"'`,
      `- 'button "Item #3"' `,
      `- 'link "It''s {here}"':`,
      `- button "Line\\nbreak \\"quoted\\""`,
      `- 'heading "a: b" [level=2]': "x: y"`,
      `- cell "tab\\there \\x41"`,
    ].join('\n'));
    expect(entries.map((e) => e.name)).toEqual(['Save: draft', 'Item #3', "It's {here}", 'Line\nbreak "quoted"', 'a: b', 'tab\there A']);
    expect(entries[4]?.attributes).toEqual({ level: '2' });
    expect(entries[4]?.text).toBe('x: y');
  });

  it('reads regex names and skips comments', () => {
    const entries = parseAriaSnapshot('# truncated: 3 more lines\n- row /POL-\\d+/');
    expect(entries).toEqual([{ role: 'row', name: 'POL-\\d+', nameIsRegex: true, depth: 0, attributes: {} }]);
  });

  it('round-trips names Playwright renders from a real page', async () => {
    const browser = await launch();
    try {
      const page = await browser.newPage();
      await page.setContent(`<main>
        <button>Save: draft</button><button>Item #3</button><button>It's "quoted"</button>
        <a href="#">{braces}</a><h2>Trailing space </h2>
      </main>`);
      const entries = parseAriaSnapshot(await page.locator('main').ariaSnapshot());
      expect(entries.map((e) => `${e.role}:${e.name ?? ''}`)).toEqual([
        'main:',
        'button:Save: draft',
        'button:Item #3',
        `button:It's "quoted"`,
        'link:{braces}',
        'heading:Trailing space',
      ]);
    } finally {
      await browser.close();
    }
  });
});

describe('redactAriaText and capAriaText', () => {
  it('redacts line by line and masks typed values', () => {
    const text = '- row "Jane jane@x.com 555-123-4567"\n- textbox "Notes": secret words\n- \'textbox "Note: x"\': typed\n- button "Go"';
    expect(redactAriaText(text, 'standard')).toBe('- row "Jane <email> <phone>"\n- textbox "Notes": <value>\n- \'textbox "Note: x"\': <value>\n- button "Go"');
    // Typed values are masked in every mode; 'off' only stops the PII rules on names.
    expect(redactAriaText(text, 'off')).toBe('- row "Jane jane@x.com 555-123-4567"\n- textbox "Notes": <value>\n- \'textbox "Note: x"\': <value>\n- button "Go"');
  });

  it('caps on a line boundary, marker included in the budget', () => {
    const lines = Array.from({ length: 50 }, (_v, i) => `- button "Button number ${i}"`);
    const text = lines.join('\n');
    const capped = capAriaText(text, 300);
    expect(capped.truncated).toBe(true);
    expect(capped.bytes).toBeLessThanOrEqual(300);
    const kept = capped.text.split('\n');
    expect(kept.at(-1)).toMatch(/^# truncated: \d+ more lines \(cap 300 bytes\)$/);
    kept.slice(0, -1).forEach((line, i) => expect(line).toBe(lines[i]));
    expect(capAriaText(text, 100_000)).toEqual({ text, truncated: false, bytes: Buffer.byteLength(text) });
  });
});

describe('captureAria', () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await launch();
    page = await openFixture(browser);
  });
  afterAll(async () => {
    await browser.close();
  });

  it('captures a landmark, a block, and nothing for a missing scope', async () => {
    const search = await captureAria(page, { kind: 'landmark', role: 'search' }, { maxBytes: 10_000, pii: 'standard' });
    expect(search.text).toBe('- search:\n  - textbox "Search Policy"\n  - button "Search"\n  - text: Filter');
    const block = await captureAria(page, { kind: 'block', name: 'DetailsForm' }, { maxBytes: 10_000, pii: 'standard' });
    expect(block.text).toContain('- textbox "Notes": <value>');
    expect(block.text).not.toContain('secret');
    const missing = await captureAria(page, { kind: 'landmark', role: 'complementary' }, { maxBytes: 10_000, pii: 'standard' });
    expect(missing).toEqual({ text: '', truncated: false, bytes: 0 });
  });
});
