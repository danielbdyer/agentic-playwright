/**
 * Pure decomposer: PatternDocument → readonly Atom<'pattern', PatternAtomContent>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/patterns/*.yaml` is a canonical artifact whose
 * long-term form is one atom per promoted cross-screen abstraction
 * under
 * `.canonical-artifacts/{agentic|deterministic}/atoms/patterns/{pattern-id}.yaml`.
 *
 * Phase A.6 of `docs/cold-start-convergence-plan.md`. Sixth canon
 * decomposer. Back to single-class output after the two tier-
 * crossing slices (A.4 route-knowledge and A.5 surfaces) — this
 * one follows the flat Phase A.1/A.2/A.3 template: a readonly
 * array of atoms, no composition.
 *
 * **Structural note — two sub-maps flattened to one atom array.**
 *
 * A `PatternDocument` has two top-level sub-maps:
 *
 *   - `actions`: keyed by action name (`'click'`, `'input'`,
 *     `'navigate'`, `'assert-snapshot'`, `'custom'`), with
 *     `PatternAliasSet` values.
 *   - `postures`: keyed by posture name (`'valid'`, `'invalid'`,
 *     `'empty'`, `'boundary'`, etc.), also with `PatternAliasSet`
 *     values.
 *
 * Both sub-maps produce atoms of the SAME atom class (`'pattern'`)
 * keyed by the pattern's `id` field (not by the sub-map key). The
 * decomposer iterates both sub-maps, flattens them, and sorts by id
 * lexicographically for stable ordering. This is the first canon
 * decomposer where one input sub-structure (the `PatternDocument`)
 * fans out into one flat atom array drawn from two different
 * typed sub-sources.
 *
 * **Content type extension — category preserved.**
 *
 * The `PatternAliasSet` domain type carries `id` and `aliases` but
 * does NOT carry the category (action vs posture) that the YAML
 * structure implicitly tags each entry with. The category is
 * load-bearing information: consumers need to know whether
 * `core.click` is an action pattern or a posture pattern without
 * having to look it up in the original document.
 *
 * The atom content is therefore a TypeScript-native intersection
 * type:
 *
 *     PatternAtomContent = PatternAliasSet & { readonly category: 'action' | 'posture' }
 *
 * This is NOT a parallel content invention — it is a minimal
 * extension of the existing `PatternAliasSet` domain type that adds
 * exactly one field to carry the category that the source
 * structure already encodes implicitly. Per
 * `docs/canon-and-derivation.md` § 16.7, atom envelopes store
 * existing domain types; the extension is justified because the
 * existing type is structurally missing information the source
 * carries.
 *
 * **Source-agnostic construction seam.**
 *
 * Like every other canon decomposer, this one is NOT tied to YAML.
 * The caller passes a parsed-and-typed `PatternDocument`; the
 * discovery engine may eventually derive patterns from repeated
 * alias observation (per `docs/canon-and-derivation.md` § 3.6 atom
 * lifecycle: "Patterns are promoted only after recurrence across
 * multiple screens"). When that happens, the same decomposer runs
 * over the deterministically-produced `PatternDocument` and the
 * `PhaseOutputSource` field on the envelope distinguishes the two
 * origins.
 *
 * **Ontology grounding.**
 *
 * Per `docs/domain-model.md` § Knowledge, patterns are promoted
 * cross-screen abstractions — they sit INSIDE the epistemological
 * loop (knowledge is accumulated belief, not a stable referent),
 * but their identity is stable across runs and their content is
 * evidence-backed. Patterns straddle the "knowledge vs referent"
 * boundary in the same way that hints do: the thing being mapped
 * is an alias set, the thing it maps to is an action-or-posture
 * concept.
 *
 * Per `docs/domain-ontology.md` § Pattern, a pattern's canonical
 * home today is `knowledge/patterns/*.yaml`; the long-term home
 * is one file per pattern atom under the canonical artifact store.
 *
 * Per `docs/domain-class-decomposition.md` § Knowledge row, the
 * existing domain types are `PatternAliasSet` and `PatternDocument`
 * in `lib/domain/knowledge/types.ts:324-333`. This decomposer
 * references both directly.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`PatternDocument`,
 * `PatternAliasSet`), and `lib/domain/kernel/hash` (deterministic
 * stringification + sha256). No Effect, no IO, no mutation.
 */

