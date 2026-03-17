import { Schema } from 'effect';
import {
  RouteIdSchema,
  RouteVariantIdSchema,
  ScreenIdSchema,
  NullableString,
} from './primitives';

// ─── Harvest Route ───

export const HarvestRouteVariantSchema = Schema.Struct({
  id: RouteVariantIdSchema,
  url: Schema.String,
  screen: ScreenIdSchema,
  rootSelector: Schema.optionalWith(NullableString, { default: () => null }),
});

export const HarvestRouteDefinitionSchema = Schema.Struct({
  id: RouteIdSchema,
  screen: ScreenIdSchema,
  entryUrl: Schema.String,
  rootSelector: Schema.optionalWith(NullableString, { default: () => null }),
  variants: Schema.Array(HarvestRouteVariantSchema),
});

export const HarvestManifestSchema = Schema.Struct({
  kind: Schema.Literal('harvest-manifest'),
  version: Schema.Literal(1),
  app: Schema.String,
  baseUrl: Schema.optionalWith(NullableString, { default: () => null }),
  routes: Schema.Array(HarvestRouteDefinitionSchema),
});
