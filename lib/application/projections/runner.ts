import { Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';
import { FileSystem } from '../ports';
import { runIncrementalStage } from '../pipeline';
import {
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

export function runProjection<
  BuildResult,
  CacheHitResult,
  CacheMissResult,
  ProjectionError = never,
  ProjectionRequirements = never,
>(options: {
  projection: string;
  manifestPath: string;
  inputFingerprints: ProjectionInputFingerprint[];
  outputFingerprint: string | null;
  verifyPersistedOutput: (expectedOutputFingerprint: string) => Effect.Effect<
    ProjectionPersistedOutputState,
    ProjectionError,
    ProjectionRequirements
  >;
  buildAndWrite: () => Effect.Effect<
    { result: BuildResult; outputFingerprint: string; rewritten: string[] },
    ProjectionError,
    ProjectionRequirements
  >;
  withCacheHit: (incremental: ProjectionCacheHitIncremental) => CacheHitResult;
  withCacheMiss: (built: BuildResult, incremental: ProjectionCacheMissIncremental) => CacheMissResult;
}): Effect.Effect<CacheHitResult | CacheMissResult, TesseractError | ProjectionError, FileSystem | ProjectionRequirements> {
  return runIncrementalStage({
    name: options.projection,
    manifestPath: options.manifestPath,
    inputFingerprints: options.inputFingerprints,
    outputFingerprint: options.outputFingerprint,
    verifyPersistedOutput: options.verifyPersistedOutput,
    persist: options.buildAndWrite,
    withCacheHit: options.withCacheHit,
    withCacheMiss: options.withCacheMiss,
  });
}

