import { Effect } from 'effect';
import { TesseractError, toTesseractError } from '../domain/errors';

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

