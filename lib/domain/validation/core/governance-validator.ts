/**
 * Governance context validators: ProposalBundle, TrustPolicy, TrustPolicyEvaluation,
 * OperatorInboxItem, ApprovalReceipt, RerunPlan.
 */
import * as schemaDecode from '../../schemas/decode';
import * as schemas from '../../schemas';
import type {
  ApprovalReceipt,
  OperatorInboxItem,
  ProposalBundle,
  RerunPlan,
  TrustPolicy,
  TrustPolicyEvaluation,
} from '../../types';
import { createAdoId, ensureSafeRelativePathLike } from '../../kernel/identity';
import {
  expectArray,
  expectEnum,
  expectId,
  expectNumber,
  expectOptionalId,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
} from '../primitives';
import {
  certificationStates,
  validateCanonicalLineage,
  validateProposalActivation,
  validateTrustPolicyArtifactType,
  validateWorkflowEnvelopeHeader,
} from './shared';

export function validateProposalBundleArtifact(value: unknown): ProposalBundle {
  const bundle = expectRecord(value, 'proposalBundle');
  const payload = expectRecord(bundle.payload ?? {}, 'proposalBundle.payload');
  const proposals = expectArray(payload.proposals ?? [], 'proposalBundle.payload.proposals').map((entry, index) => {
    const proposal = expectRecord(entry, `proposalBundle.payload.proposals[${index}]`);
    return {
      proposalId: expectString(proposal.proposalId, `proposalBundle.payload.proposals[${index}].proposalId`),
      stepIndex: expectNumber(proposal.stepIndex, `proposalBundle.payload.proposals[${index}].stepIndex`),
      artifactType: validateTrustPolicyArtifactType(proposal.artifactType, `proposalBundle.payload.proposals[${index}].artifactType`),
      targetPath: expectString(proposal.targetPath, `proposalBundle.payload.proposals[${index}].targetPath`),
      title: expectString(proposal.title, `proposalBundle.payload.proposals[${index}].title`),
      patch: expectRecord(proposal.patch ?? {}, `proposalBundle.payload.proposals[${index}].patch`),
      evidenceIds: expectStringArray(proposal.evidenceIds ?? [], `proposalBundle.payload.proposals[${index}].evidenceIds`),
      impactedSteps: expectArray(proposal.impactedSteps ?? [], `proposalBundle.payload.proposals[${index}].impactedSteps`).map((stepIndex, impactedIndex) =>
        expectNumber(stepIndex, `proposalBundle.payload.proposals[${index}].impactedSteps[${impactedIndex}]`),
      ),
      trustPolicy: validateTrustPolicyEvaluationArtifact(proposal.trustPolicy),
      certification: expectEnum(proposal.certification ?? 'uncertified', `proposalBundle.payload.proposals[${index}].certification`, certificationStates),
      activation: validateProposalActivation(proposal.activation, `proposalBundle.payload.proposals[${index}].activation`),
      lineage: validateCanonicalLineage(proposal.lineage, `proposalBundle.payload.proposals[${index}].lineage`),
    };
  });
  const header = validateWorkflowEnvelopeHeader(bundle, 'proposalBundle', {
    stage: 'proposal',
    scope: 'scenario',
    governance: proposals.some((proposal) => proposal.trustPolicy.decision === 'deny')
      ? 'blocked'
      : proposals.some((proposal) => proposal.trustPolicy.decision === 'review')
        ? 'review-required'
        : 'approved',
    artifactFingerprint: expectOptionalString(payload.runId, 'proposalBundle.payload.runId') ?? 'proposal-bundle',
    ids: {
      adoId: expectOptionalId(payload.adoId, 'proposalBundle.payload.adoId', createAdoId) ?? null,
      suite: expectOptionalString(payload.suite, 'proposalBundle.payload.suite') ?? null,
      runId: expectOptionalString(payload.runId, 'proposalBundle.payload.runId') ?? null,
    },
    lineage: {
      sources: [],
      parents: [],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
    },
  });
  return {
    kind: expectEnum(bundle.kind, 'proposalBundle.kind', ['proposal-bundle'] as const),
    ...header,
    payload: {
      adoId: expectId(payload.adoId, 'proposalBundle.payload.adoId', createAdoId),
      runId: expectString(payload.runId, 'proposalBundle.payload.runId'),
      revision: expectNumber(payload.revision, 'proposalBundle.payload.revision'),
      title: expectString(payload.title, 'proposalBundle.payload.title'),
      suite: ensureSafeRelativePathLike(expectString(payload.suite, 'proposalBundle.payload.suite'), 'proposalBundle.payload.suite'),
      proposals,
    },
  };
}

export const validateTrustPolicyArtifact: (value: unknown) => TrustPolicy =
  schemaDecode.decoderFor<TrustPolicy>(schemas.TrustPolicySchema);

export const validateTrustPolicyEvaluationArtifact: (value: unknown) => TrustPolicyEvaluation =
  schemaDecode.decoderFor<TrustPolicyEvaluation>(schemas.TrustPolicyEvaluationSchema);

export const validateOperatorInboxItemArtifact: (value: unknown) => OperatorInboxItem =
  schemaDecode.decoderFor<OperatorInboxItem>(schemas.OperatorInboxItemSchema);

export const validateApprovalReceiptArtifact: (value: unknown) => ApprovalReceipt =
  schemaDecode.decoderFor<ApprovalReceipt>(schemas.ApprovalReceiptSchema);

export const validateRerunPlanArtifact: (value: unknown) => RerunPlan =
  schemaDecode.decoderFor<RerunPlan>(schemas.RerunPlanSchema);
