/**
 * handoff.raise applies the PII gate to the agent's text (which often quotes
 * the page) before it is written to the repository and posted to Azure
 * DevOps as a work-item comment.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BrowserPool } from '../../../src/browser/types.js';
import type { ToolContext } from '../../../src/tools/types.js';
import { startMockAdo, stepsXml, type MockAdo } from '../../support/mock-ado.js';
import { invoke, makeContext, makePool, makeWorkspace, type TestWorkspace } from './helpers.js';

const PAT = 'handoff-pii-pat';
const EMAIL = 'jane.roe@acme.com';
const PHONE = '555-867-5309';

describe('handoff.raise and the PII gate', () => {
  let ado: MockAdo;
  let ws: TestWorkspace;
  let pool: BrowserPool;
  let ctx: ToolContext;

  beforeAll(async () => {
    ado = await startMockAdo({
      pat: PAT,
      cases: [{ id: 30001, title: 'Greets the user', steps: stepsXml([{ id: 2, action: 'Sign in', expected: 'The greeting is shown' }]) }],
    });
    ws = await makeWorkspace({ ado: { orgUrl: ado.url, project: ado.project }, linkPlaywright: false });
    pool = makePool(ws.workspace);
    ctx = makeContext(ws.workspace, pool, { AZURE_DEVOPS_PAT: PAT });
  });

  afterAll(async () => {
    await pool?.closeAll();
    await ado?.close();
    await ws?.dispose();
  });

  it('redacts quoted page text in the handoff file and the ADO comment', async () => {
    const raised = await invoke(
      'handoff.raise',
      {
        testCaseId: '30001',
        stepIndex: 1,
        blockage: 'text-mismatch',
        unresolvedIntent: `Expected "Welcome" but the page shows "Welcome, Jane Roe (${EMAIL})"`,
        attempted: [`app.assert contains-text "Welcome" → observed "Welcome, Jane Roe (${EMAIL})"`],
        evidence: {},
        candidates: [{ role: 'heading', name: `Welcome, Jane Roe (${EMAIL})`, why: `call ${PHONE}` }],
        nextMoves: [`Confirm whether the greeting should show ${EMAIL}`],
        proposedAssertion: `await expect(page.getByRole('heading')).toHaveText('Welcome, Jane Roe (${EMAIL})')`,
      },
      ctx,
    );
    expect(raised.adoCommentUrl).toBeDefined();

    const file = await fs.readFile(path.join(ws.root, raised.path), 'utf8');
    expect(file).not.toContain(EMAIL);
    expect(file).not.toContain(PHONE);
    expect(file).toContain('Welcome, Jane Roe (<email>)');
    const handoff = JSON.parse(file) as { readonly candidates: readonly { readonly name: string; readonly why?: string }[] };
    expect(handoff.candidates[0]).toEqual({ role: 'heading', name: 'Welcome, Jane Roe (<email>)', why: 'call <phone>' });

    const comments = ado.comments(30001);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.text).not.toContain(EMAIL);
    expect(comments[0]!.text).not.toContain(PHONE);
    expect(comments[0]!.text).toContain('Welcome, Jane Roe (&lt;email&gt;)');
  });
});
