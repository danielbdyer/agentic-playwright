/**
 * Pure decomposer: ScreenPostures → readonly Atom<'posture', Posture>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table, every
 * `dogfood/knowledge/screens/{screen}.postures.yaml` file is a
 * canonical artifact whose long-term form is one atom per
 * `(screen, element, posture)` triple under
 * `.canonical-artifacts/{agentic|deterministic}/atoms/postures/{screen}/{element}/{posture}.yaml`.
 *
 * Phase A.3. Peer of the other canon decomposers. Same mint-helper
 * pattern: pure fan-out into `AtomCandidate[]`, then batch-mint.
 *
 * **Single-class output.** This file is cleanly single-class per
 * the § 11 classification table. Posture-sample atoms (a separate
 * Tier 1 class) come from `dogfood/controls/datasets/*.dataset.yaml`
 * via a separate decomposer.
 *
 * **Nested iteration order.** `ScreenPostures.postures` is a
 * nested map — outer key is element id, inner key is posture name.
 * The fan-out iterates both levels and sorts lexicographically at
 * each level.
 *
 * **Type reuse.** The atom content is the existing `Posture`
 * domain type from `lib/domain/knowledge/types.ts:355-358`.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § Target gravitational well, postures are behavioral dispositions
 * of a target — they describe how the target behaves under
 * exercise.
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Posture.
 *
 * Pure application — depends only on
 * `lib/application/canon/minting`, `lib/domain/pipeline`, and
 * `lib/domain/knowledge/types`. No Effect, no IO, no mutation.
 */

import type { ScreenPostures, Posture } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { PostureAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { createElementId, createPostureId } from '../../domain/kernel/identity';
import {
  mintAtoms,
  producerFrom,
  type AtomCandidate,
} from './minting';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenPosturesInput {
  readonly content: ScreenPostures;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Fan-out ────────────────────────────────────────────────────

/** Pure fan-out: `ScreenPostures` → per-(element, posture) atom
 *  candidates. Double-sorted (outer by element id, inner by
 *  posture name) for determinism. */
export function fanOutScreenPostures(
  content: ScreenPostures,
): readonly AtomCandidate<'posture', Posture>[] {
  const screen = content.screen;
  const sortedElements = Object.entries(content.postures).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );
  return sortedElements.flatMap(([elementIdString, posturesForElement]) => {
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
      return {
        address,
        content: posture,
        inputs: [`screen-postures:${screen}`],
      };
    });
  });
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `ScreenPostures` file into a flat list of posture
 *  atom envelopes — one per `(element, posture-name)` pair. */
export function decomposeScreenPostures(
  input: DecomposeScreenPosturesInput,
): readonly Atom<'posture', Posture>[] {
  return mintAtoms(producerFrom(input), fanOutScreenPostures(input.content));
}
