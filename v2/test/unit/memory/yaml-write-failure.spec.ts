/**
 * Finding 19: the evidence log is appended before the catalog YAML is
 * written. When the YAML write fails (EPERM on rename while an editor holds
 * the file, ENOSPC), the log is the record: the next read must not take the
 * unwritten file for a human status edit, revert the promotion and wipe the
 * facet's health. A real human edit is still recorded as one.
 */
import { promises as fs } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocatorSpec } from '../../../src/contract/schemas.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import type * as Fsio from '../../../src/core/fsio.js';
import { catalogFile, findFacet, loadScreen, mintFacet, readEvents, recordResolutions, recordTestRun } from '../../../src/memory/index.js';
import { candidate, readText, removeWorkspace, steppingClock, tempWorkspace, verified } from './helpers.js';

const failing = vi.hoisted(() => ({ yaml: false }));

vi.mock('../../../src/core/fsio.js', async (importOriginal) => {
  const real = await importOriginal<typeof Fsio>();
  return {
    ...real,
    writeFileAtomic: async (file: string, content: string | Buffer): Promise<void> => {
      if (failing.yaml && file.endsWith('.yaml')) {
        throw Object.assign(new Error(`EPERM: operation not permitted, rename '${file}.tmp' -> '${file}'`), { code: 'EPERM' });
      }
      return real.writeFileAtomic(file, content);
    },
  };
});

const SCREEN = 'policy-search';
const ID = `${SCREEN}:search-button`;
const BUTTON: LocatorSpec = { strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } };

let ws: Workspace;
let options: { now: () => Date };

beforeEach(async () => {
  ws = await tempWorkspace();
  options = { now: steppingClock() };
  failing.yaml = false;
  await mintFacet(
    ws,
    {
      screen: SCREEN,
      draft: { name: 'search-button', displayName: 'Search button' },
      candidate: candidate({ ref: 'c2', role: 'button', name: 'Search', namingSource: 'content', tag: 'button', placeholder: undefined, id: undefined, idKind: undefined }),
      snapshotId: 'snap-1',
      verified: verified(BUTTON),
      provenance: { instrument: 'app.observe' },
    },
    options,
  );
});

afterEach(async () => {
  failing.yaml = false;
  await removeWorkspace(ws);
});

const pass = (runId: string) => recordTestRun(ws, { runId, testCaseId: '10001', facetIds: [ID], outcome: 'passed' }, options);

describe('a catalog write that fails after the evidence append', () => {
  it('keeps the logged promotion and its evidence; no human edit is invented', async () => {
    await pass('run-1');
    await pass('run-2');
    failing.yaml = true;
    await expect(pass('run-3')).rejects.toThrow(/EPERM/);
    failing.yaml = false;
    expect(await readText(catalogFile(ws, SCREEN))).toContain('status: candidate'); // the write never landed

    const found = await findFacet(ws, ID, options);
    expect(found?.status).toBe('trusted');
    expect(found?.locators[0]?.health).toBe('4/4');

    // The next write repairs the file from the log and records no human status event.
    await recordResolutions(ws, [{ facetId: ID, outcome: 'ok', source: 'act' }], options);
    expect(await readText(catalogFile(ws, SCREEN))).toContain('status: trusted');
    const { events } = await readEvents(ws, SCREEN);
    expect(events.filter((e) => e.kind === 'status').map((e) => e.kind === 'status' && [e.from, e.to, e.by])).toEqual([['candidate', 'trusted', 'tool']]);
    const loaded = await loadScreen(ws, SCREEN, options);
    expect(loaded.catalog.facets[0]).toMatchObject({ status: 'trusted' });
    expect(loaded.catalog.facets[0]?.locators[0]?.health).toBe('5/5');
  });

  it('still records a real human edit made after the failed write', async () => {
    await pass('run-1');
    await pass('run-2');
    failing.yaml = true;
    await expect(pass('run-3')).rejects.toThrow(/EPERM/);
    failing.yaml = false;
    const file = catalogFile(ws, SCREEN);
    await fs.writeFile(file, (await readText(file)).replace('status: candidate', 'status: retired'));
    expect((await findFacet(ws, ID, options))?.status).toBe('retired');
    await recordResolutions(ws, [{ facetId: ID, outcome: 'ok', source: 'act' }], options);
    const { events } = await readEvents(ws, SCREEN);
    expect(events.filter((e) => e.kind === 'status').map((e) => e.kind === 'status' && [e.from, e.to, e.by])).toEqual([
      ['candidate', 'trusted', 'tool'],
      ['trusted', 'retired', 'human'],
    ]);
  });

  it('a human who sets a tool-staled facet back by hand is still heard (the file changed since the tool wrote it)', async () => {
    await recordResolutions(ws, Array.from({ length: 3 }, () => ({ facetId: ID, outcome: 'not-found' as const, source: 'run' as const })), options);
    expect((await findFacet(ws, ID, options))?.status).toBe('stale');
    const file = catalogFile(ws, SCREEN);
    await fs.writeFile(file, (await readText(file)).replace('status: stale', 'status: candidate'));
    expect((await findFacet(ws, ID, options))?.status).toBe('candidate');
  });
});
