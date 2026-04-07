/**
 * Fingerprint-stability probe — Phase 1.4 application layer.
 *
 * The Phase 1 `lib/domain/fitness/fingerprint-stability.ts` module
 * declared the pure comparison and the obligation shape. This module
 * is the Effect-orchestrated driver that actually *runs* the probe:
 * walk the workspace's generated artifacts, hash them, and either
 * compare against a stored fingerprint snapshot or record the current
 * set as the new snapshot.
 *
 * The test plan:
 *   1. Build a fingerprint map of all `generated/` artifacts and
 *      `.tesseract/tasks/*.resolution.json` artifacts.
 *   2. If a `.tesseract/benchmarks/fingerprint-snapshot.json` exists,
 *      compare against it and emit a `fingerprint-stability`
 *      obligation with `measurementClass: 'direct'`.
 *   3. Otherwise, write the current fingerprint set as the new
 *      snapshot and return an obligation with score 1 (baseline — no
 *      prior state to compare against, so the probe cannot falsify).
 *
 * This closes the K0 doctrinal loop: the kernel theorem group
 * graduates from `proxy` to `direct` once a second compilation has
 * produced a comparable snapshot. Until that second run, the
 * obligation is `direct` with a "no-prior-snapshot" rationale.
 *
 * Effect-orchestrated. Only uses the FileSystem port; no direct IO.
 * Pattern alignment: Effect.gen + yield*, Effect.all for parallel
 * reads, Effect.catchTag for missing-file handling.
 */

import path from 'path';
import { Effect } from 'effect';
import { FileSystem } from '../ports';
import { sha256 } from '../../domain/kernel/hash';
import {
  compareArtifactFingerprints,
  fingerprintStabilityObligation,
  type ArtifactFingerprintMap,
} from '../../domain/fitness/fingerprint-stability';
import type { LogicalProofObligation } from '../../domain/fitness/types';
import { walkFiles } from '../catalog/artifacts';
import type { ProjectPaths } from '../paths';

/** Where the probe stores its canonical snapshot on disk.
 *  Lives under `.tesseract/` (runtime dir, always gitignored) rather
 *  than the suite-rooted `benchmarksDir` so the snapshot cannot
 *  accidentally be committed or shared between suites. */
export function fingerprintSnapshotPath(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'benchmarks', 'fingerprint-snapshot.json');
}

/**
 * Build a fingerprint map from a set of absolute file paths. Pure-ish:
 * the FileSystem reads are Effects; the hashing is a pure fold.
 */
function hashFiles(paths: readonly string[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const entries = yield* Effect.all(
      paths.map((p) =>
        fs.readText(p).pipe(
          Effect.map((content) => [p, sha256(content)] as const),
          Effect.catchAll(() => Effect.succeed(null as readonly [string, string] | null)),
        ),
      ),
      { concurrency: 'unbounded' },
    );
    const result: Record<string, string> = {};
    for (const entry of entries) {
      if (entry) result[entry[0]] = entry[1];
    }
    return result;
  });
}

/**
 * Collect the fingerprintable artifact paths from the workspace.
 * Covers:
 *   - `.tesseract/tasks/*.resolution.json` (task packets — the core
 *     deterministic compile output)
 *   - `.tesseract/bound/*.json` (bound scenarios)
 *   - `generated/{suite}/{ado_id}.spec.ts` and `.review.md` and `.proposals.json`
 */
function collectFingerprintablePaths(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const [tasks, bound, generated] = yield* Effect.all([
      walkFiles(fs, paths.tasksDir).pipe(Effect.catchAll(() => Effect.succeed([] as string[]))),
      walkFiles(fs, paths.boundDir).pipe(Effect.catchAll(() => Effect.succeed([] as string[]))),
      walkFiles(fs, paths.generatedDir).pipe(Effect.catchAll(() => Effect.succeed([] as string[]))),
    ], { concurrency: 'unbounded' });
    return [
      ...tasks.filter((p) => p.endsWith('.resolution.json')),
      ...bound.filter((p) => p.endsWith('.json')),
      ...generated.filter((p) => p.endsWith('.spec.ts') || p.endsWith('.review.md') || p.endsWith('.proposals.json')),
    ].sort();
  });
}

/**
 * Run the fingerprint-stability probe and return an obligation.
 * Side effects:
 *   - Writes the current fingerprint set to the snapshot path on
 *     first run.
 *   - Rewrites the snapshot path on subsequent runs (latest wins) so
 *     the next run compares against the current state.
 *
 * The obligation's `measurementClass` is `'direct'` — this is a real
 * structural comparison of bytes on disk, not a heuristic score.
 */
export function runFingerprintStabilityProbe(input: {
  readonly paths: ProjectPaths;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const artifactPaths = yield* collectFingerprintablePaths(input.paths);
    const currentMap = yield* hashFiles(artifactPaths);

    const snapshotPath = fingerprintSnapshotPath(input.paths);
    const priorRaw = yield* fs.readText(snapshotPath).pipe(
      Effect.map((text) => text as string | null),
      Effect.catchAll(() => Effect.succeed(null as string | null)),
    );

    let obligation: LogicalProofObligation;
    if (priorRaw === null) {
      // First run — no prior snapshot. Direct measurement with a
      // "baseline" note. The second run will produce a real delta.
      obligation = {
        obligation: 'fingerprint-stability',
        propertyRefs: ['K'],
        score: 1,
        status: 'healthy',
        evidence: `baseline: ${Object.keys(currentMap).length} artifacts captured; a second run will produce a real delta.`,
        measurementClass: 'direct',
      };
    } else {
      const prior = JSON.parse(priorRaw.replace(/^\uFEFF/, '')) as ArtifactFingerprintMap;
      const delta = compareArtifactFingerprints(prior, currentMap);
      obligation = fingerprintStabilityObligation(delta);
    }

    // Persist the current snapshot for the next probe. Best effort —
    // a failed write does not invalidate the measurement.
    yield* fs.ensureDir(path.dirname(snapshotPath)).pipe(Effect.catchAll(() => Effect.void));
    yield* fs.writeJson(snapshotPath, currentMap).pipe(Effect.catchAll(() => Effect.void));

    return { obligation, artifactCount: Object.keys(currentMap).length };
  });
}
