import type { Effect } from 'effect';
import { Context } from 'effect';
import type { AdoId } from '../domain/identity';
import type { ResolutionEngine } from './resolution-engine';
import type { TranslationProvider } from './translation-provider';
import type { TesseractError } from '../domain/errors';
import type {
  ExecutionPosture,
  ResolutionReceipt,
  RuntimeInterpreterMode,
  ScenarioRunPlan,
  StepExecutionReceipt,
  WriteJournalEntry,
} from '../domain/types';

export interface FileSystemPort {
  readText(path: string): Effect.Effect<string, TesseractError>;
  writeText(path: string, contents: string): Effect.Effect<void, TesseractError>;
  readJson(path: string): Effect.Effect<unknown, TesseractError>;
  writeJson(path: string, value: unknown): Effect.Effect<void, TesseractError>;
  exists(path: string): Effect.Effect<boolean, TesseractError>;
  listDir(path: string): Effect.Effect<string[], TesseractError>;
  ensureDir(path: string): Effect.Effect<void, TesseractError>;
}

export interface ExecutionContextPort {
  posture: ExecutionPosture;
  writeJournal(): readonly WriteJournalEntry[];
}

export interface AdoSourcePort {
  listSnapshotIds(): Effect.Effect<AdoId[], TesseractError>;
  loadSnapshot(adoId: AdoId): Effect.Effect<unknown, TesseractError>;
}

export type RuntimeScenarioMode = RuntimeInterpreterMode;

export interface RuntimeScenarioStepResult {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface RuntimeScenarioRunnerPort {
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
  }): Effect.Effect<RuntimeScenarioStepResult[], unknown>;
}

export class FileSystem extends Context.Tag('tesseract/FileSystem')<FileSystem, FileSystemPort>() {}
export class AdoSource extends Context.Tag('tesseract/AdoSource')<AdoSource, AdoSourcePort>() {}
export class RuntimeScenarioRunner extends Context.Tag('tesseract/RuntimeScenarioRunner')<RuntimeScenarioRunner, RuntimeScenarioRunnerPort>() {}
export class ExecutionContext extends Context.Tag('tesseract/ExecutionContext')<ExecutionContext, ExecutionContextPort>() {}

