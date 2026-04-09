/**
 * Pure decomposer: PatternDocument → readonly Atom<'pattern', PatternAtomContent>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/patterns/*.yaml` is a canonical artifact whose
 * long-term form is one atom per promoted cross-screen abstraction.
 *
 * Phase A.6. After the mint-helper refactor the fan-out flattens
 * the two-sub-map structure (`actions` + `postures`) into a
 * candidate list; the public decomposer mints them.
 *
 * **Two-sub-map flatten.** `PatternDocument.actions` and
 * `PatternDocument.postures` both contain `PatternAliasSet`
 * entries. The fan-out reads both, tags each with its category,
 * and emits one candidate per entry sorted by pattern id.
 *
 * **Content type extension (category preserved).** The atom
 * content is `PatternAliasSet & { readonly category: 'action' | 'posture' }`
 * — a TypeScript-native intersection that extends the existing
 * domain type with one field carrying the category information
 * the source structure encodes implicitly. Per
 * `docs/canon-and-derivation.md` § 16.7, this is the narrow
 * exception when the existing type is structurally missing
 * information the source carries.
 *
 * **Category as fingerprint-bearing.** Two atoms with the same
 * `id` and the same `aliases` but different categories produce
 * DIFFERENT fingerprints because the category is part of the
 * content. The mint helper's fingerprint formula covers the full
 * content including the category field.
 *
 * Pure application — depends only on `lib/application/canon/minting`,
 * `lib/domain/pipeline`, and `lib/domain/knowledge/types`.
 */

import type {
  PatternDocument,
  PatternAliasSet,
} from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { PatternAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import {
  mintAtoms,
  producerFrom,
  type AtomCandidate,
} from './minting';

// ─── Derived content type ────────────────────────────────────────

/** The pattern atom's content: `PatternAliasSet` extended with a
 *  category tag. TypeScript-native intersection — the base is the
 *  existing domain type verbatim; the added field is the single
 *  piece of information the source carries but the existing type
 *  does not. */
export type PatternAtomContent = PatternAliasSet & {
  readonly category: 'action' | 'posture';
};

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposePatternsInput {
  readonly content: PatternDocument;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Fan-out ────────────────────────────────────────────────────

/** Pure fan-out: `PatternDocument` → per-pattern atom candidates.
 *  Both sub-maps are flattened and sorted by pattern id. Exported
 *  for tests that want to exercise the fan-out in isolation. */
export function fanOutPatterns(
  content: PatternDocument,
): readonly AtomCandidate<'pattern', PatternAtomContent>[] {
  // Filter undefined entries from the Partial<Record<...>> actions
  // sub-map; postures is a regular Record.
  const actionEntries = Object.entries(content.actions ?? {}).filter(
    (entry): entry is [string, PatternAliasSet] => entry[1] !== undefined,
  );
  const postureEntries = Object.entries(content.postures ?? {});

  const tagged: ReadonlyArray<{
    readonly aliasSet: PatternAliasSet;
    readonly category: 'action' | 'posture';
  }> = [
    ...actionEntries.map(([, aliasSet]) => ({ aliasSet, category: 'action' as const })),
    ...postureEntries.map(([, aliasSet]) => ({ aliasSet, category: 'posture' as const })),
  ];

  // Sort by pattern id for stable cross-sub-map ordering.
  const sorted = [...tagged].sort((left, right) =>
    left.aliasSet.id.localeCompare(right.aliasSet.id),
  );

  return sorted.map(({ aliasSet, category }) => {
    const address: PatternAtomAddress = { class: 'pattern', id: aliasSet.id };
    const patternContent: PatternAtomContent = {
      id: aliasSet.id,
      aliases: aliasSet.aliases,
      category,
    };
    return {
      address,
      content: patternContent,
      // Pattern atoms are not screen-scoped; the input reference
      // is the document as a whole.
      inputs: ['patterns:shared'],
    };
  });
}

// ─── Public decomposer ──────────────────────────────────────────

/** Decompose a `PatternDocument` into a flat list of pattern atom
 *  envelopes drawn from both the actions and postures sub-maps. */
export function decomposePatterns(
  input: DecomposePatternsInput,
): readonly Atom<'pattern', PatternAtomContent, PhaseOutputSource>[] {
  return mintAtoms(producerFrom(input), fanOutPatterns(input.content));
}
