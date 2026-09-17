/**
 * EntropyWrapper — applies an EntropyProfile to a rendered surface.
 *
 * Wraps children in a deterministic, seeded fuzz shell:
 *   - N nested wrapper layers, in the profile's chromeVocabulary:
 *       fuzz-shell     → `<div class="fuzz-shell fuzz-shell-{depth}">`
 *       reactive-block → `<div data-block id="b{n}-…" class="osblockwidget">
 *                          <div data-container class="OSInline|OSFillParent">`
 *                        — the real Reactive wrapper shape (reality-
 *                        study F5/F6), so a classifier that keys on
 *                        wrapper structure is caught by the axis-
 *                        invariance gate before it meets a customer.
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
  type ChromeVocabulary,
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

/** Block names real Reactive compiles screens into. Drawn per layer
 *  so `data-block` values vary like a real page's 10–18 distinct
 *  blocks do. */
const REACTIVE_BLOCK_NAMES = [
  'OutSystemsUI.Section',
  'OutSystemsUI.Columns2',
  'OutSystemsUI.CardSectionGroup',
  'OutSystemsUI.Search',
  'OutSystemsUI.Gallery',
  'OutSystemsUI.ButtonGroup',
  'OutSystemsUI.Dropdown',
  'OutSystemsUI.Pagination',
] as const;

/** One wrapper layer in the chosen vocabulary. The RNG draw is the
 *  same single step per layer for both vocabularies so the callout /
 *  badge sequence downstream is identical whichever vocabulary a
 *  fixture selects — only the wrapper shape differs. */
function wrapLayer(
  vocabulary: ChromeVocabulary,
  inner: ReactNode,
  layer: number,
  draw: number,
): ReactNode {
  if (vocabulary === 'fuzz-shell') {
    return <div className={`fuzz-shell fuzz-shell-${layer}`}>{inner}</div>;
  }
  const block = REACTIVE_BLOCK_NAMES[Math.floor(draw * REACTIVE_BLOCK_NAMES.length)]!;
  const containerClass = layer % 2 === 0 ? 'OSFillParent' : 'OSInline';
  // Structural ids in the compiled block/list-path shape
  // (`b3-Column`, `l1-0_0-$b2`) — reality-study F5: ids are never
  // semantic.
  const blockId = layer % 2 === 0 ? `b${layer}-Column` : `l${layer}-0_0-$b${layer}`;
  return (
    <div data-block={block} id={blockId} className="osblockwidget">
      <div data-container="" className={containerClass}>
        {inner}
      </div>
    </div>
  );
}

/** Wrap children in N nested layers, inside-out. */
function applyDepth(
  children: ReactNode,
  depth: number,
  rng: () => number,
  vocabulary: ChromeVocabulary,
): ReactNode {
  let out = children;
  for (let i = 0; i < depth; i++) {
    // Consume one RNG step per layer so layer-count variation and
    // callout order vary independently.
    out = wrapLayer(vocabulary, out, i + 1, rng());
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
    inner = applyDepth(inner, depth, rng, profile.chromeVocabulary ?? 'fuzz-shell');
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
