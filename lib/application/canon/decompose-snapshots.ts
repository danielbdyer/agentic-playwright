/**
 * Pure decomposer: readonly SnapshotRecord[] →
 *   readonly Atom<'snapshot', SnapshotAtomContent>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/snapshots/**` is a canonical artifact tree
 * whose long-term form is one atom per snapshot template under
 * `.canonical-artifacts/{agentic|deterministic}/atoms/snapshots/{snapshot-id}.yaml`.
 *
 * Phase A.7 of `docs/cold-start-convergence-plan.md`. Seventh canon
 * decomposer. Single-class atom output (no composition), matching
 * the A.1 / A.2 / A.3 / A.6 flat-array template.
 *
 * **Batch input shape — first collection-based decomposer.**
 *
 * Unlike prior canon decomposers which take a single parsed
 * document at a time (one `ScreenElements`, one `RouteKnowledgeManifest`,
 * etc.), this one takes a *collection* of records. The reason is
 * structural: snapshots are stored as one file per template
 * (`{screen}/{name}.yaml` plus a `{name}.hash` sidecar), not as a
 * single compound document. The natural shape for the caller is
 * "walk the snapshots directory, parse each file, invoke the
 * decomposer on the batch of records."
 *
 * Each input record carries the minimum information needed to
 * build a typed atom: the snapshot template id (path-based), the
 * screen scope, the pre-computed content hash, and the parsed
 * ARIA tree (as `unknown` because the runtime treats the tree
 * opaquely — see below).
 *
 * **Tree opacity is a deliberate design choice.**
 *
 * The runtime already handles ARIA snapshot content as an opaque
 * blob: `SnapshotTemplateLoader.read()` in
 * `lib/domain/commitment/runtime-loaders.ts:18-21` returns a
 * `string`, not a typed tree. There is no typed `SnapshotTemplate`
 * domain interface in `lib/domain/knowledge/types.ts` — only the
 * `SnapshotTemplateId` brand. The `SnapshotAtomContent.tree` field
 * is therefore typed as `unknown` to match the existing runtime
 * convention and to avoid inventing a recursive ARIA tree type
 * that would be a parallel content invention.
 *
 * Consumers that need structural access to the tree parse it on
 * demand, the same way the runtime already does. The canonical
 * artifact still carries the full tree (unlike `KnowledgeSnapshotEntry`
 * at `lib/application/catalog/types.ts:65-69` which only carries
 * a path reference) because the tree IS the canonical fact — a
 * pointer-to-file wouldn't satisfy the "content is evidence-backed"
 * rule.
 *
 * **Path-based identity — the on-disk convention.**
 *
 * The `SnapshotTemplateId` brand is used two different ways in the
 * codebase:
 *
 *   - **On-disk (this decomposer)**: ID is a path-based string like
 *     `policy-search/results-with-policy`. Scenarios and hints
 *     reference snapshot templates via this path-based ID
 *     (e.g. `snapshotAliases` key in
 *     `dogfood/knowledge/screens/policy-search.hints.yaml`).
 *   - **Discovery decomposer** at
 *     `lib/application/discovery/decompose-discovery-run.ts:263`:
 *     ID is the SHA-256 hash of the captured content. The hash
 *     serves as a stand-in identifier until the snapshot is
 *     promoted and gets a stable path-based name.
 *
 * The two conventions are NOT byte-equivalent at the address level,
 * which is a known discrepancy the lookup chain will have to
 * reconcile when the discovery engine starts promoting snapshots
 * to canon. For Phase A (canon migration), we use the on-disk
 * convention — path-based IDs match what scenarios and hints
 * already reference, so the migration is a no-op for existing
 * consumers.
 *
 * The `snapshotHash` is carried in the atom's content field so
 * consumers can cross-reference with discovery-derived atoms at
 * a higher layer (e.g., "does the canon atom at path P have the
 * same content hash as the discovery atom at hash H?"). This is
 * how the interop join eventually closes the gap between the two
 * ID conventions.
 *
 * **Source-agnostic construction seam.**
 *
 * Like every other canon decomposer, this one is source-agnostic.
 * The caller parses YAML (or consumes a live snapshot capture) and
 * hands the decomposer a batch of typed records. The
 * `PhaseOutputSource` field on the envelope distinguishes the two
 * origins; the fingerprint is content-only so warm and cold
 * invocations with identical records produce byte-equal
 * fingerprints (the interop contract from
 * `docs/canon-and-derivation.md` § 8.1 at the atom level).
 *
 * **Ontology grounding.**
 *
 * Per `docs/domain-model.md` § Observation, snapshots are ARIA
 * tree templates — structural assertions that the runtime uses to
 * verify a captured state matches a known-good reference. They
 * sit at the boundary between observation (how the system
 * perceives the SUT) and knowledge (what the system has learned
 * about stable reference points). The snapshot atom positions
 * them as canonical artifacts so the lookup chain can treat them
 * as addressable ground truth rather than loose file references.
 *
 * Per `docs/domain-ontology.md` § Snapshot, a snapshot's canonical
 * home today is `knowledge/snapshots/{screen}/{name}.yaml`; the
 * long-term home (post-decomposition) is one file per snapshot
 * atom under the canonical artifact store.
 *
 * Per `docs/domain-class-decomposition.md` § Knowledge row, the
 * existing domain type is `SnapshotTemplate` (listed in the
 * § 16.7 table of canon-and-derivation) which maps to
 * `SnapshotTemplateId` plus the opaque content. This decomposer
 * respects that: the `SnapshotTemplateId` flows through as the
 * address, and the content carries the screen scope, the hash,
 * and the opaque tree.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/kernel/identity` (id brands), and
 * `lib/domain/kernel/hash` (deterministic stringification + sha256).
 * No Effect, no IO, no mutation.
 */

