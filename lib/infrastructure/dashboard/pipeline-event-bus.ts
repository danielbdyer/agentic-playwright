/**
 * Pipeline Event Bus — Effect PubSub + SharedArrayBuffer ring buffer.
 *
 * The event bus is the backbone connecting the Effect pipeline to all
 * consumers (dashboard visualization, WS broadcast, CLI, metrics).
 *
 * Architecture:
 *   Effect fiber → DashboardPort.emit()
 *     → Effect.PubSub (event bus — multi-consumer, backpressure-aware)
 *       → Subscriber 1: SharedArrayBuffer writer (lock-free ring buffer)
 *       → Subscriber 2: WS broadcast (remote browser access)
 *       → Subscriber 3: (future) CLI, metrics, logging
 *
 * The SharedArrayBuffer ring buffer enables zero-copy, zero-serialization
 * event transfer between the pipeline and the visualization. The React
 * dashboard reads from the buffer at its own frame rate via usePipelineBuffer.
 *
 * Effect is the first-class citizen:
 *   - PubSub is an Effect-native concurrent data structure
 *   - Subscribers are Effect fibers with structured concurrency
 *   - Backpressure propagates naturally through Effect's fiber model
 *   - The DashboardPort implementation is a thin wrapper over PubSub.publish
 *
 * Complexity:
 *   publish:  O(1) amortized — PubSub distributes to all subscribers
 *   buffer write: O(1) — atomic pointer advance + memcpy to slot
 *   buffer read:  O(1) — atomic pointer read + slot access
 *   subscribe: O(1) — register fiber with PubSub
 */

import type { Scope } from 'effect';
import { Effect, Fiber, PubSub, Queue } from 'effect';
import type { DashboardPort } from '../../application/ports';
import type { DashboardEvent, WorkItemDecision } from '../../domain/observation/dashboard';
import { dashboardEvent } from '../../domain/observation/dashboard';
import { runForkFromRuntimeBoundary } from './runtime-boundary';
import { enrichEventDataWithExecutionContext } from '../../application/commitment/execution-context';

// ─── Event Encoding ───
// Dashboard events are encoded as fixed-size numeric slots in the
// SharedArrayBuffer for zero-copy transfer. String data (element names,
// screen IDs) goes through a separate TextEncoder channel.

/** Numeric event slot layout (Float64Array):
 *  [0] eventType (enum ordinal)
 *  [1] timestamp (Date.now() as number)
 *  [2] confidence
 *  [3] locatorRung
 *  [4] governance (0=approved, 1=review-required, 2=blocked)
 *  [5] actor (0=system, 1=agent, 2=operator)
 *  [6] resolutionMode (0=deterministic, 1=translation, 2=agentic)
 *  [7] iteration
 *  [8-11] boundingBox (x, y, width, height) or NaN if null
 *  [12] found (0 or 1)
 *  [13] weightDrift
 *  [14-17] bottleneck weights (repairDensity, translationRate, unresolvedRate, inverseFragmentShare)
 */
const SLOT_SIZE = 18; // Float64 values per event

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

// ─── Ring Buffer (SharedArrayBuffer-backed) ───

/** Header layout in Int32Array:
 *  [0] writeHead — next slot to write (atomic)
 *  [1] eventCount — total events written (atomic, monotonic) */
const HEADER_SIZE = 2; // Int32 values
const HEADER_BYTES = HEADER_SIZE * 4;

export interface PipelineBuffer {
  /** The SharedArrayBuffer backing the ring. */
  readonly sab: SharedArrayBuffer;
  /** Maximum event slots in the ring. */
  readonly capacity: number;
  /** Int32 view for atomic header operations. */
  readonly header: Int32Array;
  /** Float64 view for event slot data. */
  readonly slots: Float64Array;
}

/** Create a pipeline buffer with the given event capacity. O(1). */
export function createPipelineBuffer(capacity = 1024): PipelineBuffer {
  const slotBytes = capacity * SLOT_SIZE * 8; // Float64 = 8 bytes
  const totalBytes = HEADER_BYTES + slotBytes;
  const sab = new SharedArrayBuffer(totalBytes);
  return {
    sab,
    capacity,
    header: new Int32Array(sab, 0, HEADER_SIZE),
    slots: new Float64Array(sab, HEADER_BYTES),
  };
}

/** O(1). Write an event into the next slot using atomic pointer advance. */
function writeEvent(buffer: PipelineBuffer, event: DashboardEvent): void {
  const ordinal = EVENT_TYPE_ORDINALS[event.type] ?? 0;
  const data = event.data as Record<string, unknown> | null;

  // Atomic advance of write head (modulo capacity)
  const slot = Atomics.add(buffer.header, 0, 1) % buffer.capacity;
  const offset = slot * SLOT_SIZE;

  buffer.slots[offset + 0] = ordinal;
  buffer.slots[offset + 1] = Date.now();

  // Pack event-specific numeric fields
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

  // Atomic increment of total event count (monotonic)
  Atomics.add(buffer.header, 1, 1);
}

