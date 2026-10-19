/**
 * JSON report → outcomes → run receipts, on a report shaped like Playwright
 * 1.55's (a describe-level annotation inherited by data-row tests, a fixme
 * raised inside a step, a test-level timeout whose step carries the call
 * log, a flaky retry).
 */
import { describe, expect, it } from 'vitest';
import type { Facet, TestCase } from '../../../src/contract/schemas.js';
import type { EmitRecord } from '../../../src/run/emit-records.js';
import { parseProgress, parseReport } from '../../../src/run/report.js';
import { receiptFor, summarize, type ReceiptContext } from '../../../src/run/receipts.js';

const ROOT = '/ws';
const ann = (type: string, description: string) => ({ type, description, location: { file: '/ws/tests/x.spec.ts', line: 1, column: 1 } });

const report = {
  config: { rootDir: '/ws/tests', configFile: '/ws/playwright.config.ts' },
  suites: [
    {
      title: 'login/20001-sign-in.spec.ts',
      file: 'login/20001-sign-in.spec.ts',
      specs: [
        {
          title: 'ADO 20001 — Sign in screen shows the form',
          file: 'login/20001-sign-in.spec.ts',
          line: 5,
          tests: [
            {
              annotations: [ann('ado-id', '20001'), ann('ado-steps', '["2","3","4"]')],
              expectedStatus: 'passed',
              status: 'expected',
              projectName: '',
              results: [{ status: 'passed', duration: 812.4, retry: 0, errors: [], steps: [{ title: 'Open the Sign in screen', duration: 400 }, { title: 'Check the Username field', duration: 20 }, { title: 'Check the Log in button', duration: 15 }], attachments: [] }],
            },
          ],
        },
      ],
      suites: [],
    },
    {
      title: 'policy-search/20002-search.spec.ts',
      file: 'policy-search/20002-search.spec.ts',
      specs: [
        {
          title: 'ADO 20002 — Search for a policy',
          file: 'policy-search/20002-search.spec.ts',
          line: 5,
          tests: [
            {
              annotations: [ann('ado-id', '20002'), ann('ado-steps', '["2","3","4"]')],
              expectedStatus: 'passed',
              status: 'unexpected',
              results: [
                {
                  status: 'timedOut',
                  duration: 2000,
                  retry: 0,
                  error: { message: '\u001b[31mTest timeout of 2000ms exceeded.\u001b[39m' },
                  errors: [{ message: 'Test timeout of 2000ms exceeded.' }],
                  steps: [
                    { title: 'Open Policy Search', duration: 300 },
                    {
                      title: 'Enter POL-001 in the search field',
                      duration: 1700,
                      error: { message: "Error: locator.fill: Test timeout of 2000ms exceeded.\nCall log:\n  - waiting for getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })\n" },
                    },
                  ],
                  attachments: [{ name: 'trace', contentType: 'application/zip', path: '/ws/.tesseract/tmp/run-1/results/x/trace.zip' }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'policy-search/20003-rows.spec.ts',
      file: 'policy-search/20003-rows.spec.ts',
      specs: [],
      suites: [
        {
          title: 'ADO 20003 — Rows',
          file: 'policy-search/20003-rows.spec.ts',
          specs: [
            {
              title: 'POL-002',
              file: 'policy-search/20003-rows.spec.ts',
              line: 9,
              tests: [
                {
                  annotations: [ann('ado-id', '20003'), ann('ado-steps', '["2","3"]'), ann('ado-data-row', '2')],
                  expectedStatus: 'passed',
                  status: 'skipped',
                  results: [
                    {
                      status: 'skipped',
                      duration: 30,
                      retry: 0,
                      errors: [],
                      steps: [{ title: 'Open Policy Search', duration: 20 }, { title: 'Click Edit', duration: 1, error: { message: 'Error: Test is skipped: Needs a human (handoff h-20003-3-0a1b2c3d)' } }],
                      attachments: [],
                      annotations: [{ type: 'fixme', description: 'Needs a human (handoff h-20003-3-0a1b2c3d)' }],
                    },
                  ],
                },
              ],
            },
            {
              title: 'POL-003',
              file: 'policy-search/20003-rows.spec.ts',
              line: 9,
              tests: [
                {
                  annotations: [ann('ado-id', '20003'), ann('ado-data-row', '3')],
                  expectedStatus: 'passed',
                  status: 'flaky',
                  results: [
                    { status: 'failed', duration: 50, retry: 0, error: { message: 'boom' }, errors: [], steps: [], attachments: [] },
                    { status: 'passed', duration: 40, retry: 1, errors: [], steps: [], attachments: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  errors: [],
  stats: { expected: 1, unexpected: 1, skipped: 1, flaky: 1 },
};

const provenance = { mintedAt: '2026-10-19T00:00:00Z', instrument: 'app.observe' as const };
const searchInput: Facet = {
  id: 'policy-search:search-input',
  screen: 'policy-search',
  kind: 'element',
  displayName: 'search field',
  aliases: [],
  locators: [{ strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } }],
  status: 'candidate',
  provenance,
};

const record = (testCaseId: string, specPath: string, steps: EmitRecord['steps']): EmitRecord => ({
  at: '2026-10-19T00:00:00Z',
  testCaseId,
  revision: 1,
  contentHash: 'sha256:x',
  specPath,
  steps,
  facets: [...new Set(steps.flatMap((s) => s.facets))],
  pageObjects: [],
  flows: [],
});

const ctx: ReceiptContext = {
  runId: 'run-1',
  at: '2026-10-19T00:00:00Z',
  root: ROOT,
  emitBySpec: new Map([
    ['tests/login/20001-sign-in.spec.ts', record('20001', 'tests/login/20001-sign-in.spec.ts', [
      { index: 1, stepIdentifier: '2', title: 'Open the Sign in screen', facets: ['login:sign-in-heading'] },
      { index: 2, stepIdentifier: '3', title: 'Check the Username field', facets: ['login:username-input'] },
      { index: 3, stepIdentifier: '4', title: 'Check the Log in button', facets: ['login:log-in-button'] },
    ])],
    ['tests/policy-search/20002-search.spec.ts', record('20002', 'tests/policy-search/20002-search.spec.ts', [
      { index: 1, stepIdentifier: '2', title: 'Open Policy Search', facets: ['policy-search:heading'] },
      { index: 2, stepIdentifier: '3', title: 'Enter POL-001 in the search field', facets: ['policy-search:search-input'] },
      { index: 3, stepIdentifier: '4', title: 'Click Search', facets: ['policy-search:search-button'] },
    ])],
    ['tests/policy-search/20003-rows.spec.ts', record('20003', 'tests/policy-search/20003-rows.spec.ts', [
      { index: 1, stepIdentifier: '2', title: 'Open Policy Search', facets: [] },
      { index: 2, stepIdentifier: '3', title: 'Click Edit', facets: [] },
    ])],
  ]),
  facets: new Map([[searchInput.id, searchInput]]),
  cases: new Map<string, TestCase>(),
};

describe('parseReport', () => {
  it('flattens suites into outcomes with describe titles, inherited annotations, and the last attempt', () => {
    const parsed = parseReport(JSON.stringify(report));
    expect(parsed.outcomes).toHaveLength(4);
    const rows = parsed.outcomes.filter((o) => o.file.endsWith('20003-rows.spec.ts'));
    expect(rows.map((o) => o.titlePath)).toEqual([['ADO 20003 — Rows', 'POL-002'], ['ADO 20003 — Rows', 'POL-003']]);
    expect(rows[0]!.annotations.map((a) => a.type)).toEqual(['ado-id', 'ado-steps', 'ado-data-row', 'fixme']);
    expect(rows[1]).toMatchObject({ status: 'flaky', lastStatus: 'passed', retries: 1, durationMs: 90 });
    expect(parsed.outcomes[0]!.file).toBe('/ws/tests/login/20001-sign-in.spec.ts');
  });

  it('refuses something that is not a Playwright report', () => {
    expect(() => parseReport('{"hello":1}')).toThrow(/unexpected shape/);
    expect(() => parseReport('not json')).toThrow(/not valid JSON/);
  });

  it('reads progress lines and skips malformed ones', () => {
    const line = JSON.stringify({ file: '/ws/a.spec.ts', titlePath: ['t'], annotations: [], status: 'expected', lastStatus: 'passed', durationMs: 1, retries: 0, steps: [] });
    expect(parseProgress(`${line}\n{oops\n${line}\n`)).toHaveLength(2);
  });
});

describe('receiptFor', () => {
  const outcomes = parseReport(JSON.stringify(report)).outcomes;
  const receipts = outcomes.map((o) => receiptFor(o, ctx));

  it('maps a passing test: ado id, ADO step indexes and facets from the emit record', () => {
    expect(receipts[0]).toMatchObject({
      runId: 'run-1',
      testCase: '20001',
      title: 'ADO 20001 — Sign in screen shows the form',
      spec: 'tests/login/20001-sign-in.spec.ts',
      outcome: 'passed',
      durationMs: 812,
      retries: 0,
    });
    expect(receipts[0]!.steps.map((s) => [s.index, s.outcome, s.facets])).toEqual([
      [1, 'passed', ['login:sign-in-heading']],
      [2, 'passed', ['login:username-input']],
      [3, 'passed', ['login:log-in-button']],
    ]);
    expect(receipts[0]!.error).toBeUndefined();
  });

  it('classifies a timed-out step as drift on its facet, from the step\'s call log, and reports the steps that never ran', () => {
    const receipt = receipts[1]!;
    expect(receipt.outcome).toBe('timedOut');
    expect(receipt.error).toMatchObject({ family: 'not-found', failureType: 'drift', facet: 'policy-search:search-input' });
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'failed'], [3, 'skipped']]);
    expect(receipt.steps[1]!.error).toMatch(/locator\.fill: Test timeout/);
    expect(receipt.trace).toBe('.tesseract/tmp/run-1/results/x/trace.zip');
  });

  it('reports a fixme inside a step as that step fixme and the test skipped, with a 0-based data row', () => {
    const receipt = receipts[2]!;
    expect(receipt).toMatchObject({ outcome: 'skipped', dataRow: 1, title: 'ADO 20003 — Rows › POL-002' });
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'fixme']]);
    expect(receipt.error).toBeUndefined();
  });

  it('reports a flaky test as flaky with its retries, falling back to step positions without an ado-steps annotation', () => {
    expect(receipts[3]).toMatchObject({ outcome: 'flaky', retries: 1, dataRow: 2 });
    expect(summarize(receipts)).toEqual({ passed: 1, failed: 1, skipped: 1, flaky: 1 });
  });

  it('falls back to the spec file name for the test case and to positions for steps when nothing was emitted', () => {
    const outcome = { ...outcomes[0]!, file: '/ws/tests/other/30001-hand-written.spec.ts', annotations: [] };
    const receipt = receiptFor(outcome, ctx);
    expect(receipt.testCase).toBe('30001');
    expect(receipt.steps.map((s) => [s.index, s.facets.length])).toEqual([[1, 0], [2, 0], [3, 0]]);
  });

  it('maps shadow files back to the workspace spec', () => {
    const shadow = { ...outcomes[0]!, file: '/ws/.tesseract/tmp/repair-x/specs/tests/login/20001-sign-in.spec.ts' };
    const receipt = receiptFor(shadow, { ...ctx, originalOf: (file) => file.replace('/.tesseract/tmp/repair-x/specs', '') });
    expect(receipt.spec).toBe('tests/login/20001-sign-in.spec.ts');
    expect(receipt.steps[0]!.facets).toEqual(['login:sign-in-heading']);
  });
});
