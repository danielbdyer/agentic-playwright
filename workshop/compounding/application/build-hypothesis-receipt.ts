/**
 * Build a HypothesisReceipt from a Hypothesis + Judgment.
 *
 * Per docs/v2-compounding-engine-plan.md §3.3 + §4.3, the envelope
 * carries the workflow metadata (stage='evidence', scope='hypothesis',
 * kind='hypothesis-receipt', governance='approved') plus the payload
 * that wraps the judgment + provenance.
 *
 * Fingerprinting: the hypothesis's fingerprint is stamped into the
 * payload. The receipt's artifact fingerprint is
 * hypothesisReceiptFingerprint(receipt) (see Z2).
 *
 * Pure — no Effect imports.
 */

import { SUBSTRATE_VERSION } from '../../substrate/version';
import { asFingerprint, type Fingerprint } from '../../../product/domain/kernel/hash';
import { hypothesisFingerprint, hypothesisReceiptFingerprint } from './fingerprint';
import type { Hypothesis } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Judgment } from './confirmation-judgments';

export interface BuildHypothesisReceiptOptions {
  readonly now: () => Date;
  readonly manifestVersion?: number;
}

export function buildHypothesisReceipt(
  hypothesis: Hypothesis,
  judgment: Judgment,
  options: BuildHypothesisReceiptOptions,
): HypothesisReceipt {
  const hypFp = hypothesisFingerprint(hypothesis);
  const now = options.now();

  const draft: Omit<HypothesisReceipt, 'fingerprints'> & {
    readonly fingerprints: {
      readonly artifact: Fingerprint<'artifact'>;
      readonly content: Fingerprint<'content'>;
    };
  } = {
    version: 1,
    stage: 'evidence',
    scope: 'hypothesis',
    kind: 'hypothesis-receipt',
    ids: {},
    fingerprints: {
      artifact: '' as Fingerprint<'artifact'>,
      content: '' as Fingerprint<'content'>,
    },
    lineage: {
      sources: [`hypothesis:${hypothesis.id}`],
      parents: [...judgment.evidenceReceiptIds],
      handshakes: ['evidence'],
    },
    governance: 'approved',
    payload: {
      hypothesisId: hypothesis.id,
      hypothesisFingerprint: hypFp,
      outcome: judgment.outcome,
      evidenceReceiptIds: judgment.evidenceReceiptIds,
      confirmedCount: judgment.confirmedCount,
      refutedCount: judgment.refutedCount,
      inconclusiveCount: judgment.inconclusiveCount,
      cycleRate: judgment.cycleRate,
      provenance: {
        substrateVersion: SUBSTRATE_VERSION,
        manifestVersion: options.manifestVersion ?? 1,
        computedAt: now.toISOString(),
      },
    },
  };

  const receiptFp = hypothesisReceiptFingerprint(draft as HypothesisReceipt);
  return {
    ...draft,
    fingerprints: {
      artifact: asFingerprint('artifact', receiptFp),
      content: asFingerprint('content', receiptFp),
    },
  };
}
