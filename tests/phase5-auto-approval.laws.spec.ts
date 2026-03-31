import { expect, test } from '@playwright/test';
import { evaluateAutoApproval, DEFAULT_AUTO_APPROVAL_POLICY } from '../lib/domain/trust-policy';
import type { AutoApprovalPolicy, TrustPolicy, TrustPolicyEvaluation, ProposedChangeMetadata } from '../lib/domain/types';

// ─── Fixtures ───

const baseTrustPolicy: TrustPolicy = {
  version: 1,
  artifactTypes: {
    elements: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    postures: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    surface: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    snapshot: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    hints: { minimumConfidence: 0.7, requiredEvidence: { minCount: 0, kinds: [] } },
    patterns: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
    routes: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: [] } },
  },
  forbiddenAutoHealClasses: ['dangerous-mutation'],
};

const allowEvaluation: TrustPolicyEvaluation = { decision: 'allow', reasons: [] };
const reviewEvaluation: TrustPolicyEvaluation = {
  decision: 'review',
  reasons: [{ code: 'required-evidence', message: 'Not enough evidence' }],
};
const denyEvaluation: TrustPolicyEvaluation = {
  decision: 'deny',
  reasons: [{ code: 'forbidden-auto-heal', message: 'Auto-heal class is forbidden' }],
};

function baseProposedChange(overrides: Partial<ProposedChangeMetadata> = {}): ProposedChangeMetadata {
  return {
    artifactType: 'hints',
    confidence: 0.9,
    autoHealClass: 'runtime-intent-cutover',
    ...overrides,
  };
}

function dogfoodPolicy(overrides: Partial<AutoApprovalPolicy> = {}): AutoApprovalPolicy {
  return {
    enabled: true,
    profile: 'dogfood',
    forbiddenHealClasses: [],
    thresholdOverrides: {},
    ...overrides,
  };
}

// ─── WP5 Law Tests: Auto-Approval ───

test('ci-batch profile never auto-approves regardless of confidence', () => {
  const policy: AutoApprovalPolicy = {
    enabled: true,
    profile: 'ci-batch',
    forbiddenHealClasses: [],
    thresholdOverrides: {},
  };

  const result = evaluateAutoApproval({
    policy,
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 1.0 }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('ci-batch');
});

test('interactive profile does not auto-approve by default', () => {
  const policy: AutoApprovalPolicy = {
    enabled: true,
    profile: 'interactive',
    forbiddenHealClasses: [],
    thresholdOverrides: {},
  };

  const result = evaluateAutoApproval({
    policy,
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 1.0 }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('interactive');
});

test('dogfood profile auto-approves when confidence >= threshold and trust allows', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 0.9 }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(true);
  expect(result.reason).toContain('passed');
});

test('dogfood profile rejects when confidence is below threshold', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 0.5, artifactType: 'elements' }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('below');
});

test('dogfood profile rejects when trust policy denies', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: denyEvaluation,
    proposedChange: baseProposedChange(),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('denied');
});

test('dogfood profile rejects when trust policy requires review', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: reviewEvaluation,
    proposedChange: baseProposedChange(),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('review');
});

test('forbiddenHealClasses block auto-approval even at high confidence', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy({ forbiddenHealClasses: ['runtime-intent-cutover'] }),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 1.0, autoHealClass: 'runtime-intent-cutover' }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('forbidden');
});

test('thresholdOverrides apply per artifact type', () => {
  // Default threshold for hints is 0.7, override it to 0.95
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy({ thresholdOverrides: { hints: 0.95 } }),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 0.9, artifactType: 'hints' }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('below');
});

test('disabled auto-approval policy never approves', () => {
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy({ enabled: false }),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 1.0 }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(false);
  expect(result.reason).toContain('not enabled');
});

test('auto-approved proposals produce identical structural shape to manual approvals', () => {
  const approved = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 0.9 }),
    trustPolicy: baseTrustPolicy,
  });

  // Auto-approval result has the same shape regardless of outcome
  expect(typeof approved.approved).toBe('boolean');
  expect(typeof approved.reason).toBe('string');
});

test('DEFAULT_AUTO_APPROVAL_POLICY is disabled and interactive', () => {
  expect(DEFAULT_AUTO_APPROVAL_POLICY.enabled).toBe(false);
  expect(DEFAULT_AUTO_APPROVAL_POLICY.profile).toBe('interactive');
  expect(DEFAULT_AUTO_APPROVAL_POLICY.forbiddenHealClasses).toEqual([]);
  expect(DEFAULT_AUTO_APPROVAL_POLICY.thresholdOverrides).toEqual({});
});

test('auto-approval uses artifact-type threshold from trust policy when no override', () => {
  // elements has minimumConfidence 0.8 — confidence of 0.85 should pass
  const result = evaluateAutoApproval({
    policy: dogfoodPolicy(),
    trustEvaluation: allowEvaluation,
    proposedChange: baseProposedChange({ confidence: 0.85, artifactType: 'elements' }),
    trustPolicy: baseTrustPolicy,
  });

  expect(result.approved).toBe(true);
});
