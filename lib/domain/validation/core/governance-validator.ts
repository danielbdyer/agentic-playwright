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
  const proposals = expectArray(bundle.proposals ?? [], 'proposalBundle.proposals').map((entry, index) => {
    const proposal = expectRecord(entry, `proposalBundle.proposals[${index}]`);
    return {
      proposalId: expectString(proposal.proposalId, `proposalBundle.proposals[${index}].proposalId`),
      stepIndex: expectNumber(proposal.stepIndex, `proposalBundle.proposals[${index}].stepIndex`),
      artifactType: validateTrustPolicyArtifactType(proposal.artifactType, `proposalBundle.proposals[${index}].artifactType`),
      targetPath: expectString(proposal.targetPath, `proposalBundle.proposals[${index}].targetPath`),
      title: expectString(proposal.title, `proposalBundle.proposals[${index}].title`),
      patch: expectRecord(proposal.patch ?? {}, `proposalBundle.proposals[${index}].patch`),
      evidenceIds: expectStringArray(proposal.evidenceIds ?? [], `proposalBundle.proposals[${index}].evidenceIds`),
      impactedSteps: expectArray(proposal.impactedSteps ?? [], `proposalBundle.proposals[${index}].impactedSteps`).map((stepIndex, impactedIndex) =>
        expectNumber(stepIndex, `proposalBundle.proposals[${index}].impactedSteps[${impactedIndex}]`),
      ),
      trustPolicy: validateTrustPolicyEvaluationArtifact(proposal.trustPolicy),
      certification: expectEnum(proposal.certification ?? 'uncertified', `proposalBundle.proposals[${index}].certification`, certificationStates),
      activation: validateProposalActivation(proposal.activation, `proposalBundle.proposals[${index}].activation`),
      lineage: validateCanonicalLineage(proposal.lineage, `proposalBundle.proposals[${index}].lineage`),
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
    artifactFingerprint: expectOptionalString(bundle.runId, 'proposalBundle.runId') ?? 'proposal-bundle',
    ids: {
      adoId: expectOptionalId(bundle.adoId, 'proposalBundle.adoId', createAdoId) ?? null,
      suite: expectOptionalString(bundle.suite, 'proposalBundle.suite') ?? null,
      runId: expectOptionalString(bundle.runId, 'proposalBundle.runId') ?? null,
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
      adoId: expectId(bundle.adoId, 'proposalBundle.adoId', createAdoId),
      runId: expectString(bundle.runId, 'proposalBundle.runId'),
      revision: expectNumber(bundle.revision, 'proposalBundle.revision'),
      title: expectString(bundle.title, 'proposalBundle.title'),
      suite: ensureSafeRelativePathLike(expectString(bundle.suite, 'proposalBundle.suite'), 'proposalBundle.suite'),
      proposals,
    },
    adoId: expectId(bundle.adoId, 'proposalBundle.adoId', createAdoId),
    runId: expectString(bundle.runId, 'proposalBundle.runId'),
    revision: expectNumber(bundle.revision, 'proposalBundle.revision'),
    title: expectString(bundle.title, 'proposalBundle.title'),
    suite: ensureSafeRelativePathLike(expectString(bundle.suite, 'proposalBundle.suite'), 'proposalBundle.suite'),
    proposals,
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
