import type { AdoId } from '../../domain/identity';
import type {
  ExecutionDiagnostic,
  GroundedStep,
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionReceipt,
  ResolutionTarget,
  ScenarioRunPlan,
  StepExecutionReceipt,
} from '../../domain/types';
import type { RuntimeScenarioEnvironment } from '../scenario';
import type { RouteSelection } from './route-selection';

export type ScenarioStageLane = 'intent' | 'resolution' | 'execution' | 'governance/projection';

export interface ScenarioContextRef {
  readonly adoId: AdoId;
  readonly artifactPath?: string | undefined;
  readonly revision?: number | undefined;
  readonly contentHash?: string | undefined;
}

export interface ScenarioStageEnvelope {
  readonly stage: 'handshake' | 'interpretation' | 'route-selection' | 'step-execution' | 'recovery' | 'receipt-finalization';
  readonly lane: ScenarioStageLane;
  readonly governance: StepExecutionReceipt['governance'] | 'pending';
}

export interface ScenarioStepHandshake {
  readonly task: GroundedStep;
  readonly resolutionContext: InterfaceResolutionContext;
  readonly directive?: unknown;
}

export interface ScenarioRunState {
  previousResolution: ResolutionTarget | null;
  observedStateSession: ObservedStateSession;
}

export interface InterpretationStageInput {
  readonly task: GroundedStep;
  readonly environment: RuntimeScenarioEnvironment;
  readonly state: ScenarioRunState;
  readonly resolutionContext: InterfaceResolutionContext;
}

export interface InterpretationStageOutput {
  readonly envelope: ScenarioStageEnvelope;
  readonly interpretation: ResolutionReceipt;
  readonly runAt: string;
  readonly startedAt: number;
  readonly agentContext: {
    readonly resolutionContext: InterfaceResolutionContext;
    readonly previousResolution: ResolutionTarget | null;
    readonly observedStateSession: ObservedStateSession;
  };
}

export interface RouteSelectionStageInput {
  readonly task: GroundedStep;
  readonly context: InterfaceResolutionContext;
  readonly interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
}

export interface RouteSelectionStageOutput {
  readonly envelope: ScenarioStageEnvelope;
  readonly routeSelection: RouteSelection;
}

export interface RecoveryStageInput {
  readonly family: StepExecutionReceipt['failure']['family'];
  readonly policy: RuntimeScenarioEnvironment['recoveryPolicy'];
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}

export interface RecoveryStageOutput {
  readonly envelope: ScenarioStageEnvelope;
  readonly policyProfile: string;
  readonly attempts: StepExecutionReceipt['recovery']['attempts'];
  readonly recovered: boolean;
}

export interface ScenarioStepRunResult {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface HandshakeStageInput {
  readonly plan: ScenarioRunPlan;
  readonly zeroBasedIndex: number;
}
