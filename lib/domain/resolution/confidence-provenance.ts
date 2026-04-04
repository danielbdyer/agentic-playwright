/**
 * Confidence-Provenance Galois connection.
 *
 * The resolution rung (provenance) and the confidence level (trust)
 * are connected by a Galois connection — a pair of monotone maps:
 *
 *   α : Rung → Confidence        (minimum confidence a rung guarantees)
 *   γ : Confidence → Set<Rung>   (rungs that could produce this confidence)
 *
 * satisfying: α(r) ≥ c  ⟺  r ∈ γ(c)
 *
 * This replaces the ad-hoc `confidenceFor` in candidate-lattice.ts and
 * the implicit rung→confidence mappings scattered across the codebase
 * with a single, bidirectional, testable mapping.
 *
 * @see docs/design-calculus.md § Collapse 2: Rung Provenance and Confidence Scale
 */

import type { Confidence } from '../types/workflow';
import type { ResolutionPrecedenceRung } from './precedence';

// ─── Confidence total order ───

const CONFIDENCE_ORDINAL: Readonly<Record<Confidence, number>> = {
  'unbound': 0,
  'intent-only': 1,
  'agent-proposed': 2,
  'agent-verified': 3,
  'compiler-derived': 4,
  'human': 5,
};

export function confidenceOrdinal(c: Confidence): number {
  return CONFIDENCE_ORDINAL[c];
}

export function confidenceGte(a: Confidence, b: Confidence): boolean {
  return confidenceOrdinal(a) >= confidenceOrdinal(b);
}

export function maxConfidence(a: Confidence, b: Confidence): Confidence {
  return confidenceOrdinal(a) >= confidenceOrdinal(b) ? a : b;
}

export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return confidenceOrdinal(a) <= confidenceOrdinal(b) ? a : b;
}

// ─── α direction: Rung → minimum Confidence ───

const RUNG_TO_MIN_CONFIDENCE: Readonly<Record<ResolutionPrecedenceRung, Confidence>> = {
  'explicit': 'human',
  'control': 'compiler-derived',
  'approved-screen-knowledge': 'compiler-derived',
  'shared-patterns': 'compiler-derived',
  'prior-evidence': 'agent-verified',
  'semantic-dictionary': 'agent-verified',
  'approved-equivalent-overlay': 'agent-verified',
  'structured-translation': 'agent-verified',
  'live-dom': 'agent-proposed',
  'agent-interpreted': 'agent-proposed',
  'needs-human': 'unbound',
};

/**
 * α : Rung → Confidence
 *
 * The minimum confidence level guaranteed by a resolution rung.
 * This is the left adjoint of the Galois connection.
 */
export function rungToMinConfidence(rung: ResolutionPrecedenceRung): Confidence {
  return RUNG_TO_MIN_CONFIDENCE[rung];
}

// ─── γ direction: Confidence → Set<Rung> ───

/**
 * γ : Confidence → Set<Rung>
 *
 * The set of rungs that could produce at least the given confidence level.
 * This is the right adjoint of the Galois connection.
 */
export function confidenceToRungs(minLevel: Confidence): ReadonlySet<ResolutionPrecedenceRung> {
  const threshold = confidenceOrdinal(minLevel);
  const result = new Set<ResolutionPrecedenceRung>();
  for (const [rung, confidence] of Object.entries(RUNG_TO_MIN_CONFIDENCE)) {
    if (confidenceOrdinal(confidence) >= threshold) {
      result.add(rung as ResolutionPrecedenceRung);
    }
  }
  return result;
}

// ─── Validation: consistency check ───

/**
 * Check that a claimed confidence is consistent with the rung that produced it.
 * A binding cannot claim a confidence higher than its rung's minimum guarantees
 * allow — but it CAN claim a lower confidence (e.g., a compiler-derived rung
 * might produce agent-verified confidence if the derivation was uncertain).
 *
 * Returns true if the claimed confidence is ≤ the rung's minimum.
 */
export function isConsistentProvenance(
  rung: ResolutionPrecedenceRung,
  claimed: Confidence,
): boolean {
  return confidenceOrdinal(claimed) <= confidenceOrdinal(rungToMinConfidence(rung));
}
