/**
 * RegressionReport — the per-cycle diff between a prior scoreboard
 * snapshot and current receipts.
 *
 * Per docs/v2-compounding-engine-plan.md §3.6, the Z7 regression
 * detector reads the most-recent-prior scoreboard snapshot's
 * pass-list, compares it to the current cycle's receipts, and
 * emits:
 *
 *   - newlyFailing   — receipts passing in the prior snapshot but
 *                      failing today.
 *   - newlyPassing   — receipts that flipped the opposite way.
 *   - ratchetBreaks  — for every active ratchet whose firstPassed
 *                      receipt now fails, one RatchetBreakDetail.
 *
 * Pure value objects; the Z7 application layer computes them.
 * No Effect imports.
 */

/** Detail of a single ratchet break — which ratchet, when it
 *  broke, and when it was first locked in. */
export interface RatchetBreakDetail {
  readonly ratchetId: string;
  readonly scenarioId: string;
  /** ISO-8601 timestamp when the break was detected. */
  readonly brokenAt: string;
  /** ISO-8601 of the originally-ratcheted passing run. */
  readonly firstPassedAt: string;
}

/** The full regression report carried by the scoreboard under
 *  `lastRegression`. Null in scoreboards emitted before a prior
 *  snapshot exists. */
export interface RegressionReport {
  /** Fingerprint of the prior snapshot used for the comparison. */
  readonly baselineFingerprint: string;
  /** Fingerprint of the current scoreboard being emitted. */
  readonly currentFingerprint: string;
  readonly newlyFailing: readonly string[];
  readonly newlyPassing: readonly string[];
  readonly ratchetBreaks: readonly RatchetBreakDetail[];
}
