import type { AdoId, EventSignatureRef, StateNodeRef, TransitionRef } from '../identity';
import type { AgentSession } from './session';
import type {
  CompilerDiagnostic,
  Confidence,
  DiagnosticProvenance,
  ExecutionPosture,
  Governance,
  ResolutionMode,
  ScenarioLifecycle,
  StepAction,
  StepBindingKind,
  StepProvenanceKind,
  StepWinningSource,
  WorkflowStage,
} from './workflow';
import type { ApplicationInterfaceGraph, StateTransitionGraph } from './interface';
import type { ImprovementRun } from './improvement';
import type { LearningScorecard, TrainingCorpusManifest } from './learning';
import type { StepProgram } from './intent';
import type { BoundScenario } from './intent';
import type { SelectorCanon } from './interface';
import type { ResolutionExhaustionEntry, TranslationReceipt } from './resolution';
import type { ProposalBundle, RunRecord } from './execution';
import type { ScenarioInterpretationSurface } from './resolution';
import type { WorkflowLane } from './workflow';

export interface BenchmarkField {
  readonly id: string;
  readonly screen: string;
  readonly element: string;
  readonly label: string;
  readonly category: string;
  readonly required: boolean;
  readonly postures: readonly string[];
}

export interface BenchmarkFlow {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly screens: readonly string[];
  readonly fieldIds: readonly string[];
}

export interface BenchmarkDriftEvent {
  readonly id: string;
  readonly kind: 'label-change' | 'locator-degradation' | 'widget-swap' | 'validation-copy-change' | 'section-structure-drift';
  readonly screen: string;
  readonly fieldId?: string | null | undefined;
  readonly severity: 'low' | 'medium' | 'high';
  readonly description: string;
}

export interface BenchmarkExpansionRule {
  readonly fieldIds: readonly string[];
  readonly postures: readonly string[];
  readonly variantsPerField: number;
}

export interface BenchmarkContext {
  readonly kind: 'benchmark-context';
  readonly version: 1;
  readonly name: string;
  readonly suite: string;
  readonly appRoute: string;
  readonly fieldCatalog: readonly BenchmarkField[];
  readonly flows: readonly BenchmarkFlow[];
  readonly driftEvents: readonly BenchmarkDriftEvent[];
  readonly fieldAwarenessThresholds: {
    readonly minFieldAwarenessCount: number;
    readonly minFirstPassScreenResolutionRate: number;
    readonly minFirstPassElementResolutionRate: number;
    readonly maxDegradedLocatorRate: number;
  };
  readonly benchmarkRunbooks: ReadonlyArray<{
    readonly name: string;
    readonly runbook: string;
    readonly tag?: string | null | undefined;
  }>;
  readonly expansionRules: readonly BenchmarkExpansionRule[];
}

