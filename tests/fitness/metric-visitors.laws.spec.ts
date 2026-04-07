import { expect, test } from '@playwright/test';
import {
  buildL4MetricTree,
  L4_VISITORS,
  extractionRatioVisitor,
  handshakeDensityVisitor,
  rungDistributionVisitor,
  interventionCostVisitor,
  compoundingEconomicsVisitor,
} from '../../lib/domain/fitness/metric/visitors';
import {
  L4_METRIC_KINDS,
} from '../../lib/domain/fitness/metric/catalogue';
import {
  flattenMetricTree,
  findMetricNode,
  countMetricNodes,
} from '../../lib/domain/fitness/metric/tree';
import { diffMetricTrees, deltaVerdict } from '../../lib/domain/fitness/metric/delta';
import type { PipelineFitnessMetrics, LogicalProofObligation } from '../../lib/domain/fitness/types';

// ─── Synthetic fitness metrics fixture ──────────────────────────

function fakeMetrics(overrides: Partial<PipelineFitnessMetrics> = {}): PipelineFitnessMetrics {
  return {
    knowledgeHitRate: 0.7,
    effectiveHitRate: 0.85,
    suspensionRate: 0.05,
    agentFallbackRate: 0.03,
    liveDomFallbackRate: 0.02,
    translationPrecision: 0.92,
    translationRecall: 0.88,
    convergenceVelocity: 4,
    proposalYield: 0.6,
    resolutionByRung: [
      { rung: 'screen-knowledge', wins: 70, rate: 0.7 },
      { rung: 'shared-pattern', wins: 15, rate: 0.15 },
      { rung: 'live-dom', wins: 10, rate: 0.1 },
      { rung: 'structured-translation', wins: 5, rate: 0.05 },
    ],
    degradedLocatorRate: 0.04,
    recoverySuccessRate: 0.9,
    memoryMaturity: 5.2,
    memoryMaturityEntries: 36,
    proofObligations: [
      {
        obligation: 'compounding-economics',
        propertyRefs: ['C'],
        score: 0.72,
        status: 'healthy',
        evidence: 'fixture',
        measurementClass: 'direct',
      } as LogicalProofObligation,
      {
        obligation: 'operator-intervention-density',
        propertyRefs: ['A'],
        score: 0.08,
        status: 'healthy',
        evidence: 'fixture',
        measurementClass: 'direct',
      } as LogicalProofObligation,
    ],
    ...overrides,
  };
}

const COMPUTED_AT = '2026-04-07T00:00:00.000Z';

// ─── Registry exhaustiveness ────────────────────────────────────

test('L4_VISITORS has an entry for every L4_METRIC_KINDS entry', () => {
  for (const kind of L4_METRIC_KINDS) {
    expect(L4_VISITORS[kind]).toBeDefined();
    expect(L4_VISITORS[kind]?.outputKind).toBe(kind);
  }
});

test('L4_VISITORS has no extra entries beyond the catalogue', () => {
  expect(Object.keys(L4_VISITORS).sort()).toEqual([...L4_METRIC_KINDS].sort());
});

// ─── Per-visitor projections ────────────────────────────────────

