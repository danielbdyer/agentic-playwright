/**
 * Pure decomposer: DiscoveryRun → readonly Atom<AtomClass, unknown>[]
 *
 * Per docs/canon-and-derivation.md § 3.6 Tier 1 — Atoms, every fact
 * about the SUT that the pipeline relies on at runtime should be
 * addressable as an atom. The existing discovery code returns a
 * single `DiscoveryRun` manifest containing arrays of multiple
 * facts (surfaces, elements, selectors, snapshot, transitions,
 * observation predicates). The decomposer transforms the manifest
 * into a flat list of typed Atom<C, T> envelopes — one per fact.
 *
 * Design pattern: catamorphism (structural fold) over the
 * DiscoveryRun shape. Each per-class extraction is a small,
 * named, pure function — `Extractor<TSlice>` — that takes a slice
 * of the run plus a context and returns a readonly array of typed
 * atoms. The main decomposer is the monoid concatenation of every
 * extractor's output. There is no mutable accumulator, no `let`,
 * no early return, no imperative `for...push`.
 *
 * The atom classes this decomposer can produce:
 *
 *   - 'screen'                — one atom per discovered screen
 *   - 'surface'               — one atom per DiscoveryObservedSurface
 *   - 'element'               — one atom per DiscoveryObservedElement
 *   - 'selector'              — one atom per selector probe (with element)
 *   - 'snapshot'              — one atom per snapshotHash (when present)
 *   - 'transition'            — one atom per TransitionObservation
 *   - 'observation-predicate' — one atom per state observation
 *
 * Other atom classes (route, route-variant, posture, affordance,
 * pattern, drift-mode, resolution-override, posture-sample) come
 * from different surfaces and live in their own decomposers.
 *
 * Pure application — depends on product/domain/pipeline (typed
 * envelopes) and product/domain/target/interface-graph (DiscoveryRun
 * shape). No Effect, no IO, no mutation.
 */

import type { DiscoveryRun, TransitionObservation } from '../../domain/target/interface-graph';
import type { Atom, AtomProvenance } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import type { AtomClass } from '../../domain/pipeline/atom-address';
import { asFingerprint, type Fingerprint } from '../../domain/kernel/hash';
import { brandString } from '../../domain/kernel/brand';

// ─── Public API ─────────────────────────────────────────────────

/** Generic atom alias for the decomposer's flat output. The
 *  TypeScript variance on `Atom<C, T, Src>` requires an `unknown`
 *  cast at the extractor boundary; that cast is contained inside
 *  this module via `widenAtom`. The source is wide because the
 *  discovery decomposer materializes atoms from multiple phases
 *  of the discovery run. */
export type AnyAtom = Atom<AtomClass, unknown, PhaseOutputSource>;

export interface DecomposeDiscoveryRunInput {
  readonly run: DiscoveryRun;
  /** Stable identifier for the producer (atom provenance). */
  readonly producedBy: string;
  /** ISO timestamp the run was performed at. Defaults to the
   *  run's `discoveredAt` field. */
  readonly producedAt?: string;
  /** Optional pipeline version (commit SHA). */
  readonly pipelineVersion?: string;
}

/** Decompose a DiscoveryRun into a flat list of atom envelopes.
 *  Pure function: same input → same output. */
export function decomposeDiscoveryRun(
  input: DecomposeDiscoveryRunInput,
): readonly AnyAtom[] {
  const ctx: ExtractorContext = {
    run: input.run,
    inputFingerprint: asFingerprint('atom-input', `sha256:discovery-run:${input.run.runId}`),
    provenance: {
      producedBy: input.producedBy,
      producedAt: input.producedAt ?? input.run.discoveredAt,
      pipelineVersion: input.pipelineVersion,
      inputs: [
        input.run.routeVariantRef,
        input.run.url,
        input.run.snapshotHash,
      ],
    },
  };

  // Catamorphism: fold over the run by concatenating per-class
  // extractor outputs. Each extractor is a pure function from
  // (run, ctx) to a readonly array of atoms. The order of
  // extractors in EXTRACTORS determines the order of atoms in
  // the result, which is stable for downstream consumers.
  return EXTRACTORS.flatMap((extract) => extract(ctx));
}

// ─── Class-filtered convenience helpers ──────────────────────────

/** Return only atoms of a given class from a decomposed run. */
export function atomsOfClass(
  decomposed: readonly AnyAtom[],
  cls: AtomClass,
): readonly AnyAtom[] {
  return decomposed.filter((a) => a.class === cls);
}

/** Group decomposed atoms by their class via fold. O(n) total —
 *  uses transient mutation encapsulated inside the reducer's
 *  closure (the standard FP "transient internal, persistent
 *  external" idiom). The returned Map is typed as ReadonlyMap
 *  with ReadonlyArray values; callers must not mutate the result
 *  even though the implementation builds it via push. */
export function groupAtomsByClass(
  decomposed: readonly AnyAtom[],
): ReadonlyMap<AtomClass, readonly AnyAtom[]> {
  return decomposed.reduce<Map<AtomClass, AnyAtom[]>>((acc, a) => {
    const existing = acc.get(a.class);
    if (existing === undefined) {
      acc.set(a.class, [a]);
    } else {
      existing.push(a);
    }
    return acc;
  }, new Map<AtomClass, AnyAtom[]>());
}

// ─── Extractor framework (private) ───────────────────────────────
//
// An Extractor is a pure function from a context (the run plus
// shared metadata) to a readonly array of atoms. Each per-class
// extractor is a single named function — visitor-pattern style —
// that knows how to project its slice of the run into typed atoms.
// The main decomposer is the monoid concat of all registered
// extractors.

