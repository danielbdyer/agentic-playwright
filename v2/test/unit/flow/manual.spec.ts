/**
 * stopOn "manual": the recorder injects a Stop button (a closed shadow root
 * on a host marked data-tesseract-ignore), observation does not see it, and
 * pressing it ends the recording with whatever was typed so far.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ToolOutput } from '../../../src/contract/tools.js';
import { IGNORE_ATTRIBUTE, waitForRecording } from '../../../src/flow/index.js';
import { awaitHydration, observePage } from '../../../src/observe/index.js';
import type { Runtime } from '../../../src/tools/runtime.js';
import { loadProfile } from '../../../src/workspace/profiles.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { flowRuntime, removeWorkspace, tempWorkspace, writeProfile } from './helpers.js';

let app: FixtureApp;
let workspace: Workspace;
let runtime: Runtime;

beforeAll(async () => {
  app = await startFixtureApp();
  workspace = await tempWorkspace();
  await writeProfile(workspace, 'qa', { baseURL: app.baseURL });
  runtime = flowRuntime(workspace, {});
});

afterAll(async () => {
  await runtime.close();
  await app.close();
  await removeWorkspace(workspace);
});

describe('flow.record with stopOn manual', () => {
  it('shows a Stop button observation ignores, and stops when it is pressed', async () => {
    const handle = await runtime.ctx.browser.open({ url: `${app.baseURL}Login`, profile: await loadProfile(workspace, 'qa', {}) });
    const page = handle.page;
    await awaitHydration(page, { budgetMs: 5_000 });
    const before = await observePage(page, { pageId: handle.pageId });

    const pending = runtime.invoke('flow.record', { name: 'sign-in', pageId: handle.pageId, stopOn: 'manual', timeoutMs: 60_000 });
    await waitForRecording(page);
    const host = page.locator(`[${IGNORE_ATTRIBUTE}]`);
    await expect.poll(() => host.count()).toBe(1);

    // The walker skips the host: same candidates, same fingerprint as before the button appeared.
    const during = await observePage(page, { pageId: handle.pageId });
    expect(during.snapshot.candidates.map((c) => `${c.role}:${c.name}`)).toEqual(before.snapshot.candidates.map((c) => `${c.role}:${c.name}`));
    expect(during.snapshot.candidates.some((c) => /stop/i.test(c.name))).toBe(false);
    expect(during.record.fingerprint.hash).toBe(before.record.fingerprint.hash);
    // Its button lives in a closed shadow root: page locators cannot reach it.
    expect(await page.getByRole('button', { name: 'Stop recording' }).count()).toBe(0);

    await page.fill('#b2-Input_Username', 'qa.user');
    const box = await host.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const result = await pending;
    if (!result.ok) throw new Error(result.error.message);
    const out = result.output as ToolOutput<'flow.record'>;
    expect(out.stoppedBy).toBe('manual');
    // The value still being typed when Stop was pressed is part of the recording; the Stop click is not.
    expect(out.steps.map((s) => [s.action, s.facetId ?? null, s.value ?? null])).toEqual([
      ['navigate', null, null],
      ['fill', 'login:username', '{username}'],
    ]);
    // The button is gone once the recording ends; the page stays open (it was not flow.record's to close).
    await expect.poll(() => host.count()).toBe(0);
    expect(page.isClosed()).toBe(false);
  }, 60_000);

  it('records nothing and writes nothing when stopped before any action', async () => {
    const handle = await runtime.ctx.browser.open({ url: `${app.baseURL}Login`, profile: await loadProfile(workspace, 'qa', {}) });
    await awaitHydration(handle.page, { budgetMs: 5_000 });
    const pending = runtime.invoke('flow.record', { name: 'empty', pageId: handle.pageId, stopOn: 'manual', timeoutMs: 2_000 });
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.family).toBe('timeout');
    expect(result.error.message).toContain('not written');
  }, 30_000);

  it('refuses stopOn steps without maxSteps, and a second recording on the same page', async () => {
    const handle = await runtime.ctx.browser.open({ url: `${app.baseURL}Login`, profile: await loadProfile(workspace, 'qa', {}) });
    const missing = await runtime.invoke('flow.record', { name: 'x', pageId: handle.pageId, stopOn: 'steps' });
    expect(missing.ok ? null : missing.error.family).toBe('invalid-input');

    const first = runtime.invoke('flow.record', { name: 'first', pageId: handle.pageId, stopOn: 'manual', timeoutMs: 3_000 });
    await waitForRecording(handle.page);
    const second = await runtime.invoke('flow.record', { name: 'second', pageId: handle.pageId, stopOn: 'manual', timeoutMs: 3_000 });
    expect(second.ok ? null : second.error.family).toBe('invalid-input');
    await first;
  }, 30_000);
});
