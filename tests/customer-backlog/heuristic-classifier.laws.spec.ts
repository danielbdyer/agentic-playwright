/**
 * Heuristic compile-outcome classifier — Z11a.5 laws.
 *
 *   ZC41     resolvable corpus: all parseable steps → would-resolve.
 *   ZC41.b   needs-human corpus: all steps → would-need-human.
 *   ZC41.c   unparseable step → would-need-human regardless of corpus.
 *   ZC41.d   handoffsEmittedCount equals needsHuman + blocked.
 *   ZC41.e   handoffsWithValidContextCount equals handoffsEmitted (Z11a mechanical).
 */

import { describe, test, expect } from 'vitest';
import type { AdoSnapshot } from '../../product/domain/intent/types';
import { classifyCase } from '../../workshop/customer-backlog/application/heuristic-classifier';

function makeCase(id: string, steps: readonly { action: string; expected: string }[]): AdoSnapshot {
  return {
    id, revision: 1, title: `Case ${id}`, suitePath: 't', areaPath: 't', iterationPath: 't',
    tags: [], priority: 1,
    steps: steps.map((s, i) => ({ index: i + 1, action: s.action, expected: s.expected })),
    parameters: [], dataRows: [], contentHash: `hash:${id}`, syncedAt: '2026-04-23T00:00:00.000Z',
  } as AdoSnapshot;
}

describe('Z11a.5 — heuristic classifier', () => {
  test('ZC41: resolvable corpus; parseable steps all classify as would-resolve', () => {
    const snap = makeCase('x', [
      { action: '<p>Click the Submit button</p>', expected: '<p>success</p>' },
      { action: '<p>Enter foo into the Email field</p>', expected: '<p>ok</p>' },
      { action: '<p>Navigate to the Dashboard</p>', expected: '<p>ok</p>' },
    ]);
    const summary = classifyCase(snap, 'resolvable');
    expect(summary.totalSteps).toBe(3);
    expect(summary.resolvedCount).toBe(3);
    expect(summary.needsHumanCount).toBe(0);
    expect(summary.perStepOutcomes.every((o) => o.kind === 'would-resolve')).toBe(true);
  });

  test('ZC41.b: needs-human corpus; every classified step reported as would-need-human', () => {
    const snap = makeCase('y', [
      { action: '<p>Click the Confirm button in the modal</p>', expected: '<p>ok</p>' },
      { action: '<p>Enter foo into the Email field</p>', expected: '<p>ok</p>' },
    ]);
    const summary = classifyCase(snap, 'needs-human');
    expect(summary.totalSteps).toBe(2);
    expect(summary.resolvedCount).toBe(0);
    expect(summary.needsHumanCount).toBe(2);
    expect(summary.perStepOutcomes.every((o) => o.kind === 'would-need-human')).toBe(true);
    // Classifier still succeeded on text shape; just the corpus policy rerouted to needs-human.
    expect(summary.perStepOutcomes.every((o) => o.classifierVerdict === 'classified')).toBe(true);
  });

  test('ZC41.c: unparseable action text → would-need-human in either corpus', () => {
    const snap = makeCase('z', [
      { action: '<p>Perform cryptographic attestation xyzzy</p>', expected: '<p>n/a</p>' },
    ]);
    const resolvable = classifyCase(snap, 'resolvable');
    expect(resolvable.perStepOutcomes[0]!.kind).toBe('would-need-human');
    expect(resolvable.perStepOutcomes[0]!.classifierVerdict).toBe('unclassified');

    const needsHuman = classifyCase(snap, 'needs-human');
    expect(needsHuman.perStepOutcomes[0]!.kind).toBe('would-need-human');
  });

  test('ZC41.d: handoffsEmittedCount equals needsHuman + blocked counts', () => {
    const snap = makeCase('a', [
      { action: '<p>Click Submit button</p>', expected: '' },
      { action: '<p>Perform unknown cryptographic operation</p>', expected: '' },
    ]);
    // In resolvable corpus: 1 resolve + 1 unparseable → needs-human.
    const summary = classifyCase(snap, 'resolvable');
    expect(summary.resolvedCount).toBe(1);
    expect(summary.needsHumanCount).toBe(1);
    expect(summary.handoffsEmittedCount).toBe(
      summary.needsHumanCount + summary.blockedCount,
    );
  });

  test('ZC41.e: Z11a mechanical: handoffsWithValidContextCount == handoffsEmittedCount', () => {
    const snap = makeCase('b', [
      { action: '<p>Click Confirm in the dialog</p>', expected: '' },
      { action: '<p>Click Cancel in the modal</p>', expected: '' },
    ]);
    const summary = classifyCase(snap, 'needs-human');
    expect(summary.handoffsWithValidContextCount).toBe(summary.handoffsEmittedCount);
  });
});
