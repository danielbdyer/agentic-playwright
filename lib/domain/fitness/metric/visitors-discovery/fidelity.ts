/**
 * Discovery fidelity visitors — compare cold-derived atoms against
 * canonical atoms per atom class.
 *
 * Fidelity = |addresses in discovered ∩ addresses in canonical|
 *          / |addresses in canonical|
 *
 * A fidelity of 1.0 means the discovery engine found every
 * canonical atom of that class. A fidelity of 0.0 means none
 * were found. The metric is a Jaccard-style coverage ratio,
 * NOT a content-equivalence check — it measures address-level
 * recall, not content accuracy. Content accuracy is a future
 * refinement.
 *
 * Pure domain — no Effect, no IO.
 */

import type { AtomClass } from '../../../pipeline/atom-address';
import { atomAddressToPath } from '../../../pipeline/atom-address';
import type { Atom } from '../../../pipeline/atom';
import type { PhaseOutputSource } from '../../../pipeline/source';
import { metric, type MetricProvenance } from '../value';
import { metricNode, type MetricNode } from '../tree';
import type { MetricVisitor } from '../visitor';
import type { DiscoveryVisitorInput } from './index';
import type { DiscoveryFitnessMetricKind } from '../catalogue-discovery';

/** Build a fidelity visitor for a specific atom class. The visitor
 *  filters both discovered and canonical atoms to the given class,
 *  then computes address-level coverage. */
export function fidelityVisitor<K extends DiscoveryFitnessMetricKind>(
  kind: K,
  atomClass: AtomClass,
  description: string,
): MetricVisitor<DiscoveryVisitorInput, K> {
  return {
    id: `discovery:${kind}`,
    outputKind: kind,
    inputDescription: description,
    visit: (input) => {
      const prov: MetricProvenance = {
        visitorId: `discovery:${kind}`,
        receiptKinds: ['discovery-input'],
        receiptCount: input.discoveredAtoms.length + input.canonicalAtoms.length,
        computedAt: input.computedAt,
      };

      const canonicalAddresses = addressSetForClass(input.canonicalAtoms, atomClass);
      const discoveredAddresses = addressSetForClass(input.discoveredAtoms, atomClass);

      const canonicalCount = canonicalAddresses.size;
      const matchCount = [...discoveredAddresses].filter((addr) =>
        canonicalAddresses.has(addr),
      ).length;

      const fidelity = canonicalCount > 0 ? matchCount / canonicalCount : 0;

      const root = metric({
        kind,
        value: Number(fidelity.toFixed(4)),
        unit: 'ratio',
        provenance: prov,
      });

      const children = [
        metricNode(metric({
          kind: `${kind}:canonical-count` as K,
          value: canonicalCount,
          unit: 'count',
          provenance: prov,
        })),
        metricNode(metric({
          kind: `${kind}:discovered-count` as K,
          value: discoveredAddresses.size,
          unit: 'count',
          provenance: prov,
        })),
        metricNode(metric({
          kind: `${kind}:match-count` as K,
          value: matchCount,
          unit: 'count',
          provenance: prov,
        })),
      ];

      return metricNode(root, children);
    },
  };
}

/** Extract the set of address paths for atoms of a specific class. */
function addressSetForClass(
  atoms: readonly Atom<AtomClass, unknown, PhaseOutputSource>[],
  targetClass: AtomClass,
): Set<string> {
  const result = new Set<string>();
  for (const atom of atoms) {
    if (atom.class === targetClass) {
      result.add(atomAddressToPath(atom.address));
    }
  }
  return result;
}

/** Compute overall discovery coverage: what fraction of canonical
 *  atom addresses (across all classes) did the discovery engine
 *  produce anything for? */
export function coverageVisitor(
): MetricVisitor<DiscoveryVisitorInput, 'discovery-coverage'> {
  return {
    id: 'discovery:discovery-coverage',
    outputKind: 'discovery-coverage',
    inputDescription: 'Address coverage of cold-derivation across all atom classes',
    visit: (input) => {
      const prov: MetricProvenance = {
        visitorId: 'discovery:discovery-coverage',
        receiptKinds: ['discovery-input'],
        receiptCount: input.discoveredAtoms.length + input.canonicalAtoms.length,
        computedAt: input.computedAt,
      };

      const canonicalAddresses = new Set(
        input.canonicalAtoms.map((a) => atomAddressToPath(a.address)),
      );
      const discoveredAddresses = new Set(
        input.discoveredAtoms.map((a) => atomAddressToPath(a.address)),
      );

      const canonicalCount = canonicalAddresses.size;
      const matchCount = [...discoveredAddresses].filter((addr) =>
        canonicalAddresses.has(addr),
      ).length;

      const coverage = canonicalCount > 0 ? matchCount / canonicalCount : 0;

      return metricNode(
        metric({
          kind: 'discovery-coverage',
          value: Number(coverage.toFixed(4)),
          unit: 'ratio',
          provenance: prov,
        }),
        [
          metricNode(metric({
            kind: 'discovery-coverage:canonical-count' as 'discovery-coverage',
            value: canonicalCount,
            unit: 'count',
            provenance: prov,
          })),
          metricNode(metric({
            kind: 'discovery-coverage:match-count' as 'discovery-coverage',
            value: matchCount,
            unit: 'count',
            provenance: prov,
          })),
        ],
      );
    },
  };
}
