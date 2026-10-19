/**
 * Review findings on receipts and failure classification, without a browser:
 * report steps map to ADO steps by title (a human's own test.step in a keep
 * region takes no ADO step's place), drift is blamed on the most specific
 * locator the error names, and receipts pass the PII gate.
 */
import { describe, expect, it } from 'vitest';
import type { Facet, RunReceipt } from '../../../src/contract/schemas.js';
import type { EmitRecord } from '../../../src/run/emit-records.js';
import { classifyRunFailure, facetNamedBy } from '../../../src/run/classify.js';
import { gateReceipt, receiptFor, type ReceiptContext } from '../../../src/run/receipts.js';
import type { TestOutcome } from '../../../src/run/report.js';

const provenance = { mintedAt: '2026-10-19T00:00:00Z', instrument: 'app.observe' as const };
const facetOf = (id: string, locator: Facet['locators'][number]): Facet => ({
  id,
  screen: id.split(':')[0]!,
  kind: 'element',
  displayName: id.split(':')[1]!,
  aliases: [],
  locators: [locator],
  status: 'trusted',
  provenance,
});

const SPEC = 'tests/policy-search/20002-search.spec.ts';

const record: EmitRecord = {
  at: '2026-10-19T00:00:00Z',
  testCaseId: '20002',
  revision: 1,
  contentHash: 'sha256:x',
  specPath: SPEC,
  steps: [
    { index: 1, stepIdentifier: '2', title: 'Navigate to Policy Search', facets: ['policy-search:heading'] },
    { index: 2, stepIdentifier: '3', title: 'Enter POL-001 in the search field', facets: ['policy-search:search-input'] },
    { index: 3, stepIdentifier: '4', title: 'Click Search', facets: ['policy-search:search-button'] },
  ],
  facets: ['policy-search:heading', 'policy-search:search-input', 'policy-search:search-button'],
  pageObjects: [],
  flows: [],
};

const ctx: ReceiptContext = {
  runId: 'run-1',
  at: '2026-10-19T00:00:00Z',
  root: '/ws',
  emitBySpec: new Map([[SPEC, record]]),
  facets: new Map(),
  cases: new Map(),
};

const outcome = (steps: TestOutcome['steps'], error?: string): TestOutcome => ({
  file: `/ws/${SPEC}`,
  titlePath: ['ADO 20002 — Search for a policy'],
  annotations: [{ type: 'ado-id', description: '20002' }, { type: 'ado-steps', description: '["2","3","4"]' }],
  status: 'unexpected',
  lastStatus: 'failed',
  durationMs: 100,
  retries: 0,
  ...(error !== undefined ? { error } : {}),
  steps,
});

describe('finding 15: report steps map to ADO steps by title', () => {
  it('a human test.step between emitted steps takes no ADO step and does not shift the later ones', () => {
    const receipt = receiptFor(
      outcome(
        [
          { title: 'Navigate to Policy Search', durationMs: 10 },
          { title: 'My extra check', durationMs: 5, error: 'Error: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 3' },
        ],
        'Error: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 3',
      ),
      ctx,
    );
    expect(receipt.steps.map((s) => [s.index, s.title, s.outcome])).toEqual([
      [1, 'Navigate to Policy Search', 'passed'],
      [2, 'Enter POL-001 in the search field', 'skipped'],
      [3, 'Click Search', 'skipped'],
    ]);
    expect(receipt.steps[1]!.facets).toEqual(['policy-search:search-input']);
    expect(receipt.outcome).toBe('failed');
    expect(receipt.error).toMatchObject({ family: 'assertion-like' });
  });

  it('a human step after an emitted step that failed leaves the failure on the right ADO step', () => {
    const receipt = receiptFor(
      outcome([
        { title: 'Navigate to Policy Search', durationMs: 10 },
        { title: 'Wait for the grid (kept by a human)', durationMs: 5 },
        { title: 'Enter POL-001 in the search field', durationMs: 5, error: "Error: locator.fill: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('textbox')" },
      ]),
      ctx,
    );
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'failed'], [3, 'skipped']]);
  });

  it('a spec without an emit record still maps by position through ado-steps', () => {
    const receipt = receiptFor(outcome([{ title: 'Anything', durationMs: 1 }, { title: 'Else', durationMs: 1 }]), { ...ctx, emitBySpec: new Map() });
    expect(receipt.steps.map((s) => [s.index, s.title])).toEqual([[1, 'Anything'], [2, 'Else']]);
  });
});

