/**
 * Score orchestration — load the most recent fitness report, build the
 * L4 metric tree, optionally diff against a baseline, and return the
 * structured result.
 *
 * The score function is the application-layer entry point for Loop C
 * (pipeline measurement). It composes:
 *
 *   1. findLatestFitnessReport() — read the most recent fitness report
 *      from .tesseract/benchmarks/runs/
 *   2. buildPipelineMetricTree()       — pure visitor projection
 *   3. optional baseline diff    — if a label or "latest" is provided
 *
 * The function does NOT regenerate scenarios, run the dogfood loop,
 * or recompute fitness metrics. It strictly reads receipts that
 * already exist on disk. Per doctrine: composing verbs is the
 * operator's job; this verb does one thing (project + diff).
 */

import * as path from 'path';
import { Effect } from 'effect';
import { FileSystem } from '../ports';
import type { ProjectPaths } from '../paths';
import { TesseractError } from '../../domain/kernel/errors';
import type { PipelineFitnessReport } from '../../domain/fitness/types';
import { buildPipelineMetricTree } from '../../domain/fitness/metric/visitors';
import { buildDiscoveryMetricTree } from '../../domain/fitness/metric/visitors-discovery';
import type { MetricNode } from '../../domain/fitness/metric/tree';
import { loadWorkspaceCatalog } from '../catalog/workspace-catalog';
import {
  diffMetricTrees,
  deltaVerdict,
  type MetricTreeDelta,
  type DeltaVerdict,
} from '../../domain/fitness/metric/delta';
import {
  findLatestBaseline,
  loadBaseline,
} from './baseline-store';
import type { MetricBaseline } from '../../domain/fitness/metric/baseline';

// ─── Fitness report discovery ───────────────────────────────────

const FITNESS_SUFFIX = '.fitness.json';

function fitnessRunsDir(paths: ProjectPaths): string {
  return path.join(paths.rootDir, '.tesseract', 'benchmarks', 'runs');
}

/** Find the most recently written fitness report. Returns `null` when
 *  no reports exist. */
export function findLatestFitnessReport(
  paths: ProjectPaths,
): Effect.Effect<PipelineFitnessReport | null, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = fitnessRunsDir(paths);
    const exists = yield* fs.exists(dir);
    if (!exists) return null;
    const entries = yield* fs.listDir(dir);
    const reports = entries.filter((e) => e.endsWith(FITNESS_SUFFIX));
    if (reports.length === 0) return null;

    let bestMtime = -Infinity;
    let bestPath: string | null = null;
    for (const entry of reports) {
      const filePath = path.join(dir, entry);
      const stat = yield* fs.stat(filePath);
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs;
        bestPath = filePath;
      }
    }
    if (bestPath === null) return null;
    const raw = yield* fs.readJson(bestPath);
    return raw as PipelineFitnessReport;
  });
}

// ─── Discovery tree helper ──────────────────────────────────────

/** Load the catalog and build the discovery-fitness tree. Returns
 *  null if the catalog can't be loaded or has no tier1Atoms.
 *  Separated from the main score function so the Effect service
 *  types compose cleanly (loadWorkspaceCatalog and score both
 *  require FileSystem). */
function buildDiscoveryTreeSafe(
  paths: ProjectPaths,
  computedAt: string,
): Effect.Effect<MetricNode | null, never, FileSystem> {
  return loadWorkspaceCatalog({
    paths,
    knowledgePosture: 'warm-start',
    scope: 'compile',
  }).pipe(
    Effect.map((catalog) =>
      catalog.tier1Atoms.length > 0
        ? buildDiscoveryMetricTree({
            discoveredAtoms: [],
            canonicalAtoms: catalog.tier1Atoms.map((e) => e.artifact),
            computedAt,
          })
        : null,
    ),
    Effect.option,
    Effect.map((option) => option._tag === 'Some' ? option.value : null),
  ) as Effect.Effect<MetricNode | null, never, FileSystem>;
}

// ─── Score orchestration ─────────────────────────────────────────

export interface ScoreOptions {
  readonly paths: ProjectPaths;
  /** When provided, diff the new tree against the named baseline.
   *  When `'latest'`, diff against the most recently captured
   *  baseline. When omitted, no diff is computed. */
  readonly baselineLabel?: string | 'latest' | undefined;
  /** ISO timestamp threaded through visitor provenance and any new
   *  baseline. Defaults to `new Date().toISOString()`. */
  readonly computedAt?: string;
}

export interface ScoreResult {
  readonly tree: MetricNode;
  /** The discovery-fitness tree — a parallel peer to the pipeline
   *  tree that measures how well the discovery engine derives
   *  knowledge from scratch. Built from the canonical artifact store
   *  when available; null when no canonical artifacts exist yet. */
  readonly discoveryTree: MetricNode | null;
  readonly fitnessReport: PipelineFitnessReport;
  readonly baseline?: MetricBaseline | undefined;
  readonly delta?: MetricTreeDelta | undefined;
  readonly verdict?: DeltaVerdict | undefined;
}

/** Compose: load latest fitness report, build L4 tree, optionally diff
 *  against a baseline. The returned ScoreResult is structured for
 *  rendering, persistence, or further analysis. */
export function score(
  options: ScoreOptions,
): Effect.Effect<ScoreResult, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const computedAt = options.computedAt ?? new Date().toISOString();

    const report = yield* findLatestFitnessReport(options.paths);
    if (report === null) {
      return yield* Effect.fail(
        new TesseractError(
          'no-fitness-report',
          'No fitness report found in .tesseract/benchmarks/runs/. Run the dogfood loop first.',
        ),
      );
    }

    const tree = buildPipelineMetricTree({
      metrics: report.metrics,
      computedAt,
    });

    // Build the discovery-fitness tree alongside the pipeline tree.
    // Load the catalog to get canonical atoms. discoveredAtoms is
    // empty until the discovery engine is wired to the speedrun
    // (Phase E); until then, all fidelity metrics are zero proxies.
    // Non-fatal: if catalog loading fails, discoveryTree is null.
    const discoveryTree: MetricNode | null = yield* buildDiscoveryTreeSafe(
      options.paths,
      computedAt,
    );

    if (options.baselineLabel === undefined) {
      return { tree, discoveryTree, fitnessReport: report };
    }

    const baseline =
      options.baselineLabel === 'latest'
        ? yield* findLatestBaseline(options.paths)
        : yield* loadBaseline(options.paths, options.baselineLabel);

    if (baseline === null) {
      // 'latest' was requested but no baselines exist — return the
      // tree alone, no diff. This is a non-fatal "first run" case.
      return { tree, discoveryTree, fitnessReport: report };
    }

    const delta = diffMetricTrees({
      baselineLabel: baseline.label,
      comparedAt: computedAt,
      before: baseline.tree,
      after: tree,
    });

    return {
      tree,
      discoveryTree,
      fitnessReport: report,
      baseline,
      delta,
      verdict: deltaVerdict(delta),
    };
  });
}
