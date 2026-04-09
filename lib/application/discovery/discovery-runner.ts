/**
 * Discovery runner — typed interface for the cold-derivation slot
 * (slot 5) of the lookup chain.
 *
 * Per docs/canon-and-derivation.md § 9.1 The discovery engine, the
 * discovery engine takes canonical sources and produces phase
 * outputs from cold. Each runner is responsible for one DISCOVERY
 * SURFACE — a coherent unit of work that emits a manifest of
 * observed atoms. The decomposer (decompose-discovery-run.ts)
 * transforms the manifest into per-atom envelopes.
 *
 * The "fat surface" pattern: today the existing discovery code
 * (`discoverScreenScaffold` in lib/infrastructure/tooling/) returns
 * a single `DiscoveryRun` containing arrays of multiple atom
 * classes (screen, surface, element, selector, snapshot,
 * transition, observation-predicate). Per-atom-class extraction
 * happens in the decomposer, not at the runner boundary, because
 * decomposing inside the runner would force every existing surface
 * to be rewritten.
 *
 * The runner interface lives in the application layer because it
 * depends on `DiscoveryRun` from `lib/domain/target/interface-graph`.
 * The decomposer is pure.
 *
 * Slot 5 of the lookup chain stays stubbed in this commit. Phase 3
 * wires the runner registry to the lookup chain so cold mode can
 * actually invoke discovery.
 */

import type { Effect } from 'effect';
import type { ProjectPaths } from '../paths';
import type { DiscoveryRun } from '../../domain/target/interface-graph';
import type { Atom } from '../../domain/pipeline/atom';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import type { AtomClass } from '../../domain/pipeline/atom-address';

// ─── Runner identity ─────────────────────────────────────────────

/** Stable identifier for a discovery runner. Used in atom
 *  provenance (the `producedBy` field) and in the runner registry
 *  for routing requests by atom class. */
export type DiscoveryRunnerId = string;

/** Which discovery surface a runner wraps. The enumeration is
 *  intentionally narrow — adding a new surface (e.g. a new
 *  inspection tool, a different harvester) requires adding a
 *  variant here AND adding the corresponding adapter under
 *  `lib/application/discovery/`. */
export type DiscoverySurfaceKind =
  | 'screen-scaffold' // discoverScreenScaffold from infrastructure tooling
  | 'route-harvest'   // harvestDeclaredRoutes from infrastructure tooling
  | 'pattern-promotion' // future: pattern recurrence detection
  | 'snapshot-capture'  // future: ARIA snapshot capture
  | 'drift-detection';  // future: drift mode observation

// ─── Runner contract ─────────────────────────────────────────────

/** Inputs to a discovery runner invocation. Carries the addressing
 *  context (which screen, which route variant) so the runner knows
 *  what to crawl. */
export interface DiscoveryRunInput {
  /** The project paths object — runners need this to write
   *  artifact receipts and read configuration. */
  readonly paths: ProjectPaths;
  /** Optional context narrowing the run to a specific screen or
   *  route variant. When omitted, runners may execute against
   *  the entire workspace (e.g. harvest all routes). */
  readonly context?: {
    readonly screen?: string;
    readonly url?: string;
    readonly rootSelector?: string;
    readonly routeVariantRef?: string;
  };
}

/** The output of a discovery runner — a `DiscoveryRun` manifest
 *  plus metadata about which atom classes the runner is expected
 *  to produce. The decomposer converts the manifest into per-atom
 *  envelopes. */
export interface DiscoveryRunOutput {
  readonly run: DiscoveryRun;
  readonly producedClasses: readonly AtomClass[];
}

/** A discovery runner is an Effect that consumes inputs and yields
 *  a typed discovery output. The Effect requirements should be
 *  satisfied at the application layer (typically `FileSystem` plus
 *  any browser/fixture services the runner uses). */
export interface DiscoveryRunner<R = unknown, E = unknown> {
  readonly id: DiscoveryRunnerId;
  readonly surface: DiscoverySurfaceKind;
  readonly run: (input: DiscoveryRunInput) => Effect.Effect<DiscoveryRunOutput, E, R>;
}

// ─── Runner registry ─────────────────────────────────────────────

/** Maps an atom class to the runners capable of producing atoms of
 *  that class. The registry is used by the lookup chain's slot 5
 *  to find the right runner when a cold derivation is needed.
 *
 *  A single class may have multiple runners (e.g. both
 *  screen-scaffold and route-harvest produce element atoms);
 *  ordering encodes preference. */
export interface DiscoveryRunnerRegistry {
  /** Find runners that can produce atoms of the given class.
   *  Returns runners in preference order. */
  readonly runnersFor: (cls: AtomClass) => readonly DiscoveryRunner[];
  /** All registered runners, indexed by id. */
  readonly all: () => ReadonlyMap<DiscoveryRunnerId, DiscoveryRunner>;
}

/** Construct a registry from an unordered list of runners. The
 *  registry indexes them by their declared `producedClasses` so
 *  per-class lookups are O(1) for the producer set. */
export function createDiscoveryRunnerRegistry(
  runners: readonly DiscoveryRunner[],
  /** Per-runner declaration of which atom classes they produce.
   *  Provided as a separate parameter rather than baked into the
   *  runner because the producedClasses field on DiscoveryRunOutput
   *  is per-invocation and depends on what the run actually
   *  observed. The registry uses static declarations for routing. */
  producesByRunnerId: ReadonlyMap<DiscoveryRunnerId, readonly AtomClass[]>,
): DiscoveryRunnerRegistry {
  const byClass = new Map<AtomClass, DiscoveryRunner[]>();
  for (const runner of runners) {
    const classes = producesByRunnerId.get(runner.id) ?? [];
    for (const cls of classes) {
      const existing = byClass.get(cls) ?? [];
      existing.push(runner);
      byClass.set(cls, existing);
    }
  }
  const indexedById = new Map(runners.map((r) => [r.id, r] as const));
  return {
    runnersFor: (cls) => byClass.get(cls) ?? [],
    all: () => indexedById,
  };
}

/** Look up the atom (suppress unused warning when consumers don't
 *  destructure all helpers). */
export type _AtomReference = Atom<AtomClass, unknown, PhaseOutputSource>;
