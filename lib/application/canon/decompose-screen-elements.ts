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
 * `lib/application/discovery/decompose-discovery-run.ts` — same
 * shape, different input type. The two together are the start of
 * the Tier 1 atom decomposition fan-in: `decomposeDiscoveryRun`
 * fans out a fresh discovery observation into atoms (slot 5 cold
 * derivation), `decomposeScreenElements` fans out an existing
 * hybrid file into atoms (slot 2 agentic override or slot 3
 * deterministic observation, depending on which directory the
 * hybrid lived in).
 *
 * **Type reuse — no parallel content shapes.** Per
 * `docs/domain-class-decomposition.md` § Target row, the existing
 * domain types `ScreenElements` and `ElementSig` (defined at
 * `lib/domain/knowledge/types.ts:167-183`) ARE the element atom's
 * canonical content shape. Per `docs/canon-and-derivation.md`
 * § 16.7 ("Already-existing types that map to atoms"), the atom
 * envelope stores instances of those existing types — it does NOT
 * reinvent them. This decomposer respects that rule: the
 * `Atom<'element', ElementSig>` instances it produces carry the
 * existing `ElementSig` shape verbatim as their content.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § The Epistemological Loop, Target and Surface sit OUTSIDE the
 * loop — they are the stable referents the loop operates on. The
 * element atoms produced here are exactly those stable referents
 * in their persistent canonical form; they participate in the
 * lookup chain (slots 2/3 of `lib/domain/pipeline/lookup-chain.ts`)
 * as the ground the resolution loop stands on. Decomposition is
 * therefore not a transformation of meaning — it is a change of
 * addressing granularity from "the screen.elements.yaml file" to
 * "the (screen, element) tuple."
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Element,
 * an element's canonical home is
 * `knowledge/screens/{screen}.elements.yaml` today; the long-term
 * canonical home (post-decomposition) is one file per element atom
 * under the canonical-artifact store. The element's identity tuple
 * (`(ScreenId, ElementId)`) and its `ElementSig` content are
 * unchanged across the decomposition.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`ScreenElements`,
 * `ElementSig`), `lib/domain/kernel/identity` (id constructors),
 * and `lib/domain/kernel/hash` (deterministic stringification + sha256).
 * No Effect, no IO, no mutation.
 */

import type { ScreenElements, ElementSig } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { ElementAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { stableStringify, sha256 } from '../../domain/kernel/hash';
import { createElementId } from '../../domain/kernel/identity';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenElementsInput {
  /** The parsed-and-typed hybrid file content. The caller is
   *  responsible for parsing the YAML and validating it against
   *  the existing knowledge schema before invoking the decomposer. */
  readonly content: ScreenElements;
  /** Which slot of the lookup chain the hybrid file came from. For
   *  files migrated from `dogfood/knowledge/screens/`, this should
   *  be `'agentic-override'` because the existing files are
   *  hand-authored canonical artifacts. Discovery-engine output
   *  would use `'cold-derivation'` or `'live-derivation'`. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). For the
   *  one-shot migration script, use a constant like
   *  `'canon-decomposer:screen-elements:v1'` so re-runs of the
   *  same script version produce identical provenance. */
  readonly producedBy: string;
  /** ISO timestamp the migration was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `ScreenElements` hybrid into a flat list of element
 *  atom envelopes — one per entry in `content.elements`.
 *
 *  Pure function: same input → same output. The output is ordered
 *  by element identifier (lexicographic) so the decomposition is
 *  stable across runs and across machines. Stability matters for
 *  promotion-gate inputs: the migration script may re-run, and a
 *  re-run that produces atoms in a different order would produce
 *  a different content fingerprint and trigger a spurious
 *  promotion event.
 *
 *  The function follows the same shape as `decomposeDiscoveryRun`
 *  at `lib/application/discovery/decompose-discovery-run.ts:66-90`:
 *  pure catamorphism over the input, no mutation, no early return,
 *  no `let`. The two together are intentionally pattern-matched so
 *  future readers see one decomposition pattern, not two.
 */
export function decomposeScreenElements(
  input: DecomposeScreenElementsInput,
): readonly Atom<'element', ElementSig>[] {
  const screen = input.content.screen;

  // Sort by element identifier so the output order is stable
  // across runs. `Object.entries` does not guarantee order in
  // older spec interpretations and the input may have been
  // produced by a YAML parser whose order depends on parsing
  // implementation details.
  const sortedEntries = Object.entries(input.content.elements).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );

  return sortedEntries.map(([elementIdString, sig]) => {
    const address: ElementAtomAddress = {
      class: 'element',
      screen,
      element: createElementId(elementIdString),
    };
    // Fingerprint = stable hash of the (address, content) pair.
    // We deliberately exclude provenance fields (producedAt,
    // producedBy) from the fingerprint so that re-running the
    // decomposer with the same content but a different timestamp
    // produces the same fingerprint and does not trigger spurious
    // promotion events.
    const inputFingerprint = `sha256:${sha256(stableStringify({ address, content: sig }))}`;
    return atom<'element', ElementSig>({
      class: 'element',
      address,
      content: sig,
      source: input.source,
      inputFingerprint,
      provenance: {
        producedBy: input.producedBy,
        producedAt: input.producedAt,
        pipelineVersion: input.pipelineVersion,
        // The single input to this atom is the screen-elements
        // hybrid file it came from. Encoded as a stable reference
        // string so the demotion machinery can know which atoms
        // become candidates when the upstream hybrid changes.
        inputs: [`screen-elements:${screen}`],
      },
    });
  });
}
