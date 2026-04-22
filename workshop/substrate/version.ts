/**
 * Substrate version — the single source of truth for the
 * substrate's behavioral contract.
 *
 * Per docs/v2-probe-ir-spike.md §8.6, the substrate's behavior is
 * a versioned contract. When the FacetRendererRegistry, the
 * TestTopologyRegistry, or the SurfaceRenderer's axis realization
 * changes in a way that could alter a classifier's observations,
 * the version bumps. Probe receipts stamp the version so drift is
 * traceable.
 *
 * ## Semver discipline
 *
 * MAJOR — a classifier could legitimately disagree across the
 *   bump (e.g., a visibility axis no longer excludes from the
 *   accessibility tree, changing observe's outcome semantics).
 *   These bumps are non-additive and require a deliberate
 *   receipt-baseline reset.
 * MINOR — new axes added, existing axes' semantics preserved.
 *   Classifiers that don't consult the new axes remain stable.
 *   Receipts before and after agree on the old axes.
 * PATCH — rendering / bundling / implementation detail changes
 *   that have no semantic effect on classifiers. Receipts are
 *   byte-equivalent pre- and post-.
 *
 * ## Parity gate
 *
 * `scripts/verify-rung-3-parity.ts` + `scripts/verify-axis-
 * invariance.ts` are the live parity gates. A substrate-version
 * bump that changes semantic behavior will cause at least one
 * probe's rung-3 observation to disagree with rung-1 / rung-2
 * — that disagreement is the drift signal.
 *
 * ## Bumping
 *
 * Bumping the version is a deliberate gesture. The bump commit
 * should accompany the behavior-changing code + a verdict memo
 * naming the semantic delta and the migration strategy for
 * existing receipts.
 */

/** The current substrate semantic version. */
export const SUBSTRATE_VERSION = '1.0.0';

/** Parse a semver string into parts. Returns null when the input
 *  is malformed. */
export function parseSubstrateVersion(
  version: string,
): { readonly major: number; readonly minor: number; readonly patch: number } | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) return null;
  return {
    major: Number.parseInt(match[1]!, 10),
    minor: Number.parseInt(match[2]!, 10),
    patch: Number.parseInt(match[3]!, 10),
  };
}

/** Classify the scope of a version delta (same / patch / minor / major). */
export type VersionDelta = 'same' | 'patch' | 'minor' | 'major' | 'regression';

export function classifyVersionDelta(from: string, to: string): VersionDelta {
  const a = parseSubstrateVersion(from);
  const b = parseSubstrateVersion(to);
  if (a === null || b === null) return 'regression';
  if (b.major < a.major) return 'regression';
  if (b.major > a.major) return 'major';
  if (b.minor < a.minor) return 'regression';
  if (b.minor > a.minor) return 'minor';
  if (b.patch < a.patch) return 'regression';
  if (b.patch > a.patch) return 'patch';
  return 'same';
}
