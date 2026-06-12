/**
 * Degraded-name resolution kernel — cycle 10 laws.
 *
 * Pins the pure half of the runner's degraded-resolution rung
 * (CLAUDE.md "Deterministic precedence" §Resolution rung 6),
 * built in cycle 10 of the cold-start cohort spike after the
 * cycle-9 held-out evaluation (journal Entry 36) showed the
 * strict-query-plus-first-word baseline does not generalize.
 *
 *   ZC44     phrase reductions: right-drops before left-drops,
 *            longest first, original phrase excluded.
 *   ZC44.b   single-word phrases produce no reductions.
 *   ZC44.c   pure-stopword reductions and duplicates are dropped.
 *   ZC44.d   scoring: full candidate containment in the phrase
 *            scores high; zero token overlap scores exactly 0.
 *   ZC44.e   scoring is stopword-blind and case/punct-insensitive.
 *   ZC44.f   ranking is deterministic: score desc, visible first,
 *            then name asc.
 *   ZC44.g   dominance selection: score floor, visibility, and
 *            margin against differently-named rivals all enforced;
 *            same-name duplicates do not block selection.
 *   ZC44.h   CJK names tokenize as opaque units — no token
 *            overlap between "Japanese language" and 日本語, so the
 *            kernel refuses to guess (score 0).
 */

import { describe, test, expect } from 'vitest';
import {
  DOMINANCE_THRESHOLD,
  phraseReductions,
  normalizeNameTokens,
  scoreNameAgainstPhrase,
  rankCandidates,
  selectDominantCandidate,
  type ScoredCandidate,
} from '../../../product/domain/resolution/patterns/degraded-resolution';

describe('cycle 10 — degraded-name resolution kernel', () => {
  test('ZC44: "English language" reduces to ["English", "language"]', () => {
    expect(phraseReductions('English language')).toEqual(['English', 'language']);
  });

  test('ZC44: right-drops come before left-drops, longest first', () => {
    expect(phraseReductions('Submit Order today')).toEqual([
      'Submit Order',
      'Submit',
      'Order today',
      'today',
    ]);
  });

  test('ZC44.b: single-word phrase produces no reductions', () => {
    expect(phraseReductions('Submit')).toEqual([]);
    expect(phraseReductions('  Submit  ')).toEqual([]);
  });

  test('ZC44.c: pure-stopword reductions are dropped; duplicates deduped', () => {
    // "the" (left-drop tail) is a stopword-only reduction → dropped.
    expect(phraseReductions('Active the')).toEqual(['Active']);
    // Repeated word yields one reduction, not two.
    expect(phraseReductions('toggle toggle')).toEqual(['toggle']);
  });

  test('ZC44.d: contained candidate scores 0.8; disjoint candidate scores 0', () => {
    // candidate tokens ⊆ phrase tokens: 0.6·(1/1) + 0.4·(1/2) = 0.8
    expect(scoreNameAgainstPhrase('English', 'English language')).toBeCloseTo(0.8, 5);
    expect(scoreNameAgainstPhrase('Pricing', 'English language')).toBe(0);
  });

  test('ZC44.e: scoring ignores stopwords, case, and punctuation', () => {
    const bare = scoreNameAgainstPhrase('clear completed', 'Clear completed button');
    const noisy = scoreNameAgainstPhrase('Clear, Completed!', 'the Clear completed button');
    expect(noisy).toBeCloseTo(bare, 5);
    expect(bare).toBeGreaterThan(DOMINANCE_THRESHOLD);
  });

  test('ZC44.f: ranking is deterministic — score desc, visible first, name asc', () => {
    const ranked = rankCandidates('English language', [
      { name: 'Português', visible: true },
      { name: 'English', visible: false },
      { name: 'English', visible: true },
      { name: 'Deutsch', visible: true },
    ]);
    expect(ranked.map((c) => [c.name, c.visible])).toEqual([
      ['English', true],
      ['English', false],
      ['Deutsch', true],
      ['Português', true],
    ]);
  });

  test('ZC44.g: dominance selection enforces floor, visibility, and margin', () => {
    const accept = (cs: readonly ScoredCandidate[]) => selectDominantCandidate(cs);

    // Clean dominant: accepted.
    expect(
      accept([
        { name: 'English', visible: true, score: 0.8 },
        { name: 'Deutsch', visible: true, score: 0 },
      ])?.name,
    ).toBe('English');

    // Below the floor: rejected even when unrivaled.
    expect(accept([{ name: 'English', visible: true, score: 0.5 }])).toBeNull();

    // Hidden top candidate: rejected — evidence, not a target.
    expect(
      accept([
        { name: 'English', visible: false, score: 0.8 },
        { name: 'Deutsch', visible: true, score: 0 },
      ]),
    ).toBeNull();

    // Near-tied differently-named rival: ambiguous, rejected.
    expect(
      accept([
        { name: 'Clear completed', visible: true, score: 0.8 },
        { name: 'Completed', visible: true, score: 0.75 },
      ]),
    ).toBeNull();

    // Same-name duplicate does NOT block selection — the caller's
    // unique-match confirmation query arbitrates duplicates.
    expect(
      accept([
        { name: 'English', visible: true, score: 0.8 },
        { name: 'english', visible: true, score: 0.8 },
        { name: 'Deutsch', visible: true, score: 0 },
      ])?.name,
    ).toBe('English');
  });

  test('ZC44.h: CJK accessible names are opaque tokens — the kernel refuses to guess', () => {
    expect(normalizeNameTokens('日本語')).toEqual(['日本語']);
    expect(scoreNameAgainstPhrase('日本語', 'Japanese language')).toBe(0);
    const ranked = rankCandidates('Japanese language', [
      { name: '日本語', visible: true },
      { name: 'English', visible: true },
    ]);
    expect(selectDominantCandidate(ranked)).toBeNull();
  });
});
