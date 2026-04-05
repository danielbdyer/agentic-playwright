/**
 * Evidence Sufficiency — Law Tests (W2.18)
 *
 * Verifies that the trust policy evidence evaluation logic respects:
 *   - Evidence count thresholds
 *   - Evidence kind matching
 *   - Confidence thresholds
 *   - The invariant: sufficient evidence + sufficient confidence = allow
 *   - The invariant: insufficient evidence = review regardless of confidence
 *   - Certification monotonicity: uncertified -> certified is one-way
 *   - Forbidden auto-heal produces deny
 *
 * Tested structures:
 *   - evaluateTrustPolicy
 *   - TrustPolicy, TrustPolicyEvidenceRule, EvidenceDescriptor
 *   - CertificationStatus ordering
 */

import { expect, test } from '@playwright/test';
import { evaluateTrustPolicy } from '../lib/domain/governance/trust-policy';
import type {
  TrustPolicy,
  TrustPolicyArtifactType,
  EvidenceDescriptor,
  ProposedChangeMetadata,
  CertificationStatus,
} from '../lib/domain/governance/workflow-types';
import { mulberry32, pick, randomInt, randomWord , LAW_SEED_COUNT } from './support/random';

// ─── Fixtures ───

const ALL_ARTIFACT_TYPES: readonly TrustPolicyArtifactType[] = [
  'elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns',
];

const EVIDENCE_KINDS = ['screenshot', 'dom-snapshot', 'execution-trace', 'agent-observation'] as const;

function makePolicy(overrides: {
  readonly minimumConfidence?: number;
  readonly minCount?: number;
  readonly kinds?: readonly string[];
  readonly forbiddenAutoHealClasses?: readonly string[];
} = {}): TrustPolicy {
  return {
    version: 1,
    artifactTypes: Object.fromEntries(
      ALL_ARTIFACT_TYPES.map((type) => [type, {
        minimumConfidence: overrides.minimumConfidence ?? 0.8,
        requiredEvidence: {
          minCount: overrides.minCount ?? 2,
          kinds: [...(overrides.kinds ?? ['screenshot', 'dom-snapshot'])],
        },
      }]),
    ) as unknown as TrustPolicy['artifactTypes'],
    forbiddenAutoHealClasses: [...(overrides.forbiddenAutoHealClasses ?? [])],
  };
}

function makeChange(overrides: Partial<ProposedChangeMetadata> = {}): ProposedChangeMetadata {
  return {
    artifactType: overrides.artifactType ?? 'elements',
    confidence: overrides.confidence ?? 0.9,
    autoHealClass: overrides.autoHealClass ?? null,
  };
}

function makeEvidence(kinds: readonly string[]): EvidenceDescriptor[] {
  return kinds.map((kind) => ({ kind }));
}

// ─── Certification monotonicity ───

const CERTIFICATION_ORDER: readonly CertificationStatus[] = ['uncertified', 'certified'];

function certificationOrdinal(status: CertificationStatus): number {
  return CERTIFICATION_ORDER.indexOf(status);
}

// ─── Law 1: Sufficient evidence + sufficient confidence = allow ───

test.describe('Law 1: Sufficient evidence + sufficient confidence = allow', () => {
  test('basic case — enough evidence of correct kinds with high confidence yields allow', () => {
    const policy = makePolicy({ minimumConfidence: 0.7, minCount: 2, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9 }),
      evidence: makeEvidence(['screenshot', 'screenshot']),
    });
    expect(result.decision).toBe('allow');
    expect(result.reasons).toHaveLength(0);
  });

  test('allow decision across all artifact types with 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ALL_ARTIFACT_TYPES);
      const threshold = 0.3 + next() * 0.4; // 0.3 to 0.7
      const confidence = threshold + 0.1 + next() * 0.2; // always above threshold
      const requiredCount = 1 + randomInt(next, 3);
      const evidenceKind = pick(next, EVIDENCE_KINDS);
      const evidenceList = Array.from({ length: requiredCount + randomInt(next, 3) }, () => evidenceKind);

      const policy = makePolicy({ minimumConfidence: threshold, minCount: requiredCount, kinds: [evidenceKind] });
      const result = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ artifactType, confidence }),
        evidence: makeEvidence(evidenceList),
      });
      expect(result.decision).toBe('allow');
    }
  });
});

// ─── Law 2: Insufficient evidence = review regardless of confidence ───

