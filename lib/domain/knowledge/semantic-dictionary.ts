/**
 * Semantic Translation Dictionary — pure domain logic.
 *
 * All functions are pure: no mutation, no side effects, no I/O.
 * Persistence and Effect-based orchestration live in the application layer.
 */

import { contentFingerprint } from '../kernel/hash';
import { normalizeIntentText } from './inference';
import {
  addEntryToShingleIndex,
  buildShingleIndex,
  queryShingleIndex,
  shingleTermFrequencies,
  tfidfCosineSimilarity,
  blendedSimilarity,
  type ShingleIndex,
} from './shingles';
import type {
  SemanticDictionaryAccrualInput,
  SemanticDictionaryCatalog,
  SemanticDictionaryEntry,
  SemanticDictionaryMatch,
  SemanticDictionaryMatchScoring,
  SemanticDictionaryTarget,
  SemanticRetrievalContext,
} from './semantic-dictionary-types';

// ─── Constants ───

/** Minimum similarity score (blended Jaccard + TF-IDF) to consider a dictionary hit. */
const SIMILARITY_THRESHOLD = 0.45;

/** Minimum combined score (similarity × confidence) to use the entry. */
const COMBINED_SCORE_THRESHOLD = 0.35;

/** Initial confidence for a newly accrued entry. */
const INITIAL_CONFIDENCE = 0.5;

/** Higher initial confidence for DOM-sourced entries (ground truth from live page). */
const DOM_EXPLORATION_INITIAL_CONFIDENCE = 0.7;

/** Confidence boost per successful reuse. Diminishing: scaled by (1 - current). */
const SUCCESS_BOOST = 0.12;

/** Confidence penalty per failure. Aggressive: 2 failures from initial drops to ~0. */
const FAILURE_PENALTY = 0.3;

/** Confidence threshold above which an entry is considered high-confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/** Maximum entries before pruning lowest-confidence stale entries. */
const MAX_ENTRIES = 4096;

/** Top-N candidates from shingle pre-filter before full scoring. */
const TOP_N_CANDIDATES = 50;

/** Confidence below which stale entries become prunable. */
const PRUNE_CONFIDENCE_FLOOR = 0.2;

/** Maximum consecutive failures before an entry is suppressed from lookup. */
const MAX_CONSECUTIVE_FAILURES = 2;

// ─── Entry Identity ───

function entryId(normalizedIntent: string, target: SemanticDictionaryTarget): string {
  return `sem-${contentFingerprint({
    intent: normalizedIntent,
    screen: target.screen,
    element: target.element,
    action: target.action,
  })}`;
}

// ─── Token Jaccard ───

function tokenize(text: string): readonly string[] {
  return text.split(/[\s\-_./]+/).filter(Boolean);
}

function tokenJaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  if (intersection === 0) return 0;
  const unionSize = setA.size + setB.size - intersection;
  return intersection / unionSize;
}

// ─── Shingle Index ───

/**
 * Ensure the catalog has a built shingle index.
 * If the index is already present, returns the catalog as-is.
 * Otherwise, builds the index from entry intents and attaches it.
 */
export function ensureShingleIndex(catalog: SemanticDictionaryCatalog): SemanticDictionaryCatalog {
  if (catalog.shingleIndex && catalog.shingleIndex.stats.totalEntries === catalog.entries.length) {
    return catalog;
  }
  const corpus = catalog.entries.map((e) => ({ id: e.id, text: e.normalizedIntent }));
  const shingleIndex = buildShingleIndex(corpus);
  return { ...catalog, shingleIndex };
}

/**
 * Compute TF-IDF shingle similarity between a query and a specific entry.
 */
function shingleSimilarity(
  queryText: string,
  entryIdValue: string,
  index: ShingleIndex,
): number {
  const entryData = index.entries.get(entryIdValue);
  if (!entryData) return 0;
  const queryTf = shingleTermFrequencies(queryText);
  return tfidfCosineSimilarity(queryTf, entryData.tf, index.idfWeights);
}

// ─── Scoring Weights ───

const SCORING_WEIGHTS = {
  textSimilarity: 0.45,
  structuralScore: 0.25,
  confidence: 0.30,
} as const;

// ─── Structural Compatibility ───

