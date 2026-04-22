/**
 * ScreenPreset — named compositions of facets.
 *
 * Per the Step-6 sign-off, facets are atomic and screens are
 * emergent. A screen preset names a canonical composition: a list
 * of facet world-specs that together form a "screen." Presets live
 * in their own registry, keyed by screen-id (same vocabulary the
 * manifest uses for screen scoping).
 *
 * ## Why a separate registry
 *
 * Facet renderers are leaves; screen presets are compositions. The
 * two have different lifecycles:
 *   - Adding a facet renderer: one file, one registry entry.
 *   - Adding a screen preset: naming a facet list — may compose
 *     renderers from multiple catalog scopes (future).
 * Keeping them as distinct registries makes the substrate-version
 * surface two-dimensional (renderer set × preset set) rather than
 * entangled.
 *
 * ## Overrides
 *
 * A WorldConfig can name a preset + supply per-facet hook
 * overrides (`config.hooks: { [facetId]: {...} }`). The resolver
 * merges each preset facet's default hooks with the override hooks
 * — override keys win per-key. This lets rung-3 classifiers ask
 * for "the policy-detail screen, but with the status-badge hidden"
 * in one URL without rewriting the full facet list.
 */

import type { FacetWorldSpec, WorldConfig } from './world-config';

/** A named screen preset — an ordered list of facet world-specs. */
export interface ScreenPreset {
  /** Stable screen identity. Scope-qualified: `policy-search`,
   *  `policy-detail`, etc. */
  readonly id: string;
  /** The preset's canonical facet list. Each spec carries its
   *  default hooks; callers may override per-facet via
   *  WorldConfig.hooks. */
  readonly facets: readonly FacetWorldSpec[];
}

/** The preset registry. Mirrors FacetRendererRegistry in shape. */
export interface ScreenPresetRegistry {
  readonly presets: ReadonlyMap<string, ScreenPreset>;
}

export function screenPresetRegistry(
  presets: readonly ScreenPreset[],
): ScreenPresetRegistry {
  const map = new Map<string, ScreenPreset>();
  for (const p of presets) map.set(p.id, p);
  return { presets: map };
}

export function lookupScreenPreset(
  registry: ScreenPresetRegistry,
  id: string,
): ScreenPreset | null {
  return registry.presets.get(id) ?? null;
}

export const EMPTY_SCREEN_PRESET_REGISTRY: ScreenPresetRegistry = {
  presets: new Map(),
};

/** Resolve a WorldConfig to its concrete facet list.
 *
 *  Precedence:
 *    1. If `config.facets` is present, use it directly.
 *    2. Else if `config.preset` is present and registered,
 *       expand to the preset's facet list. Apply `config.hooks`
 *       overrides on top of each facet's default hooks
 *       (override keys win per-key).
 *    3. Else return an empty list.
 *
 *  Pure — no IO, no Effect. */
export function resolveWorldConfig(
  config: WorldConfig,
  presetRegistry: ScreenPresetRegistry,
): readonly FacetWorldSpec[] {
  if (config.facets !== undefined) return config.facets;
  if (config.preset === undefined) return [];
  const preset = lookupScreenPreset(presetRegistry, config.preset);
  if (preset === null) return [];
  const overrides = config.hooks ?? {};
  return preset.facets.map((spec) => {
    const override = overrides[spec.facetId];
    if (override === undefined) return spec;
    return {
      facetId: spec.facetId,
      hooks: { ...spec.hooks, ...override },
    };
  });
}
