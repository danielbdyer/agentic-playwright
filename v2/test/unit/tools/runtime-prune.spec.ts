/**
 * Snapshot retention: a runtime prunes .tesseract/snapshots/ once when it
 * starts, removing records and screenshots older than
 * config.snapshotRetentionDays and never anything younger, so cited
 * snapshotIds inside the window stay loadable.
 */
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntime } from '../../../src/tools/runtime.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';
import { ToolError } from '../../../src/core/errors.js';
import type { ToolHandlers } from '../../../src/tools/types.js';
import type { BrowserPool } from '../../../src/browser/types.js';

const nullPool: BrowserPool = {
  open: async () => { throw new ToolError('unavailable', 'no browser in this test'); },
  navigate: async () => { throw new ToolError('unavailable', 'no browser in this test'); },
  get: () => { throw new ToolError('not-found', 'no pages'); },
  list: () => [],
  close: async () => undefined,
  closeAll: async () => undefined,
};

const handlers = new Proxy({}, { get: () => async () => { throw new ToolError('unclassified', 'not in this test'); } }) as ToolHandlers;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-19T12:00:00.000Z');

describe('runtime start prunes old snapshots', () => {
  let root: string;
  let workspace: Workspace;

  const age = async (name: string, days: number): Promise<void> => {
    const file = path.join(workspace.paths.snapshots, name);
    await writeFile(file, name.endsWith('.json') ? '{}' : 'png');
    const when = new Date(NOW.getTime() - days * DAY);
    await utimes(file, when, when);
  };

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-prune-'));
    await mkdir(path.join(root, '.tesseract'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'config.json'), JSON.stringify({ snapshotRetentionDays: 14 }));
    workspace = await loadWorkspace(root, {});
    await mkdir(workspace.paths.snapshots, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('removes records and screenshots past the retention window and keeps the rest', async () => {
    await age('snap-20260901000000-aaaaaaaa.json', 30);
    await age('snap-20260901000000-aaaaaaaa.png', 30);
    await age('snap-20261004000000-bbbbbbbb.json', 15);
    await age('snap-20261006000000-cccccccc.json', 13);
    await age('snap-20261019000000-dddddddd.json', 0);
    await age('snap-20261019000000-dddddddd.png', 0);
    const runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, now: () => NOW, log: () => undefined });
    await runtime.close();
    expect((await readdir(workspace.paths.snapshots)).sort()).toEqual([
      'snap-20261006000000-cccccccc.json',
      'snap-20261019000000-dddddddd.json',
      'snap-20261019000000-dddddddd.png',
    ]);
  });

  it('keeps everything when retention is 0', async () => {
    await writeFile(path.join(root, '.tesseract', 'config.json'), JSON.stringify({ snapshotRetentionDays: 0 }));
    workspace = await loadWorkspace(root, {});
    await age('snap-20200101000000-aaaaaaaa.json', 2000);
    const runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, now: () => NOW, log: () => undefined });
    await runtime.close();
    expect(await readdir(workspace.paths.snapshots)).toEqual(['snap-20200101000000-aaaaaaaa.json']);
  });

  it('starts without a snapshots directory', async () => {
    await rm(workspace.paths.snapshots, { recursive: true, force: true });
    const logged: string[] = [];
    const runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, now: () => NOW, log: (m) => { logged.push(m); } });
    await runtime.close();
    expect(logged.filter((m) => /prun/i.test(m) && /fail/i.test(m))).toEqual([]);
  });
});
