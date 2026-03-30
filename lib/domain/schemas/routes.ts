import { Schema } from 'effect';
import {
  RouteIdSchema,
  RouteVariantIdSchema,
  ScreenIdSchema,
  NullableString,
} from './primitives';
import { GovernanceSchema } from './enums';

// ─── Harvest Route ───

export const HarvestRouteVariantSchema = Schema.Struct({
  id: RouteVariantIdSchema,
  url: Schema.String,
  screen: ScreenIdSchema,
  pathTemplate: Schema.optionalWith(NullableString, { default: () => null }),
  query: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.String }), { default: () => ({}) }),
  hash: Schema.optionalWith(NullableString, { default: () => null }),
  tab: Schema.optionalWith(NullableString, { default: () => null }),
  rootSelector: Schema.optionalWith(NullableString, { default: () => null }),
  urlPattern: Schema.optionalWith(NullableString, { default: () => null }),
  dimensions: Schema.optionalWith(Schema.Array(Schema.Literal('query', 'hash', 'tab', 'segment')), {
    default: () => [] as const,
  }),
  expectedEntryState: Schema.optionalWith(Schema.Struct({
    requiredStateRefs: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as const }),
    forbiddenStateRefs: Schema.optionalWith(Schema.Array(Schema.String), { default: () => [] as const }),
  }), {
    default: () => ({
      requiredStateRefs: [] as const,
      forbiddenStateRefs: [] as const,
    }),
  }),
  historicalSuccess: Schema.optionalWith(Schema.Struct({
    successCount: Schema.Number,
    failureCount: Schema.Number,
    lastSuccessAt: Schema.optionalWith(NullableString, { default: () => null }),
  }), {
    default: () => ({
      successCount: 0,
      failureCount: 0,
      lastSuccessAt: null,
    }),
  }),
  state: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.String }), { default: () => ({}) }),
  mappedScreens: Schema.optionalWith(Schema.Array(ScreenIdSchema), { default: () => [] as const }),
});

export const HarvestRouteDefinitionSchema = Schema.Struct({
  id: RouteIdSchema,
  screen: ScreenIdSchema,
  entryUrl: Schema.String,
  rootSelector: Schema.optionalWith(NullableString, { default: () => null }),
  variants: Schema.Array(HarvestRouteVariantSchema),
});

export const HarvestManifestSchema = Schema.Struct({
  kind: Schema.Literal('harvest-manifest', 'route-knowledge'),
  version: Schema.Literal(1),
  governance: Schema.optionalWith(GovernanceSchema, { default: () => 'approved' }),
  app: Schema.String,
  baseUrl: Schema.optionalWith(NullableString, { default: () => null }),
  routes: Schema.Array(HarvestRouteDefinitionSchema),
});
