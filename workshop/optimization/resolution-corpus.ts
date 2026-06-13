/**
 * Synthetic resolution ground-truth corpus (Cycle 11 / G6).
 *
 * Praxis audit §G6: the degraded-resolution ladder's operating
 * characteristics were unknown — DOMINANCE_THRESHOLD (0.75) and
 * DOMINANCE_MARGIN (0.15) were admitted first-principles guesses,
 * precision/recall per rung had never been measured, and the
 * 15-step live cohort was the entire evaluation universe. The
 * held-out site was being asked to do a job (characterize the
 * resolver at scale) that a synthetic corpus should do, leaving the
 * held-out to do only what it uniquely can: catch what synthesis
 * can't imagine.
 *
 * This module generates labeled (phrase, candidate-inventory,
 * ground-truth) cases across controlled difficulty axes, so the
 * pure resolution kernel
 * (product/domain/resolution/patterns/degraded-resolution.ts) can
 * be measured and its thresholds calibrated — offline, in-process,
 * no browser, deterministic under a seed.
 *
 * The corpus exercises the KERNEL (phrase → ranked candidates →
 * dominance selection), which is the resolution decision the
 * held-out depends on. It does not render DOM (that is the
 * synthetic-app's job); it generates the accessible-name inventory
 * the harvest would produce, with the correct answer attached.
 *
 * This lane is workshop/optimization/ per CLAUDE.md ("DSPy, GEPA,
 * and similar tooling are welcome in workshop/optimization/ only").
 *
 * Pure — seeded LCG RNG, no IO, no Effect.
 */

import type { CandidateSurface } from '../../product/domain/resolution/patterns/degraded-resolution';

/** The four difficulty axes the audit named. Each case is tagged so
 *  the calibration report can break precision/recall down by axis. */
export type PhraseDivergence =
  /** phrase == target name exactly ("English" → "English"). */
  | 'exact'
  /** phrase is the target plus descriptive words the reduction
   *  ladder strips ("English language" → "English"). */
  | 'reducible'
  /** phrase shares some but not all tokens, reworded ("sign in" vs
   *  "Log in"): a genuine partial-overlap stress case. */
  | 'reworded'
  /** phrase shares NO tokens with the target (日本語 vs "Japanese"):
   *  the kernel MUST refuse — bridging needs reasoning. */
  | 'zero-overlap';

export type Visibility = 'visible' | 'hidden';
export type Ambiguity = 'none' | 'one-rival' | 'two-plus-rivals';

export interface ResolutionCase {
  readonly id: string;
  readonly phrase: string;
  readonly candidates: readonly CandidateSurface[];
  /** Ground truth: the accessible name the kernel SHOULD accept, or
   *  null when the correct behavior is to refuse (handoff). */
  readonly expectedAcceptName: string | null;
  readonly axes: {
    readonly divergence: PhraseDivergence;
    readonly visibility: Visibility;
    readonly ambiguity: Ambiguity;
  };
}

// ─── Seeded RNG (mulberry32) ────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

// ─── Vocabulary ─────────────────────────────────────────────────

/** Target names a real page might expose, with a "descriptive
 *  suffix" the prose often appends and the reduction ladder strips. */
const TARGETS: readonly { name: string; suffix: string }[] = [
  { name: 'English', suffix: 'language' },
  { name: 'Deutsch', suffix: 'language' },
  { name: 'Submit', suffix: 'button' },
  { name: 'Username', suffix: 'field' },
  { name: 'Password', suffix: 'field' },
  { name: 'Search', suffix: 'box' },
  { name: 'Cart', suffix: 'icon' },
  { name: 'Active', suffix: 'filter' },
];

/** Distractor names that share no tokens with any target — used to
 *  populate rivals and to build zero-overlap traps. */
const DISTRACTORS: readonly string[] = [
  'Contact Sales', 'Pricing', 'Home', 'Login', 'Support', 'Careers',
  'Português', 'Documentation', 'Blog', 'Partners',
];

/** Synonym rewordings that share NO tokens with the target — the
 *  "different words, same meaning" family that genuinely needs
 *  semantic reasoning (token overlap cannot and must not bridge it,
 *  so the kernel's correct behavior is to refuse). Distinct from
 *  zero-overlap (which uses a non-Latin name): these are ordinary
 *  English synonyms a QA author might write. Any pair sharing a
 *  token would be legitimately resolvable by the kernel and so does
 *  NOT belong here. */