export interface BenchmarkScorecard {
  readonly kind: 'benchmark-scorecard';
  readonly version: 1;
  readonly benchmark: string;
  readonly generatedAt: string;
  readonly uniqueFieldAwarenessCount: number;
  readonly firstPassScreenResolutionRate: number;
  readonly firstPassElementResolutionRate: number;
  readonly degradedLocatorRate: number;
  readonly reviewRequiredCount: number;
  readonly repairLoopCount: number;
  readonly operatorTouchCount: number;
  readonly knowledgeChurn: Readonly<Record<string, number>>;
  readonly generatedVariantCount: number;
  readonly translationHitRate: number;
  readonly agenticHitRate: number;
  readonly approvedEquivalentCount: number;
  readonly thinKnowledgeScreenCount: number;
  readonly degradedLocatorHotspotCount: number;
  readonly interpretationDriftHotspotCount: number;
  readonly overlayChurn: number;
  readonly executionTimingTotalsMs: {
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
  readonly executionFailureFamilies: Readonly<Record<string, number>>;
  readonly recoveryFamilies: Readonly<Record<string, number>>;
  readonly recoveryStrategies: Readonly<Record<string, number>>;
  readonly budgetBreachCount: number;
  readonly thresholdStatus: 'pass' | 'warn' | 'fail';
  readonly learning: LearningScorecard | null;
}

export interface ImprovementProjectionSummary {
  readonly relatedRunIds: readonly string[];
  readonly latestRunId: string | null;
  readonly latestAccepted: boolean | null;
  readonly latestVerdict: string | null;
  readonly latestDecisionId: string | null;
  readonly signalCount: number;
  readonly candidateInterventionCount: number;
  readonly checkpointRef: string | null;
}

export interface BenchmarkImprovementProjectionBase {
  readonly version: 1;
  readonly benchmark: string;
  readonly runId: string;
  readonly executedAt: string;
  readonly posture: ExecutionPosture;
  readonly runbooks: readonly string[];
  readonly scenarioIds: readonly AdoId[];
  readonly driftEventIds: readonly string[];
  readonly scorecard: BenchmarkScorecard;
  readonly improvement?: ImprovementProjectionSummary | null | undefined;
  readonly nextCommands: readonly string[];
}

export interface BenchmarkImprovementProjection extends BenchmarkImprovementProjectionBase {
  readonly kind: 'benchmark-improvement-projection';
}

export interface DogfoodRun extends BenchmarkImprovementProjectionBase {
  readonly kind: 'dogfood-run';
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
  | 'policy-decision'
  | 'participant'
  | 'intervention'
  | 'improvement-run'
  | 'acceptance-decision';

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
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly label: string;
  readonly fingerprint: string;
  readonly artifactPath?: string | undefined;
  readonly provenance: DiagnosticProvenance;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface GraphEdge {
  readonly id: string;
  readonly kind: GraphEdgeKind;
  readonly from: string;
  readonly to: string;
  readonly fingerprint: string;
  readonly provenance: DiagnosticProvenance;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}

export interface MappedMcpResource {
  readonly uri: string;
  readonly description: string;
}

export interface MappedMcpTemplate {
  readonly uriTemplate: string;
  readonly description: string;
}

export interface DerivedGraph {
  readonly version: 'v1';
  readonly fingerprint: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly resources: readonly MappedMcpResource[];
  readonly resourceTemplates: readonly MappedMcpTemplate[];
}

export interface ScenarioExplanationSummary {
  readonly stepCount: number;
  readonly provenanceKinds: Readonly<Record<StepProvenanceKind, number>>;
  readonly governance: Readonly<Record<Governance, number>>;
  readonly stageMetrics: {
    knowledgeHitRate: number;
    translationHitRate: number;
    translationCacheHitRate: number;
    translationCacheMissReasons: Readonly<Record<string, number>>;
    translationFailureClasses: Readonly<Record<string, number>>;
    agenticHitRate: number;
    liveExplorationRate: number;
    degradedLocatorRate: number;
    proposalCount: number;
    reviewRequiredCount: number;
    approvedEquivalentRate: number;
    runtimeFailureFamilies: Readonly<Record<string, number>>;
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
  readonly unresolvedReasons: ReadonlyArray<{ readonly reason: string; readonly count: number }>;
}

export interface ScenarioExplanationStep {
  readonly index: number;
  readonly intent: string;
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  readonly action: StepAction;
  readonly confidence: Confidence;
  readonly provenanceKind: StepProvenanceKind;
  readonly governance: Governance;
  readonly bindingKind: StepBindingKind;
  readonly ruleId: string | null;
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
  readonly winningConcern: WorkflowLane;
  readonly winningSource: StepWinningSource;
  readonly resolutionMode: ResolutionMode;
  readonly translation?: TranslationReceipt | null | undefined;
  readonly runtime?: {
    status: 'pending' | 'resolved' | 'resolved-with-proposals' | 'agent-interpreted' | 'needs-human';
    runId?: string | null | undefined;
    resolutionMode?: ResolutionMode | null | undefined;
    widgetContract?: string | null | undefined;
    locatorStrategy?: string | null | undefined;
    locatorRung?: number | null | undefined;
    degraded?: boolean | undefined;
    preconditionFailures?: readonly string[] | undefined;
    planning?: {
      status: 'already-satisfied' | 'path-found' | 'no-path' | 'not-applicable';
      requiredPreconditions: readonly StateNodeRef[];
      forbiddenPreconditions: readonly StateNodeRef[];
      chosenTransitionPath: readonly TransitionRef[];
      chosenEventSignaturePath: readonly EventSignatureRef[];
    } | undefined;
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
    navigation?: {
      selectedRouteVariantRef: string | null;
      selectedRouteUrl: string | null;
      semanticDestination: string | null;
      expectedEntryStateRefs: readonly StateNodeRef[];
      observedEntryStateRefs: readonly StateNodeRef[];
      fallbackRoutePath: readonly string[];
      mismatch: boolean;
      rationale?: string | null | undefined;
    } | undefined;
    exhaustion?: readonly ResolutionExhaustionEntry[] | undefined;
  } | undefined;
}

export interface ScenarioExplanation {
  readonly adoId: AdoId;
  readonly revision: number;
  readonly title: string;
  readonly suite: string;
  readonly confidence: Confidence | 'mixed';
  readonly governance: Governance;
  readonly lifecycle: ScenarioLifecycle;
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly summary: ScenarioExplanationSummary;
  readonly steps: readonly ScenarioExplanationStep[];
  readonly improvement?: ImprovementProjectionSummary | null | undefined;
}

export interface ScenarioProjectionInput {
  readonly adoId: AdoId;
  readonly boundScenario: BoundScenario;
  readonly surface: ScenarioInterpretationSurface;
  readonly latestRun: RunRecord | null;
  readonly proposalBundle: ProposalBundle | null;
  readonly interfaceGraph?: ApplicationInterfaceGraph | null | undefined;
  readonly selectorCanon?: SelectorCanon | null | undefined;
  readonly stateGraph?: StateTransitionGraph | null | undefined;
  readonly sessions: readonly AgentSession[];
  readonly improvementRuns: readonly ImprovementRun[];
  readonly learningManifest?: TrainingCorpusManifest | null | undefined;
}
