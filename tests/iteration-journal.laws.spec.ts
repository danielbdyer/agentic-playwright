/**
 * Iteration Journal — Algebraic Law Tests (W2.16)
 *
 * Verifies that the iteration journal satisfies:
 *   1. Recently rejected proposals are detected within the window
 *   2. Journal entries accumulate immutably (source journal unchanged)
 *   3. Query is deterministic (same inputs → same outputs)
 *   4. Empty journal allows all proposals
 *   5. Window boundary semantics are correct
 *   6. filterRecentlyRejected composes correctly with wasRecentlyRejected
 */

import { expect, test } from '@playwright/test';
import {
  emptyJournal,
  addEntry,
  addEntries,
  wasRecentlyRejected,
  entriesForProposal,
  rejectionCount,
  filterRecentlyRejected,
  latestDecision,
} from '../workshop/orchestration/iteration-journal';
import type { IterationJournal, IterationJournalEntry } from '../workshop/orchestration/iteration-journal';
import { mulberry32, pick, randomWord , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───

function makeEntry(
  proposalId: string,
  iteration: number,
  decision: 'accepted' | 'rejected' | 'deferred' = 'rejected',
  reason: string = 'test-reason',
): IterationJournalEntry {
  return { proposalId, iteration, decision, reason, alternativeTried: null };
}

function randomEntry(next: () => number): IterationJournalEntry {
  return {
    proposalId: `proposal-${randomWord(next)}`,
    iteration: Math.floor(next() * 20) + 1,
    decision: pick(next, ['accepted', 'rejected', 'deferred'] as const),
    reason: `reason-${randomWord(next)}`,
    alternativeTried: next() > 0.5 ? `alt-${randomWord(next)}` : null,
  };
}

// ─── Law 1: Recently rejected detection ───

test.describe('Law 1: Recently rejected detection', () => {
  test('rejected proposal within window is detected', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 3, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(true);
  });

  test('rejected proposal outside window is not detected', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 1, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p1', 10, 3)).toBe(false);
  });

  test('accepted proposal is not detected as rejected', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 3, 'accepted'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(false);
  });

  test('deferred proposal is not detected as rejected', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 3, 'deferred'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(false);
  });

  test('different proposalId is not detected', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 3, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p2', 5, 3)).toBe(false);
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`recently rejected is consistent on repeated query (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const entryCount = 1 + Math.floor(next() * 10);
      let journal: IterationJournal = emptyJournal();
      for (let i = 0; i < entryCount; i++) {
        journal = addEntry(journal, randomEntry(next));
      }
      const proposalId = `proposal-${randomWord(next)}`;
      const currentIteration = Math.floor(next() * 25) + 1;
      const windowSize = 1 + Math.floor(next() * 5);

      const r1 = wasRecentlyRejected(journal, proposalId, currentIteration, windowSize);
      const r2 = wasRecentlyRejected(journal, proposalId, currentIteration, windowSize);

      expect(r1).toBe(r2);
    });
  }
});

// ─── Law 2: Immutable accumulation ───

test.describe('Law 2: Immutable accumulation', () => {
  test('addEntry does not mutate the source journal', () => {
    const original = emptyJournal();
    const updated = addEntry(original, makeEntry('p1', 1));

    expect(original.entries).toHaveLength(0);
    expect(updated.entries).toHaveLength(1);
  });

  test('addEntries does not mutate the source journal', () => {
    const original = addEntry(emptyJournal(), makeEntry('p1', 1));
    const updated = addEntries(original, [makeEntry('p2', 2), makeEntry('p3', 3)]);

    expect(original.entries).toHaveLength(1);
    expect(updated.entries).toHaveLength(3);
  });

  test('sequential addEntry builds up correctly', () => {
    let journal = emptyJournal();
    journal = addEntry(journal, makeEntry('p1', 1));
    journal = addEntry(journal, makeEntry('p2', 2));
    journal = addEntry(journal, makeEntry('p3', 3));

    expect(journal.entries).toHaveLength(3);
    expect(journal.entries[0]!.proposalId).toBe('p1');
    expect(journal.entries[2]!.proposalId).toBe('p3');
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`accumulation preserves all entries (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const count = 1 + Math.floor(next() * 15);
      const entries = Array.from({ length: count }, () => randomEntry(next));

      const journal = addEntries(emptyJournal(), entries);

      expect(journal.entries).toHaveLength(count);
      entries.forEach((entry, i) => {
        expect(journal.entries[i]!.proposalId).toBe(entry.proposalId);
        expect(journal.entries[i]!.iteration).toBe(entry.iteration);
        expect(journal.entries[i]!.decision).toBe(entry.decision);
      });
    });
  }
});

// ─── Law 3: Deterministic query ───

test.describe('Law 3: Deterministic query', () => {
  test('entriesForProposal returns same results on repeated calls', () => {
    const journal = addEntries(emptyJournal(), [
      makeEntry('p1', 1, 'rejected'),
      makeEntry('p2', 2, 'accepted'),
      makeEntry('p1', 3, 'deferred'),
    ]);

    const r1 = entriesForProposal(journal, 'p1');
    const r2 = entriesForProposal(journal, 'p1');

    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(2);
  });

  test('rejectionCount is deterministic', () => {
    const journal = addEntries(emptyJournal(), [
      makeEntry('p1', 1, 'rejected'),
      makeEntry('p1', 2, 'accepted'),
      makeEntry('p1', 3, 'rejected'),
    ]);

    expect(rejectionCount(journal, 'p1')).toBe(2);
    expect(rejectionCount(journal, 'p1')).toBe(2);
  });

  test('latestDecision returns the last entry for a proposal', () => {
    const journal = addEntries(emptyJournal(), [
      makeEntry('p1', 1, 'rejected'),
      makeEntry('p1', 5, 'accepted'),
    ]);

    const latest = latestDecision(journal, 'p1');
    expect(latest!.decision).toBe('accepted');
    expect(latest!.iteration).toBe(5);
  });

  test('latestDecision returns null for unknown proposal', () => {
    expect(latestDecision(emptyJournal(), 'unknown')).toBeNull();
  });
});

