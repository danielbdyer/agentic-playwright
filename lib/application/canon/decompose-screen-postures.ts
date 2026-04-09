/**
 * Pure decomposer: ScreenPostures → readonly Atom<'posture', Posture>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table, every
 * `dogfood/knowledge/screens/{screen}.postures.yaml` file is a
 * canonical artifact (not a hybrid — this one is clean) whose
 * long-term form is one atom per `(screen, element, posture)`
 * triple under
 * `.canonical-artifacts/{agentic|deterministic}/atoms/postures/{screen}/{element}/{posture}.yaml`.
 *
 * Phase A.3 of `docs/cold-start-convergence-plan.md`. Peer of
 * `decomposeScreenElements` and `decomposeScreenHints`. Same shape
 * (pure catamorphism, stable lex ordering, fingerprint independent
 * of provenance), same codebase idiom. Third canon decomposer.
 *
 * **Single-class output.** Unlike the screen-hints hybrid that
 * carries data destined for multiple atom classes, the postures
 * file is cleanly single-class per the § 11 classification table:
 *
 *     `dogfood/knowledge/screens/*.postures.yaml` →
 *     atoms/postures/{screen}/{element}/{posture}.yaml
 *
 * Posture-sample atoms (a separate Tier 1 class per
 * `atom-address.ts:139-144`) are NOT produced here. They come from
 * `dogfood/controls/datasets/*.dataset.yaml` via a separate
 * decomposer (a future Phase A slice). Posture content includes a
 * `values` field as part of the existing `Posture` domain type;
 * that field travels with the posture atom unchanged. The
 * posture-sample class exists as a peer for operator-provided
 * explicit sample data that may override or augment the values
 * baked into the posture definition.
 *
 * **Nested iteration order.** `ScreenPostures.postures` is a
 * nested map — outer key is element id, inner key is posture name
 * (`'valid'`, `'invalid'`, `'empty'`, `'boundary'`). The
 * catamorphism iterates both levels and sorts lexicographically
 * at each level, so the output is deterministic regardless of
 * YAML parser insertion order. The sort happens outer-first so
 * atoms for the same element cluster together in the output.
 *
 * **Type reuse — no parallel content shapes.** Per
 * `docs/domain-class-decomposition.md` § Posture row, the existing
 * domain type `Posture` (defined at
 * `lib/domain/knowledge/types.ts:355-358` with `values` and
 * `effects`) IS the posture atom's canonical content shape. Per
 * `docs/canon-and-derivation.md` § 16.7, the atom envelope stores
 * existing domain types verbatim — it does NOT reinvent them.
 * This decomposer respects that rule.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § Target gravitational well, postures are behavioral dispositions
 * of a target — they describe how the target behaves under
 * exercise, not what the target IS. Postures therefore sit slightly
 * inside the epistemological loop (they are knowledge about
 * behavior) but they are addressed by the stable referent's
 * identity tuple extended with the posture-name discriminator. The
 * decomposer anchors each posture atom to `(screen, element,
 * posture)` exactly as the doctrine prescribes.
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Posture,
 * a posture's canonical home today is
 * `knowledge/screens/{screen}.postures.yaml`; the long-term home
 * (post-decomposition) is one file per posture atom. The posture's
 * identity tuple `(ScreenId, ElementId, PostureId)` and its
 * `Posture` content are unchanged across the decomposition.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`ScreenPostures`,
 * `Posture`), `lib/domain/kernel/identity` (id constructors), and
 * `lib/domain/kernel/hash` (deterministic stringification + sha256).
 * No Effect, no IO, no mutation.
 */

import type { ScreenPostures, Posture } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { PostureAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { stableStringify, sha256 } from '../../domain/kernel/hash';
import { createElementId, createPostureId } from '../../domain/kernel/identity';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenPosturesInput {
  /** The parsed-and-typed hybrid file content. The caller is
   *  responsible for parsing the YAML and validating it against
   *  the existing knowledge schema before invoking the decomposer. */
  readonly content: ScreenPostures;
  /** Which slot of the lookup chain the hybrid file came from. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). */
  readonly producedBy: string;
  /** ISO timestamp the migration was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `ScreenPostures` file into a flat list of posture
 *  atom envelopes — one per `(element, posture-name)` pair in
 *  `content.postures`.
 *
 *  Pure function: same input → same output. The output is ordered
 *  primarily by element identifier and secondarily by posture name,
 *  both lexicographic. The double sort ensures determinism
 *  regardless of YAML parser insertion order at either level.
 *
 *  The function follows the same catamorphism shape as
 *  `decomposeScreenElements` and `decomposeScreenHints`: no
 *  mutation, no early return, no `let`, flatMap over the sorted
 *  outer entries. The three together are intentionally
 *  pattern-matched so future readers see one decomposition idiom.
 */
export function decomposeScreenPostures(
  input: DecomposeScreenPosturesInput,
): readonly Atom<'posture', Posture>[] {
  const screen = input.content.screen;

  // Outer sort: by element id.
  const sortedElements = Object.entries(input.content.postures).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );

  return sortedElements.flatMap(([elementIdString, posturesForElement]) => {
    // Inner sort: by posture name, so two runs over the same
    // ScreenPostures produce atoms in the same order even if the
    // YAML parser yields inner keys in different orders.
    const sortedPostures = Object.entries(posturesForElement).sort(
      ([leftName], [rightName]) => leftName.localeCompare(rightName),
    );

    return sortedPostures.map(([postureNameString, posture]) => {
      const address: PostureAtomAddress = {
        class: 'posture',
        screen,
        element: createElementId(elementIdString),
        posture: createPostureId(postureNameString),
      };
      // Fingerprint = stable hash of (address, content). Provenance
      // is deliberately excluded so the migration script can
      // re-run without triggering spurious promotion events.
      const inputFingerprint = `sha256:${sha256(stableStringify({ address, content: posture }))}`;
      return atom<'posture', Posture>({
        class: 'posture',
        address,
        content: posture,
        source: input.source,
        inputFingerprint,
        provenance: {
          producedBy: input.producedBy,
          producedAt: input.producedAt,
          pipelineVersion: input.pipelineVersion,
          // The single input to this atom is the screen-postures
          // hybrid file it came from.
          inputs: [`screen-postures:${screen}`],
        },
      });
    });
  });
}
