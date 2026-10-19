/**
 * The reports over synthetic receipt files: two cases on one screen (the
 * first a first visit, accepted; the second a revisit with a handoff,
 * rejected), with the runs, reviews, emit records, a preflight, a handoff
 * file, and the catalog they leave behind.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Facet } from '../../../src/contract/schemas.js';
import { saveScreen } from '../../../src/memory/index.js';
import {
  authoringReceiptFrom,
  authoringReceiptMarkdown,
  attribute,
  computeNumbers,
  computeNumbersFrom,
  EMPTY_RECEIPTS,
  loadReceipts,
  renderNumbersMarkdown,
  type AuthoringLine,
} from '../../../src/report/index.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';

const T = (hms: string): string => `2026-10-01T${hms}.000Z`;

const line = (fields: Partial<AuthoringLine> & Pick<AuthoringLine, 'at' | 'tool'>): AuthoringLine => ({
  session: 's-1',
  input: {},
  outcome: 'succeeded',
  durationMs: 100,
  ...fields,
});

const AUTHORING: readonly AuthoringLine[] = [
  // Case 30001, page p-1: a first visit to policy-search.
  line({ at: T('10:00:00'), tool: 'app.open', testCase: '30001', durationMs: 1000, input: { profile: 'qa', url: 'Dashboard' }, output: { pageId: 'p-1', finalUrl: 'http://app/Dashboard', variant: 'reactive' } }),
  line({ at: T('10:00:02'), tool: 'memory.query', testCase: '30001', step: 1, input: { screen: 'policy-search', phrase: 'search field' }, output: { facets: [], screenKnown: false } }),
  // An observation a host made without a decision: attributed by its page.
  line({ at: T('10:00:03'), tool: 'app.observe', input: { pageId: 'p-1', scope: 'search' }, output: { snapshotId: 'snap-a', url: 'http://app/PolicySearch', scope: 'search', totalCandidates: 3, hints: [{ ref: 'c1', score: 0.9, why: 'placeholder' }] } }),
  line({
    at: T('10:00:04'),
    tool: 'app.act',
    testCase: '30001',
    step: 1,
    input: { pageId: 'p-1', action: 'fill', target: { snapshotId: 'snap-a', ref: 'c1' }, value: '@policyNumber' },
    output: { outcome: 'succeeded', resolved: { expression: "page.getByRole('search').getByRole('textbox', { name: 'Search Policy' })" }, durationMs: 300 },
    decision: { chose: 'c1', rejected: ['c3'], reason: 'the only textbox in the search landmark' },
    host: { model: 'claude-x', promptFingerprint: 'sha256:f1', tokens: { prompt: 1000, completion: 50 } },
  }),
  // The same decision reported again by the host on the mint: counted once.
  line({
    at: T('10:00:05'),
    tool: 'memory.mint',
    testCase: '30001',
    step: 1,
    input: { screen: 'policy-search', facet: { displayName: 'Policy number search field' } },
    output: { facet: { id: 'policy-search:policy-number-input', displayName: 'Policy number search field' }, created: true },
    host: { model: 'claude-x', promptFingerprint: 'sha256:f1', tokens: { prompt: 1000, completion: 50 } },
  }),
  line({
    at: T('10:00:06'),
    tool: 'app.assert',
    testCase: '30001',
    step: 2,
    input: { pageId: 'p-1', assertion: 'visible', target: { locator: { strategy: 'row-text', value: '{policyNumber}' } } },
    output: { passed: true, observed: true },
    decision: { chose: 'c8', reason: 'the row holding the policy' },
    host: { model: 'claude-x', promptFingerprint: 'sha256:f2', tokens: { prompt: 500, completion: 20 } },
  }),
  line({
    at: T('10:00:08'),
    tool: 'test.emit',
    testCase: '30001',
    durationMs: 2000,
    input: {
      testCase: { id: '30001' },
      steps: [
        { index: 1, verb: 'fill', target: '{…}', value: '@policyNumber', assertions: [{ kind: 'value', expected: '@policyNumber' }] },
        { index: 2, verb: 'assert', assertions: [{ kind: 'visible', rowValue: '@policyNumber' }] },
        { index: 3, verb: 'click', assertions: [{ kind: 'visible' }] },
      ],
    },
    output: { specPath: 'tests/policy-search/30001-search.spec.ts', written: true, diff: '+new file', facetsMinted: [] },
  }),
  // The human's review is not authoring time.
  line({ at: T('10:10:00'), tool: 'review.record', testCase: '30001', input: { testCaseId: '30001', decision: 'accept', reviewer: 'qa.lead' } }),
  // Case 30002, page p-2: a revisit with an ambiguous step.
  line({ at: T('10:05:00'), tool: 'app.open', testCase: '30002', durationMs: 1000, input: { profile: 'qa' }, output: { pageId: 'p-2', finalUrl: 'http://app/PolicySearch', variant: 'reactive' } }),
  line({
    at: T('10:05:01'),
    tool: 'handoff.raise',
    testCase: '30002',
    step: 2,
    input: { testCaseId: '30002', stepIndex: 2, blockage: 'ambiguous-target', unresolvedIntent: 'Click Edit — 2 candidates fit' },
    output: { handoffId: 'h-30002-2-aa', path: '.tesseract/handoffs/30002-2.json' },
  }),
  line({
    at: T('10:05:02'),
    tool: 'test.emit',
    testCase: '30002',
    durationMs: 1000,
    input: { testCase: { id: '30002' }, steps: [{ index: 1, verb: 'click', target: '{…}' }, { index: 2, verb: 'click', handoffId: 'h-30002-2-aa' }] },
    output: { specPath: 'tests/policy-search/30002-edit.spec.ts', written: true, diff: '+new file', facetsMinted: [] },
  }),
  line({
    at: T('10:06:00'),
    tool: 'memory.preflight',
    input: { screen: 'policy-search' },
    output: {
      summary: { ok: 3, stale: 1, missing: 0, unchecked: 0 },
      screens: [{ screen: 'policy-search', status: 'stale', facets: [{ id: 'a', status: 'ok' }, { id: 'b', status: 'ok' }, { id: 'c', status: 'ok' }, { id: 'd', status: 'stale' }] }],
    },
  }),
];

const run = (runId: string, at: string, testCase: string, outcome: string): Record<string, unknown> => ({
  runId,
  at,
  testCase,
  title: `ADO ${testCase}`,
  spec: `tests/policy-search/${testCase}.spec.ts`,
  outcome,
  durationMs: 1500,
  retries: outcome === 'flaky' ? 1 : 0,
  steps: [{ index: 1, title: 'Step', outcome: outcome === 'failed' ? 'failed' : 'passed', durationMs: 500, facets: [] }],
  ...(outcome === 'failed' ? { error: { message: 'locator not found', family: 'not-found', failureType: 'drift', facet: 'policy-search:search-button' } } : {}),
});

const facet = (id: string, extra: Partial<Facet>): Facet => ({
  id,
  screen: 'policy-search',
  kind: 'element',
  displayName: id,
  aliases: [],
  locators: [{ strategy: 'role-name', role: 'button', name: 'x' }],
  status: 'candidate',
  provenance: { mintedAt: T('10:00:05'), instrument: 'app.act' },
  ...extra,
});

let root: string;
let ws: Workspace;

const jsonl = (rows: readonly unknown[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'tesseract-report-'));
  ws = await loadWorkspace(root, {});
  await mkdir(ws.paths.receipts, { recursive: true });
  await mkdir(ws.paths.handoffs, { recursive: true });
  // One line that is not JSON at all (dropped by the reader) and one that is JSON but not a receipt (skipped and counted).
  await writeFile(ws.paths.authoringReceipts, `${jsonl(AUTHORING)}{not json\n{"tool":"app.act"}\n`);
  await writeFile(
    ws.paths.runReceipts,
    jsonl([run('r1', T('10:09:00'), '30001', 'failed'), run('r2', T('10:20:00'), '30001', 'passed'), run('r3', T('10:30:00'), '30001', 'flaky'), run('r2', T('10:20:00'), '30002', 'skipped')]),
  );
  await writeFile(
    ws.paths.reviewReceipts,
    jsonl([
      { at: T('10:10:00'), testCaseId: '30001', decision: 'accept', reviewer: 'qa.lead', facetsPromoted: ['policy-search:policy-number-input'], countsAsAccepted: true, locatorEdited: false },
      { at: T('10:11:00'), testCaseId: '30002', decision: 'reject', reviewer: 'qa.lead', facetsPromoted: [], countsAsAccepted: false, note: 'needs the row named' },
    ]),
  );
  await writeFile(
    ws.paths.emitRecords,
    jsonl([
      {
        at: T('10:00:09'),
        testCaseId: '30001',
        revision: 1,
        contentHash: 'sha256:a',
        specPath: 'tests/policy-search/30001-search.spec.ts',
        testTitle: 'ADO 30001 — Search for a policy',
        steps: [
          { index: 1, stepIdentifier: '2', title: 'Enter @policyNumber in search field', facets: ['policy-search:policy-number-input'] },
          { index: 2, stepIdentifier: '3', title: 'Verify search results show policy', facets: ['policy-search:policy-number-row'] },
          { index: 3, stepIdentifier: '4', title: 'Click Search button', facets: ['policy-search:search-button'] },
        ],
        facets: ['policy-search:policy-number-input', 'policy-search:policy-number-row', 'policy-search:search-button'],
        pageObjects: ['pages/policy-search.page.ts'],
        flows: [],
      },
      {
        at: T('10:05:02'),
        testCaseId: '30002',
        revision: 1,
        contentHash: 'sha256:b',
        specPath: 'tests/policy-search/30002-edit.spec.ts',
        steps: [
          { index: 1, stepIdentifier: '2', title: 'Click Search button', facets: ['policy-search:search-button'] },
          { index: 2, stepIdentifier: '3', title: 'Click Edit', facets: [] },
        ],
        facets: ['policy-search:search-button'],
        pageObjects: ['pages/policy-search.page.ts'],
        flows: [],
      },
    ]),
  );
  await writeFile(path.join(ws.paths.receipts, 'preflight.jsonl'), jsonl([{ at: T('11:00:00'), summary: { ok: 1, stale: 0, missing: 1, unchecked: 0 }, screens: [] }]));
  await writeFile(
    path.join(ws.paths.handoffs, '30002-2.json'),
    JSON.stringify({
      handoffId: 'h-30002-2-aa',
      testCaseId: '30002',
      stepIndex: 2,
      blockage: 'ambiguous-target',
      unresolvedIntent: 'Click Edit — 2 candidates fit "Edit"',
      attempted: ['memory.query', 'app.observe'],
      evidence: { snapshotId: 'snap-b' },
      candidates: [{ ref: 'c9', role: 'link', name: 'Edit', why: 'row POL-001' }, { ref: 'c11', role: 'link', name: 'Edit', why: 'row POL-003' }],
      nextMoves: ['Name the row in the step'],
      raisedAt: T('10:05:01'),
      status: 'open',
    }),
  );
  await saveScreen(ws, {
    screen: 'policy-search',
    facets: [
      facet('policy-search:policy-number-input', { role: 'textbox', namingSource: 'placeholder', locators: [{ strategy: 'role-name', role: 'textbox', name: 'Search Policy' }] }),
      facet('policy-search:policy-number-row', { kind: 'row', role: 'row', namingSource: 'content', parameter: 'policyNumber', locators: [{ strategy: 'row-text', value: '{policyNumber}' }], provenance: { mintedAt: T('10:00:06'), instrument: 'app.act' } }),
      facet('policy-search:search-button', { role: 'button', namingSource: 'content', provenance: { mintedAt: T('10:00:07'), instrument: 'flow.record' } }),
    ],
  });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the three numbers', () => {
  it('computes acceptance, survival and cost from the receipts', async () => {
    const numbers = await computeNumbers(ws, { now: () => new Date(T('12:00:00')) });
    expect(numbers.generatedAt).toBe(T('12:00:00'));
    expect(numbers.cases).toBe(2);
    expect(numbers.acceptance).toEqual({
      accepted: 1,
      emitted: 2,
      rate: 0.5,
      acceptedWithEdit: 0,
      rejected: 1,
      awaitingReview: 0,
      byReviewer: { 'qa.lead': { reviewed: 2, accepted: 1 } },
    });
    // Runs before acceptance do not count; the latest run (flaky, i.e. passed on retry) does.
    expect(numbers.survival).toEqual({ acceptedTests: 1, passingWithoutEdit: 1, rate: 1, flakeRate: 0.5, runsConsidered: 2, pending: 0, failing: 0, edited: 0, minRuns: 1 });
    // 30001: 10:00:00 → 10:00:10 (the review is not authoring); 30002: 10:05:00 → 10:05:03. Tokens deduplicated by prompt fingerprint.
    expect(numbers.cost.totalMinutes).toBeCloseTo(13 / 60, 6);
    expect(numbers.cost.totalTokens).toBe(1570);
    expect(numbers.cost.perAcceptedTest.minutes).toBeCloseTo(13 / 60, 6);
    expect(numbers.cost.perAcceptedTest.tokens).toBe(1570);
    expect(numbers.cost.firstVisit).toMatchObject({ cases: 1, accepted: 1, tokens: 1570 });
    expect(numbers.cost.firstVisit.minutes).toBeCloseTo(10 / 60, 6);
    expect(numbers.cost.revisit).toMatchObject({ cases: 1, accepted: 0, tokens: 0, perAcceptedTest: { minutes: null, tokens: null } });
  });

  it('computes the diagnostics', async () => {
    const { diagnostics: d } = await computeNumbers(ws);
    expect(d.handoffRate).toEqual({ count: 1, of: 5, rate: 0.2 });
    expect(d.handoffReasons).toEqual({ 'ambiguous-target': 1 });
    // value (content), visible on a row (content), bare visible (not content); two steps assert nothing.
    expect(d.assertionSubstance).toEqual({ substantive: 2, withAssertions: 3, withoutAssertions: 1, rate: 2 / 3 });
    expect(d.facetReuse).toEqual({ used: 4, reused: 1, rate: 0.25, onRevisits: { count: 1, of: 1, rate: 1 } });
    expect(d.preflightPassRate).toEqual({ ok: 3, stale: 1, missing: 0, rate: 0.75, runs: 1, perScreen: { 'policy-search': { ok: 3, stale: 1, missing: 0, rate: 0.75 } } });
    expect(d.locatorStrategyDistribution).toEqual({ 'role-name': 2, 'row-text': 1 });
    expect(d.namingSourceDistribution).toEqual({ content: 2, placeholder: 1 });
    expect(d.facetOrigins).toEqual({ 'app.act': 2, 'flow.record': 1 });
    expect(d.locatorEditRate).toEqual({ count: 0, of: 1, rate: 0 });
  });

  it('skips malformed lines and counts them', async () => {
    const set = await loadReceipts(ws);
    expect(set.authoring).toHaveLength(AUTHORING.length);
    expect(set.skipped.authoring).toBe(1);
    expect(set.facets).toHaveLength(3);
    expect(set.handoffs).toHaveLength(1);
  });

  it('falls back to the kept preflight log when no preflight call was receipted', async () => {
    const set = await loadReceipts(ws);
    const numbers = computeNumbersFrom({ ...set, authoring: set.authoring.filter((l) => l.tool !== 'memory.preflight') });
    expect(numbers.diagnostics.preflightPassRate).toMatchObject({ ok: 1, stale: 0, missing: 1, rate: 0.5, runs: 1 });
  });

  it('says n/a, not zero, when there is nothing to divide by', () => {
    const numbers = computeNumbersFrom(EMPTY_RECEIPTS, { now: () => new Date(T('12:00:00')) });
    expect(numbers.acceptance.rate).toBeNull();
    expect(numbers.survival.rate).toBeNull();
    expect(numbers.cost.perAcceptedTest).toEqual({ minutes: null, tokens: null });
    const page = renderNumbersMarkdown(numbers);
    expect(page).toMatch(/\| Acceptance \| n\/a \|/);
    expect(page).toMatch(/no preflight yet/);
  });

  it('counts an accepted test edited since acceptance, or without enough runs, as not surviving', async () => {
    const set = await loadReceipts(ws);
    const edited = computeNumbersFrom({
      ...set,
      authoring: [...set.authoring, line({ at: T('10:15:00'), tool: 'test.emit', testCase: '30001', input: { testCase: { id: '30001' }, steps: [] }, output: { written: true, diff: '-old\n+new' } })],
    });
    expect(edited.survival).toMatchObject({ passingWithoutEdit: 0, edited: 1, rate: 0 });
    const strict = computeNumbersFrom(set, { minRuns: 3 });
    expect(strict.survival).toMatchObject({ passingWithoutEdit: 0, pending: 1 });
  });

  it('renders the page a QA lead reads', async () => {
    const page = renderNumbersMarkdown(await computeNumbers(ws));
    expect(page).toMatch(/^# Tesseract — the three numbers/);
    expect(page).toMatch(/\| Acceptance \| 50% \| 1 of 2 emitted tests accepted; 1 rejected; 0 awaiting review \|/);
    expect(page).toMatch(/\| Survival \| 100% \| 1 of 1 accepted test still passing without edits/);
    expect(page).toMatch(/flake rate 50% over 2 runs/);
    expect(page).toMatch(/1,570 tokens per accepted test/);
    expect(page).toMatch(/\*\*Handoff rate:\*\* 1 of 5 steps \(20%\)/);
    expect(page).toMatch(/\*\*Assertion substance:\*\* 2 of 3 steps/);
    expect(page).toMatch(/policy-search: 75%/);
    expect(page).toMatch(/Reviewers: qa\.lead 1\/2 accepted/);
  });
});

describe('attribution', () => {
  it('gives a call without a decision to the case whose page it worked on', () => {
    const attributed = attribute(AUTHORING);
    const observe = attributed.find((a) => a.line.tool === 'app.observe')!;
    expect(observe.caseId).toBe('30001');
    expect(attributed.find((a) => a.line.tool === 'memory.preflight')!.caseId).toBeUndefined();
  });
});

describe('the per-test authoring receipt', () => {
  it('explains one test: observations, decisions with reasons and rejections, facets, runs, review', async () => {
    const page = await authoringReceiptMarkdown(ws, '30001');
    expect(page).toMatch(/^# ADO 30001 — Search for a policy/);
    expect(page).toMatch(/spec `tests\/policy-search\/30001-search\.spec\.ts`/);
    expect(page).toMatch(/\*\*Review:\*\* accept by qa\.lead/);
    expect(page).toMatch(/\*\*Latest run:\*\* flaky/);
    expect(page).toMatch(/1,570 tokens · models claude-x/);
    expect(page).toMatch(/### 1\. Enter @policyNumber in search field/);
    expect(page).toMatch(/### 3\. Click Search button\n\nFacets in the spec: policy-search:search-button\n\n- \(no calls recorded for this step\)/);
    expect(page).not.toMatch(/review\.record succeeded/);
    expect(page).toMatch(/app\.act fill on candidate c1 with "@policyNumber" → succeeded via `page\.getByRole\('search'\)/);
    expect(page).toMatch(/chose c1; because the only textbox in the search landmark; rejected c3; host claude-x \(1000 prompt \/ 50 completion tokens\)/);
    expect(page).toMatch(/memory\.mint policy-search:policy-number-input "Policy number search field" \(new, candidate\)/);
    expect(page).toMatch(/app\.observe scope search → 3 candidates on http:\/\/app\/PolicySearch \(snap-a\); best hint c1 0\.90/);
    expect(page).toMatch(/\| policy-search:policy-number-row \| policy-search:policy-number-row \| candidate \| row-text \{policyNumber\} \|/);
    expect(page).toMatch(/\| r3 \| flaky \| 1\.5 s \|/);
    expect(page).toMatch(/\| r1 \| failed \| 1\.5 s \| drift on policy-search:search-button: locator not found \|/);
  });

  it('lists the handoffs with candidates and next moves', async () => {
    const page = await authoringReceiptMarkdown(ws, '30002');
    expect(page).toMatch(/\*\*Step 2, ambiguous-target\*\* \(open, h-30002-2-aa\)/);
    expect(page).toMatch(/Candidates: c9 link "Edit" \(row POL-001\); c11 link "Edit" \(row POL-003\)/);
    expect(page).toMatch(/Next: Name the row in the step/);
    expect(page).toMatch(/\*\*Review:\*\* reject by qa\.lead .* — needs the row named/);
    expect(page).toMatch(/handoff\.raise ambiguous-target → h-30002-2-aa/);
  });

  it('says so when no receipt mentions the case', async () => {
    const set = await loadReceipts(ws);
    expect(authoringReceiptFrom(set, '99999')).toBe('# ADO 99999\n\nNo receipts mention this test case yet.\n');
  });
});
