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
  element: ElementId;
  targetRef: CanonicalTargetRef;
  role: string;
  name?: string | null | undefined;
  surface: SurfaceId;
  widget: WidgetId;
  affordance?: string | null | undefined;
  aliases: string[];
  locator: LocatorStrategy[];
  postures: PostureId[];
  defaultValueRef?: string | null | undefined;
  parameter?: string | null | undefined;
  snapshotAliases?: Record<string, string[]> | undefined;
  graphNodeId?: string | null | undefined;
  selectorRefs: SelectorRef[];
}

export interface StepTaskScreenCandidate {
  screen: ScreenId;
  url: string;
  routeVariantRefs: string[];
  screenAliases: string[];
  knowledgeRefs: string[];
  supplementRefs: string[];
  elements: StepTaskElementCandidate[];
  sectionSnapshots: SnapshotTemplateId[];
  graphNodeId?: string | null | undefined;
}

export type ApprovalEquivalenceStatus = 'learning' | 'approved-equivalent' | 'needs-review';

export interface ArtifactConfidenceRecord {
  id: string;
  artifactType: TrustPolicyArtifactType;
  artifactPath: string;
  score: number;
  threshold: number;
  status: ApprovalEquivalenceStatus;
  successCount: number;
  failureCount: number;
  evidenceCount: number;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  learnedAliases: string[];
  lastSuccessAt?: string | null | undefined;
  lastFailureAt?: string | null | undefined;
  lineage: {
    runIds: string[];
    evidenceIds: string[];
    sourceArtifactPaths: string[];
  };
}

export interface ConfidenceOverlayCatalog {
  kind: 'confidence-overlay-catalog';
  version: 1;
  generatedAt: string;
  records: ArtifactConfidenceRecord[];
  summary: {
    total: number;
    approvedEquivalentCount: number;
    needsReviewCount: number;
  };
}

export interface InterfaceResolutionContext {
  knowledgeFingerprint: string;
  confidenceFingerprint?: string | null | undefined;
  interfaceGraphFingerprint?: string | null | undefined;
  selectorCanonFingerprint?: string | null | undefined;
  stateGraphFingerprint?: string | null | undefined;
  interfaceGraphPath?: string | null | undefined;
  selectorCanonPath?: string | null | undefined;
  stateGraphPath?: string | null | undefined;
  sharedPatterns: SharedPatterns;
  screens: StepTaskScreenCandidate[];
  evidenceRefs: string[];
  confidenceOverlays: ArtifactConfidenceRecord[];
  controls: RuntimeControlSession;
  stateGraph?: import('./interface').StateTransitionGraph | null | undefined;
}

export interface SurfaceSection {
  selector: string;
  url?: string | undefined;
  kind: SurfaceKind;
  surfaces: SurfaceId[];
  snapshot?: SnapshotTemplateId | null | undefined;
}

export interface SurfaceDefinition {
  kind: SurfaceKind;
  section: SectionId;
  selector: string;
  parents: SurfaceId[];
  children: SurfaceId[];
  elements: ElementId[];
  assertions: AssertionKind[];
  required?: boolean | undefined;
}

export interface SurfaceGraph {
  screen: ScreenId;
  url: string;
  sections: Record<string, SurfaceSection>;
  surfaces: Record<string, SurfaceDefinition>;
}

export interface ElementSig {
  role: string;
  name?: string | null | undefined;
  testId?: string | null | undefined;
  cssFallback?: string | null | undefined;
  locator?: LocatorStrategy[] | undefined;
  surface: SurfaceId;
  widget: WidgetId;
  affordance?: string | null | undefined;
  required?: boolean | undefined;
}

export interface ScreenElements {
  screen: ScreenId;
  url: string;
  elements: Record<string, ElementSig>;
}

export interface ScreenElementHint {
  aliases: string[];
  defaultValueRef?: string | null | undefined;
  parameter?: string | null | undefined;
  snapshotAliases?: Record<string, string[]> | undefined;
  affordance?: string | null | undefined;
  acquired?: CanonicalKnowledgeMetadata | null | undefined;
}

export interface ScreenHints {
  screen: ScreenId;
  screenAliases: string[];
  elements: Record<string, ScreenElementHint>;
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
  kind: StatePredicateSemantics;
  targetRef?: CanonicalTargetRef | null | undefined;
  selectorRef?: SelectorRef | null | undefined;
  routeVariantRef?: string | null | undefined;
  attribute?: string | null | undefined;
  value?: string | null | undefined;
  message?: string | null | undefined;
}

export interface StateNode {
  ref: StateNodeRef;
  screen: ScreenId;
  label: string;
  aliases: string[];
  scope: 'screen' | 'surface' | 'target' | 'route' | 'modal';
  targetRef?: CanonicalTargetRef | null | undefined;
  routeVariantRefs: string[];
  predicates: ObservationPredicate[];
  provenance: string[];
}

export interface EventObservationPlan {
  timeoutMs?: number | null | undefined;
  settleMs?: number | null | undefined;
  observeStateRefs: StateNodeRef[];
}

export interface EventExpectedEffects {
  transitionRefs: TransitionRef[];
  resultStateRefs: StateNodeRef[];
  observableEffects: string[];
  assertions: string[];
}

export interface EventSignature {
  ref: EventSignatureRef;
  screen: ScreenId;
  targetRef: CanonicalTargetRef;
  label: string;
  aliases: string[];
  dispatch: {
    action: StepResolution['action'];
    sampleValue?: string | null | undefined;
  };
  requiredStateRefs: StateNodeRef[];
  forbiddenStateRefs: StateNodeRef[];
  effects: EventExpectedEffects;
  observationPlan: EventObservationPlan;
  provenance: string[];
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
  ref: TransitionRef;
  screen: ScreenId;
  label: string;
  aliases: string[];
  eventSignatureRef: EventSignatureRef;
  sourceStateRefs: StateNodeRef[];
  targetStateRefs: StateNodeRef[];
  effectKind: TransitionEffectKind;
  observableEffects: string[];
  provenance: string[];
}

export interface ScreenBehavior {
  kind: 'screen-behavior';
  version: 1;
  screen: ScreenId;
  aliases: string[];
  routeVariantRefs: string[];
  knowledgeRefs: string[];
  stateNodes: StateNode[];
  eventSignatures: EventSignature[];
  transitions: StateTransition[];
}

export interface BehaviorPatternDocument {
  kind: 'behavior-pattern';
  version: 1;
  id: string;
  aliases: string[];
  stateNodes: StateNode[];
  eventSignatures: EventSignature[];
  transitions: StateTransition[];
}

export interface PatternAliasSet {
  id: string;
  aliases: string[];
}

export interface PatternDocument {
  version: 1;
  actions?: Partial<Record<PatternActionName, PatternAliasSet>> | undefined;
  postures?: Record<string, PatternAliasSet> | undefined;
}

export interface MergedPatterns {
  version: 1;
  actions: Record<PatternActionName, PatternAliasSet>;
  postures: Record<string, PatternAliasSet>;
  documents: string[];
  sources: {
    actions: Record<PatternActionName, string>;
    postures: Record<string, string>;
  };
}

export type SharedPatterns = MergedPatterns;

export interface PostureEffect {
  target: 'self' | ElementId | SurfaceId;
  targetKind?: EffectTargetKind | undefined;
  state: EffectState;
  message?: string | null | undefined;
}

export interface Posture {
  values: string[];
  effects: PostureEffect[];
}

export interface ScreenPostures {
  screen: ScreenId;
  postures: Record<string, Record<string, Posture>>;
}
