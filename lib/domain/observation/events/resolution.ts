import type { ResolutionMode } from '../../governance/workflow-types';

export const RESOLUTION_EVENT_KINDS = [
  'rung-shift',
  'calibration-update',
  'proposal-activated',
  'confidence-crossed',
  'suite-slice-selected',
  'scenario-prioritized',
  'step-bound',
  'scenario-compiled',
  'step-executing',
  'step-resolved',
  'scenario-executed',
  'convergence-evaluated',
  'iteration-summary',
] as const;

export interface RungShiftEvent {
  readonly iteration: number;
  readonly distribution: readonly { readonly rung: string; readonly wins: number; readonly rate: number }[];
  readonly knowledgeHitRate: number;
  readonly totalSteps: number;
}

export interface CalibrationUpdateEvent {
  readonly iteration: number;
  readonly weights: {
    readonly repairDensity: number;
    readonly translationRate: number;
    readonly unresolvedRate: number;
    readonly inverseFragmentShare: number;
  };
  readonly weightDrift: number;
  readonly correlations: readonly { readonly signal: string; readonly strength: number }[];
}

export interface ProposalActivatedEvent {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly targetPath: string;
  readonly status: 'activated' | 'blocked';
  readonly confidence: number;
  readonly iteration: number;
}

export interface ConfidenceCrossedEvent {
  readonly artifactId: string;
  readonly screen: string | null;
  readonly element: string | null;
  readonly previousStatus: string;
  readonly newStatus: 'approved-equivalent' | 'needs-review' | 'learning';
  readonly score: number;
  readonly threshold: number;
}

export interface SuiteSliceSelectedEvent {
  readonly selectedCount: number;
  readonly totalCount: number;
  readonly estimatedCoverage: number;
  readonly topScreens: readonly string[];
  readonly sharedKnowledgeDensity: number;
  readonly costBudget: number;
}

export interface ScenarioPrioritizedEvent {
  readonly adoId: string;
  readonly priority: number;
  readonly rank: number;
  readonly inSlice: boolean;
  readonly sharedScreens: number;
  readonly sharedElements: number;
  readonly decompositionConfidence: number;
}

export interface StepBoundEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly stepText: string;
  readonly bindingKind: 'bound' | 'deferred' | 'unbound';
  readonly confidence: number;
  readonly targetRef: string | null;
  readonly screen: string | null;
  readonly element: string | null;
  readonly resolutionRung: number | null;
}

export interface ScenarioCompiledEvent {
  readonly adoId: string;
  readonly totalSteps: number;
  readonly boundSteps: number;
  readonly deferredSteps: number;
  readonly unboundSteps: number;
  readonly specPath: string;
  readonly tracePath: string;
}

export interface StepExecutingEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly screen: string | null;
  readonly element: string | null;
  readonly resolutionMode: ResolutionMode;
}

export interface StepResolvedEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly success: boolean;
  readonly actualRung: number;
  readonly durationMs: number;
  readonly failureClass: string | null;
  readonly proposalDrafted: boolean;
  readonly evidenceRecorded: boolean;
}

export interface ScenarioExecutedEvent {
  readonly adoId: string;
  readonly passed: boolean;
  readonly resolutionDistribution: readonly {
    readonly rung: number;
    readonly count: number;
  }[];
}

export interface ConvergenceEvaluatedEvent {
  readonly iteration: number;
  readonly converged: boolean;
  readonly reason: string;
  readonly knowledgeHitRate: number;
  readonly previousHitRate: number;
  readonly delta: number;
  readonly proposalsRemaining: number;
  readonly budgetRemaining: {
    readonly iterations: number;
    readonly tokens: number | null;
  };
}

export interface IterationSummaryEvent {
  readonly iteration: number;
  readonly scenariosExecuted: number;
  readonly scenariosPassed: number;
  readonly scenariosFailed: number;
  readonly stepsResolved: number;
  readonly stepsDeferred: number;
  readonly stepsUnresolved: number;
  readonly proposalsGenerated: number;
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly knowledgeNodesCreated: number;
  readonly knowledgeNodesUpdated: number;
  readonly wallClockMs: number;
  readonly tokenEstimate: number | null;
}

export interface ResolutionEventMap {
  readonly 'rung-shift': RungShiftEvent;
  readonly 'calibration-update': CalibrationUpdateEvent;
  readonly 'proposal-activated': ProposalActivatedEvent;
  readonly 'confidence-crossed': ConfidenceCrossedEvent;
  readonly 'suite-slice-selected': SuiteSliceSelectedEvent;
  readonly 'scenario-prioritized': ScenarioPrioritizedEvent;
  readonly 'step-bound': StepBoundEvent;
  readonly 'scenario-compiled': ScenarioCompiledEvent;
  readonly 'step-executing': StepExecutingEvent;
  readonly 'step-resolved': StepResolvedEvent;
  readonly 'scenario-executed': ScenarioExecutedEvent;
  readonly 'convergence-evaluated': ConvergenceEvaluatedEvent;
  readonly 'iteration-summary': IterationSummaryEvent;
}
