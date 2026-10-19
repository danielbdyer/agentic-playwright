/**
 * The small stores and rules behind the handlers: handoff files, emit
 * records, step validation, and what counts as an accepted review.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Handoff, ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import { appendEmitRecord, latestEmitBySpec, latestEmitFor, readEmitRecords, type EmitRecord } from '../../../src/run/emit-records.js';
import { findHandoff, handoffPath, readHandoffFile, writeHandoffFile } from '../../../src/tools/handlers/handoff-store.js';
import { validateSteps } from '../../../src/tools/handlers/emit-targets.js';
import { countsAsAccepted } from '../../../src/tools/handlers/review.js';
import { handoffHandlers } from '../../../src/tools/handlers/handoff.js';
import { invoke, makeContext, makePool, makeWorkspace, type TestWorkspace } from './helpers.js';

const handoff = (overrides: Partial<Handoff> = {}): Handoff => ({
  handoffId: 'h-10001-2-0a1b2c3d',
  testCaseId: '10001',
  stepIndex: 2,
  blockage: 'not-found',
  unresolvedIntent: 'Click Save',
  attempted: [],
  evidence: {},
  candidates: [],
  nextMoves: [],
  raisedAt: '2026-10-19T00:00:00Z',
  status: 'open',
  ...overrides,
});

const testCase: TestCase = {
  id: '10001',
  title: 'Save a policy',
  revision: 4,
  contentHash: 'sha256:x',
  tags: [],
  steps: [
    { index: 1, stepIdentifier: '2', action: '<P>Open Policy</P>', expected: '' },
    { index: 2, stepIdentifier: '3', action: 'Click Save', expected: 'Saved' },
  ],
  parameters: [],
  dataRows: [],
};

const step = (overrides: Partial<ResolvedStep>): ResolvedStep => ({
  index: 1,
  stepIdentifier: '2',
  actionText: 'Open Policy',
  expectedText: '',
  verb: 'navigate',
  screen: 'policy',
  ...overrides,
});

describe('handoff files', () => {
  let ws: TestWorkspace | undefined;
  afterEach(async () => {
    await ws?.dispose();
    ws = undefined;
  });

  it('round-trips, finds a handoff by id (from its own file or by scanning), and names the superseding one', async () => {
    ws = await makeWorkspace();
    await writeHandoffFile(ws.workspace, { ...handoff({ handoffId: 'h-10001-2-11111111' }), history: [handoff()] });
    expect((await readHandoffFile(ws.workspace, '10001', 2))?.history?.[0]?.handoffId).toBe('h-10001-2-0a1b2c3d');
    expect((await findHandoff(ws.workspace, 'h-10001-2-11111111')).unresolvedIntent).toBe('Click Save');
    await expect(findHandoff(ws.workspace, 'h-10001-2-0a1b2c3d')).rejects.toThrow(/superseded by h-10001-2-11111111/);
    await writeHandoffFile(ws.workspace, handoff({ handoffId: 'custom-id', testCaseId: '10002', stepIndex: 5 }));
    expect((await findHandoff(ws.workspace, 'custom-id')).stepIndex).toBe(5);
    await expect(findHandoff(ws.workspace, 'h-99-1-00000000')).rejects.toMatchObject({ family: 'not-found' });
    expect(() => handoffPath(ws!.workspace, '../evil', 1)).toThrow(/invalid test case id/);
  });

  it('reports a mangled handoff file as malformed-response, and handoff.raise keeps its bytes and carries on', async () => {
    ws = await makeWorkspace();
    await fs.mkdir(ws.workspace.paths.handoffs, { recursive: true });
    const file = path.join(ws.workspace.paths.handoffs, '10001-2.json');
    await fs.writeFile(file, '{ not json');
    await expect(readHandoffFile(ws.workspace, '10001', 2)).rejects.toMatchObject({ family: 'malformed-response' });
    const pool = makePool(ws.workspace);
    const logs: string[] = [];
    const raised = await invoke(
      'handoff.raise',
      { testCaseId: '10001', stepIndex: 2, blockage: 'missing-data', unresolvedIntent: 'Enter the policy number', attempted: [], evidence: {}, nextMoves: ['Add a data row'] },
      makeContext(ws.workspace, pool, {}, logs),
    );
    expect(raised.adoCommentUrl).toBeUndefined();
    expect(await fs.readFile(`${file}.corrupt`, 'utf8')).toBe('{ not json');
    expect((await readHandoffFile(ws.workspace, '10001', 2))?.handoffId).toBe(raised.handoffId);
    expect(logs.join('\n')).toMatch(/unreadable/);
    await expect(
      handoffHandlers['handoff.raise']({ testCaseId: '10001', stepIndex: 2, blockage: 'other', unresolvedIntent: 'x', attempted: [], evidence: { pageId: 'p-missing' }, nextMoves: [] }, makeContext(ws.workspace, pool)),
    ).rejects.toMatchObject({ family: 'not-found' });
    await pool.closeAll();
  });
});

describe('emit records', () => {
  let ws: TestWorkspace | undefined;
  afterEach(async () => {
    await ws?.dispose();
    ws = undefined;
  });

  const record = (testCaseId: string, specPath: string, at: string): EmitRecord => ({
    at, testCaseId, revision: 1, contentHash: 'sha256:x', specPath, steps: [], facets: [], pageObjects: [], flows: [],
  });

  it('keeps the latest record per spec and per case, skipping malformed lines', async () => {
    ws = await makeWorkspace();
    await appendEmitRecord(ws.workspace, record('1', 'tests/a/1-a.spec.ts', 't1'));
    await fs.appendFile(ws.workspace.paths.emitRecords, '{"broken": true}\nnot json\n');
    await appendEmitRecord(ws.workspace, record('1', 'tests/a/1-a.spec.ts', 't2'));
    await appendEmitRecord(ws.workspace, record('2', 'tests/b/2-b.spec.ts', 't3'));
    const all = await readEmitRecords(ws.workspace);
    expect(all).toHaveLength(3);
    expect(latestEmitBySpec(all).get('tests/a/1-a.spec.ts')?.at).toBe('t2');
    expect((await latestEmitFor(ws.workspace, '2'))?.specPath).toBe('tests/b/2-b.spec.ts');
    expect(await latestEmitFor(ws.workspace, '3')).toBeNull();
  });
});

describe('validateSteps', () => {
  it('accepts the case\'s steps (HTML-insensitive) and refuses stale, extra, duplicate and missing ones', () => {
    const ok = [step({}), step({ index: 2, stepIdentifier: '3', actionText: 'Click  Save', verb: 'click' })];
    expect(() => validateSteps(testCase, ok)).not.toThrow();
    expect(() => validateSteps(testCase, [ok[0]!, { ...ok[1]!, stepIdentifier: '9' }])).toThrow(expect.objectContaining({ family: 'conflict' }));
    expect(() => validateSteps(testCase, [ok[0]!, { ...ok[1]!, actionText: 'Click Cancel' }])).toThrow(expect.objectContaining({ family: 'conflict' }));
    expect(() => validateSteps(testCase, [...ok, step({ index: 3, stepIdentifier: '4' })])).toThrow(expect.objectContaining({ family: 'invalid-input' }));
    expect(() => validateSteps(testCase, [ok[0]!, ok[0]!])).toThrow(/more than once/);
    expect(() => validateSteps(testCase, [ok[0]!])).toThrow(/step 2 of test case 10001 is not resolved/);
  });
});

describe('countsAsAccepted', () => {
  it('accept counts; accept-with-edit counts for ≤ 5 lines or an overrides-only locator edit; reject never', () => {
    expect(countsAsAccepted('accept', undefined, undefined)).toBe(true);
    expect(countsAsAccepted('accept-with-edit', 5, undefined)).toBe(true);
    expect(countsAsAccepted('accept-with-edit', 6, undefined)).toBe(false);
    expect(countsAsAccepted('accept-with-edit', 40, true)).toBe(true);
    expect(countsAsAccepted('accept-with-edit', undefined, undefined)).toBe(false);
    expect(countsAsAccepted('reject', 0, true)).toBe(false);
  });
});
