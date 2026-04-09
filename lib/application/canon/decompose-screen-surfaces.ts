/**
 * Pure decomposer: SurfaceGraph →
 *   { surfaceAtoms, surfaceCompositions }
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/surfaces/*.surface.yaml` is a hybrid canonical
 * artifact that spans Tier 1 (surface atoms, one per spatial region
 * within the screen) AND Tier 2 (a surface-composition describing
 * how those atoms group into sections). This is the second canon
 * decomposer that crosses tiers — after `decomposeRouteKnowledge`
 * at `lib/application/canon/decompose-route-knowledge.ts` — and
 * deliberately copies that decomposer's bag shape so the template
 * is confirmed by two worked examples.
 *
 * Phase A.5 of `docs/cold-start-convergence-plan.md`. Peer of the
 * four prior canon decomposers. Same catamorphism idiom, same
 * fingerprint-independent-from-provenance property, same stable
 * lex ordering, same interop-contract guarantees.
 *
 * **Source-agnostic construction seam.**
 *
 * Like the route-knowledge decomposer, this one is deliberately
 * NOT tied to YAML. The caller passes a parsed-and-typed
 * `SurfaceGraph`; whether that graph came from YAML parsing or
 * from a live DOM harvest (a future discovery-engine surface
 * walker) is the caller's concern. The `PhaseOutputSource` field
 * on the envelope distinguishes the two origins, and the
 * fingerprint is content-only, so YAML-migrated and live-harvested
 * surface graphs with equivalent content produce byte-equal
 * fingerprints — which is the load-bearing property for the
 * cold-start ↔ warm-start interop contract from
 * `docs/canon-and-derivation.md` § 8.1.
 *
 * **Tier-crossing output shape (copies Phase A.4 bag template).**
 *
 * The output is a typed bag mirroring `DecomposeRouteKnowledgeOutput`:
 *
 *     {
 *       surfaceAtoms:        readonly Atom<'surface', SurfaceDefinition>[];
 *       surfaceCompositions: readonly Composition<'surface-composition',
 *                                                SurfaceCompositionContent>[];
 *     }
 *
 * Every field is a readonly array so the decomposer's output
 * cardinality is visible at the return type. Future tier-crossing
 * canon decomposers should follow the same template.
 *
 * **Content shape derivation — no parallel types invented.**
 *
 * The surface atom content is the existing `SurfaceDefinition`
 * domain type from `lib/domain/knowledge/types.ts:149-158`,
 * verbatim. Per `docs/canon-and-derivation.md` § 16.7 and the
 * § Target row of `docs/domain-class-decomposition.md`, atom
 * envelopes store existing domain types without reshaping.
 *
 * The surface-composition content is
 * `Omit<SurfaceGraph, 'surfaces'>` — the graph metadata
 * (`screen`, `url`) plus the `sections` map that captures the
 * cross-surface structural grouping. The `surfaces` field is
 * split out into Tier 1 atoms so including it in the composition
 * would be data duplication. `Omit<T, K>` is a TypeScript-native
 * type-level derivation — not a parallel content shape.
 *
 * **Composition content carries sections verbatim.**
 *
 * The `sections` map in `SurfaceGraph` is the load-bearing "recipe"
 * content of the surface-composition. A section groups multiple
 * surfaces by a shared selector prefix, a shared URL (for
 * parameterized entry states), a shared `kind`, and an optional
 * snapshot template. The composition must preserve this grouping
 * because it is the operator/agent-authored intent about HOW the
 * surfaces compose into screen regions. Per
 * `docs/canon-and-derivation.md` § 3.7, compositions encode
 * higher-order patterns that cannot be reconstructed from atoms
 * alone — and section grouping is exactly that.
 *
 * **Composition `atomReferences` — every surface atom.**
 *
 * The composition's `atomReferences` field lists one reference
 * per surface atom in the graph, in the same sorted order as the
 * atoms themselves. Each reference has `role: 'member'` and a
 * positional `order` hint equal to the atom's 0-indexed position
 * in the sorted list. Variants on this — e.g. section-scoped role
 * tags like `'section:search-form'` — are possible future
 * enhancements; the current minimal shape is enough for the
 * reverse index to build an atom → composition lookup.
 *
 * **Composition identity.**
 *
 * The `SurfaceCompositionAddress` from
 * `lib/domain/pipeline/composition-address.ts:74-78` is keyed by
 * `(screen, SurfaceCompositionId)`. For the current data model
 * there is exactly one composition per screen, so the id is the
 * constant string `'default'`. If a future enhancement adds
 * multiple compositions per screen (e.g. responsive-desktop vs
 * responsive-mobile), they slot in with distinct ids without
 * changing the default composition's identity.
 *
 * **Ontology grounding.**
 *
 * Per `docs/domain-model.md` § Surface, surfaces are the spatial
 * regions through which reality can be perceived — they sit
 * OUTSIDE the epistemological loop as stable referents that the
 * loop operates on. The surface atoms produced here are those
 * stable referents in their persistent canonical form; the
 * composition captures the loop-external grouping structure that
 * makes the atoms navigable.
 *
 * Per `docs/domain-ontology.md` § Surface, a surface's canonical
 * home today is `knowledge/surfaces/{screen}.surface.yaml`; the
 * long-term home (post-decomposition) is one file per surface atom
 * plus one file per surface-composition.
 *
 * Per `docs/domain-class-decomposition.md` § Target row, the
 * existing domain types are `SurfaceDefinition`, `SurfaceSection`,
 * and `SurfaceGraph` in `lib/domain/knowledge/types.ts`. This
 * decomposer references all three directly.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`SurfaceGraph`,
 * `SurfaceDefinition`, `SurfaceSection`), `lib/domain/kernel/brand`
 * (brandString), and `lib/domain/kernel/hash` (deterministic
 * stringification + sha256). No Effect, no IO, no mutation.
 */

