import type {
  AdoId,
  CanonicalTargetRef,
  ElementId,
  EventSignatureRef,
  PostureId,
  ScreenId,
  SelectorRef,
  SnapshotTemplateId,
  StateNodeRef,
  TransitionRef,
} from '../identity';
import type { StepTaskElementCandidate, StepTaskScreenCandidate } from './knowledge';
import type { ResolutionPrecedenceRung } from '../precedence';
import type {
  Governance,
  ExecutionPosture,
  ResolutionMode,
  ResolutionTarget,
  RuntimeInterpreterMode,
  StepAction,
  StepProvenanceKind,
  StepWinningSource,
  TrustPolicyArtifactType,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
  WorkflowLane,
  WorkflowStage,
} from './workflow';
import type { StepResolution } from './intent';
import type { InterfaceResolutionContext } from './knowledge';
import type { RecoveryPolicy } from '../execution/recovery-policy';

export interface TranslationCandidate {
  kind: 'screen' | 'element' | 'posture' | 'snapshot-template';
  target: string;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  aliases: string[];
  score: number;
  sourceRefs: string[];
}

export interface TranslationRequest {
  version: 1;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  controlsFingerprint: string | null;
  normalizedIntent: string;
  actionText: string;
  expectedText: string;
  allowedActions: StepAction[];
  screens: Array<{
    screen: ScreenId;
    aliases: string[];
    elements: Array<{
      element: ElementId;
      aliases: string[];
      postures: PostureId[];
      snapshotTemplates: SnapshotTemplateId[];
    }>;
  }>;
  evidenceRefs: string[];
  overlayRefs: string[];
}

export interface TranslationReceipt {
  kind: 'translation-receipt';
  version: 1;
  mode: 'structured-translation';
  matched: boolean;
  selected: TranslationCandidate | null;
  candidates: TranslationCandidate[];
  rationale: string;
  translationProvider?: string | undefined;
  cache?: {
    key: string;
    status: 'hit' | 'miss' | 'disabled';
    reason?: string | null | undefined;
  } | undefined;
  failureClass?: 'none' | 'no-candidate' | 'runtime-disabled' | 'cache-disabled' | 'cache-miss' | 'cache-invalidated' | 'translator-error' | undefined;
}

export interface ResolutionEngineCapabilities {
  supportsTranslation: boolean;
  supportsDom: boolean;
  supportsProposalDrafts: boolean;
  deterministicMode: boolean;
}

export interface TaskArtifactRef {
  fingerprint: string | null;
  artifactPath: string | null;
}

export interface ScenarioKnowledgeSlice {
  routeRefs: string[];
  routeVariantRefs: string[];
  screenRefs: ScreenId[];
  targetRefs: CanonicalTargetRef[];
  stateRefs: StateNodeRef[];
  eventSignatureRefs: EventSignatureRef[];
  transitionRefs: TransitionRef[];
  evidenceRefs: string[];
  controlRefs: string[];
}

export interface StepGrounding {
  targetRefs: CanonicalTargetRef[];
  selectorRefs: SelectorRef[];
  fallbackSelectorRefs: SelectorRef[];
  routeVariantRefs: string[];
  assertionAnchors: string[];
  effectAssertions: string[];
  requiredStateRefs: StateNodeRef[];
  forbiddenStateRefs: StateNodeRef[];
  eventSignatureRefs: EventSignatureRef[];
  expectedTransitionRefs: TransitionRef[];
  resultStateRefs: StateNodeRef[];
}

export interface GroundedStep {
  index: number;
  intent: string;
  actionText: string;
  expectedText: string;
  normalizedIntent: string;
  allowedActions: StepAction[];
  explicitResolution: StepResolution | null;
  controlResolution: StepResolution | null;
  grounding: StepGrounding;
  stepFingerprint: string;
  taskFingerprint: string;
}

export interface ScenarioInterpretationSurface {
  kind: 'scenario-interpretation-surface';
  version: 1;
  stage: 'preparation';
  scope: 'scenario';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    adoId: AdoId;
    revision: number;
    title: string;
    suite: string;
    knowledgeFingerprint: string;
    interface: TaskArtifactRef;
    selectors: TaskArtifactRef;
    stateGraph: TaskArtifactRef;
    knowledgeSlice: ScenarioKnowledgeSlice;
    steps: GroundedStep[];
    resolutionContext: InterfaceResolutionContext;
  };
  surfaceFingerprint: string;
}

