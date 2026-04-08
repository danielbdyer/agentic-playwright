import { expect, test } from '@playwright/test';
import {
  summarizeTheoremBaseline,
  theoremBaselineCoverageForObligations,
  theoremBaselineCoverageForObligationsWithProxies,
  type LogicalProofObligation,
} from '../../lib/domain/fitness/types';

function obligation(
  name: LogicalProofObligation['obligation'],
  measurementClass: LogicalProofObligation['measurementClass'],
): LogicalProofObligation {
  return {
    obligation: name,
    propertyRefs: ['K'],
    score: 0.8,
    status: 'healthy',
    evidence: 'test',
    measurementClass,
  };
}

// ─── Phase 1.7 honesty: heuristic-proxy never inflates `direct` ────

test('heuristic-proxy obligations show K as proxy (not direct, not missing)', () => {
  // The honest classification: heuristic obligations exist and provide
  // SOME signal, so the group is `proxy` rather than `missing` — but
  // they cannot graduate to `direct`.
  const obligations = [
    obligation('posture-separability', 'heuristic-proxy'),
    obligation('structural-legibility', 'heuristic-proxy'),
  ];
  const baseline = theoremBaselineCoverageForObligations(obligations);
  const k = baseline.find((entry) => entry.theoremGroup === 'K');
  expect(k?.status).toBe('proxy');
});

test('a single direct posture-separability obligation alone is still proxy (needs fingerprint-stability too)', () => {
  const obligations = [obligation('posture-separability', 'direct')];
  const baseline = theoremBaselineCoverageForObligations(obligations);
  const k = baseline.find((entry) => entry.theoremGroup === 'K');
  expect(k?.status).toBe('proxy');
});

test('K graduates to direct only when both posture-separability AND fingerprint-stability are direct', () => {
  const obligations = [
    obligation('posture-separability', 'direct'),
    obligation('fingerprint-stability', 'direct'),
  ];
  const baseline = theoremBaselineCoverageForObligations(obligations);
  const k = baseline.find((entry) => entry.theoremGroup === 'K');
  expect(k?.status).toBe('direct');
});

test('summary across heuristic-proxy-only obligations: every group is missing or proxy, never direct', () => {
  const obligations: LogicalProofObligation[] = [
    'target-observability',
    'posture-separability',
    'affordance-recoverability',
    'structural-legibility',
    'semantic-persistence',
    'dynamic-topology',
    'variance-factorability',
    'recoverability',
    'participatory-unresolvedness',
    'compounding-economics',
    'surface-compressibility',
    'surface-predictability',
    'surface-repairability',
    'participatory-repairability',
    'memory-worthiness',
    'meta-worthiness',
  ].map((name) => obligation(name as LogicalProofObligation['obligation'], 'heuristic-proxy'));

  const baseline = theoremBaselineCoverageForObligations(obligations);
  const summary = summarizeTheoremBaseline(baseline);
  expect(summary.direct).toBe(0);
});

test('proxy reducer surfaces heuristic obligations (for dashboards that want both views)', () => {
  const obligations = [obligation('posture-separability', 'heuristic-proxy')];
  const proxies = theoremBaselineCoverageForObligationsWithProxies(obligations);
  const k = proxies.find((entry) => entry.theoremGroup === 'K');
  expect(k?.status).not.toBe('missing'); // it's surfaced as proxy when proxies are included
});

test('mixing direct and proxy: direct ones graduate, heuristic ones stay proxy', () => {
  const obligations = [
    obligation('posture-separability', 'direct'),
    obligation('fingerprint-stability', 'direct'),
    obligation('compounding-economics', 'heuristic-proxy'),
  ];
  const baseline = theoremBaselineCoverageForObligations(obligations);
  const k = baseline.find((entry) => entry.theoremGroup === 'K');
  const c = baseline.find((entry) => entry.theoremGroup === 'C');
  expect(k?.status).toBe('direct');
  // C is heuristic-only, so it stays at proxy — present but not direct
  expect(c?.status).toBe('proxy');
});

test('omitted measurementClass is treated as legacy/direct (backwards compat)', () => {
  // Old scorecards on disk lack the field; we treat them as direct for
  // backwards compat. New code should always set measurementClass.
  const legacy: LogicalProofObligation = {
    obligation: 'posture-separability',
    propertyRefs: ['K'],
    score: 0.8,
    status: 'healthy',
    evidence: 'legacy',
  };
  const fingerprintLegacy: LogicalProofObligation = {
    obligation: 'fingerprint-stability',
    propertyRefs: ['K'],
    score: 0.8,
    status: 'healthy',
    evidence: 'legacy',
  };
  const baseline = theoremBaselineCoverageForObligations([legacy, fingerprintLegacy]);
  const k = baseline.find((entry) => entry.theoremGroup === 'K');
  expect(k?.status).toBe('direct'); // legacy obligations grandfather in
});
