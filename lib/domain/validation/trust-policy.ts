import type { ProposalBundle } from '../execution/types';
import type { TrustPolicy, TrustPolicyEvaluation } from '../governance/workflow-types';
import type { ApprovalReceipt, OperatorInboxItem, RerunPlan } from '../resolution/types';
import { validateByKind } from './registry';

export const validateTrustPolicy = (value: unknown): TrustPolicy => validateByKind('trust-policy', value);
export const validateTrustPolicyEvaluation = (value: unknown): TrustPolicyEvaluation =>
  validateByKind('trust-policy-evaluation', value);
export const validateOperatorInboxItem = (value: unknown): OperatorInboxItem => validateByKind('operator-inbox-item', value);
export const validateApprovalReceipt = (value: unknown): ApprovalReceipt => validateByKind('approval-receipt', value);
export const validateRerunPlan = (value: unknown): RerunPlan => validateByKind('rerun-plan', value);
export const validateProposalBundle = (value: unknown): ProposalBundle => validateByKind('proposal-bundle', value);
