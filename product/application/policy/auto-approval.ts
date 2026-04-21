import { evaluateTrustPolicy } from '../../domain/governance/trust-policy';
import type { EvidenceDescriptor, ProposedChangeMetadata, TrustPolicy } from '../../domain/governance/workflow-types';
import {
  type GovernanceVerdict,
  type VerdictGate,
  approved,
  suspended,
  runGateChain,
} from '../../domain/kernel/governed-suspension';

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

// ─── Governed Suspension bridge ──────────────────────────────────────────
//
// The auto-approval gate chain expressed as GovernanceVerdict composition.
// Each gate is a VerdictGate<T, ReviewRequest> — a function from an
// approved value to a new verdict. The chain is composed via
// `runGateChain`, which folds `chainVerdict` over the list with
// short-circuit on the first suspension.
//
// Before this refactor, the four gates were spelled out as four
// sequential `chainVerdict` calls with intermediate variables
// (gate1, gate2, gate3, gate4) — the "sequential bind" idiom. The
// gates are now a plain array of functions, which:
//
//   - Reads more declaratively at the call site
//   - Matches the algebra used by runPipelinePhases /
//     freeSearchAsync / walkStrategyChainAsync (sequential steps
//     with threaded state and early termination), just specialized
//     to the verdict monad
//   - Makes each gate individually testable as a standalone function
//   - Lets adding a new gate be a single-row addition instead of a
//     restructuring of variable assignments

interface ReviewRequest {
  readonly kind: 'auto-approval-review';
  readonly proposalArtifactType: string;
  readonly reason: string;
}

type AutoApprovalGate = VerdictGate<ProposedChangeMetadata, ReviewRequest>;

/** Helper: suspend with the standard ReviewRequest shape. */
function suspendAutoApproval(
  proposal: ProposedChangeMetadata,
  reason: ReviewRequest['reason'],
  message: string,
): GovernanceVerdict<ProposedChangeMetadata, ReviewRequest> {
  return suspended(
    { kind: 'auto-approval-review', proposalArtifactType: proposal.artifactType, reason },
    message,
  );
}

/** The ordered list of gates that auto-approval must pass. Each
 *  gate is a pure function from the approved proposal to a verdict.
 *  Adding a new gate = adding a row to this array. */
function autoApprovalGates(
  policy: AutoApprovalPolicy,
  evidenceCount: number,
): readonly AutoApprovalGate[] {
  return [
    // Gate 1: Policy enabled
    (p) => policy.enabled
      ? approved(p)
      : suspendAutoApproval(p, 'disabled', 'Auto-approval policy is disabled'),

    // Gate 2: Artifact type allowed
    (p) => policy.allowedArtifactTypes.includes(p.artifactType)
      ? approved(p)
      : suspendAutoApproval(
          p,
          'type-not-allowed',
          `Artifact type '${p.artifactType}' is not in the allowed list`,
        ),

    // Gate 3: Confidence threshold
    (p) => p.confidence >= policy.minimumConfidence
      ? approved(p)
      : suspendAutoApproval(
          p,
          'low-confidence',
          `Confidence ${p.confidence.toFixed(2)} is below minimum threshold ${policy.minimumConfidence.toFixed(2)}`,
        ),

    // Gate 4: Evidence required
    (p) => !policy.requireEvidence || evidenceCount > 0
      ? approved(p)
      : suspendAutoApproval(p, 'no-evidence', 'Evidence is required but none was provided'),
  ];
}

/**
 * Express auto-approval as a GovernanceVerdict chain.
 * Each gate either passes (Approved) or defers (Suspended).
 * The chain short-circuits on the first suspension.
 */
export function autoApprovalVerdict(
  proposal: ProposedChangeMetadata,
  policy: AutoApprovalPolicy,
  evidenceCount: number,
): GovernanceVerdict<ProposedChangeMetadata, ReviewRequest> {
  return runGateChain(proposal, autoApprovalGates(policy, evidenceCount));
}
