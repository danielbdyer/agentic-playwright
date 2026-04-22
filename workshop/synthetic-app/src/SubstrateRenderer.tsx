/**
 * SubstrateRenderer — the synthetic substrate's root component.
 *
 * Reads a WorldShape, applies the optional EntropyProfile via
 * EntropyWrapper, and renders each SurfaceSpec through the
 * universal SurfaceRenderer.
 *
 * No facet registry. No screen-specific code. The substrate is a
 * pure function (WorldShape) → DOM.
 *
 * Error surfaces are DOM-visible:
 *   null worldShape → `<div data-substrate-state="no-world">`
 *   empty surfaces  → `<div data-substrate-state="empty">`
 */

import type { FC } from 'react';
import type { WorldShape } from '../../substrate/world-shape';
import {
  EMPTY_ENTROPY_PROFILE,
  rngShuffle,
  seededRandom,
} from '../../substrate/entropy-profile';
import {
  resolveTopology,
  type TestTopologyRegistry,
} from '../../substrate/test-topology';
import { SurfaceRenderer } from './SurfaceRenderer';
import { EntropyWrapper } from './EntropyWrapper';

export interface SubstrateRendererProps {
  readonly worldShape: WorldShape | null;
  readonly topologyRegistry: TestTopologyRegistry;
}

export const SubstrateRenderer: FC<SubstrateRendererProps> = ({
  worldShape,
  topologyRegistry,
}) => {
  if (worldShape === null) {
    return (
      <div
        data-substrate-state="no-world"
        role="alert"
        aria-label="No world configured"
      >
        No world configured. The synthetic substrate expects a
        <code> ?shape=...</code> query parameter carrying a
        URI-encoded WorldShape JSON blob.
      </div>
    );
  }

  // Resolve any topology preset BEFORE rendering — expands
  // `world.preset: "login-form"` into the canonical surfaces +
  // entropy before entropy seeding.
  const resolved = resolveTopology(worldShape, topologyRegistry);

  if (resolved.surfaces.length === 0) {
    return (
      <div
        data-substrate-state="empty"
        role="status"
        aria-label="Empty world"
      >
        Empty world — no surfaces to render.
      </div>
    );
  }

  const profile = resolved.entropy ?? EMPTY_ENTROPY_PROFILE;
  const rng = seededRandom(profile.seed ?? 'default');

  const orderedSurfaces = profile.surfaceOrder === 'shuffled'
    ? rngShuffle(rng, resolved.surfaces)
    : [...resolved.surfaces];

  const surfaces = (
    <>
      {orderedSurfaces.map((spec, index) => (
        <SurfaceRenderer key={`${spec.role}:${spec.name ?? ''}:${index}`} spec={spec} />
      ))}
    </>
  );

  return (
    <main data-substrate-state="rendered">
      <EntropyWrapper profile={profile} rng={rng}>
        {surfaces}
      </EntropyWrapper>
    </main>
  );
};
