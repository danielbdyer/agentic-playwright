/**
 * Proposal-kind discriminator laws — Step 2.
 *
 * Verifies the three-variant discriminator added in
 * `product/domain/proposal/kind.ts` and its factory / fold
 * helpers.
 *
 * @see docs/v2-direction.md §6 Step 2
 */

import { describe, test, expect } from 'vitest';
import {
  hypothesisEnvelope,
  revisionEnvelope,
  candidateEnvelope,
  foldProposalKind,
  type ProposalEnvelope,
  type ProposalKind,
} from '../../product/domain/proposal/kind';

describe('proposal-kind laws', () => {
  test('hypothesisEnvelope carries a predictedDelta', () => {
    const env = hypothesisEnvelope(
      'manifest adds facet-query verb',
      { metric: 'metric-hypothesis-confirmation-rate', direction: 'increase', magnitude: 0.05 },
      { verb: 'facet-query' },
    );
    expect(env.kind).toBe('hypothesis');
    expect(env.predictedDelta?.metric).toBe('metric-hypothesis-confirmation-rate');
    expect(env.predictedDelta?.direction).toBe('increase');
    expect(env.rationale).toBe('manifest adds facet-query verb');
    expect(env.payload).toEqual({ verb: 'facet-query' });
  });

  test('revisionEnvelope carries no predictedDelta', () => {
    const env = revisionEnvelope('typo fix in facet displayName', { facet: 'policy-search:policyNumberInput' });
    expect(env.kind).toBe('revision');
    expect(env.predictedDelta).toBeUndefined();
  });

  test('candidateEnvelope carries no predictedDelta', () => {
    const env = candidateEnvelope('first observation of new element', { screen: 'policy-search', element: 'clearButton' });
    expect(env.kind).toBe('candidate');
    expect(env.predictedDelta).toBeUndefined();
  });

  test('foldProposalKind dispatches each variant exhaustively', () => {
    const kinds: readonly ProposalKind[] = ['hypothesis', 'revision', 'candidate'];
    const labels = kinds.map((kind) =>
      foldProposalKind(kind, {
        hypothesis: () => 'H',
        revision: () => 'R',
        candidate: () => 'C',
      }),
    );
    expect(labels).toEqual(['H', 'R', 'C']);
  });

  test('envelopes wrap their payload without discarding fields', () => {
    interface DomainPayload {
      readonly screen: string;
      readonly detail: { readonly id: number };
    }
    const payload: DomainPayload = { screen: 'policy-search', detail: { id: 42 } };
    const env: ProposalEnvelope<DomainPayload> = candidateEnvelope('round trip', payload);
    expect(env.payload).toBe(payload);
  });
});
