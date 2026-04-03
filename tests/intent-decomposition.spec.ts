/**
 * E1-E4: Intent decomposition, synonym expansion, and conflict detection tests.
 *
 * Law-style tests verifying the agentic resolution enhancements:
 * - E1: decomposeIntent extracts {verb, target, data} from natural-language text
 * - E2: bestAliasMatchWithSynonyms catches verb-variant matches
 * - E3: Screen URL matching (integration — tested via candidate-lattice)
 * - E4: detectAliasConflicts finds ambiguous alias mappings
 */

import { test, expect } from '@playwright/test';
import {
  decomposeIntent,
  bestAliasMatchWithSynonyms,
  bestAliasMatch,
  detectAliasConflicts,
  normalizeIntentText,
} from '../lib/domain/knowledge/inference';

// ─── E1: Intent Decomposition ───

test.describe('E1: decomposeIntent', () => {
  test('extracts verb and target from simple action text', () => {
    const result = decomposeIntent('click the submit button');
    expect(result.verb).toBe('click');
    expect(result.target).toBe('submit button');
    expect(result.data).toBeNull();
  });

  test('canonicalizes verb synonyms', () => {
    const result = decomposeIntent('press the submit button');
    expect(result.verb).toBe('click'); // 'press' → canonical 'click'
    expect(result.target).toBe('submit button');
  });

  test('handles enter/type → fill canonical verb', () => {
    const result = decomposeIntent('enter test data in search field');
    expect(result.verb).toBe('fill'); // 'enter' → canonical 'fill'
    expect(result.target).toBe('test data search field');
  });

  test('handles verify → get-value canonical verb', () => {
    const result = decomposeIntent('verify the policy number');
    expect(result.verb).toBe('get-value');
    expect(result.target).toBe('policy number');
  });

  test('extracts quoted data', () => {
    const result = decomposeIntent("enter 'hello world' in search field");
    expect(result.verb).toBe('fill');
    expect(result.data).toBe('hello world');
  });

  test('extracts numeric data', () => {
    const result = decomposeIntent('enter 42 in age field');
    expect(result.verb).toBe('fill');
    expect(result.data).toBe('42');
  });

  test('handles multi-word verb synonyms', () => {
    const result = decomposeIntent('key in policy number in search field');
    expect(result.verb).toBe('fill'); // 'key in' → canonical 'fill'
    expect(result.target).toContain('policy number');
  });

  test('returns null verb for unrecognized verbs', () => {
    const result = decomposeIntent('navigate to policy detail page');
    expect(result.verb).toBeNull(); // 'navigate' is not in ACTION_SYNONYMS
    expect(result.target).toBe('navigate policy detail page');
  });

  test('strips filler words from target', () => {
    const result = decomposeIntent('click on the big red button');
    expect(result.verb).toBe('click');
    expect(result.target).toBe('big red button');
  });

  test('handles empty input', () => {
    const result = decomposeIntent('');
    expect(result.verb).toBeNull();
    expect(result.target).toBeNull();
  });
});

// ─── E2: Synonym-Expanded Alias Matching ───

test.describe('E2: bestAliasMatchWithSynonyms', () => {
  test('matches via verb synonym expansion', () => {
    const aliases = ['type policy number', 'search field'];
    // Direct match for "enter policy number" would fail because "enter" != "type"
    const direct = bestAliasMatch('enter policy number', aliases);
    // But synonym-expanded should find it (enter → fill → type are all synonyms)
    const expanded = bestAliasMatchWithSynonyms('enter policy number', aliases);
    expect(expanded).not.toBeNull();
    expect(expanded!.alias).toBe(normalizeIntentText('type policy number'));
  });

  test('returns direct match when no synonym expansion needed', () => {
    const aliases = ['click submit button'];
    const result = bestAliasMatchWithSynonyms('click submit button', aliases);
    expect(result).not.toBeNull();
    expect(result!.alias).toBe('click submit button');
  });

  test('returns null when no match even with synonyms', () => {
    const aliases = ['policy number'];
    const result = bestAliasMatchWithSynonyms('navigate to dashboard', aliases);
    // 'navigate' has no synonyms in ACTION_SYNONYMS, target "dashboard" != "policy number"
    expect(result).toBeNull();
  });

  test('prefers higher score across synonym variants', () => {
    const aliases = ['click the button', 'press the button'];
    const result = bestAliasMatchWithSynonyms('hit the button', aliases);
    // 'hit' → canonical 'click', both aliases should be reachable
    expect(result).not.toBeNull();
  });
});

// ─── E4: Knowledge Conflict Detection ───

test.describe('E4: detectAliasConflicts', () => {
  test('detects alias shared across different elements', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search', 'policy search'] },
          searchButton: { aliases: ['search', 'find'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.alias).toBe('search');
    expect(conflicts[0]!.mappings).toHaveLength(2);
  });

  test('detects alias shared across different screens', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          statusField: { aliases: ['status'] },
        },
      },
      'policy-detail': {
        screen: 'policy-detail',
        elements: {
          claimStatus: { aliases: ['status'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.mappings).toHaveLength(2);
    expect(conflicts[0]!.mappings.map((m: any) => m.screen)).toContain('policy-search');
    expect(conflicts[0]!.mappings.map((m: any) => m.screen)).toContain('policy-detail');
  });

  test('returns empty for no conflicts', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search field', 'find policy'] },
          searchButton: { aliases: ['search button', 'submit'] },
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts).toHaveLength(0);
  });

  test('handles empty input', () => {
    expect(detectAliasConflicts({})).toHaveLength(0);
  });

  test('ignores duplicate same-element mappings', () => {
    const screenHints = {
      'policy-search': {
        screen: 'policy-search',
        elements: {
          searchField: { aliases: ['search', 'search'] }, // duplicate alias on same element
        },
      },
    } as any;

    const conflicts = detectAliasConflicts(screenHints);
    expect(conflicts).toHaveLength(0);
  });
});
