/**
 * @deprecated Legacy migration surface.
 *
 * Semantic schema checks now live in `product/domain/schemas/*`.
 * This module remains as a compatibility bridge while callers migrate
 * to family validators under `product/domain/validation/*`.
 */

import * as schemaDecode from '../schemas/decode';
import {
  GovernanceSchema,
  ScreenIdSchema,
  BoundStepSchema,
  WorkflowEnvelopeHeaderSchema,
  TrustPolicySchema,
} from '../schemas';

export const GovernanceSemanticSchema = GovernanceSchema;
export const ScreenIdSemanticSchema = ScreenIdSchema;
export const BoundStepSemanticSchema = BoundStepSchema;
export const WorkflowEnvelopeSemanticSchema = WorkflowEnvelopeHeaderSchema;
export const TrustPolicySemanticSchema = TrustPolicySchema;

export const decodeGovernance = schemaDecode.decodeUnknownSync(GovernanceSchema);
export const decodeScreenId = schemaDecode.decodeUnknownSync(ScreenIdSchema);
export const decodeBoundStep = schemaDecode.decoderFor(BoundStepSchema);
export const decodeWorkflowEnvelope = schemaDecode.decodeUnknownSync(WorkflowEnvelopeHeaderSchema);
export const decodeTrustPolicy = schemaDecode.decoderFor(TrustPolicySchema);