export interface ScenarioRunPlan {
  kind: 'scenario-run-plan';
  version: 1;
  adoId: AdoId;
  runId: string;
  surfaceFingerprint: string;
  title: string;
  suite: string;
  controlsFingerprint: string | null;
  posture: ExecutionPosture;
  mode: RuntimeInterpreterMode;
  providerId: string;
  controlSelection: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  };
  controlArtifactPaths: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
  };
  fixtures: Record<string, unknown>;
  screenIds: ScreenId[];
  steps: GroundedStep[];
  resolutionContext: InterfaceResolutionContext;
  context: {
    adoId: AdoId;
    revision: number;
    contentHash: string;
    artifactPath?: string | undefined;
  };
  translationEnabled: boolean;
  translationCacheEnabled: boolean;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

/** @deprecated Use `ScenarioInterpretationSurface`. */
export interface ScenarioTaskPacket {
  kind: 'scenario-task-packet';
  version: 5;
  stage: 'preparation';
  scope: 'scenario';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    adoId: AdoId;
    revision: number;
    title: string;
    suite: string;
    knowledgeFingerprint: string;
    interface: TaskArtifactRef;
    selectors: TaskArtifactRef;
    stateGraph: TaskArtifactRef;
    knowledgeSlice: ScenarioKnowledgeSlice;
    steps: GroundedStep[];
  };
  taskFingerprint: string;
}

export interface ObservedStateSessionScreenState {
  screen: ScreenId;
  confidence: number;
  observedAtStep: number;
}

export interface ObservedStateSessionAssertion {
  summary: string;
  observedAtStep: number;
}

export interface CausalLink {
  stepIndex: number;
  firedTransitionRef: TransitionRef;
  targetStateRef: StateNodeRef;
  relevantForSteps: number[];
}

export interface ObservedStateSession {
  currentScreen: ObservedStateSessionScreenState | null;
  activeStateRefs: StateNodeRef[];
  lastObservedTransitionRefs: TransitionRef[];
  activeRouteVariantRefs: string[];
  activeTargetRefs: CanonicalTargetRef[];
  lastSuccessfulLocatorRung: number | null;
  recentAssertions: ObservedStateSessionAssertion[];
  causalLinks: CausalLink[];
  lineage: string[];
}

export interface DatasetControl {
  kind: 'dataset-control';
  version: 1;
  name: string;
  default?: boolean | undefined;
  fixtures: Record<string, unknown>;
  defaults?: {
    elements?: Record<string, string> | undefined;
    generatedTokens?: Record<string, string> | undefined;
  } | undefined;
}

export interface ResolutionControlSelector {
  adoIds: AdoId[];
  suites: string[];
  tags: string[];
}

export interface ResolutionControlStep {
  stepIndex: number;
  resolution: StepResolution;
}

export interface ResolutionControl {
  kind: 'resolution-control';
  version: 1;
  name: string;
  selector: ResolutionControlSelector;
  domExplorationPolicy?: DomExplorationPolicy | undefined;
  steps: ResolutionControlStep[];
}

export interface DomExplorationPolicy {
  maxCandidates: number;
  maxProbes: number;
  forbiddenActions: StepAction[];
}

export interface RuntimeDomCandidate {
  element: StepTaskElementCandidate;
  score: number;
  evidence: {
    visibleCount: number;
    roleNameScore: number;
    locatorQualityScore: number;
    widgetCompatibilityScore: number;
    locatorRung: number;
    locatorStrategy: string;
  };
}

export interface RuntimeDomResolver {
  resolve(input: {
    task: GroundedStep;
    screen: StepTaskScreenCandidate;
    action: StepAction;
    policy: DomExplorationPolicy;
  }): Promise<{
    candidates: RuntimeDomCandidate[];
    topCandidate: RuntimeDomCandidate | null;
    probes: number;
  }>;
}

