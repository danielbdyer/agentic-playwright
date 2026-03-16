import type {
  EvidenceDescriptor,
  ProposedChangeMetadata,
  TrustPolicy,
  TrustPolicyEvaluation,
  TrustPolicyEvaluationReason,
} from './types/workflow';

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
  evidence: EvidenceDescriptor[];
  requiredKinds: string[];
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

function forbiddenAutoHealReason(autoHealClass: string | null | undefined, forbiddenClasses: string[]): TrustPolicyEvaluationReason | null {
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
