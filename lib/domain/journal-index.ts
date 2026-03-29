/**
 * JournalIndex — pure domain module for journal index generation and O(1) seek.
 *
 * The journal index is a companion file to the JSONL event journal that
 * enables fast random access:
 *
 *   - Byte offsets for each iteration/act boundary
 *   - Timestamps for each boundary
 *   - Event counts per iteration and per act
 *   - Sequence number ranges
 *
 * During recording, the index is built incrementally as events arrive.
 * During playback, the index enables O(1) seek to any iteration or act
 * boundary without scanning the entire journal.
 *
 * The index file lives alongside the journal:
 *   .tesseract/runs/{runId}/dashboard-events.index.json
 *
 * Pure domain logic. No filesystem, no React.
 *
 * @see docs/first-day-flywheel-visualization.md Part III: Journal Index
 */

import type { FlywheelAct } from './scene-state-accumulator';

// ─── Index Types ───

/** A boundary point in the journal (iteration or act change). */
export interface JournalBoundary {
  readonly kind: 'iteration' | 'act';
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly byteOffset: number;
  readonly sequenceNumber: number;
  readonly timestamp: string;
  readonly eventCountBefore: number; // Total events before this point
}

/** Per-iteration summary statistics. */
export interface IterationIndexEntry {
  readonly iteration: number;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startByteOffset: number;
  readonly endByteOffset: number;
  readonly startTimestamp: string;
  readonly endTimestamp: string;
  readonly eventCount: number;
  readonly actsPresent: readonly FlywheelAct[];
}

/** Per-act summary within an iteration. */
export interface ActIndexEntry {
  readonly iteration: number;
  readonly act: FlywheelAct;
  readonly startSequence: number;
  readonly endSequence: number;
  readonly startByteOffset: number;
  readonly eventCount: number;
}

/** Complete journal index. */
export interface JournalIndex {
  readonly version: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly totalEvents: number;
  readonly totalBytes: number;
  readonly totalIterations: number;
  readonly totalDurationMs: number;
  readonly boundaries: readonly JournalBoundary[];
  readonly iterations: readonly IterationIndexEntry[];
  readonly acts: readonly ActIndexEntry[];
}

// ─── Index Builder State ───

/** Mutable state for building the index incrementally during recording. */
export interface IndexBuilderState {
  readonly runId: string;
  readonly boundaries: readonly JournalBoundary[];
  readonly currentIteration: number;
  readonly currentAct: FlywheelAct;
  readonly currentByteOffset: number;
  readonly totalEvents: number;
  readonly iterationStarts: ReadonlyMap<number, { readonly sequence: number; readonly offset: number; readonly timestamp: string }>;
  readonly actEventCounts: ReadonlyMap<string, number>; // "iter:act" → count
  readonly firstTimestamp: string | null;
  readonly lastTimestamp: string | null;
}

export const INITIAL_BUILDER_STATE: IndexBuilderState = {
  runId: '',
  boundaries: [],
  currentIteration: 0,
  currentAct: 1,
  currentByteOffset: 0,
  totalEvents: 0,
  iterationStarts: new Map(),
  actEventCounts: new Map(),
  firstTimestamp: null,
  lastTimestamp: null,
};

// ─── Builder Functions ───

/**
 * Initialize the builder with a run ID.
 */
export function initBuilder(runId: string): IndexBuilderState {
  return { ...INITIAL_BUILDER_STATE, runId };
}

/**
 * Record an event in the index builder.
 *
 * Detects iteration and act boundaries, records byte offsets,
 * and accumulates event counts.
 *
 * @param state Current builder state
 * @param eventType Dashboard event type
 * @param sequenceNumber Monotonic sequence number
 * @param timestamp ISO 8601 timestamp
 * @param byteLength Number of bytes this event occupies in the JSONL file
 * @param iteration Current iteration number
 * @param act Current flywheel act
 * @returns Updated builder state
 */
export function recordEvent(
  state: IndexBuilderState,
  eventType: string,
  sequenceNumber: number,
  timestamp: string,
  byteLength: number,
  iteration: number,
  act: FlywheelAct,
): IndexBuilderState {
  const newBoundaries = [...state.boundaries];
  const newIterationStarts = new Map(state.iterationStarts);
  const newActCounts = new Map(state.actEventCounts);

  // Detect iteration boundary
  if (iteration > state.currentIteration) {
    newBoundaries[newBoundaries.length] = {
      kind: 'iteration',
      iteration,
      act,
      byteOffset: state.currentByteOffset,
      sequenceNumber,
      timestamp,
      eventCountBefore: state.totalEvents,
    };
    newIterationStarts.set(iteration, {
      sequence: sequenceNumber,
      offset: state.currentByteOffset,
      timestamp,
    });
  }

  // Detect act boundary
  if (act !== state.currentAct || iteration > state.currentIteration) {
    newBoundaries[newBoundaries.length] = {
      kind: 'act',
      iteration,
      act,
      byteOffset: state.currentByteOffset,
      sequenceNumber,
      timestamp,
      eventCountBefore: state.totalEvents,
    };
  }

  // Accumulate act event count
  const actKey = `${iteration}:${act}`;
  const prevCount = newActCounts.get(actKey) ?? 0;
  newActCounts.set(actKey, prevCount + 1);

  return {
    ...state,
    boundaries: newBoundaries,
    currentIteration: iteration,
    currentAct: act,
    currentByteOffset: state.currentByteOffset + byteLength,
    totalEvents: state.totalEvents + 1,
    iterationStarts: newIterationStarts,
    actEventCounts: newActCounts,
    firstTimestamp: state.firstTimestamp ?? timestamp,
    lastTimestamp: timestamp,
  };
}

