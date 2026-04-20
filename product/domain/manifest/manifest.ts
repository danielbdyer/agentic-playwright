/**
 * Manifest — the ordered list of verb entries the agent reads once
 * per session.
 *
 * The manifest's shape is a compile-time contract and its
 * serialization is a git-committed artifact at
 * `product/manifest/manifest.json`. The build regenerates the
 * artifact from declared verbs; a drift check fails the build when
 * the on-disk manifest disagrees with the code declarations in a
 * non-additive way.
 *
 * Pure domain — no Effect, no IO.
 */

import type { VerbEntry } from './verb-entry';

/** The canonical manifest envelope. The `kind` + `version` header
 *  is the long-lived schema gate; changing the schema requires a
 *  version bump and a corresponding read-side accommodation. */
export interface Manifest {
  readonly kind: 'product-manifest';
  readonly version: 1;
  /** ISO-8601 timestamp of the manifest build. Set at emission time;
   *  consumers treat it as provenance, not as a cache key (verbs are
   *  keyed by `name`). */
  readonly generatedAt: string;
  /** Verb entries, sorted by `name` (byte-order) for deterministic
   *  diffs. */
  readonly verbs: readonly VerbEntry[];
}

/** Byte-order comparator on verb name. Use this (not an ad-hoc sort)
 *  so re-emissions are deterministic across platforms. */
export function compareVerbEntriesByName(a: VerbEntry, b: VerbEntry): number {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

/** Build a Manifest from a (possibly unordered) set of verb entries.
 *  Sorts by name; throws if any two entries share a name. */
export function buildManifest(
  verbs: readonly VerbEntry[],
  generatedAt: string,
): Manifest {
  const sorted = [...verbs].sort(compareVerbEntriesByName);
  const seen = new Set<string>();
  for (const v of sorted) {
    if (seen.has(v.name)) {
      throw new Error(`Duplicate verb declaration for "${v.name}" — each verb must be declared exactly once.`);
    }
    seen.add(v.name);
  }
  return {
    kind: 'product-manifest',
    version: 1,
    generatedAt,
    verbs: sorted,
  };
}

/** Look up a verb by name. Returns null when not present. Consumers
 *  should treat a null return as "verb does not exist in the
 *  manifest" — it never means "verb is unavailable at runtime." */
export function findVerb(manifest: Manifest, name: string): VerbEntry | null {
  return manifest.verbs.find((v) => v.name === name) ?? null;
}
