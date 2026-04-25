/**
 * ManifestCone — the typed witness that the manifest is the
 * apex of a categorical cone, with multiple parallel "base"
 * projections morphing from it.
 *
 * ## The pattern this names
 *
 * Per Agent A's #11 + v2-direction.md §1 ("the manifest is the
 * contract"), the manifest is the terminal object: every
 * downstream consumer derives from a verb-entry. Specifically,
 * adding a new verb is supposed to be a single obligation
 * (declare it in the manifest), but in practice the obligation
 * fans out into ~5 parallel updates the codebase performs
 * independently:
 *
 *   1. Add a `*.probe.yaml` fixture under `product/instruments/`
 *      or wherever the verb declares.
 *   2. Add a per-verb classifier under
 *      `workshop/probe-derivation/classifiers/`.
 *   3. Add a per-verb runtime handler under `product/runtime/`
 *      or `product/instruments/`.
 *   4. (Optional) Add a rung-3 substrate classifier.
 *   5. (Optional) Add an MCP tool projection.
 *
 * Each consumer "morphs" from the manifest's verb declarations,
 * but the cone is implicit — there's no single typed witness
 * that ties them together. A reader can't ask "for verb X, what
 * are all the morphisms expected to exist?" without grepping
 * five subtrees.
 *
 * **`ManifestCone` makes the cone explicit**. It declares the
 * known base projections + provides a uniform shape
 * (`{ verb: VerbEntry; projection: T }[]`) that future code
 * can use to build new cone projections without rewriting the
 * "iterate manifest verbs and ensure each has a matching X"
 * pattern.
 *
 * ## Surface
 *
 *   readonly apex: Manifest;
 *   readonly baseNames: readonly string[];
 *   readonly projection<T>(name, lookup): readonly { verb, projection: T | null }[];
 *
 * Per-verb pull-back: given the manifest + a name + a lookup
 * function `(VerbEntry) => T | null`, returns one entry per
 * verb showing whether that base projection exists. Callers can
 * fold the result to find missing-projection gaps.
 *
 * Pure domain — no Effect, no IO.
 */

import type { Manifest } from './manifest';
import type { VerbEntry } from './verb-entry';

/** The named "base" projections expected to morph from the
 *  manifest apex. Adding a new base projection requires
 *  registering it here so cross-cutting "every verb has X"
 *  invariants can be expressed uniformly. */
export type ManifestBaseProjection =
  | 'probe-fixture'
  | 'verb-classifier'
  | 'rung3-classifier'
  | 'runtime-handler'
  | 'mcp-tool';

/** A single (verb, projection) pull-back entry: whether the
 *  named projection exists for this verb. */
export interface ConeProjectionEntry<T> {
  readonly verb: VerbEntry;
  readonly projection: T | null;
}

/** Construct a ManifestCone witness over a Manifest apex. */
export interface ManifestCone {
  readonly apex: Manifest;
  /** The known base projection names. */
  readonly baseNames: readonly ManifestBaseProjection[];
  /** Per-verb pull-back: returns one entry per manifest verb,
   *  with `projection: T` when the lookup succeeds and
   *  `projection: null` when it doesn't. The result mirrors
   *  the manifest's `verbs[]` order. */
  readonly projection: <T>(
    name: ManifestBaseProjection,
    lookup: (verb: VerbEntry) => T | null,
  ) => readonly ConeProjectionEntry<T>[];
  /** Convenience: returns the verbs missing the named
   *  projection (lookup returned null). Used by architecture
   *  laws to assert "every verb has a probe fixture." */
  readonly missingProjections: <T>(
    name: ManifestBaseProjection,
    lookup: (verb: VerbEntry) => T | null,
  ) => readonly VerbEntry[];
}

/** Construct the canonical ManifestCone over a manifest. */
export function manifestCone(apex: Manifest): ManifestCone {
  const baseNames: readonly ManifestBaseProjection[] = [
    'probe-fixture',
    'verb-classifier',
    'rung3-classifier',
    'runtime-handler',
    'mcp-tool',
  ];

  const projection = <T>(
    _name: ManifestBaseProjection,
    lookup: (verb: VerbEntry) => T | null,
  ): readonly ConeProjectionEntry<T>[] =>
    apex.verbs.map((verb) => ({
      verb,
      projection: lookup(verb),
    }));

  const missingProjections = <T>(
    name: ManifestBaseProjection,
    lookup: (verb: VerbEntry) => T | null,
  ): readonly VerbEntry[] =>
    projection<T>(name, lookup)
      .filter((e) => e.projection === null)
      .map((e) => e.verb);

  return Object.freeze({
    apex,
    baseNames,
    projection,
    missingProjections,
  });
}
