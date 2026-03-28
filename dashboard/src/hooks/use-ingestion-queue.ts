/**
 * useIngestionQueue — buffers high-frequency backend events and emits
 * them with staggered timing for smooth animation pipelining.
 *
 * Complexity:
 *   enqueue: O(1) — ring buffer modulo arithmetic
 *   dequeue: O(1) — ring buffer head advance
 *   drain:   O(1) per frame — emits at most 1 event per stagger interval
 *   retire:  O(n) — filter over active set (n typically < 50)
 *
 * Performance:
 *   - Ring buffer instead of Array.shift() (O(1) vs O(n))
 *   - Single setState per frame (not per event)
 *   - Stable callback refs prevent WS reconnection
 *   - useTransition for buffered count (non-urgent UI metric)
 */

import { useState, useEffect, useCallback, useRef, useTransition } from 'react';
import type { FlywheelAct } from '../types';

// ─── Types ───

export interface QueuedEvent<T> {
  readonly id: string;
  readonly data: T;
  readonly queuedAt: number;
  readonly emittedAt: number | null;
}

export interface IngestionQueueOptions<T> {
  /** Milliseconds between releasing queued events. Default 60ms. */
  readonly staggerMs?: number;
  /** Maximum buffer size before dropping oldest. Default 200. */
  readonly maxBuffer?: number;
  /** Current flywheel act (for act-aware policy). Default 5. */
  readonly act?: FlywheelAct;
  /** Playback speed multiplier; 1 for live mode. */
  readonly playbackSpeed?: number;
  /** Events to emit per frame at current policy. */
  readonly maxBatchPerFrame?: number;
  /** Optional semantic key (screen/scenario/etc.) used for high-speed coalescing. */
  readonly semanticKey?: (data: T) => string;
  /** Apply all state deltas even when visuals are coalesced. */
  readonly onStateDelta?: (data: T) => void;
}

interface QueuePolicy {
  readonly staggerMs: number;
  readonly maxBatchPerFrame: number;
  readonly coalesceSemantically: boolean;
}

const defaultPolicy = (
  act: FlywheelAct,
  playbackSpeed: number,
  fallbackStagger: number,
  fallbackBatch: number,
): QueuePolicy => {
  const normalizedSpeed = Math.max(1, playbackSpeed);
  const highSpeed = normalizedSpeed >= 8;
  const actStagger = act === 4 ? 40 : act === 6 ? 100 : act === 1 ? 100 : fallbackStagger;
  const speedAdjusted = Math.max(8, Math.round(actStagger / normalizedSpeed));
  return {
    staggerMs: speedAdjusted,
    maxBatchPerFrame: highSpeed ? Math.max(4, fallbackBatch * 4) : fallbackBatch,
    coalesceSemantically: highSpeed && (act === 2 || act === 4 || act === 5),
  };
};

// ─── Ring Buffer ───
// Intentionally mutable internal structure for O(1) operations.
// The public API returns readonly arrays — mutation is contained.

interface RingBuffer<T> {
  readonly items: Array<T | undefined>;
  /** Read pointer. Mutated by dequeue. O(1). */
  head: number;
  /** Write pointer. Mutated by enqueue. O(1). */
  tail: number;
  /** Current item count. Mutated by enqueue/dequeue. */
  size: number;
}

/** O(1). Pre-allocates capacity, no dynamic growth. */
const createRingBuffer = <T>(capacity: number): RingBuffer<T> => ({
  items: new Array(capacity),
  head: 0,
  tail: 0,
  size: 0,
});

/** O(1). Writes to tail, advances pointer. Evicts oldest on overflow. */
const ringEnqueue = <T>(ring: RingBuffer<T>, item: T): void => {
  ring.items[ring.tail] = item;
  ring.tail = (ring.tail + 1) % ring.items.length;
  if (ring.size < ring.items.length) {
    ring.size++;
  } else {
    ring.head = (ring.head + 1) % ring.items.length;
  }
};

/** O(1). Reads from head, advances pointer. Returns undefined if empty. */
const ringDequeue = <T>(ring: RingBuffer<T>): T | undefined => {
  if (ring.size === 0) return undefined;
  const item = ring.items[ring.head];
  ring.items[ring.head] = undefined;
  ring.head = (ring.head + 1) % ring.items.length;
  ring.size--;
  return item;
};

// ─── Hook ───

