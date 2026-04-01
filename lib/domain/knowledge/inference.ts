import { normalizeHtmlText } from '../kernel/hash';
import { uniqueSorted } from '../kernel/collections';
import type { ScreenElements, ScreenHints, ScreenPostures, SharedPatterns, SurfaceGraph } from '../types';

export interface InferenceKnowledge {
  surfaceGraphs: Record<string, SurfaceGraph>;
  screenElements: Record<string, ScreenElements>;
  screenHints: Record<string, ScreenHints>;
  screenPostures: Record<string, ScreenPostures>;
  sharedPatterns: SharedPatterns;
}

export function normalizeIntentText(value: string): string {
  return normalizeHtmlText(value).toLowerCase();
}

// ─── Alias matching (moved from runtime/agent/shared.ts) ───

export interface AliasMatch {
  alias: string;
  score: number;
}

export function humanizeIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Split text into word-boundary tokens, filtering empties. */
function tokenize(text: string): readonly string[] {
  return text.split(/[\s\-_./]+/).filter(Boolean);
}

/** Token-level Jaccard similarity: |intersection| / |union|, scaled to [0, 1]. */
function tokenJaccardScore(textTokens: readonly string[], aliasTokens: readonly string[]): number {
  if (aliasTokens.length === 0) return 0;
  const aliasSet = new Set(aliasTokens);
  const intersection = textTokens.filter((token) => aliasSet.has(token)).length;
  if (intersection === 0) return 0;
  const textSet = new Set(textTokens);
  const unionSize = new Set([...textSet, ...aliasSet]).size;
  return intersection / unionSize;
}

/**
 * Match normalized intent text against a set of aliases.
 *
 * Two scoring strategies are combined:
 * 1. **Substring containment** (original): alias is a substring of text → score = alias length
 * 2. **Token Jaccard** (new): word-level overlap between text and alias → score scaled by alias length
 *
 * The best match across both strategies wins. Token Jaccard catches semantic matches
 * that substring containment misses (e.g. "policy search button" ≈ "search button policy").
 */
export function bestAliasMatch(normalizedText: string, aliases: readonly string[]): AliasMatch | null {
  const textTokens = tokenize(normalizedText);
  return uniqueSorted(aliases.map((entry) => normalizeIntentText(entry)))
    .filter(Boolean)
    .reduce<AliasMatch | null>((best, alias) => {
      // Strategy 1: substring containment (original behavior)
      const substringScore = normalizedText.includes(alias) ? alias.length : 0;

      // Strategy 2: token-level Jaccard similarity, scaled by alias token count
      // This catches word-order-independent matches: "search policy" ≈ "policy search"
      const aliasTokens = tokenize(alias);
      const jaccard = tokenJaccardScore(textTokens, aliasTokens);
      const jaccardScore = jaccard > 0.3 ? jaccard * aliasTokens.length : 0;

      const score = Math.max(substringScore, jaccardScore);
      return score > 0 && (!best || score > best.score) ? { alias, score } : best;
    }, null);
}
