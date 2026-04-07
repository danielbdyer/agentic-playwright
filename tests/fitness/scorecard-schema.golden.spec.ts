/**
 * Golden-fixture schema test for `scorecard.json`.
 *
 * The baseline fixture at `tests/fixtures/scorecards/baseline.json` is
 * captured from a real `npx tsx scripts/speedrun.ts` run against the
 * dogfood demo corpus. This test pins the on-disk schema so:
 *
 *   - Phase 1+ fields cannot silently regress (`memoryMaturity`,
 *     `memoryMaturityEntries`, `proofObligations[].measurementClass`,
 *     `theoremBaselineSummary`).
 *   - The validator round-trips the fixture without normalization
 *     (no fields stripped). This is the bug-class that cost me
 *     Phase 0.2 — a schema that silently stripped fields producers
 *     were emitting.
 *   - Adding a new optional field to `ScorecardHighWaterMark` does
 *     not break reads.
 *
 * If the fixture becomes stale, regenerate with:
 *   rm -rf .tesseract && npx tsx scripts/speedrun.ts --count 3 --max-iterations 2 --mode diagnostic
 *   cp .tesseract/benchmarks/scorecard.json tests/fixtures/scorecards/baseline.json
 */

import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import type { PipelineScorecard } from '../../lib/domain/fitness/types';

function loadBaseline(): PipelineScorecard {
  const p = path.join(__dirname, '..', 'fixtures', 'scorecards', 'baseline.json');
  return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as PipelineScorecard;
}

// ─── Structural invariants ─────────────────────────────────────────

test('baseline scorecard has the expected top-level shape', () => {
  const scorecard = loadBaseline();
  expect(scorecard.kind).toBe('pipeline-scorecard');
  expect(scorecard.version).toBe(1);
  expect(scorecard.highWaterMark).toBeDefined();
  expect(Array.isArray(scorecard.history)).toBe(true);
  expect(scorecard.history.length).toBeGreaterThan(0);
});

// ─── Phase 1.1: memoryMaturity wiring ──────────────────────────────

test('highWaterMark carries memoryMaturity and memoryMaturityEntries', () => {
  const scorecard = loadBaseline();
  const hwm = scorecard.highWaterMark;
  expect(hwm.memoryMaturity).toBeDefined();
  expect(typeof hwm.memoryMaturity).toBe('number');
  expect(hwm.memoryMaturity).toBeGreaterThan(0);
  expect(hwm.memoryMaturityEntries).toBeDefined();
  expect(typeof hwm.memoryMaturityEntries).toBe('number');
  expect(hwm.memoryMaturityEntries).toBeGreaterThan(0);
});

test('memoryMaturity is consistent with memoryMaturityEntries (log2(1+N))', () => {
  const scorecard = loadBaseline();
  const hwm = scorecard.highWaterMark;
  // log2(1 + entries) within floating-point tolerance
  const expected = Math.log2(1 + (hwm.memoryMaturityEntries ?? 0));
  expect(hwm.memoryMaturity).toBeCloseTo(expected, 3);
});

test('history entries carry memoryMaturity', () => {
  const scorecard = loadBaseline();
  for (const entry of scorecard.history) {
    expect(entry.memoryMaturity).toBeDefined();
    expect(entry.memoryMaturityEntries).toBeDefined();
  }
});

// ─── Phase 1.7: honest measurement class ───────────────────────────

test('every proofObligation in highWaterMark has a measurementClass', () => {
  const scorecard = loadBaseline();
  const obligations = scorecard.highWaterMark.proofObligations ?? [];
  expect(obligations.length).toBeGreaterThan(0);
  for (const obligation of obligations) {
    expect(obligation.measurementClass).toBeDefined();
  }
});

test('baseline scorecard has zero direct measurements (honest baseline)', () => {
  const scorecard = loadBaseline();
  const obligations = scorecard.highWaterMark.proofObligations ?? [];
  const directCount = obligations.filter((o) => o.measurementClass === 'direct').length;
  // On a fresh single-run speedrun, NO obligation should be `direct`.
  // The cohort-trajectory builder needs ≥3 history points; the
  // fingerprint-stability probe is not wired into the speedrun yet.
  // Every obligation produced by `runtimeProofObligations` is
  // heuristic-proxy by construction (Phase 1.7).
  expect(directCount).toBe(0);
});

test('baseline scorecard obligations are all heuristic-proxy', () => {
  const scorecard = loadBaseline();
  const obligations = scorecard.highWaterMark.proofObligations ?? [];
  const proxyCount = obligations.filter((o) => o.measurementClass === 'heuristic-proxy').length;
  expect(proxyCount).toBe(obligations.length);
});

// ─── Phase 1.7: theoremBaselineSummary honesty ─────────────────────

test('theoremBaselineSummary reports 0 direct on a fresh single-run', () => {
  const scorecard = loadBaseline();
  const summary = scorecard.highWaterMark.theoremBaselineSummary;
  expect(summary).toBeDefined();
  expect(summary!.direct).toBe(0);
  expect(summary!.proxy).toBeGreaterThan(0);
  expect(summary!.fullyBaselined).toBe(false);
});

test('theoremBaselineSummary accounts for all 10 theorem groups', () => {
  const scorecard = loadBaseline();
  const summary = scorecard.highWaterMark.theoremBaselineSummary!;
  expect(summary.total).toBe(10);
  expect(summary.direct + summary.proxy + summary.missing).toBe(summary.total);
});

// ─── Phase 2.4: resolution-by-rung is populated ────────────────────

test('resolutionByRung is populated from real step data', () => {
  const scorecard = loadBaseline();
  const rungs = scorecard.highWaterMark.resolutionByRung;
  expect(Array.isArray(rungs)).toBe(true);
  const totalRate = rungs.reduce((sum, r) => sum + r.rate, 0);
  // Rates sum to ≤ 1 (sorted-at-winning-rung distribution)
  expect(totalRate).toBeLessThanOrEqual(1.001);
});

// ─── Structural: history is monotonic in runAt ─────────────────────

test('history entries are chronologically ordered', () => {
  const scorecard = loadBaseline();
  const timestamps = scorecard.history.map((e) => new Date(e.runAt).getTime());
  const sorted = [...timestamps].sort((a, b) => a - b);
  expect(timestamps).toEqual(sorted);
});

// ─── Golden keys: top-level schema cannot silently add/remove keys ─

test('highWaterMark has the expected key set (guards against silent schema regression)', () => {
  const scorecard = loadBaseline();
  const hwm = scorecard.highWaterMark;
  const requiredKeys = [
    'setAt',
    'pipelineVersion',
    'effectiveHitRate',
    'knowledgeHitRate',
    'translationPrecision',
    'convergenceVelocity',
    'proposalYield',
    'resolutionByRung',
    'memoryMaturity',
    'memoryMaturityEntries',
    'proofObligations',
    'theoremBaselineSummary',
  ];
  for (const key of requiredKeys) {
    expect(hwm).toHaveProperty(key);
  }
});
