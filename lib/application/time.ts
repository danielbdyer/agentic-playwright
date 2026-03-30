import { Clock, Effect } from 'effect';

export const nowMillis: Effect.Effect<number> = Clock.currentTimeMillis;

export const elapsedSince = (startMs: number): Effect.Effect<number> =>
  nowMillis.pipe(Effect.map((nowMs) => nowMs - startMs));
