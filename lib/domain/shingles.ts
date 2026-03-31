/**
 * Character n-gram shingles with TF-IDF weighting.
 *
 * Pure, side-effect-free functions for sub-word similarity scoring.
 * Token Jaccard catches word reordering ("policy search" ≈ "search policy")
 * but misses lexical variation ("Enter policy number" ≈ "Type in policy ref").
 * Character shingles capture sub-word overlap: "polic", "olicy", "numb" etc.
 * TF-IDF weighting ensures discriminative shingles (rare across the corpus)
 * carry more weight than ubiquitous ones ("the", "ent", "ing").
 */

import { normalizeIntentText } from './inference';

// ─── Shingle Generation ───

/** Default shingle size. 3-grams balance recall vs noise for short intent text. */
const DEFAULT_N = 3;

/**
 * Generate character n-gram shingles from text.
 *
 * Steps:
 *   1. Normalize (HTML decode, lowercase, collapse whitespace)
 *   2. Slide a window of size `n` across the string
 *   3. Collect unique shingles as a Set
 *
 * Returns an empty set for text shorter than `n` characters.
 */
export function charShingles(text: string, n: number = DEFAULT_N): ReadonlySet<string> {
  const normalized = normalizeIntentText(text);
  if (normalized.length < n) return new Set();
  const shingles = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i++) {
    shingles.add(normalized.slice(i, i + n));
  }
  return shingles;
}

/**
 * Generate shingles and return as a frequency map (term frequency).
 * TF(shingle) = count(shingle) / total_shingles_in_text.
 */
export function shingleTermFrequencies(text: string, n: number = DEFAULT_N): ReadonlyMap<string, number> {
  const normalized = normalizeIntentText(text);
  if (normalized.length < n) return new Map();
  const counts = new Map<string, number>();
  const total = normalized.length - n + 1;
  for (let i = 0; i < total; i++) {
    const shingle = normalized.slice(i, i + n);
    counts.set(shingle, (counts.get(shingle) ?? 0) + 1);
  }
  const tf = new Map<string, number>();
  for (const [shingle, count] of counts) {
    tf.set(shingle, count / total);
  }
  return tf;
}

// ─── IDF Computation ───

/**
 * Inverse Document Frequency weights for a corpus of shingle sets.
 *
 * IDF(shingle) = log(N / df) where:
 *   N  = total number of documents (entries)
 *   df = number of documents containing this shingle
 *
 * Smoothed: IDF(shingle) = log((N + 1) / (df + 1)) + 1
 * This prevents zero IDF for universal shingles and stabilizes rare ones.
 */
export function buildIdfWeights(
  corpusShingleSets: ReadonlyArray<ReadonlySet<string>>,
): ReadonlyMap<string, number> {
  const N = corpusShingleSets.length;
  if (N === 0) return new Map();

  // Count document frequency for each shingle
  const df = new Map<string, number>();
  for (const shingleSet of corpusShingleSets) {
    for (const shingle of shingleSet) {
      df.set(shingle, (df.get(shingle) ?? 0) + 1);
    }
  }

  // Compute smoothed IDF
  const idf = new Map<string, number>();
  for (const [shingle, docFreq] of df) {
    idf.set(shingle, Math.log((N + 1) / (docFreq + 1)) + 1);
  }
  return idf;
}

// ─── TF-IDF Cosine Similarity ───

/**
 * Compute TF-IDF weighted cosine similarity between a query and an entry.
 *
 * Both query and entry are represented as TF maps (shingle → term frequency).
 * IDF weights are applied to produce TF-IDF vectors, then cosine similarity
 * is computed: dot(q, e) / (|q| × |e|).
 *
 * Returns a score in [0, 1]. Returns 0 when either vector is empty.
 */
export function tfidfCosineSimilarity(
  queryTf: ReadonlyMap<string, number>,
  entryTf: ReadonlyMap<string, number>,
  idfWeights: ReadonlyMap<string, number>,
): number {
  if (queryTf.size === 0 || entryTf.size === 0) return 0;

  // Collect the union of shingles present in both
  let dotProduct = 0;
  let queryNorm = 0;
  let entryNorm = 0;

  // Query vector magnitude and dot product contribution
  for (const [shingle, tf] of queryTf) {
    const idf = idfWeights.get(shingle) ?? 0;
    const qWeight = tf * idf;
    queryNorm += qWeight * qWeight;

    const eTf = entryTf.get(shingle);
    if (eTf !== undefined) {
      dotProduct += qWeight * (eTf * idf);
    }
  }

  // Entry vector magnitude (full pass needed for norm)
  for (const [shingle, tf] of entryTf) {
    const idf = idfWeights.get(shingle) ?? 0;
    const eWeight = tf * idf;
    entryNorm += eWeight * eWeight;
  }

  if (queryNorm === 0 || entryNorm === 0) return 0;
  return dotProduct / (Math.sqrt(queryNorm) * Math.sqrt(entryNorm));
}

