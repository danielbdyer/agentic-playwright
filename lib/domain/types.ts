import type {
  AdoId,
  ElementId,
  FixtureId,
  PostureId,
  ScreenId,
  SectionId,
  SnapshotTemplateId,
  SurfaceId,
  WidgetId,
} from './identity';

export type Confidence = 'human' | 'agent-verified' | 'agent-proposed' | 'compiler-derived' | 'intent-only' | 'unbound';
export type Governance = 'approved' | 'review-required' | 'blocked';
export type StepProvenanceKind = 'explicit' | 'approved-knowledge' | 'live-exploration' | 'unresolved';
export type ScenarioStatus = 'stub' | 'draft' | 'active' | 'needs-repair' | 'blocked' | 'deprecated';
export type StepAction = 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
export type DiagnosticSeverity = 'info' | 'warn' | 'error';
export type PatternActionName = 'navigate' | 'input' | 'click' | 'assert-snapshot';
export type ScenarioLifecycle = 'normal' | 'fixme' | 'skip' | 'fail';
export type StepBindingKind = 'bound' | 'deferred' | 'unbound';
export type EffectState =
  | 'validation-error'
  | 'required-error'
  | 'disabled'
  | 'enabled'
  | 'visible'
  | 'hidden';

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
export type CapabilityName =
  | 'navigate'
  | 'enter'
  | 'invoke'
  | 'observe-structure'
  | 'observe-state'
  | 'custom-escape-hatch';

export type EffectTargetKind = 'self' | 'element' | 'surface';
export type LocatorStrategyKind = 'test-id' | 'role-name' | 'css';

export type WidgetAction = 'click' | 'fill' | 'clear' | 'get-value';
export type WidgetPrecondition = 'visible' | 'enabled' | 'editable';
export type WidgetEffectCategory = 'mutation' | 'observation' | 'focus' | 'navigation';

export interface WidgetInteractionContext {
  affordance?: string | null | undefined;
}


export interface WidgetActionSemantics {
  expectedStates: EffectState[];
  effectCategories: WidgetEffectCategory[];
}

export interface WidgetCapabilityContract {
  widget: WidgetId;
  supportedActions: WidgetAction[];
  requiredPreconditions: WidgetPrecondition[];
  sideEffects: Partial<Record<WidgetAction, WidgetActionSemantics>>;
}

export type LocatorStrategy =
  | {
      kind: 'test-id';
      value: string;
    }
  | {
      kind: 'role-name';
      role: string;
      name?: string | null | undefined;
    }
  | {
      kind: 'css';
      value: string;
    };

export interface RefPath {
  segments: string[];
}

export interface AdoStep {
  index: number;
  action: string;
  expected: string;
  sharedStepId?: string | undefined;
}

export interface AdoParameter {
  name: string;
  values: string[];
}

export interface AdoSnapshot {
  id: AdoId;
  revision: number;
  title: string;
  suitePath: string;
  areaPath: string;
  tags: string[];
  priority: number;
  steps: AdoStep[];
  parameters: AdoParameter[];
  dataRows: Record<string, string>[];
  contentHash: string;
  syncedAt: string;
}

export interface ScenarioSource {
  ado_id: AdoId;
  revision: number;
  content_hash: string;
  synced_at: string;
}

export interface ScenarioMetadata {
  title: string;
  suite: string;
  tags: string[];
  priority: number;
  status: ScenarioStatus;
  status_detail: string | null;
}

export interface ScenarioPrecondition {
  fixture: FixtureId;
  params?: Record<string, string> | undefined;
}

export interface ValueRefLiteral {
  kind: 'literal';
  value: string;
}

export interface ValueRefFixturePath {
  kind: 'fixture-path';
  path: RefPath;
}

export interface ValueRefPostureSample {
  kind: 'posture-sample';
  element: ElementId;
  posture: PostureId;
  sampleIndex: number;
}

export interface ValueRefParameterRow {
  kind: 'parameter-row';
  name: string;
  rowIndex: number;
}

export interface ValueRefGeneratedToken {
  kind: 'generated-token';
  token: string;
}

export type ValueRef =
  | ValueRefLiteral
  | ValueRefFixturePath
  | ValueRefPostureSample
  | ValueRefParameterRow
  | ValueRefGeneratedToken;

