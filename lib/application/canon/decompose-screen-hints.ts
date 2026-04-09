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
 * suite (none of the current hints files actually contain resolution
 * overrides, so the decomposer for that portion is deferred).
 *
 * Phase A.2 of `docs/cold-start-convergence-plan.md`. Peer of
 * `decomposeScreenElements` at
 * `lib/application/canon/decompose-screen-elements.ts`. Same shape,
 * different input type, same scalability pattern (pure catamorphism,
 * stable lex ordering, fingerprint independent of provenance).
 *
 * **Coexistence with element atoms from elements.yaml.** This
 * decomposer produces atoms with class `'element'` and the SAME
 * address as the atoms produced by `decomposeScreenElements` — the
 * `(screen, element)` tuple. The two atoms differ in their content
 * type: structural data lives in the `Atom<'element', ElementSig>`
 * variant; alias / locator-ladder / snapshot-alias enrichment lives
 * in the `Atom<'element', ScreenElementHint>` variant. Per
 * `lib/application/catalog/types.ts:113`, the catalog stores
 * `tier1Atoms` as an array (not a map), so two atoms with the same
 * address coexist without overwriting. The lookup chain at
 * `lib/domain/pipeline/lookup-chain.ts` is responsible for joining
 * them at read time; the join semantics are a future slice.
 *
 * **Fingerprint stability across activation cycles.** The
 * `ScreenElementHint.acquired` block carries activation lineage —
 * `activatedAt`, `certifiedAt`, `runIds`, `evidenceIds`,
 * `sourceArtifactPaths` — which is conceptually provenance even
 * though it lives inside the content type. Re-running the migration
 * after a knowledge activation cycle should NOT produce a new
 * fingerprint just because the activation timestamps moved; the
 * promotion machinery would otherwise see spurious "content
 * changed" signals on every activation. To preserve the slice 1
 * property "fingerprint independent of provenance", the fingerprint
 * is computed over a stripped projection of the content with
 * `acquired` replaced by `null`. The atom envelope's `content` field
 * still carries the full `ScreenElementHint` (including `acquired`)
 * — only the fingerprint omits it.
 *
 * **Deferred for a later slice:**
 *   - `screenAliases` at the top of the hints file (these belong on
 *     a screen atom; the screen atom content shape needs to land
 *     first via `decompose-discovery-run.ts` consolidation).
 *   - Resolution-override entries (no current hints file actually
 *     contains them; will be handled when a real one appears).
 *
 * **Type reuse — no parallel content shapes.** Per
 * `docs/domain-class-decomposition.md` § Knowledge row, the existing
 * domain type `ScreenElementHint` (defined at
 * `lib/domain/knowledge/types.ts:185-197`) IS the hint atom's
 * canonical content shape. Per `docs/canon-and-derivation.md`
 * § 16.7, the atom envelope stores existing domain types — it does
 * NOT reinvent them. This decomposer respects that rule: emitted
 * atoms carry `ScreenElementHint` verbatim as their content.
 *
 * **Stable referent positioning.** Per `docs/domain-model.md`
 * § Knowledge, hints are knowledge that mediates between intent and
 * reality. They sit *inside* the epistemological loop (knowledge is
 * accumulated belief, not a stable referent), but the per-element
 * alias enrichment they carry is *about* a stable referent (an
 * element atom). The decomposer therefore addresses each emitted
 * hint atom by its element identity tuple, anchoring the
 * loop-internal knowledge to the loop-external referent.
 *
 * **Ontology alignment.** Per `docs/domain-ontology.md` § Hint, a
 * hint's canonical home today is
 * `knowledge/screens/{screen}.hints.yaml`; the long-term canonical
 * home is one file per element-hint atom under the canonical
 * artifact store. The hint's identity tuple (`(ScreenId, ElementId)`)
 * and its `ScreenElementHint` content are unchanged across the
 * decomposition.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/knowledge/types` (`ScreenHints`,
 * `ScreenElementHint`), `lib/domain/kernel/identity` (id
 * constructors), and `lib/domain/kernel/hash` (deterministic
 * stringification + sha256). No Effect, no IO, no mutation.
 */

import type { ScreenHints, ScreenElementHint } from '../../domain/knowledge/types';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { ElementAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { stableStringify, sha256 } from '../../domain/kernel/hash';
import { createElementId } from '../../domain/kernel/identity';

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeScreenHintsInput {
  /** The parsed-and-typed hybrid file content. The caller is
   *  responsible for parsing the YAML and validating it against
   *  the existing knowledge schema before invoking the decomposer. */
  readonly content: ScreenHints;
  /** Which slot of the lookup chain the hybrid file came from. For
   *  files migrated from `dogfood/knowledge/screens/`, this should
   *  be `'agentic-override'` because the existing files are
   *  hand-authored canonical artifacts (or proposal-activated, which
   *  is still agentic in origin). */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). For the
   *  one-shot migration script, use a constant like
   *  `'canon-decomposer:screen-hints:v1'` so re-runs of the same
   *  script version produce identical provenance. */
  readonly producedBy: string;
  /** ISO timestamp the migration was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── Fingerprint stripping ───────────────────────────────────────

/** Project a `ScreenElementHint` to its fingerprintable form by
 *  replacing the `acquired` block (which carries activation
 *  lineage and is provenance-shaped) with `null`. The returned
 *  value is structurally identical to the input except for the
 *  `acquired` field, and is suitable for `stableStringify` /
 *  `sha256` consumption.
 *
 *  This function is intentionally pure and exported so the law
 *  tests can verify its behavior in isolation. */
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
 *  Pure function: same input → same output. The output is ordered
 *  by element identifier (lexicographic), matching the convention
 *  established by `decomposeScreenElements`. The two decomposers
 *  produce atoms with the same address ordering for the same
 *  screen, so cross-decomposer joins (a future slice) can rely on
 *  positional alignment.
 *
 *  The function follows the same shape as `decomposeScreenElements`
 *  and `decomposeDiscoveryRun`: pure catamorphism over the input,
 *  no mutation, no early return, no `let`. The three together are
 *  intentionally pattern-matched so future readers see one
 *  decomposition idiom, not three.
 *
 *  `content.screenAliases` is intentionally NOT consumed by this
 *  decomposer. Screen-level aliases belong on a `screen` atom and
 *  the screen atom content shape needs to be reconciled with the
 *  discovery decomposer's output (`decomposeDiscoveryRun` already
 *  emits screen atoms with structural content) before screen
 *  aliases can be added. That reconciliation is a separate slice.
 */
export function decomposeScreenHints(
  input: DecomposeScreenHintsInput,
): readonly Atom<'element', ScreenElementHint>[] {
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
    // Fingerprint covers (address, stripped content). The stripping
    // omits the `acquired` block so re-running the migration after
    // an activation cycle does not produce a new fingerprint.
    const inputFingerprint = `sha256:${sha256(
      stableStringify({
        address,
        content: fingerprintableHintContent(hint),
      }),
    )}`;
    return atom<'element', ScreenElementHint>({
      class: 'element',
      address,
      content: hint,
      source: input.source,
      inputFingerprint,
      provenance: {
        producedBy: input.producedBy,
        producedAt: input.producedAt,
        pipelineVersion: input.pipelineVersion,
        // The single input to this atom is the screen-hints
        // hybrid file it came from.
        inputs: [`screen-hints:${screen}`],
      },
    });
  });
}
