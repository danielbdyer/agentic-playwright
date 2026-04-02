/**
 * Semantic Dictionary Cache — caches lookups within a single scenario run
 * to avoid redundant dictionary searches for similar intents.
 *
 * When steps in the same scenario share similar intents (e.g., multiple
 * "click the search button" variants), the dictionary lookup produces
 * the same result. Caching by normalized intent avoids re-scoring all
 * dictionary entries for each step.
 *
 * Cache is scoped to a scenario run and invalidated between runs.
 * Pure key-value cache — no side effects beyond memoization.
 */

import type { SemanticDictionaryMatch } from '../../domain/types';

export interface SemanticDictCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

export interface SemanticDictCache {
  /** Look up a cached dictionary match by normalized intent. */
  get(normalizedIntent: string): SemanticDictionaryMatch | null | undefined;
  /** Store a dictionary lookup result (including null = no match). */
  set(normalizedIntent: string, match: SemanticDictionaryMatch | null): void;
  /** Check whether a result is cached for the given intent. */
  has(normalizedIntent: string): boolean;
  /** Clear all cached entries (between scenarios). */
  clear(): void;
  /** Diagnostics. */
  readonly stats: SemanticDictCacheStats;
}

/**
 * Create a scoped semantic dictionary cache.
 *
 * maxEntries caps memory usage — LRU-style eviction when full.
 * Default: 200 entries (well above typical scenario step counts).
 */
export function createSemanticDictCache(maxEntries: number = 200): SemanticDictCache {
  const cache = new Map<string, SemanticDictionaryMatch | null>();
  let hits = 0;
  let misses = 0;

  return {
    get(normalizedIntent: string): SemanticDictionaryMatch | null | undefined {
      if (cache.has(normalizedIntent)) {
        hits++;
        return cache.get(normalizedIntent) ?? null;
      }
      misses++;
      return undefined;
    },

    set(normalizedIntent: string, match: SemanticDictionaryMatch | null): void {
      // Simple eviction: clear oldest half when at capacity
      if (cache.size >= maxEntries) {
        const keysToRemove = [...cache.keys()].slice(0, Math.floor(maxEntries / 2));
        for (const key of keysToRemove) {
          cache.delete(key);
        }
      }
      cache.set(normalizedIntent, match);
    },

    has(normalizedIntent: string): boolean {
      return cache.has(normalizedIntent);
    },

    clear(): void {
      cache.clear();
      hits = 0;
      misses = 0;
    },

    get stats(): SemanticDictCacheStats {
      return { hits, misses, size: cache.size };
    },
  };
}
