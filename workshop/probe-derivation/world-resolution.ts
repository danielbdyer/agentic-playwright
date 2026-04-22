/**
 * World resolution — the helper both rung-2 classifiers and the
 * rung-3 projection call to turn a probe's raw `worldSetup` into a
 * concrete `surfaces[]` list, resolving any `preset` against the
 * default topology registry.
 *
 * Probes can declare their world in three shapes:
 *
 *   world: { surfaces: [...] }           — explicit surfaces
 *   world: { preset: "login-form" }      — named topology
 *   world: { preset: "...", surfaces: []} — preset wins
 *
 * All three resolve to a concrete `readonly SurfaceSpec[]`. Classifier
 * lookups and rung-3 projection both call this so they agree on the
 * world's content.
 */

import type { SurfaceSpec } from '../substrate/surface-spec';
import type { WorldShape } from '../substrate/world-shape';
import {
  resolveTopology,
  type TestTopologyRegistry,
} from '../substrate/test-topology';
import { createDefaultTopologyRegistry } from '../substrate/test-topology-catalog';

const DEFAULT_REGISTRY = createDefaultTopologyRegistry();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSurfaceSpec(value: unknown): value is SurfaceSpec {
  return isRecord(value) && typeof value['role'] === 'string';
}

/** Extract a WorldShape from a probe's opaque worldSetup + resolve
 *  any preset against the topology registry. Returns null when the
 *  worldSetup isn't a browser-bound world (no preset, no surfaces). */
export function resolveProbeWorld(
  worldSetup: unknown,
  registry: TestTopologyRegistry = DEFAULT_REGISTRY,
): WorldShape | null {
  if (!isRecord(worldSetup)) return null;
  const hasSurfaces = Array.isArray(worldSetup['surfaces']);
  const hasPreset = typeof worldSetup['preset'] === 'string';
  if (!hasSurfaces && !hasPreset) return null;
  const surfaces = hasSurfaces
    ? (worldSetup['surfaces'] as unknown[]).filter(isSurfaceSpec)
    : [];
  const entropy = isRecord(worldSetup['entropy'])
    ? (worldSetup['entropy'] as WorldShape['entropy'])
    : undefined;
  const preset = hasPreset ? (worldSetup['preset'] as string) : undefined;
  const shape: WorldShape = preset !== undefined
    ? (entropy !== undefined ? { surfaces, preset, entropy } : { surfaces, preset })
    : (entropy !== undefined ? { surfaces, entropy } : { surfaces });
  return resolveTopology(shape, registry);
}

/** Convenience: resolve directly to the concrete surface list. */
export function resolveProbeSurfaces(
  worldSetup: unknown,
  registry?: TestTopologyRegistry,
): readonly SurfaceSpec[] {
  const resolved = resolveProbeWorld(worldSetup, registry);
  return resolved?.surfaces ?? [];
}