export interface RunbookControl {
  kind: 'runbook-control';
  version: 1;
  name: string;
  default?: boolean | undefined;
  selector: ResolutionControlSelector;
  interpreterMode?: RuntimeInterpreterMode | null | undefined;
  dataset?: string | null | undefined;
  resolutionControl?: string | null | undefined;
  translationEnabled?: boolean | undefined;
  translationCacheEnabled?: boolean | undefined;
  providerId?: string | null | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface RuntimeDatasetBinding {
  name: string;
  artifactPath: string;
  isDefault: boolean;
  fixtures: Record<string, unknown>;
  elementDefaults: Record<string, string>;
  generatedTokens: Record<string, string>;
}

export interface RuntimeResolutionControl {
  name: string;
  artifactPath: string;
  stepIndex: number;
  resolution: StepResolution;
  domExplorationPolicy?: DomExplorationPolicy | undefined;
}

export interface RuntimeRunbookControl {
  name: string;
  artifactPath: string;
  isDefault: boolean;
  selector: ResolutionControlSelector;
  interpreterMode?: RuntimeInterpreterMode | null | undefined;
  dataset?: string | null | undefined;
  resolutionControl?: string | null | undefined;
  translationEnabled?: boolean | undefined;
  translationCacheEnabled?: boolean | undefined;
  providerId?: string | null | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface RuntimeControlSession {
  datasets: RuntimeDatasetBinding[];
  resolutionControls: RuntimeResolutionControl[];
  runbooks: RuntimeRunbookControl[];
}

export type OperatorInboxItemKind = 'proposal' | 'degraded-locator' | 'needs-human' | 'blocked-policy' | 'approved-equivalent' | 'recovery';

export interface OperatorInboxItem {
  id: string;
  kind: OperatorInboxItemKind;
  status: 'actionable' | 'approved' | 'blocked' | 'informational';
  title: string;
  summary: string;
  adoId?: AdoId | null | undefined;
  suite?: string | null | undefined;
  runId?: string | null | undefined;
  stepIndex?: number | null | undefined;
  proposalId?: string | null | undefined;
  artifactPath?: string | null | undefined;
  targetPath?: string | null | undefined;
  winningConcern?: WorkflowLane | null | undefined;
  winningSource?: StepWinningSource | null | undefined;
  resolutionMode?: ResolutionMode | null | undefined;
  nextCommands: string[];
}

export interface ApprovalReceipt {
  kind: 'approval-receipt';
  version: 1;
  proposalId: string;
  inboxItemId: string;
  approvedAt: string;
  artifactType: TrustPolicyArtifactType;
  targetPath: string;
  receiptPath: string;
  rerunPlanId: string;
}

export interface RerunPlan {
  kind: 'rerun-plan';
  version: 1;
  planId: string;
  createdAt: string;
  reason: string;
  sourceProposalId?: string | null | undefined;
  sourceNodeIds: string[];
  impactedScenarioIds: AdoId[];
  impactedRunbooks: string[];
  impactedProjections: Array<'emit' | 'graph' | 'types' | 'run'>;
  impactedConfidenceRecords?: string[] | null | undefined;
  reasons: string[];
  explanationFingerprint: string;
  selection: {
    scenarios: Array<{
      id: AdoId;
      why: string[];
      explanations: Array<{
        triggeringChange: string;
        dependencyPath: string[];
        requiredBecause: string;
        fingerprint: string;
      }>;
    }>;
    runbooks: Array<{
      name: string;
      why: string[];
      explanations: Array<{
        triggeringChange: string;
        dependencyPath: string[];
        requiredBecause: string;
        fingerprint: string;
      }>;
    }>;
    projections: Array<{ name: 'emit' | 'graph' | 'types' | 'run'; why: string[] }>;
    confidenceRecords: Array<{ id: string; why: string[] }>;
  };
}

export interface EvidenceRecord {
  evidence: {
    type: string;
    timestamp: string;
    trigger: string;
    observation: Record<string, string>;
    proposal: {
      file: string;
      field: string;
      old_value: string | null;
      new_value: string | null;
    };
    confidence: number;
    risk: 'low' | 'medium' | 'high';
    scope: string;
  };
}


export interface ResolutionCandidateSummary {
  concern: 'action' | 'screen' | 'element' | 'posture' | 'snapshot';
  source:
    | 'explicit'
    | 'control'
    | 'approved-screen-knowledge'
    | 'shared-patterns'
    | 'prior-evidence'
    | 'approved-equivalent-overlay'
    | 'structured-translation'
    | 'live-dom';
  value: string;
  score: number;
  reason: string;
}

export interface ResolutionObservation {
  source:
    | 'approved-screen-knowledge'
    | 'shared-patterns'
    | 'prior-evidence'
    | 'approved-equivalent-overlay'
    | 'structured-translation'
    | 'live-dom'
    | 'runtime';
  summary: string;
  detail?: Record<string, string> | undefined;
  topCandidates?: ResolutionCandidateSummary[] | undefined;
  rejectedCandidates?: ResolutionCandidateSummary[] | undefined;
}

export interface ResolutionExhaustionEntry {
  stage: ResolutionPrecedenceRung;
  outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  reason: string;
  topCandidates?: ResolutionCandidateSummary[] | undefined;
  rejectedCandidates?: ResolutionCandidateSummary[] | undefined;
}

export type ResolutionEvent =
  | { kind: 'exhaustion-recorded'; entry: ResolutionExhaustionEntry }
  | { kind: 'observation-recorded'; observation: ResolutionObservation }
  | { kind: 'refs-collected'; refKind: 'knowledge' | 'supplement' | 'control' | 'evidence'; refs: string[] }
  | { kind: 'memory-updated'; session: ObservedStateSession }
  | { kind: 'receipt-produced'; receipt: ResolutionReceipt };

export interface ResolutionPipelineResult {
  receipt: ResolutionReceipt;
  events: ResolutionEvent[];
}

export interface ResolutionEvidenceDraft {
  type: string;
  trigger: string;
  observation: Record<string, string>;
  proposal: {
    file: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
  };
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  scope: string;
}

export interface ResolutionProposalDraft {
  artifactType: TrustPolicyArtifactType;
  targetPath: string;
  title: string;
  patch: Record<string, unknown>;
  rationale: string;
}

export interface ResolutionGraphTraversalEntry {
  rung: ResolutionPrecedenceRung;
  outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  reason: string;
}

export interface ResolutionGraphCandidate {
  concern: ResolutionCandidateSummary['concern'];
  source: ResolutionCandidateSummary['source'];
  value: string;
  score: {
    raw: number;
    normalized: number;
  };
  reason: string;
  selected: boolean;
}

export interface ResolutionGraphCandidateSet {
  concern: ResolutionCandidateSummary['concern'];
  rung: Exclude<ResolutionPrecedenceRung, 'needs-human'>;
  candidates: ResolutionGraphCandidate[];
}

export interface StepResolutionGraph {
  precedenceTraversal: ResolutionGraphTraversalEntry[];
  candidateSets: ResolutionGraphCandidateSet[];
  winner: {
    rung: ResolutionPrecedenceRung;
    rationale: string;
    losingReasons: string[];
  };
  refs: {
    controlRefs: string[];
    knowledgeRefs: string[];
    supplementRefs: string[];
    evidenceRefs: string[];
  };
  links: {
    translationReceiptRef: string | null;
    domProbeEvidenceRef: string | null;
  };
}

interface ResolutionReceiptBase {
  version: 1;
  stage: 'resolution';
  scope: 'step';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  provider: string;
  mode: string;
  runAt: string;
  stepIndex: number;
  resolutionMode: ResolutionMode;
  knowledgeRefs: string[];
  supplementRefs: string[];
  controlRefs: string[];
  evidenceRefs: string[];
  overlayRefs: string[];
  observations: ResolutionObservation[];
  exhaustion: ResolutionExhaustionEntry[];
  handshakes: WorkflowStage[];
  winningConcern: WorkflowLane;
  winningSource: StepWinningSource;
  translation?: TranslationReceipt | null | undefined;
  resolutionGraph?: StepResolutionGraph | undefined;
  translationCache?: {
    key: string | null;
    status: 'hit' | 'miss' | 'disabled';
    reason: string | null;
  } | undefined;
}

export interface ResolvedReceipt extends ResolutionReceiptBase {
  kind: 'resolved';
  confidence: 'compiler-derived' | 'agent-verified';
  provenanceKind: Extract<StepProvenanceKind, 'explicit' | 'approved-knowledge' | 'live-exploration'>;
  target: ResolutionTarget;
  evidenceDrafts: ResolutionEvidenceDraft[];
  proposalDrafts: ResolutionProposalDraft[];
}

export interface ResolvedWithProposalsReceipt extends ResolutionReceiptBase {
  kind: 'resolved-with-proposals';
  confidence: 'agent-proposed' | 'agent-verified';
  provenanceKind: Extract<StepProvenanceKind, 'approved-knowledge' | 'live-exploration'>;
  target: ResolutionTarget;
  evidenceDrafts: ResolutionEvidenceDraft[];
  proposalDrafts: ResolutionProposalDraft[];
}

export interface NeedsHumanReceipt extends ResolutionReceiptBase {
  kind: 'needs-human';
  confidence: 'unbound';
  provenanceKind: 'unresolved';
  reason: string;
  evidenceDrafts: ResolutionEvidenceDraft[];
  proposalDrafts: ResolutionProposalDraft[];
}

export type ResolutionReceipt = ResolvedReceipt | ResolvedWithProposalsReceipt | NeedsHumanReceipt;
