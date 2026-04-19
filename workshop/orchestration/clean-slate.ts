/**
 * Clean-slate preparation — wipe synthetic and ephemeral artifacts.
 *
 * Effect-based implementation using FileSystem and VersionControl ports,
 * keeping this module within the governed application boundary.
 */

import path from 'path';
import { Effect } from 'effect';
import type { ProjectPaths } from '../paths';
import { FileSystem, VersionControl } from '../ports';

/**
 * Wipe transient directories and restore knowledge to HEAD.
 *
 * Uses the governed FileSystem and VersionControl ports instead of raw
 * `fs.rmSync` / `child_process.execSync`, so this program composes with
 * the recording filesystem and respects write-mode posture.
 */
export function cleanSlateProgram(
  rootDir: string,
  paths: ProjectPaths,
): Effect.Effect<void, unknown, any> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const vcs = yield* VersionControl;

    const dirsToWipe = [
      path.join(paths.scenariosDir, 'synthetic'),
      path.join(rootDir, 'generated', 'synthetic'),
      path.join(rootDir, '.tesseract', 'evidence', 'runs'),
      path.join(rootDir, '.tesseract', 'learning'),
      path.join(rootDir, '.tesseract', 'runs'),
      path.join(rootDir, '.tesseract', 'sessions'),
      path.join(rootDir, '.tesseract', 'translation-cache'),
    ];

    yield* Effect.all(
      dirsToWipe.map((dir) => fs.removeDir(dir)),
      { concurrency: 'unbounded' },
    );

    yield* vcs.restoreToHead(['knowledge/']);
  });
}
