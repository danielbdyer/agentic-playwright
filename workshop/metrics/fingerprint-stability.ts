/**
 * Fingerprint stability — pure comparison module for the K0 obligation.
 *
 * The temporal-epistemic doctrine claims compiler determinism: given
 * identical canonical inputs, the compiler produces byte-identical
 * derived artifacts. K0 makes this falsifiable.
 *
 * This module is pure: it compares two `ArtifactFingerprintMap` records
 * (path → SHA-256 hash) and produces a structural delta. The application
 * layer (`fingerprint-stability-probe.ts`) is responsible for actually
 * recompiling and producing the maps.
 *
 * No Effect, no IO. The delta is a deterministic projection over two
 * record inputs.
 */

import type { LogicalProofObligation } from '../../product/domain/fitness/types';

/** Stable string fingerprint for an artifact (typically a SHA-256 hash). */
export type ArtifactFingerprint = string;

/** Map from artifact path → fingerprint at the moment of compilation. */
export type ArtifactFingerprintMap = Readonly<Record<string, ArtifactFingerprint>>;

/** Difference between two fingerprint maps. Pure structural projection. */
export interface FingerprintDelta {
  readonly identical: boolean;
  readonly addedPaths: readonly string[];
  readonly removedPaths: readonly string[];
  readonly changedPaths: readonly string[];
  readonly totalPaths: number;
  readonly stablePaths: number;
}

/**
 * Compare two fingerprint maps. Pure. Symmetric: `delta(a, b)` and
 * `delta(b, a)` swap `addedPaths` ↔ `removedPaths` but report the same
 * `identical` and `changedPaths` set.
 */
export function compareArtifactFingerprints(
  before: ArtifactFingerprintMap,
  after: ArtifactFingerprintMap,
): FingerprintDelta {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  const beforeSet = new Set(beforeKeys);
  const afterSet = new Set(afterKeys);

  const addedPaths = afterKeys.filter((key) => !beforeSet.has(key)).sort();
  const removedPaths = beforeKeys.filter((key) => !afterSet.has(key)).sort();
  const sharedPaths = afterKeys.filter((key) => beforeSet.has(key));
  const changedPaths = sharedPaths.filter((key) => before[key] !== after[key]).sort();
  const stablePaths = sharedPaths.length - changedPaths.length;
  const totalPaths = new Set([...beforeKeys, ...afterKeys]).size;

  return {
    identical: addedPaths.length === 0 && removedPaths.length === 0 && changedPaths.length === 0,
    addedPaths,
    removedPaths,
    changedPaths,
    totalPaths,
    stablePaths,
  };
}

/**
 * Build a `LogicalProofObligation` from a fingerprint delta. Pure.
 *
 * The obligation graduates from `direct` (zero churn) to `proxy`
 * (some divergence) to `critical` (substantial divergence). The
 * `measurementClass` is `direct` because this measures the doctrine
 * claim directly — there is no heuristic interpretation.
 */
export function fingerprintStabilityObligation(delta: FingerprintDelta): LogicalProofObligation {
  const totalPaths = Math.max(delta.totalPaths, 1);
  const stableShare = delta.stablePaths / totalPaths;
  const churnShare = (delta.addedPaths.length + delta.removedPaths.length + delta.changedPaths.length) / totalPaths;
  const score = Number(stableShare.toFixed(4));
  const status: LogicalProofObligation['status'] = delta.identical
    ? 'healthy'
    : churnShare >= 0.5
      ? 'critical'
      : 'watch';
  return {
    obligation: 'fingerprint-stability',
    propertyRefs: ['K'],
    score,
    status,
    evidence: `delta: total=${delta.totalPaths}, stable=${delta.stablePaths}, added=${delta.addedPaths.length}, removed=${delta.removedPaths.length}, changed=${delta.changedPaths.length}, identical=${delta.identical}`,
    measurementClass: 'direct',
  };
}