function structuralCompatibility(
  entry: SemanticDictionaryEntry,
  context: SemanticRetrievalContext,
): number {
  let score = 0;
  let dimensions = 0;

  if (context.allowedActions.length > 0) {
    dimensions++;
    if (context.allowedActions.includes(entry.target.action)) {
      score += 1;
    }
  }

  if (context.availableScreens.length > 0) {
    dimensions++;
    if (context.currentScreen && entry.target.screen === context.currentScreen) {
      score += 1;
    } else if (context.availableScreens.includes(entry.target.screen)) {
      score += 0.6;
    }
  }

  if (context.activeRouteVariantRefs.length > 0 && entry.taskFingerprints.length > 0) {
    dimensions++;
    score += 0.5;
  }

  return dimensions > 0 ? score / dimensions : 0.5;
}

function passesGovernanceFilter(
  entry: SemanticDictionaryEntry,
  filter: SemanticRetrievalContext['governanceFilter'],
): boolean {
  switch (filter) {
    case 'approved-only':
      return entry.promoted || (entry.confidence >= HIGH_CONFIDENCE_THRESHOLD && entry.successCount >= 3);
    case 'include-review':
      return entry.confidence >= INITIAL_CONFIDENCE;
    case 'all':
      return true;
  }
}

// ─── Pre-filter ───

function preFilterCandidates(
  normalizedIntent: string,
  catalog: SemanticDictionaryCatalog,
  index: ShingleIndex,
  topN: number,
  context?: SemanticRetrievalContext,
): readonly SemanticDictionaryEntry[] {
  const shingleResults = queryShingleIndex(normalizedIntent, index, 0.05);
  const entryById = new Map(catalog.entries.map((e) => [e.id, e]));
  const eligible = new Set<string>();
  let collected = 0;
  for (const result of shingleResults) {
    if (collected >= topN) break;
    const entry = entryById.get(result.entryId);
    if (!entry) continue;
    if (context && !passesGovernanceFilter(entry, context.governanceFilter)) continue;
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) continue;
    eligible.add(result.entryId);
    collected++;
  }
  return catalog.entries.filter((e) => eligible.has(e.id));
}

// ─── Lookup ───

export interface SemanticLookupOptions {
  readonly similarityThreshold?: number;
  readonly combinedScoreThreshold?: number;
  readonly retrievalContext?: SemanticRetrievalContext;
  readonly topN?: number;
}

/**
 * Find the best semantic match for a normalised intent against the dictionary.
 * Pure function — no side effects.
 */
export function lookupSemanticDictionary(
  normalizedIntent: string,
  catalog: SemanticDictionaryCatalog,
  options?: SemanticLookupOptions,
): SemanticDictionaryMatch | null {
  const simThreshold = options?.similarityThreshold ?? SIMILARITY_THRESHOLD;
  const combinedThreshold = options?.combinedScoreThreshold ?? COMBINED_SCORE_THRESHOLD;
  const context = options?.retrievalContext;

  const queryTokens = tokenize(normalizeIntentText(normalizedIntent));
  if (queryTokens.length === 0) return null;

  const indexedCatalog = ensureShingleIndex(catalog);
  const index = indexedCatalog.shingleIndex;
  const topN = options?.topN ?? TOP_N_CANDIDATES;

  const candidateEntries = index && indexedCatalog.entries.length > topN
    ? preFilterCandidates(normalizedIntent, indexedCatalog, index, topN, context)
    : indexedCatalog.entries.slice(0, topN);

  let best: SemanticDictionaryMatch | null = null;

  for (const entry of candidateEntries) {
    if (context && !passesGovernanceFilter(entry, context.governanceFilter)) continue;
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) continue;

    const entryTokens = tokenize(normalizeIntentText(entry.normalizedIntent));
    const jaccardScore = tokenJaccard(queryTokens, entryTokens);

    const tfidfScore = index
      ? shingleSimilarity(normalizedIntent, entry.id, index)
      : 0;

    const textSimilarity = index
      ? blendedSimilarity(jaccardScore, tfidfScore)
      : jaccardScore;

    if (textSimilarity < simThreshold) continue;

    if (context) {
      const structuralScore = structuralCompatibility(entry, context);
      const confidence = entry.confidence;
      const combined =
        SCORING_WEIGHTS.textSimilarity * textSimilarity
        + SCORING_WEIGHTS.structuralScore * structuralScore
        + SCORING_WEIGHTS.confidence * confidence;

      if (combined < combinedThreshold) continue;

      const scoring: SemanticDictionaryMatchScoring = {
        textSimilarity,
        structuralScore,
        confidence,
        combined,
      };

      if (!best || combined > best.combinedScore) {
        best = { entry, similarityScore: textSimilarity, combinedScore: combined, scoring };
      }
    } else {
      const combinedScore = textSimilarity * entry.confidence;
      if (combinedScore < combinedThreshold) continue;
      if (!best || combinedScore > best.combinedScore) {
        best = { entry, similarityScore: textSimilarity, combinedScore };
      }
    }
  }

  return best;
}

