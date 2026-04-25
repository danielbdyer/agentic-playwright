/**
 * ImprovementLedger JSONL append-only laws (W4 / E1).
 *
 * Pin the contract Wave 4's E1 commitment introduced:
 *
 *   L-Append-Atomic:        appendRun appends one line; never
 *                           rewrites the file.
 *   L-Append-Preserves:     two appendRuns produce a 2-line file
 *                           preserving both runs.
 *   L-Read-Empty-File:      missing path → empty ledger.
 *   L-Read-Skips-Corrupt:   corrupt JSONL lines are skipped, not
 *                           fatal.
 *   L-Backward-Compat:      legacy single-JSON file migrates to
 *                           .jsonl on first loadLedger.
 *   L-SaveLedger-Replaces:  saveLedger is a bulk-write that
 *                           replaces the file (intentional;
 *                           rarely used in production).
 */

import { describe, test, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LocalImprovementRunRepository } from '../../product/instruments/repositories/local-improvement-run-repository';
import type { ImprovementRun } from '../../product/domain/improvement/types';

function stubRun(id: string, startedAt = '2026-04-25T00:00:00.000Z'): ImprovementRun {
  // Minimal-valid ImprovementRun: empty arrays satisfy the
  // identity / lineage-continuity / governance-consistency
  // invariants when accepted=false.
  return {
    kind: 'improvement-run',
    version: 1,
    improvementRunId: id,
    pipelineVersion: '1.0.0',
    startedAt,
    completedAt: '2026-04-25T00:00:01.000Z',
    tags: [],
    substrateContext: {
      substrate: 'synthetic',
      seed: 'seed',
      scenarioCount: 0,
      screenCount: 0,
      phrasingTemplateVersion: 'v1',
    },
    baselineConfig: {} as never,
    configDelta: {},
    participants: [],
    interventions: [],
    converged: false,
    convergenceReason: 'not-converged',
    objectiveVector: { pipelineFitness: 0, architectureFitness: 0, operatorCost: 0 },
    fitnessReport: {} as never,
    scorecardComparison: {
      improved: false,
      regressionDetails: [],
    } as never,
    iterations: [],
    signals: [],
    candidateInterventions: [],
    acceptanceDecisions: [],
    lineage: [],
    accepted: false,
    parentExperimentId: null,
  } as ImprovementRun;
}

function withTmpFile<R>(runner: (jsonlPath: string) => Promise<R>): Promise<R> {
  const dir = mkdtempSync(path.join(tmpdir(), 'improvement-ledger-test-'));
  const jsonlPath = path.join(dir, 'improvement-ledger.jsonl');
  return runner(jsonlPath).finally(() =>
    rmSync(dir, { recursive: true, force: true }),
  );
}

describe('ImprovementLedger JSONL semantics (W4 / E1)', () => {
  test('L-Read-Empty-File: missing file → empty ledger', async () => {
    await withTmpFile(async (p) => {
      const ledger = await LocalImprovementRunRepository.loadLedger(p);
      expect(ledger.kind).toBe('improvement-ledger');
      expect(ledger.runs).toEqual([]);
    });
  });

  test('L-Append-Atomic: appendRun produces a single-line file', async () => {
    await withTmpFile(async (p) => {
      const run = stubRun('run-1');
      await LocalImprovementRunRepository.appendRun(p, run);
      expect(existsSync(p)).toBe(true);
      const content = readFileSync(p, 'utf-8');
      expect(content.trim().split('\n').length).toBe(1);
      expect(JSON.parse(content.trim())).toMatchObject({
        kind: 'improvement-run',
        improvementRunId: 'run-1',
      });
    });
  });

  test('L-Append-Preserves: sequential appends produce a multi-line file', async () => {
    await withTmpFile(async (p) => {
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-1'));
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-2'));
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-3'));
      const content = readFileSync(p, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
      const parsed = lines.map((l) => JSON.parse(l) as ImprovementRun);
      expect(parsed.map((r) => r.improvementRunId)).toEqual([
        'run-1',
        'run-2',
        'run-3',
      ]);
    });
  });

  test('L-Append-Preserves: appendRun does NOT rewrite earlier lines (partial-write safety)', async () => {
    await withTmpFile(async (p) => {
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-1'));
      const beforeStat = readFileSync(p, 'utf-8');
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-2'));
      const afterStat = readFileSync(p, 'utf-8');
      // The "before" content is a strict prefix of the "after"
      // content — concrete proof that appendRun didn't rewrite
      // earlier lines.
      expect(afterStat.startsWith(beforeStat)).toBe(true);
    });
  });

  test('L-Read-Skips-Corrupt: corrupt lines are skipped, not fatal', async () => {
    await withTmpFile(async (p) => {
      // Inject a valid run, then a corrupt line, then another
      // valid run.
      const valid1 = JSON.stringify(stubRun('run-1'));
      const valid2 = JSON.stringify(stubRun('run-2'));
      writeFileSync(p, `${valid1}\nthis is not json\n${valid2}\n`, 'utf-8');
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const ledger = await LocalImprovementRunRepository.loadLedger(p);
        expect(ledger.runs).toHaveLength(2);
        expect(ledger.runs.map((r) => r.improvementRunId)).toEqual([
          'run-1',
          'run-2',
        ]);
        expect(consoleWarn).toHaveBeenCalled();
      } finally {
        consoleWarn.mockRestore();
      }
    });
  });

  test('L-SaveLedger-Replaces: saveLedger replaces file content', async () => {
    await withTmpFile(async (p) => {
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-1'));
      await LocalImprovementRunRepository.appendRun(p, stubRun('run-2'));
      // Bulk-replace with a smaller ledger.
      await LocalImprovementRunRepository.saveLedger(p, {
        kind: 'improvement-ledger',
        version: 1,
        runs: [stubRun('run-replaced')],
      });
      const ledger = await LocalImprovementRunRepository.loadLedger(p);
      expect(ledger.runs).toHaveLength(1);
      expect(ledger.runs[0]!.improvementRunId).toBe('run-replaced');
    });
  });

  test('L-Backward-Compat: legacy .json migrates to .jsonl on first read', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'improvement-ledger-test-'));
    const jsonPath = path.join(dir, 'improvement-ledger.json');
    const jsonlPath = path.join(dir, 'improvement-ledger.jsonl');

    // Plant a legacy single-JSON ledger file.
    const legacyContent = {
      kind: 'improvement-ledger',
      version: 1,
      runs: [stubRun('legacy-1'), stubRun('legacy-2')],
    };
    writeFileSync(jsonPath, JSON.stringify(legacyContent, null, 2), 'utf-8');

    try {
      // Caller passes the legacy `.json` path.
      const ledger = await LocalImprovementRunRepository.loadLedger(jsonPath);
      expect(ledger.runs).toHaveLength(2);
      expect(ledger.runs.map((r) => r.improvementRunId)).toEqual([
        'legacy-1',
        'legacy-2',
      ]);
      // The .jsonl file should now exist; the legacy .json
      // should be removed.
      expect(existsSync(jsonlPath)).toBe(true);
      expect(existsSync(jsonPath)).toBe(false);
      // The .jsonl content has 2 lines.
      const jsonl = readFileSync(jsonlPath, 'utf-8');
      expect(jsonl.trim().split('\n')).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Small inline helper for the spy import.
import { vi } from 'vitest';
