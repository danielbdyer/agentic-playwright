import { expect, test } from '@playwright/test';
import {
  initBuilder,
  recordEvent,
  finalizeIndex,
  seekToIteration,
  seekToAct,
  getIterationEntry,
  sequenceToFraction,
  fractionToSequence,
  INITIAL_BUILDER_STATE,
} from '../lib/domain/journal-index';

test.describe('JournalIndex laws', () => {

  test('Law 1: INITIAL_BUILDER_STATE is empty', () => {
    expect(INITIAL_BUILDER_STATE.totalEvents).toBe(0);
    expect(INITIAL_BUILDER_STATE.boundaries).toHaveLength(0);
    expect(INITIAL_BUILDER_STATE.currentIteration).toBe(0);
  });

  test('Law 2: initBuilder sets runId', () => {
    const builder = initBuilder('run-2024-01-15');
    expect(builder.runId).toBe('run-2024-01-15');
    expect(builder.totalEvents).toBe(0);
  });

  test('Law 3: recordEvent increments total events and byte offset', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'element-probed', 0, '2024-01-01T00:00:00Z', 100, 1, 2);
    expect(builder.totalEvents).toBe(1);
    expect(builder.currentByteOffset).toBe(100);
  });

  test('Law 4: recordEvent creates iteration boundary on iteration change', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'iteration-start', 0, '2024-01-01T00:00:00Z', 80, 1, 4);
    builder = recordEvent(builder, 'scenario-executed', 1, '2024-01-01T00:00:01Z', 120, 1, 5);
    builder = recordEvent(builder, 'iteration-start', 2, '2024-01-01T00:00:02Z', 80, 2, 4);

    const iterBoundaries = builder.boundaries.filter((b) => b.kind === 'iteration');
    expect(iterBoundaries).toHaveLength(2); // iteration 1 and 2
  });

  test('Law 5: recordEvent creates act boundary on act change', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'stage-lifecycle', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    builder = recordEvent(builder, 'stage-lifecycle', 1, '2024-01-01T00:00:01Z', 80, 1, 2);
    builder = recordEvent(builder, 'element-probed', 2, '2024-01-01T00:00:02Z', 80, 1, 3);

    const actBoundaries = builder.boundaries.filter((b) => b.kind === 'act');
    expect(actBoundaries).toHaveLength(3); // acts 1, 2, 3
  });

  test('Law 6: finalizeIndex produces valid index with version 1', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'iteration-start', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    builder = recordEvent(builder, 'element-probed', 1, '2024-01-01T00:00:01Z', 100, 1, 2);
    builder = recordEvent(builder, 'iteration-start', 2, '2024-01-01T00:00:10Z', 80, 2, 4);

    const index = finalizeIndex(builder);
    expect(index.version).toBe(1);
    expect(index.runId).toBe('run-1');
    expect(index.totalEvents).toBe(3);
    expect(index.totalBytes).toBe(260);
  });

  test('Law 7: finalizeIndex computes iteration entries', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'iteration-start', 0, '2024-01-01T00:00:00Z', 80, 1, 4);
    builder = recordEvent(builder, 'scenario-executed', 1, '2024-01-01T00:00:05Z', 120, 1, 5);
    builder = recordEvent(builder, 'iteration-start', 2, '2024-01-01T00:00:10Z', 80, 2, 4);
    builder = recordEvent(builder, 'convergence-evaluated', 3, '2024-01-01T00:00:15Z', 150, 2, 7);

    const index = finalizeIndex(builder);
    expect(index.iterations).toHaveLength(2);
    expect(index.iterations[0]!.iteration).toBe(1);
    expect(index.iterations[1]!.iteration).toBe(2);
  });

  test('Law 8: seekToIteration returns correct boundary', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'start', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    builder = recordEvent(builder, 'mid', 1, '2024-01-01T00:00:05Z', 100, 1, 3);
    builder = recordEvent(builder, 'start', 2, '2024-01-01T00:00:10Z', 80, 2, 4);

    const index = finalizeIndex(builder);
    const boundary = seekToIteration(index, 2);
    expect(boundary).not.toBeNull();
    expect(boundary!.iteration).toBe(2);
    expect(boundary!.sequenceNumber).toBe(2);
  });

  test('Law 9: seekToIteration returns null for missing iteration', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'start', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    const index = finalizeIndex(builder);

    expect(seekToIteration(index, 99)).toBeNull();
  });

  test('Law 10: seekToAct returns correct act boundary', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'stage', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    builder = recordEvent(builder, 'stage', 1, '2024-01-01T00:00:05Z', 80, 1, 2);
    builder = recordEvent(builder, 'stage', 2, '2024-01-01T00:00:10Z', 1, 1, 5);

    const index = finalizeIndex(builder);
    const boundary = seekToAct(index, 1, 2);
    expect(boundary).not.toBeNull();
    expect(boundary!.act).toBe(2);
  });

  test('Law 11: getIterationEntry returns null for missing iteration', () => {
    const index = finalizeIndex(initBuilder('run-1'));
    expect(getIterationEntry(index, 1)).toBeNull();
  });

  test('Law 12: sequenceToFraction maps 0 to 0 and total to 1', () => {
    let builder = initBuilder('run-1');
    for (let i = 0; i < 100; i++) {
      builder = recordEvent(builder, 'event', i, '2024-01-01T00:00:00Z', 80, 1, 1);
    }
    const index = finalizeIndex(builder);

    expect(sequenceToFraction(index, 0)).toBe(0);
    expect(sequenceToFraction(index, 100)).toBe(1);
    expect(sequenceToFraction(index, 50)).toBe(0.5);
  });

  test('Law 13: fractionToSequence is inverse of sequenceToFraction', () => {
    let builder = initBuilder('run-1');
    for (let i = 0; i < 200; i++) {
      builder = recordEvent(builder, 'event', i, '2024-01-01T00:00:00Z', 80, 1, 1);
    }
    const index = finalizeIndex(builder);

    const seq = 100;
    const fraction = sequenceToFraction(index, seq);
    const recovered = fractionToSequence(index, fraction);
    expect(recovered).toBe(seq);
  });

  test('Law 14: fractionToSequence clamps to valid range', () => {
    let builder = initBuilder('run-1');
    for (let i = 0; i < 50; i++) {
      builder = recordEvent(builder, 'event', i, '2024-01-01T00:00:00Z', 80, 1, 1);
    }
    const index = finalizeIndex(builder);

    expect(fractionToSequence(index, -1)).toBe(0);
    expect(fractionToSequence(index, 2)).toBe(50);
  });

  test('Law 15: index total duration is computed from timestamps', () => {
    let builder = initBuilder('run-1');
    builder = recordEvent(builder, 'start', 0, '2024-01-01T00:00:00Z', 80, 1, 1);
    builder = recordEvent(builder, 'end', 1, '2024-01-01T00:02:00Z', 80, 1, 7);

    const index = finalizeIndex(builder);
    expect(index.totalDurationMs).toBe(120000); // 2 minutes
  });
});
