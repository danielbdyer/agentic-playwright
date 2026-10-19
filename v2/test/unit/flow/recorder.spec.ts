/**
 * The recorder library against the fixture app's signed-in screens: key
 * presses, roleless clickables, checkboxes, native selects, navigations,
 * the redact list, an agent's registered snapshot surviving the recording,
 * and a recording replayed by the runner after persistFlow renders it.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserPool, PageHandle } from '../../../src/browser/types.js';
import { createBrowserPool } from '../../../src/browser/pool.js';
import { persistFlow, resolveFlowParams, runFlow, startRecording, type RecordOptions } from '../../../src/flow/index.js';
import { findFacet } from '../../../src/memory/index.js';
import { awaitHydration, observePage, resolveCandidateLocator, saveSnapshotRecord } from '../../../src/observe/index.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { grep, removeWorkspace, tempWorkspace } from './helpers.js';

let app: FixtureApp;
let workspace: Workspace;
let pool: BrowserPool;

beforeAll(async () => {
  app = await startFixtureApp();
  workspace = await tempWorkspace();
  pool = createBrowserPool({ userAgentSuffix: 'tesseract-qa-test', root: workspace.paths.root, headless: true });
});

afterAll(async () => {
  await pool.closeAll();
  await app.close();
  await removeWorkspace(workspace);
});

/** A signed-in page on `route`. */
const signedIn = async (route: string): Promise<PageHandle> => {
  const handle = await pool.open({});
  await handle.context.addCookies([{ name: 'session', value: 'ok', url: app.baseURL }]);
  await handle.page.goto(`${app.baseURL}${route}`);
  await awaitHydration(handle.page, { budgetMs: 5_000 });
  return handle;
};

const options = (handle: PageHandle, name: string, extra: Partial<RecordOptions> = {}): RecordOptions => ({
  workspace,
  page: handle.page,
  pageId: handle.pageId,
  name,
  baseURL: app.baseURL,
  stopOn: 'steps',
  maxSteps: 1,
  timeoutMs: 60_000,
  session: 's-recorder-test',
  ...extra,
});

describe('recording a search on Policy Search', () => {
  it('captures fill, Enter, a roleless clickable, a checkbox, and a button, and replays them', async () => {
    const handle = await signedIn('PolicySearch');
    const session = startRecording(options(handle, 'search', { maxSteps: 5 }));
    await session.ready;
    const page = handle.page;
    await page.getByPlaceholder('Search Policy').fill('POL-00');
    await page.getByPlaceholder('Search Policy').press('Enter');
    await page.getByText('Filter', { exact: true }).click();
    await page.getByLabel('Active only').check();
    await page.getByRole('button', { name: 'Search' }).click();
    const recorded = await session.done;

    expect(recorded.stoppedBy).toBe('steps');
    expect(recorded.actions).toBe(5);
    expect(recorded.recording.steps.map((s) => [s.action, s.facetId ?? null])).toEqual([
      ['navigate', null],
      ['fill', 'policy-search:search-policy'],
      ['press', 'policy-search:search-policy'],
      ['click', 'policy-search:filter'],
      ['check', 'policy-search:active-only'],
      ['click', 'policy-search:search'],
    ]);
    expect(recorded.recording.steps[2]?.value).toEqual({ literal: 'Enter' });
    expect(recorded.recording.params).toEqual([{ name: 'searchPolicy', secret: false, default: 'POL-00' }]);
    expect((await findFacet(workspace, 'policy-search:filter'))?.affordance).toBe('handler-owner');
    expect((await findFacet(workspace, 'policy-search:active-only'))?.role).toBe('checkbox');

    const persisted = await persistFlow(workspace, recorded.recording);
    expect(persisted.pageObjectPaths).toEqual(['pages/policy-search.page.ts']);
    const flow = await fs.readFile(path.join(workspace.paths.root, persisted.flowPath), 'utf8');
    expect(flow).toContain("await policySearch.searchPolicy.press('Enter');");
    expect(flow).toContain('await policySearch.activeOnly.check();');

    // Replay on a fresh signed-in page with a different search value.
    const replay = await signedIn('Dashboard');
    const result = await runFlow({
      workspace,
      page: replay.page,
      recording: recorded.recording,
      params: resolveFlowParams(recorded.recording, { searchPolicy: 'POL-003' }, {}),
      baseURL: app.baseURL,
    });
    expect(result.outcome).toBe('passed');
    expect(result.steps.map((s) => s.outcome)).toEqual(['passed', 'passed', 'passed', 'passed', 'passed', 'passed']);
    expect(replay.page.url()).toBe(`${app.baseURL}PolicySearch`);
    await expect.poll(() => replay.page.locator('#b3-Feedback').textContent()).toBe('1 policy found');
    expect(await replay.page.getByLabel('Active only').isChecked()).toBe(true);
  }, 90_000);
});

