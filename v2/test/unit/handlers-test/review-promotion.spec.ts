/**
 * review.record's promotion rule, apart from the acceptance number: accept
 * and accept-with-edit promote the test's candidate facets to trusted
 * (whatever the size of the edit, and with changedLines omitted), unless
 * locatorEdited says the reviewer had to fix a locator. countsAsAccepted
 * keeps its own rule (small edits only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Candidate } from '../../../src/contract/schemas.js';
import { findFacet, mintFacet } from '../../../src/memory/index.js';
import { appendEmitRecord } from '../../../src/run/index.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import type { ToolContext } from '../../../src/tools/types.js';
import { invoke, makeContext, makePool, makeWorkspace, type TestWorkspace } from './helpers.js';

const candidate = (name: string): Candidate => ({
  ref: `c-${name}`, role: 'button', name, namingSource: 'content', affordance: 'native', interactive: true, tag: 'button',
  landmark: 'main', visible: true, enabled: true, inViewport: true,
});

describe('review.record promotion', () => {
  let ws: TestWorkspace;
  let pool: BrowserPool;
  let ctx: ToolContext;

  const emitCase = async (testCaseId: string, facetName: string): Promise<string> => {
    const minted = await mintFacet(ws.workspace, {
      screen: 'orders',
      draft: { name: facetName, displayName: `${facetName} button`, locator: { strategy: 'role-name', role: 'button', name: facetName } },
      candidate: candidate(facetName),
      snapshotId: 'snap-seed',
      provenance: { instrument: 'app.act' },
    });
    await appendEmitRecord(ws.workspace, {
      at: new Date().toISOString(), testCaseId, revision: 1, contentHash: 'h', specPath: `tests/orders/${testCaseId}.spec.ts`,
      steps: [], facets: [minted.facet.id], pageObjects: [], flows: [],
    });
    return minted.facet.id;
  };

  beforeAll(async () => {
    ws = await makeWorkspace({ linkPlaywright: false });
    pool = makePool(ws.workspace);
    ctx = makeContext(ws.workspace, pool);
  });

  afterAll(async () => {
    await pool?.closeAll();
    await ws?.dispose();
  });

  it('accept-with-edit without changedLines promotes the facets; it does not count as accepted', async () => {
    const facetId = await emitCase('10001', 'save');
    const receipt = await invoke('review.record', { testCaseId: '10001', decision: 'accept-with-edit', reviewer: 'qa' }, ctx);
    expect(receipt.facetsPromoted).toEqual([facetId]);
    expect(receipt.countsAsAccepted).toBe(false);
    expect((await findFacet(ws.workspace, facetId))?.status).toBe('trusted');
  });

  it('accept-with-edit with a large edit promotes too', async () => {
    const facetId = await emitCase('10002', 'submit');
    const receipt = await invoke('review.record', { testCaseId: '10002', decision: 'accept-with-edit', reviewer: 'qa', changedLines: 6 }, ctx);
    expect(receipt).toMatchObject({ facetsPromoted: [facetId], countsAsAccepted: false });
  });

  it('accept-with-edit where the reviewer fixed a locator promotes nothing, and still counts as accepted', async () => {
    const facetId = await emitCase('10003', 'cancel');
    const receipt = await invoke('review.record', { testCaseId: '10003', decision: 'accept-with-edit', reviewer: 'qa', changedLines: 1, locatorEdited: true }, ctx);
    expect(receipt).toMatchObject({ facetsPromoted: [], countsAsAccepted: true });
    expect((await findFacet(ws.workspace, facetId))?.status).toBe('candidate');
  });

  it('reject promotes nothing', async () => {
    const facetId = await emitCase('10004', 'delete');
    const receipt = await invoke('review.record', { testCaseId: '10004', decision: 'reject', reviewer: 'qa' }, ctx);
    expect(receipt).toMatchObject({ facetsPromoted: [], countsAsAccepted: false });
    expect((await findFacet(ws.workspace, facetId))?.status).toBe('candidate');
  });
});
