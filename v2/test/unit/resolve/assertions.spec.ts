import { describe, expect, it } from 'vitest';
import { proposeAssertions, splitClauses, type ProposedAssertion, type StatementContext } from '../../../src/resolve/index.js';
import { AssertionSpecSchema } from '../../../src/contract/schemas.js';

const ctx = (fields: Partial<StatementContext> = {}): StatementContext => ({
  parameters: [],
  stepValue: null,
  priorValues: [],
  stepTarget: null,
  ...fields,
});

type Shape = Partial<Pick<ProposedAssertion, 'kind' | 'expected' | 'targetPhrase' | 'roleHint' | 'landmarkCue' | 'rowCue'>>;

const pick = (a: ProposedAssertion, keys: readonly (keyof Shape)[]): Shape => Object.fromEntries(keys.map((k) => [k, a[k]]));

interface Row {
  readonly text: string;
  readonly ctx?: Partial<StatementContext>;
  readonly want: readonly Shape[];
}

const ROWS: readonly Row[] = [
  {
    text: 'Policy Search screen loads',
    want: [
      { kind: 'visible', roleHint: 'heading', targetPhrase: 'Policy Search' },
      { kind: 'url', expected: '/policy(?:[-_ ]|%20)?search/i' },
    ],
  },
  { text: 'The Policy Search page is displayed', want: [{ kind: 'visible', roleHint: 'heading', targetPhrase: 'Policy Search' }, { kind: 'url' }] },
  {
    text: 'Matching policy appears in Search Results',
    ctx: { priorValues: ['@policyNumber'], parameters: ['policyNumber'] },
    want: [
      { kind: 'visible', roleHint: 'row', rowCue: '@policyNumber', targetPhrase: null },
      { kind: 'contains-text', targetPhrase: 'Search Results', expected: '@policyNumber' },
    ],
  },
  { text: 'Matching policy appears in Search Results', want: [{ kind: 'visible', targetPhrase: 'Matching policy', rowCue: null }] },
  {
    text: 'POL-001 is listed in the results table',
    want: [{ kind: 'visible', roleHint: 'row', rowCue: 'POL-001' }, { kind: 'contains-text', expected: 'POL-001', targetPhrase: 'results table' }],
  },
  {
    text: 'Search results show the policy',
    ctx: { priorValues: ['Buy milk', '@policyNumber'], parameters: ['policyNumber'] },
    want: [{ kind: 'visible', roleHint: 'row', rowCue: '@policyNumber' }, { kind: 'contains-text', expected: '@policyNumber' }],
  },
  { text: 'An error message "Invalid policy number" is shown', want: [{ kind: 'contains-text', roleHint: 'alert', expected: 'Invalid policy number' }] },
  { text: 'error message Invalid policy number is shown', want: [{ kind: 'contains-text', roleHint: 'alert', expected: 'Invalid policy number' }] },
  { text: 'A validation message saying Policy number is required appears', want: [{ kind: 'contains-text', roleHint: 'alert', expected: 'Policy number is required' }] },
  { text: 'A success message is displayed', want: [{ kind: 'visible', roleHint: 'status', expected: null }] },
  { text: 'The count decreases by one', want: [{ kind: 'count', expected: null }] },
  { text: 'The footer shows one fewer item left', want: [{ kind: 'count', expected: null, landmarkCue: 'contentinfo', targetPhrase: 'item left' }] },
  { text: '3 results are displayed', want: [{ kind: 'count', expected: 3, roleHint: 'row' }] },
  { text: 'The results table shows 2 rows', want: [{ kind: 'count', expected: 2, roleHint: 'row' }] },
  { text: 'No completed todos appear in the visible list', want: [{ kind: 'count', expected: 0, targetPhrase: 'completed todos' }] },
  { text: 'The Customer Name field accepts the value', ctx: { stepValue: 'Alice' }, want: [{ kind: 'value', targetPhrase: 'Customer Name', roleHint: 'textbox', expected: 'Alice' }] },
  {
    text: 'The customer name is visible in the field',
    ctx: { parameters: ['customerName'] },
    want: [{ kind: 'value', roleHint: 'textbox', targetPhrase: null, expected: '@customerName' }],
  },
  { text: 'The page title is "Policy Search"', want: [{ kind: 'title', expected: 'Policy Search' }] },
  { text: 'The page title contains Policies', want: [{ kind: 'title', expected: '/Policies/' }] },
  { text: 'The URL contains /PolicySearch', want: [{ kind: 'url', expected: '/PolicySearch' }] },
  { text: 'The Save button is disabled', want: [{ kind: 'disabled', targetPhrase: 'Save', roleHint: 'button' }] },
  { text: 'The Save button is not enabled', want: [{ kind: 'disabled', targetPhrase: 'Save', roleHint: 'button' }] },
  { text: 'The Remember me checkbox is checked', want: [{ kind: 'checked', targetPhrase: 'Remember me', roleHint: 'checkbox' }] },
  { text: 'The Active tab is selected', want: [] },
  {
    text: 'The todo is marked as complete',
    ctx: { priorValues: ['Buy milk'] },
    want: [{ kind: 'checked', roleHint: 'checkbox', rowCue: 'Buy milk', targetPhrase: null }],
  },
  { text: 'The dialog closes', want: [{ kind: 'hidden', roleHint: 'dialog', targetPhrase: null }] },
  { text: 'The Search field is empty', want: [{ kind: 'value', targetPhrase: 'Search', roleHint: 'textbox', expected: '' }] },
  { text: 'The total reads "$100.00"', want: [{ kind: 'contains-text', targetPhrase: 'total', expected: '$100.00' }] },
  { text: 'The total equals 100', want: [{ kind: 'text', targetPhrase: 'total', expected: '100' }] },
  { text: 'The user is redirected to the Dashboard page', want: [{ kind: 'visible', roleHint: 'heading', targetPhrase: 'Dashboard' }, { kind: 'url' }] },
  { text: 'The spinner disappears', want: [{ kind: 'hidden', targetPhrase: 'spinner' }] },
  { text: 'The Help link is visible in the footer', want: [{ kind: 'visible', targetPhrase: 'Help', roleHint: 'link', landmarkCue: 'contentinfo' }] },
  { text: 'Completed todos are hidden from the list', want: [{ kind: 'hidden', targetPhrase: 'Completed todos' }] },
  { text: 'A confirmation dialog appears', want: [{ kind: 'visible', roleHint: 'dialog', targetPhrase: 'confirmation' }] },
  { text: 'The page shows "Welcome back"', want: [{ kind: 'visible', targetPhrase: 'Welcome back' }] },
  { text: 'The homepage loads', want: [] },
  { text: 'Something happens', want: [] },
];

