import { expect, test } from '@playwright/test';
import { computeReadableWindow } from '../dashboard/src/hooks/use-pipeline-buffer';

test.describe('pipeline buffer readable window laws', () => {
  test('within capacity, unread events are read from the prior cursor', () => {
    expect(computeReadableWindow(12, 7, 16)).toEqual({
      batchStart: 7,
      batchSize: 5,
      nextRead: 12,
    });
  });

  test('when unread events exceed capacity, the reader trims to the latest suffix', () => {
    expect(computeReadableWindow(25, 2, 8)).toEqual({
      batchStart: 17,
      batchSize: 8,
      nextRead: 25,
    });
  });

  test('empty polls preserve the cursor and report zero batch size', () => {
    expect(computeReadableWindow(9, 9, 4)).toEqual({
      batchStart: 9,
      batchSize: 0,
      nextRead: 9,
    });
  });
});
