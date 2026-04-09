/**
 * Pure decomposer: RouteKnowledgeManifest →
 *   { routeAtoms, variantAtoms, routeGraphs }
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/routes/demo.routes.yaml` is a hybrid canonical
 * artifact that spans Tier 1 (route + route-variant atoms) AND
 * Tier 2 (the route-graph composition that connects them). First
 * canon decomposer that crosses tiers.
 *
 * Phase A.4. After the mint-helper refactor the fan-out returns a
 * typed bag of `AtomCandidate`s + `CompositionCandidate`s; the
 * public decomposer mints them via `mintAtoms` / `mintCompositions`.
 *
 * **Source-agnostic construction seam.** The decomposer is NOT
 * tied to YAML. It accepts a parsed-and-typed
 * `RouteKnowledgeManifest` regardless of origin (YAML parsing or
 * `harvestDeclaredRoutes` live DOM harvest per § 16.4 of
 * canon-and-derivation). The existing `HarvestManifest` type
 * alias at `lib/domain/intent/routes.ts:69` is literally
 * `RouteKnowledgeManifest` renamed — the domain recognized the
 * unification before the decomposer did.
 *
 * This enforces the cold-start ↔ warm-start interop contract from
 * `docs/canon-and-derivation.md` § 8.1 at the atom level: one
 * typed input, one decomposer, two call sites. The
 * `PhaseOutputSource` distinguishes origins; the fingerprint is
 * content-only (via `mintAtom`/`mintComposition`) so YAML-migrated
 * and live-harvested manifests with equivalent content produce
 * byte-equal fingerprints.
 *
 * **Tier-crossing bag output.** Unlike the flat-array decomposers,
 * this one returns a typed bag with three named fields:
 *
 *     {
 *       routeAtoms:   readonly Atom<'route', RouteAtomContent>[];
 *       variantAtoms: readonly Atom<'route-variant', RouteKnowledgeVariant>[];
 *       routeGraphs:  readonly Composition<'route-graph', RouteGraphCompositionContent>[];
 *     }
 *
 * **Content shape derivation (no parallel types invented).** The
 * route atom content is `Omit<RouteKnowledgeRoute, 'variants'>` —
 * route metadata with variants split out. The route-graph
 * composition content is
 * `Omit<RouteKnowledgeManifest, 'routes' | 'kind' | 'version'>` —
 * app-level metadata with the routes split into atoms and the
 * addressing-level fields removed.
 *
 * **Composition atomReferences — route atoms only.** The
 * route-graph composition's `atomReferences` field lists route
 * atoms with `role: 'member'` and positional `order`. Variants
 * are intentionally NOT in the reference list because they are
 * addressable through their parent route.
 *
 * **Variant dual-input provenance.** Variant atoms carry TWO
 * inputs: the manifest-level tag and the route-scoped tag. The
 * demotion machinery marks variants as candidates when EITHER
 * upstream changes.
 *
 * Pure application — depends only on `lib/application/canon/minting`,
 * `lib/domain/pipeline`, and `lib/domain/intent/routes`. No
 * Effect, no IO, no mutation.
 */

import type {
  RouteKnowledgeManifest,
  RouteKnowledgeRoute,
  RouteKnowledgeVariant,
} from '../../domain/intent/routes';
import type { Atom } from '../../domain/pipeline/atom';
import type {
  RouteAtomAddress,
  RouteVariantAtomAddress,
} from '../../domain/pipeline/atom-address';
import type { Composition, AtomReference } from '../../domain/pipeline/composition';
import type { RouteGraphCompositionAddress } from '../../domain/pipeline/composition-address';
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

/** Route atom content: the route metadata with variants split out. */
export type RouteAtomContent = Omit<RouteKnowledgeRoute, 'variants'>;

/** Route-graph composition content: manifest-level metadata with
 *  the content that has been split into atoms removed. */
export type RouteGraphCompositionContent = Omit<
  RouteKnowledgeManifest,
  'routes' | 'kind' | 'version'