import type {
  SurfaceGraph,
  SurfaceDefinition,
  SurfaceSection,
} from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { SurfaceAtomAddress } from '../../domain/pipeline/atom-address';
import type { Composition, AtomReference } from '../../domain/pipeline/composition';
import { composition } from '../../domain/pipeline/composition';
import type { SurfaceCompositionAddress } from '../../domain/pipeline/composition-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { brandString } from '../../domain/kernel/brand';
import { stableStringify, sha256 } from '../../domain/kernel/hash';

// ─── Derived content types ───────────────────────────────────────

/** Surface-composition content: the graph metadata with the
 *  surfaces map split out into Tier 1 atoms. Type-level derivation
 *  of the existing `SurfaceGraph` domain type — no parallel shape
 *  invented. The composition preserves `screen`, `url`, and the
 *  full `sections` map verbatim; the `surfaces` field is
 *  addressable through the composition's `atomReferences`. */
export type SurfaceCompositionContent = Omit<SurfaceGraph, 'surfaces'>;

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenSurfacesInput {
  /** The parsed-and-typed surface graph. The caller is responsible
   *  for parsing the YAML (or consuming the live harvest output)
   *  and validating it against the existing surface schema before
   *  invoking the decomposer. */
  readonly content: SurfaceGraph;
  /** Which slot of the lookup chain the graph came from. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). For the
   *  one-shot migration script, use a constant like
   *  `'canon-decomposer:screen-surfaces:v1'`. */
  readonly producedBy: string;
  /** ISO timestamp the decomposition was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── Output shape (tier-crossing bag, copies Phase A.4) ─────────

export interface DecomposeScreenSurfacesOutput {
  readonly surfaceAtoms: readonly Atom<'surface', SurfaceDefinition>[];
  readonly surfaceCompositions: readonly Composition<
    'surface-composition',
    SurfaceCompositionContent
  >[];
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `SurfaceGraph` into:
 *
 *   - one surface atom per entry in `content.surfaces`
 *   - one surface-composition referencing every surface atom, with
 *     the `sections` map carried in its content as the load-bearing
 *     higher-order recipe
 *
 *  Pure function: same input → same output (including fingerprints).
 *  Surfaces are sorted by id (lexicographic); the composition's
 *  `atomReferences` list is in the same sorted order. Sections are
 *  preserved verbatim in the composition content.
 *
 *  The function follows the same catamorphism shape as the four
 *  prior canon decomposers. No mutation, no early return, no `let`.
 *  The cross-tier structure mirrors
 *  `decomposeRouteKnowledge`: a typed bag with named arrays for
 *  atoms and compositions.
 */
export function decomposeScreenSurfaces(
  input: DecomposeScreenSurfacesInput,
): DecomposeScreenSurfacesOutput {
  const screen = input.content.screen;

  // Sort surface entries by id so the decomposition is
  // deterministic regardless of YAML parser insertion order.
  const sortedSurfaces = Object.entries(input.content.surfaces).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );

  // Surface atoms: one per entry in the surfaces map.
  const surfaceAtoms: readonly Atom<'surface', SurfaceDefinition>[] = sortedSurfaces.map(
    ([surfaceIdString, definition]) => {
      const address: SurfaceAtomAddress = {
        class: 'surface',
        screen,
        surface: brandString<'SurfaceId'>(surfaceIdString),
      };
      const inputFingerprint = `sha256:${sha256(
        stableStringify({ address, content: definition }),
      )}`;
      return atom<'surface', SurfaceDefinition>({
        class: 'surface',
        address,
        content: definition,
        source: input.source,
        inputFingerprint,
        provenance: {
          producedBy: input.producedBy,
          producedAt: input.producedAt,
          pipelineVersion: input.pipelineVersion,
          inputs: [`screen-surfaces:${screen}`],
        },
      });
    },
  );

  // Surface-composition: one per graph. Uses the constant id
  // 'default' because there is exactly one composition per screen
  // in the current data model.
  const compositionAddress: SurfaceCompositionAddress = {
    subType: 'surface-composition',
    screen,
    id: brandString<'SurfaceCompositionId'>('default'),
  };
  // Section entries are sorted by id so the composition content is
  // deterministic. The sorted sections map is rebuilt as a plain
  // record for the content field.
  const sortedSections: Record<string, SurfaceSection> = Object.fromEntries(
    Object.entries(input.content.sections).sort(([leftId], [rightId]) =>
      leftId.localeCompare(rightId),
    ),
  );
  const compositionContent: SurfaceCompositionContent = {
    screen,
    url: input.content.url,
    sections: sortedSections,
  };
  const atomReferences: readonly AtomReference[] = surfaceAtoms.map((a, index) => ({
    address: a.address,
    role: 'member',
    order: index,
  }));
  const compositionFingerprint = `sha256:${sha256(
    stableStringify({
      address: compositionAddress,
      content: compositionContent,
      atomReferences: atomReferences.map((ref) => ({
        address: ref.address,
        role: ref.role,
        order: ref.order,
      })),
    }),
  )}`;
  const surfaceComposition = composition<'surface-composition', SurfaceCompositionContent>({
    subType: 'surface-composition',
    address: compositionAddress,
    content: compositionContent,
    atomReferences,
    source: input.source,
    inputFingerprint: compositionFingerprint,
    provenance: {
      producedBy: input.producedBy,
      producedAt: input.producedAt,
      pipelineVersion: input.pipelineVersion,
      inputs: [`screen-surfaces:${screen}`],
    },
  });

  return {
    surfaceAtoms,
    surfaceCompositions: [surfaceComposition],
  };
}
