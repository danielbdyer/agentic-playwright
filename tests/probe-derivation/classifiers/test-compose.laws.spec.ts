/**
 * test-compose classifier — laws.
 *
 * Pins the classifier's shape-level contract:
 *
 *   T1. Input with valid { flow, imports: { fixtures, scenarioContext } }
 *       returns matched/null.
 *   T2. Input missing `imports` returns failed/unclassified.
 *   T3. Input missing `flow` returns failed/unclassified.
 *   T4. Input that is not an object returns failed/unclassified.
 *   T5. Classifier is pure — two invocations with the same input
 *       produce the same result.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { testComposeClassifier } from '../../../workshop/probe-derivation/classifiers/test-compose';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probeWithInput(input: unknown): Probe {
  return {
    id: 'probe:test-compose:x',
    verb: 'test-compose',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: undefined,
    exercises: [],
  };
}

async function classify(input: unknown) {
  return Effect.runPromise(testComposeClassifier.classify(probeWithInput(input)));
}

describe('test-compose classifier laws', () => {
  test('T1: valid shape → matched', async () => {
    const result = await classify({
      flow: { name: 'x', screen: 's', steps: [] },
      imports: { fixtures: './f', scenarioContext: './sc' },
    });
    expect(result).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('T2: missing imports → failed/unclassified', async () => {
    const result = await classify({ flow: { name: 'x' } });
    expect(result).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });

  test('T3: missing flow → failed/unclassified', async () => {
    const result = await classify({
      imports: { fixtures: './f', scenarioContext: './sc' },
    });
    expect(result).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });

  test('T4: non-object input → failed/unclassified', async () => {
    const result = await classify('not an object');
    expect(result).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });

  test('T5: purity — two runs yield identical results', async () => {
    const input = {
      flow: { name: 'x' },
      imports: { fixtures: './f', scenarioContext: './sc' },
    };
    const first = await classify(input);
    const second = await classify(input);
    expect(first).toEqual(second);
  });
});
