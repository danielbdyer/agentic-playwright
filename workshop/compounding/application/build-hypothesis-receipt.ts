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
import { mintEvidenceEnvelopeWithFingerprint } from '../../../product/domain/governance/mint-envelope';
import {
  hypothesisFingerprint,
  hypothesisReceiptFingerprintSource,
} from './fingerprint';
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
  const payload: HypothesisReceipt['payload'] = {
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
  };

  return mintEvidenceEnvelopeWithFingerprint({
    stage: 'evidence',
    scope: 'hypothesis',
    kind: 'hypothesis-receipt',
    payload,
    lineage: {
      sources: [`hypothesis:${hypothesis.id}`],
      parents: [...judgment.evidenceReceiptIds],
    },
    fingerprintSource: hypothesisReceiptFingerprintSource(payload),
  }) as HypothesisReceipt;
}
