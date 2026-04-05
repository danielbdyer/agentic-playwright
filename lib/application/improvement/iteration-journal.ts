/**
 * Iteration Journal (W2.16)
 *
 * Cross-iteration rejection memory for the dogfood loop. Persists reasoning
 * across iterations to prevent proposal thrashing — where the same proposal
 * is repeatedly generated, rejected, and re-generated.
 *
 * Pure, immutable data structure. All operations return new values.
 */

// ─── Types ───

export type IterationJournalDecision = 'accepted' | 'rejected' | 'deferred';

export interface IterationJournalEntry {
  readonly proposalId: string;
  readonly iteration: number;
  readonly decision: IterationJournalDecision;
  readonly reason: string;
  readonly alternativeTried: string | null;
}

export interface IterationJournal {
  readonly entries: readonly IterationJournalEntry[];
}

// ─── Constructors ───

export function emptyJournal(): IterationJournal {
  return { entries: [] };
}

// ─── Operations (all pure, immutable) ───

/**
 * Immutable append — returns a new journal with the entry added.
 */
export function addEntry(
  journal: IterationJournal,
  entry: IterationJournalEntry,
): IterationJournal {
  return { entries: [...journal.entries, entry] };
}

/**
 * Batch append — returns a new journal with all entries added.
 */
export function addEntries(
  journal: IterationJournal,
  newEntries: readonly IterationJournalEntry[],
): IterationJournal {
  return { entries: [...journal.entries, ...newEntries] };
}

/**
 * Check whether a proposal was recently rejected (within `windowSize` iterations
 * of `currentIteration`). Returns true if any rejection exists within the window.
 *
 * Default window size is 3 iterations — prevents thrashing while allowing
 * proposals to be reconsidered after sufficient time has passed.
 */
export function wasRecentlyRejected(
  journal: IterationJournal,
  proposalId: string,
  currentIteration: number,
  windowSize: number = 3,
): boolean {
  const lowerBound = currentIteration - windowSize;
  return journal.entries.some(
    (entry) =>
      entry.proposalId === proposalId &&
      entry.decision === 'rejected' &&
      entry.iteration >= lowerBound &&
      entry.iteration < currentIteration,
  );
}

/**
 * Query all entries for a given proposal, ordered by iteration.
 * Deterministic: entries are stored in append order and filtered without reordering.
 */
export function entriesForProposal(
  journal: IterationJournal,
  proposalId: string,
): readonly IterationJournalEntry[] {
  return journal.entries.filter((entry) => entry.proposalId === proposalId);
}

/**
 * Count rejections for a proposal across all iterations.
 */
export function rejectionCount(
  journal: IterationJournal,
  proposalId: string,
): number {
  return journal.entries.filter(
    (entry) => entry.proposalId === proposalId && entry.decision === 'rejected',
  ).length;
}

/**
 * Filter a list of proposal IDs to only those not recently rejected.
 * Pure function: (journal, proposalIds, iteration) → filtered proposalIds.
 */
export function filterRecentlyRejected(
  journal: IterationJournal,
  proposalIds: readonly string[],
  currentIteration: number,
  windowSize: number = 3,
): readonly string[] {
  return proposalIds.filter(
    (id) => !wasRecentlyRejected(journal, id, currentIteration, windowSize),
  );
}

/**
 * Return the most recent decision for a proposal, or null if no entries exist.
 */
export function latestDecision(
  journal: IterationJournal,
  proposalId: string,
): IterationJournalEntry | null {
  const matching = entriesForProposal(journal, proposalId);
  return matching.length > 0 ? matching[matching.length - 1]! : null;
}
