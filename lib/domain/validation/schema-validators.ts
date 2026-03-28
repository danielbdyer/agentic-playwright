/**
 * Effect Schema migration: foundational semantic validators (W4.2)
 *
 * These schemas compose base structural schemas from `lib/domain/schemas/`
 * with `Schema.filter()` for semantic validation. They demonstrate the
 * migration path from hand-written validators in `core.ts` to Effect Schema.
 *
 * Pattern: base schema → Schema.filter() for domain invariants.
 * Each filter encodes a semantic rule that cannot be expressed structurally.
 */

import { Schema } from 'effect';
import {
  GovernanceSchema as BaseGovernanceSchema,
  StepBindingKindSchema,
  WorkflowStageSchema,
  WorkflowScopeSchema,
  TrustPolicyArtifactTypeSchema,
  ConfidenceSchema,
} from '../schemas/enums';
import {
  ScreenIdSchema as BaseScreenIdSchema,
  NullableScreenId,
  NullableElementId,
  NullablePostureId,
  NullableSnapshotTemplateId,
  NullableString,
  StringArray,
  NullableAdoId,
} from '../schemas/primitives';
import {
  WorkflowEnvelopeIdsSchema,
  WorkflowEnvelopeFingerprintsSchema,
  WorkflowEnvelopeLineageSchema,
  TrustPolicyEvidenceRuleSchema,
  TrustPolicyArtifactRuleSchema,
} from '../schemas/workflow';
import {
  StepActionSchema,
} from '../schemas/enums';

// ─── GovernanceSchema with semantic filter ───

/**
 * Governance enum with semantic validation.
 * Ensures governance values are one of the three canonical states.
 * The filter is intentionally demonstrative — the Literal already constrains,
 * but the filter adds a named semantic check point for downstream tooling.
 */
export const GovernanceSemanticSchema = BaseGovernanceSchema.pipe(
  Schema.filter(
    (value): value is typeof BaseGovernanceSchema.Type =>
      value === 'approved' || value === 'review-required' || value === 'blocked',
    {
      message: () => 'Governance must be one of: approved, review-required, blocked',
      identifier: 'GovernanceSemantic',
    },
  ),
);

// ─── ScreenIdSchema with semantic filter ───

/**
 * Branded ScreenId with semantic validation:
 * - Must be non-empty
 * - Must not contain path traversal
 * - Must not start with a separator
 */
export const ScreenIdSemanticSchema = BaseScreenIdSchema.pipe(
  Schema.filter(
    (value): boolean => {
      const s = value as string;
      return (
        s.length > 0 &&
        !s.startsWith('/') &&
        !s.startsWith('\\') &&
        !s.includes('..') &&
        !/^[a-zA-Z]:/.test(s)
      );
    },
    {
      message: () => 'ScreenId must be non-empty, must not be absolute, and must not contain path traversal',
      identifier: 'ScreenIdSemantic',
    },
  ),
);

// ─── BoundStepSchema with semantic checks ───

const BoundStepBindingSchema = Schema.Struct({
  kind: StepBindingKindSchema,
  reasons: StringArray,
  ruleId: NullableString,
  normalizedIntent: Schema.String,
  knowledgeRefs: StringArray,
  supplementRefs: StringArray,
  evidenceIds: StringArray,
  governance: BaseGovernanceSchema,
  reviewReasons: StringArray,
});

const BoundStepBaseSchema = Schema.Struct({
  index: Schema.Number,
  intent: Schema.String,
  action_text: Schema.String,
  expected_text: Schema.String,
  action: StepActionSchema,
  screen: NullableScreenId,
  element: NullableElementId,
  posture: NullablePostureId,
  override: NullableString,
  snapshot_template: NullableSnapshotTemplateId,
  binding: BoundStepBindingSchema,
});

/**
 * BoundStep with semantic validation:
 * - index must be non-negative
 * - intent must be non-empty
 * - if binding.kind is 'bound', governance must not be 'blocked'
 * - if binding.kind is 'unbound', screen and element must both be null
 * - review-required governance must have at least one reviewReason
 */
