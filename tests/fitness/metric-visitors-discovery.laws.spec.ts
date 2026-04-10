/**
 * Discovery-fitness visitor registry exhaustiveness laws.
 *
 * Mirrors tests/fitness/metric-visitors.laws.spec.ts for the
 * discovery-fitness tree. Every DiscoveryFitnessMetricKind must
 * have a registered visitor, and every registered visitor must
 * produce output with the correct kind tag.
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 7
 */
import { describe, test, expect } from 'vitest';
import {
  DISCOVERY_FITNESS_METRIC_KINDS,
  type DiscoveryFitnessMetricKind,
} from '../../lib/domain/fitness/metric/catalogue-discovery';
import {
  DISCOVERY_L4_VISITORS,
  buildDiscoveryL4MetricTree,
  type DiscoveryL4VisitorInput,
} from '../../lib/domain/fitness/metric/visitors-discovery';

function makeStubInput(): DiscoveryL4VisitorInput {
  return {
    discoveredAtoms: [],
    canonicalAtoms: [],
    computedAt: '2026-04-10T00:00:00.000Z',
  };
}

describe('Discovery-fitness visitor registry laws', () => {
  test('Law 1: every DiscoveryFitnessMetricKind has a registered visitor', () => {
    for (const kind of DISCOVERY_FITNESS_METRIC_KINDS) {
      const visitor = DISCOVERY_L4_VISITORS[kind];
      expect(visitor).toBeDefined();
      expect(visitor.outputKind).toBe(kind);
    }
  });

  test('Law 2: every registered visitor produces a metric node with the correct kind', () => {
    const input = makeStubInput();
    for (const kind of DISCOVERY_FITNESS_METRIC_KINDS) {
      const visitor = DISCOVERY_L4_VISITORS[kind];
      const node = visitor.visit(input);
      expect(node.metric.kind).toBe(kind);
    }
  });

  test('Law 3: DISCOVERY_L4_VISITORS has exactly as many entries as DISCOVERY_FITNESS_METRIC_KINDS', () => {
    const visitorKeys = Object.keys(DISCOVERY_L4_VISITORS);
    expect(visitorKeys.length).toBe(DISCOVERY_FITNESS_METRIC_KINDS.length);
  });

  test('Law 4: buildDiscoveryL4MetricTree returns a tree with one child per kind', () => {
    const tree = buildDiscoveryL4MetricTree(makeStubInput());
    expect(tree.metric.kind).toBe('discovery-l4-root');
    expect(tree.children.length).toBe(DISCOVERY_FITNESS_METRIC_KINDS.length);

    const childKinds = tree.children.map((c) => c.metric.kind).sort();
    const expectedKinds = [...DISCOVERY_FITNESS_METRIC_KINDS].sort();
    expect(childKinds).toEqual(expectedKinds);
  });

  test('Law 5: stub visitors return zero-value proxy metrics', () => {
    const input = makeStubInput();
    for (const kind of DISCOVERY_FITNESS_METRIC_KINDS) {
      const node = DISCOVERY_L4_VISITORS[kind].visit(input);
      expect(node.metric.value).toBe(0);
      expect(node.metric.unit).toBe('ratio');
    }
  });
});
