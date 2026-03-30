import { Effect, Schedule, Duration, Ref } from 'effect';
import type { TesseractError, FileSystemError } from '../domain/errors';
import { toTesseractError, toFileSystemError } from '../domain/errors';

export interface RetryAttempt<E> {
  readonly attempt: number;
  readonly error: E;
}

export interface RetryConfig<E> {
  readonly baseDelayMs: number;
  readonly maxRecurs: number;
  readonly shouldRetry: (error: E) => boolean;
  readonly onRetry?: ((attempt: RetryAttempt<E>) => void) | undefined;
}

export type RetryResult<A, E> =
  | { readonly ok: true; readonly value: A; readonly retryAttempts: number }
  | { readonly ok: false; readonly error: E; readonly retryAttempts: number };

export function exponentialJitterSchedule(baseDelayMs: number, maxRecurs: number): Schedule.Schedule<readonly [Duration.Duration, number]> {
  return Schedule.intersect(
    Schedule.jittered(Schedule.exponential(Duration.millis(baseDelayMs))),
    Schedule.recurs(maxRecurs),
  );
}

export function retryWithBackoff<E>(
  config: RetryConfig<E>,
): <A>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E> {
  return (effect) => effect.pipe(
    Effect.retry({
      schedule: exponentialJitterSchedule(config.baseDelayMs, config.maxRecurs),
      while: (error) => config.shouldRetry(error),
    }),
  );
}

export function retryWithBackoffResult<A, E>(
  effectFactory: () => Effect.Effect<A, E>,
  config: RetryConfig<E>,
): Effect.Effect<RetryResult<A, E>, never> {
  return Effect.gen(function* () {
    const retries = yield* Ref.make(0);
    const withRetry = effectFactory().pipe(
      Effect.retry({
        schedule: exponentialJitterSchedule(config.baseDelayMs, config.maxRecurs),
        while: (error) => Effect.gen(function* () {
          const shouldRetry = config.shouldRetry(error);
          if (!shouldRetry) {
            return false;
          }
          const attempt = yield* Ref.updateAndGet(retries, (count) => count + 1);
          if (config.onRetry) {
            yield* Effect.sync(() => config.onRetry?.({ attempt, error }));
          }
          return true;
        }),
      }),
    );

    return yield* withRetry.pipe(
      Effect.matchEffect({
        onFailure: (error) => Ref.get(retries).pipe(
          Effect.map((retryAttempts) => ({ ok: false as const, error, retryAttempts })),
        ),
        onSuccess: (value) => Ref.get(retries).pipe(
          Effect.map((retryAttempts) => ({ ok: true as const, value, retryAttempts })),
        ),
      }),
    );
  });
}

export function trySync<A>(
  thunk: () => A,
  code: string,
  message: string,
): Effect.Effect<A, TesseractError> {
  return Effect.try({
    try: thunk,
    catch: (cause) => toTesseractError(cause, code, message),
  });
}

export function tryAsync<A>(
  thunk: () => Promise<A>,
  code: string,
  message: string,
): Effect.Effect<A, TesseractError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => toTesseractError(cause, code, message),
  });
}

export function tryFileSystem<A>(
  thunk: () => Promise<A>,
  code: string,
  message: string,
  filePath?: string,
): Effect.Effect<A, FileSystemError> {
  return Effect.tryPromise({
    try: thunk,
    catch: (cause) => toFileSystemError(cause, code, message, filePath),
  });
}
