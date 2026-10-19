/**
 * Every page-object write goes through its screen's queue, loading and
 * rendering the catalog when its turn comes. The race this guards against:
 * memory.mint(A) commits and its regeneration of pages/<screen>.page.ts
 * reads the catalog {A}; a parallel test.emit mints B and writes the page
 * object {A, B}; the regeneration then writes {A} last, and the spec's
 * member for B no longer exists.
 *
 * The regeneration is held right after it has read the catalog (loadScreen
 * is wrapped), so the interleaving is the same on every run.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Candidate, TestCase } from '../../../src/contract/schemas.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import { mintFacet } from '../../../src/memory/index.js';
import type * as MemoryModule from '../../../src/memory/index.js';
import { regeneratePageObject } from '../../../src/tools/handlers/support/page-objects.js';
import type { ToolContext } from '../../../src/tools/types.js';
import { invoke, makeContext, makePool, makeWorkspace, type TestWorkspace } from './helpers.js';

const gate = vi.hoisted(() => ({
  hold: undefined as undefined | { readonly reached: () => void; readonly release: Promise<void> },
}));

vi.mock('../../../src/memory/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof MemoryModule>();
  return {
    ...actual,
    loadScreen: async (...args: Parameters<typeof actual.loadScreen>) => {
      const loaded = await actual.loadScreen(...args);
      const hold = gate.hold;
      if (hold !== undefined) {
        gate.hold = undefined;
        hold.reached();
        await hold.release;
      }
      return loaded;
    },
  };
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const candidate: Candidate = {
  ref: 'c1', role: 'button', name: 'Save', namingSource: 'content', affordance: 'native', interactive: true, tag: 'button',
  landmark: 'main', visible: true, enabled: true, inViewport: true,
};

const testCase = (id: string, action: string): TestCase => ({
  id, title: `Orders ${id}`, revision: 1, contentHash: `h-${id}`, tags: [], parameters: [], dataRows: [],
  steps: [{ index: 1, stepIdentifier: '2', action, expected: 'It is done' }],
});

describe('page-object writes are serialized per screen', () => {
  let ws: TestWorkspace;
  let pool: BrowserPool;
  let ctx: ToolContext;
  const pageObject = (): Promise<string> => fs.readFile(path.join(ws.root, 'pages', 'orders.page.ts'), 'utf8');

  beforeAll(async () => {
    ws = await makeWorkspace({ linkPlaywright: false });
    pool = makePool(ws.workspace);
    ctx = makeContext(ws.workspace, pool);
    await mintFacet(ws.workspace, {
      screen: 'orders',
      draft: { name: 'save', displayName: 'Save button', locator: { strategy: 'role-name', role: 'button', name: 'Save' } },
      candidate,
      snapshotId: 'snap-seed',
      provenance: { instrument: 'human' },
    });
    const first = await invoke('test.emit', {
      testCase: testCase('40001', 'Click Save'),
      steps: [{ index: 1, stepIdentifier: '2', actionText: 'Click Save', expectedText: 'It is done', verb: 'click', target: { facetId: 'orders:save' } }],
    }, ctx);
    expect(first.pageObjectPaths).toEqual(['pages/orders.page.ts']);
  });

  afterAll(async () => {
    gate.hold = undefined;
    await pool?.closeAll();
    await ws?.dispose();
  });

  it('a regeneration that read the catalog before test.emit minted cannot write its older page object last', async () => {
    let reached: () => void = () => undefined;
    const regenerationRead = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    gate.hold = { reached, release: released };

    // memory.mint's regeneration: it reads the catalog (holding only the save facet) and is held there.
    const regeneration = regeneratePageObject(ws.workspace, 'orders');
    await regenerationRead;

    // A parallel test.emit mints a loose target and writes the page object.
    const emitted = invoke('test.emit', {
      testCase: testCase('40002', 'Click Submit'),
      steps: [{
        index: 1, stepIdentifier: '2', actionText: 'Click Submit', expectedText: 'It is done', verb: 'click', screen: 'orders',
        target: { locator: { strategy: 'role-name', role: 'button', name: 'Submit' } },
      }],
    }, ctx);
    // Unserialized, the emit finishes while the regeneration is held; serialized, it waits for it.
    await Promise.race([emitted, sleep(1_500)]);
    release();
    const [result] = await Promise.all([emitted, regeneration]);

    expect(result.facetsMinted).toHaveLength(1);
    const written = await pageObject();
    expect(written).toContain("name: 'Submit'");
    expect(written).toContain("name: 'Save'");
  });
});