// ─── Law 4: Empty journal allows all proposals ───

test.describe('Law 4: Empty journal allows all', () => {
  test('wasRecentlyRejected is false for empty journal', () => {
    expect(wasRecentlyRejected(emptyJournal(), 'any-proposal', 10, 3)).toBe(false);
  });

  test('filterRecentlyRejected passes all proposals through empty journal', () => {
    const ids = ['p1', 'p2', 'p3'];
    const result = filterRecentlyRejected(emptyJournal(), ids, 10, 3);
    expect(result).toEqual(ids);
  });

  test('entriesForProposal returns empty for empty journal', () => {
    expect(entriesForProposal(emptyJournal(), 'p1')).toHaveLength(0);
  });

  test('rejectionCount is 0 for empty journal', () => {
    expect(rejectionCount(emptyJournal(), 'p1')).toBe(0);
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`empty journal allows random proposal (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const proposalId = `proposal-${randomWord(next)}`;
      const iteration = Math.floor(next() * 100) + 1;

      expect(wasRecentlyRejected(emptyJournal(), proposalId, iteration)).toBe(false);
    });
  }
});

// ─── Law 5: Window boundary semantics ───

test.describe('Law 5: Window boundary', () => {
  test('rejection at exact window boundary is included', () => {
    // currentIteration=5, windowSize=3 → lowerBound=2, so iteration 2 is included
    const journal = addEntry(emptyJournal(), makeEntry('p1', 2, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(true);
  });

  test('rejection one below window boundary is excluded', () => {
    // currentIteration=5, windowSize=3 → lowerBound=2, so iteration 1 is excluded
    const journal = addEntry(emptyJournal(), makeEntry('p1', 1, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(false);
  });

  test('rejection at current iteration is excluded (strict less-than)', () => {
    const journal = addEntry(emptyJournal(), makeEntry('p1', 5, 'rejected'));
    expect(wasRecentlyRejected(journal, 'p1', 5, 3)).toBe(false);
  });

  test('window size of 1 only considers immediately preceding iteration', () => {
    const journal = addEntries(emptyJournal(), [
      makeEntry('p1', 3, 'rejected'),
      makeEntry('p1', 4, 'rejected'),
    ]);
    // currentIteration=5, windowSize=1 → lowerBound=4, only iteration 4 included
    expect(wasRecentlyRejected(journal, 'p1', 5, 1)).toBe(true);
    // But iteration 3 is outside window of 1
    const journalOnlyOld = addEntry(emptyJournal(), makeEntry('p1', 3, 'rejected'));
    expect(wasRecentlyRejected(journalOnlyOld, 'p1', 5, 1)).toBe(false);
  });

  test('default window size is 3', () => {
    // Verify the default parameter
    const journal = addEntry(emptyJournal(), makeEntry('p1', 7, 'rejected'));
    // currentIteration=10, default windowSize=3 → lowerBound=7, so iteration 7 is included
    expect(wasRecentlyRejected(journal, 'p1', 10)).toBe(true);
    // iteration 6 would be excluded with default window of 3
    const journal2 = addEntry(emptyJournal(), makeEntry('p1', 6, 'rejected'));
    expect(wasRecentlyRejected(journal2, 'p1', 10)).toBe(false);
  });
});

// ─── Law 6: filterRecentlyRejected consistency ───

test.describe('Law 6: filterRecentlyRejected consistency', () => {
  test('filterRecentlyRejected is consistent with wasRecentlyRejected', () => {
    const journal = addEntries(emptyJournal(), [
      makeEntry('p1', 3, 'rejected'),
      makeEntry('p2', 3, 'accepted'),
      makeEntry('p3', 3, 'rejected'),
    ]);
    const ids = ['p1', 'p2', 'p3', 'p4'];
    const filtered = filterRecentlyRejected(journal, ids, 5, 3);

    for (const id of ids) {
      const rejected = wasRecentlyRejected(journal, id, 5, 3);
      if (rejected) {
        expect(filtered).not.toContain(id);
      } else {
        expect(filtered).toContain(id);
      }
    }
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`filter-query consistency (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const entryCount = Math.floor(next() * 8);
      let journal: IterationJournal = emptyJournal();
      for (let i = 0; i < entryCount; i++) {
        journal = addEntry(journal, randomEntry(next));
      }
      const idCount = 1 + Math.floor(next() * 6);
      const ids = Array.from({ length: idCount }, () => `proposal-${randomWord(next)}`);
      const currentIteration = Math.floor(next() * 25) + 1;
      const windowSize = 1 + Math.floor(next() * 5);

      const filtered = filterRecentlyRejected(journal, ids, currentIteration, windowSize);

      for (const id of ids) {
        const rejected = wasRecentlyRejected(journal, id, currentIteration, windowSize);
        expect(filtered.includes(id)).toBe(!rejected);
      }
    });
  }
});