import type { ScreenId, SnapshotTemplateId } from '../../domain/kernel/identity';
import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { SnapshotAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { stableStringify, sha256 } from '../../domain/kernel/hash';

// ─── Content type ────────────────────────────────────────────────

/** The snapshot atom's content. Carries the screen scope, the
 *  pre-computed content hash (from the `.hash` sidecar), and the
 *  parsed ARIA tree as `unknown`. See module header for why `tree`
 *  is opaque at this layer. */
export interface SnapshotAtomContent {
  /** Which screen this snapshot template belongs to. */
  readonly screen: ScreenId;
  /** SHA-256 of the raw YAML text of the tree, as carried in the
   *  sidecar `.hash` file. Consumers use this to cross-reference
   *  with discovery-derived snapshot atoms (which use the hash as
   *  their address id) without having to re-compute it. */
  readonly snapshotHash: string;
  /** The parsed ARIA tree content. Typed as `unknown` to match the
   *  existing runtime convention — the runtime treats the tree as
   *  an opaque blob loaded via `SnapshotTemplateLoader.read()`.
   *  Consumers that need structural access parse/narrow on demand. */
  readonly tree: unknown;
}

// ─── Input record shape ──────────────────────────────────────────

/** One pre-parsed snapshot record, ready for the decomposer to
 *  turn into an atom envelope. The caller (typically a migration
 *  script that walks `knowledge/snapshots/`) is responsible for
 *  reading the YAML file, reading the `.hash` sidecar, and
 *  building this record. */
export interface SnapshotRecord {
  /** Path-based snapshot template id (e.g.,
   *  `policy-search/results-with-policy`). Becomes the atom's
   *  address id. */
  readonly id: SnapshotTemplateId;
  /** Which screen this snapshot belongs to, derived from the
   *  parent directory name. */
  readonly screen: ScreenId;
  /** SHA-256 of the raw YAML text of the tree. */
  readonly snapshotHash: string;
  /** Parsed ARIA tree. Domain-agnostic shape — typed as `unknown`
   *  because the runtime treats snapshot content opaquely. */
  readonly tree: unknown;
}

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeSnapshotsInput {
  /** The batch of pre-parsed snapshot records. Unlike prior canon
   *  decomposers which take a single parsed document, this one
   *  takes a collection because snapshots are stored as one file
   *  per template. */
  readonly content: readonly SnapshotRecord[];
  /** Which slot of the lookup chain the records came from. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer (atom provenance). */
  readonly producedBy: string;
  /** ISO timestamp the decomposition was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA) for provenance. */
  readonly pipelineVersion?: string;
}

// ─── The decomposer ──────────────────────────────────────────────

/** Decompose a batch of `SnapshotRecord`s into a flat list of
 *  snapshot atom envelopes — one per record.
 *
 *  Pure function: same input → same output. The output is ordered
 *  by snapshot template id (lexicographic) so the decomposition is
 *  stable across runs regardless of the caller's directory-walk
 *  order.
 *
 *  The function follows the same catamorphism shape as the flat
 *  canon decomposers (elements, hints, postures, patterns). No
 *  mutation, no early return, no `let`. The only behavioral
 *  wrinkle is the collection-based input shape — every other
 *  decomposer takes a single document.
 */
export function decomposeSnapshots(
  input: DecomposeSnapshotsInput,
): readonly Atom<'snapshot', SnapshotAtomContent>[] {
  // Sort by snapshot template id lexicographically so the output
  // order is stable across runs regardless of the caller's
  // directory-walk order.
  const sortedRecords = [...input.content].sort((left, right) =>
    (left.id as string).localeCompare(right.id as string),
  );

  return sortedRecords.map((record) => {
    const address: SnapshotAtomAddress = {
      class: 'snapshot',
      id: record.id,
    };
    const content: SnapshotAtomContent = {
      screen: record.screen,
      snapshotHash: record.snapshotHash,
      tree: record.tree,
    };
    const inputFingerprint = `sha256:${sha256(stableStringify({ address, content }))}`;
    return atom<'snapshot', SnapshotAtomContent>({
      class: 'snapshot',
      address,
      content,
      source: input.source,
      inputFingerprint,
      provenance: {
        producedBy: input.producedBy,
        producedAt: input.producedAt,
        pipelineVersion: input.pipelineVersion,
        inputs: [`snapshot:${record.id}`],
      },
    });
  });
}
