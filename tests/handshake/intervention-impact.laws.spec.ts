import { expect, test } from '@playwright/test';
import {
  buildInterventionImpactReceipt,
  computeInterventionImpact,
  type RegionMetricSnapshot,
} from '../../product/domain/handshake/intervention-impact';

const before: RegionMetricSnapshot = {
  ambiguityRate: 0.5,
  suspensionRate: 0.3,
  meanRungIndex: 4,
};

// ─── computeInterventionImpact ────────────────────────────────────

test('positive intervention: ambiguity drops, rung improves, suspension cleared', () => {
  const after: RegionMetricSnapshot = { ambiguityRate: 0.1, suspensionRate: 0, meanRungIndex: 2 };
  const impact = computeInterventionImpact({ before, after });
  expect(impact.ambiguityReduction).toBeCloseTo(0.4, 4);
  expect(impact.suspensionAvoided).toBe(true);
  expect(impact.rungImprovement).toBeCloseTo(2, 4);
  expect(impact.activationQuality).toBe(1); // clamped to [0,1]
});

test('no-op intervention: identical snapshots → zero impact', () => {
  const impact = computeInterventionImpact({ before, after: before });
  expect(impact.ambiguityReduction).toBe(0);
  expect(impact.suspensionAvoided).toBe(false);
  expect(impact.rungImprovement).toBe(0);
  expect(impact.activationQuality).toBe(0);
});

test('negative intervention: rung regressed → impact reflects regression', () => {
  const after: RegionMetricSnapshot = { ambiguityRate: 0.6, suspensionRate: 0.5, meanRungIndex: 5 };
  const impact = computeInterventionImpact({ before, after });
  expect(impact.ambiguityReduction).toBeCloseTo(-0.1, 4);
  expect(impact.suspensionAvoided).toBe(false);
  expect(impact.rungImprovement).toBeCloseTo(-1, 4);
  expect(impact.activationQuality).toBe(0); // clamped at zero
});

test('suspensionAvoided requires before > 0 AND after === 0', () => {
  // Was zero, stayed zero — not "avoided"
  const a = computeInterventionImpact({
    before: { ambiguityRate: 0.5, suspensionRate: 0, meanRungIndex: 4 },
    after: { ambiguityRate: 0.5, suspensionRate: 0, meanRungIndex: 4 },
  });
  expect(a.suspensionAvoided).toBe(false);
  // Was non-zero, became non-zero — not "avoided"
  const b = computeInterventionImpact({
    before: { ambiguityRate: 0.5, suspensionRate: 0.3, meanRungIndex: 4 },
    after: { ambiguityRate: 0.5, suspensionRate: 0.1, meanRungIndex: 4 },
  });
  expect(b.suspensionAvoided).toBe(false);
});

test('activationQuality is clamped to [0, 1]', () => {
  const wildlyPositive: RegionMetricSnapshot = { ambiguityRate: -100, suspensionRate: 0, meanRungIndex: -50 };
  const impact = computeInterventionImpact({ before, after: wildlyPositive });
  expect(impact.activationQuality).toBe(1);
  expect(impact.activationQuality).toBeGreaterThanOrEqual(0);
  expect(impact.activationQuality).toBeLessThanOrEqual(1);
});

// ─── Receipt builder ─────────────────────────────────────────────

test('buildInterventionImpactReceipt: links intervention id and attached region', () => {
  const after: RegionMetricSnapshot = { ambiguityRate: 0.2, suspensionRate: 0, meanRungIndex: 3 };
  const receipt = buildInterventionImpactReceipt({
    interventionId: 'intervention-42',
    attachedRegion: 'policy-search',
    observedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(receipt.kind).toBe('intervention-impact-receipt');
  expect(receipt.version).toBe(1);
  expect(receipt.interventionId).toBe('intervention-42');
  expect(receipt.attachedRegion).toBe('policy-search');
  expect(receipt.tokenImpact.ambiguityReduction).toBeCloseTo(0.3, 4);
  expect(receipt.tokenImpact.suspensionAvoided).toBe(true);
  expect(receipt.tokenImpact.rungImprovement).toBeCloseTo(1, 4);
});

test('receipt is immutable: returned object is structurally identical to inputs', () => {
  const after: RegionMetricSnapshot = { ambiguityRate: 0.2, suspensionRate: 0, meanRungIndex: 3 };
  const receipt = buildInterventionImpactReceipt({
    interventionId: 'i',
    attachedRegion: 'r',
    observedAt: 'now',
    before,
    after,
  });
  expect(receipt.before).toBe(before);
  expect(receipt.after).toBe(after);
});
