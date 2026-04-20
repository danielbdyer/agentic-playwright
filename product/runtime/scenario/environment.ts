/**
 * Scenario environment types — carved out of
 * `product/runtime/scenario.ts` at Step 4a per
 * `docs/v2-direction.md §6 Step 4a`.
 *
 * The `RuntimeScenarioEnvironment` is the configuration payload
 * every scenario run receives — mode, provider, posture, injected
 * agent, page, translators, recovery policy, semantic dictionary.
 * Extracting it from `scenario.ts` lets callers import the
 * environment shape without dragging in the whole orchestrator.
 *
 * Pure types — no Effect, no IO.
 */

import type { Page } from '@playwright/test';
import type { ExecutionBudgetThresholds } from '../../domain/commitment/telemetry';
import type { RecoveryPolicy } from '../../domain/commitment/recovery-policy';
import type { SnapshotTemplateLoader } from '../../domain/commitment/runtime-loaders';
import type { ExecutionPosture } from '../../domain/governance/workflow-types';
import type { StepExecutionReceipt, ExecutionDiagnostic } from '../../domain/execution/types';
import type { SemanticDictionaryAccrualInput } from '../../domain/knowledge/semantic-dictionary-types';
import type { InterfaceResolutionContext } from '../../domain/knowledge/types';
import type { GroundedStep, ResolutionReceipt, ScenarioRunPlan, TranslationReceipt, TranslationRequest } from '../../domain/resolution/types';
import type { RuntimeDomResolver } from '../../domain/resolution/types';
import type { ScenarioRunState } from '../../domain/aggregates/runtime-scenario-run';
import type { InterpreterMode, InterpreterScreenRegistry } from '../interpreters/types';
import type { RuntimeStepAgent } from '../resolution/agent';
import type { RuntimeAgentInterpreter } from '../resolution/types';
import { RuntimeError } from '../../domain/kernel/errors';
import { createScenarioRunState as createScenarioRunStateAggregate } from '../../domain/aggregates/runtime-scenario-run';

export interface RuntimeScenarioEnvironment {
  mode: InterpreterMode;
  provider: string;
  posture?: ExecutionPosture | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  translator?: ((request: TranslationRequest) => Promise<TranslationReceipt>) | undefined;
  fixtures: Record<string, unknown>;
  screens: InterpreterScreenRegistry;
  snapshotLoader: SnapshotTemplateLoader;
  agent?: RuntimeStepAgent | undefined;
  page?: Page | undefined;
  domResolver?: RuntimeDomResolver | undefined;
  agentInterpreter?: RuntimeAgentInterpreter | undefined;
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
  /** Semantic dictionary catalog, loaded once per run and injected for all steps. */
  semanticDictionary?: import('../../domain/knowledge/semantic-dictionary-types').SemanticDictionaryCatalog | undefined;
}

export type { ScenarioRunState };

export interface ScenarioStepRunResult {
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
  /** Semantic dictionary learning signal: accrual input when a later rung resolved. */
  semanticAccrual?: SemanticDictionaryAccrualInput | null | undefined;
  /** Entry ID of the dictionary entry that was used, for success/failure tracking. */
  semanticDictionaryHitId?: string | null | undefined;
}

export interface ScenarioStepHandshake {
  task: GroundedStep;
  resolutionContext: InterfaceResolutionContext;
  directive?: unknown;
}

export function stepHandshakeFromPlan(plan: ScenarioRunPlan, zeroBasedIndex: number): ScenarioStepHandshake {
  const step = plan.steps[zeroBasedIndex] ?? null;
  if (!step) {
    throw new RuntimeError('runtime-missing-run-plan-step', `Missing run plan step ${zeroBasedIndex + 1} for ${plan.adoId}`);
  }
  return {
    task: step,
    directive: undefined,
    resolutionContext: plan.resolutionContext,
  };
}

export const createScenarioRunState = createScenarioRunStateAggregate;

export function executionDiagnosticsFromError(
  code: string,
  message: string,
  context?: Record<string, string>,
): ExecutionDiagnostic[] {
  return [{ code, message, context }];
}
