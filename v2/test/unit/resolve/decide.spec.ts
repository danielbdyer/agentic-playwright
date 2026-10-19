import { describe, expect, it } from 'vitest';
import { classifyStep, decideTarget, facetIdFor, rankCandidates, screenNameFromUrl } from '../../../src/resolve/index.js';
import type { Candidate, Hint } from '../../../src/contract/schemas.js';
import { candidate, policySearchPage } from './fixtures.js';

const decide = (action: string, candidates: readonly Candidate[], params: readonly string[] = [], values?: Record<string, string>) => {
  const intent = classifyStep(action, '', params);
  const hints = rankCandidates(intent, candidates, values === undefined ? {} : { params: values });
  return { intent, hints, decision: decideTarget(intent, hints, candidates) };
};

describe('decideTarget', () => {
  const page = policySearchPage();

  it('chooses a clear winner and lists the runners-up it rejected', () => {
    const { decision } = decide('Enter @policyNumber in search field', page, ['policyNumber']);
    expect(decision.kind).toBe('chosen');
    if (decision.kind !== 'chosen') return;
    expect(decision.ref).toBe('c9');
    expect(decision.score).toBeGreaterThanOrEqual(0.55);
    expect(decision.rejected.length).toBeGreaterThan(0);
    expect(decision.rejected).not.toContain('c9');
    expect(decision.reason).toMatch(/c9 \(textbox "Search Policy"\)/);
    expect(decision.reason).toMatch(/next best/);
  });

  it('is ambiguous when two candidates tie', () => {
    const { decision } = decide('Click View', page);
    expect(decision).toMatchObject({ kind: 'ambiguous', refs: ['c13', 'c16'] });
    if (decision.kind === 'ambiguous') expect(decision.reason).toMatch(/2 candidates/);
  });

  it('resolves the tie once the row value is known', () => {
    const { decision } = decide('Click View in the row for @policyNumber', page, ['policyNumber'], { policyNumber: 'POL-001' });
    expect(decision).toMatchObject({ kind: 'chosen', ref: 'c13' });
  });

  it('is none when nothing scores high enough', () => {
    const { decision } = decide('Click the Export to Excel button', page);
    expect(decision.kind).toBe('none');
    if (decision.kind === 'none') expect(decision.reason).toMatch(/below 0.55/);
  });

  it('is none with a reason when there are no hints', () => {
    const intent = classifyStep('Click Save', '', []);
    expect(decideTarget(intent, [], page)).toMatchObject({ kind: 'none', reason: expect.stringMatching(/no candidate on the page fits "Save"/) });
    const press = classifyStep('Press Enter', '', []);
    expect(decideTarget(press, [], page)).toMatchObject({ kind: 'none', reason: expect.stringMatching(/needs no target \(press Enter\)/) });
  });

  it('honors custom thresholds', () => {
    const intent = classifyStep('Click Save', '', []);
    const hints: Hint[] = [
      { ref: 'a', score: 0.7, why: 'a' },
      { ref: 'b', score: 0.62, why: 'b' },
    ];
    const cands = [candidate({ ref: 'a', role: 'button', name: 'Save' }), candidate({ ref: 'b', role: 'button', name: 'Save draft' })];
    expect(decideTarget(intent, hints, cands).kind).toBe('ambiguous');
    expect(decideTarget(intent, hints, cands, { minMargin: 0.05 })).toMatchObject({ kind: 'chosen', ref: 'a', rejected: ['b'] });
    expect(decideTarget(intent, hints, cands, { minScore: 0.8 }).kind).toBe('none');
  });

  it('ignores hints for refs that are not in the snapshot', () => {
    const intent = classifyStep('Click Save', '', []);
    const hints: Hint[] = [
      { ref: 'gone', score: 0.95, why: 'stale' },
      { ref: 'a', score: 0.8, why: 'fits' },
    ];
    expect(decideTarget(intent, hints, [candidate({ ref: 'a', role: 'button', name: 'Save' })])).toMatchObject({ kind: 'chosen', ref: 'a' });
  });

  it('every step on the Appendix C page decides the way an agent would', () => {
    const steps: [string, string, string[], Record<string, string>?][] = [
      ['Navigate to Policy Search screen', 'c4', []],
      ['Click Search button', 'c10', []],
      ['Click Filter', 'c11', []],
      ['Check the checkbox in the row for POL-002', 'c17', []],
      ['Click the Privacy link in the footer', 'c20', []],
      ['Verify the success message is displayed', 'c18', []],
    ];
    for (const [action, ref, params, values] of steps) {
      expect(decide(action, page, params, values).decision, action).toMatchObject({ kind: 'chosen', ref });
    }
  });
});