/**
 * Finalize the index from the builder state.
 *
 * Computes per-iteration and per-act summaries from the accumulated data.
 *
 * @param state Final builder state
 * @returns Complete journal index
 */
export function finalizeIndex(state: IndexBuilderState): JournalIndex {
  // Compute iteration entries
  const iterationNums = [...state.iterationStarts.keys()].sort((a, b) => a - b);
  const iterations: IterationIndexEntry[] = iterationNums.map((iter, i) => {
    const start = state.iterationStarts.get(iter)!;
    const nextIter = i < iterationNums.length - 1
      ? state.iterationStarts.get(iterationNums[i + 1]!)!
      : null;

    // Find all acts in this iteration
    const actsInIter: FlywheelAct[] = [];
    let eventCount = 0;
    for (const [key, count] of state.actEventCounts) {
      const [iterStr, actStr] = key.split(':');
      if (parseInt(iterStr!, 10) === iter) {
        actsInIter[actsInIter.length] = parseInt(actStr!, 10) as FlywheelAct;
        eventCount += count;
      }
    }

    return {
      iteration: iter,
      startSequence: start.sequence,
      endSequence: nextIter ? nextIter.sequence - 1 : state.totalEvents,
      startByteOffset: start.offset,
      endByteOffset: nextIter ? nextIter.offset : state.currentByteOffset,
      startTimestamp: start.timestamp,
      endTimestamp: nextIter ? nextIter.timestamp : (state.lastTimestamp ?? start.timestamp),
      eventCount,
      actsPresent: actsInIter.sort((a, b) => a - b),
    };
  });

  // Compute act entries
  const acts: ActIndexEntry[] = [];
  for (const [key, count] of state.actEventCounts) {
    const [iterStr, actStr] = key.split(':');
    const iter = parseInt(iterStr!, 10);
    const act = parseInt(actStr!, 10) as FlywheelAct;

    // Find boundary for this act
    const boundary = state.boundaries.find(
      (b) => b.kind === 'act' && b.iteration === iter && b.act === act,
    );

    acts[acts.length] = {
      iteration: iter,
      act,
      startSequence: boundary?.sequenceNumber ?? 0,
      endSequence: boundary ? boundary.sequenceNumber + count - 1 : count - 1,
      startByteOffset: boundary?.byteOffset ?? 0,
      eventCount: count,
    };
  }

  // Compute total duration
  const startMs = state.firstTimestamp ? new Date(state.firstTimestamp).getTime() : 0;
  const endMs = state.lastTimestamp ? new Date(state.lastTimestamp).getTime() : 0;

  return {
    version: 1,
    runId: state.runId,
    createdAt: new Date().toISOString(),
    totalEvents: state.totalEvents,
    totalBytes: state.currentByteOffset,
    totalIterations: iterationNums.length,
    totalDurationMs: endMs - startMs,
    boundaries: state.boundaries,
    iterations,
    acts,
  };
}

// ─── Seek Functions ───

/**
 * O(1) seek to the nearest iteration boundary.
 *
 * Returns the byte offset and sequence number for seeking the JSONL file
 * to the start of the target iteration.
 *
 * @param index The journal index
 * @param targetIteration Target iteration number
 * @returns Boundary data or null if not found
 */
export function seekToIteration(
  index: JournalIndex,
  targetIteration: number,
): JournalBoundary | null {
  return index.boundaries.find(
    (b) => b.kind === 'iteration' && b.iteration === targetIteration,
  ) ?? null;
}

/**
 * O(1) seek to the nearest act boundary within an iteration.
 *
 * @param index The journal index
 * @param targetIteration Target iteration
 * @param targetAct Target act within the iteration
 * @returns Boundary data or null if not found
 */
export function seekToAct(
  index: JournalIndex,
  targetIteration: number,
  targetAct: FlywheelAct,
): JournalBoundary | null {
  return index.boundaries.find(
    (b) => b.kind === 'act' && b.iteration === targetIteration && b.act === targetAct,
  ) ?? null;
}

/**
 * Get the iteration entry for a given iteration number.
 */
export function getIterationEntry(
  index: JournalIndex,
  iteration: number,
): IterationIndexEntry | null {
  return index.iterations.find((e) => e.iteration === iteration) ?? null;
}

/**
 * Compute the fraction [0, 1] of a sequence number within the total journal.
 * Used for mapping between scrubber position and journal position.
 */
export function sequenceToFraction(
  index: JournalIndex,
  sequenceNumber: number,
): number {
  if (index.totalEvents === 0) return 0;
  return Math.max(0, Math.min(1, sequenceNumber / index.totalEvents));
}

/**
 * Compute the sequence number from a fraction [0, 1].
 */
export function fractionToSequence(
  index: JournalIndex,
  fraction: number,
): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * index.totalEvents);
}
