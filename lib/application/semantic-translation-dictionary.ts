/**
 * Semantic Translation Dictionary — the learning flywheel.
 *
 * Every successful LLM interpretation decision (translation, DOM exploration,
 * agent interpretation) accrues into this dictionary.  Unlike the existing
 * exact-hash caches, lookup here uses token-level Jaccard similarity so
 * semantically equivalent phrasings resolve without a fresh LLM call.
 *
 * Lifecycle:
 *   1. Resolution pipeline attempts semantic dictionary lookup (new rung).
 *   2. On hit: reuse stored target, bump confidence + successCount.
 *   3. On miss: fall through to overlay / translation / DOM / agent rungs.
 *   4. After a successful resolution from a later rung, accrue the decision
 *      into the dictionary so the *next* run benefits.
 *   5. On execution failure for a dictionary-sourced target, record failure
 *      (decays confidence).
 *   6. High-confidence entries can be promoted to approved knowledge artifacts.
 *
 * The dictionary is persisted as a single JSON index file under
 * `.tesseract/semantic-dictionary/index.json` and is loaded into memory
 * at the start of each resolution session.
 */

import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { normalizeIntentText } from '../domain/knowledge/inference';
import {
  addEntryToShingleIndex,
  buildShingleIndex,
  deserializeShingleIndex,
  queryShingleIndex,
  serializeShingleIndex,
  shingleTermFrequencies,
  tfidfCosineSimilarity,
  blendedSimilarity,
  type ShingleIndex,
  type SerializedShingleIndex,
} from '../domain/knowledge/shingles';
import type {
  SemanticDictionaryAccrualInput,
  SemanticDictionaryCatalog,
  SemanticDictionaryEntry,
  SemanticDictionaryMatch,
  SemanticDictionaryMatchScoring,
  SemanticDictionaryTarget,
  SemanticRetrievalContext,
} from '../domain/types';
import { FileSystem } from './ports';
import type { ProjectPaths } from './paths';

// ─── Constants ───

/** Minimum similarity score (blended Jaccard + TF-IDF) to consider a dictionary hit. */
const SIMILARITY_THRESHOLD = 0.45;

/** Minimum combined score (similarity × confidence) to use the entry. */
const COMBINED_SCORE_THRESHOLD = 0.35;

/** Initial confidence for a newly accrued entry. */
const INITIAL_CONFIDENCE = 0.5;

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

// ─── Entry Identity ───

function entryId(normalizedIntent: string, target: SemanticDictionaryTarget): string {
  return `sem-${sha256(stableStringify({
    intent: normalizedIntent,
    screen: target.screen,
    element: target.element,
    action: target.action,
  }))}`;
}

// ─── Token Jaccard (shared with domain/inference.ts, inlined for independence) ───

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
 *
 * Call this after loading the catalog from disk (Maps don't survive JSON
 * serialization) and before the first lookup in a resolution session.
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
 * Compute TF-IDF shingle similarity between a query and a specific entry,
 * using the catalog's shingle index.
 */
function shingleSimilarity(
  queryText: string,
  entryId: string,
  index: ShingleIndex,
): number {
  const entryData = index.entries.get(entryId);
  if (!entryData) return 0;
  const queryTf = shingleTermFrequencies(queryText);
  return tfidfCosineSimilarity(queryTf, entryData.tf, index.idfWeights);
}

// ─── Scoring Weights ───

/** Weights for the multi-dimensional scoring blend. */
const SCORING_WEIGHTS = {
  textSimilarity: 0.45,
  structuralScore: 0.25,
  confidence: 0.30,
} as const;

// ─── Structural Compatibility ───

/**
 * Score how structurally compatible an entry is with the current resolution
 * context. Considers action feasibility, screen proximity, and route overlap.
 *
 * Returns a score in [0, 1] where 1 = perfect structural match.
 */
function structuralCompatibility(
  entry: SemanticDictionaryEntry,
  context: SemanticRetrievalContext,
): number {
  let score = 0;
  let dimensions = 0;

  // Action compatibility: does the entry's action match allowed actions?
  if (context.allowedActions.length > 0) {
    dimensions++;
    if (context.allowedActions.includes(entry.target.action)) {
      score += 1;
    }
  }

  // Screen proximity: is the entry's screen the current screen, or at least available?
  if (context.availableScreens.length > 0) {
    dimensions++;
    if (context.currentScreen && entry.target.screen === context.currentScreen) {
      score += 1; // Best: same screen we're already on
    } else if (context.availableScreens.includes(entry.target.screen)) {
      score += 0.6; // Good: screen exists in knowledge
    }
    // else: 0 — screen not available, structurally dubious
  }

  // Route variant overlap: does the entry's screen share route context?
  // (Entries from the same navigation flow are more likely to be correct)
  if (context.activeRouteVariantRefs.length > 0 && entry.taskFingerprints.length > 0) {
    dimensions++;
    // Approximate: entries from the same task fingerprint likely share route context
    // This is a rough signal — exact route overlap would require storing routes on entries
    score += 0.5; // Neutral: we have route context but can't fully verify
  }

  return dimensions > 0 ? score / dimensions : 0.5; // Default neutral when no context
}

