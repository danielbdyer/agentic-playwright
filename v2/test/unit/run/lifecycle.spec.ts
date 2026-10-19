/**
 * Review findings on test.run's process lifecycle and what it writes, with
 * the real Playwright and Chromium:
 *   33  paused runs belong to the runtime (owner) that started them;
 *   37  stopRuns stops runs still in flight (process group, repair files);
 *   7   retries asked with pauseOnFailure are reported as not attempted;
 *   24  receipts (runs.jsonl and the result) pass the PII gate;
 *   18  one run of a data-driven case is one run toward promotion;
 *   43  shadow specs import by relative path (and run under ESM).
 */
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isToolError } from '../../../src/core/errors.js';
import type { LocatorSpec } from '../../../src/contract/schemas.js';
import { loadScreen, mintFacet } from '../../../src/memory/index.js';
import {
  activeRuns,
  appendEmitRecord,
  pausedRunIds,
  releasePausedRuns,
  rewriteShadowImports,
  runSpecs,
  stopRuns,
} from '../../../src/run/index.js';
import { makeWorkspace, readLines, type TestWorkspace } from '../handlers-test/helpers.js';
import { candidate, verified } from '../memory/helpers.js';

const write = async (root: string, file: string, text: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => Promise<boolean> | boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

let server: http.Server;
let baseURL: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Home</title><main><p id="greeting">Welcome, Jane Roe (jane.roe@acme.com)</p></main>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  await stopRuns();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A spec that opens the page (with the user's email in the query) and fails on its greeting. */
const greetingSpec = (url: string): string =>
  [
    "import { test, expect } from '@playwright/test';",
    "import { GREETING } from '../pages/home.page';",
    "test('ADO 70001 — greeting', async ({ page }) => {",
    `  await test.step('Open home', async () => { await page.goto(${JSON.stringify(`${url}Home?user=jane.roe@acme.com`)}); });`,
    "  await test.step('Check the greeting', async () => { await expect(page.locator(GREETING)).toHaveText('Welcome', { timeout: 1000 }); });",
    '});',
    '',
  ].join('\n');

describe('test.run lifecycle and receipts', () => {
  let ws: TestWorkspace | undefined;
  afterEach(async () => {
    await stopRuns();
    await ws?.dispose();
    ws = undefined;
  });

  it('33/24/7/43: a paused run belongs to its owner; receipts are PII-gated; retries are reported as not attempted', async () => {
    ws = await makeWorkspace();
    await write(ws.root, 'package.json', JSON.stringify({ name: 'customer', type: 'module' }));
    await write(ws.root, 'pages/home.page.ts', "export const GREETING = '#greeting';\n");
    await write(ws.root, 'tests/70001-greeting.spec.ts', greetingSpec(baseURL));
    await write(ws.root, 'tests/70002-plain.spec.ts', "import { test, expect } from '@playwright/test';\ntest('ADO 70002 — sums', async () => { expect(1 + 1).toBe(2); });\n");

    const logs: string[] = [];
    const a = await runSpecs(ws.workspace, {
      owner: 'session-a',
      specPaths: ['tests/70001-greeting.spec.ts'],
      pauseOnFailure: true,
      retries: 2,
      timeoutMs: 90_000,
      log: (message) => logs.push(message),
    });
    expect(a.paused).toBeDefined();
    expect(pausedRunIds('session-a')).toEqual([a.paused!.repairId]);
    // 7: the caller asked for retries; the run says it did not attempt them.
    expect(a.warnings).toEqual([expect.stringMatching(/retries \(2\) were not attempted.*pauseOnFailure/)]);
    expect(logs.some((line) => /retries \(2\) were not attempted/.test(line))).toBe(true);
    // 24: the paused URL and the error text leave the run gated.
    expect(a.paused!.url).toMatch(/Home\?user=<redacted>$/);
    const written = await fs.readFile(ws.workspace.paths.runReceipts, 'utf8');
    expect(written).not.toContain('jane.roe@acme.com');
    expect(JSON.stringify(a.receipts)).not.toContain('jane.roe@acme.com');
    expect(a.receipts[0]!.error!.message).toContain('<email>');

    // 33: another session's run and close leave session A's paused browser alone.
    const b = await runSpecs(ws.workspace, { owner: 'session-b', specPaths: ['tests/70002-plain.spec.ts'], timeoutMs: 60_000 });
    expect(b.summary.passed).toBe(1);
    await stopRuns('session-b');
    expect(pausedRunIds('session-a')).toEqual([a.paused!.repairId]);
    const version = await fetch(`${a.paused!.cdpEndpoint}/json/version`);
    expect(version.ok).toBe(true);

    // Session A's own next action (here: its close) releases it, and the repair files go with it.
    await stopRuns('session-a');
    expect(pausedRunIds()).toEqual([]);
    await expect(fs.stat(path.join(ws.workspace.paths.repair, `${a.paused!.repairId}.json`))).rejects.toThrow();
  }, 180_000);

  it('43: shadow specs name their imports relative to the shadow copy', async () => {
    ws = await makeWorkspace();
    const original = path.join(ws.root, 'tests', 'home', '1-home.spec.ts');
    await write(ws.root, 'pages/home.page.ts', 'export const x = 1;\n');
    const shadow = path.join(ws.root, '.tesseract', 'tmp', 'repair-r-1', 'specs', 'tests', 'home', '1-home.spec.ts');
    const fixture = path.join(ws.root, '.tesseract', 'tmp', 'repair-r-1', 'tesseract-repair-fixture.ts');
    const source = "import { test } from '@playwright/test';\nimport { x } from '../../pages/home.page.js';\nconst lazy = () => import('../../pages/home.page');\n";
    const rewritten = await rewriteShadowImports(source, original, fixture, shadow);
    expect(rewritten).toBe(
      "import { test } from '../../../tesseract-repair-fixture.ts';\nimport { x } from '../../../../../../pages/home.page.ts';\nconst lazy = () => import('../../../../../../pages/home.page.ts');\n",
    );
    expect(rewritten).not.toContain(ws.root);
    expect(path.resolve(path.dirname(shadow), '../../../../../../pages/home.page.ts')).toBe(path.join(ws.root, 'pages', 'home.page.ts'));
  });

  it('37: stopRuns stops an in-flight run with its process group, and the waiting runSpecs says so', async () => {
    ws = await makeWorkspace();
    const pidFile = path.join(ws.root, 'worker.pid');
    await write(
      ws.root,
      'tests/80001-slow.spec.ts',
      [
        "import { test } from '@playwright/test';",
        "import { writeFileSync } from 'node:fs';",
        "test('ADO 80001 — slow', async () => {",
        `  writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
        '  await new Promise((resolve) => setTimeout(resolve, 60_000));',
        '});',
        '',
      ].join('\n'),
    );
    for (const pauseOnFailure of [false, true]) {
      await fs.rm(pidFile, { force: true });
      const running = runSpecs(ws.workspace, { owner: 'session-c', pauseOnFailure, timeoutMs: 120_000 }).catch((error: unknown) => error);
      await waitFor(async () => (await fs.readFile(pidFile, 'utf8').catch(() => '')).length > 0, 60_000);
      const worker = Number(await fs.readFile(pidFile, 'utf8'));
      expect(alive(worker)).toBe(true);
      expect(activeRuns('session-c')).toEqual([expect.objectContaining({ owner: 'session-c', state: 'running' })]);
      // Another owner's shutdown does not touch it.
      await stopRuns('session-d');
      expect(alive(worker)).toBe(true);

      const started = Date.now();
      await stopRuns('session-c');
      const error = await running;
      expect(isToolError(error) && error.family).toBe('unavailable');
      expect(Date.now() - started).toBeLessThan(15_000);
      await waitFor(() => !alive(worker), 10_000);
      expect(activeRuns()).toEqual([]);
      const tmp = await fs.readdir(ws.workspace.paths.tmp);
      expect(tmp.some((name) => name.startsWith('repair-'))).toBe(false);
    }
  }, 180_000);

  it('18: one run of a three-row data-driven case counts once toward promotion', async () => {
    ws = await makeWorkspace();
    const button: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Search' };
    await mintFacet(ws.workspace, {
      screen: 'policy-search',
      draft: { name: 'search-button', displayName: 'Search button' },
      candidate: candidate({ ref: 'c2', role: 'button', name: 'Search', namingSource: 'content', tag: 'button', placeholder: undefined, id: undefined, idKind: undefined }),
      snapshotId: 'snap-1',
      verified: verified(button),
      provenance: { instrument: 'app.observe' },
    });
    const spec = 'tests/90001-rows.spec.ts';
    await write(
      ws.root,
      spec,
      [
        "import { test, expect } from '@playwright/test';",
        "test.describe('ADO 90001 — rows', () => {",
        "  for (const [i, row] of ['POL-1', 'POL-2', 'POL-3'].entries()) {",
        "    test(row, { annotation: [{ type: 'ado-id', description: '90001' }, { type: 'ado-data-row', description: String(i + 1) }] }, async () => {",
        "      await test.step('Search', async () => { expect(row.startsWith('POL')).toBe(true); });",
        '    });',
        '  }',
        '});',
        '',
      ].join('\n'),
    );
    await appendEmitRecord(ws.workspace, {
      at: new Date().toISOString(),
      testCaseId: '90001',
      revision: 1,
      contentHash: 'sha256:x',
      specPath: spec,
      steps: [{ index: 1, stepIdentifier: '2', title: 'Search', facets: ['policy-search:search-button'] }],
      facets: ['policy-search:search-button'],
      pageObjects: [],
      flows: [],
    });
    const first = await runSpecs(ws.workspace, { specPaths: [spec], timeoutMs: 60_000 });
    expect(first.summary.passed).toBe(3);
    expect(first.promoted).toEqual([]);
    const stats = (await loadScreen(ws.workspace, 'policy-search')).stats['policy-search:search-button']!;
    expect([stats.runs, stats.passesSinceChange]).toEqual([1, 1]);
    expect((await readLines(ws.workspace.paths.runReceipts)).length).toBe(3);
  }, 120_000);

  it('releasePausedRuns() without an owner still releases every paused run (the stdio server)', async () => {
    ws = await makeWorkspace();
    await write(ws.root, 'pages/home.page.ts', "export const GREETING = '#greeting';\n");
    await write(ws.root, 'tests/70001-greeting.spec.ts', greetingSpec(baseURL));
    const paused = await runSpecs(ws.workspace, { pauseOnFailure: true, timeoutMs: 90_000 });
    expect(pausedRunIds()).toEqual([paused.paused!.repairId]);
    await releasePausedRuns();
    expect(pausedRunIds()).toEqual([]);
  }, 120_000);
});