describe('facetIdFor', () => {
  const page = policySearchPage();
  const byRef = (ref: string): Candidate => page.find((c) => c.ref === ref)!;

  it('names a fill by the parameter it binds: policy-search:policy-number-input', () => {
    const intent = classifyStep('Enter @policyNumber in search field', '', ['policyNumber']);
    expect(facetIdFor('policy-search', intent, byRef('c9'))).toBe('policy-search:policy-number-input');
  });

  it('names a click by the author\'s words plus the role: policy-search:search-button', () => {
    expect(facetIdFor('policy-search', classifyStep('Click Search button', '', []), byRef('c10'))).toBe('policy-search:search-button');
    expect(facetIdFor('policy-search', classifyStep('Click Filter', '', []), byRef('c11'))).toBe('policy-search:filter-button');
    expect(facetIdFor('policy-search', classifyStep('Navigate to Policy Search screen', '', []), byRef('c4'))).toBe('policy-search:policy-search-link');
  });

  it('prefers the author\'s phrase over the accessible name', () => {
    const intent = classifyStep('Enter Alice in the customer field', '', []);
    const field = candidate({ ref: 'x', role: 'textbox', name: 'Search Policy', namingSource: 'placeholder', tag: 'input' });
    expect(facetIdFor('customers', intent, field)).toBe('customers:customer-input');
  });

  it('does not repeat a role word the phrase already has', () => {
    const intent = classifyStep('Enter Alice in the Notes box', '', []);
    const field = candidate({ ref: 'x', role: 'textbox', name: 'Notes', tag: 'textarea' });
    expect(facetIdFor('order', intent, field)).toBe('order:notes-input');
    const named = classifyStep('Verify the Results table is visible', '', []);
    expect(facetIdFor('order', { ...named, targetPhrase: 'search results table' }, candidate({ ref: 't', role: 'table', name: 'Results', interactive: false, tag: 'table' }))).toBe(
      'order:search-results-table',
    );
  });

  it('names a row by its parameter, never by its data', () => {
    const intent = classifyStep('Click Search button', 'Matching policy appears in Search Results', ['policyNumber'], { priorValues: ['@policyNumber'] });
    const rowIntent = { ...intent, verb: 'assert' as const, targetPhrase: null, roleHint: 'row', rowCue: '@policyNumber' };
    expect(facetIdFor('policy-search', rowIntent, byRef('c12'))).toBe('policy-search:policy-number-row');
  });

  it('falls back to the accessible name, then the role', () => {
    const intent = classifyStep('Check the checkbox in the row for POL-002', '', []);
    expect(facetIdFor('policy-search', intent, byRef('c17'))).toBe('policy-search:row-checkbox');
    const bare = classifyStep('Click the button', '', []);
    expect(facetIdFor('Policy Search', bare, candidate({ ref: 'b', role: 'button', name: 'Download PDF report for the month' }))).toBe(
      'policy-search:download-pdf-report-for-the-button',
    );
  });

  it('always produces two kebab-case segments', () => {
    const ids = [
      facetIdFor('Policy Search', classifyStep('Click the "Save & Close" button', '', []), candidate({ ref: 'a', role: 'button', name: 'Save & Close' })),
      facetIdFor('x', classifyStep('Hover over the logo', '', []), candidate({ ref: 'b', role: 'img', name: '', namingSource: 'none', tag: 'img' })),
    ];
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/);
    expect(ids[0]).toBe('policy-search:save-close-button');
    // No name and no phrase: the role word the author used ("logo") already says image.
    expect(ids[1]).toBe('x:logo');
  });
});

describe('screenNameFromUrl', () => {
  const cases: [string, string | undefined, string][] = [
    ['https://acme.outsystemsenterprise.com/OutSystemsUIWebsite/Productcatalog', undefined, 'productcatalog'],
    ['https://acme.example.com/PolicySearch', undefined, 'policy-search'],
    ['https://acme.example.com/', undefined, 'home'],
    ['https://acme.example.com/Insurance/', 'https://acme.example.com/Insurance/', 'home'],
    ['https://acme.example.com/Insurance', 'https://acme.example.com/Insurance/', 'home'],
    ['https://acme.example.com/Insurance/PolicyDetail?Id=42', 'https://acme.example.com/Insurance/', 'policy-detail'],
    ['https://acme.example.com/Insurance/PolicyDetail/12345', 'https://acme.example.com/Insurance/', 'policy-detail'],
    ['https://acme.example.com/App/Default.aspx', undefined, 'home'],
    ['https://acme.example.com/App/CustomerList.aspx#top', undefined, 'customer-list'],
    ['https://acme.example.com/OutSystemsUIWebsite', undefined, 'out-systems-ui-website'],
    ['https://acme.example.com/#/policies/open', undefined, 'open'],
    ['PolicySearch', 'https://acme.example.com/Insurance/', 'policy-search'],
    ['/Insurance/Claims', 'https://acme.example.com/Insurance/', 'claims'],
    ['https://other.example.com/Elsewhere', 'https://acme.example.com/Insurance/', 'elsewhere'],
  ];
  for (const [url, base, want] of cases) {
    it(`${url}${base === undefined ? '' : ` (base ${base})`} → ${want}`, () => {
      expect(screenNameFromUrl(url, base)).toBe(want);
    });
  }
});
