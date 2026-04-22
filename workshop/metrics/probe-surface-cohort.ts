/**
 * Probe-surface cohort identity.
 *
 * Step 1 re-keyed the M5 (memory-worthiness-ratio) visitor from a
 * scenario-ID-derived cohort key to a triple `(verb, facetKind,
 * errorFamily)` that identifies a **probe surface** — the minimum
 * (and therefore comparable) unit of "what the workshop probed."
 *
 * Why: the v1 cohort key baked in a per-scenario identity that
 * doesn't survive the dogfood retirement. Under Step 5's manifest-
 * derived probe IR, every probe is identified by its surface
 * (verb × facet-kind × error-family); trajectory comparability
 * becomes a natural function of that surface. Every ProbeReceipt
 * emitted by the fixture-replay harness carries its cohort triple
 * in `payload.cohort`; M5 groups trajectory points by the canonical
 * key derived here.
 *
 * The Step-1-vintage transitional probe set
 * (`workshop/probe-derivation/transitional.ts`) retired at Slice B
 * of Step 5.5 once classifier coverage reached 8/8 and the fixture-
 * replay harness became the post-transitional M5 feed. See
 * `workshop/observations/probe-spike-verdict-04.md` for the
 * retirement record.
 *
 * See `docs/v2-readiness.md §10` for the full re-key plan and
 * `docs/v2-substrate.md §8a` for the metric-visitor audit that
 * declared M5 the re-key target.
 */

/** The four facet kinds the v2 manifest declares. */
export type ProbeFacetKind = 'element' | 'state' | 'vocabulary' | 'route';

/** The five error families every product verb classifies into. */
export type ProbeErrorFamily =
  | 'not-visible'
  | 'not-enabled'
  | 'timeout'
  | 'assertion-like'
  | 'unclassified';

/** The probe-surface triple. */
export interface ProbeSurfaceCohort {
  readonly verb: string;
  readonly facetKind: ProbeFacetKind;
  /** Null when the probe expects success with no error family to match. */
  readonly errorFamily: ProbeErrorFamily | null;
}

/** Serialize a probe-surface cohort to its canonical cohort-ID string.
 *  Format: `verb:<verb>|facet-kind:<kind>|error-family:<family-or-none>`.
 *  The canonical string is used as the cohort identity in
 *  `MemoryMaturityTrajectoryPoint.cohortId`; two points are
 *  comparable for M5 iff their cohort strings are byte-equal. */
export function probeSurfaceCohortKey(cohort: ProbeSurfaceCohort): string {
  const family = cohort.errorFamily ?? 'none';
  return `verb:${cohort.verb}|facet-kind:${cohort.facetKind}|error-family:${family}`;
}

/** Parse a cohort-ID string back into the triple. Returns null when
 *  the string is not in the canonical format — useful for defensive
 *  reads from legacy scorecard entries that carried scenario-ID
 *  cohort keys. */
export function parseProbeSurfaceCohort(id: string): ProbeSurfaceCohort | null {
  const match = /^verb:([^|]+)\|facet-kind:([^|]+)\|error-family:([^|]+)$/.exec(id);
  if (match === null) return null;
  const verb = match[1]!;
  const facetKind = match[2] as ProbeFacetKind;
  const familyRaw = match[3]!;
  if (!isFacetKind(facetKind)) return null;
  const errorFamily = familyRaw === 'none' ? null : (familyRaw as ProbeErrorFamily);
  if (errorFamily !== null && !isErrorFamily(errorFamily)) return null;
  return { verb, facetKind, errorFamily };
}

function isFacetKind(value: string): value is ProbeFacetKind {
  return value === 'element' || value === 'state' || value === 'vocabulary' || value === 'route';
}

function isErrorFamily(value: string): value is ProbeErrorFamily {
  return (
    value === 'not-visible' ||
    value === 'not-enabled' ||
    value === 'timeout' ||
    value === 'assertion-like' ||
    value === 'unclassified'
  );
}
