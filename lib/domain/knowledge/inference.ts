import { normalizeHtmlText } from '../kernel/hash';
import { uniqueSorted } from '../kernel/collections';
import { ACTION_SYNONYMS } from '../widgets/role-affordances';
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

// ─── E1: Intent Decomposition ───

/** Decomposed intent tokens extracted from natural-language action text. */
export interface DecomposedIntent {
  readonly verb: string | null;
  readonly target: string | null;
  readonly data: string | null;
  readonly remainder: string;
}

/**
 * Build the inverted synonym index: synonym → canonical action verb.
 * Module-level constant, computed once.
 */
const SYNONYM_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, synonyms] of Object.entries(ACTION_SYNONYMS)) {
    map.set(canonical, canonical);
    for (const syn of synonyms) {
      map.set(syn, canonical);
    }
  }
  return map;
})();

/** All known verb tokens, sorted longest-first for greedy matching. */
const KNOWN_VERBS: readonly string[] = [...SYNONYM_TO_CANONICAL.keys()]
  .sort((a, b) => b.length - a.length);

/** Prepositions and articles to strip when isolating target from remainder. */
const FILLER_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'to', 'for', 'of', 'with', 'into', 'from',
  'at', 'by', 'as', 'is', 'and', 'or', 'that', 'this', 'its',
]);

/** Patterns that indicate data follows (e.g. "enter 'hello' in search field"). */
const DATA_PATTERNS: readonly RegExp[] = [
  /^['"](.+?)['"]/,           // quoted: 'value' or "value"
  /^(\d[\d.,]*)/,              // numeric: 42, 3.14
  /^(true|false|yes|no)\b/i,  // boolean
];

/**
 * Decompose compound action text into {verb, target, data} tokens.
 *
 * Examples:
 *   "Enter test data in search field" → { verb: "fill", target: "search field", data: "test data" }
 *   "Click the submit button"         → { verb: "click", target: "submit button", data: null }
 *   "Verify the policy number"        → { verb: "get-value", target: "policy number", data: null }
 *   "Hit the return to search"        → { verb: "click", target: "return to search", data: null }
 *
 * The verb is canonicalized via ACTION_SYNONYMS. Target is the remaining noun phrase
 * after stripping the verb, filler words, and any extracted data.
 */
export function decomposeIntent(normalizedText: string): DecomposedIntent {
  const tokens = tokenize(normalizedText);
  if (tokens.length === 0) {
    return { verb: null, target: null, data: null, remainder: normalizedText };
  }

  // Phase 1: Extract verb — try multi-word verbs first (e.g. "key in", "set to")
  let verb: string | null = null;
  let verbTokenCount = 0;

  for (const candidate of KNOWN_VERBS) {
    const candidateTokens = tokenize(candidate);
    const prefix = tokens.slice(0, candidateTokens.length).join(' ');
    if (prefix === candidate) {
      verb = SYNONYM_TO_CANONICAL.get(candidate) ?? null;
      verbTokenCount = candidateTokens.length;
      break;
    }
  }

  const afterVerb = tokens.slice(verbTokenCount).join(' ');

  // Phase 2: Extract data — look for quoted strings, numbers, or boolean literals
  let data: string | null = null;
  let afterData = afterVerb;

  for (const pattern of DATA_PATTERNS) {
    const match = afterVerb.match(pattern);
    if (match?.[1]) {
      data = match[1];
      afterData = afterVerb.slice(match[0].length).trim();
      break;
    }
  }

  // Phase 3: Extract target — strip filler words from what remains
  const targetTokens = tokenize(afterData).filter((t) => !FILLER_WORDS.has(t));
  const target = targetTokens.length > 0 ? targetTokens.join(' ') : null;

  return { verb, target, data, remainder: afterVerb };
}

// ─── E2: Synonym-Expanded Alias Matching ───

/**
 * Match normalized intent text against aliases, expanding verb synonyms.
 *
 * When the text contains a verb synonym (e.g. "enter"), also tries matching
 * with the canonical form ("fill") and all other synonyms ("type", "input", etc.).
 * This catches matches that flat string comparison misses:
 *   text="enter policy number" vs alias="type policy number" → match via synonym expansion.
 *
 * Returns the best match across all synonym variants.
 */
export function bestAliasMatchWithSynonyms(normalizedText: string, aliases: readonly string[]): AliasMatch | null {
  // Try the original text first
  const directMatch = bestAliasMatch(normalizedText, aliases);

  // Decompose to find the verb
  const decomposed = decomposeIntent(normalizedText);
  if (!decomposed.verb || !decomposed.target) {
    return directMatch;
  }

  // Generate verb-expanded variants
  const canonicalVerb = decomposed.verb;
  const allVerbForms = [canonicalVerb, ...(ACTION_SYNONYMS[canonicalVerb] ?? [])];
  const variants = allVerbForms.map((verbForm) => `${verbForm} ${decomposed.target}`);

  // Match each variant against aliases, track the best
  let best = directMatch;
  for (const variant of variants) {
    const normalized = normalizeIntentText(variant);
    const match = bestAliasMatch(normalized, aliases);
    if (match && (!best || match.score > best.score)) {
      best = match;
    }
  }

  return best;
}

// ─── E4: Knowledge Conflict Detection ───

/** A detected conflict where the same alias maps to different elements. */
export interface AliasConflict {
  readonly alias: string;
  readonly mappings: readonly { readonly screen: string; readonly element: string }[];
}

/**
 * Detect aliases that map to multiple different elements across screens.
 *
 * Ambiguous aliases degrade resolution quality because the same action text
 * could match different elements depending on context. This function scans
 * all screen hints and identifies aliases shared across different elements.
 *
 * Pure function: knowledge in, conflicts out.
 */
export function detectAliasConflicts(
  screenHints: Record<string, ScreenHints>,
): readonly AliasConflict[] {
  // Build alias → [(screen, element)] index
  const aliasIndex = new Map<string, { screen: string; element: string }[]>();

  for (const [_screenId, hints] of Object.entries(screenHints)) {
    const screen = hints.screen;
    const elements = hints.elements ?? {};
    for (const [elementId, elementHints] of Object.entries(elements)) {
      const aliases = (elementHints as { aliases?: readonly string[] }).aliases ?? [];
      for (const alias of aliases) {
        const normalized = normalizeIntentText(alias);
        if (!normalized) continue;
        const entries = aliasIndex.get(normalized) ?? [];
        entries.push({ screen, element: elementId });
        aliasIndex.set(normalized, entries);
      }
    }
  }

  // Find aliases that map to >1 distinct element
  const conflicts: AliasConflict[] = [];
  for (const [alias, mappings] of aliasIndex) {
    const uniqueMappings = mappings.filter((m, i) =>
      mappings.findIndex((other) => other.screen === m.screen && other.element === m.element) === i,
    );
    if (uniqueMappings.length > 1) {
      conflicts.push({ alias, mappings: uniqueMappings });
    }
  }

  return conflicts.sort((a, b) => b.mappings.length - a.mappings.length);
}
