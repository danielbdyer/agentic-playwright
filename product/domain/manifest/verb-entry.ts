/**
 * Verb entry — the per-verb record in the vocabulary manifest.
 *
 * Every `product/` module that declares a verb (intent-fetch,
 * observe, interact, facet-mint, ...) emits a `VerbEntry` via
 * `declareVerb(...)`. The manifest emitter collects all declared
 * entries at build time and writes them to
 * `product/manifest/manifest.json`.
 *
 * The manifest is the agent's single source of truth for which
 * verbs it can call. Agent sessions read `manifest.json` once at
 * session start; no session-time reflection over code happens.
 *
 * Per `docs/v2-direction.md §6 Step 2` and `docs/v2-substrate.md §2`
 * primitives.
 */

/** Top-level category groups the verb falls under. The categories
 *  map to the five primitives named in `docs/v2-substrate.md §2`.
 *  `mutation` was renamed from `interact` (per Agent B's polysemy
 *  audit, 2026-04-25): the verb named `'interact'` was IN the
 *  `'interact'` category alongside `navigate`, so the category
 *  string and the verb name collided. `'mutation'` names the
 *  category by what the verbs DO (mutate page state) rather than
 *  by the canonical verb. */
export type VerbCategory =
  | 'intent'      // agent receives and parses intent (e.g., ADO fetch, intent-parse)
  | 'observe'     // agent observes the world (e.g., aria snapshot, DOM probe)
  | 'mutation'    // agent acts on the world (e.g., click, type, navigate)
  | 'memory'      // agent reads/writes the facet catalog (facet-mint, facet-query)
  | 'reason'      // agent reasons (select, interpret, synthesize)
  | 'compose'     // agent emits a test (test-compose)
  | 'execute'     // agent runs a test (test-execute, playwright runner)
  | 'governance'  // product-side governance signals (proposal emission)
  | 'diagnostic'; // instruments for inspection / debugging

/** Shape descriptor for a verb's input or output. These are NAMES
 *  only — the manifest describes verb signatures without duplicating
 *  TypeScript type definitions. A manifest consumer that needs the
 *  full structural shape reads the declaration module directly. */
export interface VerbShapeDescriptor {
  /** Identifier for the shape: typically the TypeScript type name
   *  exported by the declaration module. */
  readonly typeName: string;
  /** Module path (relative to repo root) that exports `typeName`. */
  readonly declaredIn: string;
  /** Optional human-legible one-liner describing the shape. */
  readonly summary?: string;
}

/** The canonical per-verb record that lands in the manifest. */
export interface VerbEntry {
  /** Unique verb name. Convention: lowercase-hyphen (`intent-fetch`,
   *  `facet-query`, `reason-select`). Serves as the manifest key;
   *  duplicates fail the build. */
  readonly name: string;
  /** Top-level category for grouping the verb in the manifest and
   *  in the dashboard projection. */
  readonly category: VerbCategory;
  /** One-line description of what the verb does, from the agent's
   *  perspective. Meant to be human-legible, not a type signature. */
  readonly summary: string;
  /** Input shape descriptor. */
  readonly inputs: VerbShapeDescriptor;
  /** Output shape descriptor on the happy path. */
  readonly outputs: VerbShapeDescriptor;
  /** Named error families the verb may emit. Each family is a
   *  member of the closed error-family set declared by the verb's
   *  error-union module (which `errorFamilies[i]` names via
   *  `declaredIn`). */
  readonly errorFamilies: readonly string[];
  /** Semantic version the verb was first introduced. Additive
   *  changes bump a later `sinceVersion` on new entries; removing
   *  a verb requires a major bump and a deprecation record. */
  readonly sinceVersion: string;
  /** Absolute (repo-relative) module path where this verb is
   *  declared. Drives the fluency dispatch harness's lookup and is
   *  the grounding for the `declaredIn` paths in the seam-
   *  enforcement allowlist. */
  readonly declaredIn: string;
}
