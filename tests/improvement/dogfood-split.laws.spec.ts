import { expect, test } from '@playwright/test';
import {
  consecutivePairs as fromFacadePairs,
  deriveIterationCorrelations as fromFacadeCorrelations,
  iterationSignalStrengths as fromFacadeSignals,
} from '../../workshop/orchestration/dogfood';
import {
  consecutivePairs,
  deriveIterationCorrelations,
  iterationSignalStrengths,
} from '../../workshop/orchestration/dogfood/metrics';
import type { ImprovementLoopIteration } from '../../product/domain/improvement/types';

const iteration = (overrides: Partial<ImprovementLoopIteration> = {}): ImprovementLoopIteration => ({
  iteration: 1,
  scenarioIds: ['WI:1001'],
  proposalsGenerated: 0,
  proposalsActivated: 0,
  proposalsBlocked: 0,
  knowledgeHitRate: 0.5,
  unresolvedStepCount: 1,
  totalStepCount: 4,
  instructionCount: 10,
  ...overrides,
});

test('dogfood facade re-exports metric laws unchanged', () => {
  const items = [iteration({ iteration: 1 }), iteration({ iteration: 2, knowledgeHitRate: 0.7 })];
  expect(fromFacadePairs(items)).toEqual(consecutivePairs(items));
  expect(fromFacadeSignals(items[0]!)).toEqual(iterationSignalStrengths(items[0]!));
  expect(fromFacadeCorrelations(items)).toEqual(deriveIterationCorrelations(items));
});
