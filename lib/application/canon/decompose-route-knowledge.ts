/**
 * Pure decomposer: RouteKnowledgeManifest →
 *   { routeAtoms, variantAtoms, routeGraphs }
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/routes/demo.routes.yaml` is a hybrid canonical
 * artifact that spans Tier 1 (route + route-variant atoms) AND
 * Tier 2 (the route-graph composition that connects them). This is
 * the first canon decomposer that **crosses tiers** — every prior
 * decomposer produced only Tier 1 atoms.
 *
 * Phase A.4 of `docs/cold-start-convergence-plan.md`. Peer of
 * `decomposeScreenElements`, `decomposeScreenHints`, and
 * `decomposeScreenPostures`. Same catamorphism idiom, same
 * fingerprint-independent-from-provenance property, same stable
 * lex ordering — but with a tier-aware output bag instead of a
 * flat atom array.
 *
 * **Source-agnostic construction seam — the interop contract.**
 *
 * This decomposer is deliberately **not tied to YAML**. The caller
 * passes a parsed-and-typed `RouteKnowledgeManifest`; whether that
 * manifest came from YAML parsing or from a live DOM harvest via
 * `harvestDeclaredRoutes` at
 * `lib/infrastructure/tooling/harvest-routes.ts` (§ 16.4 of
 * canon-and-derivation) is the caller's concern, not the
 * decomposer's. The existing `HarvestManifest` type alias in
 * `lib/domain/intent/routes.ts:69` is literally `RouteKnowledgeManifest`
 * renamed — the domain recognized this unification before the
 * decomposer did.
 *
 * This is how the **cold-start ↔ warm-start interop contract** from
 * `docs/canon-and-derivation.md` § 8.1 is enforced at the atom
 * level: one typed input shape (`RouteKnowledgeManifest`), one
 * decomposer, two call sites.
 *
 *   hand-authored YAML           live DOM harvest
 *          │                            │
 *          ▼                            ▼
 *   parse + validate            harvestDeclaredRoutes
 *          │                            │
 *          └────────────┬───────────────┘
 *                       ▼
 *         RouteKnowledgeManifest (typed)
 *                       │
 *                       ▼
 *            decomposeRouteKnowledge
 *                       │
 *                       ▼
 *   atoms + composition with source = 'agentic-override'
 *                          (YAML path)
 *                 or = 'cold-derivation' (live harvest path)
 *
 * The `PhaseOutputSource` field on the envelope is how the catalog
 * distinguishes the two origins. The promotion gate then decides
 * which wins per `docs/canon-and-derivation.md` § 7. The fingerprint
 * is content-only (provenance-independent), so a cold derivation
 * that matches a hand-authored YAML byte-for-byte produces the same
 * `inputFingerprint` — which is exactly the tripwire the interop
 * contract needs.
 *
 * **Tier-crossing output shape (bag, not flat union).**
 *
 * Unlike the prior decomposers which return `readonly Atom<C, T>[]`,
 * this one returns a typed bag with three named fields:
 *
 *     {
 *       routeAtoms:   readonly Atom<'route', RouteAtomContent>[];
 *       variantAtoms: readonly Atom<'route-variant', RouteKnowledgeVariant>[];
 *       routeGraphs:  readonly Composition<'route-graph', RouteGraphCompositionContent>[];
 *     }
 *
 * The bag shape preserves type information at the return-site
 * (callers see the tier distinction in the type) and avoids the
 * `(Atom<AtomClass, unknown> | Composition<CompositionSubType, unknown>)[]`
 * erasure that a flat union would introduce. This is the template
 * future tier-crossing canon decomposers will copy.
 *
 * **Content shape derivation — no parallel types invented.**
 *
 * The Tier 1 Route atom's content is
 * `Omit<RouteKnowledgeRoute, 'variants'>`. The variants are split
 * into separate Tier 1 Route-variant atoms, so including them in
 * the Route atom's content would be duplication. `Omit<T, K>` is a
 * type-level derivation of the existing domain type — it is NOT a
 * parallel content shape. The field set is identical to
 * `RouteKnowledgeRoute` except that the `variants` field is
 * removed.
 *
 * The Tier 2 Route-graph composition's content is
 * `Omit<RouteKnowledgeManifest, 'routes' | 'kind' | 'version'>`.
 * The `routes` array is split into route atoms; `kind` and
 * `version` are addressing-level metadata (the manifest's identity
 * as a file, not its content as knowledge). The remaining fields
 * (`app`, `baseUrl`, `governance`) are the app-level metadata that
 * belong with the graph composition.
 *
 * Both derivations preserve the doctrinal rule from
 * `docs/canon-and-derivation.md` § 16.7: atom and composition
 * envelopes store existing domain types (or TypeScript-native
 * derivations of them) verbatim, never reinvent them.
 *
 * **Composition atom references — route atoms only.**
 *
 * The route-graph composition's `atomReferences` field points to
 * every route atom with `role: 'member'` and `order` equal to the
 * 0-indexed position in the sorted route list. The variant atoms
 * are intentionally NOT listed in the composition's references
 * because variants are addressable through the route they belong
 * to; including them would be redundant with the route→variant
 * addressing convention. Future enhancements (e.g. explicit route
 * transitions, graph edges) would add more references with
 * different `role` tags like `'transition-from'` / `'transition-to'`.
 *
 * **Ontology grounding.**
 *
 * Per `docs/domain-model.md` § Target, routes and route variants
 * are "navigation containers for targets" — they are themselves
 * stable referents that the epistemological loop operates on. The
 * decomposer positions them as Tier 1 atoms because their identity
 * persists across runs and their content is evidence-backed.
 *
 * Per `docs/domain-ontology.md`, the canonical home for route
 * knowledge today is `knowledge/routes/*.routes.yaml`; the
 * long-term home is one file per route atom plus one file per
 * variant atom plus one file per route-graph composition.
 *
 * Per `docs/domain-class-decomposition.md` § Target row, the
 * existing domain types are `RouteDefinition` / `RouteVariant` /
 * `RoutePattern` in the intent namespace. Today those are
 * spelled `RouteKnowledgeRoute` / `RouteKnowledgeVariant` /
 * `RouteKnowledgeManifest` after the unification that merged the
 * `Harvest*` aliases (see `lib/domain/intent/routes.ts:64-69`).
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/intent/routes` (the unified
 * manifest/route/variant types), and `lib/domain/kernel/hash`
 * (deterministic stringification + sha256). No Effect, no IO, no
 * mutation.
 */

