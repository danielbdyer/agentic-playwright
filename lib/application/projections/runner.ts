import { Effect } from 'effect';
import { FileSystem } from '../ports';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  sortProjectionInputs,
  type ProjectionBuildManifest,
  type ProjectionCacheInvalidationReason,
  type ProjectionInputFingerprint,
} from './cache';

export interface ProjectionCacheHitIncremental {
  status: 'cache-hit';
  inputSetFingerprint: string;
  outputFingerprint: string;
  changedInputs: string[];
  removedInputs: string[];
  rewritten: string[];
}

export interface ProjectionCacheMissIncremental {
  status: 'cache-miss';
  inputSetFingerprint: string;
  outputFingerprint: string;
  cacheInvalidationReason: ProjectionCacheInvalidationReason | null;
  changedInputs: string[];
  removedInputs: string[];
  rewritten: string[];
}

export type ProjectionIncremental = ProjectionCacheHitIncremental | ProjectionCacheMissIncremental;

export type ProjectionPersistedOutputState =
  | { status: 'ok'; outputFingerprint: string }
  | { status: ProjectionCacheInvalidationReason };

export function parseProjectionManifest(value: unknown, projection: string): ProjectionBuildManifest | null {
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

export function runProjection<BuildResult, ReturnResult>(options: {
  projection: string;
  manifestPath: string;
  inputFingerprints: ProjectionInputFingerprint[];
  outputFingerprint: string | null;
  verifyPersistedOutput: (expectedOutputFingerprint: string) => Effect.Effect<ProjectionPersistedOutputState>;
  buildAndWrite: () => Effect.Effect<{ result: BuildResult; outputFingerprint: string; rewritten: string[] }>;
  withCacheHit: (incremental: ProjectionCacheHitIncremental) => ReturnResult;
  withCacheMiss: (built: BuildResult, incremental: ProjectionCacheMissIncremental) => ReturnResult;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const previousManifest = (yield* fs.exists(options.manifestPath))
      ? parseProjectionManifest(yield* fs.readJson(options.manifestPath), options.projection)
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

    const built = yield* options.buildAndWrite();
    const manifest: ProjectionBuildManifest = {
      version: 1,
      projection: options.projection,
      inputSetFingerprint,
      outputFingerprint: built.outputFingerprint,
      inputs: sortedInputs,
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
