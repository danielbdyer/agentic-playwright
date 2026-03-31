import path from 'path';
import { Effect } from 'effect';
import { FileSystem } from '../ports';

export interface JsonCacheReadInput<TRecord extends { readonly cacheKey: string }> {
  readonly filePath: string;
  readonly cacheKey: string;
  readonly isRecord: (value: unknown) => value is TRecord;
}

export function readJsonCacheRecord<TRecord extends { readonly cacheKey: string }>(
  input: JsonCacheReadInput<TRecord>,
): Effect.Effect<TRecord | null, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(input.filePath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed(false)),
    );
    if (!exists) {
      return null;
    }

    const value = yield* fs.readJson(input.filePath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed(null)),
    );
    if (value === null || !input.isRecord(value) || value.cacheKey !== input.cacheKey) {
      return null;
    }
    return value;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  );
}

export interface JsonCacheWriteInput<TRecord> {
  readonly dirPath: string;
  readonly filePath: string;
  readonly record: TRecord;
}

export function writeJsonCacheRecord<TRecord>(input: JsonCacheWriteInput<TRecord>): Effect.Effect<TRecord, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* fs.ensureDir(input.dirPath).pipe(Effect.catchTag('FileSystemError', () => Effect.void));
    yield* fs.writeJson(input.filePath, input.record).pipe(Effect.catchTag('FileSystemError', () => Effect.void));
    return input.record;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(input.record)),
  );
}

export interface PruneCacheFilesInput {
  readonly dirPath: string;
  readonly maxEntries: number;
  readonly includeFile: (fileName: string) => boolean;
}

/**
 * Value-aware pruning input. Instead of pure recency (LRU), this allows
 * the caller to supply a utility score for each cache file so that
 * high-value entries survive longer and low-value/contradicted entries
 * are pruned first regardless of recency.
 *
 * When no `scoreFile` is provided, falls back to recency-based LRU.
 */
export interface ValueAwarePruneCacheFilesInput extends PruneCacheFilesInput {
  /**
   * Optional: read the file content and return a utility score.
   * Higher scores = more valuable = pruned last.
   * Return null to fall back to recency for that file.
   */
  readonly scoreFile?: (filePath: string, content: unknown) => number | null;
}

interface CacheFileInfo {
  readonly filePath: string;
  readonly mtimeMs: number;
}

interface ScoredCacheFileInfo extends CacheFileInfo {
  /** Utility score: higher = more valuable. null = recency-only. */
  readonly utilityScore: number | null;
}

function newestFirst(left: CacheFileInfo, right: CacheFileInfo): number {
  const byMtime = right.mtimeMs - left.mtimeMs;
  return byMtime !== 0 ? byMtime : left.filePath.localeCompare(right.filePath);
}

/**
 * Value-aware ordering: sort by utility score descending, then by recency.
 * Entries with a utility score are always ranked above entries without.
 * Among entries with scores, higher score wins. Among equals, recency breaks ties.
 */
function highestValueFirst(left: ScoredCacheFileInfo, right: ScoredCacheFileInfo): number {
  const leftScore = left.utilityScore ?? -1;
  const rightScore = right.utilityScore ?? -1;
  if (leftScore !== rightScore) return rightScore - leftScore;
  return newestFirst(left, right);
}

export function pruneCacheFiles(input: PruneCacheFilesInput): Effect.Effect<number, never, FileSystem> {
  return pruneCacheFilesValueAware(input);
}

/**
 * Prune cache files with optional value-aware scoring.
 *
 * When `scoreFile` is provided, each file's content is read and scored.
 * High-utility entries are retained longer; low-utility and stale entries
 * are pruned first. This addresses the limitation of pure LRU pruning
 * where high-confidence/high-reuse entries could be evicted simply
 * because they haven't been touched recently.
 *
 * When `scoreFile` is not provided, behaves identically to recency-based LRU.
 */
export function pruneCacheFilesValueAware(input: ValueAwarePruneCacheFilesInput): Effect.Effect<number, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(input.dirPath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed(false)),
    );
    if (!exists) {
      return 0;
    }

    const entries = yield* fs.listDir(input.dirPath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed([])),
    );
    const cacheFiles = entries
      .flatMap((fileName) => input.includeFile(fileName) ? [path.join(input.dirPath, fileName)] : []);

    if (cacheFiles.length <= input.maxEntries) {
      return 0;
    }

    const withStats = yield* Effect.all(
      cacheFiles.map((filePath) => fs.stat(filePath).pipe(
        Effect.map((stat) => ({ filePath, mtimeMs: stat.mtimeMs })),
        Effect.catchTag('FileSystemError', () => Effect.succeed(null)),
      )),
    );

    const validFiles = withStats.filter((entry): entry is CacheFileInfo => entry !== null);

    if (input.scoreFile) {
      // Value-aware pruning: read each file, compute utility, sort by value
      const scored = yield* Effect.all(
        validFiles.map((file) =>
          fs.readJson(file.filePath).pipe(
            Effect.map((content) => ({
              ...file,
              utilityScore: input.scoreFile!(file.filePath, content),
            } satisfies ScoredCacheFileInfo)),
            Effect.catchTag('FileSystemError', () => Effect.succeed({
              ...file,
              utilityScore: null,
            } satisfies ScoredCacheFileInfo)),
          ),
        ),
      );

      const removable = scored
        .slice()
        .sort(highestValueFirst)
        .slice(input.maxEntries);

      yield* Effect.all(
        removable.map((entry) => fs.removeFile(entry.filePath).pipe(
          Effect.catchTag('FileSystemError', () => Effect.void),
        )),
      );

      return removable.length;
    }

    // Recency-based fallback (original behavior)
    const removable = validFiles
      .slice()
      .sort(newestFirst)
      .slice(input.maxEntries);

    yield* Effect.all(
      removable.map((entry) => fs.removeFile(entry.filePath).pipe(
        Effect.catchTag('FileSystemError', () => Effect.void),
      )),
    );

    return removable.length;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(0)),
  );
}
