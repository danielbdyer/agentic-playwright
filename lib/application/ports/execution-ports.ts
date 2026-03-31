import { Context, Effect } from 'effect';
import type { ResolutionEngine } from '../resolution-engine';
import type { TranslationProvider } from '../translation-provider';
import type {
  ExecutionPosture,
  ResolutionReceipt,
  RuntimeInterpreterMode,
  ScenarioRunPlan,
  StepExecutionReceipt,
  WriteJournalEntry,
} from '../../domain/types';

export interface ExecutionContextPort {
  posture: ExecutionPosture;
  writeJournal(): readonly WriteJournalEntry[];
}

export type ExecutionInterpreterMode = RuntimeInterpreterMode;

export interface ExecutionScenarioStepResult {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface ExecutionScenarioRunnerPort {
  runSteps(input: {
    rootDir: string;
    suiteRoot?: string | undefined;
    plan: ScenarioRunPlan;
    resolutionEngine: ResolutionEngine;
    translationOptions?: {
      disableTranslation?: boolean | undefined;
      disableTranslationCache?: boolean | undefined;
      translationProvider?: TranslationProvider | undefined;
    } | undefined;
  }): Effect.Effect<ExecutionScenarioStepResult[], unknown>;
}

export class ExecutionContext extends Context.Tag('tesseract/ExecutionContext')<ExecutionContext, ExecutionContextPort>() {}
export class ExecutionScenarioRunner extends Context.Tag('tesseract/ExecutionScenarioRunner')<ExecutionScenarioRunner, ExecutionScenarioRunnerPort>() {}

// Compatibility aliases (legacy runtime naming)
export type RuntimeScenarioMode = ExecutionInterpreterMode;
export type RuntimeScenarioStepResult = ExecutionScenarioStepResult;
export type RuntimeScenarioRunnerPort = ExecutionScenarioRunnerPort;
export const RuntimeScenarioRunner = ExecutionScenarioRunner;
