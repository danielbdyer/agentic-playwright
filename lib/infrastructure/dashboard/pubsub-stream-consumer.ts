import { Duration, Effect, Fiber, PubSub, Scope, Stream } from 'effect';
import type { DashboardEvent, DashboardEventKind } from '../../domain/types';

export interface StreamBatchingConfig {
  readonly maxBatchSize: number;
  readonly flushIntervalMs: number;
}

export interface SubscribePubSubStreamConsumerOptions {
  readonly eventKinds?: ReadonlySet<DashboardEventKind>;
  readonly batching?: StreamBatchingConfig;
  readonly onEvent?: (event: DashboardEvent) => Effect.Effect<void>;
  readonly onBatch?: (events: ReadonlyArray<DashboardEvent>) => Effect.Effect<void>;
  readonly onError?: (error: unknown) => Effect.Effect<void>;
}

const includesKind = (
  eventKinds: ReadonlySet<DashboardEventKind> | undefined,
  event: DashboardEvent,
): boolean => eventKinds ? eventKinds.has(event.type) : true;

const toConsumerEffect = (
  stream: Stream.Stream<DashboardEvent>,
  options: SubscribePubSubStreamConsumerOptions,
): Effect.Effect<void> => {
  if (options.batching) {
    const batched = Stream.groupedWithin(
      stream,
      options.batching.maxBatchSize,
      Duration.millis(options.batching.flushIntervalMs),
    );
    return Stream.runForEach(
      batched,
      (events) => options.onBatch
        ? options.onBatch(Array.from(events))
        : Effect.forEach(events, (event) => options.onEvent ? options.onEvent(event) : Effect.void, { discard: true }),
    );
  }

  return Stream.runForEach(
    stream,
    (event) => options.onEvent
      ? options.onEvent(event)
      : options.onBatch
        ? options.onBatch([event])
        : Effect.void,
  );
};

export function subscribePubSubStreamConsumer(
  pubsub: PubSub.PubSub<DashboardEvent>,
  options: SubscribePubSubStreamConsumerOptions,
): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope> {
  return Effect.gen(function* () {
    const subscription = yield* PubSub.subscribe(pubsub);
    const source = Stream.filter(
      Stream.fromQueue(subscription),
      (event) => includesKind(options.eventKinds, event),
    );

    const consume = Effect.catchAll(
      toConsumerEffect(source, options),
      (error) => options.onError ? options.onError(error) : Effect.logError(error),
    );

    return yield* Effect.fork(consume);
  });
}
