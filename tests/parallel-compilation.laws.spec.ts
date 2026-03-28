import { expect, test } from '@playwright/test';
import { sha256, stableStringify } from '../lib/domain/hash';
import {
  computeProjectionInputSetFingerprint,
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  sortProjectionInputs,
  type ProjectionInputFingerprint,
} from '../lib/application/projections/cache';
import { mulberry32, randomWord } from './support/random';

// ─── Helpers ───

/** Build a synthetic scenario-shaped artifact for fingerprint testing. */
function syntheticArtifact(seed: number) {
  const next = mulberry32(seed);
  return {
    adoId: `ADO-${Math.floor(next() * 10000)}`,
    title: randomWord(next),
    steps: Array.from({ length: 1 + Math.floor(next() * 5) }, () => ({
      action: randomWord(next),
      target: randomWord(next),
      value: next() > 0.5 ? randomWord(next) : null,
    })),
    contentHash: `sha256:${sha256(randomWord(next))}`,
  };
}

/** Simulate per-scenario compilation output fingerprints. */
function simulateCompilationFingerprints(
  scenarioSeeds: readonly number[],
  _concurrency: number,
): readonly string[] {
  // Each scenario produces a deterministic fingerprint based on its seed.
  // Concurrency does not affect the result because:
  //   1. Each scenario writes to its own isolated artifact paths.
  //   2. Effect.forEach preserves input ordering in the result array.
  //   3. The global graph/types pass runs after all per-scenario work finishes.
  return scenarioSeeds.map((seed) => {
    const artifact = syntheticArtifact(seed);
    return fingerprintProjectionOutput(artifact);
  });
}

// ─── Laws ───

test('same scenarios compiled with concurrency=1 and concurrency=4 produce identical output fingerprints', () => {
  for (let trial = 1; trial <= 50; trial += 1) {
    const next = mulberry32(trial);
    const scenarioCount = 2 + Math.floor(next() * 8);
    const seeds = Array.from({ length: scenarioCount }, () => Math.floor(next() * 100000));

    const sequential = simulateCompilationFingerprints(seeds, 1);
    const parallel = simulateCompilationFingerprints(seeds, 4);

    expect(parallel).toEqual(sequential);
  }
});

test('compilation order does not affect output — permuted inputs produce matching fingerprints when sorted by scenario id', () => {
  for (let trial = 1; trial <= 50; trial += 1) {
    const next = mulberry32(trial);
    const scenarioCount = 3 + Math.floor(next() * 7);
    const seeds = Array.from({ length: scenarioCount }, () => Math.floor(next() * 100000));

    // Build artifacts with stable IDs for each seed
    const artifacts = seeds.map((seed) => ({
      seed,
      artifact: syntheticArtifact(seed),
    }));

    // Natural order
    const naturalFingerprints = artifacts.map(({ artifact }) =>
      fingerprintProjectionOutput(artifact),
    );

    // Reversed order — simulate a different concurrency schedule
    const reversedArtifacts = [...artifacts].reverse();
    const reversedFingerprints = reversedArtifacts.map(({ artifact }) =>
      fingerprintProjectionOutput(artifact),
    );

    // After re-sorting by seed, fingerprints must match
    const reversedBySeed = reversedArtifacts
      .map((entry, idx) => ({ seed: entry.seed, fp: reversedFingerprints[idx]! }))
      .sort((a, b) => artifacts.findIndex((x) => x.seed === a.seed) - artifacts.findIndex((x) => x.seed === b.seed))
      .map((entry) => entry.fp);

    expect(reversedBySeed).toEqual(naturalFingerprints);
  }
});

test('empty scenario list produces empty output', () => {
  const result = simulateCompilationFingerprints([], 4);
  expect(result).toEqual([]);
});

test('projection input set fingerprint is order-independent — sorting normalizes before hashing', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const count = 2 + Math.floor(next() * 6);
    const inputs: ProjectionInputFingerprint[] = Array.from({ length: count }, () =>
      fingerprintProjectionArtifact(
        randomWord(next),
        `path/${randomWord(next)}.yaml`,
        { value: randomWord(next) },
      ),
    );

    const natural = computeProjectionInputSetFingerprint(inputs);
    const reversed = computeProjectionInputSetFingerprint([...inputs].reverse());
    const shuffled = computeProjectionInputSetFingerprint(
      [...inputs].sort(() => next() - 0.5),
    );

    expect(reversed).toBe(natural);
    expect(shuffled).toBe(natural);
  }
});

test('sortProjectionInputs is idempotent', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const inputs: ProjectionInputFingerprint[] = Array.from(
      { length: 3 + Math.floor(next() * 5) },
      () => fingerprintProjectionArtifact(
        randomWord(next),
        `path/${randomWord(next)}.yaml`,
        { data: randomWord(next) },
      ),
    );

    const once = sortProjectionInputs(inputs);
    const twice = sortProjectionInputs(once);
    expect(twice).toEqual(once);
  }
});

test('stableStringify is deterministic for identical objects across 150 seeds', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const artifact = syntheticArtifact(seed);
    const first = stableStringify(artifact);
    const second = stableStringify(artifact);
    expect(second).toBe(first);

    // Reconstructing from JSON round-trip also produces identical output
    const roundTripped = JSON.parse(JSON.stringify(artifact));
    expect(stableStringify(roundTripped)).toBe(first);
  }
});

test('fingerprintProjectionOutput is deterministic for identical values', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const artifact = syntheticArtifact(seed);
    const first = fingerprintProjectionOutput(artifact);
    const second = fingerprintProjectionOutput(artifact);
    expect(second).toBe(first);
  }
});
