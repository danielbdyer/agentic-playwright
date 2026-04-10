/**
 * Discovery fidelity visitor laws — verifies that the fidelity
 * visitors produce correct coverage ratios from real atom data.
 */
import { describe, test, expect } from 'vitest';
import { atom } from '../../lib/domain/pipeline/atom';
import { asFingerprint } from '../../lib/domain/kernel/hash';
import { createElementId, createScreenId } from '../../lib/domain/kernel/identity';
import type { ElementAtomAddress } from '../../lib/domain/pipeline/atom-address';
import {
  DISCOVERY_VISITORS,
  buildDiscoveryMetricTree,
  type DiscoveryVisitorInput,
} from '../../lib/domain/fitness/metric/visitors-discovery';

function makeElementAtom(screen: string, element: string, source: 'cold-derivation' | 'agentic-override') {
  return atom({
    class: 'element',
    address: {
      class: 'element',
      screen: createScreenId(screen),
      element: createElementId(element),
    } satisfies ElementAtomAddress,
    content: { role: 'textbox', name: element },
    source,
    inputFingerprint: asFingerprint('atom-input', `sha256:${screen}-${element}`),
    provenance: { producedBy: 'test', producedAt: '2026-04-10T00:00:00Z' },
  });
}

describe('Discovery fidelity visitor laws', () => {
  test('Law 1: perfect match → fidelity 1.0', () => {
    const canonical = [
      makeElementAtom('search', 'btn', 'agentic-override'),
      makeElementAtom('search', 'input', 'agentic-override'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn', 'cold-derivation'),
      makeElementAtom('search', 'input', 'cold-derivation'),
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
      makeElementAtom('search', 'btn', 'agentic-override'),
      makeElementAtom('search', 'input', 'agentic-override'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn', 'cold-derivation'),
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
      makeElementAtom('search', 'btn', 'agentic-override'),
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
      makeElementAtom('search', 'btn', 'cold-derivation'),
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
      makeElementAtom('search', 'btn', 'agentic-override'),
      makeElementAtom('detail', 'title', 'agentic-override'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn', 'cold-derivation'),
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
      makeElementAtom('search', 'btn', 'agentic-override'),
    ];
    const discovered = [
      makeElementAtom('search', 'btn', 'cold-derivation'),
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
