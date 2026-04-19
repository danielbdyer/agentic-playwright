import { expect, test } from '@playwright/test';
import {
  metric,
  isMetricOfKind,
  type Metric,
  type MetricProvenance,
} from '../../workshop/metrics/metric/value';
import {
  metricNode,
  foldMetricTree,
  flattenMetricTree,
  findMetricNode,
  mapMetricTree,
  countMetricNodes,
  metricTreeDepth,
  type MetricNode,
} from '../../workshop/metrics/metric/tree';
import {
  PIPELINE_METRIC_KINDS,
  PIPELINE_METRIC_POLARITY,
  metricPolarity,
  isPipelineMetricKind,
} from '../../workshop/metrics/metric/catalogue';
import {
  metricBaseline,
} from '../../workshop/metrics/metric/baseline';
import {
  diffMetricTrees,
  deltaVerdict,
} from '../../workshop/metrics/metric/delta';
import type { MetricVisitor } from '../../workshop/metrics/metric/visitor';
import { applyMetricVisitor, assertPipelineRegistryComplete } from '../../workshop/metrics/metric/visitor';

// ─── Provenance helper ─────────────────────────────────────────────

const PROV: MetricProvenance = {
  visitorId: 'test',
  receiptKinds: ['test-receipt'],
  receiptCount: 1,
  computedAt: '2026-04-07T00:00:00.000Z',
};

function m<K extends string>(kind: K, value: number): Metric<K> {
  return metric({ kind, value, unit: 'ratio', provenance: PROV });
}

// ─── Metric construction ───────────────────────────────────────────

test('metric() preserves the phantom kind discriminator', () => {
  const a = m('extraction-ratio', 0.85);
  expect(a.kind).toBe('extraction-ratio');
  expect(a.value).toBe(0.85);
  expect(isMetricOfKind(a, 'extraction-ratio')).toBe(true);
  expect(isMetricOfKind(a, 'handshake-density')).toBe(false);
});

// ─── Tree construction ────────────────────────────────────────────

test('leaf node has depth 1 and exactly 1 node', () => {
  const leaf = metricNode(m('extraction-ratio', 0.7));
  expect(metricTreeDepth(leaf)).toBe(1);
  expect(countMetricNodes(leaf)).toBe(1);
});

test('hierarchical tree counts and depth are correct', () => {
  const tree = metricNode(m('rung-distribution', 0.8), [
    metricNode(m('rung-1-share', 0.5)),
    metricNode(m('rung-2-share', 0.3), [
      metricNode(m('rung-2a-share', 0.2)),
      metricNode(m('rung-2b-share', 0.1)),
    ]),
  ]);
  expect(countMetricNodes(tree)).toBe(5);
  expect(metricTreeDepth(tree)).toBe(3);
});

// ─── Fold law: identity ────────────────────────────────────────────

test('fold with identity reducer returns root metric value', () => {
  const tree = metricNode(m('extraction-ratio', 0.42), [
    metricNode(m('handshake-density', 0.1)),
  ]);
  const rootValue = foldMetricTree<number>(tree, (metric) => metric.value);
  expect(rootValue).toBe(0.42);
});

test('fold with sum reducer accumulates all subtree values', () => {
  const tree = metricNode(m('a', 1), [
    metricNode(m('b', 2)),
    metricNode(m('c', 3), [metricNode(m('d', 4))]),
  ]);
  const total = foldMetricTree<number>(tree, (metric, childResults) =>
    metric.value + childResults.reduce((acc, n) => acc + n, 0),
  );
  expect(total).toBe(10);
});

// ─── Flatten law: pre-order ───────────────────────────────────────

test('flatten produces a pre-order traversal', () => {
  const tree = metricNode(m('root', 0), [
    metricNode(m('left', 1), [metricNode(m('left-leaf', 2))]),
    metricNode(m('right', 3)),
  ]);
  const flat = flattenMetricTree(tree);
  expect(flat.map((mt) => mt.kind)).toEqual(['root', 'left', 'left-leaf', 'right']);
});

