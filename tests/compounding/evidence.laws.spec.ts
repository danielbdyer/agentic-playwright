/**
 * Compounding domain — Z1b laws (runtime evidence types).
 *
 * Per docs/v2-compounding-engine-plan.md §9.1, the Z1b phase pins:
 *
 *   ZC4   (HypothesisReceipt envelope): envelope has version=1,
 *         stage='evidence', scope='hypothesis', kind='hypothesis-
 *         receipt', governance='approved'.
 *   ZC5   (ConfirmationOutcome fold): foldConfirmationOutcome
 *         exhaustive over 3 variants.
 *   ZC6   (GraduationGate state fold): foldGraduationGateState
 *         exhaustive over 3 variants.
 *   ZC7   (rollingRate correctness): known trajectory → known rate;
 *         empty → null; zero denominator → null.
 *   ZC8   (TrajectoryEntry immutability): appendTrajectoryEntry
 *         returns a new Trajectory; original unchanged.
 *   ZC9   (CompoundingError fold): foldCompoundingError exhaustive
 *         over 4 variants.
 *   ZC9.b (Domain purity): no file under workshop/compounding/
 *         domain/ imports from 'effect'.
 *
 * The ZC4 envelope shape is asserted by constructing a
 * HypothesisReceipt fixture that satisfies the interface; the
 * Z5 application-layer builder will round-trip this shape under
 * programmatic construction.
 */

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { asFingerprint } from '../../product/domain/kernel/hash';
import {
  foldConfirmationOutcome,
  type ConfirmationOutcome,
} from '../../workshop/compounding/domain/confirmation';
import {
  foldCompoundingError,
  evidenceQueryFailed,
  hypothesisFingerprintMismatch,
  logIoFailed,
  supersedesChainCircular,
  type CompoundingError,
} from '../../workshop/compounding/domain/compounding-error';
import {
  foldGraduationGateState,
  GRADUATION_CONDITIONS,
  type GraduationGateState,
} from '../../workshop/compounding/domain/graduation';
import { hypothesisId } from '../../workshop/compounding/domain/hypothesis';
import type { HypothesisReceipt } from '../../workshop/compounding/domain/hypothesis-receipt';
import {
  appendTrajectoryEntry,
  rollingRate,
  type Trajectory,
  type TrajectoryEntry,
} from '../../workshop/compounding/domain/trajectory';

function sampleEntry(
  confirmed: number,
  refuted: number,
  timestamp = '2026-04-23T00:00:00.000Z',
): TrajectoryEntry {
  const rate = confirmed + refuted === 0 ? 0 : confirmed / (confirmed + refuted);
  return {
    cohortId: 'probe-surface:verb:observe|facet-kind:element|error-family:none',
    timestamp,
    sampleSize: confirmed + refuted,
    confirmedCount: confirmed,
    refutedCount: refuted,
    rate,
    substrateVersion: '1.0.0',
  };
}

function sampleHypothesisReceipt(): HypothesisReceipt {
  return {
    version: 1,
    stage: 'evidence',
    scope: 'hypothesis',
    kind: 'hypothesis-receipt',
    ids: {},
    fingerprints: {
      artifact: 'fp:hr:sample',
    },
    lineage: {
      sources: ['hypothesis:00000000-0000-4000-8000-000000000001'],
      parents: [],
      handshakes: ['evidence'],
      experimentIds: [],
    },
    governance: 'approved',
    payload: {
      hypothesisId: hypothesisId('00000000-0000-4000-8000-000000000001'),
      hypothesisFingerprint: asFingerprint('hypothesis', 'fp:h:sample'),
      outcome: 'confirmed',
      evidenceReceiptIds: ['probe:r1', 'probe:r2'],
      confirmedCount: 2,
      refutedCount: 0,
      inconclusiveCount: 0,
      cycleRate: 1,
      provenance: {
        substrateVersion: '1.0.0',
        manifestVersion: 1,
        computedAt: '2026-04-23T00:00:00.000Z',
      },
    },
  };
}

