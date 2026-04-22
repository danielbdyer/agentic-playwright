/**
 * SubstrateRenderer — the synthetic substrate's root component.
 *
 * Per the Step-6 first-principles redesign, the substrate is a
 * pure function of (WorldConfig, FacetRendererRegistry) → DOM.
 * This component is that function's concrete instantiation at
 * rung 3 — it reads a WorldConfig, looks up each facet in the
 * registry, and renders the resulting facet components.
 *
 * ## Error surfaces are DOM-visible
 *
 * Three failure modes render loud, accessible DOM markers rather
 * than silent no-ops:
 *
 *   - null worldConfig → `<div data-substrate-state="no-world">`
 *   - empty worldConfig → `<div data-substrate-state="empty">`
 *   - missing renderer for a facetId →
 *     `<div data-substrate-state="missing-renderer" data-facet-id="...">`
 *
 * The rung-3 classifier can inspect these markers via Playwright
 * queries and classify receipts appropriately (harness-level
 * errors, not probe outcomes). Human operators debugging via a
 * browser see the same markers with role="alert" so screen
 * readers announce them.
 *
 * ## No state
 *
 * The component reads worldConfig + registry via props and
 * renders deterministically. No useState, no useEffect, no
 * side channels — the substrate is a pure function for the same
 * reason probes are: reproducibility (memo §7 graduation metric 3).
 */

import type { FC } from 'react';
import {
  lookupFacetRenderer,
  type FacetRendererRegistry,
} from '../../substrate/facet-renderer';
import type { WorldConfig } from '../../substrate/world-config';
import {
  resolveWorldConfig,
  type ScreenPresetRegistry,
} from '../../substrate/screen-preset';

export interface SubstrateRendererProps {
  readonly registry: FacetRendererRegistry;
  readonly presetRegistry: ScreenPresetRegistry;
  /** Null when the URL carried no parseable world config. The
   *  renderer surfaces this loudly in the DOM. */
  readonly worldConfig: WorldConfig | null;
}

export const SubstrateRenderer: FC<SubstrateRendererProps> = ({
  registry,
  presetRegistry,
  worldConfig,
}) => {
  if (worldConfig === null) {
    return (
      <div
        data-substrate-state="no-world"
        role="alert"
        aria-label="No world configured"
      >
        No world configured. The synthetic substrate expects a
        <code> ?world=...</code> query parameter carrying a
        URI-encoded WorldConfig JSON blob.
      </div>
    );
  }

  const resolvedFacets = resolveWorldConfig(worldConfig, presetRegistry);

  if (resolvedFacets.length === 0) {
    // Distinguish "preset name unknown" from "empty world" to help
    // debuggability — the former is a substrate misconfiguration.
    if (
      worldConfig.preset !== undefined &&
      !presetRegistry.presets.has(worldConfig.preset)
    ) {
      return (
        <div
          data-substrate-state="unknown-preset"
          data-preset-id={worldConfig.preset}
          role="alert"
        >
          Unknown screen preset: <code>{worldConfig.preset}</code>
        </div>
      );
    }
    return (
      <div
        data-substrate-state="empty"
        role="status"
        aria-label="Empty world"
      >
        Empty world — no facets to render.
      </div>
    );
  }

  return (
    <main data-substrate-state="rendered" data-preset-id={worldConfig.preset ?? undefined}>
      {resolvedFacets.map((spec, index) => {
        const renderer = lookupFacetRenderer(registry, spec.facetId);
        if (renderer === null) {
          return (
            <div
              key={`${spec.facetId}:${index}`}
              data-substrate-state="missing-renderer"
              data-facet-id={spec.facetId}
              role="alert"
            >
              Missing renderer for facet: <code>{spec.facetId}</code>
            </div>
          );
        }
        const { Component } = renderer;
        return (
          <Component
            key={`${spec.facetId}:${index}`}
            hooks={spec.hooks}
          />
        );
      })}
    </main>
  );
};
