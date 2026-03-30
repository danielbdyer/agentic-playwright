import { expect, test } from '@playwright/test';
import { Effect, Fiber, PubSub } from 'effect';
import type { DashboardEvent } from '../lib/domain/types';
import { subscribePubSubStreamConsumer } from '../lib/infrastructure/dashboard/pubsub-stream-consumer';

const makeEvent = (seq: number): DashboardEvent => ({
  type: 'progress',
  timestamp: new Date().toISOString(),
  data: { seq },
});

test.describe('Dashboard stream consumer laws', () => {
  test('Law: no event loss and FIFO ordering under burst load', async () => {
    const eventCount = 2_000;

    const seen = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const pubsub = yield* PubSub.bounded<DashboardEvent>(4_096);
          const ordered: number[] = [];

          const consumerFiber = yield* subscribePubSubStreamConsumer(
            pubsub,
            {
              onEvent: (event) => Effect.sync(() => {
                ordered.push((event.data as { seq: number }).seq);
              }),
            },
          );

          yield* Effect.forEach(
            Array.from({ length: eventCount }, (_, index) => index),
            (index) => PubSub.publish(pubsub, makeEvent(index)),
            { discard: true },
          );

          yield* Effect.sleep('100 millis');
          yield* Fiber.interrupt(consumerFiber);
          return ordered;
        }),
      ),
    );

    expect(seen).toHaveLength(eventCount);
    expect(seen).toEqual(Array.from({ length: eventCount }, (_, index) => index));
  });

  test('Law: groupedWithin batching keeps spaced flush semantics', async () => {
    const publishTime = Date.now();
    const batches = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const pubsub = yield* PubSub.bounded<DashboardEvent>(256);
          const observed: Array<{ readonly at: number; readonly seqs: readonly number[] }> = [];

          const consumerFiber = yield* subscribePubSubStreamConsumer(
            pubsub,
            {
              batching: {
                maxBatchSize: 64,
                flushIntervalMs: 40,
              },
              onBatch: (events) => Effect.sync(() => {
                observed.push({
                  at: Date.now(),
                  seqs: events.map((event) => (event.data as { seq: number }).seq),
                });
              }),
            },
          );

          yield* PubSub.publish(pubsub, makeEvent(1));
          yield* Effect.sleep('10 millis');
          yield* PubSub.publish(pubsub, makeEvent(2));
          yield* Effect.sleep('70 millis');
          yield* PubSub.publish(pubsub, makeEvent(3));
          yield* Effect.sleep('70 millis');

          yield* Fiber.interrupt(consumerFiber);
          return observed;
        }),
      ),
    );

    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches[0]!.at - publishTime).toBeGreaterThanOrEqual(30);
    expect(batches[0]!.seqs).toEqual([1, 2]);
    expect(batches.flatMap((batch) => batch.seqs)).toEqual([1, 2, 3]);
  });
});