import type {
  RouteKnowledgeManifest,
  RouteKnowledgeRoute,
  RouteKnowledgeVariant,
} from '../../domain/intent/routes';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type {
  RouteAtomAddress,
  RouteVariantAtomAddress,
} from '../../domain/pipeline/atom-address';
import type { Composition, AtomReference } from '../../domain/pipeline/composition';
import { composition } from '../../domain/pipeline/composition';
import type { RouteGraphCompositionAddress } from '../../domain/pipeline/composition-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { brandString } from '../../domain/kernel/brand';
import { stableStringify, sha256 } from '../../domain/kernel/hash';

// ─── Derived content types ───────────────────────────────────────

/** Route atom content: the route metadata with variants split out.
 *  Type-level derivation of the existing domain type — no parallel
 *  shape invented. The field set is identical to
 *  `RouteKnowledgeRoute` except that `variants` is removed. */
export type RouteAtomContent = Omit<RouteKnowledgeRoute, 'variants'>;

/** Route-graph composition content: the manifest-level metadata
 *  with the content that has been split into atoms and the
 *  addressing-level fields removed. Type-level derivation of the
 *  existing domain type. */
export type RouteGraphCompositionContent = Omit<
  RouteKnowledgeManifest,
  'routes' | 'kind' | 'version'
