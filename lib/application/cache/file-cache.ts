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

interface CacheFileInfo {
  readonly filePath: string;
  readonly mtimeMs: number;
}

function newestFirst(left: CacheFileInfo, right: CacheFileInfo): number {
  const byMtime = right.mtimeMs - left.mtimeMs;
  return byMtime !== 0 ? byMtime : left.filePath.localeCompare(right.filePath);
}

export function pruneCacheFiles(input: PruneCacheFilesInput): Effect.Effect<number, never, FileSystem> {
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

    const removable = withStats
      .filter((entry): entry is CacheFileInfo => entry !== null)
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
