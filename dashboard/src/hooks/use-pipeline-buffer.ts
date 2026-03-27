/**
 * usePipelineBuffer — reads pipeline events from a SharedArrayBuffer ring buffer.
 *
 * This hook bridges the Effect pipeline's SharedArrayBuffer output to the
 * React/Three.js visualization layer. It reads from the buffer at the
 * consumer's frame rate — no WebSocket, no serialization, no GC pressure.
 *
 * The buffer is written by the pipeline's PubSub subscriber fiber (in-process)
 * using atomic operations. This hook polls the event count each frame and
 * yields new events since the last read.
 *
 * Complexity:
 *   poll:     O(1) — Atomics.load on header
 *   read:     O(k) — k = new events since last poll (typically 0-5 per frame)
 *   total:    O(1) amortized per frame
 *
 * Falls back gracefully when no SharedArrayBuffer is available (remote browser).
 */

import { useRef, useCallback } from 'react';

// ─── Buffer layout (must match pipeline-event-bus.ts) ───

const SLOT_SIZE = 18;
const HEADER_SIZE = 2;
const HEADER_BYTES = HEADER_SIZE * 4;

/** Decoded event from the ring buffer. Numeric fields only — no strings, no GC. */
export interface BufferEvent {
  readonly eventType: number;
  readonly timestamp: number;
  readonly confidence: number;
  readonly locatorRung: number;
  readonly governance: number;   // 0=approved, 1=review-required, 2=blocked
  readonly actor: number;         // 0=system, 1=agent, 2=operator
  readonly resolutionMode: number; // 0=deterministic, 1=translation, 2=agentic
  readonly iteration: number;
  readonly hasBoundingBox: boolean;
  readonly bx: number;
  readonly by: number;
  readonly bw: number;
  readonly bh: number;
  readonly found: boolean;
  readonly weightDrift: number;
  readonly repairDensity: number;
  readonly translationRate: number;
  readonly unresolvedRate: number;
  readonly inverseFragmentShare: number;
}

/** Event type ordinals (must match pipeline-event-bus.ts). */
export const EVENT_TYPES = {
  ELEMENT_PROBED: 1,
  ELEMENT_ESCALATED: 2,
  SCREEN_CAPTURED: 3,
  ITERATION_START: 10,
  ITERATION_COMPLETE: 11,
  PROGRESS: 12,
  RUNG_SHIFT: 20,
  CALIBRATION_UPDATE: 21,
  PROPOSAL_ACTIVATED: 22,
  CONFIDENCE_CROSSED: 23,
  ARTIFACT_WRITTEN: 24,
  STAGE_LIFECYCLE: 25,
} as const;

// ─── Shared decode buffer (zero allocation per read) ───

const _event: BufferEvent = {
  eventType: 0, timestamp: 0, confidence: 0, locatorRung: 0,
  governance: 0, actor: 0, resolutionMode: 0, iteration: 0,
  hasBoundingBox: false, bx: 0, by: 0, bw: 0, bh: 0,
  found: false, weightDrift: 0, repairDensity: 0,
  translationRate: 0, unresolvedRate: 0, inverseFragmentShare: 0,
};

/** O(1). Decode a slot into the shared _event buffer. Caller must consume
 *  before next call (same pattern as use-particle-simulation's _pos). */
function decodeSlot(slots: Float64Array, index: number, capacity: number): BufferEvent {
  const slot = index % capacity;
  const o = slot * SLOT_SIZE;
  const bx = slots[o + 8]!;
  // Mutate shared buffer (intentional — zero allocation hot path)
  (_event as { eventType: number }).eventType = slots[o]!;
  (_event as { timestamp: number }).timestamp = slots[o + 1]!;
  (_event as { confidence: number }).confidence = slots[o + 2]!;
  (_event as { locatorRung: number }).locatorRung = slots[o + 3]!;
  (_event as { governance: number }).governance = slots[o + 4]!;
  (_event as { actor: number }).actor = slots[o + 5]!;
  (_event as { resolutionMode: number }).resolutionMode = slots[o + 6]!;
  (_event as { iteration: number }).iteration = slots[o + 7]!;
  (_event as { hasBoundingBox: boolean }).hasBoundingBox = !Number.isNaN(bx);
  (_event as { bx: number }).bx = bx;
  (_event as { by: number }).by = slots[o + 9]!;
  (_event as { bw: number }).bw = slots[o + 10]!;
  (_event as { bh: number }).bh = slots[o + 11]!;
  (_event as { found: boolean }).found = slots[o + 12]! === 1;
  (_event as { weightDrift: number }).weightDrift = slots[o + 13]!;
  (_event as { repairDensity: number }).repairDensity = slots[o + 14]!;
  (_event as { translationRate: number }).translationRate = slots[o + 15]!;
  (_event as { unresolvedRate: number }).unresolvedRate = slots[o + 16]!;
  (_event as { inverseFragmentShare: number }).inverseFragmentShare = slots[o + 17]!;
  return _event;
}

// ─── Hook ───

interface PipelineBufferHandle {
  /** Call from useFrame. Returns count of new events since last poll. */
  readonly poll: () => number;
  /** Read the i-th new event from the current batch. Must call poll() first.
   *  Returns the shared _event buffer — consume before next read(). */
  readonly read: (batchIndex: number) => BufferEvent;
  /** Total events ever written to the buffer. */
  readonly totalEvents: () => number;
  /** Whether a buffer is connected. */
  readonly connected: boolean;
}

/** Attach to a SharedArrayBuffer from the pipeline event bus.
 *  If sab is null, returns a disconnected handle (graceful fallback). */
export function usePipelineBuffer(sab: SharedArrayBuffer | null, capacity = 1024): PipelineBufferHandle {
  const headerRef = useRef<Int32Array | null>(null);
  const slotsRef = useRef<Float64Array | null>(null);
  const lastReadRef = useRef(0);

  // Initialize views lazily on first access (or when sab changes)
  if (sab && !headerRef.current) {
    headerRef.current = new Int32Array(sab, 0, HEADER_SIZE);
    slotsRef.current = new Float64Array(sab, HEADER_BYTES);
  }

  /** O(1). Poll for new events. Returns count of unread events. */
  const poll = useCallback((): number => {
    const header = headerRef.current;
    if (!header) return 0;
    const total = Atomics.load(header, 1);
    const newCount = total - lastReadRef.current;
    return Math.min(newCount, capacity); // Cap to avoid reading stale wrapped slots
  }, [capacity]);

  /** O(1). Read the i-th event from the current batch.
   *  Uses shared _event buffer — consume before next read(). */
  const read = useCallback((batchIndex: number): BufferEvent => {
    const slots = slotsRef.current;
    if (!slots) return _event;
    const index = lastReadRef.current + batchIndex;
    return decodeSlot(slots, index, capacity);
  }, [capacity]);

  /** O(1). Advance the read cursor past all polled events. */
  const totalEvents = useCallback((): number => {
    const header = headerRef.current;
    if (!header) return 0;
    const total = Atomics.load(header, 1);
    lastReadRef.current = total; // Mark as read
    return total;
  }, []);

  return { poll, read, totalEvents, connected: sab !== null } as const;
}
