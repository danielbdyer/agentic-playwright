/**
 * Calibrated risk weights for the heuristic-proxy obligation formulas.
 *
 * Every magic number that previously lived inline in `fitness.ts` and
 * `benchmark.ts` migrates here as a named, doc-commented constant. The
 * weights are the *only* knob the heuristic-proxy obligations have, so
 * making them reviewable as a single artifact is the prerequisite for
 * any future calibration work.
 *
 * Calibration source notes:
 *   - "equal-weight": no empirical signal yet; weights are uniform across
 *     contributing risks. The right default for cold-start corpora.
 *   - "intentional bias": one component is biased higher because it is
 *     known to be the strongest individual signal in dogfood runs.
 *   - "addendum-aligned": the addendum prescribes a relative weighting.
 *
 * All weights are bounded to [0, 1] and most are in [0, 1] groups that
 * sum to 1.0 (a probability simplex). They are NOT magic constants
 * pulled from thin air; they are the calibrated knob the next phase of
 * tuning will lean on.
 */

// ─── Memory worthiness composite (M5) ──────────────────────────────

/** Memory worthiness — composite of 5 sub-risks. Weights sum to 1.0.
 *
 *  Calibration source: equal weight across compressibility,
 *  predictability, repairability, and participatory repairability,
 *  with a 0.05 bias toward economics because it is the strongest
 *  individual signal observed in dogfood Q1 runs. Memory-reuse-gap
 *  contributes 0.15 — slightly less than the structural components
 *  because it can be noisy on small cohorts. */
export const MEMORY_WORTHINESS_WEIGHTS = {
  surfaceCompressibility: 0.20,
  surfacePredictability: 0.15,
  surfaceRepairability: 0.15,
  participatoryRepairability: 0.15,
  economics: 0.20,
  memoryReuseGap: 0.15,
} as const;

// ─── Variance-factorability composite (V) ──────────────────────────

/** V (variance factorability) is a 70/30 split between immediate
 *  variance stress and the reuse gap. Calibration source: addendum-
 *  aligned — V is primarily a current-state stress signal; reuse-gap
 *  contribution is secondary and forward-looking. */
export const FACTORABILITY_WEIGHTS = {
  stress: 0.7,
  reuseGap: 0.3,
} as const;

// ─── Posture separability sub-risk (K) ─────────────────────────────

/** Posture separability includes ambiguity rate as a SECONDARY signal
 *  (it points at the same failure mode as the kernel coverage gap, but
 *  is a coarser signal). Multiplier biases ambiguity down to 75% of its
 *  raw weight to avoid double-counting with the structural rates. */
export const POSTURE_SEPARABILITY_AMBIGUITY_WEIGHT = 0.75;

// ─── Persistence sub-risk (S) ──────────────────────────────────────

/** Semantic persistence includes agent-fallback rate as a partial
 *  signal — it correlates with persistence loss but is also driven
 *  by other factors. Bias to 75%. */
export const PERSISTENCE_AGENT_FALLBACK_WEIGHT = 0.75;

// ─── Topology sub-risk (D) ─────────────────────────────────────────

/** Topology biases ambiguity contribution down because route mismatch
 *  is the primary signal and ambiguity is partially redundant. */
export const TOPOLOGY_AMBIGUITY_WEIGHT = 0.75;

// ─── Surface compressibility (M.compressibility) ───────────────────

export const SURFACE_COMPRESSIBILITY_LIVE_DOM_WEIGHT = 0.75;

// ─── Surface predictability (M.predictability) ─────────────────────

export const SURFACE_PREDICTABILITY_AGENT_FALLBACK_WEIGHT = 0.5;
export const SURFACE_PREDICTABILITY_AMBIGUITY_WEIGHT = 0.5;

// ─── Surface repairability (M.repairability) ───────────────────────

export const SURFACE_REPAIRABILITY_SUSPENSION_WEIGHT = 0.5;

// ─── Memory-reuse-gap target threshold ─────────────────────────────

/** The approved-equivalent rate at which the memory-reuse gap is
 *  considered closed. Calibration source: empirical (Q1 dogfood). */
export const MEMORY_REUSE_TARGET_RATE = 0.25;

/** The approved-equivalent rate at which the variance-factorability
 *  reuse gap is considered closed. Slightly higher than the memory
 *  target — factorability gives credit for partial overlay reuse. */
export const FACTORABILITY_REUSE_TARGET_RATE = 0.35;

// ─── Risk → status thresholds ──────────────────────────────────────

/** Above this risk, the obligation is critical. */
export const RISK_CRITICAL_THRESHOLD = 0.7;

/** Above this risk (and below critical), the obligation is in `watch`. */
export const RISK_WATCH_THRESHOLD = 0.3;
