import type { ProposalBundle } from '../../execution/types';
import type { TrustPolicy, TrustPolicyEvaluation } from '../../governance/workflow-types';
import type { ApprovalReceipt, OperatorInboxItem, RerunPlan } from '../../resolution/types';
import {
  validateApprovalReceipt,
  validateOperatorInboxItem,
  validateProposalBundle,
  validateRerunPlan,
  validateTrustPolicy,
  validateTrustPolicyEvaluation,
} from '../core';

export const validateTrustPolicyArtifact: (value: unknown) => TrustPolicy = validateTrustPolicy;
export const validateTrustPolicyEvaluationArtifact: (value: unknown) => TrustPolicyEvaluation = validateTrustPolicyEvaluation;
export const validateOperatorInboxItemArtifact: (value: unknown) => OperatorInboxItem = validateOperatorInboxItem;
export const validateApprovalReceiptArtifact: (value: unknown) => ApprovalReceipt = validateApprovalReceipt;
export const validateRerunPlanArtifact: (value: unknown) => RerunPlan = validateRerunPlan;
export const validateProposalBundleArtifact: (value: unknown) => ProposalBundle = validateProposalBundle;
