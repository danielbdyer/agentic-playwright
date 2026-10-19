/**
 * The runner library on its own, without a browser: the package fallback
 * when the workspace has no @playwright/test, spec selection, the wall-clock
 * budget, load errors, and receipts for hand-written specs.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isToolError } from '../../../src/core/errors.js';
import { pausedRunIds, resolvePlaywrightCli, runSpecs, selectSpecs } from '../../../src/run/index.js';
import { makeWorkspace, readLines, type TestWorkspace } from './helpers.js';

const write = async (root: string, file: string, text: string): Promise<void> => {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), text);
};

describe('runSpecs without a browser', () => {
  let ws: TestWorkspace | undefined;
  afterEach(async () => {
    await ws?.dispose();
    ws = undefined;
  });

  it('falls back to this package\'s Playwright (and NODE_PATH for the specs) when the workspace has none', async () => {
    ws = await makeWorkspace({ linkPlaywright: false });
    expect(resolvePlaywrightCli(ws.workspace)).toMatchObject({ source: 'package' });
    await write(
      ws.root,
      'tests/billing/30001-hand-written.spec.ts',
      [
        "import { test, expect } from '@playwright/test';",
        "test('totals add up', async () => {",
        "  await test.step('Add', async () => { expect(1 + 1).toBe(2); });",
        "  await test.step('Check', async () => { expect(process.env.TESSERACT_PARAM_TOKEN).toBe('abc'); });",
        '});',
        "test('a broken total', async () => {",
        "  await test.step('Add', async () => { expect(1 + 1, 'sum').toBe(3); });",
        '});',
        '',
      ].join('\n'),
    );
    const result = await runSpecs(ws.workspace, { env: { TESSERACT_PARAM_TOKEN: 'abc' }, timeoutMs: 60_000 });
    expect(result.summary).toEqual({ passed: 1, failed: 1, skipped: 0, flaky: 0 });
    const [passed, failed] = [result.receipts.find((r) => r.outcome === 'passed')!, result.receipts.find((r) => r.outcome === 'failed')!];
    expect(passed).toMatchObject({ testCase: '30001', spec: 'tests/billing/30001-hand-written.spec.ts', title: 'totals add up' });
    expect(passed.steps.map((s) => [s.index, s.title, s.outcome, s.facets])).toEqual([[1, 'Add', 'passed', []], [2, 'Check', 'passed', []]]);
    expect(failed.error).toMatchObject({ family: 'assertion-like', failureType: 'unknown' });
    expect(failed.steps[0]).toMatchObject({ outcome: 'failed' });
    expect(result.promoted).toEqual([]);
    expect(await readLines(ws.workspace.paths.runReceipts)).toHaveLength(2);
  }, 60_000);

  it('selects every *.spec.ts under tests/ by default and refuses when there are none', async () => {
    ws = await makeWorkspace();
    await expect(selectSpecs(ws.workspace, undefined)).rejects.toMatchObject({ family: 'not-found' });
    await write(ws.root, 'tests/a/1-a.spec.ts', '');
    await write(ws.root, 'tests/b/2-b.spec.ts', '');
    await write(ws.root, 'tests/helpers.ts', '');
    await write(ws.root, 'tests/node_modules/x/3-x.spec.ts', '');
    expect((await selectSpecs(ws.workspace, undefined)).map((file) => path.relative(ws!.root, file))).toEqual(['tests/a/1-a.spec.ts', 'tests/b/2-b.spec.ts']);
    expect((await selectSpecs(ws.workspace, ['tests/b/2-b.spec.ts', './tests/b/2-b.spec.ts'])).length).toBe(1);
  });

  it('stops a run that exceeds its wall-clock budget, and says timeout', async () => {
    ws = await makeWorkspace();
    await write(ws.root, 'tests/40001-slow.spec.ts', "import { test } from '@playwright/test';\ntest('slow', async () => { await new Promise((r) => setTimeout(r, 30_000)); });\n");
    const started = Date.now();
    const error = await runSpecs(ws.workspace, { timeoutMs: 1500 }).catch((e: unknown) => e);
    expect(isToolError(error) && error.family).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(pausedRunIds()).toEqual([]);
  }, 30_000);

  it('reports a spec Playwright cannot load as an error with its message', async () => {
    ws = await makeWorkspace();
    await write(ws.root, 'tests/50001-broken.spec.ts', "import { test } from '@playwright/test';\ntest('x', async () => {\n");
    const error = await runSpecs(ws.workspace, { timeoutMs: 60_000 }).catch((e: unknown) => e);
    expect(isToolError(error) && error.family).toBe('unclassified');
    expect((error as Error).message).toMatch(/could not run the specs.*50001-broken\.spec\.ts: Unexpected token/s);
    expect((error as Error).message).not.toMatch(/No tests found/);
  }, 60_000);

  it('runs only the requested specs and the grep, and records nothing in memory when asked not to', async () => {
    ws = await makeWorkspace();
    await write(ws.root, 'tests/60001-one.spec.ts', "import { test } from '@playwright/test';\ntest('alpha', () => {});\ntest('beta', () => {});\n");
    await write(ws.root, 'tests/60002-two.spec.ts', "import { test } from '@playwright/test';\ntest('gamma', () => {});\n");
    const result = await runSpecs(ws.workspace, { specPaths: ['tests/60001-one.spec.ts'], grep: 'beta', updateMemory: false, timeoutMs: 60_000 });
    expect(result.receipts.map((r) => r.title)).toEqual(['beta']);
    expect(result.receipts[0]!.testCase).toBe('60001');
  }, 60_000);
});
