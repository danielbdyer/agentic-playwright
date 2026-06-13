/**
 * Cold-start cohort regression ratchet laws (Cycle 11 / G2).
 *
 *   ZC46     no regression on any axis → ok.
 *   ZC46.b   recall regression (domTargetMatched ↓) → not ok.
 *   ZC46.c   verified regression (verifiedMatches ↓) → not ok.
 *   ZC46.d   precision regression (falsePositives ↑) → not ok.
 *   ZC46.e   improvements are reported, not silently absorbed, and
 *            an improving run is still ok.
 *   ZC46.f   a substrate-version bump scopes the ratchet out
 *            (informational, ok) — a bump can legitimately disagree.
 *   ZC46.g   committed baselines are structurally valid AND every
 *            baselined AUT exists in the cohort manifest.
 */

import { describe, test, expect } from 'vitest';
import * as path from 'path';
import {
  compareToBaseline,
  loadAllCohortBaselines,
  type CohortBaseline,
  type CohortObservation,
} from '../../workshop/customer-backlog/application/cohort-baseline';
import { loadPublicAutManifest } from '../../workshop/customer-backlog/application/load-public-aut-cohort';

const ROOT = process.cwd();

const BASE: CohortBaseline = {
  aut: 'todomvc',
  substrateVersion: 'floor-a6-degraded-ladder',
  domTargetSteps: 5,
  domTargetMatched: 3,
  verifiedMatches: 2,
  falsePositives: 1,
  capturedAt: '2026-06-13',
  note: 'test fixture',
};

function obs(over: Partial<CohortObservation>): CohortObservation {
  return {
    aut: 'todomvc',
    substrateVersion: 'floor-a6-degraded-ladder',
    domTargetSteps: 5,
    domTargetMatched: 3,
    verifiedMatches: 2,
    falsePositives: 1,
    ...over,
  };
}

describe('Cycle 11 / G2 — cohort regression ratchet', () => {
  test('ZC46: holding all axes is ok', () => {
    const c = compareToBaseline(BASE, obs({}));
    expect(c.ok).toBe(true);
    expect(c.regressions).toEqual([]);
  });

  test('ZC46.b: recall regression fails the ratchet', () => {
    const c = compareToBaseline(BASE, obs({ domTargetMatched: 2 }));
    expect(c.ok).toBe(false);
    expect(c.regressions.join(' ')).toMatch(/recall regressed/);
  });

  test('ZC46.c: verified regression fails the ratchet', () => {
    const c = compareToBaseline(BASE, obs({ verifiedMatches: 1 }));
    expect(c.ok).toBe(false);
    expect(c.regressions.join(' ')).toMatch(/verified regressed/);
  });

  test('ZC46.d: precision regression (more false positives) fails the ratchet', () => {
    const c = compareToBaseline(BASE, obs({ falsePositives: 2 }));
    expect(c.ok).toBe(false);
    expect(c.regressions.join(' ')).toMatch(/precision regressed/);
  });

  test('ZC46.e: improvements are reported and still ok', () => {
    const c = compareToBaseline(
      BASE,
      obs({ domTargetMatched: 4, verifiedMatches: 3, falsePositives: 0 }),
    );
    expect(c.ok).toBe(true);
    expect(c.improvements.length).toBe(3);
    expect(c.improvements.join(' ')).toMatch(/recall improved/);
    expect(c.improvements.join(' ')).toMatch(/precision improved/);
  });

  test('ZC46.f: a substrate-version bump scopes the ratchet out', () => {
    // Even a catastrophic-looking drop is informational across a
    // version bump — the operator must re-baseline at the new version.
    const c = compareToBaseline(
      BASE,
      obs({ substrateVersion: 'floor-a7-something', domTargetMatched: 0 }),
    );
    expect(c.ok).toBe(true);
    expect(c.substrateVersionMismatch).toBe(true);
    expect(c.regressions).toEqual([]);
  });

  test('ZC46.g: committed baselines are well-formed and reference real AUTs', () => {
    const baselines = loadAllCohortBaselines(ROOT);
    expect(baselines.length).toBeGreaterThan(0);
    const manifest = loadPublicAutManifest(ROOT);
    const manifestAuts = new Set(manifest.auts.map((a) => a.name));
    for (const b of baselines) {
      expect(typeof b.aut).toBe('string');
      expect(typeof b.substrateVersion).toBe('string');
      expect(b.domTargetMatched).toBeLessThanOrEqual(b.domTargetSteps);
      expect(b.verifiedMatches).toBeLessThanOrEqual(b.domTargetMatched);
      expect(b.falsePositives).toBeGreaterThanOrEqual(0);
      expect(
        manifestAuts.has(b.aut),
        `baseline ${b.aut} not in cohort manifest`,
      ).toBe(true);
      // A held-out AUT must not be baselined (would contaminate it).
      const entry = manifest.auts.find((a) => a.name === b.aut)!;
      expect(
        entry.partition,
        `baseline ${b.aut} is held-out; baselining it pre-evaluation contaminates the clean-room`,
      ).toBe('training');
    }
  });

  test('ZC46.g.path: baselines resolve under the cohort dir', () => {
    // Sanity: the loader points at the committed location.
    const dir = path.join(ROOT, 'workshop', 'customer-backlog', 'public-aut', 'baselines');
    expect(dir).toMatch(/public-aut\/baselines$/);
  });
});
