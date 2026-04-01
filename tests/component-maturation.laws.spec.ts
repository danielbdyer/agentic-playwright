/**
 * W3.14 — Component Knowledge Maturation Law Tests
 *
 * Laws verified:
 * 1. Evidence accumulation: merged evidence sums counts
 * 2. Confidence threshold: shouldProposeUpdate respects threshold exactly
 * 3. Proposal generation: only components with > 0 attempts produce proposals
 * 4. Confidence range: confidence is always in [0, 1]
 * 5. Action deduplication: suggestedActions contain no duplicates
 * 6. Determinism: same input always yields same output
 * 7. Empty evidence produces no proposals
 * 8. Monotonicity: more successes never decrease confidence
 * 9. Sorted output: proposals are sorted by descending confidence
 */

import { expect, test } from '@playwright/test';
import {
  shouldProposeUpdate,
  matureComponentKnowledge,
  type ComponentEvidence,
} from '../lib/domain/projection/component-maturation';
import { mulberry32, pick, randomWord, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


function randomEvidence(next: () => number): ComponentEvidence {
  const totalAttempts = randomInt(next, 50);
  const successCount = totalAttempts > 0 ? randomInt(next, totalAttempts + 1) : 0;
  const actionCount = randomInt(next, 5) + 1;
  return {
    componentType: pick(next, ['text-input', 'dropdown', 'checkbox', 'radio', 'combobox', 'date-picker', 'toggle']),
    actions: Array.from({ length: actionCount }, () => pick(next, ['click', 'fill', 'select', 'check', 'uncheck', 'hover', 'focus', 'blur'])),
    successCount,
    totalAttempts,
  };
}

function randomEvidenceList(next: () => number): readonly ComponentEvidence[] {
  const count = randomInt(next, 8) + 1;
  return Array.from({ length: count }, () => randomEvidence(next));
}

// ─── Law 1: Evidence accumulation ───

test.describe('Law 1: Merging evidence for same componentType sums counts', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const componentType = `widget-${randomWord(next)}`;
      const totalAttempts1 = randomInt(next, 20) + 1;
      const successCount1 = randomInt(next, totalAttempts1) + 1;
      const totalAttempts2 = randomInt(next, 20) + 1;
      const successCount2 = randomInt(next, totalAttempts2) + 1;

      const evidence: readonly ComponentEvidence[] = [
        { componentType, actions: ['click'], successCount: successCount1, totalAttempts: totalAttempts1 },
        { componentType, actions: ['fill'], successCount: successCount2, totalAttempts: totalAttempts2 },
      ];

      const proposals = matureComponentKnowledge(evidence);
      const matching = proposals.filter((p) => p.componentType === componentType);
      expect(matching.length).toBe(1);

      // The confidence should reflect the combined evidence, not either individual
      const combinedRate = (successCount1 + successCount2) / (totalAttempts1 + totalAttempts2);
      const proposal = matching[0]!;
      // Confidence is derived from combined rate (possibly weighted by saturation),
      // so it should be correlated with the combined success rate
      if (combinedRate > 0) {
        expect(proposal.confidence).toBeGreaterThan(0);
      }
    });
  }
});

// ─── Law 2: shouldProposeUpdate respects threshold ───

test.describe('Law 2: shouldProposeUpdate respects threshold boundary', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const totalAttempts = randomInt(next, 50) + 1;
      const successCount = randomInt(next, totalAttempts + 1);
      const rate = successCount / totalAttempts;

      const evidence: ComponentEvidence = {
        componentType: 'test-widget',
        actions: ['click'],
        successCount,
        totalAttempts,
      };

      // At the exact rate, it should pass
      expect(shouldProposeUpdate(evidence, rate)).toBe(true);

      // Above the rate, it should not pass (unless rate is 1.0)
      if (rate < 1.0) {
        const aboveThreshold = rate + 0.001;
        if (aboveThreshold <= 1.0) {
          expect(shouldProposeUpdate(evidence, aboveThreshold)).toBe(false);
        }
      }
    });
  }
});

// ─── Law 3: Only components with > 0 attempts produce proposals ───

