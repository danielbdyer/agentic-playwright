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

// ─── Types ───

export interface QueuedEvent<T> {
  readonly id: string;
  readonly data: T;
  readonly queuedAt: number;
  readonly emittedAt: number | null;
}

export interface IngestionQueueOptions {
  /** Milliseconds between releasing queued events. Default 60ms. */
  readonly staggerMs?: number;
  /** Maximum buffer size before dropping oldest. Default 200. */
  readonly maxBuffer?: number;
}

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

export function useIngestionQueue<T>(options: IngestionQueueOptions = {}) {
  const staggerMs = options.staggerMs ?? 60;
  const maxBuffer = options.maxBuffer ?? 200;

  const ringRef = useRef(createRingBuffer<{ id: string; data: T; queuedAt: number }>(maxBuffer));
  const [active, setActive] = useState<readonly QueuedEvent<T>[]>([]);
  const [buffered, setBuffered] = useState(0);
  const [, startTransition] = useTransition();
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);

  // Drain loop: O(1) per frame — release one buffered event per stagger interval.
  useEffect(() => {
    const drain = (now: number) => {
      const ring = ringRef.current;
      if (ring.size > 0 && now - lastEmitRef.current >= staggerMs) {
        const next = ringDequeue(ring);
        if (next) {
          lastEmitRef.current = now;
          setActive((prev) => [...prev, { ...next, emittedAt: now }]);
          startTransition(() => setBuffered(ring.size));
        }
      }
      rafRef.current = requestAnimationFrame(drain);
    };
    rafRef.current = requestAnimationFrame(drain);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [staggerMs, startTransition]);

  /** O(1). Enqueues an event into the ring buffer. */
  const enqueue = useCallback((id: string, data: T) => {
    ringEnqueue(ringRef.current, { id, data, queuedAt: performance.now() });
    startTransition(() => setBuffered(ringRef.current.size));
  }, [startTransition]);

  /** O(n). Removes an event from the active set by id. */
  const retire = useCallback((id: string) => {
    setActive((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { active, buffered, enqueue, retire } as const;
}