// ─── Composite Similarity ───

/**
 * Blend token Jaccard and TF-IDF shingle similarity.
 *
 * Token Jaccard is good at word-level set matching (order-independent).
 * TF-IDF shingles are good at sub-word lexical variation.
 * The blend captures both strengths.
 *
 * Default blend: 0.4 Jaccard + 0.6 TF-IDF (TF-IDF has more discriminative power).
 */
export function blendedSimilarity(
  jaccardScore: number,
  tfidfScore: number,
  jaccardWeight: number = 0.4,
): number {
  const tfidfWeight = 1 - jaccardWeight;
  return jaccardWeight * jaccardScore + tfidfWeight * tfidfScore;
}

// ─── Shingle Index ───

export interface ShingleIndexEntry {
  readonly entryId: string;
  readonly tf: ReadonlyMap<string, number>;
  readonly shingles: ReadonlySet<string>;
}

export interface ShingleIndex {
  /** IDF weights computed over the full corpus. */
  readonly idfWeights: ReadonlyMap<string, number>;
  /** Per-entry shingle data for fast lookup. */
  readonly entries: ReadonlyMap<string, ShingleIndexEntry>;
  /** Inverted index: shingle → entry IDs containing it. Enables O(Q) candidate lookup instead of O(N) scan. */
  readonly invertedIndex: ReadonlyMap<string, ReadonlySet<string>>;
  /** Corpus statistics. */
  readonly stats: {
    readonly totalEntries: number;
    readonly uniqueShingles: number;
    readonly avgShinglesPerEntry: number;
  };
}

// ─── Serialization ───

/** JSON-safe representation of ShingleIndex (Maps → arrays of [k, v]). */
export interface SerializedShingleIndex {
  readonly idfWeights: ReadonlyArray<readonly [string, number]>;
  readonly entries: ReadonlyArray<{
    readonly entryId: string;
    readonly tf: ReadonlyArray<readonly [string, number]>;
    readonly shingles: readonly string[];
  }>;
  readonly invertedIndex?: ReadonlyArray<readonly [string, readonly string[]]>;
  readonly stats: ShingleIndex['stats'];
}

/** Convert a ShingleIndex to a JSON-safe form for persistence. */
export function serializeShingleIndex(index: ShingleIndex): SerializedShingleIndex {
  return {
    idfWeights: [...index.idfWeights],
    entries: [...index.entries.values()].map((e) => ({
      entryId: e.entryId,
      tf: [...e.tf],
      shingles: [...e.shingles],
    })),
    invertedIndex: [...index.invertedIndex].map(([shingle, ids]) => [shingle, [...ids]]),
    stats: index.stats,
  };
}

/** Reconstruct a ShingleIndex from its serialized form. */
export function deserializeShingleIndex(raw: SerializedShingleIndex): ShingleIndex {
  const idfWeights = new Map(raw.idfWeights);
  const entries = new Map<string, ShingleIndexEntry>();
  for (const e of raw.entries) {
    entries.set(e.entryId, {
      entryId: e.entryId,
      tf: new Map(e.tf),
      shingles: new Set(e.shingles),
    });
  }
  // Rebuild inverted index from serialized form or reconstruct from entries
  const invertedIndex = raw.invertedIndex
    ? new Map(raw.invertedIndex.map(([shingle, ids]) => [shingle, new Set(ids)]))
    : buildInvertedIndex(entries);
  return { idfWeights, entries, invertedIndex, stats: raw.stats };
}

// ─── Inverted Index ───

/** Build an inverted index (shingle → entry IDs) from entry data. */
function buildInvertedIndex(entries: ReadonlyMap<string, ShingleIndexEntry>): ReadonlyMap<string, ReadonlySet<string>> {
  const inverted = new Map<string, Set<string>>();
  for (const [entryId, entryData] of entries) {
    for (const shingle of entryData.shingles) {
      let ids = inverted.get(shingle);
      if (!ids) {
        ids = new Set();
        inverted.set(shingle, ids);
      }
      ids.add(entryId);
    }
  }
  return inverted;
}

// ─── Incremental Index Update ───

/**
 * Add a single entry to an existing shingle index.
 *
 * Incrementally updates IDF weights using the approximation:
 *   idf(t) = log((N+2) / (df(t) + contains + 1)) + 1
 *
 * This avoids a full O(C×L) rebuild. IDF drift is acceptable for
 * incremental accrual; periodic full rebuilds on catalog load correct it.
 */
