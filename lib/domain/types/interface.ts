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
} from '../kernel/identity';
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
  readonly id: string;
  readonly kind: InterfaceGraphNodeKind;
  readonly label: string;
  readonly fingerprint: string;
  readonly route?: RouteId | null | undefined;
  readonly variant?: RouteVariantId | null | undefined;
  readonly screen?: ScreenId | null | undefined;
  readonly section?: SectionId | null | undefined;
  readonly surface?: SurfaceId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly snapshotTemplate?: SnapshotTemplateId | null | undefined;
  readonly targetRef?: CanonicalTargetRef | null | undefined;
  readonly artifactPaths: readonly string[];
  readonly source: 'approved-knowledge' | 'discovery' | 'derived-working';
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface InterfaceGraphEdge {
  readonly id: string;
  readonly kind: InterfaceGraphEdgeKind;
  readonly from: string;
  readonly to: string;
  readonly fingerprint: string;
  readonly lineage: readonly string[];
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface DiscoveryObservedSurface {
  readonly id: SurfaceId;
  readonly targetRef: CanonicalTargetRef;
  readonly section: SectionId;
  readonly selector: string;
  readonly role: string | null;
  readonly name: string | null;
  readonly kind: SurfaceKind;
  readonly assertions: readonly AssertionKind[];
  readonly testId: string | null;
}

export interface DiscoveryObservedElement {
  readonly id: ElementId;
  readonly targetRef: CanonicalTargetRef;
  readonly surface: SurfaceId;
  readonly selector: string;
  readonly role: string;
  readonly name: string | null;
  readonly testId: string | null;
  readonly widget: string;
  readonly required: boolean;
  readonly locatorHint: 'test-id' | 'role-name' | 'css';
  readonly locatorCandidates: readonly LocatorStrategy[];
}

export interface DiscoveryTarget {
  readonly targetRef: CanonicalTargetRef;
  readonly graphNodeId: string;
  readonly kind: 'surface' | 'element' | 'snapshot-anchor';
  readonly screen: ScreenId;
  readonly section?: SectionId | null | undefined;
  readonly surface?: SurfaceId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly snapshotTemplate?: SnapshotTemplateId | null | undefined;
}

export interface SelectorProbe {
  readonly id: string;
  readonly selectorRef: SelectorRef;
  readonly strategy: LocatorStrategy;
  readonly source: 'approved-knowledge' | 'discovery' | 'evidence';
  readonly status: 'healthy' | 'degraded' | 'unverified';
  readonly rung: number;
  readonly artifactPath: string;
  readonly variantRefs: readonly string[];
  readonly validWhenStateRefs: readonly StateNodeRef[];
  readonly invalidWhenStateRefs: readonly StateNodeRef[];
  readonly discoveredFrom?: string | null | undefined;
  readonly evidenceRefs: readonly string[];
  readonly successCount: number;
  readonly failureCount: number;
  readonly lastUsedAt?: string | null | undefined;
  readonly lineage: {
    readonly sourceArtifactPaths: readonly string[];
    readonly discoveryRunIds: readonly string[];
    readonly evidenceRefs: readonly string[];
  };
}

export interface DiscoveryRun {
  readonly kind: 'discovery-run';
  readonly version: 2;
  readonly stage: 'preparation';
  readonly scope: 'workspace';
  readonly governance: 'approved';
  readonly app: string;
  readonly routeId: RouteId;
  readonly variantId: RouteVariantId;
  readonly routeVariantRef: string;
  readonly runId: string;
  readonly screen: ScreenId;
  readonly url: string;
  readonly title: string;
  readonly discoveredAt: string;
  readonly artifactPath: string;
  readonly rootSelector: string;
  readonly snapshotHash: string;
  readonly sections: ReadonlyArray<{
    readonly id: SectionId;
    readonly depth: number;
    readonly selector: string;
    readonly surfaceIds: readonly SurfaceId[];
    readonly elementIds: readonly ElementId[];
  }>;
  readonly surfaces: readonly DiscoveryObservedSurface[];
  readonly elements: readonly DiscoveryObservedElement[];
  readonly snapshotAnchors: readonly string[];
  readonly targets: readonly DiscoveryTarget[];
  readonly reviewNotes: ReadonlyArray<{
    readonly code: 'missing-accessible-name' | 'css-fallback-only' | 'state-exploration-recommended';
    readonly message: string;
    readonly targetId: string;
    readonly targetKind: 'surface' | 'element' | 'snapshot-anchor';
  }>;
  readonly selectorProbes: ReadonlyArray<{
    readonly id: string;
    readonly selectorRef: SelectorRef;
    readonly targetRef: CanonicalTargetRef;
    readonly graphNodeId: string;
    readonly screen: ScreenId;
    readonly section?: SectionId | null | undefined;
    readonly element?: ElementId | null | undefined;
    readonly strategy: LocatorStrategy;
    readonly source: 'discovery';
    readonly variantRef: string;
    readonly validWhenStateRefs: readonly StateNodeRef[];
    readonly invalidWhenStateRefs: readonly StateNodeRef[];
  }>;
  readonly stateObservations: ReadonlyArray<{
    readonly stateRef: StateNodeRef;
    readonly source: 'baseline' | 'active-harvest';
    readonly observed: boolean;
    readonly detail?: Readonly<Record<string, string>> | undefined;
  }>;
  readonly eventCandidates: ReadonlyArray<{
    readonly eventSignatureRef: EventSignatureRef;
    readonly targetRef: CanonicalTargetRef;
    readonly action: 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
    readonly source: 'approved-behavior' | 'active-harvest';
  }>;
  readonly transitionObservations: readonly TransitionObservation[];
  readonly observationDiffs: ReadonlyArray<{
    readonly beforeStateRef: StateNodeRef | null;
    readonly afterStateRef: StateNodeRef | null;
    readonly eventSignatureRef?: EventSignatureRef | null | undefined;
    readonly transitionRef?: TransitionRef | null | undefined;
    readonly classification: 'observed' | 'missing' | 'unexpected';
  }>;
  readonly graphDeltas: {
    readonly nodeIds: readonly string[];
    readonly edgeIds: readonly string[];
  };
}

export interface DiscoveryIndexEntry {
  readonly routeId: RouteId;
  readonly variantId: RouteVariantId;
  readonly routeVariantRef: string;
  readonly screen: ScreenId;
  readonly status: 'ok' | 'failed';
  readonly receiptId?: string | null | undefined;
  readonly receiptPath?: string | null | undefined;
  readonly contentFingerprint?: string | null | undefined;
  readonly writeDisposition: 'reused' | 'rewritten' | 'failed';
  readonly resolvedUrl?: string | null | undefined;
  readonly rootSelector?: string | null | undefined;
  readonly message?: string | null | undefined;
  /** Hash of inputs (URL, manifest entry, knowledge) that produced this receipt.
   *  When present, harvest can skip the browser crawl if inputs haven't changed. */
  readonly inputFingerprint?: string | null | undefined;
}

export interface DiscoveryIndex {
  readonly kind: 'discovery-index';
  readonly version: 2;
  readonly app: string;
  readonly generatedAt: string;
  readonly receipts: readonly DiscoveryIndexEntry[];
}

export interface SelectorCanonEntry {
  readonly targetRef: CanonicalTargetRef;
  readonly screen: ScreenId;
  readonly kind: 'surface' | 'element' | 'snapshot-anchor' | 'discovered';
  readonly surface?: SurfaceId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly snapshotTemplate?: SnapshotTemplateId | null | undefined;
  readonly probes: readonly SelectorProbe[];
}

export interface SelectorCanon {
  readonly kind: 'selector-canon';
  readonly version: 1;
  readonly generatedAt: string;
  readonly fingerprint: string;
  readonly entries: readonly SelectorCanonEntry[];
  readonly summary: {
    readonly totalTargets: number;
    readonly totalProbes: number;
    readonly approvedKnowledgeProbeCount: number;
    readonly discoveryProbeCount: number;
    readonly degradedProbeCount: number;
    readonly healthyProbeCount: number;
  };
}

export interface ApplicationInterfaceGraph {
  readonly kind: 'application-interface-graph';
  readonly version: 2;
  readonly generatedAt: string;
  readonly fingerprint: string;
  readonly discoveryRunIds: readonly string[];
  readonly routeRefs: readonly string[];
  readonly routeVariantRefs: readonly string[];
  readonly targetRefs: readonly CanonicalTargetRef[];
  readonly stateRefs: readonly StateNodeRef[];
  readonly eventSignatureRefs: readonly EventSignatureRef[];
  readonly transitionRefs: readonly TransitionRef[];
  readonly nodes: readonly InterfaceGraphNode[];
  readonly edges: readonly InterfaceGraphEdge[];
}

export interface TransitionObservation {
  readonly observationId: string;
  readonly source: 'harvest' | 'runtime';
  readonly actor: 'safe-active-harvest' | 'runtime-execution' | 'live-dom';
  readonly screen: ScreenId;
  readonly eventSignatureRef?: EventSignatureRef | null | undefined;
  readonly transitionRef?: TransitionRef | null | undefined;
  readonly expectedTransitionRefs: readonly TransitionRef[];
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly unexpectedStateRefs: readonly StateNodeRef[];
  readonly confidence: 'observed' | 'inferred' | 'missing';
  readonly classification: 'matched' | 'ambiguous-match' | 'missing-expected' | 'unexpected-effects';
  readonly detail?: Readonly<Record<string, string>> | undefined;
}

export interface StateTransitionGraph {
  readonly kind: 'state-transition-graph';
  readonly version: 1;
  readonly generatedAt: string;
  readonly fingerprint: string;
  readonly stateRefs: readonly StateNodeRef[];
  readonly eventSignatureRefs: readonly EventSignatureRef[];
  readonly transitionRefs: readonly TransitionRef[];
  readonly states: readonly StateNode[];
  readonly eventSignatures: readonly EventSignature[];
  readonly transitions: readonly StateTransition[];
  readonly observations: readonly TransitionObservation[];
}
