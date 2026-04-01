import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId, SurfaceId } from '../kernel/identity';
import type { AdoSnapshot } from './intent';

export type Confidence = 'human' | 'agent-verified' | 'agent-proposed' | 'compiler-derived' | 'intent-only' | 'unbound';
export type Governance = 'approved' | 'review-required' | 'blocked';

declare const GovernanceBrand: unique symbol;
export type Approved<T> = T & { readonly [GovernanceBrand]: 'approved' };
export type ReviewRequired<T> = T & { readonly [GovernanceBrand]: 'review-required' };
export type Blocked<T> = T & { readonly [GovernanceBrand]: 'blocked' };
export type Governed<T, G extends Governance> =
  G extends 'approved' ? Approved<T>
    : G extends 'review-required' ? ReviewRequired<T>
      : Blocked<T>;

export function isApproved<T extends { governance: Governance }>(item: T): item is Approved<T> {
  return item.governance === 'approved';
}

export function isBlocked<T extends { governance: Governance }>(item: T): item is Blocked<T> {
  return item.governance === 'blocked';
}

export function isReviewRequired<T extends { governance: Governance }>(item: T): item is ReviewRequired<T> {
  return item.governance === 'review-required';
}

export function requireApproved<T extends { governance: Governance }>(item: T, label = 'artifact'): asserts item is Approved<T> {
  if (item.governance !== 'approved') {
    throw new Error(`Expected ${label} governance to be approved, got ${item.governance}`);
  }
}

/** Auditable governance minting — all governance assignment must flow through these functions. */
export function mintGovernance<G extends Governance>(governance: G): G {
  return governance;
}
export function mintApproved(): 'approved' { return 'approved'; }
export function mintReviewRequired(): 'review-required' { return 'review-required'; }
export function mintBlocked(): 'blocked' { return 'blocked'; }

export function foldGovernance<T extends { governance: Governance }, R>(
  item: T,
  cases: { approved: (item: Approved<T>) => R; reviewRequired: (item: ReviewRequired<T>) => R; blocked: (item: Blocked<T>) => R },
): R {
  switch (item.governance) {
    case 'approved': return cases.approved(item as Approved<T>);
    case 'review-required': return cases.reviewRequired(item as ReviewRequired<T>);
    case 'blocked': return cases.blocked(item as Blocked<T>);
  }
}
export type CertificationStatus = 'uncertified' | 'certified';
export type StepProvenanceKind = 'explicit' | 'approved-knowledge' | 'live-exploration' | 'agent-interpreted' | 'unresolved';
export type ScenarioStatus = 'stub' | 'draft' | 'active' | 'needs-repair' | 'blocked' | 'deprecated';
export type StepAction = 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
export type DiagnosticSeverity = 'info' | 'warn' | 'error';
export type RuntimeInterpreterMode = 'playwright' | 'dry-run' | 'diagnostic';
export type ExecutionProfile = 'interactive' | 'ci-batch' | 'dogfood';
export type WriteMode = 'persist' | 'no-write';
export type WorkflowLane = 'intent' | 'knowledge' | 'control' | 'resolution' | 'execution' | 'governance' | 'projection';
export type WorkflowStage = 'preparation' | 'resolution' | 'execution' | 'evidence' | 'proposal' | 'projection';
export type WorkflowScope = 'scenario' | 'step' | 'run' | 'suite' | 'workspace' | 'control';
export type ResolutionMode = 'deterministic' | 'translation' | 'agentic';
export type StepWinningSource =
  | 'scenario-explicit'
  | 'resolution-control'
  | 'runbook-dataset'
  | 'default-dataset'
  | 'knowledge-hint'
  | 'posture-sample'
  | 'generated-token'
  | 'approved-knowledge'
  | 'approved-equivalent'
  | 'prior-evidence'
  | 'semantic-dictionary'
  | 'structured-translation'
  | 'live-dom'
  | 'agent-interpreted'
  | 'none';
export type PatternActionName = 'navigate' | 'input' | 'click' | 'assert-snapshot';
export type ScenarioLifecycle = 'normal' | 'fixme' | 'skip' | 'fail';
export type StepBindingKind = 'bound' | 'deferred' | 'unbound';
export type EffectState = 'validation-error' | 'required-error' | 'disabled' | 'enabled' | 'visible' | 'hidden';

export type SurfaceKind =
  | 'screen-root'
  | 'form'
  | 'action-cluster'
  | 'validation-region'
  | 'result-set'
  | 'details-pane'
  | 'modal'
  | 'section-root';

export type AssertionKind = 'state' | 'structure';
export type CapabilityName = 'navigate' | 'enter' | 'invoke' | 'observe-structure' | 'observe-state' | 'custom-escape-hatch';