export function useIngestionQueue<T>(options: IngestionQueueOptions<T> = {}) {
  const staggerMs = options.staggerMs ?? 60;
  const maxBuffer = options.maxBuffer ?? 200;
  const act = options.act ?? 5;
  const playbackSpeed = options.playbackSpeed ?? 1;
  const maxBatchPerFrame = options.maxBatchPerFrame ?? 1;
  const policy = defaultPolicy(act, playbackSpeed, staggerMs, maxBatchPerFrame);

  const ringRef = useRef(createRingBuffer<{ id: string; data: T; queuedAt: number }>(maxBuffer));
  const [active, setActive] = useState<readonly QueuedEvent<T>[]>([]);
  const [buffered, setBuffered] = useState(0);
  const [ingestedCount, setIngestedCount] = useState(0);
  const [emittedCount, setEmittedCount] = useState(0);
  const [coalescedCount, setCoalescedCount] = useState(0);
  const [queueDepthByAct, setQueueDepthByAct] = useState<Readonly<Record<FlywheelAct, number>>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
  const [, startTransition] = useTransition();
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);
  const frameRef = useRef({ lastTs: 0, droppedFrames: 0, avgFrameMs: 16.67 });
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [avgFrameMs, setAvgFrameMs] = useState(16.67);

  const semanticKeyRef = useRef(options.semanticKey);
  semanticKeyRef.current = options.semanticKey;
  const onStateDeltaRef = useRef(options.onStateDelta);
  onStateDeltaRef.current = options.onStateDelta;

  // Drain loop: O(1) per frame — release one buffered event per stagger interval.
  useEffect(() => {
    const drain = (now: number) => {
      const ring = ringRef.current;
      const frameDelta = frameRef.current.lastTs === 0 ? 16.67 : now - frameRef.current.lastTs;
      frameRef.current.lastTs = now;
      const droppedThisFrame = Math.max(0, Math.floor(frameDelta / 16.67) - 1);
      frameRef.current.droppedFrames += droppedThisFrame;
      frameRef.current.avgFrameMs = frameRef.current.avgFrameMs * 0.9 + frameDelta * 0.1;

      if (ring.size > 0 && now - lastEmitRef.current >= policy.staggerMs) {
        const dequeueCount = Math.min(policy.maxBatchPerFrame, ring.size);
        const dequeued = Array.from({ length: dequeueCount }, () => ringDequeue(ring)).filter((entry): entry is { id: string; data: T; queuedAt: number } => entry !== undefined);
        const applyDelta = onStateDeltaRef.current;
        dequeued.forEach((entry) => applyDelta?.(entry.data));

        const eventsToEmit = policy.coalesceSemantically
          ? [...dequeued.reduce((acc, entry) => {
              const key = semanticKeyRef.current?.(entry.data) ?? entry.id;
              acc.set(key, entry);
              return acc;
            }, new Map<string, { id: string; data: T; queuedAt: number }>()).values()]
          : dequeued;

        if (eventsToEmit.length > 0) {
          lastEmitRef.current = now;
          setActive((prev) => [
            ...prev,
            ...eventsToEmit.map((event) => ({ ...event, emittedAt: now })),
          ]);
          startTransition(() => setBuffered(ring.size));
          startTransition(() => {
            setEmittedCount((prev) => prev + eventsToEmit.length);
            setCoalescedCount((prev) => prev + Math.max(0, dequeued.length - eventsToEmit.length));
            setDroppedFrames(frameRef.current.droppedFrames);
            setAvgFrameMs(frameRef.current.avgFrameMs);
          });
        }
      }
      rafRef.current = requestAnimationFrame(drain);
    };
    rafRef.current = requestAnimationFrame(drain);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [policy.coalesceSemantically, policy.maxBatchPerFrame, policy.staggerMs, startTransition]);

  /** O(1). Enqueues an event into the ring buffer. */
  const enqueue = useCallback((id: string, data: T) => {
    ringEnqueue(ringRef.current, { id, data, queuedAt: performance.now() });
    startTransition(() => {
      setBuffered(ringRef.current.size);
      setIngestedCount((prev) => prev + 1);
      setQueueDepthByAct((prev) => ({ ...prev, [act]: ringRef.current.size }));
    });
  }, [act, startTransition]);

  /** O(n). Removes an event from the active set by id. */
  const retire = useCallback((id: string) => {
    setActive((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const diagnostics = {
    ingestedCount,
    emittedCount,
    coalescedCount,
    droppedFrames,
    avgFrameMs,
    queueDepthByAct,
    policy,
  } as const;

  return { active, buffered, enqueue, retire, diagnostics } as const;
}
