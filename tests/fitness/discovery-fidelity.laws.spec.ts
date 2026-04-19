/**
 * Discovery fidelity visitor laws — verifies that the fidelity
 * visitors produce correct coverage ratios from real atom data.
 */
import { describe, test, expect } from 'vitest';
import { createElementId, createScreenId } from '../../product/domain/kernel/identity';
import {
  DISCOVERY_VISITORS,
  buildDiscoveryMetricTree,
} from '../../workshop/metrics/metric/visitors-discovery';

import type { DiscoveryAtomShape } from '../../workshop/metrics/metric/visitors-discovery';

function makeElementAtom(screen: string, element: string): DiscoveryAtomShape {
  return {
    class: 'element',
    address: {
      class: 'element',
      screen: createScreenId(screen),
      element: createElementId(element),
    },
  };
}

describe('Discovery fidelity visitor laws', () => {
  test('Law 1: perfect match → fidelity 1.0', () => {
    const canonical = [
      makeElementAtom('search', 'btn'),
      makeElementAtom('search', 'input'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn'),
      makeElementAtom('search', 'input'),
    ];

    const node = DISCOVERY_VISITORS['discovery-element-fidelity'].visit({
      discoveredAtoms: discovered,
      canonicalAtoms: canonical,
      computedAt: '2026-04-10T00:00:00Z',
    });

    expect(node.metric.value).toBe(1);
  });

  test('Law 2: partial match → fidelity 0.5', () => {
    const canonical = [
      makeElementAtom('search', 'btn'),
      makeElementAtom('search', 'input'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn'),
      // input is missing
    ];

    const node = DISCOVERY_VISITORS['discovery-element-fidelity'].visit({
      discoveredAtoms: discovered,
      canonicalAtoms: canonical,
      computedAt: '2026-04-10T00:00:00Z',
    });

    expect(node.metric.value).toBe(0.5);
  });

  test('Law 3: no match → fidelity 0', () => {
    const canonical = [
      makeElementAtom('search', 'btn'),
    ];

    const node = DISCOVERY_VISITORS['discovery-element-fidelity'].visit({
      discoveredAtoms: [],
      canonicalAtoms: canonical,
      computedAt: '2026-04-10T00:00:00Z',
    });

    expect(node.metric.value).toBe(0);
  });

  test('Law 4: empty canonical → fidelity 0 (nothing to match against)', () => {
    const discovered = [
      makeElementAtom('search', 'btn'),
    ];

    const node = DISCOVERY_VISITORS['discovery-element-fidelity'].visit({
      discoveredAtoms: discovered,
      canonicalAtoms: [],
      computedAt: '2026-04-10T00:00:00Z',
    });

    expect(node.metric.value).toBe(0);
  });

  test('Law 5: discovery-coverage computes across all classes', () => {
    const canonical = [
      makeElementAtom('search', 'btn'),
      makeElementAtom('detail', 'title'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn'),
    ];

    const node = DISCOVERY_VISITORS['discovery-coverage'].visit({
      discoveredAtoms: discovered,
      canonicalAtoms: canonical,
      computedAt: '2026-04-10T00:00:00Z',
    });

    expect(node.metric.value).toBe(0.5); // 1 of 2 addresses matched
  });

  test('Law 6: full tree builds with fidelity visitors producing real values', () => {
    const canonical = [
      makeElementAtom('search', 'btn'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn'),
    ];

    const tree = buildDiscoveryMetricTree({
      discoveredAtoms: discovered,
      canonicalAtoms: canonical,
      computedAt: '2026-04-10T00:00:00Z',
    });

    // Element fidelity should be 1.0
    const elementNode = tree.children.find(
      (c) => c.metric.kind === 'discovery-element-fidelity',
    );
    expect(elementNode).toBeDefined();
    expect(elementNode!.metric.value).toBe(1);

    // Coverage should also be 1.0 (only element atoms, all matched)
    const coverageNode = tree.children.find(
      (c) => c.metric.kind === 'discovery-coverage',
    );
    expect(coverageNode).toBeDefined();
    expect(coverageNode!.metric.value).toBe(1);
  });
});
