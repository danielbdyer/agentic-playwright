/**
 * TestTopology — named compositions of SurfaceSpecs.
 *
 * Per the Step-6 sign-off, screens return as "end-to-end synthetic
 * integration tests" — not business-domain screens (policy-search,
 * policy-detail) but **test topologies**: canonical compositions of
 * surfaces that exercise specific query / interaction patterns.
 *
 *   login-form        — form + 2 textboxes + button
 *   tabbed-interface  — tablist + N tabs + N tabpanels
 *   paginated-grid    — grid + rows + rowheaders + pagination links
 *   wizard            — step-N flow with forward/back navigation
 *
 * A test topology is a `WorldShape` factory: it returns the
 * complete surfaces[] array (and optional entropy) that probes can
 * share without re-authoring. Fixtures reference topologies by ID
 * via `world.preset: "login-form"`; the resolver expands to the
 * canonical surface list.
 *
 * ## Why this is secondary
 *
 * Atomic SurfaceSpecs remain the primary vocabulary. Topologies
 * are a reuse mechanism — when >1 fixture wants the same
 * multi-surface layout. They are NOT a business-domain vocabulary.
 * A topology has zero mapping to an insurance application; it's a
 * structural test target.
 *
 * ## Shape
 *
 *   TestTopology       — id + surfaces + optional entropy
 *   TestTopologyRegistry — keyed map, look-up, empty baseline
 *   resolveTopology    — apply registry to a WorldShape
 *
 * Pure domain; no React.
 */

import type { SurfaceSpec } from './surface-spec';
import type { EntropyProfile } from './entropy-profile';
import type { WorldShape } from './world-shape';

/** A named test topology — a canonical SurfaceSpec composition. */
export interface TestTopology {
  /** Stable topology ID. Topologies are named for their structural
   *  pattern (login-form, tabbed-interface, paginated-grid), not
   *  for business domains. */
  readonly id: string;
  /** The composed surface tree. */
  readonly surfaces: readonly SurfaceSpec[];
  /** Optional default entropy profile the topology carries. */
  readonly entropy?: EntropyProfile;
}

export interface TestTopologyRegistry {
  readonly topologies: ReadonlyMap<string, TestTopology>;
}

export function testTopologyRegistry(
  topologies: readonly TestTopology[],
): TestTopologyRegistry {
  const map = new Map<string, TestTopology>();
  for (const t of topologies) map.set(t.id, t);
  return { topologies: map };
}

export function lookupTopology(
  registry: TestTopologyRegistry,
  id: string,
): TestTopology | null {
  return registry.topologies.get(id) ?? null;
}

export const EMPTY_TOPOLOGY_REGISTRY: TestTopologyRegistry = {
  topologies: new Map(),
};

/** Resolve a WorldShape's `preset` against the topology registry.
 *  Returns the shape unchanged if `preset` is absent or the
 *  topology is unknown. When `preset` resolves, the topology's
 *  surfaces + entropy merge in — explicit `surfaces` on the
 *  WorldShape take precedence (additive), and explicit `entropy`
 *  on the WorldShape wins over the topology's default entropy. */
export function resolveTopology(
  shape: WorldShape,
  registry: TestTopologyRegistry,
): WorldShape {
  if (shape.preset === undefined) return shape;
  const topology = lookupTopology(registry, shape.preset);
  if (topology === null) return shape;
  const surfaces = shape.surfaces.length > 0 ? shape.surfaces : topology.surfaces;
  const entropy = shape.entropy ?? topology.entropy;
  const { preset: _preset, ...rest } = shape;
  return entropy === undefined ? { ...rest, surfaces } : { ...rest, surfaces, entropy };
}
