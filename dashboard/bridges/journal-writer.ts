/**
 * Event Journal Writer — append-only JSONL recorder for time-lapse replay.
 *
 * Records every DashboardEvent to a JSONL file during a pipeline run,
 * enriched with monotonic sequence numbers, iteration tracking, and
 * flywheel act classification. A companion index file enables efficient
 * random-access seek during replay.
 *
 * Architecture:
 *   Effect PubSub (event bus)
 *     → Subscriber: JournalWriter fiber
 *       → in-memory buffer (amortize I/O)
 *       → periodic flush to .jsonl (append)
 *       → companion .index.json (overwrite at flush)
 *
 * The journal is the third subscriber alongside the SharedArrayBuffer
 * writer and WS broadcaster. It persists the full event stream for
 * offline replay, debugging, and flywheel visualization time-lapse.
 *
 * Complexity:
 *   event intake:  O(1) — buffer append
 *   flush:         O(k) — where k = buffered events since last flush
 *   index build:   O(n) — full incremental rebuild on flush (n = total events)
 *   act derivation: O(1) — constant-time keyword lookup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Effect, PubSub, Queue, Fiber, Schedule } from 'effect';
import type { Scope } from 'effect';
import type { DashboardEvent, DashboardEventKind } from '../../product/domain/observation/dashboard';

// ─── FlywheelAct (server-side mirror of dashboard/src/types.ts) ───
// Duplicated here to avoid cross-boundary import from the React frontend.

/** Flywheel act identifier: 1–7 maps to the seven pipeline acts. */
export type FlywheelAct = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ─── Journal Types ───

/** Configuration for the journal writer. */
export interface JournalWriterConfig {
  /** Path to the .jsonl output file. */
  readonly journalPath: string;
  /** Milliseconds between periodic flushes. Default: 1000. */
  readonly flushIntervalMs: number;
  /** Maximum journal file size in bytes. Default: 10MB. */
  readonly maxFileSizeBytes: number;
}

/** A single journaled event — the enriched on-disk representation. */
export interface JournaledEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly sequenceNumber: number;
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly data: unknown;
}

/** Top-level index written alongside the journal for random-access seek. */
export interface JournalIndex {
  readonly kind: 'dashboard-event-journal-index';
  readonly version: 1;
  readonly runId: string;
  readonly totalEvents: number;
  readonly totalDurationMs: number;
  readonly iterations: readonly JournalIterationIndex[];
}

/** Per-iteration slice of the journal index. */
export interface JournalIterationIndex {
  readonly iteration: number;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly eventCount: number;
  readonly acts: readonly JournalActIndex[];
}

/** Per-act slice within an iteration. */
export interface JournalActIndex {
  readonly act: FlywheelAct;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly eventCount: number;
}

// ─── Act Derivation ───
// Pure function mirroring dashboard/src/hooks/use-flywheel-act.ts stageToAct
// but operating on typed DashboardEventKind rather than freeform stage strings.

/** O(1). Derive the flywheel act from an event type and optional stage hint. */
export function deriveAct(eventType: DashboardEventKind, stageHint: string | null): FlywheelAct {
  // Direct event-type → act mapping (authoritative)
  if (eventType === 'route-navigated' || eventType === 'aria-tree-captured' || eventType === 'surface-discovered') return 2;
  if (eventType === 'suite-slice-selected' || eventType === 'scenario-prioritized') return 3;
  if (eventType === 'step-bound' || eventType === 'scenario-compiled') return 4;
  if (eventType === 'step-executing' || eventType === 'step-resolved' || eventType === 'scenario-executed') return 5;
  if (eventType === 'trust-policy-evaluated' || eventType === 'knowledge-activated') return 6;
  if (eventType === 'convergence-evaluated' || eventType === 'iteration-summary') return 7;

  // Fallback: fuzzy stage-hint keyword matching
  if (stageHint?.includes('capture') || stageHint?.includes('probe')) return 2;
  if (stageHint?.includes('slice')) return 3;
  if (stageHint?.includes('compile') || stageHint?.includes('bind') || stageHint?.includes('emit')) return 4;
  if (stageHint?.includes('execute') || stageHint?.includes('run')) return 5;
  if (stageHint?.includes('gate') || stageHint?.includes('trust')) return 6;
  if (stageHint?.includes('measure') || stageHint?.includes('score')) return 7;

  return 1;
}

// ─── Default Config ───

const DEFAULT_FLUSH_INTERVAL_MS = 1000;
const DEFAULT_MAX_FILE_SIZE_BYTES = 10_000_000; // 10 MB

/** Build a config with defaults for missing fields. Pure. */
export function journalWriterConfig(overrides: Partial<JournalWriterConfig> & { readonly journalPath: string }): JournalWriterConfig {
  return {
    journalPath: overrides.journalPath,
    flushIntervalMs: overrides.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
    maxFileSizeBytes: overrides.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
  };
}

