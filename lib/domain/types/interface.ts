import type {
  CanonicalTargetRef,
  ElementId,
  EventSignatureRef,
  RouteId,
  RouteVariantId,
  ScreenId,
  SectionId,
  SelectorRef,
  SnapshotTemplateId,
  StateNodeRef,
  SurfaceId,
  TransitionRef,
} from '../identity';
import type { EventSignature, StateNode, StateTransition } from './knowledge';
import type { AssertionKind, LocatorStrategy, SurfaceKind } from './workflow';

export type InterfaceGraphNodeKind =
  | 'route'
  | 'route-variant'
  | 'screen'
  | 'section'
  | 'surface'
  | 'target'
  | 'snapshot-anchor'
  | 'harvest-run'
  | 'state'
  | 'event-signature'
  | 'transition';

export type InterfaceGraphEdgeKind =
  | 'route-target'
  | 'variant-of-route'
  | 'contains'
  | 'references-target'
  | 'references-snapshot'
  | 'discovered-by'
  | 'requires-state'
  | 'causes-transition'
  | 'results-in-state';

export interface InterfaceGraphNode {
  id: string;
  kind: InterfaceGraphNodeKind;
  label: string;
  fingerprint: string;
  route?: RouteId | null | undefined;
  variant?: RouteVariantId | null | undefined;
  screen?: ScreenId | null | undefined;
  section?: SectionId | null | undefined;
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  targetRef?: CanonicalTargetRef | null | undefined;
  artifactPaths: string[];
  source: 'approved-knowledge' | 'discovery' | 'derived-working';
  payload?: Record<string, unknown> | undefined;
}

export interface InterfaceGraphEdge {
  id: string;
  kind: InterfaceGraphEdgeKind;
  from: string;
  to: string;
  fingerprint: string;
  lineage: string[];
  payload?: Record<string, unknown> | undefined;
}

export interface DiscoveryObservedSurface {
  id: SurfaceId;
  targetRef: CanonicalTargetRef;
  section: SectionId;
  selector: string;
  role: string | null;
  name: string | null;
  kind: SurfaceKind;
  assertions: AssertionKind[];
  testId: string | null;
}

export interface DiscoveryObservedElement {
  id: ElementId;
  targetRef: CanonicalTargetRef;
  surface: SurfaceId;
  selector: string;
  role: string;
  name: string | null;
  testId: string | null;
  widget: string;
  required: boolean;
  locatorHint: 'test-id' | 'role-name' | 'css';
  locatorCandidates: LocatorStrategy[];
}

export interface DiscoveryTarget {
  targetRef: CanonicalTargetRef;
  graphNodeId: string;
  kind: 'surface' | 'element' | 'snapshot-anchor';
  screen: ScreenId;
  section?: SectionId | null | undefined;
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
}

export interface SelectorProbe {
  id: string;
  selectorRef: SelectorRef;
  strategy: LocatorStrategy;
  source: 'approved-knowledge' | 'discovery' | 'evidence';
  status: 'healthy' | 'degraded' | 'unverified';
  rung: number;
  artifactPath: string;
  variantRefs: string[];
  validWhenStateRefs: StateNodeRef[];
  invalidWhenStateRefs: StateNodeRef[];
  discoveredFrom?: string | null | undefined;
  evidenceRefs: string[];
  successCount: number;
  failureCount: number;
  lastUsedAt?: string | null | undefined;
  lineage: {
    sourceArtifactPaths: string[];
    discoveryRunIds: string[];
    evidenceRefs: string[];
  };
}

