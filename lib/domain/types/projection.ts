import type { AdoId, EventSignatureRef, StateNodeRef, TransitionRef } from '../identity';
import type { AgentSession } from './session';
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
import type { ApplicationInterfaceGraph, StateTransitionGraph } from './interface';
import type { LearningScorecard, TrainingCorpusManifest } from './learning';
import type { StepProgram } from './intent';
import type { BoundScenario } from './intent';
import type { SelectorCanon } from './interface';
import type { ResolutionExhaustionEntry, TranslationReceipt } from './resolution';
import type { ProposalBundle, RunRecord } from './execution';
import type { ScenarioInterpretationSurface } from './resolution';

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
  interpretationDriftHotspotCount: number;
  overlayChurn: number;
  executionTimingTotalsMs: {
    setup: number;
    resolution: number;
    action: number;
    assertion: number;
    retries: number;
    teardown: number;
    total: number;
  };
  executionCostTotals: {
    instructionCount: number;
    diagnosticCount: number;
  };
  executionFailureFamilies: Record<string, number>;
  recoveryFamilies: Record<string, number>;
  recoveryStrategies: Record<string, number>;
  budgetBreachCount: number;
  thresholdStatus: 'pass' | 'warn' | 'fail';
  learning: LearningScorecard | null;
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
  | 'governs'
  | 'drifts-to';

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
    translationCacheHitRate: number;
    translationCacheMissReasons: Record<string, number>;
    translationFailureClasses: Record<string, number>;
    agenticHitRate: number;
    liveExplorationRate: number;
    degradedLocatorRate: number;
    proposalCount: number;
    reviewRequiredCount: number;
    approvedEquivalentRate: number;
    runtimeFailureFamilies: Record<string, number>;
    budgetBreachRate: number;
    averageRuntimeCost: {
      instructionCount: number;
      diagnosticCount: number;
    };
    timing: {
      setupMs: number;
      resolutionMs: number;
      actionMs: number;
      assertionMs: number;
      retriesMs: number;
      teardownMs: number;
      totalMs: number;
    };
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
  knowledgeRefs: readonly string[];
  supplementRefs: readonly string[];
  controlRefs: readonly string[];
  evidenceRefs: readonly string[];
  overlayRefs: readonly string[];
  reviewReasons: readonly string[];
  unresolvedGaps: readonly string[];
  reasons: readonly string[];
  evidenceIds: readonly string[];
  program: StepProgram | null;
  handshakes: readonly WorkflowStage[];
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
    preconditionFailures?: readonly string[] | undefined;
    requiredStateRefs?: readonly StateNodeRef[] | undefined;
    forbiddenStateRefs?: readonly StateNodeRef[] | undefined;
    eventSignatureRefs?: readonly EventSignatureRef[] | undefined;
    expectedTransitionRefs?: readonly TransitionRef[] | undefined;
    observedStateRefs?: readonly StateNodeRef[] | undefined;
    effectAssertions?: readonly string[] | undefined;
    transitionObservations?: Array<{
      transitionRef?: TransitionRef | null | undefined;
      classification: 'matched' | 'ambiguous-match' | 'missing-expected' | 'unexpected-effects';
    }> | undefined;
    durationMs?: number | undefined;
    timing?: {
      setupMs: number;
      resolutionMs: number;
      actionMs: number;
      assertionMs: number;
      retriesMs: number;
      teardownMs: number;
      totalMs: number;
    } | undefined;
    budget?: {
      status: 'within-budget' | 'over-budget' | 'not-configured';
      breaches: readonly string[];
    } | undefined;
    failure?: {
      family: 'none' | 'precondition-failure' | 'locator-degradation-failure' | 'environment-runtime-failure';
      code?: string | null | undefined;
    } | undefined;
    exhaustion?: readonly ResolutionExhaustionEntry[] | undefined;
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

export interface ScenarioProjectionInput {
  adoId: AdoId;
  boundScenario: BoundScenario;
  surface: ScenarioInterpretationSurface;
  latestRun: RunRecord | null;
  proposalBundle: ProposalBundle | null;
  interfaceGraph?: ApplicationInterfaceGraph | null | undefined;
  selectorCanon?: SelectorCanon | null | undefined;
  stateGraph?: StateTransitionGraph | null | undefined;
  sessions: AgentSession[];
  learningManifest?: TrainingCorpusManifest | null | undefined;
}
