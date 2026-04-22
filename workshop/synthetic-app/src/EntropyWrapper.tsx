/**
 * EntropyWrapper — applies an EntropyProfile to a rendered surface.
 *
 * Wraps children in a deterministic, seeded fuzz shell:
 *   - N nested `<div class="fuzz-shell fuzz-shell-{depth}">` layers.
 *   - Chrome tone class on the outer wrapper.
 *   - Spacing density class on the outer wrapper.
 *   - K callout labels (shuffled) rendered in a `data-entropy="callouts"`
 *     region above the children.
 *   - M badge labels (subset + shuffled) in `data-entropy="badges"`.
 *   - J noise `<span>` siblings before and after each child.
 *
 * The wrapper is ORTHOGONAL to the SurfaceSpec axes. It perturbs the
 * chrome around surfaces; it never touches the semantic properties
 * (role, name, visibility, enabled, etc.) the classifier reads.
 *
 * Determinism: the wrapper receives a pre-derived `rng` from the
 * caller (the parent SubstrateRenderer hashes the WorldShape's seed
 * once per render). Two identical (shape, seed) pairs produce
 * byte-identical DOM.
 */

import { Fragment, type FC, type ReactNode } from 'react';
import {
  BADGE_LABEL_POOL,
  CALLOUT_LABEL_POOL,
  type EntropyProfile,
  rngInt,
  rngPick,
  rngShuffle,
  rngSubset,
} from '../../substrate/entropy-profile';

export interface EntropyWrapperProps {
  readonly profile: EntropyProfile;
  readonly rng: () => number;
  readonly children: ReactNode;
}

/** Wrap children in N nested divs, inside-out. */
function applyDepth(children: ReactNode, depth: number, rng: () => number): ReactNode {
  let out = children;
  for (let i = 0; i < depth; i++) {
    out = <div className={`fuzz-shell fuzz-shell-${i + 1}`}>{out}</div>;
    // Consume one RNG step per layer so layer-count variation and
    // callout order vary independently.
    rng();
  }
  return out;
}

/** Insert J noise spans before and after children, where J is drawn
 *  from [min, max]. */
function applyJitter(
  children: ReactNode,
  range: readonly [number, number],
  rng: () => number,
): ReactNode {
  const before = rngInt(rng, range[0], range[1]);
  const after = rngInt(rng, range[0], range[1]);
  return (
    <>
      {Array.from({ length: before }).map((_, i) => (
        <span key={`jitter-before-${i}`} data-entropy="jitter" aria-hidden="true">
          {' '}
        </span>
      ))}
      {children}
      {Array.from({ length: after }).map((_, i) => (
        <span key={`jitter-after-${i}`} data-entropy="jitter" aria-hidden="true">
          {' '}
        </span>
      ))}
    </>
  );
}

export const EntropyWrapper: FC<EntropyWrapperProps> = ({ profile, rng, children }) => {
  // Layer 1: jitter around the surfaces themselves.
  let inner: ReactNode = children;
  if (profile.siblingJitter !== undefined) {
    inner = applyJitter(inner, profile.siblingJitter, rng);
  }

  // Layer 2: wrapper depth.
  if (profile.wrapperDepth !== undefined) {
    const depth = rngInt(rng, profile.wrapperDepth[0], profile.wrapperDepth[1]);
    inner = applyDepth(inner, depth, rng);
  }

  // Layer 3: callouts above the surfaces.
  let callouts: ReactNode = null;
  if (profile.calloutShuffle !== undefined) {
    const picked = rngSubset(rng, CALLOUT_LABEL_POOL, profile.calloutShuffle.count);
    callouts = (
      <ul data-entropy="callouts">
        {picked.map((label) => (
          <li key={label} data-entropy-label={label}>
            {label}
          </li>
        ))}
      </ul>
    );
  }

  // Layer 4: badges.
  let badges: ReactNode = null;
  if (profile.badgeSubset !== undefined) {
    const [min, max] = profile.badgeSubset;
    const count = rngInt(rng, min, max);
    const picked = rngSubset(rng, BADGE_LABEL_POOL, count);
    badges = (
      <div data-entropy="badges">
        {picked.map((label) => (
          <span key={label} data-entropy-badge={label}>
            {label}
          </span>
        ))}
      </div>
    );
  }

  // Outer chrome classes.
  const toneClass =
    profile.chromeTone !== undefined && profile.chromeTone.length > 0
      ? `chrome-${rngPick(rng, profile.chromeTone)}`
      : '';
  const densityClass =
    profile.spacingDensity !== undefined && profile.spacingDensity.length > 0
      ? `density-${rngPick(rng, profile.spacingDensity)}`
      : '';
  const outerClass = [toneClass, densityClass].filter((c) => c.length > 0).join(' ');

  return (
    <div data-entropy="shell" {...(outerClass.length > 0 ? { className: outerClass } : {})}>
      {callouts}
      {badges}
      <Fragment>{inner}</Fragment>
    </div>
  );
};
