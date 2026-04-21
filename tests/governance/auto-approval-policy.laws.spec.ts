/**
 * Auto-Approval Policy -- Law Tests (W4.5)
 *
 * Verifies the auto-approval decision logic from product/application/auto-approval.ts
 * using 20 mulberry32 seeds per law.
 *
 * Laws:
 *   1. Disabled policy never auto-approves
 *   2. Confidence below threshold = defer
 *   3. Confidence at/above threshold with evidence = approve
 *   4. Artifact type not in allowed list = defer
 *   5. Max approvals limit is respected
 *   6. Default policy is safe (disabled)
 *   7. applyAutoApprovalWithTrust composes with trust policy
 *
 * 20 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import {
  applyAutoApproval,
  applyAutoApprovalWithTrust,
  defaultAutoApprovalPolicy,
  isWithinAutoApprovalLimit,
  type AutoApprovalPolicy,
} from '../../product/application/policy/auto-approval';
import type {
  ProposedChangeMetadata,
  TrustPolicy,
  TrustPolicyArtifactType,
} from '../../product/domain/governance/workflow-types';
import { mulberry32, pick, randomInt , LAW_SEED_COUNT } from '../support/random';

// --- Constants ---

const ALL_ARTIFACT_TYPES: readonly TrustPolicyArtifactType[] = [
  'elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns',
];

// --- Helpers ---

function randomProposal(next: () => number): ProposedChangeMetadata {
  return {
    artifactType: pick(next, ALL_ARTIFACT_TYPES),
    confidence: next(), // 0-1
  };
}

function randomEnabledPolicy(next: () => number): AutoApprovalPolicy {
  const allowedCount = 1 + randomInt(next, ALL_ARTIFACT_TYPES.length);
  const shuffled = [...ALL_ARTIFACT_TYPES].sort(() => next() - 0.5);
  const allowedArtifactTypes = shuffled.slice(0, allowedCount);

  return {
    enabled: true,
    minimumConfidence: 0.3 + next() * 0.6, // 0.3-0.9
    allowedArtifactTypes,
    requireEvidence: next() > 0.5,
    maxAutoApprovalsPerRun: 1 + randomInt(next, 20),
  };
}

function randomDisabledPolicy(next: () => number): AutoApprovalPolicy {
  return { ...randomEnabledPolicy(next), enabled: false };
}

function makeTrustPolicy(): TrustPolicy {
  const rule = { minimumConfidence: 0.5, requiredEvidence: { minCount: 0, kinds: [] as readonly string[] } };
  return {
    version: 1,
    artifactTypes: {
      elements: rule,
      postures: rule,
      surface: rule,
      snapshot: rule,
      hints: rule,
      patterns: rule,
      routes: rule,
    },
    forbiddenAutoHealClasses: [],
  };
}

// --- Law 1: Disabled policy never auto-approves (20 seeds) ---

test('disabled policy never auto-approves (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const policy = randomDisabledPolicy(next);
    const proposal = randomProposal(next);
    const evidenceCount = randomInt(next, 10);

    const result = applyAutoApproval(proposal, policy, evidenceCount);
    expect(result.decision).toBe('defer');
    expect(result.reason).toContain('disabled');
  }
});

// --- Law 2: Confidence below threshold = defer (20 seeds) ---

test('confidence below threshold always defers (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const policy = randomEnabledPolicy(next);

    // Force confidence below threshold
    const belowConfidence = policy.minimumConfidence * next() * 0.99; // strictly below
    const proposal: ProposedChangeMetadata = {
      artifactType: pick(next, policy.allowedArtifactTypes as readonly TrustPolicyArtifactType[]),
      confidence: belowConfidence,
    };
    const evidenceCount = 1 + randomInt(next, 5); // ensure evidence present

    const result = applyAutoApproval(proposal, policy, evidenceCount);
    expect(result.decision).toBe('defer');
  }
});

// --- Law 3: Confidence at/above threshold with evidence = approve (20 seeds) ---

test('confidence at or above threshold with evidence approves (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const policy: AutoApprovalPolicy = {
      enabled: true,
      minimumConfidence: 0.3 + next() * 0.4, // 0.3-0.7
      allowedArtifactTypes: [...ALL_ARTIFACT_TYPES], // allow all
      requireEvidence: true,
      maxAutoApprovalsPerRun: 100,
    };

    // Confidence at or above threshold
    const aboveConfidence = policy.minimumConfidence + next() * (1 - policy.minimumConfidence);
    const proposal: ProposedChangeMetadata = {
      artifactType: pick(next, ALL_ARTIFACT_TYPES),
      confidence: aboveConfidence,
    };
    const evidenceCount = 1 + randomInt(next, 5); // non-zero evidence

    const result = applyAutoApproval(proposal, policy, evidenceCount);
    expect(result.decision).toBe('approve');
  }
});

// --- Law 4: Artifact type not in allowed list = defer (20 seeds) ---

test('artifact type not in allowed list defers (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);

    // Pick one artifact type to exclude
    const excluded = pick(next, ALL_ARTIFACT_TYPES);
    const allowed = ALL_ARTIFACT_TYPES.filter((t) => t !== excluded);

    const policy: AutoApprovalPolicy = {
      enabled: true,
      minimumConfidence: 0.1, // very low threshold
      allowedArtifactTypes: allowed,
      requireEvidence: false,
      maxAutoApprovalsPerRun: 100,
    };

    const proposal: ProposedChangeMetadata = {
      artifactType: excluded,
      confidence: 1.0, // max confidence
    };

    const result = applyAutoApproval(proposal, policy, 10);
    expect(result.decision).toBe('defer');
    expect(result.reason).toContain('not in the allowed list');
  }
});

// --- Law 5: Max approvals limit is respected (20 seeds) ---

test('max approvals limit is respected (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const maxApprovals = 1 + randomInt(next, 20);
    const policy: AutoApprovalPolicy = {
      enabled: true,
      minimumConfidence: 0.5,
      allowedArtifactTypes: [...ALL_ARTIFACT_TYPES],
      requireEvidence: false,
      maxAutoApprovalsPerRun: maxApprovals,
    };

    // Below limit: within bounds
    const belowLimit = randomInt(next, maxApprovals);
    expect(isWithinAutoApprovalLimit(policy, belowLimit)).toBe(true);

    // At limit: exceeded
    expect(isWithinAutoApprovalLimit(policy, maxApprovals)).toBe(false);

    // Above limit: exceeded
    expect(isWithinAutoApprovalLimit(policy, maxApprovals + 1 + randomInt(next, 10))).toBe(false);
  }
});

// --- Law 6: Default policy is safe (disabled) ---

test('default policy is safe and disabled (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    // Policy is deterministic but we iterate seeds to confirm stability
    const policy = defaultAutoApprovalPolicy();

    expect(policy.enabled).toBe(false);
    expect(policy.allowedArtifactTypes).toEqual([]);
    expect(policy.maxAutoApprovalsPerRun).toBe(0);
    expect(policy.minimumConfidence).toBeGreaterThan(0);
    expect(policy.minimumConfidence).toBeLessThanOrEqual(1);

    // Default policy must defer for any random proposal
    const next = mulberry32(seed);
    const proposal = randomProposal(next);
    const result = applyAutoApproval(proposal, policy, 10);
    expect(result.decision).toBe('defer');
  }
});

// --- Law 7: applyAutoApprovalWithTrust composes with trust policy (20 seeds) ---

test('applyAutoApprovalWithTrust defers when trust policy denies (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);

    // Trust policy that denies via forbidden auto-heal class
    const healClass = `heal-${randomInt(next, 100)}`;
    const trustPolicy: TrustPolicy = {
      ...makeTrustPolicy(),
      forbiddenAutoHealClasses: [healClass],
    };

    const policy: AutoApprovalPolicy = {
      enabled: true,
      minimumConfidence: 0.1,
      allowedArtifactTypes: [...ALL_ARTIFACT_TYPES],
      requireEvidence: false,
      maxAutoApprovalsPerRun: 100,
    };

    const proposal: ProposedChangeMetadata = {
      artifactType: pick(next, ALL_ARTIFACT_TYPES),
      confidence: 1.0,
      autoHealClass: healClass,
    };

    const result = applyAutoApprovalWithTrust({
      proposal,
      policy,
      evidence: [{ kind: 'runtime-trace' }],
      trustPolicy,
    });

    expect(result.decision).toBe('defer');
    expect(result.reason).toContain('Trust policy denied');
  }
});