export type EffectTargetKind = 'self' | 'element' | 'surface';
export type LocatorStrategyKind = 'test-id' | 'role-name' | 'css';

export interface WorkflowEnvelopeIds {
  readonly adoId?: AdoId | null | undefined;
  readonly suite?: string | null | undefined;
  readonly sessionId?: string | null | undefined;
  readonly runId?: string | null | undefined;
  readonly stepIndex?: number | null | undefined;
  readonly dataset?: string | null | undefined;
  readonly runbook?: string | null | undefined;
  readonly resolutionControl?: string | null | undefined;
  readonly participantIds?: readonly string[] | undefined;
  readonly interventionIds?: readonly string[] | undefined;
  readonly improvementRunId?: string | null | undefined;
  readonly iteration?: number | null | undefined;
  readonly parentExperimentId?: string | null | undefined;
}

export interface WorkflowEnvelopeFingerprints {
  readonly artifact: string;
  readonly content?: string | null | undefined;
  readonly knowledge?: string | null | undefined;
  readonly controls?: string | null | undefined;
  readonly task?: string | null | undefined;
  readonly run?: string | null | undefined;
}

export interface WorkflowEnvelopeLineage {
  readonly sources: readonly string[];
  readonly parents: readonly string[];
  readonly handshakes: readonly WorkflowStage[];
  readonly experimentIds?: readonly string[] | undefined;
}

export interface WorkflowEnvelope<TPayload> {
  readonly version: 1;
  readonly stage: WorkflowStage;
  readonly scope: WorkflowScope;
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: TPayload;
}

export type PayloadOf<T> = T extends WorkflowEnvelope<infer P> ? P : never;
export type ApprovedEnvelope<T> = Approved<WorkflowEnvelope<T>>;
export type BlockedEnvelope<T> = Blocked<WorkflowEnvelope<T>>;

export function mapPayload<A, B>(
  envelope: WorkflowEnvelope<A>,
  f: (payload: A) => B,
): WorkflowEnvelope<B> {
  return { ...envelope, payload: f(envelope.payload) };
}

export interface ExecutionPosture {
  readonly interpreterMode: RuntimeInterpreterMode;
  readonly writeMode: WriteMode;
  readonly headed: boolean;
  readonly executionProfile: ExecutionProfile;
}

// ─── Knowledge Posture ───
//
// Controls which tiers of content the workspace catalog loads:
//
//   cold-start  — Problem statement only (Tier 1). No pre-existing knowledge.
//                 Tests the system's ability to discover and learn from scratch.
//   warm-start  — Full canonical knowledge included (Tier 1 + Tier 2).
//                 Tests the compiler and resolution pipeline given known screens.
//   production  — Same runtime behavior as warm-start, but all artifacts
//                 (including generated output) are version-controlled.
//
// Tier 1 (problem statement): .ado-sync/, scenarios/, controls/, benchmarks/, fixtures/
// Tier 2 (learned knowledge): knowledge/screens/, knowledge/patterns/, knowledge/surfaces/,
//         knowledge/snapshots/, knowledge/components/, knowledge/routes/

export type KnowledgePosture = 'cold-start' | 'warm-start' | 'production';

/**
 * Exhaustive fold over KnowledgePosture — forces callers to handle all three cases.
 */
export function foldKnowledgePosture<R>(
  posture: KnowledgePosture,
  handlers: {
    readonly coldStart: () => R;
    readonly warmStart: () => R;
    readonly production: () => R;
  },
): R {
  switch (posture) {
    case 'cold-start': return handlers.coldStart();
    case 'warm-start': return handlers.warmStart();
    case 'production': return handlers.production();
  }
}

/**
 * Whether the given posture includes pre-existing knowledge (Tier 2).
 * cold-start excludes it; warm-start and production include it.
 */
export function postureIncludesKnowledge(posture: KnowledgePosture): boolean {
  return foldKnowledgePosture(posture, {
    coldStart: () => false,
    warmStart: () => true,
    production: () => true,
  });
}

export interface WriteJournalEntry {
  readonly path: string;
  readonly operation: 'write-text' | 'write-json' | 'ensure-dir' | 'remove-dir';
  readonly serialized: string | null;
}

export type LocatorStrategy =
  | { kind: 'test-id'; value: string }
  | { kind: 'role-name'; role: string; name?: string | null | undefined }
  | { kind: 'css'; value: string };

export type TrustPolicyArtifactType = 'elements' | 'postures' | 'surface' | 'snapshot' | 'hints' | 'patterns' | 'routes';
export type TrustPolicyDecision = 'allow' | 'review' | 'deny';

export interface TrustPolicyEvidenceRule {
  readonly minCount: number;
  readonly kinds: readonly string[];
}

