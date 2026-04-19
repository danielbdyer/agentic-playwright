/**
 * Pure decomposer: SurfaceGraph →
 *   { surfaceAtoms, surfaceCompositions }
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/surfaces/*.surface.yaml` is a hybrid canonical
 * artifact that spans Tier 1 (surface atoms) AND Tier 2 (a
 * surface-composition describing section grouping). Second canon
 * decomposer that crosses tiers.
 *
 * Phase A.5. After the mint-helper refactor the fan-out returns a
 * typed bag of candidates; the public decomposer mints them via
 * `mintAtoms` / `mintCompositions`.
 *
 * **Source-agnostic.** The decomposer is NOT tied to YAML. A
 * future live DOM surface walker can invoke it directly.
 * `PhaseOutputSource` distinguishes origins; the fingerprint is
 * content-only (via the mint helpers).
 *
 * **Tier-crossing bag output.** Mirrors
 * `DecomposeRouteKnowledgeOutput` without the variants array.
 *
 * **Content shape derivation.** Surface atom content is the
 * existing `SurfaceDefinition` domain type verbatim. Surface-
 * composition content is `Omit<SurfaceGraph, 'surfaces'>` —
 * `screen`, `url`, and the full `sections` map; `surfaces` is
 * split out into Tier 1 atoms.
 *
 * **Sections verbatim as the recipe content.** The `sections`
 * map captures cross-surface grouping (a section is a region
 * containing multiple related surfaces with a shared selector
 * prefix, optional parameterized entry URL, and optional snapshot
 * template). Per § 3.7 of the doctrine, compositions encode
 * higher-order patterns that cannot be reconstructed from atoms
 * alone, and section grouping is exactly such a pattern. The
 * fan-out rebuilds the sections map in lex-sorted key order so
 * the composition's content is deterministic.
 *
 * **Composition identity.** Address is
 * `{ subType: 'surface-composition', screen, id: 'default' }`.
 * The constant `'default'` leaves room for future multi-
 * composition-per-screen models.
 *
 * **Composition atomReferences.** Lists every surface atom in
 * sorted order with `role: 'member'` and positional `order`.
 *
 * Pure application — depends only on `product/application/canon/minting`,
 * `product/domain/pipeline`, and `product/domain/knowledge/types`.
 */

import type {
  SurfaceGraph,
  SurfaceDefinition,
  SurfaceSection,
} from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { SurfaceAtomAddress } from '../../domain/pipeline/atom-address';
import type { Composition, AtomReference } from '../../domain/pipeline/composition';
import type { SurfaceCompositionAddress } from '../../domain/pipeline/composition-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { brandString } from '../../domain/kernel/brand';
import {
  mintAtoms,
  mintCompositions,
  producerFrom,
  type AtomCandidate,
  type CompositionCandidate,
} from './minting';

// ─── Derived content types ───────────────────────────────────────

/** Surface-composition content: graph metadata with the surfaces
 *  map split out. TypeScript-native derivation of `SurfaceGraph`. */
export type SurfaceCompositionContent = Omit<SurfaceGraph, 'surfaces'>;

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenSurfacesInput {
  readonly content: SurfaceGraph;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Output bag ─────────────────────────────────────────────────

export interface DecomposeScreenSurfacesOutput {
  readonly surfaceAtoms: readonly Atom<'surface', SurfaceDefinition, PhaseOutputSource>[];
  readonly surfaceCompositions: readonly Composition<
    'surface-composition',
    SurfaceCompositionContent,
    PhaseOutputSource
  >[];
}

// ─── Fan-out ────────────────────────────────────────────────────

interface SurfacesCandidateBag {
  readonly surfaceAtoms: readonly AtomCandidate<'surface', SurfaceDefinition>[];
  readonly surfaceCompositions: readonly CompositionCandidate<
    'surface-composition',
    SurfaceCompositionContent
  >[];
}

/** Pure fan-out: `SurfaceGraph` → typed candidate bag. Exported
 *  for tests that want to exercise the fan-out in isolation. */
export function fanOutScreenSurfaces(content: SurfaceGraph): SurfacesCandidateBag {
  const screen = content.screen;

  // Sort surface entries by id for determinism.
  const sortedSurfaces = Object.entries(content.surfaces).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );

  // Surface atom candidates
  const surfaceAtoms: readonly AtomCandidate<'surface', SurfaceDefinition>[] =
    sortedSurfaces.map(([surfaceIdString, definition]) => {
      const address: SurfaceAtomAddress = {
        class: 'surface',
        screen,
        surface: brandString<'SurfaceId'>(surfaceIdString),
      };
      return {
        address,
        content: definition,
        inputs: [`screen-surfaces:${screen}`],
      };
    });

  // Sections are rebuilt in lex-sorted key order so the composition
  // content is deterministic regardless of YAML parser order.
  const sortedSections: Record<string, SurfaceSection> = Object.fromEntries(
    Object.entries(content.sections).sort(([leftId], [rightId]) =>
      leftId.localeCompare(rightId),
    ),
  );

  // Composition candidate (one per graph). atomReferences mirror
  // the sorted atom order with positional order hints.
  const compositionAddress: SurfaceCompositionAddress = {
    subType: 'surface-composition',
    screen,
    id: brandString<'SurfaceCompositionId'>('default'),
  };
  const compositionContent: SurfaceCompositionContent = {
    screen,
    url: content.url,
    sections: sortedSections,
  };
  const atomReferences: readonly AtomReference[] = surfaceAtoms.map(
    (candidate, index) => ({
      address: candidate.address,
      role: 'member',
      order: index,
    }),
  );
  const surfaceCompositions: readonly CompositionCandidate<
    'surface-composition',
    SurfaceCompositionContent
  >[] = [
    {
      address: compositionAddress,
      content: compositionContent,
      atomReferences,
      inputs: [`screen-surfaces:${screen}`],
    },
  ];

  return { surfaceAtoms, surfaceCompositions };
}

// ─── Public decomposer ──────────────────────────────────────────

/** Decompose a `SurfaceGraph` into the tier-crossing output bag. */
export function decomposeScreenSurfaces(
  input: DecomposeScreenSurfacesInput,
): DecomposeScreenSurfacesOutput {
  const producer = producerFrom(input);
  const bag = fanOutScreenSurfaces(input.content);
  return {
    surfaceAtoms: mintAtoms(producer, bag.surfaceAtoms),
    surfaceCompositions: mintCompositions(producer, bag.surfaceCompositions),
  };
}
