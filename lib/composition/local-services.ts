import { Effect } from 'effect';
import { AdoSource, FileSystem, RuntimeScenarioRunner } from '../application/ports';
import { makeLocalAdoSource } from '../infrastructure/ado/local-ado-source';
import { LocalFileSystem } from '../infrastructure/fs/local-fs';
import { LocalRuntimeScenarioRunner } from './local-runtime-scenario-runner';

export function provideLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
): Effect.Effect<A, E, never> {
  return Effect.provideService(
    Effect.provideService(
      Effect.provideService(
        program as Effect.Effect<A, E, FileSystem | AdoSource | RuntimeScenarioRunner>,
        FileSystem,
        LocalFileSystem,
      ),
      AdoSource,
      makeLocalAdoSource(rootDir),
    ),
    RuntimeScenarioRunner,
    LocalRuntimeScenarioRunner,
  ) as Effect.Effect<A, E, never>;
}

export function runWithLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
): Promise<A> {
  return Effect.runPromise(provideLocalServices(program, rootDir));
}