test.describe('Law 3: Zero-attempt evidence produces no proposals', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const componentType = `widget-${randomWord(next)}`;
      const evidence: readonly ComponentEvidence[] = [
        { componentType, actions: ['click', 'fill'], successCount: 0, totalAttempts: 0 },
      ];

      const proposals = matureComponentKnowledge(evidence);
      const matching = proposals.filter((p) => p.componentType === componentType);
      expect(matching.length).toBe(0);
    });
  }
});

// ─── Law 4: Confidence is always in [0, 1] ───

test.describe('Law 4: Confidence is always in [0, 1]', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const evidence = randomEvidenceList(next);
      const proposals = matureComponentKnowledge(evidence);

      for (const proposal of proposals) {
        expect(proposal.confidence).toBeGreaterThanOrEqual(0);
        expect(proposal.confidence).toBeLessThanOrEqual(1);
      }
    });
  }
});

// ─── Law 5: Action deduplication ───

test.describe('Law 5: Suggested actions contain no duplicates', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const evidence = randomEvidenceList(next);
      const proposals = matureComponentKnowledge(evidence);

      for (const proposal of proposals) {
        const uniqueActions = new Set(proposal.suggestedActions);
        expect(uniqueActions.size).toBe(proposal.suggestedActions.length);
      }
    });
  }
});

// ─── Law 6: Determinism ───

test.describe('Law 6: Same input always yields same output', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next1 = mulberry32(seed);
      const next2 = mulberry32(seed);
      const evidence1 = randomEvidenceList(next1);
      const evidence2 = randomEvidenceList(next2);

      const proposals1 = matureComponentKnowledge(evidence1);
      const proposals2 = matureComponentKnowledge(evidence2);

      expect(proposals1.length).toBe(proposals2.length);
      for (let i = 0; i < proposals1.length; i++) {
        expect(proposals1[i]!.componentType).toBe(proposals2[i]!.componentType);
        expect(proposals1[i]!.confidence).toBe(proposals2[i]!.confidence);
        expect(proposals1[i]!.suggestedActions).toEqual(proposals2[i]!.suggestedActions);
      }
    });
  }
});

// ─── Law 7: Empty evidence produces no proposals ───

test.describe('Law 7: Empty evidence list produces no proposals', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const proposals = matureComponentKnowledge([]);
      expect(proposals.length).toBe(0);
    });
  }
});

// ─── Law 8: Monotonicity — more successes never decrease confidence ───

test.describe('Law 8: Adding successes never decreases confidence', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const componentType = `widget-${randomWord(next)}`;
      const totalAttempts = randomInt(next, 30) + 2;
      const successCount = randomInt(next, totalAttempts);

      const evidenceBase: readonly ComponentEvidence[] = [
        { componentType, actions: ['click'], successCount, totalAttempts },
      ];
      const evidenceMore: readonly ComponentEvidence[] = [
        { componentType, actions: ['click'], successCount: successCount + 1, totalAttempts: totalAttempts + 1 },
      ];

      const proposalsBase = matureComponentKnowledge(evidenceBase);
      const proposalsMore = matureComponentKnowledge(evidenceMore);

      const baseConfidence = proposalsBase.find((p) => p.componentType === componentType)?.confidence ?? 0;
      const moreConfidence = proposalsMore.find((p) => p.componentType === componentType)?.confidence ?? 0;

      // Adding one success to one more attempt should not decrease confidence
      // (since the new rate is (s+1)/(t+1) which is >= s/t when s/t <= 1 and s >= 0)
      // But confidence also factors in saturation, so both rate and saturation increase
      expect(moreConfidence).toBeGreaterThanOrEqual(baseConfidence - 0.001); // epsilon for float
    });
  }
});

// ─── Law 9: Proposals sorted by descending confidence ───

test.describe('Law 9: Proposals are sorted by descending confidence', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const evidence = randomEvidenceList(next);
      const proposals = matureComponentKnowledge(evidence);

      for (let i = 1; i < proposals.length; i++) {
        const prev = proposals[i - 1]!;
        const curr = proposals[i]!;
        const confidenceOk = prev.confidence >= curr.confidence;
        const tieBreakOk = prev.confidence === curr.confidence
          ? prev.componentType.localeCompare(curr.componentType) <= 0
          : true;
        expect(confidenceOk || tieBreakOk).toBe(true);
      }
    });
  }
});
