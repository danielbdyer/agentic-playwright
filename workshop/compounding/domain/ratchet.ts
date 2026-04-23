/**
 * Ratchet — a lock-in invariant: a scenario that passed once and
 * must never regress.
 *
 * Per docs/v2-compounding-engine-plan.md §3.6, operators author
 * Ratchets via the Z9 CLI (`tesseract compounding ratchet
 * <scenario-id>`) after a customer-incident scenario first passes.
 * The engine's regression detector (Z7) cross-references active
 * ratchets against current receipts; any ratcheted scenario that
 * currently fails produces a RatchetBreakDetail.
 *
 * Append-only: retiring a ratchet is a separate append to a
 * retired-ratchets log (deferred — see plan §11 Q5).
 *
 * No Effect imports.
 */

/** The Ratchet value object. */
export interface Ratchet {
  /** Canonical id — convention: `ratchet:<scenarioId>`. */
  readonly id: string;
  /** The scenario this ratchet locks in. */
  readonly scenarioId: string;
  /** ISO-8601 timestamp when the ratchet was minted. */
  readonly firstPassedAt: string;
  /** The scenario-receipt artifact fingerprint for the run that
   *  first earned the ratchet. A regression that flips this
   *  receipt's verdict surfaces as a RatchetBreakDetail. */
  readonly firstPassedFingerprint: string;
}

/** Canonical id helper: `ratchet:<scenarioId>`. */
export function ratchetId(scenarioId: string): string {
  return `ratchet:${scenarioId}`;
}
