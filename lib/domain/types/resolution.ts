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
  readonly kind: 'screen' | 'element' | 'posture' | 'snapshot-template';
  readonly target: string;
  readonly screen?: ScreenId | null | undefined;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly snapshotTemplate?: SnapshotTemplateId | null | undefined;
  readonly aliases: readonly string[];
  readonly score: number;
  readonly sourceRefs: readonly string[];
}

export interface TranslationRequest {
  readonly version: 1;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly controlsFingerprint: string | null;
  readonly normalizedIntent: string;
  readonly actionText: string;
  readonly expectedText: string;
  readonly allowedActions: readonly StepAction[];
  readonly screens: ReadonlyArray<{
    readonly screen: ScreenId;
    readonly aliases: readonly string[];
    readonly elements: ReadonlyArray<{
      readonly element: ElementId;
      readonly aliases: readonly string[];
      readonly postures: readonly PostureId[];
      readonly snapshotTemplates: readonly SnapshotTemplateId[];
    }>;
  }>;
  readonly evidenceRefs: readonly string[];
  readonly overlayRefs: readonly string[];
}

export interface TranslationReceipt {
  readonly kind: 'translation-receipt';
  readonly version: 1;
  readonly mode: 'structured-translation';
  readonly matched: boolean;
  readonly selected: TranslationCandidate | null;
  readonly candidates: readonly TranslationCandidate[];
  readonly rationale: string;
  readonly translationProvider?: string | undefined;
  readonly cache?: {
    readonly key: string;
    readonly status: 'hit' | 'miss' | 'disabled';
    readonly reason?: string | null | undefined;
  } | undefined;
  readonly failureClass?: 'none' | 'no-candidate' | 'runtime-disabled' | 'cache-disabled' | 'cache-miss' | 'cache-invalidated' | 'translator-error' | undefined;
}

export interface ResolutionEngineCapabilities {
  readonly supportsTranslation: boolean;
  readonly supportsDom: boolean;
  readonly supportsProposalDrafts: boolean;
  readonly deterministicMode: boolean;
}

export interface TaskArtifactRef {
  readonly fingerprint: string | null;
  readonly artifactPath: string | null;
}

export interface ScenarioKnowledgeSlice {
  readonly routeRefs: readonly string[];
  readonly routeVariantRefs: readonly string[];
  readonly screenRefs: readonly ScreenId[];
  readonly targetRefs: readonly CanonicalTargetRef[];
  readonly stateRefs: readonly StateNodeRef[];
  readonly eventSignatureRefs: readonly EventSignatureRef[];
  readonly transitionRefs: readonly TransitionRef[];
  readonly evidenceRefs: readonly string[];
  readonly controlRefs: readonly string[];
}

export interface StepGrounding {
  readonly targetRefs: readonly CanonicalTargetRef[];
  readonly selectorRefs: readonly SelectorRef[];
  readonly fallbackSelectorRefs: readonly SelectorRef[];
  readonly routeVariantRefs: readonly string[];
  readonly assertionAnchors: readonly string[];
  readonly effectAssertions: readonly string[];
  readonly requiredStateRefs: readonly StateNodeRef[];
  readonly forbiddenStateRefs: readonly StateNodeRef[];
  readonly eventSignatureRefs: readonly EventSignatureRef[];
  readonly expectedTransitionRefs: readonly TransitionRef[];
  readonly resultStateRefs: readonly StateNodeRef[];
}

export interface GroundedStep {
  readonly index: number;
  readonly intent: string;
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  readonly allowedActions: readonly StepAction[];
  readonly explicitResolution: StepResolution | null;
  readonly controlResolution: StepResolution | null;
  readonly grounding: StepGrounding;
  readonly stepFingerprint: string;
  readonly taskFingerprint: string;
}

export interface ScenarioInterpretationSurface {
  readonly kind: 'scenario-interpretation-surface';
  readonly version: 1;
  readonly stage: 'preparation';
  readonly scope: 'scenario';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: {
    readonly adoId: AdoId;
    readonly revision: number;
    readonly title: string;
    readonly suite: string;
    readonly knowledgeFingerprint: string;
    readonly interface: TaskArtifactRef;
    readonly selectors: TaskArtifactRef;
    readonly stateGraph: TaskArtifactRef;
    readonly knowledgeSlice: ScenarioKnowledgeSlice;
    readonly steps: readonly GroundedStep[];
    readonly resolutionContext: InterfaceResolutionContext;
  };
  readonly surfaceFingerprint: string;
}

