/**
 * Rung-parity check — the pure function that compares two
 * ProbeReceipts at adjacent substrate rungs and either returns
 * `null` (parity holds) or a `ParityFailureRecord` (refutation).
 *
 * Per the substrate-ladder plan (docs/v2-substrate-ladder-plan.md
 * §§8.2, 9.2), the substrate-invariance theorem asserts
 * classification is identical across substrates presenting the
 * same world-shape. This module is the mechanical check.
 *
 * ## Contract
 *
 * - **Inputs** are two receipts from the same probe at the same
 *   substrate version. Cross-probe or cross-substrate-version
 *   calls throw — a receipt comparison across cohort-key shifts
 *   is a programmer error, not a parity failure.
 * - **Output** is `ParityFailureRecord | null`. `null` means the
 *   invariant-band sub-fingerprints match (parity holds). A
 *   record means they diverge; its `divergence.axis` names the
 *   first mismatched axis under a fixed evaluation order.
 *
 * ## Evaluation order
 *
 * When both `classification` and `error-family` differ, the
 * classification divergence is reported — it is the semantically
 * "larger" disagreement and subsumes the error-family one.
 *
 * ## Variant-band tolerance
 *
 * Per plan §5.3, the default tolerance bound on `elapsedMs` is
 * `upper / lower ≤ 100`. The tolerance check is separate from
 * parity check (a substrate can be slow without violating
 * invariance); `checkToleranceBound` returns a boolean the
 * caller gates on.
 *
 * Pure domain. No Effect. No IO.
 */

import type { ProbeReceipt } from './probe-receipt';
import {
  parityFailureRecord,
  type ParityFailureRecord,
  type ParityDivergenceAxis,
} from './parity-failure';

/** Check parity between two receipts at adjacent rungs. Returns
 *  `null` when invariantContent matches (parity holds), otherwise
 *  a ParityFailureRecord naming the diverged axis. Throws on
 *  cohort-key mismatches (different probeId or different
 *  substrateVersion). */
export function checkRungParity(input: {
  readonly lower: ProbeReceipt;
  readonly higher: ProbeReceipt;
  readonly now: () => Date;
}): ParityFailureRecord | null {
  const { lower, higher, now } = input;

  // Cohort-key alignment is a precondition. A caller comparing
  // different probes or different substrate epochs is confused;
  // we don't want a ParityFailureRecord to paper over that.
  if (lower.payload.probeId !== higher.payload.probeId) {
    throw new Error(
      `checkRungParity: probeId mismatch (${lower.payload.probeId} vs ${higher.payload.probeId})`,
    );
  }
  if (
    lower.payload.provenance.substrateVersion !==
    higher.payload.provenance.substrateVersion
  ) {
    throw new Error(
      `checkRungParity: substrateVersion mismatch ` +
        `(${lower.payload.provenance.substrateVersion} vs ` +
        `${higher.payload.provenance.substrateVersion})`,
    );
  }

  // Fast path: invariantContent matches → parity holds.
  if (
    lower.payload.provenance.invariantContent ===
    higher.payload.provenance.invariantContent
  ) {
    return null;
  }

  // Slow path: determine which axis diverged. classification
  // before error-family per the evaluation order above.
  const lowerObs = lower.payload.outcome.observed;
  const higherObs = higher.payload.outcome.observed;
  let axis: ParityDivergenceAxis;
  let lowerValue: string | null;
  let higherValue: string | null;
  if (lowerObs.classification !== higherObs.classification) {
    axis = 'classification';
    lowerValue = lowerObs.classification;
    higherValue = higherObs.classification;
  } else {
    axis = 'error-family';
    lowerValue = lowerObs.errorFamily;
    higherValue = higherObs.errorFamily;
  }

  return parityFailureRecord({
    probeId: lower.payload.probeId,
    fixtureRef: {
      verb: lower.payload.verb,
      fixtureName: lower.payload.fixtureName,
    },
    substrateVersion: lower.payload.provenance.substrateVersion,
    rungPair: [lower.payload.provenance.adapter, higher.payload.provenance.adapter],
    divergence: { axis, lowerRungValue: lowerValue, higherRungValue: higherValue },
    detectedAt: now().toISOString(),
    observedFingerprints: [
      lower.payload.provenance.invariantContent,
      higher.payload.provenance.invariantContent,
    ],
  });
}

/** Tolerance-bound check on variant-band `elapsedMs`. Per plan
 *  §5.3, the default bound is `upper / lower ≤ 100`.
 *
 *  Edge cases:
 *   - Both values 0 → the check is degenerate but passes (no
 *     variance to bound). Typical for dry↔dry or two very-fast
 *     adapters.
 *   - One value 0, the other positive → the ratio is undefined
 *     (or infinite). The check returns `true` (pass) because
 *     the dry rung's 0ms is not a legitimate denominator; the
 *     law is meaningful only when both substrates do real work.
 *   - Both positive → standard ratio check.
 *
 *  Returns `true` when within bound (pass), `false` when
 *  exceeding it (violation). */
export function checkToleranceBound(input: {
  readonly lowerElapsedMs: number;
  readonly higherElapsedMs: number;
  readonly maxRatio?: number;
}): boolean {
  const max = input.maxRatio ?? 100;
  const lower = input.lowerElapsedMs;
  const higher = input.higherElapsedMs;
  if (lower <= 0 || higher <= 0) return true;
  const upper = Math.max(lower, higher);
  const floor = Math.min(lower, higher);
  return upper / floor <= max;
}
