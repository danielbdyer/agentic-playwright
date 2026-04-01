/**
 * Semantic Translation Dictionary — application layer (I/O only).
 *
 * Pure domain logic (lookup, accrual, pruning, scoring) lives in
 * lib/domain/knowledge/semantic-dictionary.ts. This file provides
 * Effect-based persistence and re-exports the pure API.
 */

import { Effect } from 'effect';
import {
  deserializeShingleIndex,
  serializeShingleIndex,
  type SerializedShingleIndex,
} from '../domain/knowledge/shingles';
import { ensureShingleIndex, emptyCatalog } from '../domain/knowledge/semantic-dictionary';
import type {
  SemanticDictionaryCatalog,
  SemanticDictionaryEntry,
} from '../domain/types';
import { FileSystem } from './ports';
import type { ProjectPaths } from './paths';

// Re-export pure domain API so existing application-layer consumers don't break
export {
  ensureShingleIndex,
  lookupSemanticDictionary,
  accrueSemanticEntry,
  recordSemanticSuccess,
  recordSemanticFailure,
  markPromoted,
  pruneSemanticDictionary,
  promotionCandidates,
  emptyCatalog,
} from '../domain/knowledge/semantic-dictionary';
export type { SemanticLookupOptions } from '../domain/knowledge/semantic-dictionary';

// ─── Persistence (Effect-based) ───

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

    const lockPath = paths.semanticDictionaryIndexPath + '.lock';
    const lockExists = yield* fs.exists(lockPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
    if (lockExists) {
      const stat = yield* fs.stat(lockPath).pipe(Effect.catchAll(() => Effect.succeed(null)));
      if (stat && (Date.now() - stat.mtimeMs) < LOCK_STALE_MS) {
        return;
      }
      yield* fs.removeFile(lockPath).pipe(Effect.catchAll(() => Effect.void));
    }
    yield* fs.writeText(lockPath, `${process.pid}:${Date.now()}`).pipe(Effect.catchAll(() => Effect.void));

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
    yield* fs.removeFile(lockPath).pipe(Effect.catchAll(() => Effect.void));
  }).pipe(Effect.catchAll(() => Effect.void));
}

// ─── Helpers ───

function isSemanticDictionaryCatalog(value: unknown): value is SemanticDictionaryCatalog {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'semantic-dictionary-catalog';
}
