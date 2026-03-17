import { Schema } from 'effect';

// ─── Branded ID schemas ───
// Each produces a branded string type compatible with the existing Brand<string, Name> pattern.

export const AdoIdSchema = Schema.String.pipe(Schema.brand('AdoId'));
export const ScreenIdSchema = Schema.String.pipe(Schema.brand('ScreenId'));
export const RouteIdSchema = Schema.String.pipe(Schema.brand('RouteId'));
export const RouteVariantIdSchema = Schema.String.pipe(Schema.brand('RouteVariantId'));
export const SectionIdSchema = Schema.String.pipe(Schema.brand('SectionId'));
export const SurfaceIdSchema = Schema.String.pipe(Schema.brand('SurfaceId'));
export const ElementIdSchema = Schema.String.pipe(Schema.brand('ElementId'));
export const PostureIdSchema = Schema.String.pipe(Schema.brand('PostureId'));
export const FixtureIdSchema = Schema.String.pipe(Schema.brand('FixtureId'));
export const SnapshotTemplateIdSchema = Schema.String.pipe(Schema.brand('SnapshotTemplateId'));
export const WidgetIdSchema = Schema.String.pipe(Schema.brand('WidgetId'));
export const CanonicalTargetRefSchema = Schema.String.pipe(Schema.brand('CanonicalTargetRef'));
export const SelectorRefSchema = Schema.String.pipe(Schema.brand('SelectorRef'));
export const StateNodeRefSchema = Schema.String.pipe(Schema.brand('StateNodeRef'));
export const EventSignatureRefSchema = Schema.String.pipe(Schema.brand('EventSignatureRef'));
export const TransitionRefSchema = Schema.String.pipe(Schema.brand('TransitionRef'));

// ─── Common reusable atoms ───

export const NullableString = Schema.NullOr(Schema.String);
export const OptionalNullableString = Schema.optional(Schema.NullOr(Schema.String));
export const StringArray = Schema.Array(Schema.String);
export const NumberRecord = Schema.Record({ key: Schema.String, value: Schema.Number });

// Nullable branded IDs (common pattern: field is optional/nullable)
export const NullableAdoId = Schema.NullOr(AdoIdSchema);
export const NullableScreenId = Schema.NullOr(ScreenIdSchema);
export const NullableElementId = Schema.NullOr(ElementIdSchema);
export const NullablePostureId = Schema.NullOr(PostureIdSchema);
export const NullableSnapshotTemplateId = Schema.NullOr(SnapshotTemplateIdSchema);
export const NullableSectionId = Schema.NullOr(SectionIdSchema);
export const NullableSurfaceId = Schema.NullOr(SurfaceIdSchema);
export const NullableCanonicalTargetRef = Schema.NullOr(CanonicalTargetRefSchema);
export const NullableSelectorRef = Schema.NullOr(SelectorRefSchema);
export const NullableStateNodeRef = Schema.NullOr(StateNodeRefSchema);
export const NullableEventSignatureRef = Schema.NullOr(EventSignatureRefSchema);
export const NullableTransitionRef = Schema.NullOr(TransitionRefSchema);
export const NullableRouteId = Schema.NullOr(RouteIdSchema);
export const NullableRouteVariantId = Schema.NullOr(RouteVariantIdSchema);
export const NullableWidgetId = Schema.NullOr(WidgetIdSchema);
