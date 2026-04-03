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

// ─── E1/E2: Intent Decomposition & Synonym Expansion ───
//
// Intent decomposition and synonym expansion are LLM-mediated concerns.
// The LLM decomposes natural-language action text into structured tokens
// and proposes alias expansions — see IntentDecomposition below and
// the translation contract in lib/runtime/agent/types.ts.
//
// The deterministic pipeline's role is to:
// 1. Present structured context to the LLM (screens, elements, aliases)
// 2. Accept the LLM's decomposition as a typed schema
// 3. Persist the LLM's proposals as small deterministic knowledge additions
//
// This keeps comprehension where it belongs (frontier AI) while the
// pipeline handles structure, activation, and governance.

/**
 * LLM-produced intent decomposition. The translation provider returns this
 * when asked to decompose a step's action text. The pipeline uses it to
 * generate targeted proposals and improve future deterministic matching.
 *
 * Pure data type — no behavior. The LLM fills it, the pipeline consumes it.
 */
export interface IntentDecomposition {
  /** Canonical action verb (e.g. "click", "fill", "navigate", "verify"). */
  readonly verb: string | null;
  /** Target noun phrase — the element or screen being acted on. */
  readonly target: string | null;
  /** Embedded data value, if any (e.g. "POL-001" from "Enter POL-001 in search"). */
  readonly data: string | null;
  /** Synonym variants the LLM suggests for the same intent. */
  readonly suggestedAliases: readonly string[];
  /** Confidence the LLM has in this decomposition. */
  readonly confidence: number;
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