describe('the redact list', () => {
  it('turns the named field into a secret parameter whose text never leaves the page', async () => {
    const handle = await signedIn('PolicySearch');
    const session = startRecording(options(handle, 'secret-search', { redact: ['search policy'] }));
    await session.ready;
    await handle.page.getByPlaceholder('Search Policy').fill('TOP-SECRET-7731');
    await handle.page.getByPlaceholder('Search Policy').blur();
    const recorded = await session.done;
    expect(recorded.recording.params).toEqual([{ name: 'searchPolicy', secret: true }]);
    expect(recorded.recording.steps[1]?.value).toEqual({ param: 'searchPolicy', secret: true });
    await persistFlow(workspace, recorded.recording);
    expect(await grep(workspace.paths.root, 'TOP-SECRET-7731')).toEqual([]);
  }, 60_000);
});

describe('an agent driving the page while it is recorded', () => {
  it("keeps the agent's registered snapshot, and cites it as the evidence", async () => {
    const handle = await signedIn('PolicySearch');
    const page = handle.page;
    // The agent observed first: its snapshot is the one registered in the page.
    const agent = await observePage(page, { pageId: handle.pageId });
    await saveSnapshotRecord(workspace, agent.record);
    const search = agent.snapshot.candidates.find((c) => c.name === 'Search Policy')!;

    const session = startRecording(options(handle, 'agent-search', { maxSteps: 1 }));
    await session.ready;
    expect(await page.evaluate('window.__tesseract.snapshotId')).toBe(agent.snapshot.snapshotId);

    await page.getByPlaceholder('Search Policy').fill('POL-002');
    await page.getByPlaceholder('Search Policy').press('Tab');
    const recorded = await session.done;
    expect(recorded.recording.steps[1]).toMatchObject({ action: 'fill', facetId: 'policy-search:search-policy', snapshotId: agent.snapshot.snapshotId });
    // The recorder observed (and saved its snapshots) but put the agent's registry back, so its refs still resolve.
    expect(recorded.snapshots.length).toBeGreaterThan(0);
    expect(await page.evaluate('window.__tesseract.snapshotId')).toBe(agent.snapshot.snapshotId);
    expect((await resolveCandidateLocator(page, agent.snapshot.snapshotId, search.ref)).verified).toBe(true);
  }, 60_000);
});

