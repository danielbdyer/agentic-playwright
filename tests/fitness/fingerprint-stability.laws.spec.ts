import { expect, test } from '@playwright/test';
import {
  compareArtifactFingerprints,
  fingerprintStabilityObligation,
  type ArtifactFingerprintMap,
} from '../../workshop/metrics/fingerprint-stability';

const a: ArtifactFingerprintMap = {
  'generated/demo/10001.spec.ts': 'sha-A',
  'generated/demo/10001.review.md': 'sha-B',
  'generated/demo/10001.proposals.json': 'sha-C',
};

// ─── Identical ────────────────────────────────────────────────────

test('compareArtifactFingerprints: identical map → identical=true, zero churn', () => {
  const delta = compareArtifactFingerprints(a, a);
  expect(delta.identical).toBe(true);
  expect(delta.addedPaths).toEqual([]);
  expect(delta.removedPaths).toEqual([]);
  expect(delta.changedPaths).toEqual([]);
  expect(delta.totalPaths).toBe(3);
  expect(delta.stablePaths).toBe(3);
});

// ─── Single change ────────────────────────────────────────────────

test('one path changed → changedPaths reports it', () => {
  const b: ArtifactFingerprintMap = { ...a, 'generated/demo/10001.review.md': 'sha-DIFFERENT' };
  const delta = compareArtifactFingerprints(a, b);
  expect(delta.identical).toBe(false);
  expect(delta.changedPaths).toEqual(['generated/demo/10001.review.md']);
  expect(delta.addedPaths).toEqual([]);
  expect(delta.removedPaths).toEqual([]);
  expect(delta.stablePaths).toBe(2);
});

// ─── Added / removed ─────────────────────────────────────────────

test('added path appears in addedPaths', () => {
  const b: ArtifactFingerprintMap = { ...a, 'generated/demo/10001.trace.json': 'sha-NEW' };
  const delta = compareArtifactFingerprints(a, b);
  expect(delta.addedPaths).toEqual(['generated/demo/10001.trace.json']);
  expect(delta.identical).toBe(false);
});

test('removed path appears in removedPaths', () => {
  const b: ArtifactFingerprintMap = { 'generated/demo/10001.spec.ts': 'sha-A' };
  const delta = compareArtifactFingerprints(a, b);
  expect(delta.removedPaths).toEqual(['generated/demo/10001.proposals.json', 'generated/demo/10001.review.md']);
  expect(delta.identical).toBe(false);
});

// ─── Symmetry ────────────────────────────────────────────────────

test('comparison is structurally symmetric (added ↔ removed flip)', () => {
  const b: ArtifactFingerprintMap = { ...a, 'extra': 'sha-X' };
  const ab = compareArtifactFingerprints(a, b);
  const ba = compareArtifactFingerprints(b, a);
  expect(ab.addedPaths).toEqual(ba.removedPaths);
  expect(ab.removedPaths).toEqual(ba.addedPaths);
  expect(ab.changedPaths).toEqual(ba.changedPaths);
  expect(ab.identical).toBe(ba.identical);
});

// ─── Obligation builder ──────────────────────────────────────────

test('identical delta → healthy obligation, score 1, measurementClass=direct', () => {
  const delta = compareArtifactFingerprints(a, a);
  const obligation = fingerprintStabilityObligation(delta);
  expect(obligation.status).toBe('healthy');
  expect(obligation.score).toBe(1);
  expect(obligation.measurementClass).toBe('direct');
  expect(obligation.propertyRefs).toEqual(['K']);
});

test('one-of-three changed → watch obligation', () => {
  const b: ArtifactFingerprintMap = { ...a, 'generated/demo/10001.review.md': 'sha-DIFFERENT' };
  const obligation = fingerprintStabilityObligation(compareArtifactFingerprints(a, b));
  expect(obligation.status).toBe('watch');
  expect(obligation.score).toBeCloseTo(2 / 3, 4);
});

test('half-or-more churn → critical obligation', () => {
  const b: ArtifactFingerprintMap = {
    'generated/demo/10001.spec.ts': 'sha-DIFFERENT',
    'generated/demo/10001.review.md': 'sha-DIFFERENT',
    'generated/demo/10001.proposals.json': 'sha-DIFFERENT',
  };
  const obligation = fingerprintStabilityObligation(compareArtifactFingerprints(a, b));
  expect(obligation.status).toBe('critical');
});