test('flatten cardinality equals countMetricNodes', () => {
  const tree = metricNode(m('a', 0), [
    metricNode(m('b', 0)),
    metricNode(m('c', 0), [metricNode(m('d', 0))]),
  ]);
  expect(flattenMetricTree(tree).length).toBe(countMetricNodes(tree));
});

// ─── Find ─────────────────────────────────────────────────────────

test('findMetricNode returns the matching node', () => {
  const tree = metricNode(m('root', 0), [
    metricNode(m('target', 99)),
  ]);
  const found = findMetricNode(tree, 'target');
  expect(found?.metric.value).toBe(99);
});

test('findMetricNode returns undefined when no match', () => {
  const tree = metricNode(m('root', 0));
  expect(findMetricNode(tree, 'missing')).toBeUndefined();
});

// ─── Map preserves structure ──────────────────────────────────────

test('mapMetricTree preserves node count and depth', () => {
  const tree = metricNode(m('a', 1), [
    metricNode(m('b', 2)),
    metricNode(m('c', 3), [metricNode(m('d', 4))]),
  ]);
  const doubled = mapMetricTree(tree, (mt) =>
    metric({ kind: mt.kind, value: mt.value * 2, unit: mt.unit, provenance: mt.provenance }),
  );
  expect(countMetricNodes(doubled)).toBe(countMetricNodes(tree));
  expect(metricTreeDepth(doubled)).toBe(metricTreeDepth(tree));
  expect(foldMetricTree<number>(doubled, (mt, kids) => mt.value + kids.reduce((a, b) => a + b, 0))).toBe(20);
});

// ─── Catalogue exhaustiveness ─────────────────────────────────────

test('every L4 metric kind has a declared polarity', () => {
  for (const kind of PIPELINE_METRIC_KINDS) {
    expect(PIPELINE_METRIC_POLARITY[kind]).toBeDefined();
  }
});

test('isPipelineMetricKind narrows correctly', () => {
  expect(isPipelineMetricKind('extraction-ratio')).toBe(true);
  expect(isPipelineMetricKind('not-a-real-kind')).toBe(false);
});

test('metricPolarity returns neutral for non-L4 kinds', () => {
  expect(metricPolarity('rung-1-share')).toBe('neutral');
  expect(metricPolarity('extraction-ratio')).toBe('higher-is-better');
  expect(metricPolarity('handshake-density')).toBe('lower-is-better');
});

// ─── Visitor application ─────────────────────────────────────────

test('applyMetricVisitor returns the visitor output unchanged', () => {
  const visitor: MetricVisitor<{ readonly count: number }, 'extraction-ratio'> = {
    id: 'test:extraction-ratio',
    outputKind: 'extraction-ratio',
    inputDescription: '{ count: number }',
    visit: (input) => metricNode(m('extraction-ratio', input.count / 10)),
  };
  const result = applyMetricVisitor(visitor, { count: 8 });
  expect(result.metric.value).toBe(0.8);
  expect(result.metric.kind).toBe('extraction-ratio');
});

test('assertPipelineRegistryComplete throws on outputKind mismatch', () => {
  const bad = {
    'extraction-ratio': {
      id: 'bogus',
      outputKind: 'handshake-density',
      inputDescription: '',
      visit: () => metricNode(m('handshake-density', 0)),
    } as MetricVisitor<unknown, string>,
  };
  expect(() => assertPipelineRegistryComplete(bad)).toThrow(/mismatch/);
});

// ─── Baseline construction ───────────────────────────────────────

test('metricBaseline tags kind/version literally', () => {
  const tree = metricNode(m('extraction-ratio', 0.5));
  const baseline = metricBaseline({
    label: 'test',
    capturedAt: '2026-04-07T00:00:00.000Z',
    commitSha: 'abc123',
    pipelineVersion: '0.1.0',
    tree,
  });
  expect(baseline.kind).toBe('metric-baseline');
  expect(baseline.version).toBe(1);
  expect(baseline.label).toBe('test');
  expect(baseline.tree).toBe(tree);
});