describe('navigations and native selects', () => {
  it('records a navigation nobody clicked as a navigate step, and a select by its option label', async () => {
    const handle = await signedIn('PolicySearch');
    const session = startRecording(options(handle, 'claims', { maxSteps: 2 }));
    await session.ready;
    await handle.page.goto(`${app.baseURL}Claims`);
    await awaitHydration(handle.page, { budgetMs: 5_000 });
    await handle.page.selectOption('#b4-Status', 'Closed');
    const recorded = await session.done;
    expect(recorded.recording.steps.map((s) => [s.action, s.screen, s.url, s.facetId ?? null, s.value ?? null])).toEqual([
      ['navigate', 'policy-search', 'PolicySearch', null, null],
      ['navigate', 'claims', 'Claims', null, null],
      ['select', 'claims', 'Claims', 'claims:claim-status', { literal: 'Closed' }],
    ]);
    const persisted = await persistFlow(workspace, recorded.recording);
    expect(persisted.pageObjectPaths).toEqual(['pages/policy-search.page.ts', 'pages/claims.page.ts']);

    const replay = await signedIn('Dashboard');
    const result = await runFlow({ workspace, page: replay.page, recording: recorded.recording, params: {}, baseURL: app.baseURL });
    expect(result.outcome).toBe('passed');
    expect(await replay.page.locator('#b4-Count').textContent()).toBe('7 closed claims');
  }, 60_000);
});

describe('stopOn urlChange', () => {
  it('still records the click on a link that navigates at once, then a second recording on the same page works', async () => {
    const handle = await signedIn('PolicySearch');
    const first = startRecording(options(handle, 'to-claims', { stopOn: 'urlChange', maxSteps: undefined }));
    await first.ready;
    await handle.page.getByRole('navigation').getByRole('link', { name: 'Claims' }).click();
    const recorded = await first.done;
    expect(recorded.stoppedBy).toBe('urlChange');
    expect(recorded.recording.steps.map((s) => [s.action, s.facetId ?? null])).toEqual([
      ['navigate', null],
      ['click', 'policy-search:claims'],
    ]);
    expect((await findFacet(workspace, 'policy-search:claims'))?.scope?.landmark).toBe('navigation');

    // The page now shows Claims; record on it again (the binding and init script are already installed).
    await awaitHydration(handle.page, { budgetMs: 5_000 });
    const second = startRecording(options(handle, 'claims-filter', { maxSteps: 1 }));
    await second.ready;
    await handle.page.selectOption('#b4-Status', 'Closed');
    const again = await second.done;
    expect(again.recording.steps.map((s) => [s.action, s.screen])).toEqual([
      ['navigate', 'claims'],
      ['select', 'claims'],
    ]);
  }, 60_000);

  it('replays a navigate step that names a link facet by clicking the link', async () => {
    const replay = await signedIn('PolicySearch');
    const result = await runFlow({
      workspace,
      page: replay.page,
      recording: {
        name: 'via-link',
        steps: [{ index: 1, action: 'navigate', facetId: 'policy-search:claims', screen: 'policy-search', url: 'PolicySearch' }],
        params: [],
      },
      params: {},
      baseURL: app.baseURL,
    });
    expect(result.outcome).toBe('passed');
    await expect.poll(() => replay.page.url()).toBe(`${app.baseURL}Claims`);
  }, 30_000);
});

describe('stopping', () => {
  it('stops when the page closes, keeping what was recorded', async () => {
    const handle = await signedIn('PolicySearch');
    const session = startRecording(options(handle, 'closing', { stopOn: 'manual', maxSteps: undefined }));
    await session.ready;
    await handle.page.getByRole('button', { name: 'Search' }).click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await handle.page.close();
    const recorded = await session.done;
    expect(recorded.stoppedBy).toBe('closed');
    expect(recorded.recording.steps.map((s) => s.action)).toEqual(['navigate', 'click']);
  }, 60_000);

  it('stops on the timeout', async () => {
    const handle = await signedIn('PolicySearch');
    const recorded = await startRecording(options(handle, 'idle', { stopOn: 'manual', maxSteps: undefined, timeoutMs: 1_000 })).done;
    expect(recorded.stoppedBy).toBe('timeout');
    expect(recorded.actions).toBe(0);
  }, 30_000);

  it('stops when told to from Node', async () => {
    const handle = await signedIn('PolicySearch');
    const session = startRecording(options(handle, 'told', { stopOn: 'manual', maxSteps: undefined }));
    await session.ready;
    session.stop();
    expect((await session.done).stoppedBy).toBe('manual');
  }, 30_000);
});
