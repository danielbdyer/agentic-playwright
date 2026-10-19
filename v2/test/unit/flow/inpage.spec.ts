/**
 * The in-page recorder on its own, with a fake binding: which user input
 * becomes which event, which is suppressed, and which values never leave
 * the page.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { ActionEventSchema, RECORDER_BINDING, RECORDER_SCRIPT, recorderCall, type ActionEvent } from '../../../src/flow/index.js';

const HTML = `<!doctype html><html><head><title>Form</title></head><body>
<main>
  <form id="f" onsubmit="event.preventDefault(); window.__submitted = (window.__submitted || 0) + 1;">
    <label for="name">Name</label><input id="name" type="text">
    <label><input id="remember" type="checkbox"> Remember me</label>
    <label for="pw">Password</label><input id="pw" type="password">
    <label for="card">Card number</label><input id="card" type="text" autocomplete="cc-number">
    <label for="holder">Card holder</label><input id="holder" type="text">
    <label for="status">Status</label><select id="status"><option>Open</option><option value="c">Closed</option></select>
    <button id="save" type="submit"><span id="save-label">Save</span></button>
  </form>
  <button id="trigger" type="button" onclick="document.getElementById('hidden-target').click()">Trigger</button>
  <button id="hidden-target" type="button" style="display:none">Hidden</button>
  <div id="plain">Just text</div>
</main>
</body></html>`;

let browser: Browser;
let page: Page;
let events: ActionEvent[];

const actions = (): readonly (readonly [string, string | null, string | null])[] =>
  events.map((e) => [e.action, e.descriptor?.name ?? null, e.secret === true ? '<secret>' : e.value ?? e.key ?? null]);

const settled = async (count: number): Promise<void> => {
  await expect.poll(() => events.length, { timeout: 5_000 }).toBeGreaterThanOrEqual(count);
  await page.waitForTimeout(150);
};

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  events = [];
  page = await browser.newPage();
  await page.exposeBinding(RECORDER_BINDING, (_source, message: { readonly type: string }) => {
    if (message.type === 'hello') return { active: true, token: 'tok', redact: ['card holder'] };
    const parsed = ActionEventSchema.safeParse(message);
    if (parsed.success) events.push(parsed.data);
    return null;
  });
  await page.addInitScript(RECORDER_SCRIPT);
  await page.route('http://recorder.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('http://recorder.test/form');
  await expect.poll(() => page.evaluate(recorderCall('status'))).toMatchObject({ configured: true, active: true });
});

describe('the in-page recorder', () => {
  it('reports a checkbox once, as check, whether its box or its label was clicked', async () => {
    await page.getByText('Remember me').click();
    await page.locator('#remember').click();
    await settled(2);
    expect(actions()).toEqual([
      ['check', 'Remember me', null],
      ['uncheck', 'Remember me', null],
    ]);
  });

  it('leaves clicks that only focus a field to the fill, and sends the final value once', async () => {
    await page.getByText('Name', { exact: true }).click();
    await page.locator('#name').click();
    await page.locator('#name').pressSequentially('Ada L', { delay: 10 });
    await page.locator('#name').press('Backspace');
    await page.locator('#name').press('Backspace');
    await page.locator('#plain').click();
    await settled(1);
    expect(actions()).toEqual([['fill', 'Name', 'Ada']]);
    expect(events[0]!.token).toBe('tok');
  });

  it('records Enter after the fill it ends, and not the click the browser synthesizes for it', async () => {
    await page.locator('#name').fill('Ada');
    await page.locator('#name').press('Enter');
    await settled(2);
    expect(await page.evaluate('window.__submitted')).toBe(1);
    expect(actions()).toEqual([
      ['fill', 'Name', 'Ada'],
      ['press', 'Name', 'Enter'],
    ]);
  });

  it('reports a click on the control around what was hit, and ignores clicks scripts make', async () => {
    await page.locator('#save-label').click();
    await page.locator('#trigger').click();
    await settled(2);
    expect(actions()).toEqual([
      ['click', 'Save', null],
      ['click', 'Trigger', null],
    ]);
    expect(events[0]!.descriptor).toMatchObject({ role: 'button', tag: 'button', landmark: 'main' });
  });

  it('never sends the text of password, card, or redacted fields', async () => {
    await page.locator('#pw').fill('hunter2');
    await page.locator('#card').fill('4111111111111111');
    await page.locator('#holder').fill('Ada Lovelace');
    await page.locator('#plain').click();
    await settled(3);
    expect(actions()).toEqual([
      ['fill', 'Password', '<secret>'],
      ['fill', 'Card number', '<secret>'],
      ['fill', 'Card holder', '<secret>'],
    ]);
    expect(JSON.stringify(events)).not.toMatch(/hunter2|4111|Lovelace/);
  });

  it('reports a select by its option label, and Shift+Tab as one key', async () => {
    await page.locator('#status').selectOption('c');
    await page.locator('#status').press('Shift+Tab');
    await settled(2);
    expect(actions()).toEqual([
      ['select', 'Status', 'Closed'],
      ['press', 'Status', 'Shift+Tab'],
    ]);
  });

  it('reports a field left mid-typing after the idle delay', async () => {
    await page.locator('#name').fill('Grace');
    await settled(1);
    expect(actions()).toEqual([['fill', 'Name', 'Grace']]);
  });

  it('buffers until told whether it is recording, and goes quiet when told it is not', async () => {
    await page.evaluate(recorderCall('configure', { active: false }));
    await page.locator('#save').click();
    await page.waitForTimeout(200);
    expect(events).toEqual([]);
    await page.evaluate(recorderCall('configure', { active: true, token: 'tok2' }));
    await page.locator('#save').click();
    await settled(1);
    expect(events.map((e) => e.token)).toEqual(['tok2']);
  });

  it('is installed once per document', async () => {
    await page.evaluate(RECORDER_SCRIPT);
    await page.locator('#save').click();
    await settled(1);
    expect(events).toHaveLength(1);
  });
});