describe('Compounding domain Z1b — runtime evidence types', () => {
  test('ZC4: HypothesisReceipt envelope carries the expected header', () => {
    const receipt = sampleHypothesisReceipt();
    expect(receipt.version).toBe(1);
    expect(receipt.stage).toBe('evidence');
    expect(receipt.scope).toBe('hypothesis');
    expect(receipt.kind).toBe('hypothesis-receipt');
    expect(receipt.governance).toBe('approved');
  });

  test('ZC4.b: HypothesisReceipt payload carries ids and counts', () => {
    const receipt = sampleHypothesisReceipt();
    expect(receipt.payload.hypothesisId).toBe('00000000-0000-4000-8000-000000000001');
    expect(receipt.payload.evidenceReceiptIds).toEqual(['probe:r1', 'probe:r2']);
    expect(
      receipt.payload.confirmedCount +
        receipt.payload.refutedCount +
        receipt.payload.inconclusiveCount,
    ).toBe(2);
    expect(receipt.payload.cycleRate).toBe(1);
  });

  test('ZC5: foldConfirmationOutcome routes every variant', () => {
    const outcomes: ConfirmationOutcome[] = ['confirmed', 'refuted', 'inconclusive'];
    const tags = outcomes.map((o) =>
      foldConfirmationOutcome(o, {
        confirmed: () => 'c',
        refuted: () => 'r',
        inconclusive: () => 'i',
      }),
    );
    expect(tags).toEqual(['c', 'r', 'i']);
  });

  test('ZC6: foldGraduationGateState routes every variant', () => {
    const states: GraduationGateState[] = ['holds', 'not-yet', 'regressed'];
    const tags = states.map((s) =>
      foldGraduationGateState(s, {
        holds: () => 'h',
        notYet: () => 'n',
        regressed: () => 'r',
      }),
    );
    expect(tags).toEqual(['h', 'n', 'r']);
  });

  test('ZC6.b: GRADUATION_CONDITIONS enumerates the four named gates', () => {
    expect(GRADUATION_CONDITIONS).toEqual([
      'probe-coverage-is-100',
      'scenario-corpus-all-passes',
      'hypothesis-confirmation-rate-sustained',
      'no-ratchet-regressions',
    ]);
  });

  test('ZC7: rollingRate over known trajectory returns the expected rate', () => {
    const trajectory: Trajectory = {
      cohortId: 'test',
      entries: [sampleEntry(8, 2), sampleEntry(9, 1), sampleEntry(10, 0)],
    };
    // Window spans all three entries: 27 confirmed / 30 total = 0.9
    expect(rollingRate(trajectory, 10)).toBeCloseTo(27 / 30);
    // Window of 1: last entry only: 10 / 10 = 1
    expect(rollingRate(trajectory, 1)).toBe(1);
    // Window of 2: last two: 19 / 20
    expect(rollingRate(trajectory, 2)).toBeCloseTo(19 / 20);
  });

  test('ZC7.b: rollingRate over empty trajectory returns null', () => {
    const trajectory: Trajectory = { cohortId: 'test', entries: [] };
    expect(rollingRate(trajectory, 10)).toBeNull();
  });

  test('ZC7.c: rollingRate with zero denominator returns null', () => {
    const trajectory: Trajectory = {
      cohortId: 'test',
      entries: [sampleEntry(0, 0), sampleEntry(0, 0)],
    };
    expect(rollingRate(trajectory, 5)).toBeNull();
  });

  test('ZC7.d: rollingRate with non-positive window returns null', () => {
    const trajectory: Trajectory = {
      cohortId: 'test',
      entries: [sampleEntry(5, 5)],
    };
    expect(rollingRate(trajectory, 0)).toBeNull();
    expect(rollingRate(trajectory, -3)).toBeNull();
  });

  test('ZC8: appendTrajectoryEntry returns a new Trajectory without mutating the original', () => {
    const entry1 = sampleEntry(5, 5);
    const entry2 = sampleEntry(9, 1);
    const before: Trajectory = { cohortId: 'c1', entries: [entry1] };
    const after = appendTrajectoryEntry(before, entry2);
    expect(after.entries).toEqual([entry1, entry2]);
    // Original is unchanged — reference identity of the entries array
    // is distinct.
    expect(before.entries).toEqual([entry1]);
    expect(before.entries).not.toBe(after.entries);
  });

  test('ZC9: foldCompoundingError routes every variant', () => {
    const errors: CompoundingError[] = [
      logIoFailed('/tmp/x', 'ENOENT'),
      hypothesisFingerprintMismatch('fp:a', 'fp:b'),
      evidenceQueryFailed('probe-surface:x', 'db down'),
      supersedesChainCircular(['h1', 'h2', 'h1']),
    ];
    const tags = errors.map((e) =>
      foldCompoundingError(e, {
        logIo: () => 'io',
        fingerprintMismatch: () => 'fp',
        evidenceQuery: () => 'eq',
        supersedesCircular: () => 'sc',
      }),
    );
    expect(tags).toEqual(['io', 'fp', 'eq', 'sc']);
  });

  test('ZC9.b: no file under workshop/compounding/domain/ imports from "effect"', () => {
    const domainDir = path.resolve(__dirname, '../../workshop/compounding/domain');
    const offenders: string[] = [];
    for (const entry of readdirSync(domainDir)) {
      const full = path.join(domainDir, entry);
      if (!statSync(full).isFile()) continue;
      const content = readFileSync(full, 'utf-8');
      if (/from\s+['"]effect['"]/.test(content)) {
        offenders.push(entry);
      }
    }
    expect(offenders).toEqual([]);
  });
});
