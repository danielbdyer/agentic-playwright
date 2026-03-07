import { Effect } from 'effect';
import { AdoSource, FileSystem } from '../application/ports';
import { makeLocalAdoSource } from './ado/local-ado-source';
import { LocalFileSystem } from './fs/local-fs';

export function provideLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
): Effect.Effect<A, E, never> {
  return Effect.provideService(
    Effect.provideService(program as Effect.Effect<A, E, FileSystem | AdoSource>, FileSystem, LocalFileSystem),
    AdoSource,
    makeLocalAdoSource(rootDir),
  ) as Effect.Effect<A, E, never>;
}

export function runWithLocalServices<A, E, R>(
  program: Effect.Effect<A, E, R>,
  rootDir: string,
): Promise<A> {
  return Effect.runPromise(provideLocalServices(program, rootDir));
}
