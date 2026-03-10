import type { AdoId } from '../identity';
import type {
  CompilerDiagnostic,
  Confidence,
  DiagnosticProvenance,
  ExecutionPosture,
  Governance,
  Manifest,
  ResolutionMode,
  ScenarioLifecycle,
  StepAction,
  StepBindingKind,
  StepProvenanceKind,
  StepWinningSource,
  WorkflowStage,
} from './workflow';
import type { StepProgram } from './intent';
import type { ResolutionExhaustionEntry, TranslationReceipt } from './resolution';

export interface BenchmarkField {
  id: string;
  screen: string;
  element: string;
  label: string;
  category: string;
  required: boolean;
  postures: string[];
}

export interface BenchmarkFlow {
  id: string;
  title: string;
  route: string;
  screens: string[];
  fieldIds: string[];
}

export interface BenchmarkDriftEvent {
  id: string;
  kind: 'label-change' | 'locator-degradation' | 'widget-swap' | 'validation-copy-change' | 'section-structure-drift';
  screen: string;
  fieldId?: string | null | undefined;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface BenchmarkExpansionRule {
  fieldIds: string[];
  postures: string[];
  variantsPerField: number;
}

export interface BenchmarkContext {
  kind: 'benchmark-context';
  version: 1;
  name: string;
  suite: string;
  appRoute: string;
  fieldCatalog: BenchmarkField[];
  flows: BenchmarkFlow[];
  driftEvents: BenchmarkDriftEvent[];
  fieldAwarenessThresholds: {
    minFieldAwarenessCount: number;
    minFirstPassScreenResolutionRate: number;
    minFirstPassElementResolutionRate: number;
    maxDegradedLocatorRate: number;
  };
  benchmarkRunbooks: Array<{
    name: string;
    runbook: string;
    tag?: string | null | undefined;
  }>;
  expansionRules: BenchmarkExpansionRule[];
}

export interface BenchmarkScorecard {
  kind: 'benchmark-scorecard';
  version: 1;
  benchmark: string;
  generatedAt: string;
  uniqueFieldAwarenessCount: number;
  firstPassScreenResolutionRate: number;
  firstPassElementResolutionRate: number;
  degradedLocatorRate: number;
  reviewRequiredCount: number;
  repairLoopCount: number;
  operatorTouchCount: number;
  knowledgeChurn: Record<string, number>;
  generatedVariantCount: number;
  translationHitRate: number;
  agenticHitRate: number;
  approvedEquivalentCount: number;
  thinKnowledgeScreenCount: number;
  degradedLocatorHotspotCount: number;
  overlayChurn: number;
  thresholdStatus: 'pass' | 'warn' | 'fail';
}

export interface DogfoodRun {
  kind: 'dogfood-run';
  version: 1;
  benchmark: string;
  runId: string;
  executedAt: string;
  posture: ExecutionPosture;
  runbooks: string[];
  scenarioIds: AdoId[];
  driftEventIds: string[];
  scorecard: BenchmarkScorecard;
  nextCommands: string[];
}

export type GraphNodeKind =
  | 'snapshot'
  | 'screen'
  | 'screen-hints'
  | 'pattern'
  | 'confidence-overlay'
  | 'dataset'
  | 'resolution-control'
  | 'runbook'
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
  | 'learns-from'
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

export interface ScenarioExplanationSummary {
  stepCount: number;
  provenanceKinds: Record<StepProvenanceKind, number>;
  governance: Record<Governance, number>;
  stageMetrics: {
    knowledgeHitRate: number;
    translationHitRate: number;
    agenticHitRate: number;
    liveExplorationRate: number;
    degradedLocatorRate: number;
    proposalCount: number;
    reviewRequiredCount: number;
    approvedEquivalentRate: number;
  };
  unresolvedReasons: Array<{ reason: string; count: number }>;
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
  controlRefs: string[];
  evidenceRefs: string[];
  overlayRefs: string[];
  reviewReasons: string[];
  unresolvedGaps: string[];
  reasons: string[];
  evidenceIds: string[];
  program: StepProgram | null;
  handshakes: WorkflowStage[];
  winningConcern: import('./workflow').WorkflowLane;
  winningSource: StepWinningSource;
  resolutionMode: ResolutionMode;
  translation?: TranslationReceipt | null | undefined;
  runtime?: {
    status: 'pending' | 'resolved' | 'resolved-with-proposals' | 'needs-human';
    runId?: string | null | undefined;
    resolutionMode?: ResolutionMode | null | undefined;
    widgetContract?: string | null | undefined;
    locatorStrategy?: string | null | undefined;
    locatorRung?: number | null | undefined;
    degraded?: boolean | undefined;
    preconditionFailures?: string[] | undefined;
    durationMs?: number | undefined;
    exhaustion?: ResolutionExhaustionEntry[] | undefined;
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
