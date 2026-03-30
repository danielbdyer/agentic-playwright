import { test, expect } from '@playwright/test';
import { Either, Option } from 'effect';
import { TesseractError } from '../lib/domain/errors';
import { decideCandidate, foldTopFailureClass } from '../lib/application/evolve';
import { foldOptionalProjection, getRequiredCatalogEntry } from '../lib/application/run';
import type { CandidateConfig } from '../lib/application/knob-search';
import type { SpeedrunResult } from '../lib/application/speedrun';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/types';

const makeSpeedrunResult = (knowledgeHitRate: number): SpeedrunResult => ({
  fitnessReport: { metrics: { knowledgeHitRate } },
  comparison: { improved: true },
} as unknown as SpeedrunResult);

test('decideCandidate accepts only when candidate and result are both present', () => {
  const candidate: CandidateConfig = {
    label: 'candidate-a',
    rationale: 'test',
    config: DEFAULT_PIPELINE_CONFIG,
    delta: {},
  };
  const speedrunResult = makeSpeedrunResult(0.9);
  const decision = decideCandidate(Option.some(candidate), Option.some(speedrunResult), DEFAULT_PIPELINE_CONFIG);
  expect(Either.isRight(decision)).toBeTruthy();
  if (Either.isRight(decision)) {
    expect(decision.right.accepted).toBeTruthy();
    expect(decision.right.bestCandidate).toEqual(candidate);
    expect(decision.right.bestResult).toEqual(speedrunResult);
  }
});

test('decideCandidate fails on mismatched optional values to avoid silent fallback', () => {
  const candidate: CandidateConfig = {
    label: 'candidate-a',
    rationale: 'test',
    config: DEFAULT_PIPELINE_CONFIG,
    delta: {},
  };
  const decision = decideCandidate(Option.some(candidate), Option.none(), DEFAULT_PIPELINE_CONFIG);
  expect(Either.isLeft(decision)).toBeTruthy();
  if (Either.isLeft(decision)) {
    expect(decision.left).toBeInstanceOf(TesseractError);
    expect(decision.left.code).toBe('validation-error');
  }
});

test('foldTopFailureClass exhaustively handles missing and present branches', () => {
  const noFailure = foldTopFailureClass(Option.none(), {
    onMissing: () => 'none',
    onPresent: () => 'present',
  });
  const withFailure = foldTopFailureClass(Option.some('degraded-locator'), {
    onMissing: () => 'none',
    onPresent: (failureClass) => failureClass,
  });
  expect(noFailure).toBe('none');
  expect(withFailure).toBe('degraded-locator');
});

test('getRequiredCatalogEntry returns domain error when a required artifact is missing', () => {
  const missing = getRequiredCatalogEntry(undefined, () => new TesseractError('missing-required', 'missing'));
  expect(Either.isLeft(missing)).toBeTruthy();
  const present = getRequiredCatalogEntry({ id: 'ok' }, () => new TesseractError('missing-required', 'missing'));
  expect(Either.isRight(present)).toBeTruthy();
});

test('foldOptionalProjection removes repeated null checks for optional projections', () => {
  const missingProjection = foldOptionalProjection(Option.none<number>(), {
    onMissing: () => 'missing',
    onPresent: (value) => String(value),
  });
  const presentProjection = foldOptionalProjection(Option.some(42), {
    onMissing: () => 'missing',
    onPresent: (value) => String(value),
  });
  expect(missingProjection).toBe('missing');
  expect(presentProjection).toBe('42');
});