export type StepInstruction =
  | {
      kind: 'navigate';
      screen: ScreenId;
    }
  | {
      kind: 'enter';
      screen: ScreenId;
      element: ElementId;
      posture: PostureId | null;
      value: ValueRef | null;
    }
  | {
      kind: 'invoke';
      screen: ScreenId;
      element: ElementId;
      action: 'click';
    }
  | {
      kind: 'observe-structure';
      screen: ScreenId;
      element: ElementId;
      snapshotTemplate: SnapshotTemplateId;
    }
  | {
      kind: 'custom-escape-hatch';
      reason: string;
    };

export interface StepProgram {
  kind: 'step-program';
  instructions: StepInstruction[];
}

export interface StepResolution {
  action?: StepAction | null | undefined;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}

export interface ScenarioStep {
  index: number;
  intent: string;
  action_text: string;
  expected_text: string;
  action: StepAction;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
  resolution?: StepResolution | null | undefined;
  confidence: Confidence;
}

export interface ScenarioPostcondition {
  action: StepAction;
  screen?: ScreenId | null | undefined;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}

export interface Scenario {
  source: ScenarioSource;
  metadata: ScenarioMetadata;
  preconditions: ScenarioPrecondition[];
  steps: ScenarioStep[];
  postconditions: ScenarioPostcondition[];
}

export interface BoundStep extends ScenarioStep {
  binding: {
    kind: StepBindingKind;
    reasons: string[];
    ruleId: string | null;
    normalizedIntent: string;
    knowledgeRefs: string[];
    supplementRefs: string[];
    evidenceIds: string[];
    governance: Governance;
    reviewReasons: string[];
  };
  program?: StepProgram | undefined;
}

export interface BoundScenario extends Omit<Scenario, 'steps'> {
  kind: 'bound-scenario';
  steps: BoundStep[];
  diagnostics: CompilerDiagnostic[];
}

export interface StepTaskElementCandidate {
  element: ElementId;
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
}

export interface StepTaskScreenCandidate {
  screen: ScreenId;
  url: string;
  screenAliases: string[];
  knowledgeRefs: string[];
  supplementRefs: string[];
  elements: StepTaskElementCandidate[];
  sectionSnapshots: SnapshotTemplateId[];
}

export interface RuntimeKnowledgeSession {
  knowledgeFingerprint: string;
  sharedPatterns: SharedPatterns;
  screens: StepTaskScreenCandidate[];
  evidenceRefs: string[];
}

export interface StepTask {
  index: number;
  intent: string;
  actionText: string;
  expectedText: string;
  normalizedIntent: string;
  allowedActions: StepAction[];
  explicitResolution: StepResolution | null;
  runtimeKnowledge: RuntimeKnowledgeSession;
  taskFingerprint: string;
}