describe('finding 17: drift is blamed on the most specific facet the error names', () => {
  const save = facetOf('p:save', { strategy: 'role-name', role: 'button', name: 'Save' });
  const dialogSave = facetOf('p:dialog-save', { strategy: 'role-name', role: 'button', name: 'Save', scope: { landmark: 'dialog' } });
  const error = "Error: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('dialog').getByRole('button', { name: 'Save', exact: true })\n";

  it('the scoped dialog facet, not the page Save button whose expression is a substring', () => {
    expect(facetNamedBy(error, [save, dialogSave], [])).toBe('p:dialog-save');
    expect(facetNamedBy(error, [dialogSave, save], [])).toBe('p:dialog-save');
    expect(classifyRunFailure(error, [save, dialogSave])).toMatchObject({ family: 'not-found', failureType: 'drift', facet: 'p:dialog-save' });
  });

  it('also when the more specific facet is only used elsewhere in the test', () => {
    expect(facetNamedBy(error, [save], [dialogSave])).toBe('p:dialog-save');
  });

  it('the page button when that is what the error names', () => {
    const page = "Error: locator.click: Timeout 5000ms exceeded.\nCall log:\n  - waiting for getByRole('button', { name: 'Save', exact: true })\n";
    expect(facetNamedBy(page, [save, dialogSave], [])).toBe('p:save');
  });
});

describe('finding 24: receipts pass the PII gate', () => {
  const raw: RunReceipt = {
    runId: 'run-1',
    at: '2026-10-19T00:00:00Z',
    testCase: '20002',
    title: 'ADO 20002 — Welcome',
    spec: SPEC,
    outcome: 'failed',
    durationMs: 10,
    retries: 0,
    error: { message: 'expect(locator).toHaveText(expected) failed; Expected: "Welcome"; Received: "Welcome, Jane Roe (jane.roe@acme.com)"', family: 'assertion-like', failureType: 'candidate-bug' },
    steps: [{ index: 1, title: 'Check the greeting', outcome: 'failed', durationMs: 5, facets: [], error: 'Received string: "Welcome, Jane Roe (jane.roe@acme.com)"' }],
    paused: { repairId: 'r-1', cdpEndpoint: 'http://127.0.0.1:9222', url: 'https://app.example.com/Home?user=jane.roe@acme.com&ssn=123-45-6789#top', failingStep: 'Check the greeting' },
  };

  it('redacts error text, step errors and the paused URL; leaves ids and titles alone', () => {
    const gated = gateReceipt(raw, 'standard');
    expect(JSON.stringify(gated)).not.toContain('jane.roe@acme.com');
    expect(JSON.stringify(gated)).not.toContain('123-45-6789');
    expect(gated.error!.message).toContain('Welcome, Jane Roe (<email>)');
    expect(gated.steps[0]!.error).toBe('Received string: "Welcome, Jane Roe (<email>)"');
    expect(gated.paused!.url).toBe('https://app.example.com/Home?user=<redacted>&ssn=<redacted>#<redacted>');
    expect({ ...gated, error: undefined, steps: undefined, paused: undefined }).toEqual({ ...raw, error: undefined, steps: undefined, paused: undefined });
    expect(gated.paused!.cdpEndpoint).toBe(raw.paused!.cdpEndpoint);
  });

  it('passes everything through with pii off', () => {
    expect(gateReceipt(raw, 'off')).toEqual(raw);
  });
});
