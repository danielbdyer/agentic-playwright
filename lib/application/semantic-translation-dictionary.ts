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
import { normalizeIntentText, bestAliasMatch } from '../domain/inference';
import type {
  SemanticDictionaryAccrualInput,
  SemanticDictionaryCatalog,
  SemanticDictionaryEntry,
  SemanticDictionaryMatch,
  SemanticDictionaryTarget,
} from '../domain/types';
import { FileSystem } from './ports';
import type { ProjectPaths } from './paths';

// ─── Constants ───

/** Minimum similarity score (token Jaccard) to consider a dictionary hit. */
const SIMILARITY_THRESHOLD = 0.55;

/** Minimum combined score (similarity × confidence) to use the entry. */
const COMBINED_SCORE_THRESHOLD = 0.35;

/** Initial confidence for a newly accrued entry. */
const INITIAL_CONFIDENCE = 0.5;

/** Confidence boost per successful reuse. Diminishing: scaled by (1 - current). */
const SUCCESS_BOOST = 0.12;

/** Confidence penalty per failure. */
const FAILURE_PENALTY = 0.2;

/** Confidence threshold above which an entry is considered high-confidence. */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/** Maximum entries before pruning lowest-confidence stale entries. */
const MAX_ENTRIES = 2048;

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
  const unionSize = new Set([...setA, ...setB]).size;
  return intersection / unionSize;
}

// ─── Lookup ───

/**
 * Find the best semantic match for a normalised intent against the dictionary.
 *
 * Returns the highest combined-score entry above both thresholds, or null.
 * Pure function — no side effects.
 */
export function lookupSemanticDictionary(
  normalizedIntent: string,
  catalog: SemanticDictionaryCatalog,
  options?: {
    readonly similarityThreshold?: number;
    readonly combinedScoreThreshold?: number;
  },
): SemanticDictionaryMatch | null {
  const simThreshold = options?.similarityThreshold ?? SIMILARITY_THRESHOLD;
  const combinedThreshold = options?.combinedScoreThreshold ?? COMBINED_SCORE_THRESHOLD;

  const queryTokens = tokenize(normalizeIntentText(normalizedIntent));
  if (queryTokens.length === 0) return null;

  let best: SemanticDictionaryMatch | null = null;

  for (const entry of catalog.entries) {
    const entryTokens = tokenize(normalizeIntentText(entry.normalizedIntent));
    const similarityScore = tokenJaccard(queryTokens, entryTokens);

    if (similarityScore < simThreshold) continue;

    const combinedScore = similarityScore * entry.confidence;
    if (combinedScore < combinedThreshold) continue;

    if (!best || combinedScore > best.combinedScore) {
      best = { entry, similarityScore, combinedScore };
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
    return rebuildCatalog(catalog.entries.map((e) => e.id === id ? updated : e));
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
    createdAt: now,
    lastUsedAt: now,
    taskFingerprints: [input.taskFingerprint],
    knowledgeFingerprint: input.knowledgeFingerprint,
    promoted: false,
  };
  return rebuildCatalog([...catalog.entries, entry]);
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
          lastUsedAt: now,
        }
      : e,
  ));
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
          lastUsedAt: now,
        }
      : e,
  ));
}

/**
 * Mark an entry as promoted to approved knowledge.
 */
export function markPromoted(catalog: SemanticDictionaryCatalog, promotedEntryId: string): SemanticDictionaryCatalog {
  return rebuildCatalog(catalog.entries.map((e) =>
    e.id === promotedEntryId ? { ...e, promoted: true } : e,
  ));
}

/**
 * Prune the catalog to MAX_ENTRIES, removing lowest-confidence entries first.
 */
export function pruneSemanticDictionary(
  catalog: SemanticDictionaryCatalog,
  maxEntries: number = MAX_ENTRIES,
): SemanticDictionaryCatalog {
  if (catalog.entries.length <= maxEntries) return catalog;
  const sorted = [...catalog.entries].sort((a, b) => {
    // Keep promoted and high-confidence entries; prune low-confidence stale ones first
    if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
    if (a.confidence !== b.confidence) return b.confidence - a.confidence;
    return a.lastUsedAt.localeCompare(b.lastUsedAt); // oldest first among equal confidence
  });
  return rebuildCatalog(sorted.slice(0, maxEntries));
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
    return raw;
  }).pipe(Effect.catchAll(() => Effect.succeed(emptyCatalog())));
}

export function writeSemanticDictionary(
  paths: ProjectPaths,
  catalog: SemanticDictionaryCatalog,
): Effect.Effect<void, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.ensureDir(paths.semanticDictionaryDir).pipe(Effect.catchTag('FileSystemError', () => Effect.void));
    yield* fs.writeJson(paths.semanticDictionaryIndexPath, catalog).pipe(Effect.catchTag('FileSystemError', () => Effect.void));
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

function uniqueAppend(arr: readonly string[], value: string): readonly string[] {
  return arr.includes(value) ? arr : [...arr, value];
}

function rebuildCatalog(entries: readonly SemanticDictionaryEntry[]): SemanticDictionaryCatalog {
  const highConfidence = entries.filter((e) => e.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
  const promoted = entries.filter((e) => e.promoted).length;
  const totalConfidence = entries.reduce((sum, e) => sum + e.confidence, 0);
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
  };
}
