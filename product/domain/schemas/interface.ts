import { Schema } from 'effect';
import { AssertionKindSchema, SurfaceKindSchema, StepActionSchema } from './enums';
import {
  CanonicalTargetRefSchema,
  ElementIdSchema,
  EventSignatureRefSchema,
  NullableElementId,
  NullableEventSignatureRef,
  NullableSectionId,
  NullableSnapshotTemplateId,
  NullableStateNodeRef,
  NullableString,
  RouteIdSchema,
  RouteVariantIdSchema,
  ScreenIdSchema,
  SectionIdSchema,
  SelectorRefSchema,
  StateNodeRefSchema,
  StringArray,
  SurfaceIdSchema,
  TransitionRefSchema,
} from './primitives';
import {
  EventSignatureSchema,
  StateNodeSchema,
  StateTransitionSchema,
} from './knowledge';
import { LocatorStrategySchema } from './workflow';

export const TransitionObservationSchema = Schema.Struct({
  observationId: Schema.String,
  source: Schema.Literal('harvest', 'runtime'),
  actor: Schema.Literal('safe-active-harvest', 'runtime-execution', 'live-dom'),
  screen: ScreenIdSchema,
  eventSignatureRef: Schema.optionalWith(NullableEventSignatureRef, { default: () => null }),
  transitionRef: Schema.optionalWith(Schema.NullOr(TransitionRefSchema), { default: () => null }),
  expectedTransitionRefs: Schema.optionalWith(Schema.Array(TransitionRefSchema), { default: () => [] as readonly (typeof TransitionRefSchema.Type)[] }),
  observedStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  unexpectedStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  confidence: Schema.Literal('observed', 'inferred', 'missing'),
  classification: Schema.Literal('matched', 'ambiguous-match', 'missing-expected', 'unexpected-effects'),
  detail: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

export const StateTransitionGraphSchema = Schema.Struct({
  kind: Schema.Literal('state-transition-graph'),
  version: Schema.Literal(1),
  generatedAt: Schema.String,
  fingerprint: Schema.String,
  stateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  eventSignatureRefs: Schema.optionalWith(Schema.Array(EventSignatureRefSchema), { default: () => [] as readonly (typeof EventSignatureRefSchema.Type)[] }),
  transitionRefs: Schema.optionalWith(Schema.Array(TransitionRefSchema), { default: () => [] as readonly (typeof TransitionRefSchema.Type)[] }),
  states: Schema.optionalWith(Schema.Array(StateNodeSchema), { default: () => [] as readonly (typeof StateNodeSchema.Type)[] }),
  eventSignatures: Schema.optionalWith(Schema.Array(EventSignatureSchema), { default: () => [] as readonly (typeof EventSignatureSchema.Type)[] }),
  transitions: Schema.optionalWith(Schema.Array(StateTransitionSchema), { default: () => [] as readonly (typeof StateTransitionSchema.Type)[] }),
  observations: Schema.optionalWith(Schema.Array(TransitionObservationSchema), { default: () => [] as readonly (typeof TransitionObservationSchema.Type)[] }),
}).pipe(
  Schema.filter(
    (graph) => {
      const stateSet = new Set(graph.states.map((state) => state.ref));
      const stateRefsCovered = graph.stateRefs.every((ref) => stateSet.has(ref));
      const stateCoverage = graph.states.every((state) => graph.stateRefs.includes(state.ref));
      if (!stateRefsCovered || !stateCoverage) return false;

      const eventSet = new Set(graph.eventSignatures.map((eventSignature) => eventSignature.ref));
      const eventRefsCovered = graph.eventSignatureRefs.every((ref) => eventSet.has(ref));
      const eventCoverage = graph.eventSignatures.every((eventSignature) => graph.eventSignatureRefs.includes(eventSignature.ref));
      if (!eventRefsCovered || !eventCoverage) return false;

      const transitionSet = new Set(graph.transitions.map((transition) => transition.ref));
      const transitionRefsCovered = graph.transitionRefs.every((ref) => transitionSet.has(ref));
      const transitionCoverage = graph.transitions.every((transition) => graph.transitionRefs.includes(transition.ref));
      if (!transitionRefsCovered || !transitionCoverage) return false;

      const transitionsReferenceKnownEvents = graph.transitions.every((transition) => eventSet.has(transition.eventSignatureRef));
      if (!transitionsReferenceKnownEvents) return false;

      const transitionsReferenceKnownStates = graph.transitions.every((transition) =>
        transition.sourceStateRefs.every((stateRef) => stateSet.has(stateRef))
        && transition.targetStateRefs.every((stateRef) => stateSet.has(stateRef)),
      );
      if (!transitionsReferenceKnownStates) return false;

      return graph.eventSignatures.every((eventSignature) =>
        eventSignature.effects.transitionRefs.every((transitionRef) => transitionSet.has(transitionRef))
        && eventSignature.effects.resultStateRefs.every((stateRef) => stateSet.has(stateRef))
        && eventSignature.requiredStateRefs.every((stateRef) => stateSet.has(stateRef))
        && eventSignature.forbiddenStateRefs.every((stateRef) => stateSet.has(stateRef))
        && eventSignature.observationPlan.observeStateRefs.every((stateRef) => stateSet.has(stateRef)),
      );
    },
    {
      identifier: 'StateTransitionGraphSemantic',
      message: () => 'State transition graph semantic invariant failed: refs must be mirrored and only reference known states/events/transitions.',
    },
  ),
);

// Additional interface schemas used by legacy validators during migration.
export const DiscoveryObservedSurfaceSchema = Schema.Struct({
  id: SurfaceIdSchema,
  targetRef: CanonicalTargetRefSchema,
  section: SectionIdSchema,
  selector: Schema.String,
  role: Schema.optionalWith(NullableString, { default: () => null }),
  name: Schema.optionalWith(NullableString, { default: () => null }),
  kind: SurfaceKindSchema,
  assertions: Schema.optionalWith(Schema.Array(AssertionKindSchema), { default: () => [] as readonly (typeof AssertionKindSchema.Type)[] }),
  testId: Schema.optionalWith(NullableString, { default: () => null }),
});

export const DiscoveryObservedElementSchema = Schema.Struct({
  id: ElementIdSchema,
  targetRef: CanonicalTargetRefSchema,
  surface: SurfaceIdSchema,
  selector: Schema.String,
  role: Schema.String,
  name: Schema.optionalWith(NullableString, { default: () => null }),
  testId: Schema.optionalWith(NullableString, { default: () => null }),
  widget: Schema.String,
  required: Schema.Boolean,
  locatorHint: Schema.Literal('role', 'label', 'placeholder', 'text', 'test-id', 'css'),
  locatorCandidates: Schema.optionalWith(Schema.Array(LocatorStrategySchema), { default: () => [] as readonly (typeof LocatorStrategySchema.Type)[] }),
});

export const DiscoveryTargetSchema = Schema.Struct({
  targetRef: CanonicalTargetRefSchema,
  graphNodeId: Schema.String,
  kind: Schema.Literal('surface', 'element', 'snapshot-anchor'),
  screen: ScreenIdSchema,
  section: Schema.optionalWith(NullableSectionId, { default: () => null }),
  surface: Schema.optionalWith(Schema.NullOr(SurfaceIdSchema), { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  snapshotTemplate: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
});

export const SelectorProbeSchema = Schema.Struct({
  id: Schema.String,
  selectorRef: SelectorRefSchema,
  strategy: LocatorStrategySchema,
  source: Schema.Literal('approved-knowledge', 'discovery', 'evidence'),
  status: Schema.Literal('healthy', 'degraded', 'unverified'),
  rung: Schema.Number,
  artifactPath: Schema.String,
  variantRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  validWhenStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  invalidWhenStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  discoveredFrom: Schema.optionalWith(NullableString, { default: () => null }),
  evidenceRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  successCount: Schema.Number,
  failureCount: Schema.Number,
  lastUsedAt: Schema.optionalWith(NullableString, { default: () => null }),
  lineage: Schema.Struct({
    sourceArtifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    discoveryRunIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    evidenceRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  }),
});

export const DiscoveryRunSchema = Schema.Struct({
  kind: Schema.Literal('discovery-run'),
  version: Schema.Literal(2),
  stage: Schema.Literal('preparation'),
  scope: Schema.Literal('workspace'),
  governance: Schema.Literal('approved'),
  app: Schema.String,
  routeId: RouteIdSchema,
  variantId: RouteVariantIdSchema,
  routeVariantRef: Schema.String,
  runId: Schema.String,
  screen: ScreenIdSchema,
  url: Schema.String,
  title: Schema.String,
  discoveredAt: Schema.String,
  artifactPath: Schema.String,
  rootSelector: Schema.String,
  snapshotHash: Schema.String,
  sections: Schema.optionalWith(Schema.Array(Schema.Struct({
    id: SectionIdSchema,
    depth: Schema.Number,
    selector: Schema.String,
    surfaceIds: Schema.optionalWith(Schema.Array(SurfaceIdSchema), { default: () => [] as readonly (typeof SurfaceIdSchema.Type)[] }),
    elementIds: Schema.optionalWith(Schema.Array(ElementIdSchema), { default: () => [] as readonly (typeof ElementIdSchema.Type)[] }),
  })), { default: () => [] as const }),
  surfaces: Schema.optionalWith(Schema.Array(DiscoveryObservedSurfaceSchema), { default: () => [] as readonly (typeof DiscoveryObservedSurfaceSchema.Type)[] }),
  elements: Schema.optionalWith(Schema.Array(DiscoveryObservedElementSchema), { default: () => [] as readonly (typeof DiscoveryObservedElementSchema.Type)[] }),
  snapshotAnchors: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  targets: Schema.optionalWith(Schema.Array(DiscoveryTargetSchema), { default: () => [] as readonly (typeof DiscoveryTargetSchema.Type)[] }),
  reviewNotes: Schema.optionalWith(Schema.Array(Schema.Struct({
    code: Schema.Literal('missing-accessible-name', 'css-fallback-only', 'state-exploration-recommended'),
    message: Schema.String,
    targetId: Schema.String,
    targetKind: Schema.Literal('surface', 'element', 'snapshot-anchor'),
  })), { default: () => [] as const }),
  selectorProbes: Schema.optionalWith(Schema.Array(Schema.Struct({
    id: Schema.String,
    selectorRef: SelectorRefSchema,
    targetRef: CanonicalTargetRefSchema,
    graphNodeId: Schema.String,
    screen: ScreenIdSchema,
    section: Schema.optionalWith(NullableSectionId, { default: () => null }),
    element: Schema.optionalWith(NullableElementId, { default: () => null }),
    strategy: LocatorStrategySchema,
    source: Schema.Literal('discovery'),
    variantRef: Schema.String,
    validWhenStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
    invalidWhenStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  })), { default: () => [] as const }),
  stateObservations: Schema.optionalWith(Schema.Array(Schema.Struct({
    stateRef: StateNodeRefSchema,
    source: Schema.Literal('baseline', 'active-harvest'),
    observed: Schema.Boolean,
    detail: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  })), { default: () => [] as const }),
  eventCandidates: Schema.optionalWith(Schema.Array(Schema.Struct({
    eventSignatureRef: EventSignatureRefSchema,
    targetRef: CanonicalTargetRefSchema,
    action: StepActionSchema,
    source: Schema.Literal('approved-behavior', 'active-harvest'),
  })), { default: () => [] as const }),
  transitionObservations: Schema.optionalWith(Schema.Array(TransitionObservationSchema), { default: () => [] as readonly (typeof TransitionObservationSchema.Type)[] }),
  observationDiffs: Schema.optionalWith(Schema.Array(Schema.Struct({
    beforeStateRef: Schema.optionalWith(NullableStateNodeRef, { default: () => null }),
    afterStateRef: Schema.optionalWith(NullableStateNodeRef, { default: () => null }),
    eventSignatureRef: Schema.optionalWith(NullableEventSignatureRef, { default: () => null }),
    transitionRef: Schema.optionalWith(Schema.NullOr(TransitionRefSchema), { default: () => null }),
    classification: Schema.Literal('observed', 'missing', 'unexpected'),
  })), { default: () => [] as const }),
  graphDeltas: Schema.Struct({
    nodeIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    edgeIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  }),
});
