import type {
  CanonicalTargetRef,
  ElementId,
  EventSignatureRef,
  PostureId,
  ScreenId,
  SectionId,
  SelectorRef,
  SnapshotTemplateId,
  StateNodeRef,
  SurfaceId,
  TransitionRef,
  WidgetId,
} from '../identity';
import type {
  CanonicalKnowledgeMetadata,
  AssertionKind,
  EffectState,
  EffectTargetKind,
  LocatorStrategy,
  PatternActionName,
  SurfaceKind,
  TrustPolicyArtifactType,
} from './workflow';
import type { StepResolution } from './intent';
import type { RuntimeControlSession } from './resolution';

export interface StepTaskElementCandidate {
  readonly element: ElementId;
  readonly targetRef: CanonicalTargetRef;
  readonly role: string;
  readonly name?: string | null | undefined;
  readonly surface: SurfaceId;
  readonly widget: WidgetId;
  readonly affordance?: string | null | undefined;
  readonly aliases: readonly string[];
  readonly locator: readonly LocatorStrategy[];
  readonly postures: readonly PostureId[];
  readonly defaultValueRef?: string | null | undefined;
  readonly parameter?: string | null | undefined;
  readonly snapshotAliases?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly graphNodeId?: string | null | undefined;
  readonly selectorRefs: readonly SelectorRef[];
}

export interface StepTaskScreenCandidate {
  readonly screen: ScreenId;
  readonly url: string;
  readonly routeVariantRefs: readonly string[];
  readonly screenAliases: readonly string[];
  readonly knowledgeRefs: readonly string[];
  readonly supplementRefs: readonly string[];
  readonly elements: readonly StepTaskElementCandidate[];
  readonly sectionSnapshots: readonly SnapshotTemplateId[];
  readonly graphNodeId?: string | null | undefined;
}

export type ApprovalEquivalenceStatus = 'learning' | 'approved-equivalent' | 'needs-review';

export interface ArtifactConfidenceRecord {
  readonly id: string;
  readonly artifactType: TrustPolicyArtifactType;
  readonly artifactPath: string;
  readonly score: number;
  readonly threshold: number;
  readonly status: ApprovalEquivalenceStatus;
  readonly successCount: number;
  readonly failureCount: number;
  readonly evidenceCount: number;
  readonly screen?: ScreenId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly snapshotTemplate?: SnapshotTemplateId | null | undefined;
  readonly learnedAliases: readonly string[];
  readonly lastSuccessAt?: string | null | undefined;
  readonly lastFailureAt?: string | null | undefined;
  readonly lineage: {
    readonly runIds: readonly string[];
    readonly evidenceIds: readonly string[];
    readonly sourceArtifactPaths: readonly string[];
    readonly decay?: {
      readonly total: number;
      readonly floor: number;
      readonly suppressedSignalCount: number;
      readonly appliedSignals: ReadonlyArray<{
        readonly runId: string;
        readonly stepIndex: number;
        readonly signal: import('./workflow').ConfidenceDriftSignal;
        readonly artifactType: TrustPolicyArtifactType;
        readonly decayRate: number;
        readonly threshold: string;
      }>;
    } | undefined;
  };
}

export interface ConfidenceOverlayCatalog {
  readonly kind: 'confidence-overlay-catalog';
  readonly version: 1;
  readonly generatedAt: string;
  readonly records: readonly ArtifactConfidenceRecord[];
  readonly summary: {
    readonly total: number;
    readonly approvedEquivalentCount: number;
    readonly needsReviewCount: number;
  };
}

export interface InterfaceResolutionContext {
  readonly knowledgeFingerprint: string;
  readonly confidenceFingerprint?: string | null | undefined;
  readonly interfaceGraphFingerprint?: string | null | undefined;
  readonly selectorCanonFingerprint?: string | null | undefined;
  readonly stateGraphFingerprint?: string | null | undefined;
  readonly interfaceGraphPath?: string | null | undefined;
  readonly selectorCanonPath?: string | null | undefined;
  readonly stateGraphPath?: string | null | undefined;
  readonly sharedPatterns: SharedPatterns;
  readonly screens: readonly StepTaskScreenCandidate[];
  readonly evidenceRefs: readonly string[];
  readonly confidenceOverlays: readonly ArtifactConfidenceRecord[];
  readonly controls: RuntimeControlSession;
  readonly stateGraph?: import('./interface').StateTransitionGraph | null | undefined;
  /** DerivedGraph reference for runtime graph queries (transitions, reachability). */
  readonly derivedGraph?: import('./projection').DerivedGraph | null | undefined;
}

export interface SurfaceSection {
  readonly selector: string;
  readonly url?: string | undefined;
  readonly kind: SurfaceKind;
  readonly surfaces: readonly SurfaceId[];
  readonly snapshot?: SnapshotTemplateId | null | undefined;
}

export interface SurfaceDefinition {
  readonly kind: SurfaceKind;
  readonly section: SectionId;
  readonly selector: string;
  readonly parents: readonly SurfaceId[];
  readonly children: readonly SurfaceId[];
  readonly elements: readonly ElementId[];
  readonly assertions: readonly AssertionKind[];
  readonly required?: boolean | undefined;
}

export interface SurfaceGraph {
  readonly screen: ScreenId;
  readonly url: string;
  readonly sections: Readonly<Record<string, SurfaceSection>>;
  readonly surfaces: Readonly<Record<string, SurfaceDefinition>>;
}

export interface ElementSig {
  readonly role: string;
  readonly name?: string | null | undefined;
  readonly testId?: string | null | undefined;
  readonly cssFallback?: string | null | undefined;
  readonly locator?: readonly LocatorStrategy[] | undefined;
  readonly surface: SurfaceId;
  readonly widget: WidgetId;
  readonly affordance?: string | null | undefined;
  readonly required?: boolean | undefined;
}

