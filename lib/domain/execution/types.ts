/**
 * Execution context types — re-exports from decomposed primitive directories.
 *
 * This file preserves backward compatibility for the barrel chain:
 *   domain/types.ts → execution-context.ts → execution/types.ts
 *
 * Types now live in their conceptual homes:
 *   - drift/types.ts: ResolutionGraphDriftDelta, InterpretationDrift*
 *   - evidence/types.ts: StepExecutionReceipt, RunRecord, diagnostics, folds
 *   - proposal types remain here (ProposalEntry, ProposalBundle)
 *   - resolution stress test types remain here
 */

// Re-export drift types
export type {
  ResolutionGraphDriftDelta,
  ResolutionGraphStepRecord,
  ResolutionGraphRecord,
  InterpretationDriftChange,
  InterpretationDriftStep,
  InterpretationDriftRecord,
} from '../drift/types';

// Re-export evidence types
export type {
  ExecutionDiagnostic,
  ConsoleEntry,
  ExecutionObservation,
  PlannedTransitionEdgeReceipt,
  PlannedTransitionPathStepReceipt,
  PlannedExecutionStepReceipt,
  StepExecutionReceipt,
  RecoveryAttemptReceipt,
  TranslationRunMetrics,
  StepFold,
  ScenarioRunFold,
  ScenarioRunStep,
  RunRecord,
  ScreenTempoProfile,
  TempoAdaptationResult,
} from '../evidence/types';

// Proposal types (owned by this file until further decomposition)
import type { AdoId } from '../kernel/identity';
import type {
  CanonicalLineage,
  CertificationStatus,
  Governance,
  ProposalActivation,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from '../governance/workflow-types';

export interface ProposalEntry {
  readonly proposalId: string;
  readonly stepIndex: number;
  readonly artifactType: TrustPolicyArtifactType;
  readonly targetPath: string;
  readonly title: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly evidenceIds: readonly string[];
  readonly impactedSteps: readonly number[];
  readonly trustPolicy: TrustPolicyEvaluation;
  readonly certification: CertificationStatus;
  readonly activation: ProposalActivation;
  readonly lineage: CanonicalLineage;
}

export interface ProposalBundlePayload {
  readonly adoId: AdoId;
  readonly runId: string;
  readonly revision: number;
  readonly title: string;
  readonly suite: string;
  readonly proposals: readonly ProposalEntry[];
}

export interface ProposalBundle {
  readonly kind: 'proposal-bundle';
  readonly version: 1;
  readonly stage: 'proposal';
  readonly scope: 'scenario';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: ProposalBundlePayload;
}

// Resolution stress test types
import type { ResolutionRungOverride } from '../resolution/types';
import type { ResolutionPrecedenceRung } from '../resolution/precedence';

export interface StressTestConfig {
  readonly kind: 'rung-isolation';
  readonly version: 1;
  readonly rungOverride: ResolutionRungOverride;
  readonly baselineRunId?: string;
}

export interface RungStressStepResult {
  readonly stepIndex: number;
  readonly resolvedWithForce: boolean;
  readonly resolvedWithBaseline: boolean;
  readonly degradedFromBaseline: boolean;
  readonly rungConfidence: number;
}

export interface RungMarginalValue {
  readonly rung: ResolutionPrecedenceRung;
  readonly resolutionRate: number;
  readonly degradationRate: number;
  readonly avgConfidence: number;
  readonly uniqueResolutions: number;
  readonly verdict: 'essential' | 'valuable' | 'marginal' | 'redundant';
}

export interface RungStressTestReceipt {
  readonly kind: 'rung-stress-test-receipt';
  readonly version: 1;
  readonly rung: ResolutionPrecedenceRung;
  readonly stepResults: readonly RungStressStepResult[];
  readonly marginalValue: RungMarginalValue;
}
