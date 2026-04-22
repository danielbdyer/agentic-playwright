/**
 * EntropyProfile — seeded, deterministic environmental variance.
 *
 * Where SurfaceSpec declares what renders, EntropyProfile declares
 * what additional non-semantic variance the substrate wraps around
 * the rendered surfaces. Ported from the policy-journey.tsx fuzz
 * profile (the v1 source of this idea) and made universal: every
 * probe can carry its own EntropyProfile; every surface gets fuzzed
 * identically.
 *
 * ## Axes (all orthogonal)
 *
 *   wrapperDepth    — N nested `<div class="fuzz-shell-{n}">` layers
 *   chromeTone      — applies a CSS class from a closed set to the
 *                     wrapper chain; tests that classifiers don't
 *                     rely on specific visual chrome.
 *   spacingDensity  — CSS class from a closed set controlling gaps
 *                     (tidy/layered/stacked from the v1 profile).
 *   siblingJitter   — inserts [min, max] noise siblings before and
 *                     after each surface; tests that role+name
 *                     queries tolerate unexpected neighbors.
 *   surfaceOrder    — permute the WorldShape's surfaces at render.
 *   calloutShuffle  — pull N callout labels from a closed set and
 *                     render in a shuffled order above the surfaces.
 *   badgeSubset     — pull a random subset of badge labels from a
 *                     closed set and render in shuffled order.
 *
 * ## Determinism
 *
 * The `seed` field drives a linear-congruential RNG; the same
 * (profile, seed) produces byte-identical DOM. This is required by
 * memo §7 graduation metric 3 (reproducibility). Two probes with the
 * same SurfaceSpecs + same seed render identical DOM; changing only
 * the seed varies the chrome without touching the semantic surfaces.
 *
 * ## Why entropy is first-class
 *
 * Rung-3 classifiers query by role+name. If the real DOM always
 * looks the same shape-around-the-surface, a classifier can
 * accidentally depend on that shape. EntropyProfile forces classifier
 * robustness by perturbing the chrome on every probe — if the
 * classifier's outcome moves under chrome perturbation, the
 * classifier was reading something it shouldn't have.
 *
 * ## Scope
 *
 * EntropyProfile perturbs the chrome around surfaces, never the
 * SurfaceSpec axes themselves. The semantic properties a classifier
 * reads (role, name, visibility, enabled) stay fixed; only the
 * non-semantic wrapper structure varies. This preserves the
 * axis-invariance claim: a probe's declared outcome is about axes,
 * not chrome.
 *
 * Pure domain; seeded RNG is the only stateful primitive.
 */

/** Closed set of chrome-tone classes the substrate renderer honors.
 *  Adding a tone is additive — renderer CSS expands. */
export type ChromeTone = 'reef' | 'ember' | 'atlas' | 'quartz' | 'slate';

/** Closed set of spacing-density classes. */
export type SpacingDensity = 'tidy' | 'layered' | 'stacked' | 'compact';

/** Closed set of callout labels the callout-shuffle axis draws from. */
export const CALLOUT_LABEL_POOL = [
  'contract-persistent',
  'fsm-backed',
  'drift-ready',
  'aria-first',
  'reviewable',
  'verb-scoped',
  'probe-shaped',
  'substrate-bound',
] as const;
export type CalloutLabel = (typeof CALLOUT_LABEL_POOL)[number];

/** Closed set of badge labels. */
export const BADGE_LABEL_POOL = [
  'stable',
  'canonical',
  'certified',
  'evidence-backed',
  'rung-1',
  'rung-2',
  'rung-3',
  'fingerprinted',
] as const;
export type BadgeLabel = (typeof BADGE_LABEL_POOL)[number];

/** The full fuzz set. Each axis is optional; when absent, the axis
 *  contributes no variance. */
export interface EntropyProfile {
  /** RNG seed. The same (profile, seed) produces identical DOM.
   *  Optional — when absent, all axes produce their zero variance. */
  readonly seed?: string;
  /** Wrap each surface in this many nested `<div class="fuzz-shell">`
   *  layers. Random within [min, max]. */
  readonly wrapperDepth?: readonly [min: number, max: number];
  /** Chrome tone CSS class applied to the outer wrapper. */
  readonly chromeTone?: readonly ChromeTone[];
  /** Spacing density class. */
  readonly spacingDensity?: readonly SpacingDensity[];
  /** Insert a random number of noise `<span>` siblings before/after
   *  each surface. Range [min, max]. */
  readonly siblingJitter?: readonly [min: number, max: number];
  /** Permute the WorldShape's surfaces at render. */
  readonly surfaceOrder?: 'as-declared' | 'shuffled';
  /** Draw callout labels from CALLOUT_LABEL_POOL and render N of
   *  them in shuffled order. */
  readonly calloutShuffle?: { readonly count: number };
  /** Draw a subset of BADGE_LABEL_POOL (size in [min, max]) and
   *  render in shuffled order. */
  readonly badgeSubset?: readonly [minCount: number, maxCount: number];
}

export const EMPTY_ENTROPY_PROFILE: EntropyProfile = {};

/** Deterministic seeded RNG. Linear-congruential — small state,
 *  no crypto, reproducible across Node + browser. Domain: [0, 1). */
export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    // Numerical Recipes LCG constants.
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    // Fold to [0, 1).
    return ((state >>> 0) % 0xffffffff) / 0xffffffff;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return h | 0;
}

/** Draw an integer in [min, max] from the RNG. */
export function rngInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/** Pick one element from a readonly array. */
export function rngPick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('rngPick: empty array');
  return items[Math.floor(rng() * items.length)]!;
}

/** Shuffle a readonly array into a new array (Fisher–Yates). */
export function rngShuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/** Pick k items from a readonly array without replacement. */
export function rngSubset<T>(
  rng: () => number,
  items: readonly T[],
  k: number,
): T[] {
  return rngShuffle(rng, items).slice(0, Math.max(0, Math.min(k, items.length)));
}
