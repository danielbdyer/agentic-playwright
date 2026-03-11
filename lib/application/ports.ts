import type { Effect } from 'effect';
import { Context } from 'effect';
import type { AdoId, ScreenId } from '../domain/identity';
import type { RuntimeProvider } from './runtime-provider';
import type { TesseractError } from '../domain/errors';
import type {
  ExecutionPosture,
  ResolutionReceipt,
  RuntimeInterpreterMode,
  StepExecutionReceipt,
  StepTask,
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
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
}

export interface RuntimeScenarioRunnerPort {
  runSteps(input: {
    rootDir: string;
    mode: RuntimeScenarioMode;
    runtimeProvider: RuntimeProvider;
    controlSelection?: {
      runbook?: string | null | undefined;
      dataset?: string | null | undefined;
      resolutionControl?: string | null | undefined;
    } | undefined;
    screenIds: readonly ScreenId[];
    fixtures: Record<string, unknown>;
    steps: readonly StepTask[];
    context?: {
      adoId: AdoId;
      artifactPath?: string | undefined;
      revision?: number | undefined;
      contentHash?: string | undefined;
    } | undefined;
    translationOptions?: {
      disableTranslation?: boolean | undefined;
      disableTranslationCache?: boolean | undefined;
    } | undefined;
    posture?: ExecutionPosture | undefined;
  }): Effect.Effect<RuntimeScenarioStepResult[], unknown>;
}

export class FileSystem extends Context.Tag('tesseract/FileSystem')<FileSystem, FileSystemPort>() {}
export class AdoSource extends Context.Tag('tesseract/AdoSource')<AdoSource, AdoSourcePort>() {}
export class RuntimeScenarioRunner extends Context.Tag('tesseract/RuntimeScenarioRunner')<RuntimeScenarioRunner, RuntimeScenarioRunnerPort>() {}
export class ExecutionContext extends Context.Tag('tesseract/ExecutionContext')<ExecutionContext, ExecutionContextPort>() {}

