import { Effect } from 'effect';
import { AdoSource, ExecutionContext, FileSystem, RuntimeScenarioRunner } from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
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
  };
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

  return {
    posture,
    writeJournal: () => executionContext.writeJournal(),
    provide<A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, never> {
      return Effect.provideService(
        Effect.provideService(
          Effect.provideService(
            Effect.provideService(
              program as Effect.Effect<A, E, FileSystem | AdoSource | RuntimeScenarioRunner | ExecutionContext>,
              FileSystem,
              fileSystem,
            ),
            AdoSource,
            makeLocalAdoSource(rootDir),
          ),
          RuntimeScenarioRunner,
          LocalRuntimeScenarioRunner,
        ),
        ExecutionContext,
        executionContext,
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
