import type {
  CanonicalTargetRef,
  ElementId,
  PostureId,
  ScreenId,
  SectionId,
  SelectorRef,
  SnapshotTemplateId,
  SurfaceId,
  WidgetId,
} from '../identity';
import type {
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
  targetRef?: CanonicalTargetRef | null | undefined;
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
  selectorRefs?: SelectorRef[] | undefined;
}

export interface StepTaskScreenCandidate {
  screen: ScreenId;
  url: string;
  routeVariantRefs?: string[] | undefined;
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

export interface RuntimeKnowledgeSession {
  knowledgeFingerprint: string;
  confidenceFingerprint?: string | null | undefined;
  interfaceGraphFingerprint?: string | null | undefined;
  selectorCanonFingerprint?: string | null | undefined;
  interfaceGraphPath?: string | null | undefined;
  selectorCanonPath?: string | null | undefined;
  sharedPatterns: SharedPatterns;
  screens: StepTaskScreenCandidate[];
  evidenceRefs: string[];
  confidenceOverlays: ArtifactConfidenceRecord[];
  controls: RuntimeControlSession;
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
}

export interface ScreenHints {
  screen: ScreenId;
  screenAliases: string[];
  elements: Record<string, ScreenElementHint>;
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