/**
 * Check governance filter. Currently entries don't carry governance state
 * directly, but we can infer it from provenance and confidence:
 * - High-confidence + promoted = approved
 * - High-confidence + unpromoted = review-required (auto-suggested)
 * - Low-confidence = informational only
 */
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

/** Maximum consecutive failures before an entry is suppressed from lookup. */
const MAX_CONSECUTIVE_FAILURES = 2;

/**
 * Pre-filter candidates using the shingle index for O(N) fast cosine,
 * then return only the top-N entries for full multi-dimensional scoring.
 * This avoids O(N × full_scoring) when catalog is large.
 */
function preFilterCandidates(
  normalizedIntent: string,
  catalog: SemanticDictionaryCatalog,
  index: ShingleIndex,
  topN: number,
  context?: SemanticRetrievalContext,
): readonly SemanticDictionaryEntry[] {
  // Get candidates by TF-IDF similarity (sorted descending by score)
  const shingleResults = queryShingleIndex(normalizedIntent, index, 0.05);

  // Build a lookup of entry eligibility — governance and failure filters
  // are applied BEFORE the top-N slice to avoid losing valid candidates
  // that would be displaced by ineligible high-TF-IDF entries.
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

  // Return matching catalog entries, preserving catalog order
  return catalog.entries.filter((e) => eligible.has(e.id));
}

// ─── Lookup ───

export interface SemanticLookupOptions {
  readonly similarityThreshold?: number;
  readonly combinedScoreThreshold?: number;
  /** Structural context for multi-dimensional scoring. */
  readonly retrievalContext?: SemanticRetrievalContext;
  /** Maximum entries to consider (top-N retrieval). */
  readonly topN?: number;
}

/**
 * Find the best semantic match for a normalised intent against the dictionary.
 *
 * When a `retrievalContext` is provided, scoring blends text similarity with
 * structural compatibility (action feasibility, screen proximity, route overlap)
 * and governance state filtering. This moves from pure text matching to
 * memory-informed intent resolution.
 *
 * Returns the highest combined-score entry above both thresholds, or null.
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

  // Lazily ensure the shingle index is built for TF-IDF scoring
  const indexedCatalog = ensureShingleIndex(catalog);
  const index = indexedCatalog.shingleIndex;
  const topN = options?.topN ?? TOP_N_CANDIDATES;

  // Pre-filter: use shingle index to get top-N candidates by TF-IDF,
  // then score only those with full multi-dimensional scoring.
  // Falls back to capped scan when no index is available.
  const candidateEntries = index && indexedCatalog.entries.length > topN
    ? preFilterCandidates(normalizedIntent, indexedCatalog, index, topN, context)
    : indexedCatalog.entries.slice(0, topN);

  let best: SemanticDictionaryMatch | null = null;

  for (const entry of candidateEntries) {
    // Governance gate: skip entries that don't pass the filter
    if (context && !passesGovernanceFilter(entry, context.governanceFilter)) continue;
    // Suppress poisoned entries with consecutive failures
    if (entry.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) continue;

    const entryTokens = tokenize(normalizeIntentText(entry.normalizedIntent));
    const jaccardScore = tokenJaccard(queryTokens, entryTokens);

    // Compute TF-IDF shingle similarity when index is available
    const tfidfScore = index
      ? shingleSimilarity(normalizedIntent, entry.id, index)
      : 0;

    // Blend Jaccard + TF-IDF into the composite text similarity score.
    const textSimilarity = index
      ? blendedSimilarity(jaccardScore, tfidfScore)
      : jaccardScore;

    if (textSimilarity < simThreshold) continue;

    if (context) {
      // Multi-dimensional scoring
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
        best = {
          entry,
          similarityScore: textSimilarity,
          combinedScore: combined,
          scoring,
        };
      }
    } else {
      // Legacy: text similarity × confidence only
      const combinedScore = textSimilarity * entry.confidence;
      if (combinedScore < combinedThreshold) continue;

      if (!best || combinedScore > best.combinedScore) {
        best = { entry, similarityScore: textSimilarity, combinedScore };
      }
    }
  }

  return best;
}

// ─── Accrual ───

/**
 * Accrue a successful resolution decision into the dictionary.
 *
 * If an entry with the same id already exists, its confidence, success count,
 * and lineage are updated.  Otherwise a new entry is created.
 *
 * Returns the updated catalog (new object, no mutation).
 */
