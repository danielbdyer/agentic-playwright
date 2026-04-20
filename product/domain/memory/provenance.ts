/**
 * Facet provenance — the atomic-at-mint header every facet record
 * carries.
 *
 * Per `docs/v2-direction.md §6 Step 3` and `docs/v2-substrate.md §6`
 * primitive 5 (memory), every canonical artifact carries
 * provenance at the moment it was first written. The v1 pattern of
 * reconstructing provenance backward from later events is retired
 * at this step: provenance is either present at mint or the facet
 * is untrusted.
 *
 * Pure domain — no Effect, no IO.
 */

/** Which kind of instrument minted this facet. The taxonomy maps
 *  directly onto the verb-category taxonomy declared in
 *  `product/domain/manifest/verb-entry.ts`. */
export type MintingInstrument =
  | 'observe'        // minted by an observation verb (aria snapshot, DOM probe)
  | 'interact'       // minted as a byproduct of an interaction verb
  | 'intent-parse'   // minted during intent parsing (rare but possible)
  | 'facet-mint'     // minted directly by an operator or agent through the facet-mint verb
  | 'discovery';     // minted by the discovery engine (cold-derivation)

/** Atomic-at-mint provenance header. Written once at facet creation
 *  and never mutated. The v1 fields `certification` and `activatedAt`
 *  retire: "is this trusted?" is computed on-read from the evidence
 *  log, not carried as a mutable flag on the header.
 *
 *  All fields are required. A missing field at mint time is a
 *  validation error — the facet is rejected rather than minted with
 *  a partial header. */
export interface FacetProvenance {
  /** ISO-8601 timestamp recorded at mint time. Stable forever. */
  readonly mintedAt: string;
  /** Which instrument produced the observation that led to this
   *  mint. Drives the mint-time validity predicates (e.g., only
   *  `observe` or `interact` can mint an element facet). */
  readonly instrument: MintingInstrument;
  /** Agent session identifier, if the mint happened within an agent
   *  session. Enables per-session auditing and re-derivation. */
  readonly agentSessionId: string | null;
  /** Run identifier — the specific authoring or discovery run that
   *  emitted the mint. Joins against the run-record log. */
  readonly runId: string;
  /** The verb name (from the manifest) that emitted the mint.
   *  Convention-matched to manifest `VerbEntry.name`. */
  readonly mintedByVerb: string;
}

/** Narrow smart constructor — centralizes validation. Use at every
 *  mint site to ensure the required fields are non-empty and the
 *  instrument is in the closed set. */
export function mintFacetProvenance(input: {
  readonly mintedAt: string;
  readonly instrument: MintingInstrument;
  readonly agentSessionId: string | null;
  readonly runId: string;
  readonly mintedByVerb: string;
}): FacetProvenance {
  if (input.mintedAt.length === 0) {
    throw new Error('mintFacetProvenance: mintedAt is required');
  }
  if (input.runId.length === 0) {
    throw new Error('mintFacetProvenance: runId is required');
  }
  if (input.mintedByVerb.length === 0) {
    throw new Error('mintFacetProvenance: mintedByVerb is required');
  }
  return {
    mintedAt: input.mintedAt,
    instrument: input.instrument,
    agentSessionId: input.agentSessionId,
    runId: input.runId,
    mintedByVerb: input.mintedByVerb,
  };
}
