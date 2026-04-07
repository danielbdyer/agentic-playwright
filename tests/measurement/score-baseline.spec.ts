import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import { createProjectPaths } from '../../lib/application/paths';
import { FileSystem } from '../../lib/application/ports';
import { LocalFileSystem } from '../../lib/infrastructure/fs/local-fs';
import {
  captureBaseline,
  loadBaseline,
  listBaselines,
  findLatestBaseline,
} from '../../lib/application/measurement/baseline-store';
import { score, findLatestFitnessReport } from '../../lib/application/measurement/score';
import { buildL4MetricTree } from '../../lib/domain/fitness/metric/visitors';
import type { PipelineFitnessReport, PipelineFitnessMetrics } from '../../lib/domain/fitness/types';

function withFileSystem<A, E>(program: Effect.Effect<A, E, FileSystem>): Promise<A> {
  return Effect.runPromise(program.pipe(Effect.provideService(FileSystem, LocalFileSystem)) as Effect.Effect<A, E, never>);
}

function fakeMetrics(overrides: Partial<PipelineFitnessMetrics> = {}): PipelineFitnessMetrics {
  return {
    knowledgeHitRate: 0.7,
    effectiveHitRate: 0.85,
    suspensionRate: 0.05,
    agentFallbackRate: 0.03,
    liveDomFallbackRate: 0.02,
    translationPrecision: 0.92,
    translationRecall: 0.88,
    convergenceVelocity: 4,
    proposalYield: 0.6,
    resolutionByRung: [
      { rung: 'screen-knowledge', wins: 70, rate: 0.7 },
      { rung: 'shared-pattern', wins: 30, rate: 0.3 },
    ],
    degradedLocatorRate: 0.04,
    recoverySuccessRate: 0.9,
    memoryMaturity: 5.2,
    memoryMaturityEntries: 36,
    proofObligations: [],
    ...overrides,
  };
}

function fakeReport(metrics: PipelineFitnessMetrics, runAt: string): PipelineFitnessReport {
  return {
    kind: 'pipeline-fitness-report',
    version: 1,
    pipelineVersion: '0.1.0-test',
    runAt,
    baseline: true,
    metrics,
    failureModes: [],
    scoringEffectiveness: {
      bottleneckWeightCorrelations: [],
      proposalRankingAccuracy: 0,
    },
  };
}

async function writeFitnessReport(rootDir: string, report: PipelineFitnessReport): Promise<void> {
  const dir = path.join(rootDir, '.tesseract', 'benchmarks', 'runs');
  await nodeFs.mkdir(dir, { recursive: true });
  const timestamp = report.runAt.replace(/[:.]/g, '-');
  await nodeFs.writeFile(
    path.join(dir, `${timestamp}.fitness.json`),
    JSON.stringify(report),
  );
}

// ─── Baseline store ──────────────────────────────────────────────

