import { describe, expect, it } from 'vitest';
import { TestCaseSchema } from '../../../src/contract/schemas.js';
import { fingerprintOf } from '../../../src/core/hash.js';
import {
  buildTestCase,
  compareCaseIds,
  contentHashOf,
  expandSteps,
  parseSharedStep,
  sharedStepRefsOf,
  type SharedStepDefinition,
  type WorkItem,
} from '../../../src/ado/testcase.js';
import { parseStepsXml } from '../../../src/ado/fields.js';
import { dataSourceXml, parametersXml, stepsXml } from '../../support/mock-ado.js';

const webUrl = (id: number): string => `https://dev.azure.com/acme/demo/_workitems/edit/${id}`;

const shared = (id: number, rev: number, xml: string, parameters: readonly string[] = []): SharedStepDefinition =>
  parseSharedStep({
    id,
    rev,
    fields: { 'System.Title': `Shared ${id}`, 'Microsoft.VSTS.TCM.Steps': xml, 'Microsoft.VSTS.TCM.Parameters': parametersXml(parameters) },
  });

const LOGIN = shared(
  900,
  6,
  stepsXml([
    { id: 2, action: 'Open the login page', expected: 'Login form shows' },
    { id: 5, action: 'Sign in as @username', expected: 'Home page shows' },
  ]),
  ['username', 'policyNumber'],
);

const caseItem = (overrides: Partial<Record<string, unknown>> = {}, rev = 3): WorkItem => ({
  id: 10001,
  rev,
  fields: {
    'System.Title': 'Verify policy search returns matching policy',
    'System.State': 'Ready',
    'System.Tags': 'smoke; billing',
    'System.AreaPath': 'demo\\policy',
    'System.IterationPath': 'demo\\sprint-1',
    'Microsoft.VSTS.Common.Priority': 1,
    'Microsoft.VSTS.TCM.Steps': stepsXml([
      { compref: 3, ref: 900 },
      { id: 6, action: 'Search for @policyNumber', expected: 'Results show' },
      { compref: 7, ref: 901, children: [{ id: 9, action: 'Verify the row', expected: 'Row shows @policyNumber' }] },
    ]),
    'Microsoft.VSTS.TCM.Parameters': parametersXml(['policyNumber']),
    'Microsoft.VSTS.TCM.LocalDataSource': dataSourceXml([{ policyNumber: 'POL-001', username: 'qa' }, { policyNumber: 'POL-002' }]),
    ...overrides,
  },
});

const sharedMap = (entries: readonly (readonly [number, SharedStepDefinition | null])[]): ReadonlyMap<number, SharedStepDefinition | null> => new Map(entries);

describe('shared step expansion', () => {
  it('inlines shared steps with "<comprefId>;<childStepId>" identifiers, keeps id gaps, and renumbers 1..N', () => {
    const nodes = parseStepsXml(String(caseItem().fields['Microsoft.VSTS.TCM.Steps'])).nodes;
    expect(sharedStepRefsOf(nodes)).toEqual([900, 901]);
    const expanded = expandSteps(nodes, sharedMap([[900, LOGIN], [901, null]]));
    expect(expanded.steps).toEqual([
      { index: 1, stepIdentifier: '3;2', action: 'Open the login page', expected: 'Login form shows', sharedStepId: 900 },
      { index: 2, stepIdentifier: '3;5', action: 'Sign in as @username', expected: 'Home page shows', sharedStepId: 900 },
      { index: 3, stepIdentifier: '6', action: 'Search for @policyNumber', expected: 'Results show' },
      { index: 4, stepIdentifier: '9', action: 'Verify the row', expected: 'Row shows @policyNumber' },
    ]);
    expect(expanded.sharedStepRevisions).toEqual({ '900': 6 });
    expect(expanded.sharedParameters).toEqual(['username', 'policyNumber']);
    expect(expanded.warnings).toEqual(['shared step 901 (step 7) could not be fetched (deleted, or no access); its steps are missing']);
  });

  it('expands the same shared step twice under different compref ids', () => {
    const nodes = parseStepsXml(stepsXml([{ compref: 2, ref: 900 }, { compref: 8, ref: 900 }])).nodes;
    const expanded = expandSteps(nodes, sharedMap([[900, LOGIN]]));
    expect(expanded.steps.map((step) => step.stepIdentifier)).toEqual(['2;2', '2;5', '8;2', '8;5']);
    expect(expanded.steps.map((step) => step.index)).toEqual([1, 2, 3, 4]);
  });

  it('does not follow a compref inside a shared step, but keeps that shared step’s own steps', () => {
    const nested = shared(902, 1, stepsXml([{ id: 1, action: 'First' }, { compref: 2, ref: 903, children: [{ id: 3, action: 'Third' }] }]));
    const expanded = expandSteps(parseStepsXml(stepsXml([{ compref: 4, ref: 902 }])).nodes, sharedMap([[902, nested]]));
    expect(expanded.steps.map((step) => step.stepIdentifier)).toEqual(['4;1', '4;3']);
    expect(expanded.warnings[0]).toMatch(/shared step 902 itself references shared step 903; nested shared steps are not expanded/);
  });
});

