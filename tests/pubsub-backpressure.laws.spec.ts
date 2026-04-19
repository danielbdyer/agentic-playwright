/**
 * PubSub Backpressure — Law Tests (W5.17)
 *
 * Verifies the invariants of the pipeline event bus's bounded queue
 * and SharedArrayBuffer ring buffer:
 *
 *   1. Within capacity: events written within capacity are never lost
 *   2. Ordering: events are delivered in FIFO order within capacity
 *   3. Deterministic: same sequence of events produces same buffer state
 *   4. Capacity bound: the ring buffer never holds more than capacity slots
 *
 * Tests the pure ring buffer functions (createPipelineBuffer, writeEvent
 * via readSlot/readEventCount) directly, without running Effect fibers.
 */

import { expect, test } from '@playwright/test';
import { Duration, Effect, Fiber, PubSub, Queue } from 'effect';
import {
  createPipelineBuffer,
  readEventCount,
  readSlot,
  createStringChannel,
  createPipelineEventBus,
} from '../dashboard/bridges/pipeline-event-bus';
import type { PipelineBuffer } from '../dashboard/bridges/pipeline-event-bus';
import type { DashboardEvent } from '../product/domain/observation/dashboard';

// ─── Helpers ───

/** Build a minimal DashboardEvent with a given ordinal-friendly type and numeric payload. */
function makeEvent(type: DashboardEvent['type'], confidence: number, iteration: number): DashboardEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    data: { confidence, iteration },
  };
}

/**
 * Write an event to the buffer using the same algorithm as the pipeline event bus.
 * We re-implement writeEvent here because it is not exported from the module.
 * This mirrors the exact logic in pipeline-event-bus.ts.
 */
const SLOT_SIZE = 18;

const EVENT_TYPE_ORDINALS: Readonly<Record<string, number>> = {
  'element-probed': 1, 'element-escalated': 2, 'screen-captured': 3,
  'iteration-start': 10, 'iteration-complete': 11, 'progress': 12,
  'rung-shift': 20, 'calibration-update': 21, 'proposal-activated': 22,
  'confidence-crossed': 23, 'artifact-written': 24, 'stage-lifecycle': 25,
  'item-pending': 30, 'item-processing': 31, 'item-completed': 32,
  'fiber-paused': 33, 'fiber-resumed': 34, 'workbench-updated': 35,
  'fitness-updated': 36, 'inbox-item-arrived': 37,
  'connected': 50, 'error': 51,
};

const GOVERNANCE_ORDINALS: Readonly<Record<string, number>> = {
  'approved': 0, 'review-required': 1, 'blocked': 2,
};

const ACTOR_ORDINALS: Readonly<Record<string, number>> = {
  'system': 0, 'agent': 1, 'operator': 2,
};

const MODE_ORDINALS: Readonly<Record<string, number>> = {
  'deterministic': 0, 'translation': 1, 'agentic': 2,
};

function writeEvent(buffer: PipelineBuffer, event: DashboardEvent): void {
  const ordinal = EVENT_TYPE_ORDINALS[event.type] ?? 0;
  const data = event.data as Record<string, unknown> | null;

  const slot = Atomics.add(buffer.header, 0, 1) % buffer.capacity;
  const offset = slot * SLOT_SIZE;

  buffer.slots[offset + 0] = ordinal;
  buffer.slots[offset + 1] = Date.now();

  if (data) {
    buffer.slots[offset + 2] = (data.confidence as number) ?? 0;
    buffer.slots[offset + 3] = (data.locatorRung as number) ?? 0;
    buffer.slots[offset + 4] = GOVERNANCE_ORDINALS[(data.governance as string) ?? ''] ?? 0;
    buffer.slots[offset + 5] = ACTOR_ORDINALS[(data.actor as string) ?? ''] ?? 0;
    buffer.slots[offset + 6] = MODE_ORDINALS[(data.resolutionMode as string) ?? ''] ?? 0;
    buffer.slots[offset + 7] = (data.iteration as number) ?? 0;

    const box = data.boundingBox as { x: number; y: number; width: number; height: number } | null;
    buffer.slots[offset + 8] = box?.x ?? NaN;
    buffer.slots[offset + 9] = box?.y ?? NaN;
    buffer.slots[offset + 10] = box?.width ?? NaN;
    buffer.slots[offset + 11] = box?.height ?? NaN;
    buffer.slots[offset + 12] = (data.found as boolean) ? 1 : 0;
    buffer.slots[offset + 13] = (data.weightDrift as number) ?? 0;

    const weights = data.weights as { repairDensity: number; translationRate: number; unresolvedRate: number; inverseFragmentShare: number } | undefined;
    buffer.slots[offset + 14] = weights?.repairDensity ?? 0;
    buffer.slots[offset + 15] = weights?.translationRate ?? 0;
    buffer.slots[offset + 16] = weights?.unresolvedRate ?? 0;
    buffer.slots[offset + 17] = weights?.inverseFragmentShare ?? 0;
  }

  Atomics.add(buffer.header, 1, 1);
}

// ─── Law Tests ───

