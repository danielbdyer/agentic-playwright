/**
 * Pure decomposer: ScreenElements → readonly Atom<'element', ElementSig>[]
 *
 * Per `docs/canon-and-derivation.md` § 3.6 Tier 1 — Atoms and § 11
 * classification table, every existing
 * `dogfood/knowledge/screens/{screen}.elements.yaml` file is a
 * canonical-artifact (hybrid compound) that should be decomposed
 * into per-element atom files at
 * `.canonical-artifacts/{agentic|deterministic}/atoms/elements/{screen}/{element}.yaml`.
 *
 * This is the first concrete piece of Phase A of
 * `docs/cold-start-convergence-plan.md`. It is a peer of
 * `decomposeDiscoveryRun` at
 * `lib/application/discovery/decompose-discovery-run.ts`.
 *
 * **Structure after the mint-helper refactor.** The decomposer is
 * now a pure fan-out function that returns `AtomCandidate`s; the
 * envelope construction (fingerprint, provenance, source threading)
 * happens in `mintAtoms` from `./minting`. Every canon decomposer
 * follows this pattern: variant fan-out, invariant mint.
 *
 * **Type reuse — no parallel content shapes.** Per
 * `docs/domain-class-decomposition.md` § Target row, the existing
 * domain types `ScreenElements` and `ElementSig` (defined at
 * `lib/domain/knowledge/types.ts:167-183`) ARE the element atom's
 * canonical content shape. Per `docs/canon-and-derivation.md`
 * § 16.7 ("Already-existing types that map to atoms"), the atom
 * envelope stores instances of those existing types — it does NOT
 * reinvent them.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § The Epistemological Loop, Target and Surface sit OUTSIDE the
 * loop — they are the stable referents the loop operates on. The
 * element atoms produced here are exactly those stable referents
 * in their persistent canonical form. Decomposition is not a
 * transformation of meaning — it is a change of addressing
 * granularity from "the screen.elements.yaml file" to "the
 * (screen, element) tuple."
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Element,
 * an element's canonical home is
 * `knowledge/screens/{screen}.elements.yaml` today; the long-term
 * canonical home (post-decomposition) is one file per element atom
 * under the canonical-artifact store.
 *
 * Pure application — depends only on `lib/application/canon/minting`
 * (shared envelope machinery), `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`ScreenElements`,
 * `ElementSig`), and `lib/domain/kernel/identity` (id constructors).
 * No Effect, no IO, no mutation.
 */

import type { ScreenElements, ElementSig } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { ElementAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { createElementId } from '../../domain/kernel/identity';
import {
  mintAtoms,
  producerFrom,
  type AtomCandidate,
} from './minting';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenElementsInput {
  readonly content: ScreenElements;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Fan-out (the variant part) ─────────────────────────────────

/** Pure fan-out: `ScreenElements` → per-element atom candidates.
 *  No fingerprint, no provenance, no envelope construction — just
 *  the shape transformation. Stable lexicographic order by element
 *  id so the output is deterministic regardless of the YAML
 *  parser's iteration order. Exported for tests that want to
 *  exercise the fan-out in isolation. */
export function fanOutScreenElements(
  content: ScreenElements,
): readonly AtomCandidate<'element', ElementSig>[] {
  const screen = content.screen;
  const sortedEntries = Object.entries(content.elements).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );
  return sortedEntries.map(([elementIdString, sig]) => {
    const address: ElementAtomAddress = {
      class: 'element',
      screen,
      element: createElementId(elementIdString),
    };
    return {
      address,
      content: sig,
      inputs: [`screen-elements:${screen}`],
    };
  });
}

// ─── Public decomposer (fan-out + mint) ─────────────────────────

/** Decompose a `ScreenElements` hybrid into a flat list of element
 *  atom envelopes — one per entry in `content.elements`.
 *
 *  Pure function: same input → same output. Equivalent to
 *  `mintAtoms(producerFrom(input), fanOutScreenElements(input.content))`.
 */
export function decomposeScreenElements(
  input: DecomposeScreenElementsInput,
): readonly Atom<'element', ElementSig>[] {
  return mintAtoms(producerFrom(input), fanOutScreenElements(input.content));
}