describe('buildTestCase', () => {
  it('builds a TestCase that matches the contract schema exactly', () => {
    const testCase = buildTestCase(caseItem(), {
      sharedSteps: sharedMap([[900, LOGIN], [901, null]]),
      webUrl,
      points: [{ pointId: 1203, planId: 7, suiteId: 8, configurationName: 'Windows 10' }],
    });
    expect(TestCaseSchema.strict().parse(testCase)).toEqual(testCase);
    expect(testCase).toMatchObject({
      id: '10001',
      title: 'Verify policy search returns matching policy',
      revision: 3,
      state: 'Ready',
      priority: 1,
      areaPath: 'demo\\policy',
      iterationPath: 'demo\\sprint-1',
      tags: ['smoke', 'billing'],
      parameters: ['policyNumber', 'username'],
      dataRows: [
        { policyNumber: 'POL-001', username: 'qa' },
        { policyNumber: 'POL-002', username: '' },
      ],
      url: 'https://dev.azure.com/acme/demo/_workitems/edit/10001',
      points: [{ pointId: 1203, planId: 7, suiteId: 8, configurationName: 'Windows 10' }],
    });
    expect(testCase.steps).toHaveLength(4);
    expect(testCase.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(testCase.warnings).toEqual(['shared step 901 (step 7) could not be fetched (deleted, or no access); its steps are missing']);
  });

  it('omits optional fields that ADO did not return, and points when not read through a suite', () => {
    const testCase = buildTestCase({ id: 5, rev: 1, fields: {} }, { sharedSteps: new Map(), webUrl });
    expect(testCase).toEqual({
      id: '5',
      title: 'ADO 5',
      revision: 1,
      contentHash: testCase.contentHash,
      tags: [],
      steps: [],
      parameters: [],
      dataRows: [],
      url: webUrl(5),
    });
  });

  it('accepts the revision from System.Rev when the item has no rev, and a numeric-string priority', () => {
    const testCase = buildTestCase({ id: 6, fields: { 'System.Rev': 9, 'Microsoft.VSTS.Common.Priority': '2' } }, { sharedSteps: new Map(), webUrl });
    expect(testCase.revision).toBe(9);
    expect(testCase.priority).toBe(2);
  });
});

describe('content hash', () => {
  const context = { sharedSteps: sharedMap([[900, LOGIN], [901, null]]), webUrl };
  const base = buildTestCase(caseItem(), context);

  it('is stable across builds and ignores title, tags, priority, state, and the case revision', () => {
    expect(buildTestCase(caseItem(), context).contentHash).toBe(base.contentHash);
    const cosmetic = buildTestCase(
      caseItem({ 'System.Title': 'Renamed', 'System.Tags': 'other', 'Microsoft.VSTS.Common.Priority': 4, 'System.State': 'Closed' }, 99),
      context,
    );
    expect(cosmetic.contentHash).toBe(base.contentHash);
  });

  it('changes when step text, a shared step revision, a data row, or a parameter changes', () => {
    const editedStep = buildTestCase(
      caseItem({ 'Microsoft.VSTS.TCM.Steps': stepsXml([{ compref: 3, ref: 900 }, { id: 6, action: 'Search for the policy', expected: 'Results show' }]) }),
      context,
    );
    const sharedRevised = buildTestCase(caseItem(), { ...context, sharedSteps: sharedMap([[900, { ...LOGIN, revision: 7 }], [901, null]]) });
    const newRow = buildTestCase(caseItem({ 'Microsoft.VSTS.TCM.LocalDataSource': dataSourceXml([{ policyNumber: 'POL-009' }]) }), context);
    const newParameter = buildTestCase(caseItem({ 'Microsoft.VSTS.TCM.Parameters': parametersXml(['policyNumber', 'region']) }), context);
    const hashes = [base, editedStep, sharedRevised, newRow, newParameter].map((testCase) => testCase.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('hashes the documented version-2 input and deliberately differs from the v1 shape', () => {
    const input = { steps: base.steps, parameters: base.parameters, dataRows: base.dataRows, sharedStepRevisions: { '900': 6 } };
    expect(contentHashOf(input)).toBe(base.contentHash);
    expect(contentHashOf(input)).toBe(
      fingerprintOf({
        v: 2,
        steps: base.steps.map((step) => ({ stepIdentifier: step.stepIdentifier, action: step.action, expected: step.expected })),
        parameters: base.parameters,
        dataRows: base.dataRows,
        sharedStepRevisions: { '900': 6 },
      }),
    );
    const v1Shape = fingerprintOf({
      parameters: base.parameters.map((name) => ({ name, values: [] })),
      steps: base.steps.map((step) => ({ action: step.action, expected: step.expected, index: step.index, sharedStepId: step.sharedStepId ?? null })),
    });
    expect(base.contentHash).not.toBe(v1Shape);
  });
});

describe('compareCaseIds', () => {
  it('sorts numeric ids numerically, not alphabetically (v1 sorted "10002" before "9999")', () => {
    expect(['10002', '9999', '20', 'fixture-a'].sort(compareCaseIds)).toEqual(['20', '9999', '10002', 'fixture-a']);
  });
});