test.describe('PubSub backpressure laws', () => {

  // ─── Law 1: Within capacity — events are never lost ───

  test('Law 1: events published within capacity are all readable', () => {
    const capacity = 32;
    const buffer = createPipelineBuffer(capacity);
    const events: readonly DashboardEvent[] = Array.from({ length: capacity }, (_, i) =>
      makeEvent('progress', i * 0.1, i),
    );

    for (const event of events) {
      writeEvent(buffer, event);
    }

    expect(readEventCount(buffer)).toBe(capacity);

    // Every slot should have a valid event type ordinal for 'progress'
    for (let i = 0; i < capacity; i++) {
      const slot = readSlot(buffer, i);
      expect(slot.eventType).toBe(EVENT_TYPE_ORDINALS['progress']);
      expect(slot.iteration).toBe(i);
    }
  });

  test('Law 1b: partial fill preserves all written events', () => {
    const capacity = 64;
    const buffer = createPipelineBuffer(capacity);
    const count = 10;

    for (let i = 0; i < count; i++) {
      writeEvent(buffer, makeEvent('iteration-start', 0.5, i));
    }

    expect(readEventCount(buffer)).toBe(count);

    for (let i = 0; i < count; i++) {
      const slot = readSlot(buffer, i);
      expect(slot.eventType).toBe(EVENT_TYPE_ORDINALS['iteration-start']);
      expect(slot.iteration).toBe(i);
    }
  });

  // ─── Law 2: Ordering — FIFO within capacity ───

  test('Law 2: events are stored in FIFO order', () => {
    const capacity = 16;
    const buffer = createPipelineBuffer(capacity);

    const types: DashboardEvent['type'][] = [
      'iteration-start',
      'element-probed',
      'progress',
      'iteration-complete',
    ];

    for (let i = 0; i < types.length; i++) {
      writeEvent(buffer, makeEvent(types[i]!, 0.0, i));
    }

    // Read back in order and verify event types match
    for (let i = 0; i < types.length; i++) {
      const slot = readSlot(buffer, i);
      expect(slot.eventType).toBe(EVENT_TYPE_ORDINALS[types[i]!]);
      expect(slot.iteration).toBe(i);
    }
  });

  test('Law 2b: confidence values preserve insertion order', () => {
    const capacity = 8;
    const buffer = createPipelineBuffer(capacity);
    const confidences = [0.1, 0.5, 0.9, 0.3, 0.7];

    for (let i = 0; i < confidences.length; i++) {
      writeEvent(buffer, makeEvent('element-probed', confidences[i]!, i));
    }

    for (let i = 0; i < confidences.length; i++) {
      const slot = readSlot(buffer, i);
      expect(slot.confidence).toBeCloseTo(confidences[i]!, 10);
    }
  });

  // ─── Law 3: Deterministic — same input, same output ───

  test('Law 3: same event sequence produces identical buffer state', () => {
    const capacity = 16;
    const events: readonly DashboardEvent[] = [
      makeEvent('iteration-start', 0.0, 1),
      makeEvent('element-probed', 0.85, 1),
      makeEvent('progress', 0.5, 1),
      makeEvent('iteration-complete', 1.0, 1),
    ];

    // Write the same sequence into two independent buffers
    const bufferA = createPipelineBuffer(capacity);
    const bufferB = createPipelineBuffer(capacity);

    for (const event of events) {
      writeEvent(bufferA, event);
    }
    for (const event of events) {
      writeEvent(bufferB, event);
    }

    expect(readEventCount(bufferA)).toBe(readEventCount(bufferB));

    for (let i = 0; i < events.length; i++) {
      const slotA = readSlot(bufferA, i);
      const slotB = readSlot(bufferB, i);
      expect(slotA.eventType).toBe(slotB.eventType);
      expect(slotA.confidence).toBeCloseTo(slotB.confidence, 10);
      expect(slotA.iteration).toBe(slotB.iteration);
      expect(slotA.governance).toBe(slotB.governance);
      expect(slotA.actor).toBe(slotB.actor);
      expect(slotA.resolutionMode).toBe(slotB.resolutionMode);
    }
  });

  // ─── Law 4: Capacity bound — ring wraps, never exceeds capacity ───

  test('Law 4: ring buffer wraps at capacity boundary', () => {
    const capacity = 4;
    const buffer = createPipelineBuffer(capacity);

    // Write more events than capacity — the ring should wrap
    for (let i = 0; i < capacity + 2; i++) {
      writeEvent(buffer, makeEvent('progress', i * 0.1, i));
    }

    // Total event count is monotonic — it tracks all writes
    expect(readEventCount(buffer)).toBe(capacity + 2);

    // Slot 0 should now contain event index 4 (wrapped from slot 4 % 4 = 0)
    const slot0 = readSlot(buffer, 0);
    expect(slot0.iteration).toBe(4);

    // Slot 1 should contain event index 5 (wrapped from slot 5 % 4 = 1)
    const slot1 = readSlot(buffer, 1);
    expect(slot1.iteration).toBe(5);

    // Slots 2 and 3 should retain original events (indices 2, 3)
    const slot2 = readSlot(buffer, 2);
    expect(slot2.iteration).toBe(2);

    const slot3 = readSlot(buffer, 3);
    expect(slot3.iteration).toBe(3);
  });

  test('Law 4b: buffer capacity is exactly as specified', () => {
    const capacity = 8;
    const buffer = createPipelineBuffer(capacity);
    expect(buffer.capacity).toBe(capacity);

    // The Float64Array should have exactly capacity * SLOT_SIZE elements
    expect(buffer.slots.length).toBe(capacity * SLOT_SIZE);
  });

  test('Law 4c: writing exactly at capacity fills all slots without corruption', () => {
    const capacity = 16;
    const buffer = createPipelineBuffer(capacity);

    for (let i = 0; i < capacity; i++) {
      writeEvent(buffer, makeEvent('element-probed', i / capacity, i));
    }

    expect(readEventCount(buffer)).toBe(capacity);

    // All slots should be filled with distinct iteration values
    const iterations = new Set<number>();
    for (let i = 0; i < capacity; i++) {
      iterations.add(readSlot(buffer, i).iteration);
    }
    expect(iterations.size).toBe(capacity);
  });

  // ─── Law 5: String channel is independent of ring buffer ───

  test('Law 5: string channel accumulates latest values by event type', () => {
    const channel = createStringChannel();

    // Simulate writing string data as the pipeline event bus does
    channel.latest.set('element-probed.element', 'submit-button');
    channel.latest.set('element-probed.screen', 'login');

    expect(channel.latest.get('element-probed.element')).toBe('submit-button');
    expect(channel.latest.get('element-probed.screen')).toBe('login');

    // Overwrite with a new value — latest wins
    channel.latest.set('element-probed.element', 'cancel-button');
    expect(channel.latest.get('element-probed.element')).toBe('cancel-button');
  });

  // ─── Law 6: Empty buffer reads return zero/default values ───

  test('Law 6: reading an empty buffer returns zero-initialized slots', () => {
    const buffer = createPipelineBuffer(8);
    expect(readEventCount(buffer)).toBe(0);

    const slot = readSlot(buffer, 0);
    expect(slot.eventType).toBe(0);
    expect(slot.confidence).toBe(0);
    expect(slot.iteration).toBe(0);
  });

  test('Law 7: telemetry bridge honors dropping overflow policy', async () => {
    const published: DashboardEvent[] = [];

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const bus = yield* createPipelineEventBus({
        telemetryQueueCapacity: 1,
        telemetryOverflowPolicy: 'dropping',
      });
      const startFiber = yield* bus.start();
      const subscription = yield* PubSub.subscribe(bus.pubsub);
      const captureFiber = yield* Effect.forkScoped(Effect.forever(Effect.gen(function* () {
          const event = yield* Queue.take(subscription);
          published.push(event);
      })));

      yield* Effect.all([
        bus.dashboardPort.emit(makeEvent('progress', 0.1, 1)),
        bus.dashboardPort.emit(makeEvent('progress', 0.2, 2)),
        bus.dashboardPort.emit(makeEvent('progress', 0.3, 3)),
        bus.dashboardPort.emit(makeEvent('progress', 0.4, 4)),
        bus.dashboardPort.emit(makeEvent('progress', 0.5, 5)),
      ], { concurrency: 'unbounded' });

      yield* Effect.sleep(Duration.millis(25));
      yield* Fiber.interrupt(captureFiber);
      yield* Fiber.interrupt(startFiber);
    })));

    expect(published.length).toBeLessThan(5);
    expect(published.length).toBeGreaterThan(0);
  });

  test('Law 8: decision flow is lossless under pressure', async () => {
    const received: DashboardEvent[] = [];

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const bus = yield* createPipelineEventBus({
        decisionTimeoutMs: 1,
        decisionQueueCapacity: 1,
        telemetryQueueCapacity: 1,
        telemetryOverflowPolicy: 'dropping',
      });
      const startFiber = yield* bus.start();
      const subscriber = yield* PubSub.subscribe(bus.pubsub);
      const captureFiber = yield* Effect.forkScoped(Effect.forever(Effect.gen(function* () {
        const event = yield* Queue.take(subscriber);
        if (event.type === 'item-pending' || event.type === 'item-completed') {
          received.push(event);
        }
      })));

      yield* Effect.all([
        bus.dashboardPort.awaitDecision({ id: 'item-1', title: 'a', description: 'a' } as never),
        bus.dashboardPort.awaitDecision({ id: 'item-2', title: 'b', description: 'b' } as never),
        bus.dashboardPort.awaitDecision({ id: 'item-3', title: 'c', description: 'c' } as never),
      ], { concurrency: 'unbounded' });

      yield* Effect.sleep(Duration.millis(30));
      yield* Fiber.interrupt(captureFiber);
      yield* Fiber.interrupt(startFiber);
    })));

    const pending = received.filter((event) => event.type === 'item-pending');
    const completed = received.filter((event) => event.type === 'item-completed');
    expect(pending.length).toBe(3);
    expect(completed.length).toBe(3);
  });
});
