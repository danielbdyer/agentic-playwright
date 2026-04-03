/**
 * Knowledge Decay & Freshness Policy (W2.9)
 *
 * Artifact confidence decays if not exercised in N runs (configurable, default off).
 * Triggers re-verification of stale knowledge.
 *
 * Decay model: exponential — `original * (1 - decayRate)^runsSinceExercised`
 * clamped to minimumConfidence.
 */

// ─── Freshness Policy ───

export interface FreshnessPolicy {
  readonly enabled: boolean;
  readonly maxRunsWithoutExercise: number;
  readonly decayRate: number;
  readonly minimumConfidence: number;
}

// ─── Pure Functions ───

/** Returns a disabled freshness policy (no decay). */
export function defaultFreshnessPolicy(): FreshnessPolicy {
  return {
    enabled: false,
    maxRunsWithoutExercise: 10,
    decayRate: 0.1,
    minimumConfidence: 0.1,
  };
}

/** Returns an active freshness policy for dogfood/learning modes. */
export function activeFreshnessPolicy(): FreshnessPolicy {
  return {
    enabled: true,
    maxRunsWithoutExercise: 5,
    decayRate: 0.15,
    minimumConfidence: 0.2,
  };
}

/**
 * Compute decayed confidence using exponential decay.
 *
 * When the policy is disabled or runsSinceExercised is zero, returns the
 * original confidence unchanged. Otherwise:
 *
 *   decayed = original * (1 - decayRate)^runsSinceExercised
 *
 * The result is clamped to `[minimumConfidence, original]`.
 */
export function computeDecayedConfidence(
  original: number,
  runsSinceExercised: number,
  policy: FreshnessPolicy,
): number {
  if (!policy.enabled || runsSinceExercised <= 0) {
    return original;
  }
  const decayed = original * Math.pow(1 - policy.decayRate, runsSinceExercised);
  return Math.max(policy.minimumConfidence, decayed);
}

/**
 * An artifact is stale when it has not been exercised for at least
 * `maxRunsWithoutExercise` runs (and the policy is enabled).
 */
export function isStale(
  runsSinceExercised: number,
  policy: FreshnessPolicy,
): boolean {
  if (!policy.enabled) {
    return false;
  }
  return runsSinceExercised >= policy.maxRunsWithoutExercise;
}
