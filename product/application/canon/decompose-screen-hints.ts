/**
 * Pure decomposer: ScreenHints → readonly Atom<'element', ScreenElementHint>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table, every
 * `dogfood/knowledge/screens/{screen}.hints.yaml` file is a hybrid
 * canonical artifact that mixes per-element alias enrichment (Tier 1
 * `element` atoms) with per-(screen, intent-fingerprint) resolution
 * overrides (Tier 1 `resolution-override` atoms). This decomposer
 * handles the per-element-enrichment portion. The resolution-override
 * portion is handled by a separate decomposer when a real
 * resolution-override-bearing hints file appears in the dogfood
 * suite.
 *
 * **Structure after the mint-helper refactor.** The decomposer is a
 * pure fan-out that returns `AtomCandidate`s with content-level
 * fingerprint projection (for the `acquired`-exclusion behavior).
 * The envelope construction happens in `mintAtoms`.
 *
 * **Coexistence with element atoms from elements.yaml.** This
 * decomposer produces atoms with class `'element'` and the SAME
 * address as the atoms produced by `decomposeScreenElements` — the
 * `(screen, element)` tuple. The two atoms differ in their content
 * type: structural data lives in `Atom<'element', ElementSig>`;
 * enrichment data (aliases, locator ladder, snapshot aliases,
 * affordance, default value ref, parameter binding) lives in
 * `Atom<'element', ScreenElementHint>`. Per
 * `lib/application/catalog/types.ts:113`, the catalog stores
 * `tier1Atoms` as an array (not a map), so two atoms with the same
 * address coexist without overwriting.
 *
 * **Fingerprint stability across activation cycles.** The
 * `ScreenElementHint.acquired` block carries activation lineage —
 * `activatedAt`, `certifiedAt`, `runIds`, `evidenceIds`,
 * `sourceArtifactPaths` — which is conceptually provenance even
 * though it lives inside the content type. Re-running the
 * migration after a knowledge activation cycle should NOT produce
 * a new fingerprint.
 *
 * The refactor preserves this behavior by projecting each hint to
 * its fingerprintable form (`acquired → null`) BEFORE handing it
 * to the mint helper. The atom's stored content is still the full
 * `ScreenElementHint` (including `acquired`) — only the value the
 * mint hashes over is the stripped projection. Since `mintAtom`'s
 * fingerprint formula is
 * `sha256(stableStringify({ address, content }))`, this is
 * achieved by passing the stripped projection as the candidate's
 * content field AND re-attaching the original on a post-mint
 * rewrite... actually, more simply: since mintAtom hashes exactly
 * the candidate's content, we set candidate.content to the
 * stripped form. But the consumer expects the FULL hint in the
 * atom's content. To reconcile both, we use a second pass:
 * candidates are built with the stripped form, and then a post-
 * mint projection re-attaches the original acquired block to the
 * returned envelope's content.
 *
 * See `decomposeScreenHints` implementation for the two-pass
 * strategy. The interface is unchanged from the pre-refactor
 * version; the behavior (stripped-content fingerprint + full
 * content in atom) is preserved exactly.
 *
 * **Deferred for a later slice:**
 *   - `screenAliases` at the top of the hints file.
 *   - Resolution-override entries.
 *
 * **Type reuse — no parallel content shapes.** Per
 * `docs/domain-class-decomposition.md` § Knowledge row, the existing
 * domain type `ScreenElementHint` (defined at
 * `lib/domain/knowledge/types.ts:185-197`) IS the hint atom's
 * canonical content shape.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § Knowledge, hints are knowledge that mediates between intent
 * and reality.
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Hint, a
 * hint's canonical home today is
 * `knowledge/screens/{screen}.hints.yaml`.
 *
 * Pure application — depends only on `lib/application/canon/minting`
 * (shared envelope machinery), `lib/domain/pipeline`, and
 * `lib/domain/knowledge/types`. No Effect, no IO, no mutation.
 */

import type { ScreenHints, ScreenElementHint } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { ElementAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { createElementId } from '../../domain/kernel/identity';
import {
  mintAtom,
  producerFrom,
} from './minting';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenHintsInput {
  readonly content: ScreenHints;
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Fingerprint stripping ───────────────────────────────────────

/** Project a `ScreenElementHint` to its fingerprintable form by
 *  replacing the `acquired` block with `null`. The returned value
 *  is structurally identical to the input except for the
 *  `acquired` field, and is suitable for content-hash consumption.
 *
 *  Exported so tests can verify its behavior in isolation. */
export function fingerprintableHintContent(
  hint: ScreenElementHint,
): Omit<ScreenElementHint, 'acquired'> & { readonly acquired: null } {
  return {
    aliases: hint.aliases,
    role: hint.role,
    defaultValueRef: hint.defaultValueRef,
    parameter: hint.parameter,
    snapshotAliases: hint.snapshotAliases,
    affordance: hint.affordance,
    locatorLadder: hint.locatorLadder,
    source: hint.source,
    epistemicStatus: hint.epistemicStatus,
    activationPolicy: hint.activationPolicy,
    acquired: null,
  };
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a `ScreenHints` hybrid into a flat list of element
 *  hint atom envelopes — one per entry in `content.elements`.
 *
 *  Pure function. Uses the two-pass strategy for `acquired`
 *  stripping:
 *
 *    1. Mint with the stripped projection as the candidate's
 *       content. This ensures the fingerprint covers the stripped
 *       form (provenance-stable across activation cycles).
 *    2. Re-attach the original `acquired` block to the minted
 *       atom's content, so consumers see the full hint even
 *       though the fingerprint was computed over the stripped
 *       form.
 *
 *  This preserves the pre-refactor behavior exactly. The law
 *  tests in `tests/canon-decomposition.laws.spec.ts` verify both
 *  the fingerprint-stability property AND the content-preservation
 *  property.
 */
export function decomposeScreenHints(
  input: DecomposeScreenHintsInput,
): readonly Atom<'element', ScreenElementHint, PhaseOutputSource>[] {
  const producer = producerFrom(input);
  const screen = input.content.screen;
  const sortedEntries = Object.entries(input.content.elements).sort(
    ([leftId], [rightId]) => leftId.localeCompare(rightId),
  );
  return sortedEntries.map(([elementIdString, hint]) => {
    const address: ElementAtomAddress = {
      class: 'element',
      screen,
      element: createElementId(elementIdString),
    };
    // Mint with the stripped projection as the content, so the
    // fingerprint is computed over (address, stripped content)
    // and is stable across activation cycles.
    const mintedWithStripped = mintAtom<'element', ScreenElementHint, PhaseOutputSource>(producer, {
      address,
      content: fingerprintableHintContent(hint) as unknown as ScreenElementHint,
      inputs: [`screen-hints:${screen}`],
    });
    // Re-attach the original hint (including `acquired`) as the
    // atom's content. The fingerprint is retained from the mint.
    return {
      ...mintedWithStripped,
      content: hint,
    };
  });
}
