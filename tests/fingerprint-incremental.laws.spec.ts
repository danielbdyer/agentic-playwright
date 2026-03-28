import { expect, test } from '@playwright/test';
import { sha256, stableStringify } from '../lib/domain/hash';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionBuildManifest,
  type ProjectionInputFingerprint,
} from '../lib/application/projections/cache';
import { mulberry32, randomWord } from './support/random';

// ─── Helpers ───

function syntheticArtifact(next: () => number) {
  return {
    id: randomWord(next),
    steps: Array.from({ length: 1 + Math.floor(next() * 4) }, () => ({
      action: randomWord(next),
      target: randomWord(next),
    })),
    hash: sha256(randomWord(next)),
  };
}

function buildInputSet(next: () => number, count: number): ProjectionInputFingerprint[] {
  return Array.from({ length: count }, () =>
    fingerprintProjectionArtifact(
      randomWord(next),
      `artifacts/${randomWord(next)}.yaml`,
      syntheticArtifact(next),
    ),
  );
}

function buildManifest(
  inputs: ProjectionInputFingerprint[],
  outputFingerprint: string,
): ProjectionBuildManifest {
  return {
    version: 1,
    projection: 'test',
    inputSetFingerprint: computeProjectionInputSetFingerprint(inputs),
    outputFingerprint,
    inputs,
  };
}

// ─── Laws: fingerprint determinism ───

test('unchanged inputs produce identical fingerprints (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next1 = mulberry32(seed);
    const next2 = mulberry32(seed);
    const artifact1 = syntheticArtifact(next1);
    const artifact2 = syntheticArtifact(next2);

    const fp1 = fingerprintProjectionOutput(artifact1);
    const fp2 = fingerprintProjectionOutput(artifact2);
    expect(fp2).toBe(fp1);
  }
});

test('different inputs produce different fingerprints', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const artifact = syntheticArtifact(next);
    const fp = fingerprintProjectionOutput(artifact);
    // Collision within 150 distinct seeds would indicate a broken hash
    expect(seen.has(fp)).toBe(false);
    seen.add(fp);
  }
});

test('fingerprint is deterministic — same seed always produces same hash (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const results: string[] = [];
    for (let trial = 0; trial < 3; trial += 1) {
      const next = mulberry32(seed);
      const artifact = syntheticArtifact(next);
      results.push(fingerprintProjectionOutput(artifact));
    }
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  }
});

// ─── Laws: manifest-based cache invalidation ───

test('changed fingerprint triggers rebuild — diffProjectionInputs detects changed inputs', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const next = mulberry32(seed);
    const inputCount = 2 + Math.floor(next() * 5);
    const originalInputs = buildInputSet(next, inputCount);
    const outputFp = fingerprintProjectionOutput({ inputs: originalInputs });
    const manifest = buildManifest(originalInputs, outputFp);

    // Mutate one input — simulate a changed artifact
    const mutatedInputs = originalInputs.map((input, idx) =>
      idx === 0
        ? fingerprintProjectionArtifact(input.kind, input.path, { mutated: true, seed })
        : input,
    );

    const diff = diffProjectionInputs(mutatedInputs, manifest);
    expect(diff.changedInputs.length).toBeGreaterThanOrEqual(1);
    expect(diff.changedInputs[0]).toContain(originalInputs[0]!.kind);

    // New input-set fingerprint must differ from manifest
    const newInputSetFp = computeProjectionInputSetFingerprint(mutatedInputs);
    expect(newInputSetFp).not.toBe(manifest.inputSetFingerprint);
  }
});

test('unchanged fingerprint skips rebuild — diffProjectionInputs reports no changes', () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const next = mulberry32(seed);
    const inputCount = 2 + Math.floor(next() * 5);
    const inputs = buildInputSet(next, inputCount);
    const outputFp = fingerprintProjectionOutput({ inputs });
    const manifest = buildManifest(inputs, outputFp);

    const diff = diffProjectionInputs(inputs, manifest);
    expect(diff.changedInputs).toEqual([]);
    expect(diff.removedInputs).toEqual([]);

    // Input-set fingerprint matches manifest — cache hit
    const currentFp = computeProjectionInputSetFingerprint(inputs);
    expect(currentFp).toBe(manifest.inputSetFingerprint);
  }
});

test('removed input detected by diffProjectionInputs', () => {
  const next = mulberry32(42);
  const inputs = buildInputSet(next, 4);
  const outputFp = fingerprintProjectionOutput({ inputs });
  const manifest = buildManifest(inputs, outputFp);

  // Remove last input
  const reduced = inputs.slice(0, 3);
  const diff = diffProjectionInputs(reduced, manifest);
  expect(diff.removedInputs.length).toBe(1);
});

test('added input changes input-set fingerprint', () => {
  const next = mulberry32(99);
  const inputs = buildInputSet(next, 3);
  const fp1 = computeProjectionInputSetFingerprint(inputs);

  const extra = fingerprintProjectionArtifact('extra', 'path/extra.yaml', { added: true });
  const fp2 = computeProjectionInputSetFingerprint([...inputs, extra]);
  expect(fp2).not.toBe(fp1);
});

test('stableStringify key ordering is deterministic regardless of insertion order', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    // Use unique keys to avoid duplicate-key collisions in Object.fromEntries
    const keys = Array.from({ length: 4 }, (_, i) => `key_${i}_${randomWord(next)}`);
    const values = Array.from({ length: 4 }, () => randomWord(next));

    const pairs = keys.map((k, i) => [k, values[i]] as const);
    const obj1 = Object.fromEntries(pairs);
    const obj2 = Object.fromEntries([...pairs].reverse());

    // Same key-value pairs in different insertion order produce same stringification
    expect(stableStringify(obj1)).toBe(stableStringify(obj2));
  }
});

test('null manifest always triggers rebuild', () => {
  const next = mulberry32(7);
  const inputs = buildInputSet(next, 3);

  const diff = diffProjectionInputs(inputs, null);
  // All inputs are "changed" relative to a null baseline
  expect(diff.changedInputs.length).toBe(inputs.length);
});
