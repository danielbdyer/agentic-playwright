import { describe, expect, it } from 'vitest';
import { createHeuristicDecider, heuristicDecision } from '../../../src/driver/index.js';
import { classifyStep, intentForAssertion } from '../../../src/resolve/index.js';
import { deciderInput } from './fixtures.js';

describe('the heuristic decider', () => {
  it('chooses the one candidate that clearly fits, with the reason and the rejected runners-up', async () => {
    const decision = await createHeuristicDecider().decide(deciderInput('Click Search button'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c5', verb: 'click' });
    if (decision.kind !== 'act') throw new Error('unreachable');
    expect(decision.reason).toMatch(/c5 \(button "Search"\)/);
    expect(decision.rejected).not.toContain('c5');
    expect(decision.host).toBeUndefined();
  });

  it('carries the step value for a fill, still as the "@param" reference', () => {
    const decision = heuristicDecision(deciderInput('Enter @policyNumber in search field'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c4', verb: 'fill', value: '@policyNumber' });
  });

  it('hands off an ambiguous target with every plausible candidate and where it sits', () => {
    const decision = heuristicDecision(deciderInput('Click Edit'));
    expect(decision.kind).toBe('handoff');
    if (decision.kind !== 'handoff') throw new Error('unreachable');
    expect(decision.blockage).toBe('ambiguous-target');
    expect(decision.candidates.map((c) => c.ref).sort()).toEqual(['c11', 'c9']);
    expect(decision.candidates.every((c) => c.name === 'Edit' && /row "POL-00[13]/.test(c.why ?? ''))).toBe(true);
  });

  it('resolves the same step once the wording names the row, ranking rows with the data row value', () => {
    const decision = heuristicDecision(deciderInput('Click Edit for policy @policyNumber'));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c9' });
  });

  it('never chooses an excluded ref (one that already failed)', () => {
    const retried = heuristicDecision(deciderInput('Click Search button', '', { exclude: ['c5'] }));
    expect(retried.kind === 'act' ? retried.ref : null).not.toBe('c5');
    expect(heuristicDecision(deciderInput('Click Filter', '', { exclude: ['c6'] }))).toMatchObject({ kind: 'handoff', blockage: 'not-found' });
    const decision = heuristicDecision(deciderInput('Click Edit', '', { exclude: ['c9'] }));
    expect(decision).toMatchObject({ kind: 'act', ref: 'c11' });
  });

  it('says not-found, with the nearest candidates, when nothing on the page fits', () => {
    const decision = heuristicDecision(deciderInput('Click Delete account button'));
    expect(decision.kind).toBe('handoff');
    if (decision.kind !== 'handoff') throw new Error('unreachable');
    expect(decision.blockage).toBe('not-found');
    expect(decision.reason.length).toBeGreaterThan(0);
  });

  it('picks the row an expected result names, and passes the proposed assertion through', () => {
    const intent = classifyStep('Verify search results show policy', 'Matching policy appears in Search Results', ['policyNumber'], { priorValues: ['@policyNumber'] });
    const proposal = intent.assertions[0]!;
    const decision = heuristicDecision(
      deciderInput('Verify search results show policy', 'Matching policy appears in Search Results', {
        intent: intentForAssertion(intent, proposal),
        purpose: 'assertion',
        assertion: proposal,
      }),
    );
    expect(decision).toMatchObject({ kind: 'act', ref: 'c8', assertion: { kind: proposal.kind } });
  });
});
