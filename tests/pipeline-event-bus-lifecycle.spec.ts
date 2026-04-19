import { expect, test } from '@playwright/test';
import { Duration, Effect } from 'effect';
import {
  createPipelineEventBus,
  readEventCount,
  subscribeWsBroadcaster,
} from '../dashboard/bridges/pipeline-event-bus';
import type { PipelineEventBus } from '../dashboard/bridges/pipeline-event-bus';

test.describe('pipeline event bus lifecycle', () => {
  test('buffer writer finalizes with scope shutdown', async () => {
    let busRef: PipelineEventBus | null = null;
    let eventCountAtScopeExit = 0;

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const bus = yield* createPipelineEventBus({
        telemetryQueueCapacity: 16,
        telemetryOverflowPolicy: 'backpressure',
      });
      busRef = bus;

      yield* bus.start();
      yield* bus.dashboardPort.emit({
        type: 'progress',
        timestamp: new Date().toISOString(),
        data: { confidence: 0.5, iteration: 1 },
      });
      yield* Effect.sleep(Duration.millis(20));
      eventCountAtScopeExit = readEventCount(bus.buffer);
    })));

    expect(busRef).not.toBeNull();
    expect(eventCountAtScopeExit).toBeGreaterThan(0);

    await Effect.runPromise(busRef!.dashboardPort.emit({
      type: 'progress',
      timestamp: new Date().toISOString(),
      data: { confidence: 0.7, iteration: 2 },
    }));
    await Effect.runPromise(Effect.sleep(Duration.millis(20)));

    const countAfterScope = readEventCount(busRef!.buffer);
    expect(countAfterScope).toBe(eventCountAtScopeExit);
  });

  test('ws subscriber finalizes with scope shutdown', async () => {
    const broadcasts: unknown[] = [];
    let busRef: PipelineEventBus | null = null;
    let broadcastCountAtScopeExit = 0;

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const bus = yield* createPipelineEventBus({
        telemetryQueueCapacity: 16,
        telemetryOverflowPolicy: 'backpressure',
      });
      busRef = bus;

      yield* bus.start();
      yield* subscribeWsBroadcaster(bus.pubsub, (event) => {
        broadcasts.push(event);
      });

      yield* bus.dashboardPort.emit({
        type: 'progress',
        timestamp: new Date().toISOString(),
        data: { confidence: 0.2, iteration: 1 },
      });
      yield* Effect.sleep(Duration.millis(20));
      broadcastCountAtScopeExit = broadcasts.length;
    })));

    expect(broadcastCountAtScopeExit).toBeGreaterThan(0);

    await Effect.runPromise(busRef!.dashboardPort.emit({
      type: 'progress',
      timestamp: new Date().toISOString(),
      data: { confidence: 0.9, iteration: 9 },
    }));
    await Effect.runPromise(Effect.sleep(Duration.millis(20)));

    expect(broadcasts.length).toBe(broadcastCountAtScopeExit);
  });
});
