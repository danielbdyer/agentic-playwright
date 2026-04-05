/**
 * W2.17 — Knowledge Promotion Governance Contract Laws
 *
 * Laws verified:
 * 1. Valid state transitions: proposed -> approved -> canonical
 * 2. Invalid transitions are rejected (no skip from proposed -> canonical without evaluation)
 * 3. Evidence count preconditions
 * 4. Confidence threshold preconditions
 * 5. Governance is monotone through the promotion pipeline
 */

import { expect, test } from '@playwright/test';
import { evaluateTrustPolicy } from '../../lib/domain/governance/trust-policy';
import type { ProposalEntry } from '../../lib/domain/execution/types';
import type {
  CertificationStatus,
  Governance,
  ProposalActivation,
  ProposedChangeMetadata,
  TrustPolicy,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
} from '../../lib/domain/governance/workflow-types';
import { mulberry32, pick, randomInt , LAW_SEED_COUNT } from '../support/random';

// ─── Factories ───

function createTrustPolicy(overrides?: Partial<TrustPolicy>): TrustPolicy {
  const defaultRule = {
    minimumConfidence: 0.8,
    requiredEvidence: { minCount: 2, kinds: ['runtime-success'] },
  };

  return {
    version: 1,
    artifactTypes: {
      elements: { ...defaultRule },
      postures: { ...defaultRule },
      surface: { ...defaultRule },
      snapshot: { ...defaultRule },
      hints: { ...defaultRule },
      patterns: { ...defaultRule },
      routes: { ...defaultRule },
    },
    forbiddenAutoHealClasses: ['destructive-mutation'],
    ...overrides,
  };
}

function createProposedChange(overrides?: Partial<ProposedChangeMetadata>): ProposedChangeMetadata {
  return {
    artifactType: 'elements',
    confidence: 0.9,
    autoHealClass: 'runtime-intent-cutover',
    ...overrides,
  };
}

function createEvidence(count: number, kind = 'runtime-success'): ReadonlyArray<{ readonly kind: string }> {
  return Array.from({ length: count }, () => ({ kind }));
}

function createProposalActivation(status: ProposalActivation['status'], opts?: Partial<ProposalActivation>): ProposalActivation {
  return {
    status,
    activatedAt: status === 'activated' ? '2026-01-01T00:00:00.000Z' : null,
    certifiedAt: null,
    reason: null,
    ...opts,
  };
}

function _createProposalEntry(overrides?: Partial<ProposalEntry>): ProposalEntry {
  return {
    proposalId: 'prop-001',
    stepIndex: 0,
    artifactType: 'elements',
    targetPath: 'knowledge/screens/test-screen.elements.yaml',
    title: 'Update locator for testInput',
    patch: { locator: [{ kind: 'test-id', value: 'new-input' }] },
    evidenceIds: ['ev-001', 'ev-002'],
    impactedSteps: [0, 1],
    trustPolicy: { decision: 'allow', reasons: [] },
    certification: 'uncertified',
    activation: createProposalActivation('pending'),
    lineage: {
      runIds: ['run-001'],
      evidenceIds: ['ev-001', 'ev-002'],
      sourceArtifactPaths: ['knowledge/screens/test-screen.elements.yaml'],
    },
    ...overrides,
  };
}

// ─── Helpers ───

const ARTIFACT_TYPES: ReadonlyArray<TrustPolicyArtifactType> = [
  'elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns',
];

/** Simulate the promotion pipeline:
 *  1. Evaluate trust policy (proposed -> evaluated)
 *  2. Check activation (evaluated -> activated/blocked)
 *  3. Check certification (activated -> certified/uncertified)
 */
function promotionPipeline(input: {
  readonly policy: TrustPolicy;
  readonly proposedChange: ProposedChangeMetadata;
  readonly evidence: ReadonlyArray<{ readonly kind: string }>;
}): {
  readonly evaluation: TrustPolicyEvaluation;
  readonly certification: CertificationStatus;
  readonly activationStatus: ProposalActivation['status'];
  readonly governance: Governance;
} {
  const evaluation = evaluateTrustPolicy({
    policy: input.policy,
    proposedChange: input.proposedChange,
    evidence: [...input.evidence],
  });

  const activationStatus: ProposalActivation['status'] =
    evaluation.decision === 'deny' ? 'blocked'
    : evaluation.decision === 'allow' ? 'activated'
    : 'pending';

  const certification: CertificationStatus =
    evaluation.decision === 'allow' ? 'certified' : 'uncertified';

  const governance: Governance =
    evaluation.decision === 'allow' ? 'approved'
    : evaluation.decision === 'deny' ? 'blocked'
    : 'review-required';

  return { evaluation, certification, activationStatus, governance };
}

