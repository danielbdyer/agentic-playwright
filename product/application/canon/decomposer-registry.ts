/**
 * Canon Decomposer Registry — compile-time-exhaustive map from
 * AtomClass to the decomposer function (or null stub) that
 * materializes atoms of that class from hybrid knowledge files.
 *
 * Adding a new AtomClass to the ATOM_CLASSES enumeration without
 * registering a decomposer (or null stub) here is a TypeScript
 * error via the mapped-type shape.
 *
 * This mirrors the PIPELINE_VISITORS and AtomPromotionGateRegistry
 * patterns: one entry per variant, exhaustiveness enforced by the
 * compiler.
 *
 * The registry is consumed by:
 *   - the discovery engine, when it needs to convert fat observation
 *     surfaces (e.g. a discovered screen's raw element list) into
 *     per-atom envelopes
 *   - the catalog loader, when it tags reference-canon entries with
 *     their canonical atom addresses during load
 *
 * NOTE (2026-04-10): An earlier version of this comment pointed at
 * `scripts/decompose-canon.ts` as a consumer. That script was
 * deprecated and deleted as part of the reference-canon reframe;
 * see `docs/canon-and-derivation.md` §§ 3.2a and 11.1 for the
 * reasoning. The decomposer functions themselves are kept because
 * they are useful independent of the retired migration script.
 *
 * Pure domain vocabulary — no Effect, no IO.
 *
 * @see docs/cold-start-convergence-plan.md § 4.A (reframed)
 */

import type { AtomClass } from '../../domain/pipeline/atom-address';

// ─── Decomposer shape ──────────────────────────────────────────

/** A canon decomposer takes a knowledge source and produces atoms
 *  of one specific class. The exact input/output types vary per
 *  class, so the registry types the decomposer as a tagged
 *  descriptor rather than a uniform function signature.
 *
 *  `null` means no decomposer exists for this class yet. The
 *  registry entry is present (so the exhaustiveness check passes)
 *  but the value signals "not yet implemented." */
export interface DecomposerDescriptor<C extends AtomClass> {
  /** The atom class this decomposer handles. */
  readonly class: C;
  /** Human-readable description of the source kind this decomposer
   *  reads (e.g., '*.elements.yaml', 'discovery-run'). */
  readonly sourceDescription: string;
  /** The module path that contains the decomposer function, relative
   *  to product/application/canon/. Used for documentation and tooling. */
  readonly modulePath: string;
  /** The decomposer function's export name. */
  readonly functionName: string;
}

// ─── Registry ───────────────────────────────────────────────────

/** Compile-time-exhaustive registry over AtomClass. Adding a new
 *  atom class without an entry is a type error. */
export type CanonDecomposerRegistry = {
  readonly [C in AtomClass]: DecomposerDescriptor<C> | null;
};

/** The canonical registry instance. `null` entries are stubs
 *  awaiting decomposer implementations as the convergence plan
 *  progresses. */
export const CANON_DECOMPOSERS: CanonDecomposerRegistry = {
  // ─── Implemented (Phase A slices 1-7) ───
  'element': {
    class: 'element',
    sourceDescription: '*.elements.yaml + *.hints.yaml (hints supersede elements)',
    modulePath: 'decompose-screen-elements.ts + decompose-screen-hints.ts',
    functionName: 'decomposeScreenElements / decomposeScreenHints',
  },
  'posture': {
    class: 'posture',
    sourceDescription: '*.postures.yaml',
    modulePath: 'decompose-screen-postures.ts',
    functionName: 'decomposeScreenPostures',
  },
  'surface': {
    class: 'surface',
    sourceDescription: '*.surface.yaml',
    modulePath: 'decompose-screen-surfaces.ts',
    functionName: 'decomposeScreenSurfaces',
  },
  'pattern': {
    class: 'pattern',
    sourceDescription: '*.patterns.yaml',
    modulePath: 'decompose-patterns.ts',
    functionName: 'decomposePatterns',
  },
  'route': {
    class: 'route',
    sourceDescription: '*.routes.yaml',
    modulePath: 'decompose-route-knowledge.ts',
    functionName: 'decomposeRouteKnowledge (routeAtoms)',
  },
  'route-variant': {
    class: 'route-variant',
    sourceDescription: '*.routes.yaml',
    modulePath: 'decompose-route-knowledge.ts',
    functionName: 'decomposeRouteKnowledge (variantAtoms)',
  },
  'snapshot': {
    class: 'snapshot',
    sourceDescription: 'knowledge/snapshots/**/*.yaml',
    modulePath: 'decompose-snapshots.ts',
    functionName: 'decomposeSnapshots',
  },

  // ─── Not yet implemented (future convergence phases) ───
  'screen': null,            // screen-level atoms (Phase A+)
  'affordance': null,        // role-affordance atoms (Phase E)
  'selector': null,          // selector-probe atoms (discovery)
  'transition': null,        // state-transition atoms (Phase A item 5)
  'observation-predicate': null, // state-observation predicates (Phase E)
  'drift-mode': null,        // drift-mode atoms (Phase D)
  'resolution-override': null,   // per-step resolution overrides
  'posture-sample': null,    // posture sample atoms
};

/** The set of atom classes that have a registered decomposer. */
export const IMPLEMENTED_DECOMPOSER_CLASSES: readonly AtomClass[] =
  (Object.entries(CANON_DECOMPOSERS) as readonly [AtomClass, DecomposerDescriptor<AtomClass> | null][])
    .filter(([, descriptor]) => descriptor !== null)
    .map(([cls]) => cls);

/** Check whether a given atom class has a decomposer. */
export function hasDecomposer(cls: AtomClass): boolean {
  return CANON_DECOMPOSERS[cls] !== null;
}
