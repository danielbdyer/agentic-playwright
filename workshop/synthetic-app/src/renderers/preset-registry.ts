/**
 * Default ScreenPresetRegistry for the synthetic substrate.
 *
 * Empty at E1 — the screen-preset mechanism is live but no screens
 * are registered. E2 fills in policy-search's preset once the
 * gap-fill renderers land. E3+ add additional screens.
 *
 * Adding a preset: import the `FacetWorldSpec[]` list for the
 * screen and register here. The preset's facet list references
 * renderer IDs that must be present in the renderer registry —
 * that's the substrate's two-dimensional version surface at work
 * (renderer set × preset set).
 */

import {
  screenPresetRegistry,
  type ScreenPresetRegistry,
} from '../../../substrate/screen-preset';

export function createDefaultScreenPresetRegistry(): ScreenPresetRegistry {
  return screenPresetRegistry([]);
}
