import type {
  ApprovalReceipt,
  OperatorInboxItem,
  ProposalBundle,
  RerunPlan,
  TrustPolicy,
  TrustPolicyEvaluation,
} from '../../types';
import {
  validateApprovalReceipt,
  validateOperatorInboxItem,
  validateProposalBundle,
  validateRerunPlan,
  validateTrustPolicy,
  validateTrustPolicyEvaluation,
} from './legacy-core-validator';

export const validateProposalBundleArtifact: (value: unknown) => ProposalBundle = validateProposalBundle;
export const validateTrustPolicyArtifact: (value: unknown) => TrustPolicy = validateTrustPolicy;
export const validateTrustPolicyEvaluationArtifact: (value: unknown) => TrustPolicyEvaluation =
  validateTrustPolicyEvaluation;
export const validateOperatorInboxItemArtifact: (value: unknown) => OperatorInboxItem = validateOperatorInboxItem;
export const validateApprovalReceiptArtifact: (value: unknown) => ApprovalReceipt = validateApprovalReceipt;
export const validateRerunPlanArtifact: (value: unknown) => RerunPlan = validateRerunPlan;
