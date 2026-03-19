import { Effect, Layer } from 'effect';
import {
  AdoSource,
  ExecutionContext,
  FileSystem,
  PipelineConfigService,
  RuntimeScenarioRunner,
  VersionControl,
} from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { makeLiveAdoSource, readLiveAdoSourceConfigFromEnv } from '../infrastructure/ado/live-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { makeLocalVersionControl } from '../infrastructure/tooling/local-version-control';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, PipelineConfig, WriteJournalEntry } from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';

export interface LocalServiceOptions {
  readonly posture?: Partial<ExecutionPosture> | undefined;
  readonly suiteRoot?: string | undefined;
  readonly pipelineConfig?: PipelineConfig | undefined;
}

export interface LocalServiceContext {
  readonly posture: ExecutionPosture;
  readonly writeJournal: () => readonly WriteJournalEntry[];
  readonly provide: <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.Effect<A, E, never>;
}

function resolveExecutionPosture(posture?: Partial<ExecutionPosture> | undefined): ExecutionPosture {
  return {
    interpreterMode: posture?.interpreterMode ?? 'diagnostic',
    writeMode: posture?.writeMode ?? 'persist',
    headed: posture?.headed ?? false,
    executionProfile: posture?.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive'),
  };
}

function resolveAdoSource(rootDir: string, suiteRoot?: string) {
  const selectedSource = process.env.TESSERACT_ADO_SOURCE?.trim().toLowerCase();
  if (selectedSource !== 'live') {
    return makeLocalAdoSource(rootDir, suiteRoot);
  }

  const config = readLiveAdoSourceConfigFromEnv(process.env);
  if (!config) {
    throw new Error('TESSERACT_ADO_SOURCE=live requires TESSERACT_ADO_ORG_URL, TESSERACT_ADO_PROJECT, TESSERACT_ADO_PAT, and TESSERACT_ADO_SUITE_PATH');
  }
  return makeLiveAdoSource(config);
}

export function createLocalServiceContext(rootDir: string, options?: LocalServiceOptions): LocalServiceContext {
  const posture = resolveExecutionPosture(options?.posture);
  const suiteRoot = options?.suiteRoot;
  const journal: WriteJournalEntry[] = [];
  const fileSystem = createRecordingWorkspaceFileSystem({
    rootDir,
    suiteRoot,
    posture,
    delegate: LocalFileSystem,
    journal,
  });
  const executionContext = {
    posture,
    writeJournal: () => [...journal],
  };

  const pipelineConfig = options?.pipelineConfig ?? DEFAULT_PIPELINE_CONFIG;
  const layer = Layer.mergeAll(
    Layer.succeed(FileSystem, fileSystem),
    Layer.succeed(AdoSource, resolveAdoSource(rootDir, suiteRoot)),
    Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner),
    Layer.succeed(ExecutionContext, executionContext),
    Layer.succeed(PipelineConfigService, { config: pipelineConfig }),
    Layer.succeed(VersionControl, makeLocalVersionControl(rootDir)),
  );

  return {
    posture,
    writeJournal: () => executionContext.writeJournal(),
    provide<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> {
      return Effect.provide(
        program as Effect.Effect<A, E, FileSystem | AdoSource | RuntimeScenarioRunner | ExecutionContext | PipelineConfigService | VersionControl>,
        layer,
      ) as Effect.Effect<A, E, never>;
    },
  };
}

export function provideLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Effect.Effect<A, E, never> {
  return createLocalServiceContext(rootDir, options).provide(program);
}

export interface RunWithLocalServicesResult<A> {
  readonly result: A;
  readonly posture: ExecutionPosture;
  readonly wouldWrite: readonly WriteJournalEntry[];
}

export function runWithLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Promise<A> {
  return Effect.runPromise(provideLocalServices(program, rootDir, options));
}

export async function runWithLocalServicesDetailed<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
  options?: LocalServiceOptions,
): Promise<RunWithLocalServicesResult<A>> {
  const context = createLocalServiceContext(rootDir, options);
  const result = await Effect.runPromise(context.provide(program));
  return {
    result,
    posture: context.posture,
    wouldWrite: [...context.writeJournal()],
  };
}
