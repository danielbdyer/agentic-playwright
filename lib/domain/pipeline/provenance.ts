/**
 * Shared provenance shape for Tier 1/2/3 canonical artifacts.
 *
 * Previously `AtomProvenance`, `CompositionProvenance`, and
 * `ProjectionProvenance` were three byte-identical interfaces
 * defined in `atom.ts`, `composition.ts`, and `projection.ts`.
 * This module is their canonical home; the three original names
 * survive as type aliases for source-compatibility with existing
 * consumers, but they all refer to the same shape.
 *
 * Every mint helper in `lib/application/canon/minting.ts` and
 * every decomposer in `lib/application/canon/` threads a
 * `CanonProvenance` through to the output envelopes via
 * `mintAtom` / `mintComposition`. Adding a new provenance field
 * here automatically propagates to all three tiers.
 *
 * Pure domain — no Effect, no IO, no mutation.
 */

/** Provenance metadata carried by every canonical artifact
 *  (atoms, compositions, projections). Tracks who produced the
 *  artifact, when, at which pipeline version, and from which
 *  upstream inputs. The `inputs` list is consumed by the demotion
 *  machinery to determine which artifacts become candidates when
 *  an upstream source changes. */
export interface CanonProvenance {
  /** Stable identifier of the engine or sub-engine that produced
   *  this artifact (e.g. `discovery.routes.playwright-walker`,
   *  `canon-decomposer:screen-elements:v1`). */
  readonly producedBy: string;
  /** ISO timestamp the artifact was produced at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA, build tag, etc.). */
  readonly pipelineVersion?: string | undefined;
  /** Optional list of upstream input references. When an upstream
   *  input changes, artifacts whose `inputs` list contains the
   *  changed reference become demotion candidates. */
  readonly inputs?: readonly string[] | undefined;
}
