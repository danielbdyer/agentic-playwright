import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { withExecutionContext, getExecutionContext } from '../../lib/application/commitment/execution-context';
import { runPipelineStage } from '../../lib/application/pipeline/stage';
import { StageTracer } from '../../lib/application/ports';

import { createPipelineEventBus, subscribeWsBroadcaster } from '../../lib/infrastructure/dashboard/pipeline-event-bus';


test('withExecutionContext preserves outer values and deterministically restores after nested override', async () => {
  const snapshots = await Effect.runPromise(
    withExecutionContext({ adoId: '10001', runId: 'run-1', workItemId: 'work-item-1' })(
      Effect.gen(function* () {
        const outer = yield* getExecutionContext();
        const nested = yield* withExecutionContext({ runId: 'run-2', iteration: 3 })(getExecutionContext());
        const restored = yield* getExecutionContext();
        return { outer, nested, restored };
      }),
    ),
  );

  expect(snapshots.outer).toEqual({ adoId: '10001', runId: 'run-1', workItemId: 'work-item-1' });
  expect(snapshots.nested).toEqual({
    adoId: '10001',
    runId: 'run-2',
    iteration: 3,
    workItemId: 'work-item-1',
  });
  expect(snapshots.restored).toEqual({ adoId: '10001', runId: 'run-1', workItemId: 'work-item-1' });
});

test('stage lifecycle events inherit ids from FiberRef when event payload omits them', async () => {
  const lifecycleEvents: unknown[] = [];

  const tracer = {
    emitStageStart: (data: unknown) => Effect.sync(() => {
      lifecycleEvents.push(data);
    }),
    emitStageComplete: (data: unknown) => Effect.sync(() => {
      lifecycleEvents.push(data);
    }),
  };

  await Effect.runPromise(
    withExecutionContext({ adoId: '10001', runId: 'run-1', iteration: 4, workItemId: 'work-item-7' })(
      runPipelineStage({
        name: 'trace-stage',
        compute: () => Effect.succeed({ ok: true }),
      }).pipe(Effect.provideService(StageTracer, tracer)),
    ),
  );

  expect(lifecycleEvents).toHaveLength(2);

  const start = lifecycleEvents[0] as Record<string, unknown>;
  expect(start.phase).toBe('start');
  expect(start.stage).toBe('trace-stage');
  expect(start.adoId).toBe('10001');
  expect(start.runId).toBe('run-1');
  expect(start.iteration).toBe(4);
  expect(start.workItemId).toBe('work-item-7');

  const complete = lifecycleEvents[1] as Record<string, unknown>;
  expect(complete.phase).toBe('complete');
  expect(complete.stage).toBe('trace-stage');
  expect(complete.adoId).toBe('10001');
  expect(complete.runId).toBe('run-1');
  expect(complete.iteration).toBe(4);
  expect(complete.workItemId).toBe('work-item-7');
});


test('dashboard event bus enriches emitted events with FiberRef ids when omitted', async () => {
  const received: unknown[] = [];

  await Effect.runPromise(Effect.scoped(withExecutionContext({ adoId: '10002', runId: 'run-9', iteration: 8 })(Effect.gen(function* () {
    const bus = yield* createPipelineEventBus({
      telemetryQueueCapacity: 8,
      telemetryOverflowPolicy: 'backpressure',
    });

    yield* bus.start();
    yield* subscribeWsBroadcaster(bus.pubsub, (event) => {
      received.push(event);
    });

    yield* bus.dashboardPort.emit({
      type: 'stage-lifecycle',
      timestamp: new Date().toISOString(),
      data: { phase: 'start', stage: 'compile' },
    });

    yield* Effect.sleep('25 millis');
  }))));

  expect(received.length).toBeGreaterThan(0);
  const event = received[0] as { readonly data: Record<string, unknown> };
  expect(event.data.adoId).toBe('10002');
  expect(event.data.runId).toBe('run-9');
  expect(event.data.iteration).toBe(8);
  expect(event.data.stage).toBe('compile');
});
