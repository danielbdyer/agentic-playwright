import {
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

export type Confidence = 'human' | 'agent-verified' | 'agent-proposed' | 'unbound';
export type ScenarioStatus = 'stub' | 'draft' | 'active' | 'needs-repair' | 'blocked' | 'deprecated';
export type StepAction = 'navigate' | 'input' | 'click' | 'assert-snapshot' | 'custom';
export type DiagnosticSeverity = 'info' | 'warn' | 'error';
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

export interface RefPath {
  segments: string[];
}

export interface AdoStep {
  index: number;
  action: string;
  expected: string;
  sharedStepId?: string;
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
  params?: Record<string, string>;
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

export interface ScenarioStep {
  index: number;
  intent: string;
  action: StepAction;
  screen?: ScreenId | null;
  element?: ElementId | null;
  posture?: PostureId | null;
  override?: string | null;
  snapshot_template?: SnapshotTemplateId | null;
  confidence: Confidence;
}

export interface ScenarioPostcondition {
  action: StepAction;
  screen?: ScreenId | null;
  element?: ElementId | null;
  posture?: PostureId | null;
  override?: string | null;
  snapshot_template?: SnapshotTemplateId | null;
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
    kind: 'bound' | 'unbound';
    reasons: string[];
  };
  program?: StepProgram;
}

export interface BoundScenario extends Omit<Scenario, 'steps'> {
  kind: 'bound-scenario';
  steps: BoundStep[];
  diagnostics: CompilerDiagnostic[];
}

export interface SurfaceSection {
  selector: string;
  url?: string;
  kind: SurfaceKind;
  surfaces: SurfaceId[];
  snapshot?: SnapshotTemplateId | null;
}

export interface SurfaceDefinition {
  kind: SurfaceKind;
  section: SectionId;
  selector: string;
  parents: SurfaceId[];
  children: SurfaceId[];
  elements: ElementId[];
  assertions: AssertionKind[];
  required?: boolean;
}

export interface SurfaceGraph {
  screen: ScreenId;
  url: string;
  sections: Record<string, SurfaceSection>;
  surfaces: Record<string, SurfaceDefinition>;
}

export interface ElementSig {
  role: string;
  name?: string | null;
  testId?: string | null;
  cssFallback?: string | null;
  surface: SurfaceId;
  widget: WidgetId;
  required?: boolean;
}

export interface ScreenElements {
  screen: ScreenId;
  url: string;
  elements: Record<string, ElementSig>;
}

export interface PostureEffect {
  target: 'self' | ElementId | SurfaceId;
  targetKind?: EffectTargetKind;
  state: EffectState;
  message?: string | null;
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
  sourceRevision?: number;
  contentHash?: string;
  scenarioPath?: string;
  snapshotPath?: string;
  knowledgePath?: string;
  confidence?: Confidence | 'mixed';
}

export interface CompilerDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  adoId: AdoId;
  stepIndex?: number;
  artifactPath?: string;
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

export type TrustPolicyArtifactType = 'elements' | 'postures' | 'surface' | 'snapshot';
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
  autoHealClass?: string | null;
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
  | 'section'
  | 'surface'
  | 'element'
  | 'posture'
  | 'capability'
  | 'scenario'
  | 'step'
  | 'generated-spec'
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
  artifactPath?: string;
  provenance: DiagnosticProvenance;
  payload?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  kind: GraphEdgeKind;
  from: string;
  to: string;
  fingerprint: string;
  provenance: DiagnosticProvenance;
  payload?: Record<string, unknown>;
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

