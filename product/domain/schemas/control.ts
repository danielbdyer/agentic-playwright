import { Schema } from 'effect';
import {
  StepActionSchema,
  RuntimeInterpreterModeSchema,
} from './enums';
import {
  AdoIdSchema,
  NullableString,
} from './primitives';
import { StepResolutionSchema } from './intent';

// ─── Dataset Control ───

export const DatasetControlSchema = Schema.Struct({
  kind: Schema.Literal('dataset-control'),
  version: Schema.Literal(1),
  name: Schema.String,
  default: Schema.optional(Schema.Boolean),
  fixtures: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  defaults: Schema.optionalWith(
    Schema.Struct({
      elements: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.String }), { default: () => ({}) }),
      generatedTokens: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.String }), { default: () => ({}) }),
    }),
    { default: () => ({ elements: {}, generatedTokens: {} }) },
  ),
});

// ─── Resolution Control ───

export const ResolutionControlSelectorSchema = Schema.Struct({
  adoIds: Schema.optionalWith(Schema.Array(AdoIdSchema), { default: () => [] as readonly (typeof AdoIdSchema.Type)[] }),
  suites: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as readonly string[] }),
  tags: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as readonly string[] }),
});

export const DomExplorationPolicySchema = Schema.Struct({
  maxCandidates: Schema.Number,
  maxProbes: Schema.Number,
  forbiddenActions: Schema.optionalWith(Schema.Array(StepActionSchema), { default: () => [] as readonly (typeof StepActionSchema.Type)[] }),
});

export const ResolutionControlStepSchema = Schema.Struct({
  stepIndex: Schema.Number,
  resolution: StepResolutionSchema,
});

export const ResolutionControlSchema = Schema.Struct({
  kind: Schema.Literal('resolution-control'),
  version: Schema.Literal(1),
  name: Schema.String,
  selector: ResolutionControlSelectorSchema,
  domExplorationPolicy: Schema.optional(DomExplorationPolicySchema),
  steps: Schema.optionalWith(Schema.Array(ResolutionControlStepSchema), { default: () => [] as readonly (typeof ResolutionControlStepSchema.Type)[] }),
});

// ─── Recovery Policy ───

export const RecoveryBudgetSchema = Schema.Struct({
  maxAttempts: Schema.Number,
  maxTotalMs: Schema.Number,
  backoffMs: Schema.Number,
});

export const RecoveryStrategySchema = Schema.Struct({
  id: Schema.Literal(
    'verify-prerequisites',
    'execute-prerequisite-actions',
    'force-alternate-locator-rungs',
    'snapshot-guided-reresolution',
    'bounded-retry-with-backoff',
    'refresh-runtime',
  ),
  enabled: Schema.Boolean,
  maxAttempts: Schema.optional(Schema.Number),
  backoffMs: Schema.optional(Schema.Number),
  diagnostics: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as readonly string[] }),
});

export const RecoveryFamilyConfigSchema = Schema.Struct({
  budget: RecoveryBudgetSchema,
  strategies: Schema.optionalWith(Schema.Array(RecoveryStrategySchema), { default: () => [] as readonly (typeof RecoveryStrategySchema.Type)[] }),
});

export const RecoveryPolicySchema = Schema.Struct({
  version: Schema.optionalWith(Schema.Literal(1), { default: () => 1 as const }),
  profile: Schema.optionalWith(Schema.String, { default: () => 'default' }),
  families: Schema.Record({
    key: Schema.Literal('precondition-failure', 'locator-degradation-failure', 'environment-runtime-failure'),
    value: RecoveryFamilyConfigSchema,
  }),
});

// ─── Runbook Control ───

export const RunbookControlSchema = Schema.Struct({
  kind: Schema.Literal('runbook-control'),
  version: Schema.Literal(1),
  name: Schema.String,
  default: Schema.optional(Schema.Boolean),
  selector: ResolutionControlSelectorSchema,
  interpreterMode: Schema.optionalWith(Schema.NullOr(RuntimeInterpreterModeSchema), { default: () => null }),
  dataset: Schema.optionalWith(NullableString, { default: () => null }),
  resolutionControl: Schema.optionalWith(NullableString, { default: () => null }),
  translationEnabled: Schema.optional(Schema.Boolean),
  translationCacheEnabled: Schema.optional(Schema.Boolean),
  providerId: Schema.optionalWith(NullableString, { default: () => null }),
  recoveryPolicy: Schema.optional(RecoveryPolicySchema),
});