export interface DiscoveryRun {
  kind: 'discovery-run';
  version: 2;
  stage: 'preparation';
  scope: 'workspace';
  governance: 'approved';
  app: string;
  routeId: RouteId;
  variantId: RouteVariantId;
  routeVariantRef: string;
  runId: string;
  screen: ScreenId;
  url: string;
  title: string;
  discoveredAt: string;
  artifactPath: string;
  rootSelector: string;
  snapshotHash: string;
  sections: Array<{
    id: SectionId;
    depth: number;
    selector: string;
    surfaceIds: SurfaceId[];
    elementIds: ElementId[];
  }>;
  surfaces: DiscoveryObservedSurface[];
  elements: DiscoveryObservedElement[];
  snapshotAnchors: string[];
  targets: DiscoveryTarget[];
  reviewNotes: Array<{
    code: 'missing-accessible-name' | 'css-fallback-only' | 'state-exploration-recommended';
    message: string;
    targetId: string;
    targetKind: 'surface' | 'element' | 'snapshot-anchor';
  }>;
  selectorProbes: Array<{
    id: string;
    selectorRef: SelectorRef;
    targetRef: CanonicalTargetRef;
    graphNodeId: string;
    screen: ScreenId;
    section?: SectionId | null | undefined;
    element?: ElementId | null | undefined;
    strategy: LocatorStrategy;
    source: 'discovery';
    variantRef: string;
    validWhenStateRefs: StateNodeRef[];
    invalidWhenStateRefs: StateNodeRef[];
  }>;
  stateObservations: Array<{
    stateRef: StateNodeRef;
    source: 'baseline' | 'active-harvest';
    observed: boolean;
    detail?: Record<string, string> | undefined;
  }>;
  eventCandidates: Array<{
    eventSignatureRef: EventSignatureRef;
    targetRef: CanonicalTargetRef;
    action: 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
    source: 'approved-behavior' | 'active-harvest';
  }>;
  transitionObservations: TransitionObservation[];
  observationDiffs: Array<{
    beforeStateRef: StateNodeRef | null;
    afterStateRef: StateNodeRef | null;
    eventSignatureRef?: EventSignatureRef | null | undefined;
    transitionRef?: TransitionRef | null | undefined;
    classification: 'observed' | 'missing' | 'unexpected';
  }>;
  graphDeltas: {
    nodeIds: string[];
    edgeIds: string[];
  };
}

export interface DiscoveryIndexEntry {
  routeId: RouteId;
  variantId: RouteVariantId;
  routeVariantRef: string;
  screen: ScreenId;
  status: 'ok' | 'failed';
  receiptId?: string | null | undefined;
  receiptPath?: string | null | undefined;
  contentFingerprint?: string | null | undefined;
  writeDisposition: 'reused' | 'rewritten' | 'failed';
  resolvedUrl?: string | null | undefined;
  rootSelector?: string | null | undefined;
  message?: string | null | undefined;
}

export interface DiscoveryIndex {
  kind: 'discovery-index';
  version: 2;
  app: string;
  generatedAt: string;
  receipts: DiscoveryIndexEntry[];
}

export interface SelectorCanonEntry {
  targetRef: CanonicalTargetRef;
  screen: ScreenId;
  kind: 'surface' | 'element' | 'snapshot-anchor' | 'discovered';
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  probes: SelectorProbe[];
}

export interface SelectorCanon {
  kind: 'selector-canon';
  version: 1;
  generatedAt: string;
  fingerprint: string;
  entries: SelectorCanonEntry[];
  summary: {
    totalTargets: number;
    totalProbes: number;
    approvedKnowledgeProbeCount: number;
    discoveryProbeCount: number;
    degradedProbeCount: number;
    healthyProbeCount: number;
  };
}

export interface ApplicationInterfaceGraph {
  kind: 'application-interface-graph';
  version: 2;
  generatedAt: string;
  fingerprint: string;
  discoveryRunIds: string[];
  routeRefs: string[];
  routeVariantRefs: string[];
  targetRefs: CanonicalTargetRef[];
  stateRefs: StateNodeRef[];
  eventSignatureRefs: EventSignatureRef[];
  transitionRefs: TransitionRef[];
  nodes: InterfaceGraphNode[];
  edges: InterfaceGraphEdge[];
}

export interface TransitionObservation {
  observationId: string;
  source: 'harvest' | 'runtime';
  actor: 'safe-active-harvest' | 'runtime-execution' | 'live-dom';
  screen: ScreenId;
  eventSignatureRef?: EventSignatureRef | null | undefined;
  transitionRef?: TransitionRef | null | undefined;
  expectedTransitionRefs: readonly TransitionRef[];
  observedStateRefs: readonly StateNodeRef[];
  unexpectedStateRefs: readonly StateNodeRef[];
  confidence: 'observed' | 'inferred' | 'missing';
  classification: 'matched' | 'ambiguous-match' | 'missing-expected' | 'unexpected-effects';
  detail?: Record<string, string> | undefined;
}

export interface StateTransitionGraph {
  kind: 'state-transition-graph';
  version: 1;
  generatedAt: string;
  fingerprint: string;
  stateRefs: StateNodeRef[];
  eventSignatureRefs: EventSignatureRef[];
  transitionRefs: TransitionRef[];
  states: StateNode[];
  eventSignatures: EventSignature[];
  transitions: StateTransition[];
  observations: TransitionObservation[];
}