export function accrueSemanticEntry(
  catalog: SemanticDictionaryCatalog,
  input: SemanticDictionaryAccrualInput,
): SemanticDictionaryCatalog {
  const normalized = normalizeIntentText(input.normalizedIntent);
  const id = entryId(normalized, input.target);
  const now = new Date().toISOString();

  const existing = catalog.entries.find((e) => e.id === id);

  if (existing) {
    // Reinforce: diminishing confidence boost, append task fingerprint
    const boostedConfidence = Math.min(0.99, existing.confidence + SUCCESS_BOOST * (1 - existing.confidence));
    const updated: SemanticDictionaryEntry = {
      ...existing,
      confidence: round(boostedConfidence),
      successCount: existing.successCount + 1,
      lastUsedAt: now,
      taskFingerprints: uniqueAppend(existing.taskFingerprints, input.taskFingerprint),
      knowledgeFingerprint: input.knowledgeFingerprint,
    };
    // Entry set unchanged — preserve existing shingle index
    return rebuildCatalog(
      catalog.entries.map((e) => e.id === id ? updated : e),
      catalog.shingleIndex,
    );
  }

  // New entry
  const entry: SemanticDictionaryEntry = {
    id,
    version: 1,
    normalizedIntent: normalized,
    target: input.target,
    provenance: input.provenance,
    winningSource: input.winningSource,
    confidence: INITIAL_CONFIDENCE,
    successCount: 1,
    failureCount: 0,
    consecutiveFailures: 0,
    createdAt: now,
    lastUsedAt: now,
    taskFingerprints: [input.taskFingerprint],
    knowledgeFingerprint: input.knowledgeFingerprint,
    promoted: false,
  };
  // Incrementally update shingle index instead of full rebuild
  const updatedIndex = catalog.shingleIndex
    ? addEntryToShingleIndex(catalog.shingleIndex, { id, text: normalized })
    : undefined;
  return rebuildCatalog([...catalog.entries, entry], updatedIndex);
}

/**
 * Record a reuse success: the dictionary-sourced target executed without error.
 */
export function recordSemanticSuccess(catalog: SemanticDictionaryCatalog, entryId: string): SemanticDictionaryCatalog {
  const now = new Date().toISOString();
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === entryId
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

/**
 * Record a reuse failure: the dictionary-sourced target led to an execution error.
 */
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

/**
 * Mark an entry as promoted to approved knowledge.
 */
export function markPromoted(catalog: SemanticDictionaryCatalog, promotedEntryId: string): SemanticDictionaryCatalog {
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === promotedEntryId ? { ...e, promoted: true } : e,
  ), catalog.shingleIndex);
}

/**
 * Prune the catalog to MAX_ENTRIES, removing lowest-confidence entries first.
 */
/** Stale promoted entries older than this TTL (ms) become prunable. */
const PROMOTED_STALE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function pruneSemanticDictionary(
  catalog: SemanticDictionaryCatalog,
  maxEntries: number = MAX_ENTRIES,
): SemanticDictionaryCatalog {
  if (catalog.entries.length <= maxEntries) return catalog;
  const now = Date.now();
  const sorted = [...catalog.entries].sort((a, b) => {
    // TTL-based demotion: promoted entries unused for 90+ days lose priority
    const aStale = a.promoted && (now - new Date(a.lastUsedAt).getTime()) > PROMOTED_STALE_TTL_MS;
    const bStale = b.promoted && (now - new Date(b.lastUsedAt).getTime()) > PROMOTED_STALE_TTL_MS;
    // Non-stale promoted entries sort first; stale promoted entries lose their shield
    const aProtected = a.promoted && !aStale;
    const bProtected = b.promoted && !bStale;
    if (aProtected !== bProtected) return aProtected ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.lastUsedAt.localeCompare(b.lastUsedAt); // oldest first among equal confidence
  });
  const pruned = sorted.slice(0, maxEntries);
  // Proactively rebuild shingle index for the surviving entries
  const corpus = pruned.map((e) => ({ id: e.id, text: e.normalizedIntent }));
  const newIndex = buildShingleIndex(corpus);
  return rebuildCatalog(pruned, newIndex);
}

/**
 * Entries eligible for promotion to approved knowledge.
 */
export function promotionCandidates(catalog: SemanticDictionaryCatalog): readonly SemanticDictionaryEntry[] {
  return catalog.entries.filter((e) =>
    !e.promoted
    && e.confidence >= HIGH_CONFIDENCE_THRESHOLD
    && e.successCount >= 3,
  );
}

// ─── Persistence (Effect-based) ───