export interface ScreenElements {
  readonly screen: ScreenId;
  readonly url: string;
  readonly elements: Readonly<Record<string, ElementSig>>;
}

export interface ScreenElementHint {
  readonly aliases: readonly string[];
  readonly defaultValueRef?: string | null | undefined;
  readonly parameter?: string | null | undefined;
  readonly snapshotAliases?: Readonly<Record<string, readonly string[]>> | undefined;
  readonly affordance?: string | null | undefined;
  readonly acquired?: CanonicalKnowledgeMetadata | null | undefined;
}

export interface ScreenHints {
  readonly screen: ScreenId;
  readonly screenAliases: readonly string[];
  readonly elements: Readonly<Record<string, ScreenElementHint>>;
}

export type StatePredicateSemantics =
  | 'visible'
  | 'hidden'
  | 'enabled'
  | 'disabled'
  | 'valid'
  | 'invalid'
  | 'open'
  | 'closed'
  | 'expanded'
  | 'collapsed'
  | 'populated'
  | 'cleared'
  | 'active-route'
  | 'active-modal';

export interface ObservationPredicate {
  readonly kind: StatePredicateSemantics;
  readonly targetRef?: CanonicalTargetRef | null | undefined;
  readonly selectorRef?: SelectorRef | null | undefined;
  readonly routeVariantRef?: string | null | undefined;
  readonly attribute?: string | null | undefined;
  readonly value?: string | null | undefined;
  readonly message?: string | null | undefined;
}

export interface StateNode {
  readonly ref: StateNodeRef;
  readonly screen: ScreenId;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly scope: 'screen' | 'surface' | 'target' | 'route' | 'modal';
  readonly targetRef?: CanonicalTargetRef | null | undefined;
  readonly routeVariantRefs: readonly string[];
  readonly predicates: readonly ObservationPredicate[];
  readonly provenance: readonly string[];
}

export interface EventObservationPlan {
  readonly timeoutMs?: number | null | undefined;
  readonly settleMs?: number | null | undefined;
  readonly observeStateRefs: readonly StateNodeRef[];
}

export interface EventExpectedEffects {
  readonly transitionRefs: readonly TransitionRef[];
  readonly resultStateRefs: readonly StateNodeRef[];
  readonly observableEffects: readonly string[];
  readonly assertions: readonly string[];
}

export interface EventSignature {
  readonly ref: EventSignatureRef;
  readonly screen: ScreenId;
  readonly targetRef: CanonicalTargetRef;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly dispatch: {
    readonly action: StepResolution['action'];
    readonly sampleValue?: string | null | undefined;
  };
  readonly requiredStateRefs: readonly StateNodeRef[];
  readonly forbiddenStateRefs: readonly StateNodeRef[];
  readonly effects: EventExpectedEffects;
  readonly observationPlan: EventObservationPlan;
  readonly provenance: readonly string[];
}

export type TransitionEffectKind =
  | 'reveal'
  | 'hide'
  | 'enable'
  | 'disable'
  | 'validate'
  | 'invalidate'
  | 'open'
  | 'close'
  | 'navigate'
  | 'return'
  | 'expand'
  | 'collapse'
  | 'populate'
  | 'clear';

export interface StateTransition {
  readonly ref: TransitionRef;
  readonly screen: ScreenId;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly eventSignatureRef: EventSignatureRef;
  readonly sourceStateRefs: readonly StateNodeRef[];
  readonly targetStateRefs: readonly StateNodeRef[];
  readonly effectKind: TransitionEffectKind;
  readonly observableEffects: readonly string[];
  readonly provenance: readonly string[];
}

export interface ScreenBehavior {
  readonly kind: 'screen-behavior';
  readonly version: 1;
  readonly screen: ScreenId;
  readonly aliases: readonly string[];
  readonly routeVariantRefs: readonly string[];
  readonly knowledgeRefs: readonly string[];
  readonly stateNodes: readonly StateNode[];
  readonly eventSignatures: readonly EventSignature[];
  readonly transitions: readonly StateTransition[];
}

export interface BehaviorPatternDocument {
  readonly kind: 'behavior-pattern';
  readonly version: 1;
  readonly id: string;
  readonly aliases: readonly string[];
  readonly stateNodes: readonly StateNode[];
  readonly eventSignatures: readonly EventSignature[];
  readonly transitions: readonly StateTransition[];
}

export interface PatternAliasSet {
  readonly id: string;
  readonly aliases: readonly string[];
}

export interface PatternDocument {
  readonly version: 1;
  readonly actions?: Readonly<Partial<Record<PatternActionName, PatternAliasSet>>> | undefined;
  readonly postures?: Readonly<Record<string, PatternAliasSet>> | undefined;
}

export interface MergedPatterns {
  readonly version: 1;
  readonly actions: Readonly<Record<PatternActionName, PatternAliasSet>>;
  readonly postures: Readonly<Record<string, PatternAliasSet>>;
  readonly documents: readonly string[];
  readonly sources: {
    readonly actions: Readonly<Record<PatternActionName, string>>;
    readonly postures: Readonly<Record<string, string>>;
  };
}

export type SharedPatterns = MergedPatterns;

export interface PostureEffect {
  readonly target: 'self' | ElementId | SurfaceId;
  readonly targetKind?: EffectTargetKind | undefined;
  readonly state: EffectState;
  readonly message?: string | null | undefined;
}

export interface Posture {
  readonly values: readonly string[];
  readonly effects: readonly PostureEffect[];
}

export interface ScreenPostures {
  readonly screen: ScreenId;
  readonly postures: Readonly<Record<string, Readonly<Record<string, Posture>>>>;
}