export interface TrustPolicyArtifactRule {
  readonly minimumConfidence: number;
  readonly requiredEvidence: TrustPolicyEvidenceRule;
}

export interface TrustPolicy {
  readonly version: 1;
  readonly artifactTypes: Readonly<Record<TrustPolicyArtifactType, TrustPolicyArtifactRule>>;
  readonly forbiddenAutoHealClasses: readonly string[];
}

export interface ProposedChangeMetadata {
  readonly artifactType: TrustPolicyArtifactType;
  readonly confidence: number;
  readonly autoHealClass?: string | null | undefined;
}

export interface EvidenceDescriptor {
  readonly kind: string;
}

export interface TrustPolicyEvaluationReason {
  readonly code: 'minimum-confidence' | 'required-evidence' | 'forbidden-auto-heal';
  readonly message: string;
}

export interface TrustPolicyEvaluation {
  readonly decision: TrustPolicyDecision;
  readonly reasons: readonly TrustPolicyEvaluationReason[];
}

// ─── WP5: Auto-Approval Policy ───

export interface AutoApprovalPolicy {
  readonly enabled: boolean;
  readonly profile: ExecutionProfile;
  readonly forbiddenHealClasses: readonly string[];
  readonly thresholdOverrides: Readonly<Record<string, number>>;
}

export interface AutoApprovalResult {
  readonly approved: boolean;
  readonly reason: string;
}

export interface CanonicalLineage {
  readonly runIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly sourceArtifactPaths: readonly string[];
  readonly role?: string | null | undefined;
  readonly state?: string | null | undefined;
  readonly driftSeed?: string | null | undefined;
}

export interface CanonicalKnowledgeMetadata {
  readonly certification: CertificationStatus;
  readonly activatedAt: string;
  readonly certifiedAt?: string | null | undefined;
  readonly lineage: CanonicalLineage;
}

export interface ProposalActivation {
  readonly status: 'pending' | 'activated' | 'blocked';
  readonly activatedAt?: string | null | undefined;
  readonly certifiedAt?: string | null | undefined;
  readonly reason?: string | null | undefined;
}

export interface DiagnosticProvenance {
  readonly sourceRevision?: number | undefined;
  readonly contentHash?: string | undefined;
  readonly scenarioPath?: string | undefined;
  readonly snapshotPath?: string | undefined;
  readonly knowledgePath?: string | undefined;
  readonly confidence?: Confidence | 'mixed' | undefined;
}

export interface CompilerDiagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly adoId: AdoId;
  readonly stepIndex?: number | undefined;
  readonly artifactPath?: string | undefined;
  readonly provenance: DiagnosticProvenance;
}

export interface DerivedCapability {
  readonly id: string;
  readonly targetKind: 'screen' | 'surface' | 'element';
  readonly target: ScreenId | SurfaceId | ElementId;
  readonly operations: readonly CapabilityName[];
  readonly provenance: DiagnosticProvenance;
}

export interface ManifestEntry {
  readonly adoId: AdoId;
  readonly revision: number;
  readonly contentHash: string;
  readonly syncedAt: string;
  readonly sourcePath: string;
}

export interface Manifest {
  readonly entries: Readonly<Record<string, ManifestEntry>>;
}

export interface SyncResult {
  readonly manifest: Manifest;
  readonly snapshots: readonly AdoSnapshot[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export interface CaptureResult {
  readonly snapshotPath: string;
  readonly hashPath: string;
  readonly hash: string;
  readonly snapshot: string;
}

// ─── N1.8: Knowledge Coverage as Scorecard Metric ───

export interface KnowledgeCoverageMetrics {
  readonly totalScreens: number;
  readonly coveredScreens: number;
  readonly thinScreens: number;
  readonly screenCoverageRate: number;
  readonly totalActionFamilies: number;
  readonly coveredActionFamilies: number;
  readonly thinActionFamilies: number;
  readonly actionFamilyCoverageRate: number;
}

export interface ResolutionTarget {
  readonly action: StepAction;
  readonly screen: ScreenId;
  readonly element?: ElementId | null | undefined;
  readonly posture?: PostureId | null | undefined;
  readonly override?: string | null | undefined;
  readonly snapshot_template?: SnapshotTemplateId | null | undefined;
  /** Semantic destination hint for navigate actions (e.g., "policy search / tab=open"). */
  readonly semanticDestination?: string | null | undefined;
  /** Route variant ref selected during route planning, if available. */
  readonly routeVariantRef?: string | null | undefined;
  /** Optional route-state request used for pre-navigation (tab/query/hash/etc). */
  readonly routeState?: Readonly<Record<string, string>> | null | undefined;
}