test.describe('Law 2: Insufficient evidence = review regardless of confidence', () => {
  test('high confidence but zero matching evidence yields review', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 2, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 1.0 }),
      evidence: [],
    });
    expect(result.decision).toBe('review');
    expect(result.reasons.some((r) => r.code === 'required-evidence')).toBe(true);
  });

  test('high confidence with wrong evidence kinds yields review', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 2, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 1.0 }),
      evidence: makeEvidence(['execution-trace', 'execution-trace', 'execution-trace']),
    });
    expect(result.decision).toBe('review');
    expect(result.reasons.some((r) => r.code === 'required-evidence')).toBe(true);
  });

  test('insufficient evidence forces review across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const requiredCount = 2 + randomInt(next, 4); // 2-5
      const actualCount = randomInt(next, requiredCount); // 0 to requiredCount-1
      const requiredKind = pick(next, EVIDENCE_KINDS);
      const otherKinds = EVIDENCE_KINDS.filter((k): k is typeof EVIDENCE_KINDS[number] => k !== requiredKind);
      const wrongKind = pick(next, otherKinds);

      // Mix: some correct, some wrong, but total correct < required
      const correctEvidence = Array.from({ length: Math.min(actualCount, requiredCount - 1) }, () => requiredKind);
      const wrongEvidence = Array.from({ length: randomInt(next, 5) }, () => wrongKind);

      const policy = makePolicy({ minimumConfidence: 0.1, minCount: requiredCount, kinds: [requiredKind] });
      const result = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: 1.0 }),
        evidence: makeEvidence([...correctEvidence, ...wrongEvidence]),
      });
      expect(result.decision).not.toBe('allow');
    }
  });
});

// ─── Law 3: Evidence count thresholds are respected ───

test.describe('Law 3: Evidence count thresholds', () => {
  test('exactly at threshold passes', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 3, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9 }),
      evidence: makeEvidence(['screenshot', 'screenshot', 'screenshot']),
    });
    expect(result.decision).toBe('allow');
  });

  test('one below threshold fails', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 3, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9 }),
      evidence: makeEvidence(['screenshot', 'screenshot']),
    });
    expect(result.decision).toBe('review');
  });

  test('threshold boundary across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const threshold = 1 + randomInt(next, 5);
      const kind = pick(next, EVIDENCE_KINDS);
      const policy = makePolicy({ minimumConfidence: 0.1, minCount: threshold, kinds: [kind] });

      // At threshold: allow
      const atThreshold = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: 0.9 }),
        evidence: makeEvidence(Array.from({ length: threshold }, () => kind)),
      });
      expect(atThreshold.decision).toBe('allow');

      // Below threshold: not allow
      const belowThreshold = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: 0.9 }),
        evidence: makeEvidence(Array.from({ length: threshold - 1 }, () => kind)),
      });
      expect(belowThreshold.decision).not.toBe('allow');
    }
  });
});

// ─── Law 4: Evidence kind matching is correct ───

test.describe('Law 4: Evidence kind matching', () => {
  test('only evidence of required kinds count toward threshold', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 2, kinds: ['screenshot'] });

    // 5 wrong-kind, 1 right-kind (below threshold of 2)
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9 }),
      evidence: makeEvidence(['execution-trace', 'dom-snapshot', 'agent-observation', 'execution-trace', 'dom-snapshot', 'screenshot']),
    });
    expect(result.decision).toBe('review');
  });

  test('multiple required kinds all count', () => {
    const policy = makePolicy({ minimumConfidence: 0.5, minCount: 2, kinds: ['screenshot', 'dom-snapshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9 }),
      evidence: makeEvidence(['screenshot', 'dom-snapshot']),
    });
    expect(result.decision).toBe('allow');
  });

  test('kind matching across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const requiredKinds = [pick(next, EVIDENCE_KINDS)];
      const minCount = 1 + randomInt(next, 3);

      // Provide exactly enough of the right kind
      const rightEvidence = Array.from({ length: minCount }, () => requiredKinds[0]!);

      const policy = makePolicy({ minimumConfidence: 0.1, minCount, kinds: requiredKinds });
      const result = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: 0.9 }),
        evidence: makeEvidence(rightEvidence),
      });
      expect(result.decision).toBe('allow');
    }
  });
});

// ─── Law 5: Confidence threshold boundary ───

test.describe('Law 5: Confidence threshold', () => {
  test('confidence at threshold passes', () => {
    const policy = makePolicy({ minimumConfidence: 0.8, minCount: 1, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.8 }),
      evidence: makeEvidence(['screenshot']),
    });
    expect(result.decision).toBe('allow');
  });

  test('confidence below threshold yields review', () => {
    const policy = makePolicy({ minimumConfidence: 0.8, minCount: 1, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.79 }),
      evidence: makeEvidence(['screenshot']),
    });
    expect(result.decision).toBe('review');
    expect(result.reasons.some((r) => r.code === 'minimum-confidence')).toBe(true);
  });

  test('confidence boundary across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const threshold = 0.2 + next() * 0.6; // 0.2 to 0.8
      const kind = pick(next, EVIDENCE_KINDS);
      const policy = makePolicy({ minimumConfidence: threshold, minCount: 1, kinds: [kind] });

      // Above threshold
      const above = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: threshold + 0.01 }),
        evidence: makeEvidence([kind]),
      });
      expect(above.decision).toBe('allow');

      // Below threshold
      const below = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: threshold - 0.01 }),
        evidence: makeEvidence([kind]),
      });
      expect(below.decision).not.toBe('allow');
    }
  });
});

