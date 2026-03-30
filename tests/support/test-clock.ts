import { Clock, Duration, Effect, Layer } from 'effect';

export interface DeterministicTestClock {
  readonly clock: Clock.Clock;
  readonly layer: Layer.Layer<Clock.Clock>;
  readonly advanceBy: (ms: number) => Effect.Effect<void>;
  readonly setTime: (ms: number) => Effect.Effect<void>;
  readonly now: Effect.Effect<number>;
}

export function makeDeterministicTestClock(startMs = 0): DeterministicTestClock {
  const state = { now: startMs };
  const clock: Clock.Clock = {
    [Clock.ClockTypeId]: Clock.ClockTypeId,
    unsafeCurrentTimeMillis: () => state.now,
    currentTimeMillis: Effect.sync(() => state.now),
    unsafeCurrentTimeNanos: () => BigInt(state.now * 1_000_000),
    currentTimeNanos: Effect.sync(() => BigInt(state.now * 1_000_000)),
    sleep: (duration) => Effect.sync(() => {
      state.now += Duration.toMillis(Duration.decode(duration));
    }),
  };

  return {
    clock,
    layer: Layer.succeed(Clock.Clock, clock),
    advanceBy: (ms: number) => Effect.sync(() => {
      state.now += ms;
    }),
    setTime: (ms: number) => Effect.sync(() => {
      state.now = ms;
    }),
    now: Effect.sync(() => state.now),
  };
}