>;

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeRouteKnowledgeInput {
  readonly content: RouteKnowledgeManifest;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Output bag ─────────────────────────────────────────────────

export interface DecomposeRouteKnowledgeOutput {
  readonly routeAtoms: readonly Atom<'route', RouteAtomContent>[];
  readonly variantAtoms: readonly Atom<'route-variant', RouteKnowledgeVariant>[];
  readonly routeGraphs: readonly Composition<'route-graph', RouteGraphCompositionContent>[];
}

// ─── Fan-out bag ────────────────────────────────────────────────

/** Internal: a typed bag of candidates matching the output shape. */
interface RouteKnowledgeCandidateBag {
  readonly routeAtoms: readonly AtomCandidate<'route', RouteAtomContent>[];
  readonly variantAtoms: readonly AtomCandidate<'route-variant', RouteKnowledgeVariant>[];
  readonly routeGraphs: readonly CompositionCandidate<'route-graph', RouteGraphCompositionContent>[];
}

/** Pure fan-out: `RouteKnowledgeManifest` → typed candidate bag.
 *  Stable sort on routes (by id) and on variants within each
 *  route (also by id). Exported for tests that want to exercise
 *  the fan-out in isolation. */
export function fanOutRouteKnowledge(
  content: RouteKnowledgeManifest,
): RouteKnowledgeCandidateBag {
  const sortedRoutes = [...content.routes].sort((left, right) =>
    (left.id as string).localeCompare(right.id as string),
  );

  // Route atom candidates
  const routeAtoms: readonly AtomCandidate<'route', RouteAtomContent>[] =
    sortedRoutes.map((route) => {
      const address: RouteAtomAddress = { class: 'route', id: route.id };
      const { variants: _variants, ...routeMetadata } = route;
      const routeContent: RouteAtomContent = routeMetadata;
      return {
        address,
        content: routeContent,
        inputs: [`route-knowledge:${content.app}`],
      };
    });

  // Variant atom candidates (one per route × variant)
  const variantAtoms: readonly AtomCandidate<'route-variant', RouteKnowledgeVariant>[] =
    sortedRoutes.flatMap((route) => {
      const sortedVariants = [...route.variants].sort((left, right) =>
        (left.id as string).localeCompare(right.id as string),
      );
      return sortedVariants.map((variant) => {
        const address: RouteVariantAtomAddress = {
          class: 'route-variant',
          route: route.id,
          variant: variant.id,
        };
        return {
          address,
          content: variant,
          // Two upstream inputs — the demotion machinery marks
          // the variant as a candidate when EITHER changes.
          inputs: [
            `route-knowledge:${content.app}`,
            `route-knowledge:${content.app}:${route.id}`,
          ],
        };
      });
    });

  // Route-graph composition candidate (one per manifest)
  const graphAddress: RouteGraphCompositionAddress = {
    subType: 'route-graph',
    id: brandString<'RouteGraphId'>(content.app),
  };
  const graphContent: RouteGraphCompositionContent = {
    app: content.app,
    baseUrl: content.baseUrl,
    governance: content.governance,
  };
  // atomReferences list every route atom in sorted order with a
  // positional order hint. Uses the same sorted order as
  // routeAtoms so the indices line up.
  const atomReferences: readonly AtomReference[] = routeAtoms.map((candidate, index) => ({
    address: candidate.address,
    role: 'member',
    order: index,
  }));
  const routeGraphs: readonly CompositionCandidate<'route-graph', RouteGraphCompositionContent>[] = [
    {
      address: graphAddress,
      content: graphContent,
      atomReferences,
      inputs: [`route-knowledge:${content.app}`],
    },
  ];

  return { routeAtoms, variantAtoms, routeGraphs };
}

// ─── Public decomposer ──────────────────────────────────────────

/** Decompose a `RouteKnowledgeManifest` into the tier-crossing
 *  output bag. Pure function: same input → same output including
 *  all fingerprints. */
export function decomposeRouteKnowledge(
  input: DecomposeRouteKnowledgeInput,
): DecomposeRouteKnowledgeOutput {
  const producer = producerFrom(input);
  const bag = fanOutRouteKnowledge(input.content);
  return {
    routeAtoms: mintAtoms(producer, bag.routeAtoms),
    variantAtoms: mintAtoms(producer, bag.variantAtoms),
    routeGraphs: mintCompositions(producer, bag.routeGraphs),
  };
}