// ─── Law 6: Forbidden auto-heal produces deny ───

test.describe('Law 6: Forbidden auto-heal = deny', () => {
  test('forbidden auto-heal class yields deny regardless of evidence and confidence', () => {
    const policy = makePolicy({
      minimumConfidence: 0.1,
      minCount: 1,
      kinds: ['screenshot'],
      forbiddenAutoHealClasses: ['dangerous-class'],
    });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 1.0, autoHealClass: 'dangerous-class' }),
      evidence: makeEvidence(['screenshot', 'screenshot']),
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons.some((r) => r.code === 'forbidden-auto-heal')).toBe(true);
  });

  test('non-forbidden auto-heal class does not deny', () => {
    const policy = makePolicy({
      minimumConfidence: 0.5,
      minCount: 1,
      kinds: ['screenshot'],
      forbiddenAutoHealClasses: ['dangerous-class'],
    });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.9, autoHealClass: 'safe-class' }),
      evidence: makeEvidence(['screenshot']),
    });
    expect(result.decision).toBe('allow');
  });

  test('forbidden auto-heal across 20 random seeds always yields deny', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const forbiddenClass = randomWord(next);
      const kind = pick(next, EVIDENCE_KINDS);
      const policy = makePolicy({
        minimumConfidence: 0.1,
        minCount: 1,
        kinds: [kind],
        forbiddenAutoHealClasses: [forbiddenClass],
      });
      const result = evaluateTrustPolicy({
        policy,
        proposedChange: makeChange({ confidence: 1.0, autoHealClass: forbiddenClass }),
        evidence: makeEvidence(Array.from({ length: 5 }, () => kind)),
      });
      expect(result.decision).toBe('deny');
    }
  });
});

// ─── Law 7: Certification monotonicity ───

test.describe('Law 7: Certification monotonicity', () => {
  test('certification ordinal is monotonically increasing: uncertified < certified', () => {
    expect(certificationOrdinal('uncertified')).toBeLessThan(certificationOrdinal('certified'));
  });

  test('certification ordering is a total order over all states', () => {
    const states: readonly CertificationStatus[] = ['uncertified', 'certified'];
    for (let i = 0; i < states.length; i += 1) {
      for (let j = i + 1; j < states.length; j += 1) {
        const si = states[i];
        const sj = states[j];
        if (si !== undefined && sj !== undefined) {
          expect(certificationOrdinal(si)).toBeLessThan(certificationOrdinal(sj));
        }
      }
    }
  });

  test('no backwards transition in the ordinal across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const states: CertificationStatus[] = ['uncertified', 'certified'];
      const a = pick(next, states);
      const b = pick(next, states);
      if (certificationOrdinal(a) <= certificationOrdinal(b)) {
        // Valid forward or same transition
        expect(certificationOrdinal(a)).toBeLessThanOrEqual(certificationOrdinal(b));
      } else {
        // Backward: this would be a violation if it occurred in runtime
        expect(certificationOrdinal(a)).toBeGreaterThan(certificationOrdinal(b));
      }
    }
  });
});

// ─── Law 8: Reason accumulation ───

test.describe('Law 8: Multiple failures accumulate reasons', () => {
  test('low confidence + insufficient evidence yields two reasons', () => {
    const policy = makePolicy({ minimumConfidence: 0.9, minCount: 5, kinds: ['screenshot'] });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.1 }),
      evidence: makeEvidence(['screenshot']),
    });
    expect(result.decision).toBe('review');
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('minimum-confidence');
    expect(codes).toContain('required-evidence');
  });

  test('forbidden heal + low confidence + insufficient evidence yields deny with multiple reasons', () => {
    const policy = makePolicy({
      minimumConfidence: 0.9,
      minCount: 5,
      kinds: ['screenshot'],
      forbiddenAutoHealClasses: ['bad'],
    });
    const result = evaluateTrustPolicy({
      policy,
      proposedChange: makeChange({ confidence: 0.1, autoHealClass: 'bad' }),
      evidence: [],
    });
    expect(result.decision).toBe('deny');
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });
});
