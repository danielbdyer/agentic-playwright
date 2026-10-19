import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import { classifyPlaywrightError, stripAnsi, summarizeExpectMessage } from '../../../src/act/classify.js';
import { expect as pwExpect } from '@playwright/test';

/** Run a Playwright call that must fail and return what it threw. */
const thrown = async (call: () => Promise<unknown>): Promise<unknown> => {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to throw');
};

const timeoutError = (log: readonly string[]): Error => {
  const error = new Error(['locator.click: Timeout 500ms exceeded.', 'Call log:', ...log.map((l) => `\u001b[2m${l}\u001b[22m`)].join('\n'));
  error.name = 'TimeoutError';
  return error;
};

describe('classifyPlaywrightError (synthetic messages)', () => {
  it('strips ANSI codes', () => {
    expect(stripAnsi('\u001b[2m  - waiting for x\u001b[22m')).toBe('  - waiting for x');
  });

  it('keeps a ToolError family', () => {
    expect(classifyPlaywrightError(new ToolError('ambiguous', 'two matches'))).toEqual({ family: 'ambiguous', message: 'two matches' });
  });

  it('uses the most recent state line of a timeout call log', () => {
    const error = timeoutError([
      '  - waiting for locator(\'#x\')',
      '    - locator resolved to <button id="x">X</button>',
      '    2 × waiting for element to be visible, enabled and stable',
      '      - element is not visible',
      '    - retrying click action',
      '      - <div class="overlay"></div> intercepts pointer events',
      '    - waiting 500ms',
    ]);
    const result = classifyPlaywrightError(error);
    expect(result.family).toBe('not-visible');
    expect(result.message).toBe('locator.click: Timeout 500ms exceeded. (<div class="overlay"></div> intercepts pointer events)');
  });

  it('classifies an unresolved locator wait as not-found and quotes the locator', () => {
    const result = classifyPlaywrightError(timeoutError(["  - waiting for getByRole('button', { name: 'Nope' })"]));
    expect(result).toEqual({ family: 'not-found', message: "locator.click: Timeout 500ms exceeded. (waiting for getByRole('button', { name: 'Nope' }))" });
  });

  it('falls back to timeout with the last informative line', () => {
    const result = classifyPlaywrightError(
      timeoutError(['  - waiting for locator(\'a\')', '    - locator resolved to <a>Go</a>', '    - click action done', '    - waiting for scheduled navigations to finish']),
    );
    expect(result.family).toBe('timeout');
    expect(result.message).toContain('waiting for scheduled navigations to finish');
  });

  it('maps closed targets, browser loss, and network errors to unavailable', () => {
    const closed = new Error('locator.click: Target page, context or browser has been closed');
    closed.name = 'TargetClosedError';
    expect(classifyPlaywrightError(closed).family).toBe('unavailable');
    expect(classifyPlaywrightError(new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:9/')).family).toBe('unavailable');
    expect(classifyPlaywrightError(new Error('browserType.connectOverCDP: connect ECONNREFUSED 127.0.0.1:9222')).family).toBe('unavailable');
  });

  it('maps an invalid navigation URL to invalid-input and anything unknown to unclassified', () => {
    expect(classifyPlaywrightError(new Error('page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL')).family).toBe('invalid-input');
    expect(classifyPlaywrightError(new Error('something odd happened')).family).toBe('unclassified');
    expect(classifyPlaywrightError('a bare string').family).toBe('unclassified');
    expect(classifyPlaywrightError({ message: 'net::ERR_ABORTED' }).family).toBe('unavailable');
  });

  it('caps long messages', () => {
    const result = classifyPlaywrightError(new Error('x'.repeat(5000)));
    expect(result.message.length).toBeLessThanOrEqual(601);
  });
});

describe('classifyPlaywrightError (real Chromium errors)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
    await page.setContent(`
      <main>
        <button style="display:none">Hidden</button>
        <button disabled>Disabled</button>
        <fieldset disabled><button>Inside</button></fieldset>
        <button>Dup</button><button>Dup</button>
        <div id="div">plain div</div>
        <input aria-label="ro" readonly value="x">
        <select aria-label="sel"><option>One</option></select>
        <button id="covered" style="position:absolute;top:300px;left:10px">Covered</button>
        <div style="position:absolute;top:290px;left:0;width:300px;height:60px;z-index:10"></div>
        <div id="spin" style="position:absolute;top:500px;animation:spin .1s linear infinite">Spin</div>
        <style>@keyframes spin { from { transform: translateX(0) } to { transform: translateX(100px) } }</style>
      </main>`);
  });

  afterAll(async () => {
    await browser.close();
  });

  const cases: ReadonlyArray<readonly [string, () => Promise<unknown>, string]> = [
    ['missing element', () => page.getByRole('button', { name: 'Nope' }).click({ timeout: 300 }), 'not-found'],
    ['hidden element', () => page.getByText('Hidden').click({ timeout: 300 }), 'not-visible'],
    ['disabled button', () => page.getByRole('button', { name: 'Disabled' }).click({ timeout: 300 }), 'not-enabled'],
    ['disabled fieldset', () => page.getByRole('button', { name: 'Inside' }).click({ timeout: 300 }), 'not-enabled'],
    ['read-only input', () => page.getByLabel('ro').fill('y', { timeout: 300 }), 'not-enabled'],
    ['covered by an overlay', () => page.locator('#covered').click({ timeout: 600 }), 'not-visible'],
    ['never stable', () => page.locator('#spin').click({ timeout: 600 }), 'timeout'],
    ['strict mode violation', () => page.getByRole('button', { name: 'Dup' }).click({ timeout: 300 }), 'ambiguous'],
    ['fill on a div', () => page.locator('#div').fill('x', { timeout: 300 }), 'assertion-like'],
    ['check on a div', () => page.locator('#div').check({ timeout: 300 }), 'assertion-like'],
    ['selectOption on a div', () => page.locator('#div').selectOption('x', { timeout: 300 }), 'assertion-like'],
    ['missing option', () => page.getByLabel('sel').selectOption({ label: 'Two' }, { timeout: 300 }), 'assertion-like'],
    ['unknown key', () => page.keyboard.press('Submit'), 'assertion-like'],
    ['failed expect', () => pwExpect(page.locator('#div')).toHaveText('other', { timeout: 200 }), 'assertion-like'],
    ['invalid URL', () => page.goto('not a url', { timeout: 1000 }), 'invalid-input'],
  ];

  for (const [label, call, family] of cases) {
    it(`${label} → ${family}`, async () => {
      const result = classifyPlaywrightError(await thrown(call));
      expect(result.family).toBe(family);
      expect(result.message).not.toMatch(/\u001b\[/);
      expect(result.message.split('\n')).toHaveLength(1);
    });
  }

  it('summarizes a failed expect with its Expected/Received lines', async () => {
    const error = await thrown(() => pwExpect(page.locator('#div')).toHaveText('other', { timeout: 200 }));
    const summary = summarizeExpectMessage(error);
    expect(summary).toContain('toHaveText');
    expect(summary).toBe('expect(locator).toHaveText(expected) failed; Expected: "other"; Received: "plain div"');
  });

  it('summarizes state matchers, regex expectations, and missing elements', async () => {
    const hidden = await thrown(() => pwExpect(page.getByText('Hidden')).toBeVisible({ timeout: 200 }));
    expect(summarizeExpectMessage(hidden)).toBe('expect(locator).toBeVisible() failed; Expected: "visible"; Received: "hidden"');
    const url = await thrown(() => pwExpect(page).toHaveURL(/zzz/, { timeout: 200 }));
    expect(summarizeExpectMessage(url)).toBe('expect(page).toHaveURL(expected) failed; Expected: /zzz/; Received: "about:blank"');
    const missing = await thrown(() => pwExpect(page.locator('#nope')).toHaveText('x', { timeout: 200 }));
    expect(summarizeExpectMessage(missing)).toContain('Received: <element(s) not found>');
  });

  it('falls back to the printed Expected/Received lines without a matcherResult', () => {
    const error = new Error('expect(locator).toHaveValue(expected) failed\n\nLocator: x\nExpected string: "a"\nReceived string: "b"\nTimeout: 5ms');
    expect(summarizeExpectMessage(error)).toBe('expect(locator).toHaveValue(expected) failed; Expected string: "a"; Received string: "b"');
  });

  it('a closed page → unavailable', async () => {
    const doomed = await browser.newPage();
    await doomed.close();
    const result = classifyPlaywrightError(await thrown(() => doomed.locator('body').click({ timeout: 300 })));
    expect(result.family).toBe('unavailable');
  });
});