test('captureBaseline persists a baseline that loadBaseline can read back', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-baseline-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: '2026-04-07T00:00:00.000Z' });

    const captured = await withFileSystem(
      captureBaseline({
        paths,
        label: 'test-label',
        tree,
        commitSha: 'abc123',
        pipelineVersion: '0.1.0-test',
        capturedAt: '2026-04-07T00:00:00.000Z',
      }),
    );
    expect(captured.baseline.label).toBe('test-label');

    const loaded = await withFileSystem(loadBaseline(paths, 'test-label'));
    expect(loaded.label).toBe('test-label');
    expect(loaded.commitSha).toBe('abc123');
    expect(loaded.tree.metric.kind).toBe(tree.metric.kind);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('listBaselines returns all captured baselines sorted alphabetically', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-list-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const tree = buildL4MetricTree({ metrics: fakeMetrics(), computedAt: '2026-04-07T00:00:00.000Z' });

    for (const label of ['zebra', 'apple', 'mango']) {
      await withFileSystem(
        captureBaseline({
          paths,
          label,
          tree,
          commitSha: null,
          pipelineVersion: '0.1.0-test',
        }),
      );
    }

    const listings = await withFileSystem(listBaselines(paths));
    expect(listings.map((l) => l.label)).toEqual(['apple', 'mango', 'zebra']);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('findLatestBaseline returns null when no baselines exist', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-empty-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const result = await withFileSystem(findLatestBaseline(paths));
    expect(result).toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('loadBaseline fails with structured error when label is missing', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-missing-'));
  try {
    const paths = createProjectPaths(tmpDir);
    let caught: unknown = null;
    try {
      await withFileSystem(loadBaseline(paths, 'does-not-exist'));
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ─── Score orchestration ─────────────────────────────────────────

test('score fails when no fitness report exists', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-no-report-'));
  try {
    const paths = createProjectPaths(tmpDir);
    let caught: unknown = null;
    try {
      await withFileSystem(score({ paths }));
    } catch (err) {
      caught = err;
    }
    expect(caught).not.toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('findLatestFitnessReport returns null when runs dir is absent', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-no-runs-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const result = await withFileSystem(findLatestFitnessReport(paths));
    expect(result).toBeNull();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('score builds an L4 tree from the latest fitness report', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-score-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const report = fakeReport(fakeMetrics(), '2026-04-07T12-00-00-000Z');
    await writeFitnessReport(tmpDir, report);

    const result = await withFileSystem(
      score({ paths, computedAt: '2026-04-07T12:30:00.000Z' }),
    );
    expect(result.tree.metric.kind).toBe('l4-root');
    expect(result.tree.children.length).toBeGreaterThan(0);
    expect(result.fitnessReport.runAt).toBe(report.runAt);
    expect(result.delta).toBeUndefined();
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('score with baselineLabel diffs against the captured baseline', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-score-diff-'));
  try {
    const paths = createProjectPaths(tmpDir);

    // Capture a baseline from "before" metrics.
    const beforeTree = buildL4MetricTree({
      metrics: fakeMetrics({ knowledgeHitRate: 0.5 }),
      computedAt: '2026-04-07T00:00:00.000Z',
    });
    await withFileSystem(
      captureBaseline({
        paths,
        label: 'pre',
        tree: beforeTree,
        commitSha: 'before',
        pipelineVersion: '0.1.0-test',
      }),
    );

    // Write a fitness report representing "after" metrics.
    const afterReport = fakeReport(fakeMetrics({ knowledgeHitRate: 0.8 }), '2026-04-07T13-00-00-000Z');
    await writeFitnessReport(tmpDir, afterReport);

    const result = await withFileSystem(
      score({ paths, baselineLabel: 'pre', computedAt: '2026-04-07T13:30:00.000Z' }),
    );

    expect(result.delta).toBeDefined();
    expect(result.verdict).toBeDefined();
    const extractionEntry = result.delta!.entries.find((e) => e.kind === 'extraction-ratio');
    expect(extractionEntry?.direction).toBe('better');
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('score with baselineLabel="latest" finds the most recent baseline', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'measurement-score-latest-'));
  try {
    const paths = createProjectPaths(tmpDir);
    const tree = buildL4MetricTree({
      metrics: fakeMetrics({ knowledgeHitRate: 0.5 }),
      computedAt: '2026-04-07T00:00:00.000Z',
    });
    await withFileSystem(
      captureBaseline({
        paths,
        label: 'old',
        tree,
        commitSha: null,
        pipelineVersion: '0.1.0-test',
      }),
    );
    // Wait a beat to ensure mtime ordering, then write a newer one.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await withFileSystem(
      captureBaseline({
        paths,
        label: 'new',
        tree,
        commitSha: null,
        pipelineVersion: '0.1.0-test',
      }),
    );

    const report = fakeReport(fakeMetrics({ knowledgeHitRate: 0.9 }), '2026-04-07T15-00-00-000Z');
    await writeFitnessReport(tmpDir, report);

    const result = await withFileSystem(
      score({ paths, baselineLabel: 'latest' }),
    );
    expect(result.baseline?.label).toBe('new');
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});
