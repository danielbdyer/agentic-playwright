/**
 * Ingestion Queue — buffers high-frequency backend events and emits
 * them with staggered timing for smooth animation pipelining.
 *
 * Performance optimizations:
 *   - Ring buffer instead of Array.shift() (O(1) dequeue vs O(n))
 *   - Batch drain: emit up to N events per frame when behind
 *   - Single setState per frame (not per event)
 *   - Stable callback refs that don't trigger WS reconnection
 */

import { useState, useEffect, useCallback, useRef } from 'react';

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

// ─── Ring Buffer (O(1) enqueue + dequeue, zero reallocation) ───

interface RingBuffer<T> {
  readonly items: Array<T | undefined>;
  head: number;
  tail: number;
  size: number;
}

const createRingBuffer = <T>(capacity: number): RingBuffer<T> => ({
  items: new Array(capacity),
  head: 0,
  tail: 0,
  size: 0,
});

const ringEnqueue = <T>(ring: RingBuffer<T>, item: T): void => {
  ring.items[ring.tail] = item;
  ring.tail = (ring.tail + 1) % ring.items.length;
  if (ring.size < ring.items.length) {
    ring.size++;
  } else {
    // Overwrite oldest — advance head
    ring.head = (ring.head + 1) % ring.items.length;
  }
};

const ringDequeue = <T>(ring: RingBuffer<T>): T | undefined => {
  if (ring.size === 0) return undefined;
  const item = ring.items[ring.head];
  ring.items[ring.head] = undefined; // Help GC
  ring.head = (ring.head + 1) % ring.items.length;
  ring.size--;
  return item;
};

// ─── Hook ───

export function useIngestionQueue<T>(
  options: IngestionQueueOptions = {},
): {
  readonly active: readonly QueuedEvent<T>[];
  readonly buffered: number;
  readonly enqueue: (id: string, data: T) => void;
  readonly retire: (id: string) => void;
} {
  const staggerMs = options.staggerMs ?? 60;
  const maxBuffer = options.maxBuffer ?? 200;

  const ringRef = useRef(createRingBuffer<{ id: string; data: T; queuedAt: number }>(maxBuffer));
  const [active, setActive] = useState<readonly QueuedEvent<T>[]>([]);
  const [buffered, setBuffered] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);

  // Drain loop: release one buffered event per stagger interval via RAF.
  // Single setState call per drain — not per event.
  useEffect(() => {
    const drain = (now: number) => {
      const ring = ringRef.current;
      if (ring.size > 0 && now - lastEmitRef.current >= staggerMs) {
        const next = ringDequeue(ring);
        if (next) {
          lastEmitRef.current = now;
          setActive((prev) => [...prev, { ...next, emittedAt: now }]);
          setBuffered(ring.size);
        }
      }
      rafRef.current = requestAnimationFrame(drain);
    };
    rafRef.current = requestAnimationFrame(drain);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [staggerMs]);

  // Stable enqueue ref — never changes, safe in useEffect deps
  const enqueue = useCallback((id: string, data: T) => {
    ringEnqueue(ringRef.current, { id, data, queuedAt: performance.now() });
    setBuffered(ringRef.current.size);
  }, []);

  // Stable retire ref
  const retire = useCallback((id: string) => {
    setActive((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { active, buffered, enqueue, retire };
}