// ─── Internal Helpers ───

/** Extract a stage hint string from an event's data payload. Pure. */
function extractStageHint(event: DashboardEvent): string | null {
  const data = event.data as Record<string, unknown> | null;
  if (!data) return null;
  if (typeof data.stage === 'string') return data.stage;
  if (typeof data.phase === 'string') return data.phase;
  return null;
}

/** Extract an iteration number from event data, or return the current tracking value. Pure. */
function extractIteration(event: DashboardEvent, currentIteration: number): number {
  const data = event.data as Record<string, unknown> | null;
  if (event.type === 'iteration-start' && data && typeof data.iteration === 'number') {
    return data.iteration;
  }
  if (typeof data?.iteration === 'number') {
    return data.iteration;
  }
  return currentIteration;
}

/** Convert a DashboardEvent to a JournaledEvent. Pure. */
function toJournaledEvent(
  event: DashboardEvent,
  sequenceNumber: number,
  iteration: number,
): JournaledEvent {
  const stageHint = extractStageHint(event);
  const act = deriveAct(event.type, stageHint);
  return {
    type: event.type,
    timestamp: event.timestamp,
    sequenceNumber,
    iteration,
    act,
    data: event.data,
  };
}

/** Serialize a JournaledEvent to a single JSONL line. Pure. */
function toJsonLine(entry: JournaledEvent): string {
  return JSON.stringify(entry);
}

// ─── Index Construction ───

/** Mutable accumulator for incremental index building within the fiber. */
interface IndexAccumulator {
  readonly runId: string;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  totalEvents: number;
  /** Map<iteration, { events, acts: Map<act, events> }> */
  readonly iterations: Map<number, {
    startSequence: number;
    endSequence: number;
    startTimestamp: string;
    endTimestamp: string;
    eventCount: number;
    readonly acts: Map<FlywheelAct, {
      startSequence: number;
      endSequence: number;
      startTimestamp: string;
      endTimestamp: string;
      eventCount: number;
    }>;
  }>;
}

function createIndexAccumulator(runId: string): IndexAccumulator {
  return {
    runId,
    firstTimestamp: null,
    lastTimestamp: null,
    totalEvents: 0,
    iterations: new Map(),
  };
}

/** Update the accumulator with a single journaled event. Mutates in place (fiber-local). */
function accumulateEvent(acc: IndexAccumulator, entry: JournaledEvent): void {
  if (acc.firstTimestamp === null) {
    acc.firstTimestamp = entry.timestamp;
  }
  acc.lastTimestamp = entry.timestamp;
  acc.totalEvents = acc.totalEvents + 1;

  // Iteration bucket
  const existing = acc.iterations.get(entry.iteration);
  if (existing) {
    existing.endSequence = entry.sequenceNumber;
    existing.endTimestamp = entry.timestamp;
    existing.eventCount = existing.eventCount + 1;

    // Act bucket within iteration
    const existingAct = existing.acts.get(entry.act);
    if (existingAct) {
      existingAct.endSequence = entry.sequenceNumber;
      existingAct.endTimestamp = entry.timestamp;
      existingAct.eventCount = existingAct.eventCount + 1;
    } else {
      existing.acts.set(entry.act, {
        startSequence: entry.sequenceNumber,
        endSequence: entry.sequenceNumber,
        startTimestamp: entry.timestamp,
        endTimestamp: entry.timestamp,
        eventCount: 1,
      });
    }
  } else {
    const actMap = new Map<FlywheelAct, {
      startSequence: number;
      endSequence: number;
      startTimestamp: string;
      endTimestamp: string;
      eventCount: number;
    }>();
    actMap.set(entry.act, {
      startSequence: entry.sequenceNumber,
      endSequence: entry.sequenceNumber,
      startTimestamp: entry.timestamp,
      endTimestamp: entry.timestamp,
      eventCount: 1,
    });
    acc.iterations.set(entry.iteration, {
      startSequence: entry.sequenceNumber,
      endSequence: entry.sequenceNumber,
      startTimestamp: entry.timestamp,
      endTimestamp: entry.timestamp,
      eventCount: 1,
      acts: actMap,
    });
  }
}

