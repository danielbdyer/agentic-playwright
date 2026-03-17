import { Effect, Layer } from 'effect';
import { AdoSource, ExecutionContext, FileSystem, RuntimeScenarioRunner } from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { makeLiveAdoSource, readLiveAdoSourceConfigFromEnv } from '../infrastructure/ado/live-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { createRecordingWorkspaceFileSystem } from '../infrastructure/fs/recording-fs';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';
import type { ExecutionPosture, WriteJournalEntry } from '../domain/types';

export interface LocalServiceOptions {
  posture?: Partial<ExecutionPosture> | undefined;
}

export interface LocalServiceContext {
  posture: ExecutionPosture;
  writeJournal(): readonly WriteJournalEntry[];
  provide<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, never>;
}

function resolveExecutionPosture(posture?: Partial<ExecutionPosture> | undefined): ExecutionPosture {
  return {
    interpreterMode: posture?.interpreterMode ?? 'diagnostic',
    writeMode: posture?.writeMode ?? 'persist',
    headed: posture?.headed ?? false,
    executionProfile: posture?.executionProfile ?? (process.env.CI ? 'ci-batch' : 'interactive'),
  };
}

function resolveAdoSource(rootDir: string) {
  const selectedSource = process.env.TESSERACT_ADO_SOURCE?.trim().toLowerCase();
  if (selectedSource !== 'live') {
    return makeLocalAdoSource(rootDir);
  }

  const config = readLiveAdoSourceConfigFromEnv(process.env);
  if (!config) {
    throw new Error('TESSERACT_ADO_SOURCE=live requires TESSERACT_ADO_ORG_URL, TESSERACT_ADO_PROJECT, TESSERACT_ADO_PAT, and TESSERACT_ADO_SUITE_PATH');
  }
  return makeLiveAdoSource(config);
}

export function createLocalServiceContext(rootDir: string, options?: LocalServiceOptions): LocalServiceContext {
  const posture = resolveExecutionPosture(options?.posture);
  const journal: WriteJournalEntry[] = [];
  const fileSystem = createRecordingWorkspaceFileSystem({
    rootDir,
    posture,
    delegate: LocalFileSystem,
    journal,
  });
  const executionContext = {
    posture,
    writeJournal: () => [...journal],
  };

  const layer = Layer.mergeAll(
    Layer.succeed(FileSystem, fileSystem),
    Layer.succeed(AdoSource, resolveAdoSource(rootDir)),
    Layer.succeed(RuntimeScenarioRunner, LocalRuntimeScenarioRunner),
    Layer.succeed(ExecutionContext, executionContext),
  );

  return {
    posture,
    writeJournal: () => executionContext.writeJournal(),
    provide<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> {
      return Effect.provide(
        program as Effect.Effect<A, E, FileSystem | AdoSource | RuntimeScenarioRunner | ExecutionContext>,
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
  result: A;
  posture: ExecutionPosture;
  wouldWrite: WriteJournalEntry[];
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
