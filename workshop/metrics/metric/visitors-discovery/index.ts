/**
 * Discovery-fitness L4 visitor registry and aggregate tree builder.
 *
 * Mirrors the pipeline-efficacy registry at `visitors/index.ts` but
 * for the discovery engine's fitness tree. Each visitor answers a
 * "how well does cold-derivation match existing canon?" question.
 *
 * All visitors start as stubs that return zero-value proxies. They
 * get promoted to real implementations as the discovery engine
 * matures through Phases B–E of the convergence plan.
 *
 * The mapped-type registry forces compile-time exhaustiveness:
 * adding a new DiscoveryFitnessMetricKind without registering a
 * visitor here is a TypeScript error.
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 2
 */

import { metric, type MetricProvenance } from '../value';
import { metricNode, type MetricNode } from '../tree';
import {
  DISCOVERY_FITNESS_METRIC_KINDS,
  type DiscoveryFitnessMetricKind,
} from '../catalogue-discovery';
import type { MetricVisitor } from '../visitor';
import type { AtomClass, AtomAddress } from '../../../../product/domain/pipeline/atom-address';
import { fidelityVisitor, coverageVisitor } from './fidelity';

// ─── Visitor input shape ────────────────────────────────────────

/** Structural atom shape for discovery-fitness visitors. Uses a
 *  structural type (not the full generic `Atom<C, T, Src>`) so
 *  atoms of any class/content/source are accepted without
 *  variance issues on the generic parameters. Visitors only read
 *  `class` and `address` for fidelity computation. */
export interface DiscoveryAtomShape {
  readonly class: AtomClass;
  readonly address: AtomAddress;
}

/** The input shape for discovery-fitness visitors. Carries the
 *  cold-derivation manifest (the atoms the discovery engine
 *  produced) and the canonical snapshot (the atoms already in the
 *  canon store). */
export interface DiscoveryVisitorInput {
  /** Atoms produced by the cold-derivation engine in this run. */
  readonly discoveredAtoms: readonly DiscoveryAtomShape[];
  /** Atoms currently in the canonical store (from the catalog). */
  readonly canonicalAtoms: readonly DiscoveryAtomShape[];
  /** ISO timestamp of the computation. */
  readonly computedAt: string;
}

// ─── Stub visitor factory ───────────────────────────────────────

/** Build a stub visitor for a discovery-fitness metric kind. The
 *  stub returns a zero-value proxy metric with provenance noting
 *  it's a stub. Stubs are replaced with real implementations as
 *  the discovery engine matures. */
function stubVisitor<K extends DiscoveryFitnessMetricKind>(
  kind: K,
  description: string,
): MetricVisitor<DiscoveryVisitorInput, K> {
  return {
    id: `discovery:${kind}`,
    outputKind: kind,
    inputDescription: description,
    visit: (input) => {
      const provenance: MetricProvenance = {
        visitorId: `discovery:${kind}`,
        receiptKinds: ['discovery-input'],
        receiptCount: input.discoveredAtoms.length + input.canonicalAtoms.length,
        computedAt: input.computedAt,
      };
      return metricNode(
        metric({
          kind,
          value: 0,
          unit: 'ratio',
          provenance,
        }),
        [],
      );
    },
  };
}

// ─── Registry ───────────────────────────────────────────────────

/** Compile-time-exhaustive registry over discovery-fitness metric
 *  kinds. Adding a kind to `DISCOVERY_FITNESS_METRIC_KINDS` without
 *  an entry here is a type error. */
export const DISCOVERY_VISITORS: {
  readonly [K in DiscoveryFitnessMetricKind]: MetricVisitor<
    DiscoveryVisitorInput,
    K
  >;
} = {
  'discovery-route-fidelity': fidelityVisitor(
    'discovery-route-fidelity', 'route',
    'Cold-derived routes vs canonical route atoms',
  ),
  'discovery-surface-fidelity': fidelityVisitor(
    'discovery-surface-fidelity', 'surface',
    'Cold-derived surfaces vs canonical surface atoms',
  ),
  'discovery-element-fidelity': fidelityVisitor(
    'discovery-element-fidelity', 'element',
    'Cold-derived elements vs canonical element atoms',
  ),
  'discovery-posture-fidelity': fidelityVisitor(
    'discovery-posture-fidelity', 'posture',
    'Cold-derived postures vs canonical posture atoms',
  ),
  'discovery-selector-fidelity': fidelityVisitor(
    'discovery-selector-fidelity', 'selector',
    'Cold-derived selectors vs canonical selector atoms',
  ),
  'discovery-coverage': coverageVisitor(),
  'intervention-graduation-rate': stubVisitor(
    'intervention-graduation-rate',
    'Rolling fraction of agentic overrides demoted to deterministic',
  ),
  'discovery-family-recognition-rate': stubVisitor(
    'discovery-family-recognition-rate',
    'Runtime-family recognition rate (Phase E stub)',
  ),
};

// ─── Tree builder ───────────────────────────────────────────────

/** Aggregate discovery-fitness metric tree. Same shape as
 *  `buildPipelineMetricTree` in `visitors/index.ts` — a synthetic
 *  root with one child per discovery-fitness metric kind. */
export function buildDiscoveryMetricTree(
  input: DiscoveryVisitorInput,
): MetricNode {
  const provenance: MetricProvenance = {
    visitorId: 'discovery:root',
    receiptKinds: ['discovery-input'],
    receiptCount: DISCOVERY_FITNESS_METRIC_KINDS.length,
    computedAt: input.computedAt,
  };

  const children: readonly MetricNode[] =
    DISCOVERY_FITNESS_METRIC_KINDS.map((kind) => {
      const visitor = DISCOVERY_VISITORS[kind];
      return visitor.visit(input);
    });

  const root = metric({
    kind: 'discovery-root',
    value: DISCOVERY_FITNESS_METRIC_KINDS.length,
    unit: 'count',
    provenance,
  });

  return metricNode(root, children);
}