// ─── Catalog Mutations (pure — return new objects) ───

function round(value: number): number {
  return Number(value.toFixed(4));
}

const MAX_TASK_FINGERPRINTS = 50;

function uniqueAppend(arr: readonly string[], value: string): readonly string[] {
  if (arr.includes(value)) return arr;
  const appended = [...arr, value];
  return appended.length > MAX_TASK_FINGERPRINTS
    ? appended.slice(appended.length - MAX_TASK_FINGERPRINTS)
    : appended;
}

function rebuildCatalog(
  entries: readonly SemanticDictionaryEntry[],
  existingIndex?: ShingleIndex | undefined,
): SemanticDictionaryCatalog {
  const highConfidence = entries.filter((e) => e.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
  const promoted = entries.filter((e) => e.promoted).length;
  const totalConfidence = entries.reduce((sum, e) => sum + e.confidence, 0);
  const shingleIndex = existingIndex && existingIndex.stats.totalEntries === entries.length
    ? existingIndex
    : undefined;
  return {
    kind: 'semantic-dictionary-catalog',
    version: 1,
    generatedAt: new Date().toISOString(),
    entries,
    summary: {
      totalEntries: entries.length,
      highConfidenceCount: highConfidence,
      promotedCount: promoted,
      averageConfidence: entries.length > 0 ? round(totalConfidence / entries.length) : 0,
    },
    shingleIndex,
  };
}

export function accrueSemanticEntry(
  catalog: SemanticDictionaryCatalog,
  input: SemanticDictionaryAccrualInput,
): SemanticDictionaryCatalog {
  const normalized = normalizeIntentText(input.normalizedIntent);
  const id = entryId(normalized, input.target);
  const now = new Date().toISOString();

  const existing = catalog.entries.find((e) => e.id === id);

  if (existing) {
    const boostedConfidence = Math.min(0.99, existing.confidence + SUCCESS_BOOST * (1 - existing.confidence));
    const updated: SemanticDictionaryEntry = {
      ...existing,
      confidence: round(boostedConfidence),
      successCount: existing.successCount + 1,
      lastUsedAt: now,
      taskFingerprints: uniqueAppend(existing.taskFingerprints, input.taskFingerprint),
      knowledgeFingerprint: input.knowledgeFingerprint,
    };
    return rebuildCatalog(
      catalog.entries.map((e) => e.id === id ? updated : e),
      catalog.shingleIndex,
    );
  }

  const entry: SemanticDictionaryEntry = {
    id,
    version: 1,
    normalizedIntent: normalized,
    target: input.target,
    provenance: input.provenance,
    winningSource: input.winningSource,
    confidence: input.provenance === 'dom-exploration' ? DOM_EXPLORATION_INITIAL_CONFIDENCE : INITIAL_CONFIDENCE,
    successCount: 1,
    failureCount: 0,
    consecutiveFailures: 0,
    createdAt: now,
    lastUsedAt: now,
    taskFingerprints: [input.taskFingerprint],
    knowledgeFingerprint: input.knowledgeFingerprint,
    promoted: false,
  };
  const updatedIndex = catalog.shingleIndex
    ? addEntryToShingleIndex(catalog.shingleIndex, { id, text: normalized })
    : undefined;
  return rebuildCatalog([...catalog.entries, entry], updatedIndex);
}

export function recordSemanticSuccess(catalog: SemanticDictionaryCatalog, entryIdValue: string): SemanticDictionaryCatalog {
  const now = new Date().toISOString();
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === entryIdValue
      ? {
          ...e,
          confidence: round(Math.min(0.99, e.confidence + SUCCESS_BOOST * (1 - e.confidence))),
          successCount: e.successCount + 1,
          consecutiveFailures: 0,
          lastUsedAt: now,
        }
      : e,
  ), catalog.shingleIndex);
}

export function recordSemanticFailure(catalog: SemanticDictionaryCatalog, failedEntryId: string): SemanticDictionaryCatalog {
  const now = new Date().toISOString();
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === failedEntryId
      ? {
          ...e,
          confidence: round(Math.max(0, e.confidence - FAILURE_PENALTY)),
          failureCount: e.failureCount + 1,
          consecutiveFailures: e.consecutiveFailures + 1,
          lastUsedAt: now,
        }
      : e,
  ), catalog.shingleIndex);
}