// ─── Law 1: Valid state transitions ───

test.describe('Knowledge promotion: valid state transitions', () => {
  test('sufficient confidence and evidence produces allow -> activated -> certified', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.95 }),
      evidence: createEvidence(3),
    });

    expect(result.evaluation.decision).toBe('allow');
    expect(result.activationStatus).toBe('activated');
    expect(result.certification).toBe('certified');
    expect(result.governance).toBe('approved');
  });

  test('insufficient confidence produces review -> pending -> uncertified', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.5 }),
      evidence: createEvidence(3),
    });

    expect(result.evaluation.decision).toBe('review');
    expect(result.activationStatus).toBe('pending');
    expect(result.certification).toBe('uncertified');
    expect(result.governance).toBe('review-required');
  });

  test('forbidden auto-heal class produces deny -> blocked -> uncertified', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ autoHealClass: 'destructive-mutation' }),
      evidence: createEvidence(3),
    });

    expect(result.evaluation.decision).toBe('deny');
    expect(result.activationStatus).toBe('blocked');
    expect(result.certification).toBe('uncertified');
    expect(result.governance).toBe('blocked');
  });
});

// ─── Law 2: Invalid transitions are rejected ───

test.describe('Knowledge promotion: invalid transition rejection', () => {
  test('cannot achieve certified status with insufficient evidence', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.95 }),
      evidence: createEvidence(0),
    });

    // Even with high confidence, insufficient evidence must not produce certified
    expect(result.evaluation.decision).not.toBe('allow');
    expect(result.certification).toBe('uncertified');
  });

  test('cannot skip from proposed to canonical without meeting all gates', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const confidence = next() * 0.6; // Below threshold
      const evidenceCount = randomInt(next, 2); // 0 or 1, below minCount 2
      const artifactType = pick(next, ARTIFACT_TYPES);

      const result = promotionPipeline({
        policy: createTrustPolicy(),
        proposedChange: createProposedChange({ confidence, artifactType }),
        evidence: createEvidence(evidenceCount),
      });

      // With sub-threshold confidence AND insufficient evidence, never certified
      expect(result.certification).toBe('uncertified');
      expect(result.evaluation.reasons.length).toBeGreaterThan(0);
    }
  });

  test('forbidden heal class always produces deny regardless of confidence or evidence', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({
        confidence: 1.0,
        autoHealClass: 'destructive-mutation',
      }),
      evidence: createEvidence(100),
    });

    expect(result.evaluation.decision).toBe('deny');
    expect(result.governance).toBe('blocked');
  });
});

// ─── Law 3: Evidence count preconditions ───

test.describe('Knowledge promotion: evidence count preconditions', () => {
  test('exactly meeting the evidence threshold produces allow', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.95 }),
      evidence: createEvidence(2), // Exactly meets minCount: 2
    });

    expect(result.evaluation.decision).toBe('allow');
  });

  test('one below the evidence threshold produces review', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.95 }),
      evidence: createEvidence(1), // One below minCount: 2
    });

    expect(result.evaluation.decision).toBe('review');
    expect(result.evaluation.reasons.some((r) => r.code === 'required-evidence')).toBe(true);
  });

  test('wrong evidence kind does not count toward threshold', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.95 }),
      evidence: createEvidence(10, 'wrong-kind'),
    });

    expect(result.evaluation.decision).toBe('review');
    expect(result.evaluation.reasons.some((r) => r.code === 'required-evidence')).toBe(true);
  });

  test('evidence threshold is respected per artifact type across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const minCount = 1 + randomInt(next, 5);

      const policy = createTrustPolicy({
        artifactTypes: {
          elements: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          postures: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          surface: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          snapshot: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          hints: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          patterns: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
          routes: { minimumConfidence: 0.8, requiredEvidence: { minCount, kinds: ['runtime-success'] } },
        },
      });

      const resultBelow = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({ confidence: 0.95, artifactType }),
        evidence: [...createEvidence(minCount - 1)],
      });

      const resultAt = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({ confidence: 0.95, artifactType }),
        evidence: [...createEvidence(minCount)],
      });

      if (minCount > 0) {
        expect(resultBelow.decision).not.toBe('allow');
      }
      expect(resultAt.decision).toBe('allow');
    }
  });
});

// ─── Law 4: Confidence threshold preconditions ───

