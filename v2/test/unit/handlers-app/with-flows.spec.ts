/**
 * app.* and memory.* with the real flow handlers (another slice): the agent
 * drives app.act while flow.record observes the same page (the recorder
 * swaps the ref registry while it looks, which app.act's candidate
 * resolution must survive), then app.open signs in with the recorded login
 * flow, and preflight judges the flow by its facets.
 */
import { promises as fs } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { createHandlers } from '../../../src/tools/handlers/index.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { makeHarness, makeWorkspace, refOf, removeWorkspace, type Harness } from './helpers.js';

describe('app.* and memory.* with flow.record and flow.run', () => {
  let app: FixtureApp;
  let workspace: Workspace;
  let h: Harness;

  beforeAll(async () => {
    app = await startFixtureApp();
    workspace = await makeWorkspace({ qa: { baseURL: app.baseURL, loginFlow: 'login' } });
    h = makeHarness(workspace, createHandlers(), { TESSERACT_PARAM_USERNAME: 'qa.user', TESSERACT_PARAM_PASSWORD: 'correct-horse' });
  });

  afterAll(async () => {
    await h?.close();
    await app?.close();
    if (workspace !== undefined) await removeWorkspace(workspace);
  });

  it('acts on candidates of one snapshot while a recording observes the page', async () => {
    const opened = await h.call('app.open', { url: 'Login', profile: 'qa', auth: 'none' });
    const pageId = opened.pageId;
    const recording = h.call('flow.record', { name: 'login', pageId, profile: 'qa', stopOn: 'urlChange', timeoutMs: 60_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const snap = await h.call('app.observe', { pageId });
    const acts = [
      await h.call('app.act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Username') }, value: '@username', params: { username: 'qa.user' } }),
      await h.call('app.act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Password') }, value: '@password', params: { password: 'correct-horse' } }),
      await h.call('app.act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: refOf(snap, 'button', 'Log in') } }),
    ];
    expect(acts.map((a) => a.outcome)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    const recorded = await recording;
    expect(recorded.stoppedBy).toBe('urlChange');
  });

  it('opens a protected route by running the recorded login flow first', async () => {
    const opened = await h.call('app.open', { profile: 'qa', url: 'PolicySearch' });
    expect(opened.finalUrl).toBe(`${app.baseURL}PolicySearch`);
    expect(opened.title).toBe('Policy Search');
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  it('preflights the login screen and the login flow, and nothing secret is written', async () => {
    const result = await h.call('memory.preflight', { profile: 'qa', flows: ['login'] });
    const login = result.screens.find((s) => s.screen === 'login');
    expect(login?.status).toBe('ok');
    expect(result.flows).toEqual([{ id: 'login', status: 'ok' }]);
    expect(await fs.readFile(workspace.paths.authoringReceipts, 'utf8')).not.toContain('correct-horse');
  });
});
