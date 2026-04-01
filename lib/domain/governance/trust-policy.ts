import type {
  AutoApprovalPolicy,
  AutoApprovalResult,
  EvidenceDescriptor,
  ExecutionProfile,
  ProposedChangeMetadata,
  TrustPolicy,
  TrustPolicyEvaluation,
  TrustPolicyEvaluationReason,
} from '../types/workflow';

function confidenceThresholdReason(confidence: number, minimumConfidence: number): TrustPolicyEvaluationReason | null {
  if (confidence >= minimumConfidence) {
    return null;
  }

  return {
    code: 'minimum-confidence',
    message: `Confidence ${confidence.toFixed(2)} is below required minimum ${minimumConfidence.toFixed(2)}`,
  };
}

function evidenceRuleReason(input: {
  evidence: readonly EvidenceDescriptor[];
  requiredKinds: readonly string[];
  minimumCount: number;
}): TrustPolicyEvaluationReason | null {
  const eligibleCount = input.evidence.filter((descriptor) => input.requiredKinds.includes(descriptor.kind)).length;
  if (eligibleCount >= input.minimumCount) {
    return null;
  }

  return {
    code: 'required-evidence',
    message: `Only ${eligibleCount} required evidence records present; minimum ${input.minimumCount} from [${input.requiredKinds.join(', ')}] is required`,
  };
}

function forbiddenAutoHealReason(autoHealClass: string | null | undefined, forbiddenClasses: readonly string[]): TrustPolicyEvaluationReason | null {
  if (!autoHealClass || !forbiddenClasses.includes(autoHealClass)) {
    return null;
  }

  return {
    code: 'forbidden-auto-heal',
    message: `Auto-heal class ${autoHealClass} is forbidden by trust policy`,
  };
}

function decisionForReasons(reasons: ReadonlyArray<TrustPolicyEvaluationReason>): TrustPolicyEvaluation['decision'] {
  if (reasons.length === 0) {
    return 'allow';
  }

  if (reasons.some((reason) => reason.code === 'forbidden-auto-heal')) {
    return 'deny';
  }

  return 'review';
}

export function evaluateTrustPolicy(input: {
  policy: TrustPolicy;
  proposedChange: ProposedChangeMetadata;
  evidence: EvidenceDescriptor[];
}): TrustPolicyEvaluation {
  const artifactRule = input.policy.artifactTypes[input.proposedChange.artifactType];

  const reasons: ReadonlyArray<TrustPolicyEvaluationReason> = [
    confidenceThresholdReason(input.proposedChange.confidence, artifactRule.minimumConfidence),
    evidenceRuleReason({
      evidence: input.evidence,
      requiredKinds: artifactRule.requiredEvidence.kinds,
      minimumCount: artifactRule.requiredEvidence.minCount,
    }),
    forbiddenAutoHealReason(input.proposedChange.autoHealClass, input.policy.forbiddenAutoHealClasses),
  ].filter((reason): reason is TrustPolicyEvaluationReason => reason !== null);

  return {
    decision: decisionForReasons(reasons),
    reasons: [...reasons],
  };
}

// ─── WP5: Auto-Approval ───

const PROFILE_AUTO_APPROVAL: Record<ExecutionProfile, boolean> = {
  'ci-batch': false,
  'interactive': false,
  'dogfood': true,
};

export const DEFAULT_AUTO_APPROVAL_POLICY: AutoApprovalPolicy = {
  enabled: false,
  profile: 'interactive',
  forbiddenHealClasses: [],
  thresholdOverrides: {},
};

/**
 * Evaluate whether a proposal should be auto-approved based on:
 * 1. Execution profile permits auto-approval
 * 2. Auto-approval policy is enabled
 * 3. Trust-policy evaluation allows the change
 * 4. Heal class is not in the forbidden list
 * 5. Confidence meets threshold (with optional per-artifact overrides)
 */
export function evaluateAutoApproval(input: {
  readonly policy: AutoApprovalPolicy;
  readonly trustEvaluation: TrustPolicyEvaluation;
  readonly proposedChange: ProposedChangeMetadata;
  readonly trustPolicy: TrustPolicy;
}): AutoApprovalResult {
  const { policy, trustEvaluation, proposedChange, trustPolicy } = input;

  // Gate 1: Profile must permit auto-approval
  if (!PROFILE_AUTO_APPROVAL[policy.profile]) {
    return { approved: false, reason: `Profile '${policy.profile}' does not permit auto-approval` };
  }

  // Gate 2: Auto-approval must be enabled
  if (!policy.enabled) {
    return { approved: false, reason: 'Auto-approval is not enabled' };
  }

  // Gate 3: Trust-policy must allow the change
  if (trustEvaluation.decision === 'deny') {
    return { approved: false, reason: `Trust policy denied: ${trustEvaluation.reasons.map((r) => r.message).join('; ')}` };
  }

  // Gate 4: Heal class must not be forbidden
  if (proposedChange.autoHealClass && policy.forbiddenHealClasses.includes(proposedChange.autoHealClass)) {
    return { approved: false, reason: `Heal class '${proposedChange.autoHealClass}' is forbidden for auto-approval` };
  }

  // Gate 5: Confidence meets artifact-type threshold
  const threshold = policy.thresholdOverrides[proposedChange.artifactType]
    ?? trustPolicy.artifactTypes[proposedChange.artifactType]?.minimumConfidence
    ?? 0.8;

  if (proposedChange.confidence < threshold) {
    return {
      approved: false,
      reason: `Confidence ${proposedChange.confidence.toFixed(2)} is below auto-approval threshold ${threshold.toFixed(2)}`,
    };
  }

  // Gate 6: Trust evaluation must be 'allow' (not just 'review')
  if (trustEvaluation.decision !== 'allow') {
    return { approved: false, reason: `Trust policy requires review: ${trustEvaluation.reasons.map((r) => r.message).join('; ')}` };
  }

  return { approved: true, reason: 'All auto-approval gates passed' };
}
