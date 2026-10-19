import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isToolError } from '../../../src/core/errors.js';
import { DEFAULT_CONFIG, workspacePaths, type Workspace } from '../../../src/workspace/workspace.js';
import { SNAPSHOT_RECORD_VERSION, type SnapshotRecord } from '../../../src/observe/observe.js';
import { loadSnapshot, pruneSnapshots, saveSnapshot, saveSnapshotRecord, snapshotPath } from '../../../src/observe/store.js';

let root: string;
let workspace: Workspace;

const record = (snapshotId: string): SnapshotRecord => ({
  version: SNAPSHOT_RECORD_VERSION,
  snapshotId,
  pageId: 'page-1',
  at: '2026-10-19T00:00:00.000Z',
  url: 'https://app.example.com/PolicySearch',
  title: 'Policy Search',
  variant: 'reactive',
  variantEvidence: ['14 data-block containers'],
  variantSignals: {
    osuiClassCount: 0, osuiAnyTokenCount: 0, dataBlockCount: 14, outSystemsRuntimeGlobal: 'OutSystems',
    outSystemsScriptPresent: false, osvstatePresent: false, reactDetected: true, angularDetected: false, vueDetected: false,
  },
  scope: 'page',
  fingerprint: {
    hash: 'sha256:00', title: 'Policy Search', path: '/PolicySearch', landmarks: ['main'], roleCounts: { button: 1 },
    interactive: 1, rolelessInteractive: 0, placeholderOnlyInputs: 0, dataBlocks: 14, runtimeGlobal: 'OutSystems',
  },
  fingerprintBasis: { landmarks: ['main'], interactiveRoles: ['button'], dataBlockNames: ['Screen'], runtimeGlobal: 'OutSystems' },
  candidates: [{
    ref: 'c1', role: 'button', name: 'Search', namingSource: 'content', affordance: 'native', interactive: true, tag: 'button',
    visible: true, enabled: true, inViewport: true,
  }],
  categories: { c1: 'control' },
  alerts: [],
  aria: '- button "Search"',
  ariaTruncated: false,
  nameAgreement: { compared: 1, agreed: 1, disagreements: [] },
  stats: { elements: 10, ownCursorOnly: 0, cellsDropped: 0, rowsDropped: 0 },
  pii: 'standard',
});

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'observe-store-'));
  workspace = { paths: workspacePaths(root), config: { ...DEFAULT_CONFIG, snapshotRetentionDays: 14 } };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('snapshot store', () => {
  it('saves under .tesseract/snapshots and loads it back', async () => {
    const file = await saveSnapshot(workspace, record('snap-1'));
    expect(file).toBe(path.join(root, '.tesseract', 'snapshots', 'snap-1.json'));
    expect(await loadSnapshot(workspace, 'snap-1')).toEqual(record('snap-1'));
  });

  it('writes the screenshot alongside with a workspace-relative path', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const saved = await saveSnapshotRecord(workspace, record('snap-2'), png);
    expect(saved.screenshotPath).toBe('.tesseract/snapshots/snap-2.png');
    expect(readFileSync(path.join(root, '.tesseract', 'snapshots', 'snap-2.png'))).toEqual(png);
    expect((await loadSnapshot(workspace, 'snap-2')).screenshotPath).toBe('.tesseract/snapshots/snap-2.png');
  });

  it('reports a missing or incompatible snapshot as stale', async () => {
    const missing = await loadSnapshot(workspace, 'snap-nope').catch((e: unknown) => e);
    expect(isToolError(missing) && missing.family).toBe('stale-snapshot');
    await saveSnapshot(workspace, record('snap-old'));
    writeFileSync(snapshotPath(workspace, 'snap-old'), JSON.stringify({ ...record('snap-old'), version: 0 }));
    const old = await loadSnapshot(workspace, 'snap-old').catch((e: unknown) => e);
    expect(isToolError(old) && old.family).toBe('stale-snapshot');
    writeFileSync(snapshotPath(workspace, 'snap-bad'), '{not json');
    const bad = await loadSnapshot(workspace, 'snap-bad').catch((e: unknown) => e);
    expect(isToolError(bad) && bad.family).toBe('stale-snapshot');
  });

  it('refuses ids that could escape the snapshots directory', async () => {
    for (const id of ['../secrets', 'a/b', '', '.hidden', 'x..y']) {
      const error = await loadSnapshot(workspace, id).catch((e: unknown) => e);
      expect(isToolError(error) && error.family).toBe('invalid-input');
    }
  });

  it('prunes records and screenshots older than the retention period', async () => {
    await saveSnapshotRecord(workspace, record('snap-old'), Buffer.from('png'));
    await saveSnapshot(workspace, record('snap-new'));
    const now = new Date('2026-10-19T12:00:00Z');
    const old = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
    utimesSync(snapshotPath(workspace, 'snap-old'), old, old);
    utimesSync(path.join(workspace.paths.snapshots, 'snap-old.png'), old, old);
    const recent = new Date(now.getTime() - 60 * 1000);
    utimesSync(snapshotPath(workspace, 'snap-new'), recent, recent);
    expect(await pruneSnapshots(workspace, now)).toEqual(['snap-old.json', 'snap-old.png']);
    expect(existsSync(snapshotPath(workspace, 'snap-new'))).toBe(true);
    expect(await pruneSnapshots({ ...workspace, config: { ...workspace.config, snapshotRetentionDays: 0 } }, now)).toEqual([]);
    rmSync(workspace.paths.snapshots, { recursive: true });
    expect(await pruneSnapshots(workspace, now)).toEqual([]);
  });
});