interface ExtractorContext {
  readonly run: DiscoveryRun;
  readonly inputFingerprint: Fingerprint<'atom-input'>;
  readonly provenance: AtomProvenance;
}

type Extractor = (ctx: ExtractorContext) => readonly AnyAtom[];

/** Widen a typed atom to the variance-erased AnyAtom. The cast is
 *  contained in this single helper so the rest of the module
 *  reads as type-safe. */
function widenAtom<C extends AtomClass, T, Src extends PhaseOutputSource>(
  typed: Atom<C, T, Src>,
): AnyAtom {
  return typed as unknown as AnyAtom;
}

// ─── Per-class extractors ────────────────────────────────────────

const extractScreen: Extractor = ({ run, inputFingerprint, provenance }) => [
  widenAtom(
    atom({
      class: 'screen',
      address: { class: 'screen', screen: run.screen },
      content: {
        screen: run.screen,
        url: run.url,
        title: run.title,
        rootSelector: run.rootSelector,
        snapshotHash: run.snapshotHash,
        sectionCount: run.sections.length,
      },
      source: 'cold-derivation',
      inputFingerprint,
      provenance,
    }),
  ),
];

const extractSurfaces: Extractor = ({ run, inputFingerprint, provenance }) =>
  run.surfaces.map((surface) =>
    widenAtom(
      atom({
        class: 'surface',
        address: { class: 'surface', screen: run.screen, surface: surface.id },
        content: {
          id: surface.id,
          targetRef: surface.targetRef,
          section: surface.section,
          selector: surface.selector,
          role: surface.role,
          name: surface.name,
          kind: surface.kind,
          assertions: surface.assertions,
          testId: surface.testId,
        },
        source: 'cold-derivation',
        inputFingerprint,
        provenance,
      }),
    ),
  );

const extractElements: Extractor = ({ run, inputFingerprint, provenance }) =>
  run.elements.map((element) =>
    widenAtom(
      atom({
        class: 'element',
        address: { class: 'element', screen: run.screen, element: element.id },
        content: {
          id: element.id,
          targetRef: element.targetRef,
          surface: element.surface,
          selector: element.selector,
          role: element.role,
          name: element.name,
          testId: element.testId,
          widget: element.widget,
          required: element.required,
          locatorHint: element.locatorHint,
          locatorCandidates: element.locatorCandidates,
        },
        source: 'cold-derivation',
        inputFingerprint,
        provenance,
      }),
    ),
  );

const extractSelectors: Extractor = ({ run, inputFingerprint, provenance }) =>
  // Selector address requires (screen, element, rung). Skip probes
  // with no element binding via flatMap returning [].
  run.selectorProbes.flatMap((probe) =>
    probe.element == null
      ? []
      : [
          widenAtom(
            atom({
              class: 'selector',
              address: {
                class: 'selector',
                screen: run.screen,
                element: probe.element,
                rung: probe.id,
              },
              content: {
                id: probe.id,
                selectorRef: probe.selectorRef,
                targetRef: probe.targetRef,
                graphNodeId: probe.graphNodeId,
                section: probe.section,
                strategy: probe.strategy,
                source: probe.source,
                variantRef: probe.variantRef,
                validWhenStateRefs: probe.validWhenStateRefs,
                invalidWhenStateRefs: probe.invalidWhenStateRefs,
              },
              source: 'cold-derivation',
              inputFingerprint,
              provenance,
            }),
          ),
        ],
  );

const extractSnapshot: Extractor = ({ run, inputFingerprint, provenance }) =>
  run.snapshotHash === ''
    ? []
    : [
        widenAtom(
          atom({
            class: 'snapshot',
            address: {
              class: 'snapshot',
              id: brandString<'SnapshotTemplateId'>(run.snapshotHash),
            },
            content: {
              screen: run.screen,
              rootSelector: run.rootSelector,
              snapshotHash: run.snapshotHash,
              anchors: run.snapshotAnchors,
            },
            source: 'cold-derivation',
            inputFingerprint,
            provenance,
          }),
        ),
      ];

const extractTransitions: Extractor = ({ run, inputFingerprint, provenance }) =>
  run.transitionObservations.map((transition: TransitionObservation) =>
    widenAtom(
      atom({
        class: 'transition',
        address: {
          class: 'transition',
          fromScreen: run.screen,
          toScreen: run.screen,
          trigger: transition.eventSignatureRef ?? 'unknown',
        },
        content: transition,
        source: 'cold-derivation',
        inputFingerprint,
        provenance,
      }),
    ),
  );

const extractObservationPredicates: Extractor = ({
  run,
  inputFingerprint,
  provenance,
}) =>
  run.stateObservations.map((obs) =>
    widenAtom(
      atom({
        class: 'observation-predicate',
        address: {
          class: 'observation-predicate',
          screen: run.screen,
          id: String(obs.stateRef),
        },
        content: {
          stateRef: obs.stateRef,
          source: obs.source,
          observed: obs.observed,
          detail: obs.detail,
        },
        source: 'cold-derivation',
        inputFingerprint,
        provenance,
      }),
    ),
  );

// ─── Extractor registry ──────────────────────────────────────────
//
// The order here determines the stable order of decomposed atoms.
// Adding a new extractor: write the function above, append it
// here. The catamorphism in `decomposeDiscoveryRun` picks it up
// automatically via the flatMap.

const EXTRACTORS: readonly Extractor[] = [
  extractScreen,
  extractSurfaces,
  extractElements,
  extractSelectors,
  extractSnapshot,
  extractTransitions,
  extractObservationPredicates,
];
