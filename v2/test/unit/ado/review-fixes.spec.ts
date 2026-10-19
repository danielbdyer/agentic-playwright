/**
 * Review findings on the Azure DevOps side:
 *   16  per-step results are published by the ADO step the spec ran (its
 *       emit record's stepIdentifier), not by position in a case fetched
 *       since, and say which revision ran;
 *   20  plain-text step fields (isformatted="false") keep their text;
 *   24  results built from receipts pass the PII gate.
 */
import { describe, expect, it } from 'vitest';
import type { RunReceipt, TestCase } from '../../../src/contract/schemas.js';
import { parseStepsXml, type ParsedStep } from '../../../src/ado/fields.js';
import { receiptsToPublishResults } from '../../../src/ado/results.js';
import type { EmitRecord } from '../../../src/run/emit-records.js';

const SPEC = 'tests/policy/10001-search.spec.ts';

/** Revision 2 of the case: ADO inserted step 6 at position 2 after the spec was emitted from revision 1. */
const CASE_REV2: TestCase = {
  id: '10001',
  title: 'Search',
  revision: 2,
  contentHash: 'sha256:rev2',
  tags: [],
  steps: [
    { index: 1, stepIdentifier: '2', action: 'Open search', expected: '' },
    { index: 2, stepIdentifier: '6', action: 'Accept the cookie banner', expected: '' },
    { index: 3, stepIdentifier: '3', action: 'Enter the policy', expected: '' },
    { index: 4, stepIdentifier: '4', action: 'Click Search', expected: '' },
    { index: 5, stepIdentifier: '5', action: 'Check the row', expected: '' },
  ],
  parameters: [],
  dataRows: [],
};

const EMITTED_REV1: EmitRecord = {
  at: '2026-10-19T09:00:00.000Z',
  testCaseId: '10001',
  revision: 1,
  contentHash: 'sha256:rev1',
  specPath: SPEC,
  steps: [
    { index: 1, stepIdentifier: '2', title: 'Open search', facets: [] },
    { index: 2, stepIdentifier: '3', title: 'Enter the policy', facets: [] },
    { index: 3, stepIdentifier: '4', title: 'Click Search', facets: [] },
    { index: 4, stepIdentifier: '5', title: 'Check the row', facets: [] },
  ],
  facets: [],
  pageObjects: [],
  flows: [],
};

/** The run of the rev-1 spec: step 3 (identifier 4, "Click Search") failed. */
const RECEIPT: RunReceipt = {
  runId: 'run-1',
  at: '2026-10-19T10:00:00.000Z',
  testCase: '10001',
  title: 'ADO 10001 — Search',
  spec: SPEC,
  outcome: 'failed',
  durationMs: 100,
  retries: 0,
  error: { message: 'Timeout waiting for the button; Received: "jane.roe@acme.com"', family: 'not-found', failureType: 'drift' },
  steps: [
    { index: 1, title: 'Open search', outcome: 'passed', durationMs: 10, facets: [] },
    { index: 2, title: 'Enter the policy', outcome: 'passed', durationMs: 10, facets: [] },
    { index: 3, title: 'Click Search', outcome: 'failed', durationMs: 10, facets: [], error: 'waiting for jane.roe@acme.com' },
    { index: 4, title: 'Check the row', outcome: 'skipped', durationMs: 0, facets: [] },
  ],
};

describe('finding 16: per-step results follow the step identifiers the spec ran', () => {
  it('maps receipt steps through the emit record in effect at run time, not by position in the newer case', () => {
    const [result] = receiptsToPublishResults([RECEIPT], [CASE_REV2], { emits: [EMITTED_REV1] });
    expect(result!.steps!.map((s) => [s.stepIdentifier, s.outcome])).toEqual([
      ['2', 'Passed'],
      ['3', 'Passed'],
      ['4', 'Failed'],
      ['5', 'NotExecuted'],
    ]);
    // Step 6 never ran: it gets no result. The revision is the one the spec was emitted from.
    expect(result!.steps!.some((s) => s.stepIdentifier === '6')).toBe(false);
    expect(result!.testCaseRevision).toBe(1);
  });

  it('uses the record that was current when the run happened, not one emitted later', () => {
    const reEmitted: EmitRecord = {
      ...EMITTED_REV1,
      at: '2026-10-19T11:00:00.000Z',
      revision: 2,
      steps: CASE_REV2.steps.map((s) => ({ index: s.index, stepIdentifier: s.stepIdentifier, title: s.action, facets: [] })),
    };
    const [result] = receiptsToPublishResults([RECEIPT], [CASE_REV2], { emits: [EMITTED_REV1, reEmitted] });
    expect(result!.steps!.find((s) => s.stepIdentifier === '4')?.outcome).toBe('Failed');
    expect(result!.testCaseRevision).toBe(1);
  });

  it('drops a step the newer case no longer has', () => {
    const removed: TestCase = { ...CASE_REV2, steps: CASE_REV2.steps.filter((s) => s.stepIdentifier !== '5') };
    const [result] = receiptsToPublishResults([RECEIPT], [removed], { emits: [EMITTED_REV1] });
    expect(result!.steps!.map((s) => s.stepIdentifier)).toEqual(['2', '3', '4']);
  });
});

describe('finding 24: published text passes the PII gate', () => {
  it('redacts the error message and step errors', () => {
    const [result] = receiptsToPublishResults([RECEIPT], [CASE_REV2], { emits: [EMITTED_REV1], pii: 'standard' });
    expect(JSON.stringify(result)).not.toContain('jane.roe@acme.com');
    expect(result!.errorMessage).toContain('<email>');
  });
});

describe('finding 20: plain-text step fields keep their text', () => {
  const stepsOf = (xml: string): readonly ParsedStep[] => parseStepsXml(xml).nodes.filter((node): node is ParsedStep => node.kind === 'step');

  it('reads isformatted="false" as XML-decoded plain text, not HTML', () => {
    const [step] = stepsOf(
      '<steps><step id="2" type="ActionStep">' +
        '<parameterizedString isformatted="false">Press &lt;Enter&gt; in the Amount field</parameterizedString>' +
        '<parameterizedString isformatted="false">Total shows a &lt; b and c &gt; d</parameterizedString>' +
        '</step></steps>',
    );
    expect(step).toMatchObject({ action: 'Press <Enter> in the Amount field', expected: 'Total shows a < b and c > d' });
  });

  it('still reads formatted (and unmarked) fields as HTML', () => {
    const [formatted] = stepsOf('<steps><step id="2"><parameterizedString isformatted="true">&lt;P&gt;Click &lt;B&gt;Save&lt;/B&gt;&lt;/P&gt;</parameterizedString></step></steps>');
    expect(formatted!.action).toBe('Click Save');
    const [unmarked] = stepsOf('<steps><step id="2"><parameterizedString>&lt;P&gt;Look&lt;/P&gt;</parameterizedString></step></steps>');
    expect(unmarked!.action).toBe('Look');
  });
});
