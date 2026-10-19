import { describe, expect, it } from 'vitest';
import { classifyStep, intentForAssertion, rankCandidates, scoreCandidates } from '../../../src/resolve/index.js';
import { HintSchema, type Candidate } from '../../../src/contract/schemas.js';
import { candidate, landmark, policySearchPage } from './fixtures.js';

const top = (action: string, candidates: readonly Candidate[], params: readonly string[] = [], values?: Record<string, string>) =>
  rankCandidates(classifyStep(action, '', params), candidates, values === undefined ? {} : { params: values });

describe('rankCandidates on the Appendix C page', () => {
  const page = policySearchPage();

  it('puts the placeholder-named textbox in the search landmark first for "Enter @policyNumber in search field"', () => {
    const hints = top('Enter @policyNumber in search field', page, ['policyNumber']);
    expect(hints[0]?.ref).toBe('c9');
    expect(hints[0]?.why).toMatch(/Search Policy/);
    expect(hints[0]?.why).toMatch(/search landmark/);
    // The Search button shares the word but cannot be filled.
    const button = hints.find((h) => h.ref === 'c10');
    expect(button?.score ?? 0).toBeLessThan(0.4);
    expect(button?.why).toMatch(/cannot be used to fill/);
  });

  it('ranks the Search button first for "Click Search button" and explains the role', () => {
    const hints = top('Click Search button', page);
    expect(hints[0]).toMatchObject({ ref: 'c10' });
    expect(hints[0]?.why).toMatch(/name "Search" equals "Search"/);
    expect(hints[0]?.why).toMatch(/button the step names/);
    expect((hints[0]?.score ?? 0) - (hints[1]?.score ?? 0)).toBeGreaterThan(0.2);
  });

  it('reaches the roleless Filter handler-owner by its own text', () => {
    const hints = top('Click Filter', page);
    expect(hints[0]?.ref).toBe('c11');
    expect(hints[0]?.why).toMatch(/roleless clickable/);
  });

  it('a "button" hint still finds a roleless clickable when nothing better exists', () => {
    const hints = top('Click the Filter button', page);
    expect(hints[0]?.ref).toBe('c11');
    expect(hints[0]?.score).toBeGreaterThan(0.6);
  });

  it('ranks the navigation link above the same-named heading for "Navigate to Policy Search screen"', () => {
    const hints = top('Navigate to Policy Search screen', page);
    expect(hints.map((h) => h.ref).slice(0, 2)).toEqual(['c4', 'c7']);
    expect(hints[0]?.why).toMatch(/link fits navigate/);
  });

  it('uses the row cue with parameter values', () => {
    const withValue = top('Click View in the row for @policyNumber', page, ['policyNumber'], { policyNumber: 'POL-002' });
    expect(withValue[0]?.ref).toBe('c16');
    expect(withValue[0]?.why).toMatch(/in the row with "POL-002"/);
  });

  it('says when a row value is unknown, and then ties the same-named controls (document order first)', () => {
    const hints = top('Click View in the row for @policyNumber', page, ['policyNumber']);
    expect(hints.slice(0, 2).map((h) => h.ref)).toEqual(['c13', 'c16']);
    expect(hints[0]?.score).toBe(hints[1]?.score);
    expect(hints[0]?.why).toMatch(/row value @policyNumber unknown/);
  });

  it('ranks the row holding the value first for a row assertion', () => {
    const intent = classifyStep('Click Search button', 'Matching policy appears in Search Results', ['policyNumber'], { priorValues: ['@policyNumber'] });
    const rowIntent = intentForAssertion(intent, intent.assertions[0]!);
    const hints = rankCandidates(rowIntent, page, { params: { policyNumber: 'POL-001' } });
    expect(hints[0]?.ref).toBe('c12');
    expect(hints[0]?.why).toMatch(/row/);
  });

  it('ranks a feedback message first for success wording', () => {
    const hints = top('Verify the success message is displayed', page);
    expect(hints[0]?.ref).toBe('c18');
    expect(hints[0]?.why).toMatch(/feedback message/);
  });

  it('honors the landmark cue and says so', () => {
    const hints = top('Click the Privacy link in the footer', page);
    expect(hints[0]?.ref).toBe('c20');
    expect(hints[0]?.why).toMatch(/inside the contentinfo landmark/);
  });

  it('returns valid contract Hints, at most `limit`, scores in 0..1, best first', () => {
    const hints = rankCandidates(classifyStep('Click Search button', '', []), page, { limit: 3 });
    expect(hints).toHaveLength(3);
    for (const h of hints) {
      expect(HintSchema.parse(h)).toEqual(h);
      expect(h.score).toBeGreaterThan(0);
      expect(h.score).toBeLessThanOrEqual(1);
    }
    expect([...hints].sort((a, b) => b.score - a.score)).toEqual(hints);
  });

  it('is deterministic', () => {
    const a = top('Enter @policyNumber in search field', page, ['policyNumber']);
    const b = top('Enter @policyNumber in search field', [...page], ['policyNumber']);
    expect(a).toEqual(b);
  });
});