export interface ScenarioRunPlan {
  readonly kind: 'scenario-run-plan';
  readonly version: 1;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly surfaceFingerprint: string;
  readonly title: string;
  readonly suite: string;
  readonly controlsFingerprint: string | null;
  readonly posture: ExecutionPosture;
  readonly mode: RuntimeInterpreterMode;
  readonly providerId: string;
  readonly controlSelection: {
    readonly runbook?: string | null | undefined;
    readonly dataset?: string | null | undefined;
    readonly resolutionControl?: string | null | undefined;
  };
  readonly controlArtifactPaths: {
    readonly runbook?: string | null | undefined;
    readonly dataset?: string | null | undefined;
  };
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly screenIds: readonly ScreenId[];
  readonly steps: readonly GroundedStep[];
  readonly resolutionContext: InterfaceResolutionContext;
  readonly context: {
    readonly adoId: AdoId;
    readonly revision: number;
    readonly contentHash: string;
    readonly artifactPath?: string | undefined;
  };
  readonly translationEnabled: boolean;
  readonly translationCacheEnabled: boolean;
  readonly recoveryPolicy?: RecoveryPolicy | undefined;
}

/** @deprecated Use `ScenarioInterpretationSurface`. */
export interface ScenarioTaskPacket {
  readonly kind: 'scenario-task-packet';
  readonly version: 5;
  readonly stage: 'preparation';
  readonly scope: 'scenario';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: {
    readonly adoId: AdoId;
    readonly revision: number;
    readonly title: string;
    readonly suite: string;
    readonly knowledgeFingerprint: string;
    readonly interface: TaskArtifactRef;
    readonly selectors: TaskArtifactRef;
    readonly stateGraph: TaskArtifactRef;
    readonly knowledgeSlice: ScenarioKnowledgeSlice;
    readonly steps: readonly GroundedStep[];
  };
  readonly taskFingerprint: string;
}

export interface ObservedStateSessionScreenState {
  readonly screen: ScreenId;
  readonly confidence: number;
  readonly observedAtStep: number;
}

export interface ObservedStateSessionAssertion {
  readonly summary: string;
  readonly observedAtStep: number;
}

export interface CausalLink {
  readonly stepIndex: number;
  readonly firedTransitionRef: TransitionRef;
  readonly targetStateRef: StateNodeRef;
  readonly relevantForSteps: readonly number[];
}

export interface ObservedStateSession {
  readonly currentScreen: ObservedStateSessionScreenState | null;
  readonly activeStateRefs: readonly StateNodeRef[];
  readonly lastObservedTransitionRefs: readonly TransitionRef[];
  readonly activeRouteVariantRefs: readonly string[];
  readonly activeTargetRefs: readonly CanonicalTargetRef[];
  readonly lastSuccessfulLocatorRung: number | null;
  readonly recentAssertions: readonly ObservedStateSessionAssertion[];
  readonly causalLinks: readonly CausalLink[];
  readonly lineage: readonly string[];
}

export interface DatasetControl {
  readonly kind: 'dataset-control';
  readonly version: 1;
  readonly name: string;
  readonly default?: boolean | undefined;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly defaults?: {
    readonly elements?: Readonly<Record<string, string>> | undefined;
    readonly generatedTokens?: Readonly<Record<string, string>> | undefined;
  } | undefined;
}

export interface ResolutionControlSelector {
  readonly adoIds: readonly AdoId[];
  readonly suites: readonly string[];
  readonly tags: readonly string[];
}

export interface ResolutionControlStep {
  readonly stepIndex: number;
  readonly resolution: StepResolution;
}

export interface ResolutionControl {
  readonly kind: 'resolution-control';
  readonly version: 1;
  readonly name: string;
  readonly selector: ResolutionControlSelector;
  readonly domExplorationPolicy?: DomExplorationPolicy | undefined;
  readonly steps: readonly ResolutionControlStep[];
}

