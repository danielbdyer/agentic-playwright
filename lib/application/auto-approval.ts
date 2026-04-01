import { evaluateTrustPolicy } from '../domain/governance/trust-policy';
import type {
  EvidenceDescriptor,
  ProposedChangeMetadata,
  TrustPolicy,
} from '../domain/types/shared-context';

// ─── Auto-Approval Policy ───

export interface AutoApprovalPolicy {
  readonly enabled: boolean;
  readonly minimumConfidence: number;
  readonly allowedArtifactTypes: readonly string[];
  readonly requireEvidence: boolean;
  readonly maxAutoApprovalsPerRun: number;
}

export interface AutoApprovalDecision {
  readonly decision: 'approve' | 'defer';
  readonly reason: string;
}

export function defaultAutoApprovalPolicy(): AutoApprovalPolicy {
  return {
    enabled: false,
    minimumConfidence: 0.9,
    allowedArtifactTypes: [],
    requireEvidence: true,
    maxAutoApprovalsPerRun: 0,
  };
}

export function canAutoApprove(
  proposal: ProposedChangeMetadata,
  policy: AutoApprovalPolicy,
  evidenceCount: number,
): boolean {
  return applyAutoApproval(proposal, policy, evidenceCount).decision === 'approve';
}

export function applyAutoApproval(
  proposal: ProposedChangeMetadata,
  policy: AutoApprovalPolicy,
  evidenceCount: number,
): AutoApprovalDecision {
  // Gate 1: Policy must be enabled
  if (!policy.enabled) {
    return { decision: 'defer', reason: 'Auto-approval policy is disabled' };
  }

  // Gate 2: Artifact type must be in allowed list
  if (!policy.allowedArtifactTypes.includes(proposal.artifactType)) {
    return { decision: 'defer', reason: `Artifact type '${proposal.artifactType}' is not in the allowed list` };
  }

  // Gate 3: Confidence must meet minimum threshold
  if (proposal.confidence < policy.minimumConfidence) {
    return {
      decision: 'defer',
      reason: `Confidence ${proposal.confidence.toFixed(2)} is below minimum threshold ${policy.minimumConfidence.toFixed(2)}`,
    };
  }

  // Gate 4: Evidence required
  if (policy.requireEvidence && evidenceCount === 0) {
    return { decision: 'defer', reason: 'Evidence is required but none was provided' };
  }

  return { decision: 'approve', reason: 'All auto-approval criteria met' };
}

/**
 * Compose auto-approval with trust policy: auto-approval can only succeed when
 * the trust policy also allows the change. This ensures auto-approval never
 * bypasses the trust policy.
 */
export function applyAutoApprovalWithTrust(input: {
  readonly proposal: ProposedChangeMetadata;
  readonly policy: AutoApprovalPolicy;
  readonly evidence: readonly EvidenceDescriptor[];
  readonly trustPolicy: TrustPolicy;
}): AutoApprovalDecision {
  // Trust policy gate first — auto-approval cannot bypass trust
  const trustEvaluation = evaluateTrustPolicy({
    policy: input.trustPolicy,
    proposedChange: input.proposal,
    evidence: [...input.evidence],
  });

  if (trustEvaluation.decision === 'deny') {
    return { decision: 'defer', reason: `Trust policy denied: ${trustEvaluation.reasons.map((r) => r.message).join('; ')}` };
  }

  if (trustEvaluation.decision === 'review') {
    return { decision: 'defer', reason: `Trust policy requires review: ${trustEvaluation.reasons.map((r) => r.message).join('; ')}` };
  }

  // Trust allows — now apply auto-approval logic
  return applyAutoApproval(input.proposal, input.policy, input.evidence.length);
}

/**
 * Track approval count within a run. Returns whether the next approval would
 * exceed the per-run limit. Pure predicate — does not mutate state.
 */
export function isWithinAutoApprovalLimit(
  policy: AutoApprovalPolicy,
  currentApprovalCount: number,
): boolean {
  return currentApprovalCount < policy.maxAutoApprovalsPerRun;
}