describe('rankCandidates: state and roles', () => {
  it('prefers the visible one of two same-named buttons, and says why the other lost', () => {
    const page: Candidate[] = [
      candidate({ ref: 'hidden', role: 'button', name: 'Save', visible: false, inViewport: false }),
      candidate({ ref: 'shown', role: 'button', name: 'Save' }),
    ];
    const hints = top('Click Save', page);
    expect(hints[0]?.ref).toBe('shown');
    expect(hints[1]?.why).toMatch(/not visible/);
  });

  it('does not penalize a hidden target when the assertion is that it is hidden', () => {
    const page: Candidate[] = [candidate({ ref: 'spinner', role: 'img', name: 'Loading', visible: false, interactive: false, affordance: 'none', tag: 'img' })];
    const [hint] = rankCandidates(classifyStep('Wait until the Loading image disappears', '', []), page);
    expect(hint?.why ?? '').not.toMatch(/not visible/);
  });

  it('penalizes a disabled control for an action', () => {
    const page: Candidate[] = [
      candidate({ ref: 'off', role: 'button', name: 'Submit', enabled: false }),
      candidate({ ref: 'on', role: 'button', name: 'Submit order' }),
    ];
    const hints = top('Click Submit', page);
    expect(hints[0]?.ref).toBe('on');
    expect(hints.find((h) => h.ref === 'off')?.why).toMatch(/disabled/);
  });

  it('fill admits searchbox, spinbutton and combobox; select prefers comboboxes', () => {
    const page: Candidate[] = [
      candidate({ ref: 'sb', role: 'searchbox', name: 'Search', tag: 'input' }),
      candidate({ ref: 'cb', role: 'combobox', name: 'State', tag: 'select' }),
      candidate({ ref: 'btn', role: 'button', name: 'State' }),
    ];
    expect(top('Type "x" into the search box', page)[0]?.ref).toBe('sb');
    expect(top('Select Ohio from the State dropdown', page)[0]?.ref).toBe('cb');
  });

  it('check prefers a checkbox or switch over a same-named button', () => {
    const page: Candidate[] = [
      candidate({ ref: 'b', role: 'button', name: 'Remember me' }),
      candidate({ ref: 's', role: 'switch', name: 'Remember me', tag: 'input' }),
    ];
    expect(top('Check the Remember me box', page)[0]?.ref).toBe('s');
    expect(top('Uncheck Remember me', page)[0]?.ref).toBe('s');
  });

  it('a quoted name prefers the candidate that contains it literally', () => {
    const page: Candidate[] = [
      candidate({ ref: 'reordered', role: 'button', name: 'Close and Save' }),
      candidate({ ref: 'exact', role: 'button', name: 'Save & Close' }),
      candidate({ ref: 'short', role: 'button', name: 'Save' }),
    ];
    const hints = top('Click the "Save & Close" button', page);
    expect(hints[0]?.ref).toBe('exact');
    expect(hints[0]!.score - hints[1]!.score).toBeGreaterThan(0.12);
  });

  it('a landmark cue the page does not expose neither helps nor hurts, and is reported', () => {
    const page: Candidate[] = [candidate({ ref: 'a', role: 'link', name: 'Active', tag: 'a' })];
    const [hint] = top('Click the Active link in the footer', page);
    expect(hint?.ref).toBe('a');
    expect(hint?.why).toMatch(/no contentinfo landmark on the page/);
    const [plain] = top('Click the Active link', page);
    expect(hint?.score).toBe(plain?.score);
  });

  it('the only text field in a form gets a small bonus when the step does not name it', () => {
    const page: Candidate[] = [
      landmark('f', 'form', 'Quote'),
      candidate({ ref: 'qty', role: 'spinbutton', name: 'Quantity', tag: 'input', landmark: 'form', landmarkName: 'Quote' }),
      candidate({ ref: 'mail', role: 'textbox', name: 'Newsletter', tag: 'input' }),
    ];
    const scored = scoreCandidates(classifyStep('Enter 5', '', []), page);
    expect(scored[0]?.ref).toBe('qty');
    expect(scored[0]?.reasons.join(' ')).toMatch(/only text field in its form/);
  });

  it('the only button in a dialog gets a bonus for confirm words', () => {
    const page: Candidate[] = [
      candidate({ ref: 'outside', role: 'button', name: 'Continue shopping' }),
      landmark('d', 'dialog', 'Confirm'),
      candidate({ ref: 'inside', role: 'button', name: 'Yes, continue', landmark: 'dialog', landmarkName: 'Confirm' }),
    ];
    const scored = scoreCandidates(classifyStep('Click Continue', '', []), page);
    expect(scored[0]?.ref).toBe('inside');
    expect(scored[0]?.reasons.join(' ')).toMatch(/only button in the dialog/);
  });

  it('returns nothing for an empty snapshot', () => {
    expect(top('Click Save', [])).toEqual([]);
  });
});
