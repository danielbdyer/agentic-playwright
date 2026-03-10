import { Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';
import { FileSystem } from '../ports';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  sortProjectionInputs,
  type ProjectionBuildManifest,
  type ProjectionCacheInvalidationReason,
  type ProjectionInputFingerprint,
} from '../projections/cache';

export interface StageCacheHitIncremental {
  status: 'cache-hit';
  inputSetFingerprint: string;
  outputFingerprint: string;
  changedInputs: string[];
  removedInputs: string[];
  rewritten: string[];
}

export interface StageCacheMissIncremental {
  status: 'cache-miss';
  inputSetFingerprint: string;
  outputFingerprint: string;
  cacheInvalidationReason: ProjectionCacheInvalidationReason | null;
  changedInputs: string[];
  removedInputs: string[];
  rewritten: string[];
}

function parseManifest(value: unknown, projection: string): ProjectionBuildManifest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybe = value as Partial<ProjectionBuildManifest>;
  if (
    maybe.version !== 1
    || maybe.projection !== projection
    || typeof maybe.inputSetFingerprint !== 'string'
    || typeof maybe.outputFingerprint !== 'string'
    || !Array.isArray(maybe.inputs)
  ) {
    return null;
  }

  for (const input of maybe.inputs) {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const entry = input as Partial<ProjectionInputFingerprint>;
    if (typeof entry.kind !== 'string' || typeof entry.path !== 'string' || typeof entry.fingerprint !== 'string') {
      return null;
    }
  }

  return {
    version: 1,
    projection,
    inputSetFingerprint: maybe.inputSetFingerprint,
    outputFingerprint: maybe.outputFingerprint,
    inputs: sortProjectionInputs(maybe.inputs as ProjectionInputFingerprint[]),
  };
}

export function runIncrementalStage<
  BuildResult,
  CacheHitResult,
  CacheMissResult,
  ProjectionError = never,
  ProjectionRequirements = never,
>(options: {
  name: string;
  manifestPath: string;
  inputFingerprints: ProjectionInputFingerprint[];
  outputFingerprint: string | null;
  verifyPersistedOutput: (expectedOutputFingerprint: string) => Effect.Effect<
    { status: 'ok'; outputFingerprint: string } | { status: ProjectionCacheInvalidationReason },
    ProjectionError,
    ProjectionRequirements
  >;
  persist: () => Effect.Effect<
    { result: BuildResult; outputFingerprint: string; rewritten: string[] },
    ProjectionError,
    ProjectionRequirements
  >;
  withCacheHit: (incremental: StageCacheHitIncremental) => CacheHitResult;
  withCacheMiss: (built: BuildResult, incremental: StageCacheMissIncremental) => CacheMissResult;
}): Effect.Effect<CacheHitResult | CacheMissResult, TesseractError | ProjectionError, FileSystem | ProjectionRequirements> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const previousManifest = (yield* fs.exists(options.manifestPath))
      ? parseManifest(yield* fs.readJson(options.manifestPath), options.name)
      : null;
    const inputSetFingerprint = computeProjectionInputSetFingerprint(options.inputFingerprints);
    const { sortedInputs, changedInputs, removedInputs } = diffProjectionInputs(options.inputFingerprints, previousManifest);

    let cacheInvalidationReason: ProjectionCacheInvalidationReason | null = null;
    const expectedOutputFingerprint = options.outputFingerprint ?? previousManifest?.outputFingerprint ?? null;
    if (
      previousManifest
      && previousManifest.inputSetFingerprint === inputSetFingerprint
      && expectedOutputFingerprint
      && previousManifest.outputFingerprint === expectedOutputFingerprint
    ) {
      const persisted = yield* options.verifyPersistedOutput(expectedOutputFingerprint);
      if (persisted.status === 'ok' && persisted.outputFingerprint === expectedOutputFingerprint) {
        return options.withCacheHit({
          status: 'cache-hit',
          inputSetFingerprint,
          outputFingerprint: expectedOutputFingerprint,
          changedInputs,
          removedInputs,
          rewritten: [],
        });
      }
      cacheInvalidationReason = persisted.status === 'ok' ? 'invalid-output' : persisted.status;
    }

    const built = yield* options.persist();
    const manifest: ProjectionBuildManifest = {
      version: 1,
      projection: options.name,
      inputSetFingerprint,
      outputFingerprint: built.outputFingerprint,
      inputs: sortProjectionInputs(sortedInputs),
    };
    yield* fs.writeJson(options.manifestPath, manifest);

    return options.withCacheMiss(built.result, {
      status: 'cache-miss',
      inputSetFingerprint,
      outputFingerprint: built.outputFingerprint,
      cacheInvalidationReason,
      changedInputs,
      removedInputs,
      rewritten: [...built.rewritten],
    });
  });
}