describe('proposeAssertions: expected-result shapes', () => {
  for (const row of ROWS) {
    it(row.text, () => {
      const proposals = proposeAssertions(row.text, ctx(row.ctx));
      const keys = [...new Set(row.want.flatMap((w) => Object.keys(w)))] as (keyof Shape)[];
      expect(proposals.map((p) => pick(p, keys))).toEqual(row.want.map((w) => pick({ ...emptyProposal, ...w }, keys)));
      for (const p of proposals) {
        expect(p.confidence).toBeGreaterThan(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
        expect(p.source.length).toBeGreaterThan(0);
        // Every proposal fits the contract's assertion vocabulary once a target is chosen.
        const spec = { kind: p.kind, ...(p.expected === null ? {} : { expected: p.expected }) };
        expect(AssertionSpecSchema.safeParse(spec).success).toBe(true);
      }
    });
  }
});

const emptyProposal: ProposedAssertion = {
  kind: 'visible',
  expected: null,
  targetPhrase: null,
  roleHint: null,
  landmarkCue: null,
  rowCue: null,
  confidence: 0.5,
  note: null,
  source: '',
};

describe('proposeAssertions: notes, clauses, dedupe', () => {
  it('marks a relative count as a paraphrase with the direction and amount', () => {
    const [count] = proposeAssertions('The items-left count decreases by one', ctx());
    expect(count?.note).toMatch(/paraphrase/);
    expect(count?.note).toMatch(/-1/);
    expect(count?.targetPhrase).toBe('items-left');
    expect(count?.confidence).toBeLessThan(0.5);
  });

  it('reads each clause of a compound expected result', () => {
    const proposals = proposeAssertions('The form submits and a confirmation page is shown', ctx());
    expect(proposals.map((p) => [p.kind, p.targetPhrase])).toEqual([
      ['visible', 'confirmation'],
      ['url', null],
    ]);
  });

  it('drops a duplicate proposal from two phrasings of the same check', () => {
    const proposals = proposeAssertions('The Save button is visible. The Save button is displayed on the form.', ctx());
    expect(proposals).toHaveLength(1);
  });

  it('uses the step target for a pronoun subject', () => {
    const stepTarget = { phrase: 'Search', mention: 'Search button', roleHint: 'button', landmarkCue: null, rowCue: null, rowCueGeneric: false, exact: false, notes: [] };
    const [p] = proposeAssertions('It is enabled', ctx({ stepTarget }));
    expect(p).toMatchObject({ kind: 'enabled', targetPhrase: 'Search', roleHint: 'button' });
  });
});

describe('splitClauses', () => {
  it('splits sentences and "and" before a new subject, never inside quotes', () => {
    expect(splitClauses('The form submits and a confirmation page is shown.')).toEqual(['The form submits', 'a confirmation page is shown']);
    expect(splitClauses('The message "Saved. Done and dusted" appears')).toEqual(['The message "Saved. Done and dusted" appears']);
    expect(splitClauses('The todo list shows both active and completed todos')).toEqual(['The todo list shows both active and completed todos']);
    expect(splitClauses('')).toEqual([]);
  });
});