/** O(1). Read the latest event count (for polling). */
export function readEventCount(buffer: PipelineBuffer): number {
  return Atomics.load(buffer.header, 1);
}

/** O(1). Read event data from a specific slot. */
export function readSlot(buffer: PipelineBuffer, index: number): {
  readonly eventType: number;
  readonly timestamp: number;
  readonly confidence: number;
  readonly locatorRung: number;
  readonly governance: number;
  readonly actor: number;
  readonly resolutionMode: number;
  readonly iteration: number;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly found: boolean;
  readonly weightDrift: number;
  readonly weights: { readonly repairDensity: number; readonly translationRate: number; readonly unresolvedRate: number; readonly inverseFragmentShare: number };
} {
  const slot = index % buffer.capacity;
  const offset = slot * SLOT_SIZE;
  const bx = buffer.slots[offset + 8]!;
  return {
    eventType: buffer.slots[offset + 0]!,
    timestamp: buffer.slots[offset + 1]!,
    confidence: buffer.slots[offset + 2]!,
    locatorRung: buffer.slots[offset + 3]!,
    governance: buffer.slots[offset + 4]!,
    actor: buffer.slots[offset + 5]!,
    resolutionMode: buffer.slots[offset + 6]!,
    iteration: buffer.slots[offset + 7]!,
    boundingBox: Number.isNaN(bx) ? null : {
      x: bx,
      y: buffer.slots[offset + 9]!,
      width: buffer.slots[offset + 10]!,
      height: buffer.slots[offset + 11]!,
    },
    found: buffer.slots[offset + 12]! === 1,
    weightDrift: buffer.slots[offset + 13]!,
    weights: {
      repairDensity: buffer.slots[offset + 14]!,
      translationRate: buffer.slots[offset + 15]!,
      unresolvedRate: buffer.slots[offset + 16]!,
      inverseFragmentShare: buffer.slots[offset + 17]!,
    },
  };
}

// ─── String Channel ───
// Numeric buffer handles hot-path data. String data (element IDs, screen
// names, error messages) goes through a separate JSON channel that the
// WS subscriber also uses. The buffer stores ordinals + numerics only.

export interface StringChannel {
  /** Latest string data keyed by event type + field. */
  readonly latest: Map<string, string>;
}

export function createStringChannel(): StringChannel {
  return { latest: new Map() };
}

function writeStringChannel(channel: StringChannel, event: DashboardEvent): void {
  const data = event.data as Record<string, unknown> | null;
  if (!data) return;
  const prefix = event.type;
  if (typeof data.element === 'string') channel.latest.set(`${prefix}.element`, data.element);
  if (typeof data.screen === 'string') channel.latest.set(`${prefix}.screen`, data.screen);
  if (typeof data.id === 'string') channel.latest.set(`${prefix}.id`, data.id);
  if (typeof data.stage === 'string') channel.latest.set(`${prefix}.stage`, data.stage);
  if (typeof data.reason === 'string') channel.latest.set(`${prefix}.reason`, data.reason);
}

// ─── Effect PubSub Event Bus ───

export interface PipelineEventBus {
  /** The Effect PubSub — publish events here. */
  readonly pubsub: PubSub.PubSub<DashboardEvent>;
  /** The SharedArrayBuffer ring for zero-copy numeric transfer. */
  readonly buffer: PipelineBuffer;
  /** String channel for non-numeric event data. */
  readonly strings: StringChannel;
  /** DashboardPort implementation backed by this bus. */
  readonly dashboardPort: DashboardPort;
  /** Start the buffer writer subscriber fiber. Requires Scope for PubSub subscription. */
  readonly start: () => Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope>;
}

export type TelemetryOverflowPolicy = 'backpressure' | 'dropping' | 'sliding';

const createTelemetryQueue = <A>(
  capacity: number,
  policy: TelemetryOverflowPolicy,
): Effect.Effect<Queue.Queue<A>> => {
  if (policy === 'dropping') return Queue.dropping(capacity);
  if (policy === 'sliding') return Queue.sliding(capacity);
  return Queue.bounded(capacity);
};

const spawnScopedSubscriber = <A>(
  pubsub: PubSub.PubSub<A>,
  consume: (value: A) => Effect.Effect<void, never, never>,
): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope> =>
  Effect.acquireRelease(
    PubSub.subscribe(pubsub),
    (subscription) => Queue.shutdown(subscription),
  ).pipe(
    Effect.flatMap((subscription) =>
      Effect.forkScoped(
        Effect.forever(
          Queue.take(subscription).pipe(
            Effect.flatMap((event) => consume(event)),
          ),
        ),
      )),
  );

/** Create a pipeline event bus with Effect PubSub + SharedArrayBuffer.
 *
 *  The PubSub is the canonical event source (Effect-native).
 *  The SharedArrayBuffer is a derived projection for zero-copy visualization.
 *  WS broadcast can subscribe as an additional consumer.
 */