import type {
  PatternDocument,
  PatternAliasSet,
} from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { PatternAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { stableStringify, sha256 } from '../../domain/kernel/hash';

// ─── Derived content type ────────────────────────────────────────

/** The pattern atom's content: the existing `PatternAliasSet`
 *  domain type extended with a category tag that preserves the
 *  action-vs-posture distinction implicit in the source document's
 *  two-sub-map structure. Intersection type — the base is the
 *  existing domain type verbatim; the added field is the single
 *  piece of information the source carries but the existing type
 *  does not. */
export type PatternAtomContent = PatternAliasSet & {
  readonly category: 'action' | 'posture';
};

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposePatternsInput {
  /** The parsed-and-typed pattern document. The caller is
   *  responsible for parsing the YAML (or consuming the
   *  deterministic derivation output) and validating it against
   *  the existing pattern schema before invoking the decomposer. */
  readonly content: PatternDocument;
  /** Which slot of the lookup chain the document came from. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). For the
   *  one-shot migration script, use a constant like
   *  `'canon-decomposer:patterns:v1'`. */
  readonly producedBy: string;
  /** ISO timestamp the decomposition was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── Helper: build a pattern atom ────────────────────────────────

/** Build a single pattern atom envelope from a `PatternAliasSet`
 *  entry and its category. Private helper that factors the repeated
 *  envelope-construction logic between the two sub-maps. */
function buildPatternAtom(
  aliasSet: PatternAliasSet,
  category: 'action' | 'posture',
  input: DecomposePatternsInput,
): Atom<'pattern', PatternAtomContent> {
  const address: PatternAtomAddress = { class: 'pattern', id: aliasSet.id };
  const content: PatternAtomContent = {
    id: aliasSet.id,
    aliases: aliasSet.aliases,
    category,
  };
  const inputFingerprint = `sha256:${sha256(stableStringify({ address, content }))}`;
  return atom<'pattern', PatternAtomContent>({
    class: 'pattern',
    address,
    content,
    source: input.source,
    inputFingerprint,
    provenance: {
      producedBy: input.producedBy,
      producedAt: input.producedAt,
      pipelineVersion: input.pipelineVersion,
      // Pattern atoms are drawn from a pattern document that is not
      // screen-scoped. The input reference is the document as a
      // whole; future enhancements could narrow this to
      // `patterns:{document-id}` if there is ever more than one
      // pattern document per project.
      inputs: ['patterns:shared'],
    },
  });
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `PatternDocument` into a flat list of pattern atom
 *  envelopes — one per entry in `content.actions` plus one per
 *  entry in `content.postures`.
 *
 *  Pure function: same input → same output. The output is ordered
 *  by pattern id (lexicographic), NOT by sub-map. This means an
 *  action pattern with id `core.click` and a posture pattern with
 *  id `core.valid` appear interleaved in sorted order, not grouped
 *  by category. The `category` field on each atom's content
 *  preserves the distinction for consumers that care.
 *
 *  The function follows the same catamorphism shape as the flat
 *  canon decomposers (elements, hints, postures). No mutation, no
 *  early return, no `let`. Undefined sub-maps are skipped via the
 *  `?? {}` fallback; undefined entries within a sub-map (the
 *  `Partial<Record<...>>` tolerance) are filtered out.
 */
export function decomposePatterns(
  input: DecomposePatternsInput,
): readonly Atom<'pattern', PatternAtomContent>[] {
  // Build action atoms from the `actions` sub-map. The Partial
  // record allows undefined entries; filter them out.
  const actionEntries = Object.entries(input.content.actions ?? {}).filter(
    (entry): entry is [string, PatternAliasSet] => entry[1] !== undefined,
  );

  // Build posture atoms from the `postures` sub-map.
  const postureEntries = Object.entries(input.content.postures ?? {});

  // Build the tagged atom list (category attached at this stage so
  // the sort-by-id step is agnostic to which sub-map each entry
  // came from).
  const tagged: ReadonlyArray<{
    readonly aliasSet: PatternAliasSet;
    readonly category: 'action' | 'posture';
  }> = [
    ...actionEntries.map(([, aliasSet]) => ({ aliasSet, category: 'action' as const })),
    ...postureEntries.map(([, aliasSet]) => ({ aliasSet, category: 'posture' as const })),
  ];

  // Sort by pattern id (lexicographic). This produces a stable
  // order across runs regardless of which sub-map each pattern
  // came from.
  const sorted = [...tagged].sort((left, right) =>
    left.aliasSet.id.localeCompare(right.aliasSet.id),
  );

  return sorted.map(({ aliasSet, category }) =>
    buildPatternAtom(aliasSet, category, input),
  );
}