/**
 * Serializable form of the catalog for JSON persistence.
 * Strips the in-memory ShingleIndex and replaces it with its
 * serialized counterpart (Maps → arrays of [key, value] tuples).
 */
interface SerializableSemanticDictionaryCatalog {
  readonly kind: 'semantic-dictionary-catalog';
  readonly version: 1;
  readonly generatedAt: string;
  readonly entries: readonly SemanticDictionaryEntry[];
  readonly summary: SemanticDictionaryCatalog['summary'];
  readonly serializedShingleIndex?: SerializedShingleIndex | undefined;
}

export function readSemanticDictionary(paths: ProjectPaths): Effect.Effect<SemanticDictionaryCatalog, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(paths.semanticDictionaryIndexPath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed(false)),
    );
    if (!exists) return emptyCatalog();
    const raw = yield* fs.readJson(paths.semanticDictionaryIndexPath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed(null)),
    );
    if (!isSemanticDictionaryCatalog(raw)) return emptyCatalog();

    // Reconstruct in-memory ShingleIndex from serialized form
    const serializable = raw as unknown as SerializableSemanticDictionaryCatalog;
    const shingleIndex = serializable.serializedShingleIndex
      ? deserializeShingleIndex(serializable.serializedShingleIndex)
      : undefined;

    return { ...raw, shingleIndex };
  }).pipe(Effect.catchAll(() => Effect.succeed(emptyCatalog())));
}

/** Advisory lock timeout: abandon stale locks older than 30s. */
const LOCK_STALE_MS = 30_000;

export function writeSemanticDictionary(
  paths: ProjectPaths,
  catalog: SemanticDictionaryCatalog,
): Effect.Effect<void, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.ensureDir(paths.semanticDictionaryDir).pipe(Effect.catchTag('FileSystemError', () => Effect.void));

    // Advisory file locking to prevent concurrent writer corruption
    const lockPath = paths.semanticDictionaryIndexPath + '.lock';
    const lockExists = yield* fs.exists(lockPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (lockExists) {
      // Check for stale lock (process crash, etc.)
      const stat = yield* fs.stat(lockPath).pipe(Effect.catchAll(() => Effect.succeed(null)));
      if (stat && (Date.now() - stat.mtimeMs) < LOCK_STALE_MS) {
        // Lock is fresh — another writer is active, skip this write
        return;
      }
      // Stale lock — remove and proceed
      yield* fs.removeFile(lockPath).pipe(Effect.catchAll(() => Effect.void));
    }
    // Acquire lock
    yield* fs.writeText(lockPath, `${process.pid}:${Date.now()}`).pipe(Effect.catchAll(() => Effect.void));

    // Serialize ShingleIndex (Maps → arrays) for JSON persistence
    const indexedCatalog = ensureShingleIndex(catalog);
    const serializable: SerializableSemanticDictionaryCatalog = {
      kind: indexedCatalog.kind,
      version: indexedCatalog.version,
      generatedAt: indexedCatalog.generatedAt,
      entries: indexedCatalog.entries,
      summary: indexedCatalog.summary,
      serializedShingleIndex: indexedCatalog.shingleIndex
        ? serializeShingleIndex(indexedCatalog.shingleIndex)
        : undefined,
    };

    yield* fs.writeJson(paths.semanticDictionaryIndexPath, serializable).pipe(Effect.catchTag('FileSystemError', () => Effect.void));

    // Release lock
    yield* fs.removeFile(lockPath).pipe(Effect.catchAll(() => Effect.void));
  }).pipe(Effect.catchAll(() => Effect.void));
}

// ─── Helpers ───

export function emptyCatalog(): SemanticDictionaryCatalog {
  return {
    kind: 'semantic-dictionary-catalog',
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: [],
    summary: { totalEntries: 0, highConfidenceCount: 0, promotedCount: 0, averageConfidence: 0 },
  };
}

function isSemanticDictionaryCatalog(value: unknown): value is SemanticDictionaryCatalog {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'semantic-dictionary-catalog';
}

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

/**
 * Rebuild catalog summary. When an existing shingle index is provided and
 * the entry set hasn't structurally changed (success/failure updates only),
 * it's preserved to avoid O(C×L) rebuilds.
 */
function rebuildCatalog(
  entries: readonly SemanticDictionaryEntry[],
  existingIndex?: ShingleIndex | undefined,
): SemanticDictionaryCatalog {
  const highConfidence = entries.filter((e) => e.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
  const promoted = entries.filter((e) => e.promoted).length;
  const totalConfidence = entries.reduce((sum, e) => sum + e.confidence, 0);
  // Preserve the index when entry set hasn't structurally changed
  // (confidence/success/failure updates don't invalidate shingle data).
  // When entries were added/removed, caller passes undefined to force lazy rebuild.
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
