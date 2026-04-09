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
  LocatorStrategy,
  ProposalActivation,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
  WorkflowMetadata,
} from '../governance/workflow-types';

export type ProposalCategory =
  | 'cold-start-discovery'
  | 'needs-human'
  | 'partial-resolution-stabilization'
  | 'deterministic-alias-stabilization'
  | 'interpretation-enrichment'
  | 'route-discovery';

export type ProposalEpistemicStatus = 'discovered' | 'observed' | 'interpreted' | 'stabilized';
export type ProposalActivationPolicy = 'append-aliases' | 'set-if-absent' | 'merge-locator-ladder';

export interface ProposalEnrichment {
  readonly role?: string | null | undefined;
  readonly affordance?: string | null | undefined;
  readonly locatorLadder?: readonly LocatorStrategy[] | undefined;
  readonly source?: string | null | undefined;
  readonly epistemicStatus?: ProposalEpistemicStatus | null | undefined;
  readonly activationPolicy?: ProposalActivationPolicy | null | undefined;
}

export interface ProposalEntry {
  readonly proposalId: string;
  readonly stepIndex: number;
  readonly artifactType: TrustPolicyArtifactType;
  readonly category?: ProposalCategory | null | undefined;
  readonly targetPath: string;
  readonly title: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly enrichment?: ProposalEnrichment | null | undefined;
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

export interface ProposalBundle extends WorkflowMetadata<'proposal'> {
  readonly kind: 'proposal-bundle';
  readonly scope: 'scenario';
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
