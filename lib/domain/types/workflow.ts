import type { AdoId, ElementId, PostureId, ScreenId, SnapshotTemplateId, SurfaceId } from '../identity';

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
export type StepProvenanceKind = 'explicit' | 'approved-knowledge' | 'live-exploration' | 'unresolved';
export type ScenarioStatus = 'stub' | 'draft' | 'active' | 'needs-repair' | 'blocked' | 'deprecated';
export type StepAction = 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
export type DiagnosticSeverity = 'info' | 'warn' | 'error';
export type RuntimeInterpreterMode = 'playwright' | 'dry-run' | 'diagnostic';
export type ExecutionProfile = 'interactive' | 'ci-batch';
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
  | 'structured-translation'
  | 'live-dom'
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
  adoId?: AdoId | null | undefined;
  suite?: string | null | undefined;
  runId?: string | null | undefined;
  stepIndex?: number | null | undefined;
  dataset?: string | null | undefined;
  runbook?: string | null | undefined;
  resolutionControl?: string | null | undefined;
}

export interface WorkflowEnvelopeFingerprints {
  artifact: string;
  content?: string | null | undefined;
  knowledge?: string | null | undefined;
  controls?: string | null | undefined;
  task?: string | null | undefined;
  run?: string | null | undefined;
}

export interface WorkflowEnvelopeLineage {
  sources: string[];
  parents: string[];
  handshakes: WorkflowStage[];
}

export interface WorkflowEnvelope<TPayload> {
  version: 1;
  stage: WorkflowStage;
  scope: WorkflowScope;
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: TPayload;
}

export function mapPayload<A, B>(
  envelope: WorkflowEnvelope<A>,
  f: (payload: A) => B,
): WorkflowEnvelope<B> {
  return { ...envelope, payload: f(envelope.payload) };
}

export interface ExecutionPosture {
  interpreterMode: RuntimeInterpreterMode;
  writeMode: WriteMode;
  headed: boolean;
  executionProfile: ExecutionProfile;
}

export interface WriteJournalEntry {
  path: string;
  operation: 'write-text' | 'write-json' | 'ensure-dir';
  serialized: string | null;
}

export type LocatorStrategy =
  | { kind: 'test-id'; value: string }
  | { kind: 'role-name'; role: string; name?: string | null | undefined }
  | { kind: 'css'; value: string };

export type TrustPolicyArtifactType = 'elements' | 'postures' | 'surface' | 'snapshot' | 'hints' | 'patterns';
export type TrustPolicyDecision = 'allow' | 'review' | 'deny';

export interface TrustPolicyEvidenceRule {
  minCount: number;
  kinds: string[];
}

export interface TrustPolicyArtifactRule {
  minimumConfidence: number;
  requiredEvidence: TrustPolicyEvidenceRule;
}

export interface TrustPolicy {
  version: 1;
  artifactTypes: Record<TrustPolicyArtifactType, TrustPolicyArtifactRule>;
  forbiddenAutoHealClasses: string[];
}

export interface ProposedChangeMetadata {
  artifactType: TrustPolicyArtifactType;
  confidence: number;
  autoHealClass?: string | null | undefined;
}

export interface EvidenceDescriptor {
  kind: string;
}

export interface TrustPolicyEvaluationReason {
  code: 'minimum-confidence' | 'required-evidence' | 'forbidden-auto-heal';
  message: string;
}

export interface TrustPolicyEvaluation {
  decision: TrustPolicyDecision;
  reasons: TrustPolicyEvaluationReason[];
}

export interface CanonicalLineage {
  runIds: string[];
  evidenceIds: string[];
  sourceArtifactPaths: string[];
  role?: string | null | undefined;
  state?: string | null | undefined;
  driftSeed?: string | null | undefined;
}

export interface CanonicalKnowledgeMetadata {
  certification: CertificationStatus;
  activatedAt: string;
  certifiedAt?: string | null | undefined;
  lineage: CanonicalLineage;
}

export interface ProposalActivation {
  status: 'pending' | 'activated' | 'blocked';
  activatedAt?: string | null | undefined;
  certifiedAt?: string | null | undefined;
  reason?: string | null | undefined;
}

export interface DiagnosticProvenance {
  sourceRevision?: number | undefined;
  contentHash?: string | undefined;
  scenarioPath?: string | undefined;
  snapshotPath?: string | undefined;
  knowledgePath?: string | undefined;
  confidence?: Confidence | 'mixed' | undefined;
}

export interface CompilerDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  adoId: AdoId;
  stepIndex?: number | undefined;
  artifactPath?: string | undefined;
  provenance: DiagnosticProvenance;
}

export interface DerivedCapability {
  id: string;
  targetKind: 'screen' | 'surface' | 'element';
  target: ScreenId | SurfaceId | ElementId;
  operations: CapabilityName[];
  provenance: DiagnosticProvenance;
}

export interface ManifestEntry {
  adoId: AdoId;
  revision: number;
  contentHash: string;
  syncedAt: string;
  sourcePath: string;
}

export interface Manifest {
  entries: Record<string, ManifestEntry>;
}

export interface SyncResult {
  manifest: Manifest;
  snapshots: import('./intent').AdoSnapshot[];
  diagnostics: CompilerDiagnostic[];
}

export interface CaptureResult {
  snapshotPath: string;
  hashPath: string;
  hash: string;
  snapshot: string;
}

export interface ResolutionTarget {
  action: StepAction;
  screen: ScreenId;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}