export interface ScenarioTaskPacket {
  kind: 'scenario-task-packet';
  adoId: AdoId;
  revision: number;
  title: string;
  suite: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  steps: StepTask[];
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

export interface ResolutionObservation {
  source: 'knowledge' | 'evidence' | 'dom' | 'runtime';
  summary: string;
  detail?: Record<string, string> | undefined;
}

export interface ResolutionExhaustionEntry {
  stage: 'explicit' | 'approved-screen-bundle' | 'local-hints' | 'shared-patterns' | 'prior-evidence' | 'live-dom' | 'safe-degraded-resolution';
  outcome: 'attempted' | 'resolved' | 'skipped' | 'failed';
  reason: string;
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

export interface ResolutionTarget {
  action: StepAction;
  screen: ScreenId;
  element?: ElementId | null | undefined;
  posture?: PostureId | null | undefined;
  override?: string | null | undefined;
  snapshot_template?: SnapshotTemplateId | null | undefined;
}

interface ResolutionReceiptBase {
  taskFingerprint: string;
  knowledgeFingerprint: string;
  provider: string;
  mode: string;
  runAt: string;
  stepIndex: number;
  knowledgeRefs: string[];
  supplementRefs: string[];
  observations: ResolutionObservation[];
  exhaustion: ResolutionExhaustionEntry[];
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

export type ResolutionReceipt =
  | ResolvedReceipt
  | ResolvedWithProposalsReceipt
  | NeedsHumanReceipt;

export interface ExecutionDiagnostic {
  code: string;
  message: string;
  context?: Record<string, string> | undefined;
}

export interface ExecutionObservation {
  status: 'ok' | 'failed' | 'skipped';
  observedEffects: string[];
  diagnostics: ExecutionDiagnostic[];
}

export interface StepExecutionReceipt {
  stepIndex: number;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  runAt: string;
  mode: string;
  locatorStrategy?: string | null | undefined;
  degraded: boolean;
  execution: ExecutionObservation;
}

export interface ScenarioRunStep {
  stepIndex: number;
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
  evidenceIds: string[];
}

export interface RunRecord {
  kind: 'scenario-run-record';
  runId: string;
  adoId: AdoId;
  revision: number;
  title: string;
  suite: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  provider: string;
  mode: string;
  startedAt: string;
  completedAt: string;
  steps: ScenarioRunStep[];
  evidenceIds: string[];
}

export interface ProposalEntry {
  stepIndex: number;
  artifactType: TrustPolicyArtifactType;
  targetPath: string;
  title: string;
  patch: Record<string, unknown>;
  evidenceIds: string[];
  impactedSteps: number[];
  trustPolicy: TrustPolicyEvaluation;
}

export interface ProposalBundle {
  kind: 'proposal-bundle';
  adoId: AdoId;
  runId: string;
  revision: number;
  title: string;
  suite: string;
  proposals: ProposalEntry[];
}

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

export interface DerivedCapability {
  id: string;
  targetKind: 'screen' | 'surface' | 'element';
  target: ScreenId | SurfaceId | ElementId;
  operations: CapabilityName[];
  provenance: DiagnosticProvenance;
}

export type GraphNodeKind =
  | 'snapshot'
  | 'screen'
  | 'screen-hints'
  | 'pattern'
  | 'section'
  | 'surface'
  | 'element'
  | 'posture'
  | 'capability'
  | 'scenario'
  | 'step'
  | 'generated-spec'
  | 'generated-trace'
  | 'generated-review'
  | 'evidence'
  | 'policy-decision';

export type GraphEdgeKind =
  | 'derived-from'
  | 'contains'
  | 'references'
  | 'uses'
  | 'affects'
  | 'asserts'
  | 'emits'
  | 'observed-by'
  | 'proposed-change-for'
  | 'governs';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  fingerprint: string;
  artifactPath?: string | undefined;
  provenance: DiagnosticProvenance;
  payload?: Record<string, unknown> | undefined;
}

export interface GraphEdge {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  fingerprint: string;
  provenance: DiagnosticProvenance;
  payload?: Record<string, unknown> | undefined;
}

export interface MappedMcpResource {
  uri: string;
  description: string;
}

export interface MappedMcpTemplate {
  uriTemplate: string;
  description: string;
}

export interface DerivedGraph {
  version: 'v1';
  fingerprint: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  resources: MappedMcpResource[];
  resourceTemplates: MappedMcpTemplate[];
}

export interface SyncResult {
  manifest: Manifest;
  snapshots: AdoSnapshot[];
  diagnostics: CompilerDiagnostic[];
}

export interface CaptureResult {
  snapshotPath: string;
  hashPath: string;
  hash: string;
  snapshot: string;
}

export interface ScenarioExplanationSummary {
  stepCount: number;
  provenanceKinds: Record<StepProvenanceKind, number>;
  governance: Record<Governance, number>;
  unresolvedReasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface ScenarioExplanationStep {
  index: number;
  intent: string;
  actionText: string;
  expectedText: string;
  normalizedIntent: string;
  action: StepAction;
  confidence: Confidence;
  provenanceKind: StepProvenanceKind;
  governance: Governance;
  bindingKind: StepBindingKind;
  ruleId: string | null;
  knowledgeRefs: string[];
  supplementRefs: string[];
  reviewReasons: string[];
  unresolvedGaps: string[];
  reasons: string[];
  evidenceIds: string[];
  program: StepProgram | null;
  runtime?: {
    status: 'pending' | 'resolved' | 'resolved-with-proposals' | 'needs-human';
    runId?: string | null | undefined;
    locatorStrategy?: string | null | undefined;
    degraded?: boolean | undefined;
  } | undefined;
}

export interface ScenarioExplanation {
  adoId: AdoId;
  revision: number;
  title: string;
  suite: string;
  confidence: Confidence | 'mixed';
  governance: Governance;
  lifecycle: ScenarioLifecycle;
  diagnostics: CompilerDiagnostic[];
  summary: ScenarioExplanationSummary;
  steps: ScenarioExplanationStep[];
}








