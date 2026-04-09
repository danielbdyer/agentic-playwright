/**
 * Pure decomposer: readonly SnapshotRecord[] →
 *   readonly Atom<'snapshot', SnapshotAtomContent>[]
 *
 * Per `docs/canon-and-derivation.md` § 11 classification table,
 * `dogfood/knowledge/snapshots/**` is a canonical artifact tree
 * whose long-term form is one atom per snapshot template.
 *
 * Phase A.7. First collection-based canon decomposer — takes a
 * batch of pre-parsed `SnapshotRecord`s rather than a single
 * compound document, because snapshots are stored as one file per
 * template.
 *
 * After the mint-helper refactor the fan-out returns candidates;
 * the public decomposer mints them via `mintAtoms`.
 *
 * **Tree opacity is deliberate.** The existing runtime treats
 * snapshot content as an opaque blob via
 * `SnapshotTemplateLoader.read()`. There is no typed
 * `SnapshotTemplate` interface in `lib/domain/knowledge/types.ts`.
 * `SnapshotAtomContent.tree` is therefore typed as `unknown` to
 * match the existing convention.
 *
 * **Path-based identity.** The canon decomposer uses path-based
 * IDs (e.g., `"policy-search/results-with-policy"`) matching what
 * scenarios and hints reference via `snapshotAliases`. The
 * `decomposeDiscoveryRun` decomposer uses hash-based IDs for
 * fresh observations; the two conventions are a known discrepancy
 * documented in the prior-version module header.
 *
 * **snapshotHash in content.** The hash is carried in the atom's
 * content field so consumers can cross-reference with
 * discovery-derived atoms, and so fingerprint sensitivity covers
 * hash changes (a content-addressed marker independent of the
 * parsed tree).
 *
 * Pure application — depends only on `lib/application/canon/minting`,
 * `lib/domain/pipeline`, and `lib/domain/kernel/identity`.
 */

import type { ScreenId, SnapshotTemplateId } from '../../domain/kernel/identity';
import type { Atom } from '../../domain/pipeline/atom';
import type { SnapshotAtomAddress } from '../../domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import {
  mintAtoms,
  producerFrom,
  type AtomCandidate,
} from './minting';

// ─── Content type ────────────────────────────────────────────────

export interface SnapshotAtomContent {
  readonly screen: ScreenId;
  readonly snapshotHash: string;
  readonly tree: unknown;
}

// ─── Input record shape ──────────────────────────────────────────

export interface SnapshotRecord {
  readonly id: SnapshotTemplateId;
  readonly screen: ScreenId;
  readonly snapshotHash: string;
  readonly tree: unknown;
}

// ─── Public input shape ──────────────────────────────────────────

export interface DecomposeSnapshotsInput {
  readonly content: readonly SnapshotRecord[];
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}

// ─── Fan-out ────────────────────────────────────────────────────

/** Pure fan-out: `SnapshotRecord[]` → snapshot atom candidates.
 *  Sorted lex by record id. Exported for tests. */
export function fanOutSnapshots(
  content: readonly SnapshotRecord[],
): readonly AtomCandidate<'snapshot', SnapshotAtomContent>[] {
  // Sort defensively so the caller's directory-walk order doesn't
  // leak into the output.
  const sortedRecords = [...content].sort((left, right) =>
    (left.id as string).localeCompare(right.id as string),
  );
  return sortedRecords.map((record) => {
    const address: SnapshotAtomAddress = {
      class: 'snapshot',
      id: record.id,
    };
    const snapshotContent: SnapshotAtomContent = {
      screen: record.screen,
      snapshotHash: record.snapshotHash,
      tree: record.tree,
    };
    return {
      address,
      content: snapshotContent,
      inputs: [`snapshot:${record.id}`],
    };
  });
}

// ─── Public decomposer ──────────────────────────────────────────

/** Decompose a batch of `SnapshotRecord`s into a flat list of
 *  snapshot atom envelopes — one per record. */
export function decomposeSnapshots(
  input: DecomposeSnapshotsInput,
): readonly Atom<'snapshot', SnapshotAtomContent>[] {
  return mintAtoms(producerFrom(input), fanOutSnapshots(input.content));
}