test('extractionRatioVisitor exposes knowledgeHitRate at the root', () => {
  const node = extractionRatioVisitor.visit({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(node.metric.kind).toBe('extraction-ratio');
  expect(node.metric.value).toBe(0.7);
  // Children include effective-hit-rate, translation-precision, translation-recall.
  expect(findMetricNode(node, 'effective-hit-rate')?.metric.value).toBe(0.85);
  expect(findMetricNode(node, 'translation-precision')?.metric.value).toBe(0.92);
  expect(findMetricNode(node, 'translation-recall')?.metric.value).toBe(0.88);
});

test('extractionRatioVisitor omits effective-hit-rate when absent', () => {
  const metrics = fakeMetrics();
  const without: PipelineFitnessMetrics = {
    ...metrics,
    effectiveHitRate: undefined,
  };
  const node = extractionRatioVisitor.visit({ metrics: without, computedAt: COMPUTED_AT });
  expect(findMetricNode(node, 'effective-hit-rate')).toBeUndefined();
});

test('handshakeDensityVisitor aggregates suspension + agent + live-dom rates', () => {
  const node = handshakeDensityVisitor.visit({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(node.metric.kind).toBe('handshake-density');
  expect(node.metric.value).toBeCloseTo(0.05 + 0.03 + 0.02, 12);
  expect(findMetricNode(node, 'suspension-rate')?.metric.value).toBe(0.05);
  expect(findMetricNode(node, 'agent-fallback-rate')?.metric.value).toBe(0.03);
  expect(findMetricNode(node, 'live-dom-fallback-rate')?.metric.value).toBe(0.02);
});

test('handshakeDensityVisitor caps aggregate at 1', () => {
  const metrics = fakeMetrics({
    suspensionRate: 0.5,
    agentFallbackRate: 0.5,
    liveDomFallbackRate: 0.5,
  });
  const node = handshakeDensityVisitor.visit({ metrics, computedAt: COMPUTED_AT });
  expect(node.metric.value).toBe(1);
});

test('rungDistributionVisitor produces one child per rung', () => {
  const node = rungDistributionVisitor.visit({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(node.metric.kind).toBe('rung-distribution');
  expect(node.metric.value).toBe(100); // sum of wins
  expect(node.children).toHaveLength(4);
  expect(findMetricNode(node, 'rung-screen-knowledge-share')?.metric.value).toBe(0.7);
  expect(findMetricNode(node, 'rung-shared-pattern-share')?.metric.value).toBe(0.15);
});

test('rungDistributionVisitor children sorted deterministically by rung name', () => {
  const node = rungDistributionVisitor.visit({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  const childKinds = node.children.map((c) => c.metric.kind);
  const sorted = [...childKinds].sort();
  expect(childKinds).toEqual(sorted);
});

test('interventionCostVisitor uses operator-intervention-density obligation when present', () => {
  const node = interventionCostVisitor.visit({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(node.metric.kind).toBe('intervention-cost');
  expect(node.metric.value).toBe(0.08); // direct obligation score
  expect(findMetricNode(node, 'intervention-source')?.metric.value).toBe(1); // direct
});

test('interventionCostVisitor falls back to derived sum when obligation missing', () => {
  const metrics: PipelineFitnessMetrics = {
    ...fakeMetrics(),
    proofObligations: [],
  };
  const node = interventionCostVisitor.visit({ metrics, computedAt: COMPUTED_AT });
  expect(node.metric.value).toBeCloseTo(0.05 + 0.03, 12); // suspension + agent
  expect(findMetricNode(node, 'intervention-source')?.metric.value).toBe(0); // derived
});

test('compoundingEconomicsVisitor uses obligation score when present', () => {
  const node = compoundingEconomicsVisitor.visit({
    metrics: fakeMetrics(),
    computedAt: COMPUTED_AT,
  });
  expect(node.metric.kind).toBe('compounding-economics');
  expect(node.metric.value).toBe(0.72);
  expect(findMetricNode(node, 'memory-maturity')?.metric.value).toBe(5.2);
  expect(findMetricNode(node, 'memory-maturity-entries')?.metric.value).toBe(36);
  expect(findMetricNode(node, 'proposal-yield')?.metric.value).toBe(0.6);
  expect(findMetricNode(node, 'convergence-velocity')?.metric.value).toBe(4);
});

test('compoundingEconomicsVisitor falls back to proposalYield when obligation missing', () => {
  const metrics: PipelineFitnessMetrics = {
    ...fakeMetrics(),
    proofObligations: [],
  };
  const node = compoundingEconomicsVisitor.visit({ metrics, computedAt: COMPUTED_AT });
  expect(node.metric.value).toBe(0.6);
});

// ─── Aggregate tree builder ─────────────────────────────────────

test('buildL4MetricTree returns one root with one child per L4 kind', () => {
  const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(tree.metric.kind).toBe('l4-root');
  expect(tree.children).toHaveLength(L4_METRIC_KINDS.length);
});

test('buildL4MetricTree children are in L4_METRIC_KINDS declaration order', () => {
  const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  const childKinds = tree.children.map((c) => c.metric.kind);
  expect(childKinds).toEqual([...L4_METRIC_KINDS]);
});

test('buildL4MetricTree is deterministic', () => {
  const a = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  const b = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

test('buildL4MetricTree contains every L4 kind reachable via flatten', () => {
  const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  const flat = flattenMetricTree(tree);
  const kinds = new Set(flat.map((m) => m.kind));
  for (const kind of L4_METRIC_KINDS) {
    expect(kinds.has(kind)).toBe(true);
  }
});

test('buildL4MetricTree node count is non-trivial (> L4 kind count)', () => {
  // Sub-metrics should make the tree larger than just the L4 kinds.
  const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  expect(countMetricNodes(tree)).toBeGreaterThan(L4_METRIC_KINDS.length + 1);
});

// ─── Diff between two L4 trees ──────────────────────────────────

test('diff between identical L4 trees is unchanged', () => {
  const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: COMPUTED_AT });
  const delta = diffMetricTrees({
    baselineLabel: 'self',
    comparedAt: COMPUTED_AT,
    before: tree,
    after: tree,
  });
  expect(deltaVerdict(delta)).toBe('unchanged');
});

test('improving knowledgeHitRate produces a better extraction-ratio delta', () => {
  const before = buildL4MetricTree({
    metrics: fakeMetrics({ knowledgeHitRate: 0.5 }),
    computedAt: COMPUTED_AT,
  });
  const after = buildL4MetricTree({
    metrics: fakeMetrics({ knowledgeHitRate: 0.8 }),
    computedAt: COMPUTED_AT,
  });
  const delta = diffMetricTrees({
    baselineLabel: 'before',
    comparedAt: COMPUTED_AT,
    before,
    after,
  });
  const extractionEntry = delta.entries.find((e) => e.kind === 'extraction-ratio');
  expect(extractionEntry?.direction).toBe('better');
});

test('worsening suspensionRate produces a worse handshake-density delta', () => {
  const before = buildL4MetricTree({
    metrics: fakeMetrics({ suspensionRate: 0.05 }),
    computedAt: COMPUTED_AT,
  });
  const after = buildL4MetricTree({
    metrics: fakeMetrics({ suspensionRate: 0.25 }),
    computedAt: COMPUTED_AT,
  });
  const delta = diffMetricTrees({
    baselineLabel: 'before',
    comparedAt: COMPUTED_AT,
    before,
    after,
  });
  const entry = delta.entries.find((e) => e.kind === 'handshake-density');
  expect(entry?.direction).toBe('worse');
});
