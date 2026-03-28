import { expect, test } from '@playwright/test';
import {
  computeStageFingerprint,
  createDirtyTracker,
  type StageManifest,
} from '../lib/application/dirty-tracking';
import { mulberry32, randomWord } from './support/random';

// ─── Helpers ───

function syntheticManifest(next: () => number, stage: string, timestamp: number): StageManifest {
  const inputs = Array.from({ length: 1 + Math.floor(next() * 4) }, () => randomWord(next));
  return {
    stage,
    inputFingerprint: computeStageFingerprint(inputs),
    outputFingerprint: computeStageFingerprint([randomWord(next)]),
    timestamp,
  };
}

function randomInputs(next: () => number): readonly string[] {
  return Array.from({ length: 1 + Math.floor(next() * 6) }, () => randomWord(next));
}

// ─── Law 1: Fresh tracker has no stale stages ───

test('Law 1: fresh tracker reports all stages as stale (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const tracker = createDirtyTracker();
    const stageName = randomWord(next);
    const fingerprint = computeStageFingerprint(randomInputs(next));

    // A fresh tracker has no manifests, so any stage is stale
    expect(tracker.isStale(stageName, fingerprint)).toBe(true);
    expect(tracker.manifests).toHaveLength(0);
  }
});

// ─── Law 2: After recording, stage is not stale for same input fingerprint ───

test('Law 2: recorded stage is not stale for same input fingerprint (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const stageName = randomWord(next);
    const inputs = randomInputs(next);
    const inputFingerprint = computeStageFingerprint(inputs);
    const outputFingerprint = computeStageFingerprint([randomWord(next)]);

    const tracker = createDirtyTracker().record({
      stage: stageName,
      inputFingerprint,
      outputFingerprint,
      timestamp: Date.now(),
    });

    expect(tracker.isStale(stageName, inputFingerprint)).toBe(false);
  }
});

// ─── Law 3: Different input fingerprint = stale ───

test('Law 3: different input fingerprint marks stage as stale (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const stageName = randomWord(next);
    const originalInputs = randomInputs(next);
    const differentInputs = [...randomInputs(next), randomWord(next)];
    const originalFingerprint = computeStageFingerprint(originalInputs);
    const differentFingerprint = computeStageFingerprint(differentInputs);

    const tracker = createDirtyTracker().record({
      stage: stageName,
      inputFingerprint: originalFingerprint,
      outputFingerprint: computeStageFingerprint([randomWord(next)]),
      timestamp: Date.now(),
    });

    // Same fingerprint: not stale
    expect(tracker.isStale(stageName, originalFingerprint)).toBe(false);
    // Different fingerprint: stale
    expect(tracker.isStale(stageName, differentFingerprint)).toBe(true);
  }
});

// ─── Law 4: Fingerprint is deterministic (same inputs = same hash) ───

test('Law 4: fingerprint is deterministic — same inputs produce same hash (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next1 = mulberry32(seed);
    const next2 = mulberry32(seed);
    const inputs1 = randomInputs(next1);
    const inputs2 = randomInputs(next2);

    const fp1 = computeStageFingerprint(inputs1);
    const fp2 = computeStageFingerprint(inputs2);

    expect(fp1).toBe(fp2);

    // Also verify that different inputs produce different fingerprints
    const next3 = mulberry32(seed + 10000);
    const differentInputs = randomInputs(next3);
    const fp3 = computeStageFingerprint(differentInputs);
    // Extremely unlikely to collide with 150 distinct seeds
    expect(fp3).not.toBe(fp1);
  }
});

// ─── Law 5: Tracker is immutable (record returns new tracker) ───

test('Law 5: record returns a new tracker — original is unchanged (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const stageName = randomWord(next);
    const inputFingerprint = computeStageFingerprint(randomInputs(next));

    const original = createDirtyTracker();
    const updated = original.record({
      stage: stageName,
      inputFingerprint,
      outputFingerprint: computeStageFingerprint([randomWord(next)]),
      timestamp: Date.now(),
    });

    // Original is unchanged
    expect(original.manifests).toHaveLength(0);
    expect(original.isStale(stageName, inputFingerprint)).toBe(true);

    // Updated has the new manifest
    expect(updated.manifests).toHaveLength(1);
    expect(updated.isStale(stageName, inputFingerprint)).toBe(false);

    // They are different objects
    expect(original).not.toBe(updated);
  }
});

// ─── Law 6: Cross-stage dependency: emit depends on bind output fingerprint ───

test('Law 6: cross-stage dependency — emit detects when bind output changes (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);

    // Bind produces an output fingerprint
    const bindInputs = randomInputs(next);
    const bindInputFingerprint = computeStageFingerprint(bindInputs);
    const bindOutputFingerprint = computeStageFingerprint([randomWord(next)]);

    // Record bind stage
    const afterBind = createDirtyTracker().record({
      stage: 'bind',
      inputFingerprint: bindInputFingerprint,
      outputFingerprint: bindOutputFingerprint,
      timestamp: 1000,
    });

    // Emit uses bind's output fingerprint as part of its input
    const emitExtraInputs = randomInputs(next);
    const emitInputFingerprint = computeStageFingerprint([bindOutputFingerprint, ...emitExtraInputs]);

    // Record emit stage
    const afterEmit = afterBind.record({
      stage: 'emit',
      inputFingerprint: emitInputFingerprint,
      outputFingerprint: computeStageFingerprint([randomWord(next)]),
      timestamp: 2000,
    });

    // Emit is fresh when bind output hasn't changed
    expect(afterEmit.isStale('emit', emitInputFingerprint)).toBe(false);

    // Simulate bind re-running with different output
    const newBindOutputFingerprint = computeStageFingerprint([randomWord(next)]);
    const newEmitInputFingerprint = computeStageFingerprint([newBindOutputFingerprint, ...emitExtraInputs]);

    // Emit is now stale because bind output changed
    expect(afterEmit.isStale('emit', newEmitInputFingerprint)).toBe(true);
  }
});

// ─── Law 7: Timestamp ordering is preserved ───

test('Law 7: manifests preserve insertion order and timestamp ordering (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const count = 2 + Math.floor(next() * 5);

    const manifests: StageManifest[] = Array.from({ length: count }, (_, i) =>
      syntheticManifest(next, `stage-${i}`, 1000 + i * 100),
    );

    const tracker = manifests.reduce(
      (acc, manifest) => acc.record(manifest),
      createDirtyTracker(),
    );

    // All manifests are preserved in order
    expect(tracker.manifests).toHaveLength(count);
    tracker.manifests.forEach((manifest, i) => {
      expect(manifest.stage).toBe(`stage-${i}`);
      expect(manifest.timestamp).toBe(1000 + i * 100);
    });

    // Timestamps are monotonically increasing
    for (let i = 1; i < tracker.manifests.length; i += 1) {
      const prev = tracker.manifests[i - 1];
      const curr = tracker.manifests[i];
      expect(curr!.timestamp).toBeGreaterThanOrEqual(prev!.timestamp);
    }
  }
});