test.describe('Knowledge promotion: confidence threshold preconditions', () => {
  test('exactly meeting the confidence threshold produces allow', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.8 }),
      evidence: createEvidence(3),
    });

    expect(result.evaluation.decision).toBe('allow');
  });

  test('just below the confidence threshold produces review', () => {
    const result = promotionPipeline({
      policy: createTrustPolicy(),
      proposedChange: createProposedChange({ confidence: 0.79 }),
      evidence: createEvidence(3),
    });

    expect(result.evaluation.decision).toBe('review');
    expect(result.evaluation.reasons.some((r) => r.code === 'minimum-confidence')).toBe(true);
  });

  test('confidence threshold is respected across 20 seeds and all artifact types', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const threshold = 0.5 + next() * 0.5; // Between 0.5 and 1.0

      const policy = createTrustPolicy({
        artifactTypes: {
          elements: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          postures: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          surface: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          snapshot: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          hints: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          patterns: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
          routes: { minimumConfidence: threshold, requiredEvidence: { minCount: 0, kinds: [] } },
        },
      });

      const resultBelow = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({
          confidence: threshold - 0.01,
          artifactType,
          autoHealClass: null,
        }),
        evidence: [],
      });

      const resultAt = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({
          confidence: threshold,
          artifactType,
          autoHealClass: null,
        }),
        evidence: [],
      });

      expect(resultBelow.decision).not.toBe('allow');
      expect(resultAt.decision).toBe('allow');
    }
  });
});

// ─── Law 5: Governance monotonicity ───

test.describe('Knowledge promotion: governance monotonicity', () => {
  test('governance never weakens: deny can never become allow without addressing reasons', () => {
    const policy = createTrustPolicy();

    // Start with a denied proposal (forbidden auto-heal)
    const deniedResult = evaluateTrustPolicy({
      policy,
      proposedChange: createProposedChange({ autoHealClass: 'destructive-mutation' }),
      evidence: [...createEvidence(10)],
    });

    expect(deniedResult.decision).toBe('deny');

    // Adding more evidence does not change a deny
    const stillDenied = evaluateTrustPolicy({
      policy,
      proposedChange: createProposedChange({ autoHealClass: 'destructive-mutation', confidence: 1.0 }),
      evidence: [...createEvidence(100)],
    });

    expect(stillDenied.decision).toBe('deny');
  });

  test('review reasons accumulate, they do not cancel each other', () => {
    const policy = createTrustPolicy();

    // Low confidence only
    const lowConfidence = evaluateTrustPolicy({
      policy,
      proposedChange: createProposedChange({ confidence: 0.5 }),
      evidence: [...createEvidence(10)],
    });

    // Low confidence AND low evidence
    const bothIssues = evaluateTrustPolicy({
      policy,
      proposedChange: createProposedChange({ confidence: 0.5 }),
      evidence: [...createEvidence(0)],
    });

    expect(bothIssues.reasons.length).toBeGreaterThanOrEqual(lowConfidence.reasons.length);
  });

  test('governance ordering is preserved across all artifact types and 20 seeds', () => {
    const GOVERNANCE_RANK: Record<string, number> = {
      'allow': 2,
      'review': 1,
      'deny': 0,
    };

    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const confidence = next();
      const evidenceCount = randomInt(next, 5);

      const policy = createTrustPolicy();

      const result = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({ confidence, artifactType }),
        evidence: [...createEvidence(evidenceCount)],
      });

      // More evidence with same or higher confidence should never produce a worse decision
      const betterResult = evaluateTrustPolicy({
        policy,
        proposedChange: createProposedChange({ confidence: Math.min(1.0, confidence + 0.3), artifactType }),
        evidence: [...createEvidence(evidenceCount + 5)],
      });

      const resultRank = GOVERNANCE_RANK[result.decision] ?? -1;
      const betterRank = GOVERNANCE_RANK[betterResult.decision] ?? -1;

      expect(betterRank).toBeGreaterThanOrEqual(resultRank);
    }
  });
});

// ─── Law 6: Evaluation is deterministic ───

test.describe('Knowledge promotion: deterministic evaluation', () => {
  test('identical inputs produce identical outputs across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const confidence = next();
      const evidenceCount = randomInt(next, 5);

      const policy = createTrustPolicy();
      const proposedChange = createProposedChange({ confidence, artifactType });
      const evidence = [...createEvidence(evidenceCount)];

      const result1 = evaluateTrustPolicy({ policy, proposedChange, evidence: [...evidence] });
      const result2 = evaluateTrustPolicy({ policy, proposedChange, evidence: [...evidence] });

      expect(result1.decision).toBe(result2.decision);
      expect(result1.reasons).toEqual(result2.reasons);
    }
  });
});