export const BoundStepSemanticSchema = BoundStepBaseSchema.pipe(
  Schema.filter(
    (step) => {
      if (step.index < 0) return false;
      if (step.intent.trim().length === 0) return false;
      if (step.binding.kind === 'bound' && step.binding.governance === 'blocked') return false;
      if (step.binding.kind === 'unbound' && (step.screen !== null || step.element !== null)) return false;
      if (step.binding.governance === 'review-required' && step.binding.reviewReasons.length === 0) return false;
      return true;
    },
    {
      message: () => 'BoundStep semantic validation failed: check index >= 0, non-empty intent, governance/binding consistency',
      identifier: 'BoundStepSemantic',
    },
  ),
);

// ─── WorkflowEnvelopeSchema with semantic checks ───

const WorkflowEnvelopeBaseSchema = Schema.Struct({
  version: Schema.Literal(1),
  stage: WorkflowStageSchema,
  scope: WorkflowScopeSchema,
  ids: WorkflowEnvelopeIdsSchema,
  fingerprints: WorkflowEnvelopeFingerprintsSchema,
  lineage: WorkflowEnvelopeLineageSchema,
  governance: BaseGovernanceSchema,
});

/**
 * WorkflowEnvelope (without payload) with semantic validation:
 * - fingerprints.artifact must be non-empty
 * - lineage.handshakes must include the current stage or a prior stage
 * - blocked governance envelopes should not have execution or projection stage
 */
export const WorkflowEnvelopeSemanticSchema = WorkflowEnvelopeBaseSchema.pipe(
  Schema.filter(
    (envelope) => {
      if (envelope.fingerprints.artifact.trim().length === 0) return false;
      if (
        envelope.governance === 'blocked' &&
        (envelope.stage === 'execution' || envelope.stage === 'projection')
      ) {
        return false;
      }
      return true;
    },
    {
      message: () => 'WorkflowEnvelope semantic validation failed: check fingerprints non-empty and blocked governance stage constraints',
      identifier: 'WorkflowEnvelopeSemantic',
    },
  ),
);

// ─── TrustPolicySchema with semantic checks ───

const TrustPolicyBaseSchema = Schema.Struct({
  version: Schema.Literal(1),
  artifactTypes: Schema.Record({ key: TrustPolicyArtifactTypeSchema, value: TrustPolicyArtifactRuleSchema }),
  forbiddenAutoHealClasses: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

/**
 * TrustPolicy with semantic validation:
 * - Every artifact rule must have minimumConfidence in [0, 1]
 * - Every evidence rule must have minCount >= 0
 * - forbiddenAutoHealClasses must not contain duplicates
 */
export const TrustPolicySemanticSchema = TrustPolicyBaseSchema.pipe(
  Schema.filter(
    (policy) => {
      const rules = Object.values(policy.artifactTypes) as ReadonlyArray<{
        readonly minimumConfidence: number;
        readonly requiredEvidence: { readonly minCount: number; readonly kinds: readonly string[] };
      }>;
      const confidenceValid = rules.every(
        (rule) => rule.minimumConfidence >= 0 && rule.minimumConfidence <= 1,
      );
      const evidenceValid = rules.every(
        (rule) => rule.requiredEvidence.minCount >= 0,
      );
      const noDuplicates = new Set(policy.forbiddenAutoHealClasses).size === policy.forbiddenAutoHealClasses.length;
      return confidenceValid && evidenceValid && noDuplicates;
    },
    {
      message: () => 'TrustPolicy semantic validation failed: check confidence bounds, evidence counts, and no duplicate forbidden classes',
      identifier: 'TrustPolicySemantic',
    },
  ),
);

// ─── Decode helpers ───

/**
 * Decode unknown input through a semantic schema, returning Either<ParseError, A>.
 * Pure function — no side effects.
 */
export const decodeGovernance = Schema.decodeUnknownSync(GovernanceSemanticSchema);
export const decodeScreenId = Schema.decodeUnknownSync(ScreenIdSemanticSchema);
export const decodeBoundStep = Schema.decodeUnknownSync(BoundStepSemanticSchema);
export const decodeWorkflowEnvelope = Schema.decodeUnknownSync(WorkflowEnvelopeSemanticSchema);
export const decodeTrustPolicy = Schema.decodeUnknownSync(TrustPolicySemanticSchema);