/** Snapshot the accumulator into an immutable JournalIndex. Pure. */
function snapshotIndex(acc: IndexAccumulator): JournalIndex {
  const firstMs = acc.firstTimestamp ? new Date(acc.firstTimestamp).getTime() : 0;
  const lastMs = acc.lastTimestamp ? new Date(acc.lastTimestamp).getTime() : 0;

  const iterations: readonly JournalIterationIndex[] =
    Array.from(acc.iterations.entries())
      .sort(([a], [b]) => a - b)
      .map(([iteration, data]) => ({
        iteration,
        startSequence: data.startSequence,
        endSequence: data.endSequence,
        startTimestamp: data.startTimestamp,
        endTimestamp: data.endTimestamp,
        eventCount: data.eventCount,
        acts: Array.from(data.acts.entries())
          .sort(([a], [b]) => a - b)
          .map(([act, actData]) => ({
            act,
            startSequence: actData.startSequence,
            endSequence: actData.endSequence,
            startTimestamp: actData.startTimestamp,
            endTimestamp: actData.endTimestamp,
            eventCount: actData.eventCount,
          })),
      }));

  return {
    kind: 'dashboard-event-journal-index',
    version: 1,
    runId: acc.runId,
    totalEvents: acc.totalEvents,
    totalDurationMs: lastMs - firstMs,
    iterations,
  };
}

// ─── File Operations ───

/** Ensure the directory for a file path exists. Idempotent. */
function ensureDirectory(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

/** Get current file size, or 0 if file doesn't exist. */
function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

/** Compute the index file path from the journal path (.jsonl → .index.json). */
function indexPathFor(journalPath: string): string {
  const ext = path.extname(journalPath);
  const base = journalPath.slice(0, journalPath.length - ext.length);
  return `${base}.index.json`;
}

// ─── Journal Writer Subscriber ───

/** Subscribe a journal writer to the PubSub. Runs as a fiber.
 *
 *  Events are buffered in memory and flushed to disk periodically.
 *  A companion .index.json is written alongside the JSONL for seek support.
 *
 *  Follows the same Effect.gen + PubSub.subscribe + Queue.take + Effect.fork
 *  pattern as subscribeWsBroadcaster.
 *
 *  @param pubsub  The pipeline event bus PubSub.
 *  @param config  Journal writer configuration.
 *  @returns An Effect that yields the writer fiber (requires Scope for subscription lifecycle).
 */
export function subscribeJournalWriter(
  pubsub: PubSub.PubSub<DashboardEvent>,
  config: JournalWriterConfig,
): Effect.Effect<Fiber.RuntimeFiber<void, never>, never, Scope.Scope> {
  return Effect.gen(function* () {
    // Ensure output directory exists before subscribing
    ensureDirectory(config.journalPath);

    // Mutable state scoped to this fiber — not exported, not shared.
    // eslint-disable-next-line no-restricted-syntax -- fiber-local buffer; perf-critical hot path
    const buffer: JournaledEvent[] = [];
    const acc = createIndexAccumulator(
      path.basename(config.journalPath, path.extname(config.journalPath)),
    );
    // eslint-disable-next-line no-restricted-syntax -- fiber-local mutable counter
    let sequenceNumber = 0;
    // eslint-disable-next-line no-restricted-syntax -- fiber-local mutable tracker
    let currentIteration = 0;

    /** Flush buffered events to disk and update the index file. */
    const flush = (): void => {
      if (buffer.length === 0) return;

      // Safety cap: stop writing if file exceeds limit
      const currentSize = getFileSize(config.journalPath);
      if (currentSize >= config.maxFileSizeBytes) return;

      const lines = buffer.map(toJsonLine).join('\n') + '\n';
      fs.appendFileSync(config.journalPath, lines, 'utf-8');

      // Write companion index (overwrite — always reflects full journal)
      const index = snapshotIndex(acc);
      fs.writeFileSync(indexPathFor(config.journalPath), JSON.stringify(index, null, 2), 'utf-8');

      // eslint-disable-next-line no-restricted-syntax -- fiber-local buffer clear; preserves reference
      buffer.splice(0, buffer.length);
    };

    const subscription = yield* PubSub.subscribe(pubsub);

    // Fork the periodic flush timer as a separate fiber
    const flushFiber = yield* Effect.fork(
      Effect.repeat(
        Effect.sync(() => flush()),
        Schedule.spaced(config.flushIntervalMs),
      ),
    );

    // Fork the event intake loop — takes events, enriches, buffers
    const intakeFiber = yield* Effect.fork(
      Effect.forever(
        Effect.gen(function* () {
          const event = yield* Queue.take(subscription);

          // Track iteration transitions
          currentIteration = extractIteration(event, currentIteration);

          // Enrich and buffer
          sequenceNumber = sequenceNumber + 1;
          const entry = toJournaledEvent(event, sequenceNumber, currentIteration);
          accumulateEvent(acc, entry);
          // eslint-disable-next-line no-restricted-syntax -- fiber-local buffer append
          buffer.push(entry);
        }),
      ),
    );

    // Return a combined fiber that represents both intake and flush.
    // When the scope closes, both fibers are interrupted, and we do a
    // final flush to capture any remaining buffered events.
    return yield* Effect.fork(
      Effect.ensuring(
        Fiber.join(intakeFiber),
        Effect.gen(function* () {
          flush();
          yield* Fiber.interrupt(flushFiber);
        }),
      ),
    );
  });
}
