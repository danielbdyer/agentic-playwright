import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { trySync } from '../effect';
import { resolveEffectConcurrency } from '../runtime-support/concurrency';
import { FileSystem } from '../ports';
import type { ProjectPaths } from '../paths';
import { createArtifactEnvelope, fingerprintArtifact } from './envelope';
import type { ArtifactEnvelope } from './types';

export function readYamlArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readText(absolutePath);
    const artifact = yield* trySync(() => validate(YAML.parse(raw)), errorCode, errorMessage);
    return createArtifactEnvelope(paths, absolutePath, artifact);
  });
}

export function readJsonArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readJson(absolutePath);
    const artifact = yield* trySync(() => validate(raw), errorCode, errorMessage);
    return createArtifactEnvelope(paths, absolutePath, artifact);
  });
}

export function loadOptionalYamlArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    if (!(yield* fs.exists(absolutePath))) {
      return null;
    }
    return yield* readYamlArtifact(paths, absolutePath, validate, errorCode, errorMessage);
  });
}

// ─── Spec-driven artifact loading ────────────────────────────────
//
// `loadArtifactsMatching` is the single entry point for loading a
// batch of artifacts of one kind from a pre-walked file list. It
// subsumes the three ad-hoc variants that previously lived in
// `workspace-catalog.ts` (`loadAllYaml`, `loadAllJson`,
// `loadAllDisposableJson`) plus the per-entry disposable wrapper.
// The spec is first-class data — adding a new artifact kind means
// adding one spec entry, not a new helper function.

/** Maximum concurrent catalog I/O operations per batch load. Shared
 *  across all call sites so posture-heavy cold-starts don't fan out
 *  past the ceiling. */
export const catalogIoConcurrency = resolveEffectConcurrency({ ceiling: 20 });

/** Source format of the artifact file on disk. */
export type LoadSource = 'yaml' | 'json';

/** Lifetime semantics:
 *  - `required`: validation failures propagate as `TesseractError`
 *    and abort the load.
 *  - `disposable`: validation failures are caught per-file, the
 *    entry is dropped from the result, and the overall load
 *    continues. Used for ephemeral/runtime artifacts whose
 *    individual corruption must not block a full catalog load. */
export type LoadLifetime = 'required' | 'disposable';

/** Spec describing one artifact kind: where it lives, how to
 *  recognize it, how to validate it, and (optionally) how to
 *  normalize it before persistence. */
export interface ArtifactLoaderSpec<T> {
  readonly source: LoadSource;
  readonly lifetime: LoadLifetime;
  readonly match: (filePath: string) => boolean;
  readonly validate: (value: unknown) => T;
  readonly errorCode: string;
  readonly label: string;
  /** Optional normalization applied after validation. The
   *  fingerprint is recomputed from the normalized form so
   *  persistence and cache lookups see byte-equal shapes regardless
   *  of on-disk spelling. This absorbs the ad-hoc
   *  "load → transform → re-fingerprint" pattern that previously
   *  lived at two call sites in workspace-catalog.ts. */
  readonly postprocess?: (artifact: T) => T;
}

// ─── Match helpers ───────────────────────────────────────────────
//
// Composable predicates over file paths. These are the standard
// discriminators the catalog loader uses: suffix match (most YAML
// artifacts) and basename match (run records and their siblings
// inside per-ADO directories).

/** Match files whose path ends with `suffix`. */
export const bySuffix = (suffix: string) => (filePath: string) =>
  filePath.endsWith(suffix);

/** Match files whose basename equals `name`. */
export const byBasename = (name: string) => (filePath: string) =>
  path.basename(filePath) === name;

// ─── The loader factory ──────────────────────────────────────────

function sortByArtifactPath<T>(
  envelopes: readonly ArtifactEnvelope<T>[],
): ArtifactEnvelope<T>[] {
  return [...envelopes].sort((left, right) =>
    left.artifactPath.localeCompare(right.artifactPath),
  );
}

/**
 * Load every artifact in `files` that matches `spec.match`,
 * validate it, optionally normalize it, and return a sorted
 * readonly array of envelopes.
 *
 * The three ad-hoc variants this replaces —
 * `loadAllYaml`/`loadAllJson`/`loadAllDisposableJson` — collapse
 * into parameter differences on the spec: `source` picks YAML vs
 * JSON, `lifetime` picks fail-fast vs null-on-error, `match` is the
 * filter, and `postprocess` handles the "load then transform"
 * pattern used by route manifests and cold-start scenario
 * projection.
 */
export function loadArtifactsMatching<T>(
  paths: ProjectPaths,
  files: readonly string[],
  spec: ArtifactLoaderSpec<T>,
) {
  const filtered = files.filter(spec.match);
  const reader = spec.source === 'yaml' ? readYamlArtifact : readJsonArtifact;
  const loadOne = (filePath: string) => {
    const errorMessage = `${spec.label} ${filePath} failed validation`;
    const raw = reader(paths, filePath, spec.validate, spec.errorCode, errorMessage);
    return spec.lifetime === 'disposable'
      ? raw.pipe(
          Effect.map((envelope): ArtifactEnvelope<T> | null => envelope),
          Effect.catchAll(() => Effect.succeed(null as ArtifactEnvelope<T> | null)),
        )
      : raw.pipe(Effect.map((envelope): ArtifactEnvelope<T> | null => envelope));
  };

  return Effect.forEach(filtered, loadOne, { concurrency: catalogIoConcurrency }).pipe(
    Effect.map((entries) => {
      const nonNull = entries.flatMap((entry) => (entry ? [entry] : []));
      const sorted = sortByArtifactPath(nonNull);
      if (!spec.postprocess) {
        return sorted;
      }
      const postprocess = spec.postprocess;
      return sorted.map((envelope) => {
        const normalized = postprocess(envelope.artifact);
        return {
          ...envelope,
          artifact: normalized,
          fingerprint: fingerprintArtifact(normalized),
        };
      });
    }),
  );
}

/**
 * Load a single optional singleton artifact. Returns `null` if the
 * file does not exist. If the file exists and `lifetime` is
 * `'disposable'`, validation failures are caught and `null` is
 * returned. If `lifetime` is `'required'`, validation failures
 * propagate as `TesseractError` — the load aborts.
 *
 * Subsumes the `readDisposableSingleton` helper plus the
 * hand-rolled `fs.exists ? readJsonArtifact : null` cascades that
 * previously lived in workspace-catalog.ts. The `source` spec
 * field picks YAML vs JSON; `lifetime` picks fail-fast vs
 * catch-and-null.
 */
export function loadOptionalSingleton<T>(
  paths: ProjectPaths,
  absolutePath: string,
  spec: {
    readonly source: LoadSource;
    readonly lifetime: LoadLifetime;
    readonly validate: (value: unknown) => T;
    readonly errorCode: string;
    readonly label: string;
  },
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    if (!(yield* fs.exists(absolutePath))) {
      return null as ArtifactEnvelope<T> | null;
    }
    const reader = spec.source === 'yaml' ? readYamlArtifact : readJsonArtifact;
    const errorMessage = `${spec.label} ${absolutePath} failed validation`;
    const load = reader(paths, absolutePath, spec.validate, spec.errorCode, errorMessage).pipe(
      Effect.map((envelope): ArtifactEnvelope<T> | null => envelope),
    );
    return yield* spec.lifetime === 'disposable'
      ? load.pipe(Effect.catchAll(() => Effect.succeed(null as ArtifactEnvelope<T> | null)))
      : load;
  });
}