// ─── Delta diff laws ──────────────────────────────────────────────

test('diff of identical trees is unchanged', () => {
  const tree = metricNode(m('extraction-ratio', 0.7), [
    metricNode(m('handshake-density', 0.1)),
  ]);
  const delta = diffMetricTrees({
    baselineLabel: 'self',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before: tree,
    after: tree,
  });
  expect(delta.entries).toHaveLength(2);
  for (const entry of delta.entries) {
    expect(entry.direction).toBe('unchanged');
    expect(entry.absolute).toBe(0);
  }
  expect(deltaVerdict(delta)).toBe('unchanged');
});

test('diff classifies higher-is-better metric improvement correctly', () => {
  const before = metricNode(m('extraction-ratio', 0.5));
  const after = metricNode(m('extraction-ratio', 0.7));
  const delta = diffMetricTrees({
    baselineLabel: 'pre',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(delta.entries[0]?.direction).toBe('better');
  expect(delta.entries[0]?.absolute).toBeCloseTo(0.2, 12);
  expect(delta.entries[0]?.relative).toBeCloseTo(0.4, 12);
  expect(deltaVerdict(delta)).toBe('improvement');
});

test('diff classifies lower-is-better metric improvement correctly', () => {
  const before = metricNode(m('handshake-density', 0.4));
  const after = metricNode(m('handshake-density', 0.1));
  const delta = diffMetricTrees({
    baselineLabel: 'pre',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(delta.entries[0]?.direction).toBe('better');
  expect(deltaVerdict(delta)).toBe('improvement');
});

test('diff classifies regression', () => {
  const before = metricNode(m('extraction-ratio', 0.8));
  const after = metricNode(m('extraction-ratio', 0.6));
  const delta = diffMetricTrees({
    baselineLabel: 'pre',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(delta.entries[0]?.direction).toBe('worse');
  expect(deltaVerdict(delta)).toBe('regression');
});

test('mixed delta when one metric improves and another regresses', () => {
  const before = metricNode(m('extraction-ratio', 0.5), [
    metricNode(m('handshake-density', 0.2)),
  ]);
  const after = metricNode(m('extraction-ratio', 0.7), [
    metricNode(m('handshake-density', 0.4)),
  ]);
  const delta = diffMetricTrees({
    baselineLabel: 'pre',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(deltaVerdict(delta)).toBe('mixed');
});

test('incomparable when metric exists on only one side', () => {
  const before = metricNode(m('extraction-ratio', 0.5));
  const after = metricNode(m('handshake-density', 0.1));
  const delta = diffMetricTrees({
    baselineLabel: 'pre',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  for (const entry of delta.entries) {
    expect(entry.direction).toBe('incomparable');
  }
});

test('delta entries are deterministically sorted by kind', () => {
  const before = metricNode(m('z', 1), [metricNode(m('a', 1))]);
  const after = metricNode(m('z', 1), [metricNode(m('a', 1))]);
  const delta = diffMetricTrees({
    baselineLabel: 'sort',
    comparedAt: '2026-04-07T00:00:00.000Z',
    before,
    after,
  });
  expect(delta.entries.map((e) => e.kind)).toEqual(['a', 'z']);
});

// ─── Determinism law ──────────────────────────────────────────────

test('diffMetricTrees is deterministic — same inputs produce identical outputs', () => {
  const before = metricNode(m('extraction-ratio', 0.5), [
    metricNode(m('handshake-density', 0.2)),
  ]);
  const after = metricNode(m('extraction-ratio', 0.7), [
    metricNode(m('handshake-density', 0.1)),
  ]);
  const a = diffMetricTrees({ baselineLabel: 'd', comparedAt: 'now', before, after });
  const b = diffMetricTrees({ baselineLabel: 'd', comparedAt: 'now', before, after });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});
