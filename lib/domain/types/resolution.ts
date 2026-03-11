import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../identity';
import type { StepTaskElementCandidate, StepTaskScreenCandidate } from './knowledge';
import type {
  Governance,
  ResolutionMode,
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
import type { ArtifactConfidenceRecord, RuntimeKnowledgeSession } from './knowledge';

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
  cache?: {
    key: string;
    status: 'hit' | 'miss' | 'disabled';
    reason?: string | null | undefined;
  } | undefined;
  failureClass?: 'none' | 'no-candidate' | 'runtime-disabled' | 'cache-disabled' | 'cache-miss' | 'cache-invalidated' | 'translator-error' | undefined;
}

export interface RuntimeProviderCapabilities {
  supportsTranslation: boolean;
  supportsDom: boolean;
  supportsProposalDrafts: boolean;
  deterministicMode: boolean;
}

export interface StepTask {
  index: number;
  intent: string;
  actionText: string;
  expectedText: string;
  normalizedIntent: string;
  allowedActions: StepAction[];
  explicitResolution: StepResolution | null;
  controlResolution: StepResolution | null;
  knowledgeRef?: 'scenario' | string | null | undefined;
  runtimeKnowledge?: RuntimeKnowledgeSession | undefined;
  taskFingerprint: string;
}

export interface ScenarioTaskPacket {
  kind: 'scenario-task-packet';
  version: 1 | 2;
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
    runtimeKnowledgeSession?: RuntimeKnowledgeSession | undefined;
    steps: StepTask[];
  };
  adoId: AdoId;
  revision: number;
  title: string;
  suite: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  runtimeKnowledgeSession?: RuntimeKnowledgeSession | undefined;
  steps: StepTask[];
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
  forbiddenActions: import('./workflow').StepAction[];
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
    task: StepTask;
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
}

export interface RuntimeControlSession {
  datasets: RuntimeDatasetBinding[];
  resolutionControls: RuntimeResolutionControl[];
  runbooks: RuntimeRunbookControl[];
}

export type OperatorInboxItemKind = 'proposal' | 'degraded-locator' | 'needs-human' | 'blocked-policy' | 'approved-equivalent';

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
  source: 'explicit' | 'control' | 'approved-knowledge' | 'overlay' | 'translation' | 'live-dom';
  value: string;
  score: number;
  reason: string;
}

export interface ResolutionObservation {
  source: 'knowledge' | 'evidence' | 'overlay' | 'translation' | 'dom' | 'runtime';
  summary: string;
  detail?: Record<string, string> | undefined;
  topCandidates?: ResolutionCandidateSummary[] | undefined;
  rejectedCandidates?: ResolutionCandidateSummary[] | undefined;
}

export interface ResolutionExhaustionEntry {
  stage:
    | 'explicit'
    | 'approved-screen-bundle'
    | 'local-hints'
    | 'shared-patterns'
    | 'prior-evidence'
    | 'confidence-overlay'
    | 'structured-translation'
    | 'live-dom'
    | 'safe-degraded-resolution';
  outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  reason: string;
  topCandidates?: ResolutionCandidateSummary[] | undefined;
  rejectedCandidates?: ResolutionCandidateSummary[] | undefined;
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
  target: import('./workflow').ResolutionTarget;
  evidenceDrafts: ResolutionEvidenceDraft[];
  proposalDrafts: ResolutionProposalDraft[];
}

export interface ResolvedWithProposalsReceipt extends ResolutionReceiptBase {
  kind: 'resolved-with-proposals';
  confidence: 'agent-proposed' | 'agent-verified';
  provenanceKind: Extract<StepProvenanceKind, 'approved-knowledge' | 'live-exploration'>;
  target: import('./workflow').ResolutionTarget;
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