export function markPromoted(catalog: SemanticDictionaryCatalog, promotedEntryId: string): SemanticDictionaryCatalog {
  return rebuildCatalog(catalog.entries.map((e) =>
    promotedEntryId === e.id ? { ...e, promoted: true } : e,
  ), catalog.shingleIndex);
}

/** Stale promoted entries older than this TTL (ms) become prunable. */
const PROMOTED_STALE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function pruneSemanticDictionary(
  catalog: SemanticDictionaryCatalog,
  maxEntries: number = MAX_ENTRIES,
): SemanticDictionaryCatalog {
  if (catalog.entries.length <= maxEntries) return catalog;
  const now = Date.now();
  const sorted = [...catalog.entries].sort((a, b) => {
    const aStale = a.promoted && (now - new Date(a.lastUsedAt).getTime()) > PROMOTED_STALE_TTL_MS;
    const bStale = b.promoted && (now - new Date(b.lastUsedAt).getTime()) > PROMOTED_STALE_TTL_MS;
    const aProtected = a.promoted && !aStale;
    const bProtected = b.promoted && !bStale;
    if (aProtected !== bProtected) return aProtected ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.lastUsedAt.localeCompare(b.lastUsedAt);
  });
  const pruned = sorted.slice(0, maxEntries);
  const corpus = pruned.map((e) => ({ id: e.id, text: e.normalizedIntent }));
  const newIndex = buildShingleIndex(corpus);
  return rebuildCatalog(pruned, newIndex);
}

export function promotionCandidates(catalog: SemanticDictionaryCatalog): readonly SemanticDictionaryEntry[] {
  return catalog.entries.filter((e) =>
    !e.promoted
    && e.confidence >= HIGH_CONFIDENCE_THRESHOLD
    && e.successCount >= 3,
  );
}

/** Confidence boost for execution-validated successes (DOM state change confirmed). */
const VALIDATED_SUCCESS_BOOST = 0.18;

/** Per-iteration decay rate for entries not used in the current iteration. */
const UNUSED_DECAY_RATE = 0.03;

/** Minimum confidence floor below which decayed entries are removed entirely. */
const DECAY_REMOVAL_FLOOR = 0.05;

/**
 * Record a validated success — the action executed AND the DOM state changed as expected.
 * Gives a stronger confidence boost than a plain execution success because it confirms
 * the semantic mapping was correct, not just that the element was clickable.
 */
export function recordValidatedSuccess(catalog: SemanticDictionaryCatalog, entryIdValue: string): SemanticDictionaryCatalog {
  const now = new Date().toISOString();
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === entryIdValue
      ? {
          ...e,
          confidence: round(Math.min(0.99, e.confidence + VALIDATED_SUCCESS_BOOST * (1 - e.confidence))),
          successCount: e.successCount + 1,
          consecutiveFailures: 0,
          lastUsedAt: now,
        }
      : e,
  ), catalog.shingleIndex);
}

/**
 * Apply confidence decay to entries not used in the current iteration.
 *
 * Entries that were used (lastUsedAt >= iterationStartTime) are untouched.
 * Unused entries lose a small amount of confidence per iteration, preventing
 * stale mappings from persisting indefinitely. Entries that decay below the
 * removal floor are pruned.
 *
 * Pure function: catalog + timestamp → decayed catalog.
 */
export function decayUnusedEntries(
  catalog: SemanticDictionaryCatalog,
  iterationStartTime: string,
): SemanticDictionaryCatalog {
  const startMs = new Date(iterationStartTime).getTime();
  const decayed = catalog.entries
    .map((e) => {
      const usedInIteration = new Date(e.lastUsedAt).getTime() >= startMs;
      if (usedInIteration || e.promoted) return e;
      const newConfidence = round(Math.max(0, e.confidence - UNUSED_DECAY_RATE));
      return { ...e, confidence: newConfidence };
    })
    .filter((e) => e.confidence >= DECAY_REMOVAL_FLOOR || e.promoted);
  return rebuildCatalog(decayed);
}

export function emptyCatalog(): SemanticDictionaryCatalog {
  return {
    kind: 'semantic-dictionary-catalog',
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: [],
    summary: { totalEntries: 0, highConfidenceCount: 0, promotedCount: 0, averageConfidence: 0 },
  };
}
