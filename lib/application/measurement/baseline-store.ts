/**
 * Baseline store — persists captured L4 metric trees for later
 * comparison.
 *
 * Layout:
 *
 *   .tesseract/baselines/
 *     {label}.baseline.json    one file per labeled baseline
 *
 * Baselines are local per-developer state by design. The fifth-kind
 * loop's gradient signal is per-commit, so persisting baselines across
 * machines is unnecessary — each developer captures and diffs against
 * their own. The .tesseract/ directory is gitignored except for
 * governance anchors.
 */

import * as path from 'path';
import { Effect } from 'effect';
import { FileSystem } from '../ports';
import type { ProjectPaths } from '../paths';
import { TesseractError } from '../../domain/kernel/errors';
import {
  metricBaseline,
  type MetricBaseline,
} from '../../domain/fitness/metric/baseline';
import type { MetricNode } from '../../domain/fitness/metric/tree';

const BASELINE_SUFFIX = '.baseline.json';

function baselineDir(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'baselines');
}

function baselinePath(paths: ProjectPaths, label: string): string {
  return path.join(baselineDir(paths), `${label}${BASELINE_SUFFIX}`);
}

// ─── Capture ─────────────────────────────────────────────────────

export interface CaptureBaselineInput {
  readonly paths: ProjectPaths;
  readonly label: string;
  readonly tree: MetricNode;
  readonly commitSha: string | null;
  readonly pipelineVersion: string;
  readonly notes?: string | undefined;
  readonly capturedAt?: string;
}

export interface CaptureBaselineResult {
  readonly baseline: MetricBaseline;
  readonly path: string;
}

/** Save a captured tree as a baseline under the given label.
 *  Overwrites any existing baseline with the same label. */
export function captureBaseline(
  input: CaptureBaselineInput,
): Effect.Effect<CaptureBaselineResult, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = baselineDir(input.paths);
    yield* fs.ensureDir(dir);
    const baseline = metricBaseline({
      label: input.label,
      capturedAt: input.capturedAt ?? new Date().toISOString(),
      commitSha: input.commitSha,
      pipelineVersion: input.pipelineVersion,
      notes: input.notes,
      tree: input.tree,
    });
    const filePath = baselinePath(input.paths, input.label);
    yield* fs.writeJson(filePath, baseline);
    return { baseline, path: filePath };
  });
}

// ─── Load ────────────────────────────────────────────────────────

export function loadBaseline(
  paths: ProjectPaths,
  label: string,
): Effect.Effect<MetricBaseline, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const filePath = baselinePath(paths, label);
    const exists = yield* fs.exists(filePath);
    if (!exists) {
      return yield* Effect.fail(
        new TesseractError(
          'baseline-not-found',
          `No baseline found at ${filePath} (label: '${label}')`,
        ),
      );
    }
    const raw = yield* fs.readJson(filePath);
    return raw as MetricBaseline;
  });
}

// ─── List ────────────────────────────────────────────────────────

export interface BaselineListing {
  readonly label: string;
  readonly path: string;
}

export function listBaselines(
  paths: ProjectPaths,
): Effect.Effect<readonly BaselineListing[], TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = baselineDir(paths);
    const exists = yield* fs.exists(dir);
    if (!exists) return [];
    const entries = yield* fs.listDir(dir);
    return entries
      .filter((entry) => entry.endsWith(BASELINE_SUFFIX))
      .map((entry) => ({
        label: entry.slice(0, -BASELINE_SUFFIX.length),
        path: path.join(dir, entry),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
}

// ─── Latest baseline (mtime-sorted) ─────────────────────────────

/** Find the most recently modified baseline. Returns `null` when no
 *  baselines exist. Useful as the default comparison target when the
 *  caller does not specify a label. */
export function findLatestBaseline(
  paths: ProjectPaths,
): Effect.Effect<MetricBaseline | null, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const listings = yield* listBaselines(paths);
    if (listings.length === 0) return null;
    let bestMtime = -Infinity;
    let bestLabel: string | null = null;
    for (const listing of listings) {
      const stat = yield* fs.stat(listing.path);
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs;
        bestLabel = listing.label;
      }
    }
    if (bestLabel === null) return null;
    return yield* loadBaseline(paths, bestLabel);
  });
}