export function addEntryToShingleIndex(
  index: ShingleIndex,
  entry: { readonly id: string; readonly text: string },
  n: number = DEFAULT_N,
): ShingleIndex {
  const tf = shingleTermFrequencies(entry.text, n);
  const shingles = charShingles(entry.text, n);

  // Incrementally update IDF: new corpus size is N+1
  const N = index.stats.totalEntries + 1;
  const updatedIdf = new Map(index.idfWeights);

  // Update existing shingles whose df increases (present in new entry)
  for (const shingle of shingles) {
    const oldDf = updatedIdf.has(shingle)
      ? Math.round((index.stats.totalEntries + 1) / Math.exp(updatedIdf.get(shingle)! - 1)) - 1
      : 0;
    // Simpler: just recompute using smoothed formula with incremented N and df+1
    updatedIdf.set(shingle, Math.log((N + 1) / (oldDf + 1 + 1)) + 1);
  }

  // Add shingles that are brand new to the corpus
  for (const shingle of shingles) {
    if (!index.idfWeights.has(shingle)) {
      updatedIdf.set(shingle, Math.log((N + 1) / 2) + 1); // df=1 for new shingle
    }
  }

  const updatedEntries = new Map(index.entries);
  updatedEntries.set(entry.id, { entryId: entry.id, tf, shingles });

  // Incrementally update inverted index
  const updatedInverted = new Map<string, Set<string>>();
  for (const [shingle, ids] of index.invertedIndex) {
    updatedInverted.set(shingle, new Set(ids));
  }
  for (const shingle of shingles) {
    let ids = updatedInverted.get(shingle);
    if (!ids) {
      ids = new Set();
      updatedInverted.set(shingle, ids);
    }
    ids.add(entry.id);
  }

  const totalShingles = [...updatedEntries.values()].reduce((sum, e) => sum + e.shingles.size, 0);

  return {
    idfWeights: updatedIdf,
    entries: updatedEntries,
    invertedIndex: updatedInverted,
    stats: {
      totalEntries: N,
      uniqueShingles: updatedIdf.size,
      avgShinglesPerEntry: N > 0 ? Math.round(totalShingles / N) : 0,
    },
  };
}

/**
 * Build a shingle index from a corpus of (id, text) pairs.
 *
 * Pure function. The index contains:
 *   - IDF weights for all shingles in the corpus
 *   - Per-entry TF maps and shingle sets
 *   - Corpus statistics
 *
 * Complexity: O(C × L) where C = corpus size, L = avg text length.
 */
export function buildShingleIndex(
  corpus: ReadonlyArray<{ readonly id: string; readonly text: string }>,
  n: number = DEFAULT_N,
): ShingleIndex {
  if (corpus.length === 0) {
    return {
      idfWeights: new Map(),
      entries: new Map(),
      invertedIndex: new Map(),
      stats: { totalEntries: 0, uniqueShingles: 0, avgShinglesPerEntry: 0 },
    };
  }

  // Build per-entry shingle data
  const entryData: ShingleIndexEntry[] = corpus.map(({ id, text }) => ({
    entryId: id,
    tf: shingleTermFrequencies(text, n),
    shingles: charShingles(text, n),
  }));

  // Build IDF from the corpus
  const idfWeights = buildIdfWeights(entryData.map((e) => e.shingles));

  // Index by entry ID
  const entries = new Map<string, ShingleIndexEntry>();
  let totalShingles = 0;
  for (const entry of entryData) {
    entries.set(entry.entryId, entry);
    totalShingles += entry.shingles.size;
  }

  // Build inverted index for O(Q) candidate lookup
  const invertedIndex = buildInvertedIndex(entries);

  return {
    idfWeights,
    entries,
    invertedIndex,
    stats: {
      totalEntries: corpus.length,
      uniqueShingles: idfWeights.size,
      avgShinglesPerEntry: corpus.length > 0 ? Math.round(totalShingles / corpus.length) : 0,
    },
  };
}

/**
 * Query the shingle index for similarity against all entries.
 *
 * Returns entries sorted by TF-IDF cosine similarity (descending),
 * filtered to those above the threshold.
 */
export function queryShingleIndex(
  queryText: string,
  index: ShingleIndex,
  threshold: number = 0.1,
  n: number = DEFAULT_N,
): ReadonlyArray<{ readonly entryId: string; readonly score: number }> {
  if (index.entries.size === 0) return [];

  const queryTf = shingleTermFrequencies(queryText, n);
  if (queryTf.size === 0) return [];

  // Use inverted index to find candidate entries sharing at least one shingle
  // with the query. This is O(Q × avg_postings) instead of O(N).
  const candidateIds = new Set<string>();
  for (const shingle of queryTf.keys()) {
    const postings = index.invertedIndex.get(shingle);
    if (postings) {
      for (const id of postings) {
        candidateIds.add(id);
      }
    }
  }

  const results: Array<{ entryId: string; score: number }> = [];
  for (const entryId of candidateIds) {
    const entryData = index.entries.get(entryId);
    if (!entryData) continue;
    const score = tfidfCosineSimilarity(queryTf, entryData.tf, index.idfWeights);
    if (score >= threshold) {
      results.push({ entryId, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