export interface DomExplorationPolicy {
  readonly maxCandidates: number;
  readonly maxProbes: number;
  readonly forbiddenActions: readonly StepAction[];
}

export interface RuntimeDomCandidate {
  readonly element: StepTaskElementCandidate;
  readonly score: number;
  readonly evidence: {
    readonly visibleCount: number;
    readonly roleNameScore: number;
    readonly locatorQualityScore: number;
    readonly widgetCompatibilityScore: number;
    readonly locatorRung: number;
    readonly locatorStrategy: string;
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
  readonly kind: 'runbook-control';
  readonly version: 1;
  readonly name: string;
  readonly default?: boolean | undefined;
  readonly selector: ResolutionControlSelector;
  readonly interpreterMode?: RuntimeInterpreterMode | null | undefined;
  readonly dataset?: string | null | undefined;
  readonly resolutionControl?: string | null | undefined;
  readonly translationEnabled?: boolean | undefined;
  readonly translationCacheEnabled?: boolean | undefined;
  readonly providerId?: string | null | undefined;
  readonly recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface RuntimeDatasetBinding {
  readonly name: string;
  readonly artifactPath: string;
  readonly isDefault: boolean;
  readonly fixtures: Readonly<Record<string, unknown>>;
  readonly elementDefaults: Readonly<Record<string, string>>;
  readonly generatedTokens: Readonly<Record<string, string>>;
}

export interface RuntimeResolutionControl {
  readonly name: string;
  readonly artifactPath: string;
  readonly stepIndex: number;
  readonly resolution: StepResolution;
  readonly domExplorationPolicy?: DomExplorationPolicy | undefined;
}

export interface RuntimeRunbookControl {
  readonly name: string;
  readonly artifactPath: string;
  readonly isDefault: boolean;
  readonly selector: ResolutionControlSelector;
  readonly interpreterMode?: RuntimeInterpreterMode | null | undefined;
  readonly dataset?: string | null | undefined;
  readonly resolutionControl?: string | null | undefined;
  readonly translationEnabled?: boolean | undefined;
  readonly translationCacheEnabled?: boolean | undefined;
  readonly providerId?: string | null | undefined;
  readonly recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface RuntimeControlSession {
  readonly datasets: readonly RuntimeDatasetBinding[];
  readonly resolutionControls: readonly RuntimeResolutionControl[];
  readonly runbooks: readonly RuntimeRunbookControl[];
}

export type OperatorInboxItemKind = 'proposal' | 'degraded-locator' | 'needs-human' | 'blocked-policy' | 'approved-equivalent' | 'recovery';

export interface OperatorInboxItem {
  readonly id: string;
  readonly kind: OperatorInboxItemKind;
  readonly status: 'actionable' | 'approved' | 'blocked' | 'informational';
  readonly title: string;
  readonly summary: string;
  readonly adoId?: AdoId | null | undefined;
  readonly suite?: string | null | undefined;
  readonly runId?: string | null | undefined;
  readonly stepIndex?: number | null | undefined;
  readonly proposalId?: string | null | undefined;
  readonly artifactPath?: string | null | undefined;
  readonly targetPath?: string | null | undefined;
  readonly winningConcern?: WorkflowLane | null | undefined;
  readonly winningSource?: StepWinningSource | null | undefined;
  readonly resolutionMode?: ResolutionMode | null | undefined;
  readonly nextCommands: readonly string[];
}

export interface ApprovalReceipt {
  readonly kind: 'approval-receipt';
  readonly version: 1;
  readonly proposalId: string;
  readonly inboxItemId: string;
  readonly approvedAt: string;
  readonly artifactType: TrustPolicyArtifactType;
  readonly targetPath: string;
  readonly receiptPath: string;
  readonly rerunPlanId: string;
}

export interface RerunPlan {
  readonly kind: 'rerun-plan';
  readonly version: 1;
  readonly planId: string;
  readonly createdAt: string;
  readonly reason: string;
  readonly sourceProposalId?: string | null | undefined;
  readonly sourceNodeIds: readonly string[];
  readonly impactedScenarioIds: readonly AdoId[];
  readonly impactedRunbooks: readonly string[];
  readonly impactedProjections: ReadonlyArray<'emit' | 'graph' | 'types' | 'run'>;
  readonly impactedConfidenceRecords?: readonly string[] | null | undefined;
  readonly reasons: readonly string[];
  readonly explanationFingerprint: string;
  readonly selection: {
    readonly scenarios: ReadonlyArray<{
      readonly id: AdoId;
      readonly why: readonly string[];
      readonly explanations: ReadonlyArray<{
        readonly triggeringChange: string;
        readonly dependencyPath: readonly string[];
        readonly requiredBecause: string;
        readonly fingerprint: string;
      }>;
    }>;
    readonly runbooks: ReadonlyArray<{
      readonly name: string;
      readonly why: readonly string[];
      readonly explanations: ReadonlyArray<{
        readonly triggeringChange: string;
        readonly dependencyPath: readonly string[];
        readonly requiredBecause: string;
        readonly fingerprint: string;
      }>;
    }>;
    readonly projections: ReadonlyArray<{ readonly name: 'emit' | 'graph' | 'types' | 'run'; readonly why: readonly string[] }>;
    readonly confidenceRecords: ReadonlyArray<{ readonly id: string; readonly why: readonly string[] }>;
  };
}

export interface EvidenceRecord {
  readonly evidence: {
    readonly type: string;
    readonly timestamp: string;
    readonly trigger: string;
    readonly observation: Readonly<Record<string, string>>;
    readonly proposal: {
      readonly file: string;
      readonly field: string;
      readonly old_value: string | null;
      readonly new_value: string | null;
    };
    readonly confidence: number;
    readonly risk: 'low' | 'medium' | 'high';
    readonly scope: string;
  };
}


export interface ResolutionCandidateSummary {
  readonly concern: 'action' | 'screen' | 'element' | 'posture' | 'snapshot';
  readonly source:
    | 'explicit'
    | 'control'
    | 'approved-screen-knowledge'
    | 'shared-patterns'
    | 'prior-evidence'
    | 'approved-equivalent-overlay'
    | 'structured-translation'
    | 'live-dom';
  readonly value: string;
  readonly score: number;
  readonly reason: string;
}

export interface ResolutionObservation {
  readonly source:
    | 'approved-screen-knowledge'
    | 'shared-patterns'
    | 'prior-evidence'
    | 'approved-equivalent-overlay'
    | 'structured-translation'
    | 'live-dom'
    | 'runtime';
  readonly summary: string;
  readonly detail?: Readonly<Record<string, string>> | undefined;
  readonly topCandidates?: readonly ResolutionCandidateSummary[] | undefined;
  readonly rejectedCandidates?: readonly ResolutionCandidateSummary[] | undefined;
}

export interface ResolutionExhaustionEntry {
  readonly stage: ResolutionPrecedenceRung;
  readonly outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  readonly reason: string;
  readonly topCandidates?: readonly ResolutionCandidateSummary[] | undefined;
  readonly rejectedCandidates?: readonly ResolutionCandidateSummary[] | undefined;
}

export type ResolutionEvent =
  | { readonly kind: 'exhaustion-recorded'; readonly entry: ResolutionExhaustionEntry }
  | { readonly kind: 'observation-recorded'; readonly observation: ResolutionObservation }
  | { readonly kind: 'refs-collected'; readonly refKind: 'knowledge' | 'supplement' | 'control' | 'evidence'; readonly refs: readonly string[] }
  | { readonly kind: 'memory-updated'; readonly session: ObservedStateSession }
  | { readonly kind: 'receipt-produced'; readonly receipt: ResolutionReceipt };

export interface ResolutionPipelineResult {
  readonly receipt: ResolutionReceipt;
  readonly events: readonly ResolutionEvent[];
}

export interface ResolutionEvidenceDraft {
  readonly type: string;
  readonly trigger: string;
  readonly observation: Readonly<Record<string, string>>;
  readonly proposal: {
    readonly file: string;
    readonly field: string;
    readonly old_value: string | null;
    readonly new_value: string | null;
  };
  readonly confidence: number;
  readonly risk: 'low' | 'medium' | 'high';
  readonly scope: string;
}

export interface ResolutionProposalDraft {
  readonly artifactType: TrustPolicyArtifactType;
  readonly targetPath: string;
  readonly title: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly rationale: string;
}

export interface ResolutionGraphTraversalEntry {
  readonly rung: ResolutionPrecedenceRung;
  readonly outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  readonly reason: string;
}

export interface ResolutionGraphCandidate {
  readonly concern: ResolutionCandidateSummary['concern'];
  readonly source: ResolutionCandidateSummary['source'];
  readonly value: string;
  readonly score: {
    readonly raw: number;
    readonly normalized: number;
  };
  readonly reason: string;
  readonly selected: boolean;
}

export interface ResolutionGraphCandidateSet {
  readonly concern: ResolutionCandidateSummary['concern'];
  readonly rung: Exclude<ResolutionPrecedenceRung, 'needs-human'>;
  readonly candidates: readonly ResolutionGraphCandidate[];
}

export interface StepResolutionGraph {
  readonly precedenceTraversal: readonly ResolutionGraphTraversalEntry[];
  readonly candidateSets: readonly ResolutionGraphCandidateSet[];
  readonly winner: {
    readonly rung: ResolutionPrecedenceRung;
    readonly rationale: string;
    readonly losingReasons: readonly string[];
  };
  readonly refs: {
    readonly controlRefs: readonly string[];
    readonly knowledgeRefs: readonly string[];
    readonly supplementRefs: readonly string[];
    readonly evidenceRefs: readonly string[];
  };
  readonly links: {
    readonly translationReceiptRef: string | null;
    readonly domProbeEvidenceRef: string | null;
  };
}

interface ResolutionReceiptBase {
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'step';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly provider: string;
  readonly mode: string;
  readonly runAt: string;
  readonly stepIndex: number;
  readonly resolutionMode: ResolutionMode;
  readonly knowledgeRefs: readonly string[];
  readonly supplementRefs: readonly string[];
  readonly controlRefs: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly overlayRefs: readonly string[];
  readonly observations: readonly ResolutionObservation[];
  readonly exhaustion: readonly ResolutionExhaustionEntry[];
  readonly handshakes: readonly WorkflowStage[];
  readonly winningConcern: WorkflowLane;
  readonly winningSource: StepWinningSource;
  readonly translation?: TranslationReceipt | null | undefined;
  readonly resolutionGraph?: StepResolutionGraph | undefined;
  readonly translationCache?: {
    readonly key: string | null;
    readonly status: 'hit' | 'miss' | 'disabled';
    readonly reason: string | null;
  } | undefined;
}

export interface ResolvedReceipt extends ResolutionReceiptBase {
  readonly kind: 'resolved';
  readonly confidence: 'compiler-derived' | 'agent-verified';
  readonly provenanceKind: Extract<StepProvenanceKind, 'explicit' | 'approved-knowledge' | 'live-exploration'>;
  readonly target: ResolutionTarget;
  readonly evidenceDrafts: readonly ResolutionEvidenceDraft[];
  readonly proposalDrafts: readonly ResolutionProposalDraft[];
}

export interface ResolvedWithProposalsReceipt extends ResolutionReceiptBase {
  readonly kind: 'resolved-with-proposals';
  readonly confidence: 'agent-proposed' | 'agent-verified';
  readonly provenanceKind: Extract<StepProvenanceKind, 'approved-knowledge' | 'live-exploration'>;
  readonly target: ResolutionTarget;
  readonly evidenceDrafts: readonly ResolutionEvidenceDraft[];
  readonly proposalDrafts: readonly ResolutionProposalDraft[];
}

export interface NeedsHumanReceipt extends ResolutionReceiptBase {
  readonly kind: 'needs-human';
  readonly confidence: 'unbound';
  readonly provenanceKind: 'unresolved';
  readonly reason: string;
  readonly evidenceDrafts: readonly ResolutionEvidenceDraft[];
  readonly proposalDrafts: readonly ResolutionProposalDraft[];
}

export type ResolutionReceipt = ResolvedReceipt | ResolvedWithProposalsReceipt | NeedsHumanReceipt;