export function createPipelineEventBus(options?: {
  readonly bufferCapacity?: number;
  readonly decisionTimeoutMs?: number;
  readonly telemetryQueueCapacity?: number;
  readonly decisionQueueCapacity?: number;
  readonly telemetryOverflowPolicy?: TelemetryOverflowPolicy;
}): Effect.Effect<PipelineEventBus> {
  const capacity = options?.bufferCapacity ?? 1024;
  const timeoutMs = options?.decisionTimeoutMs ?? 0;
  const telemetryQueueCapacity = options?.telemetryQueueCapacity ?? 1024;
  const decisionQueueCapacity = options?.decisionQueueCapacity ?? 256;
  const telemetryOverflowPolicy = options?.telemetryOverflowPolicy ?? 'dropping';
  const buffer = createPipelineBuffer(capacity);
  const strings = createStringChannel();

  return Effect.gen(function* () {
    // Create bounded PubSub — backpressure propagates to publishers if all
    // subscribers are slow. Dropping strategy would lose events silently.
    const pubsub = yield* PubSub.bounded<DashboardEvent>(4096);
    const telemetryBridge = yield* createTelemetryQueue<DashboardEvent>(
      telemetryQueueCapacity,
      telemetryOverflowPolicy,
    );
    const decisionBridge = yield* Queue.bounded<DashboardEvent>(decisionQueueCapacity);

    const publishTelemetry = Effect.forever(
      Queue.take(telemetryBridge).pipe(
        Effect.flatMap((event) => PubSub.publish(pubsub, event)),
      ),
    );
    const publishDecisions = Effect.forever(
      Queue.take(decisionBridge).pipe(
        Effect.flatMap((event) => PubSub.publish(pubsub, event)),
      ),
    );

    // Pending decisions bridge for awaitDecision
    const pendingDecisions = new Map<string, (decision: WorkItemDecision) => void>();
    const offerTelemetry = (event: DashboardEvent) => Queue.offer(telemetryBridge, event).pipe(Effect.asVoid);
    const offerDecision = (event: DashboardEvent) => Queue.offer(decisionBridge, event).pipe(Effect.asVoid);

    const enrichEventFromContext = (event: DashboardEvent): Effect.Effect<DashboardEvent> =>
      Effect.map(
        enrichEventDataWithExecutionContext(event.data),
        (enrichedData) => ({ ...event, data: enrichedData }),
      );

    const dashboardPort: DashboardPort = {
      emit: (event) => Effect.flatMap(enrichEventFromContext(event), (enrichedEvent) => offerTelemetry(enrichedEvent)),

      awaitDecision: (item) => Effect.async<WorkItemDecision, never, never>((resume) => {
        // Publish item-pending to all subscribers
        runForkFromRuntimeBoundary(
          Effect.flatMap(
            enrichEventFromContext(dashboardEvent('item-pending', item)),
            (enrichedEvent) => offerDecision(enrichedEvent),
          ),
        );

        pendingDecisions.set(item.id, (decision) => {
          runForkFromRuntimeBoundary(
            Effect.flatMap(
              enrichEventFromContext(dashboardEvent('item-completed', decision)),
              (enrichedEvent) => offerDecision(enrichedEvent),
            ),
          );
          resume(Effect.succeed(decision));
        });

        // Auto-skip timeout
        const timer = setTimeout(() => {
          if (pendingDecisions.has(item.id)) {
            pendingDecisions.delete(item.id);
            const d: WorkItemDecision = {
              workItemId: item.id,
              status: 'skipped',
              rationale: `Auto-skip (${timeoutMs}ms)`,
            };
            runForkFromRuntimeBoundary(
              Effect.flatMap(
                enrichEventFromContext(dashboardEvent('item-completed', d)),
                (enrichedEvent) => offerDecision(enrichedEvent),
              ),
            );
            resume(Effect.succeed(d));
          }
        }, timeoutMs);

        return Effect.sync(() => {
          clearTimeout(timer);
          pendingDecisions.delete(item.id);
        });
      }),
    };

    // Start the buffer writer: subscribes to PubSub, writes each event
    // to the SharedArrayBuffer ring + string channel. Runs as a fiber.
    const start = () => Effect.gen(function* () {
      const telemetryFiber = yield* Effect.forkScoped(publishTelemetry);
      const decisionFiber = yield* Effect.forkScoped(publishDecisions);
      const bufferFiber = yield* spawnScopedSubscriber(pubsub, (event) => Effect.sync(() => {
        writeEvent(buffer, event);
        writeStringChannel(strings, event);
      }));
      return yield* Effect.forkScoped(
        Fiber.join(bufferFiber).pipe(
          Effect.ensuring(Fiber.interrupt(telemetryFiber)),
          Effect.ensuring(Fiber.interrupt(decisionFiber)),
        ),
      );
    });

    return { pubsub, buffer, strings, dashboardPort, start };
  });
}

/** Subscribe a WS broadcaster to the PubSub. Runs as a fiber.
 *  This is the bridge for remote browser access. */
export function subscribeWsBroadcaster(
  pubsub: PubSub.PubSub<DashboardEvent>,
  broadcast: (data: unknown) => void,
): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope> {
  return spawnScopedSubscriber(pubsub, (event) => Effect.sync(() => {
    broadcast(event);
  }));
}