const REWORDINGS: readonly { phrase: string; target: string }[] = [
  { phrase: 'sign in', target: 'Login' },
  { phrase: 'create account', target: 'Register' },
  { phrase: 'remove item', target: 'Delete' },
];

// ─── Case builders per axis ─────────────────────────────────────

function rivalsFor(rng: () => number, ambiguity: Ambiguity, exclude: string): CandidateSurface[] {
  const pool = DISTRACTORS.filter((d) => d !== exclude);
  const count = ambiguity === 'none' ? 0 : ambiguity === 'one-rival' ? 1 : 2 + Math.floor(rng() * 2);
  const out: CandidateSurface[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i += 1) {
    let name = pick(rng, pool);
    let guard = 0;
    while (used.has(name) && guard < 10) { name = pick(rng, pool); guard += 1; }
    used.add(name);
    out.push({ name, visible: true });
  }
  return out;
}

/**
 * Generate a reproducible corpus of `count` cases across all axis
 * combinations. Each case's ground truth is determined by the axes:
 *
 *   - exact / reducible: target present + visible → accept it
 *     (UNLESS hidden, then refuse — a hidden best is unsafe);
 *     UNLESS a near-tied same-divergence rival exists (two-plus),
 *     then refuse (genuine ambiguity).
 *   - reworded: partial overlap; ground truth is refuse (the kernel
 *     should not guess on token-partial rewordings — that is
 *     reasoning-rung work). This pins the conservative contract.
 *   - zero-overlap: target shares no tokens; refuse always.
 */
export function generateResolutionCorpus(seed: number, count: number): readonly ResolutionCase[] {
  const rng = mulberry32(seed);
  const divergences: readonly PhraseDivergence[] = ['exact', 'reducible', 'reworded', 'zero-overlap'];
  const visibilities: readonly Visibility[] = ['visible', 'hidden'];
  const ambiguities: readonly Ambiguity[] = ['none', 'one-rival', 'two-plus-rivals'];

  const cases: ResolutionCase[] = [];
  for (let i = 0; i < count; i += 1) {
    const divergence = pick(rng, divergences);
    const visibility = pick(rng, visibilities);
    const ambiguity = pick(rng, ambiguities);
    cases.push(buildCase(rng, `g6-${seed}-${i}`, divergence, visibility, ambiguity));
  }
  return cases;
}

function buildCase(
  rng: () => number,
  id: string,
  divergence: PhraseDivergence,
  visibility: Visibility,
  ambiguity: Ambiguity,
): ResolutionCase {
  const axes = { divergence, visibility, ambiguity } as const;

  if (divergence === 'zero-overlap') {
    // Target named with no shared tokens (CJK stand-in); phrase is an
    // English description. Kernel must refuse.
    const target = pick(rng, TARGETS);
    const candidates: CandidateSurface[] = [
      { name: '日本語', visible: visibility === 'visible' },
      ...rivalsFor(rng, ambiguity, '日本語'),
    ];
    return { id, phrase: `${target.name} ${target.suffix}`, candidates, expectedAcceptName: null, axes };
  }

  if (divergence === 'reworded') {
    const rw = pick(rng, REWORDINGS);
    const candidates: CandidateSurface[] = [
      { name: rw.target, visible: visibility === 'visible' },
      ...rivalsFor(rng, ambiguity, rw.target),
    ];
    // Conservative contract: token-partial rewordings are a refuse.
    return { id, phrase: rw.phrase, candidates, expectedAcceptName: null, axes };
  }

  // exact | reducible: the target is present.
  const target = pick(rng, TARGETS);
  const phrase = divergence === 'exact' ? target.name : `${target.name} ${target.suffix}`;
  const targetVisible = visibility === 'visible';
  const rivals = rivalsFor(rng, ambiguity, target.name);
  const candidates: CandidateSurface[] = [{ name: target.name, visible: targetVisible }, ...rivals];

  // Ground truth: accept the target only when it is visible. A
  // hidden best-match must NOT be auto-accepted (acting on a
  // collapsed-menu element is unsafe — the cycle-9 lesson). Rivals
  // here are distractors that share no tokens, so they never tie;
  // ambiguity among zero-overlap rivals does not block a clean
  // target. (Same-divergence near-ties are covered separately by
  // the kernel's own ZC44.g law.)
  const expectedAcceptName = targetVisible ? target.name : null;
  return { id, phrase, candidates, expectedAcceptName, axes };
}