>;

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeRouteKnowledgeInput {
  /** The parsed-and-typed manifest. The caller is responsible for
   *  parsing the YAML (or consuming the live harvest output) and
   *  validating it against the existing route-knowledge schema
   *  before invoking the decomposer. */
  readonly content: RouteKnowledgeManifest;
  /** Which slot of the lookup chain the manifest came from. For
   *  files migrated from `dogfood/knowledge/routes/`, use
   *  `'agentic-override'`. For live harvest output, use
   *  `'cold-derivation'` or `'live-derivation'`. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). For the
   *  one-shot migration script, use a constant like
   *  `'canon-decomposer:route-knowledge:v1'` so re-runs of the
   *  same script version produce identical provenance. */
  readonly producedBy: string;
  /** ISO timestamp the decomposition was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── Output shape (tier-crossing bag) ───────────────────────────

/** The tier-crossing output of the route-knowledge decomposer. The
 *  bag preserves the tier distinction at the type level so callers
 *  cannot confuse atoms with compositions. Future tier-crossing
 *  canon decomposers should follow the same bag-shape template. */
export interface DecomposeRouteKnowledgeOutput {
  readonly routeAtoms: readonly Atom<'route', RouteAtomContent>[];
  readonly variantAtoms: readonly Atom<'route-variant', RouteKnowledgeVariant>[];
  readonly routeGraphs: readonly Composition<'route-graph', RouteGraphCompositionContent>[];
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `RouteKnowledgeManifest` into:
 *
 *   - one route atom per `manifest.routes` entry
 *   - one route-variant atom per `(route, variant)` pair
 *   - one route-graph composition referencing every route atom
 *
 *  Pure function: same input → same output (including fingerprints).
 *  Routes are sorted by id (lexicographic); variants within each
 *  route are sorted by id (lexicographic); the composition's
 *  `atomReferences` field lists the route atoms in the same sorted
 *  order so the composition's fingerprint is also stable across
 *  input iteration-order variations.
 *
 *  The function follows the same catamorphism shape as the prior
 *  canon decomposers. No mutation, no early return, no `let`. The
 *  cross-tier structure is expressed by returning a typed bag
 *  instead of a flat union.
 */
export function decomposeRouteKnowledge(
  input: DecomposeRouteKnowledgeInput,
): DecomposeRouteKnowledgeOutput {
  // Stable sort of routes by id so the decomposition is
  // deterministic regardless of YAML parser insertion order.
  const sortedRoutes = [...input.content.routes].sort((left, right) =>
    (left.id as string).localeCompare(right.id as string),
  );

  // Route atoms: one per route, carrying the route metadata without
  // the variants array.
  const routeAtoms: readonly Atom<'route', RouteAtomContent>[] = sortedRoutes.map(
    (route) => {
      const address: RouteAtomAddress = { class: 'route', id: route.id };
      const { variants: _variants, ...routeMetadata } = route;
      const content: RouteAtomContent = routeMetadata;
      const inputFingerprint = `sha256:${sha256(stableStringify({ address, content }))}`;
      return atom<'route', RouteAtomContent>({
        class: 'route',
        address,
        content,
        source: input.source,
        inputFingerprint,
        provenance: {
          producedBy: input.producedBy,
          producedAt: input.producedAt,
          pipelineVersion: input.pipelineVersion,
          inputs: [`route-knowledge:${input.content.app}`],
        },
      });
    },
  );

  // Route variant atoms: one per (route, variant) pair. The outer
  // sort from `sortedRoutes` provides stable outer ordering; the
  // inner sort on variant.id provides stable inner ordering.
  const variantAtoms: readonly Atom<'route-variant', RouteKnowledgeVariant>[] =
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
        const inputFingerprint = `sha256:${sha256(
          stableStringify({ address, content: variant }),
        )}`;
        return atom<'route-variant', RouteKnowledgeVariant>({
          class: 'route-variant',
          address,
          content: variant,
          source: input.source,
          inputFingerprint,
          provenance: {
            producedBy: input.producedBy,
            producedAt: input.producedAt,
            pipelineVersion: input.pipelineVersion,
            // Two inputs: the manifest-level tag and the narrower
            // route-scoped tag. The demotion machinery marks this
            // variant as a candidate when EITHER upstream changes.
            inputs: [
              `route-knowledge:${input.content.app}`,
              `route-knowledge:${input.content.app}:${route.id}`,
            ],
          },
        });
      });
    });

  // Route-graph composition: one per manifest. Uses `app` as the
  // RouteGraphId so the composition's identity tracks the app
  // identity in the manifest. The `atomReferences` field lists the
  // route atoms in sorted order with a positional `order` hint.
  const graphAddress: RouteGraphCompositionAddress = {
    subType: 'route-graph',
    id: brandString<'RouteGraphId'>(input.content.app),
  };
  const graphContent: RouteGraphCompositionContent = {
    app: input.content.app,
    baseUrl: input.content.baseUrl,
    governance: input.content.governance,
  };
  const atomReferences: readonly AtomReference[] = routeAtoms.map((a, index) => ({
    address: a.address,
    role: 'member',
    order: index,
  }));
  const graphInputFingerprint = `sha256:${sha256(
    stableStringify({
      address: graphAddress,
      content: graphContent,
      atomReferences: atomReferences.map((ref) => ({
        address: ref.address,
        role: ref.role,
        order: ref.order,
      })),
    }),
  )}`;
  const routeGraph = composition<'route-graph', RouteGraphCompositionContent>({
    subType: 'route-graph',
    address: graphAddress,
    content: graphContent,
    atomReferences,
    source: input.source,
    inputFingerprint: graphInputFingerprint,
    provenance: {
      producedBy: input.producedBy,
      producedAt: input.producedAt,
      pipelineVersion: input.pipelineVersion,
      inputs: [`route-knowledge:${input.content.app}`],
    },
  });

  return {
    routeAtoms,
    variantAtoms,
    routeGraphs: [routeGraph],
  };
}
