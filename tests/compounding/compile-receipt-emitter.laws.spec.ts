/**
 * CompilationReceipt emitter — Z11a.5 laws.
 *
 *   ZC42     buildCompilationReceipt produces an envelope matching
 *            the Z11a.1 CompilationReceipt shape.
 *   ZC42.b   fingerprints are content-addressed: identical inputs →
 *            identical artifact fingerprint.
 *   ZC42.c   emitCompilationReceipt writes a well-formed JSON file
 *            under workshop/logs/compilation-receipts/.
 *   ZC42.d   provenance.substrateVersion carries the z11a5 marker.
 *   ZC42.e   needs-human summary payload matches intervention-fidelity expectations.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildCompilationReceipt,
  emitCompilationReceipt,
} from '../../workshop/compounding/emission/compile-receipt-emitter';
import type { HeuristicCaseSummary } from '../../workshop/customer-backlog/application/heuristic-classifier';

function resolvableSummary(): HeuristicCaseSummary {
  return {
    adoId: '90001',
    corpus: 'resolvable',
    totalSteps: 4,
    resolvedCount: 4,
    needsHumanCount: 0,
    blockedCount: 0,
    handoffsEmittedCount: 0,
    handoffsWithValidContextCount: 0,
    perStepOutcomes: [],
  };
}

function needsHumanSummary(): HeuristicCaseSummary {
  return {
    adoId: '90101',
    corpus: 'needs-human',
    totalSteps: 3,
    resolvedCount: 0,
    needsHumanCount: 3,
    blockedCount: 0,
    handoffsEmittedCount: 3,
    handoffsWithValidContextCount: 3,
    perStepOutcomes: [],
  };
}

const BASE_INPUT = {
  hypothesisId: null,
  reasoningReceiptIds: [] as readonly string[],
  totalLatencyMs: 12,
  substrateVersion: 'heuristic-z11a5',
  manifestVersion: 1,
  adoContentHash: 'sha256:ado-sample',
  computedAt: new Date('2026-04-23T00:00:00.000Z'),
} as const;

describe('Z11a.5 — compile-receipt-emitter', () => {
  test('ZC42: buildCompilationReceipt yields Z11a.1-shaped envelope', () => {
    const receipt = buildCompilationReceipt({ ...BASE_INPUT, summary: resolvableSummary() });
    expect(receipt.stage).toBe('evidence');
    expect(receipt.scope).toBe('compilation');
    expect(receipt.kind).toBe('compilation-receipt');
    expect(receipt.governance).toBe('approved');
    expect(receipt.payload.adoId).toBe('90001');
    expect(receipt.payload.corpus).toBe('resolvable');
    expect(receipt.payload.totalStepCount).toBe(4);
    expect(receipt.payload.resolvedStepCount).toBe(4);
  });

  test('ZC42.b: content-addressed fingerprint is stable over identical inputs', () => {
    const a = buildCompilationReceipt({ ...BASE_INPUT, summary: resolvableSummary() });
    const b = buildCompilationReceipt({ ...BASE_INPUT, summary: resolvableSummary() });
    expect(a.fingerprints.artifact).toBe(b.fingerprints.artifact);
  });

  test('ZC42.b.sensitivity: different summary → different artifact fingerprint', () => {
    const a = buildCompilationReceipt({ ...BASE_INPUT, summary: resolvableSummary() });
    const b = buildCompilationReceipt({ ...BASE_INPUT, summary: needsHumanSummary() });
    expect(a.fingerprints.artifact).not.toBe(b.fingerprints.artifact);
  });

  test('ZC42.c: emitCompilationReceipt writes a JSON file under workshop/logs/compilation-receipts', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-receipt-emit-'));
    try {
      const receipt = await Effect.runPromise(
        emitCompilationReceipt({
          ...BASE_INPUT,
          summary: resolvableSummary(),
          logRoot: tmp,
        }),
      );
      const dir = path.join(tmp, 'workshop', 'logs', 'compilation-receipts');
      expect(fs.existsSync(dir)).toBe(true);
      const files = fs.readdirSync(dir);
      expect(files.length).toBe(1);
      const content = JSON.parse(fs.readFileSync(path.join(dir, files[0]!), 'utf8'));
      expect(content.fingerprints.artifact).toBe(receipt.fingerprints.artifact);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('ZC42.d: substrateVersion carries the z11a5 marker', () => {
    const receipt = buildCompilationReceipt({ ...BASE_INPUT, summary: resolvableSummary() });
    expect(receipt.payload.provenance.substrateVersion).toBe('heuristic-z11a5');
  });

  test('ZC42.e: needs-human summary → handoffsEmitted matches totalSteps, handoffs all valid', () => {
    const summary = needsHumanSummary();
    const receipt = buildCompilationReceipt({ ...BASE_INPUT, summary });
    expect(receipt.payload.needsHumanStepCount).toBe(summary.totalSteps);
    expect(receipt.payload.handoffsEmitted).toBe(summary.totalSteps);
    expect(receipt.payload.handoffsWithValidMissingContext).toBe(summary.totalSteps);
  });
});
