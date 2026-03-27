/**
 * Ingestion Queue — buffers high-frequency backend events and emits
 * them with staggered timing for smooth animation pipelining.
 *
 * The Effect fiber emits events at full speed (50 elements in 25ms).
 * This hook buffers them and releases one per `staggerMs` interval,
 * so the Three.js layer can animate each element's glow/transport
 * without frame drops.
 *
 * Pure functional: no side effects in the queue logic itself.
 * The stagger is driven by requestAnimationFrame, not setInterval.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface QueuedEvent<T> {
  readonly id: string;
  readonly data: T;
  readonly queuedAt: number;
  readonly emittedAt: number | null;
}

export interface IngestionQueueOptions {
  /** Milliseconds between releasing queued events. Default 80ms. */
  readonly staggerMs?: number;
  /** Maximum buffer size before dropping oldest. Default 200. */
  readonly maxBuffer?: number;
}

/** A time-staggered event queue that smooths bursty backend emissions
 *  into a steady stream suitable for 60fps animation pipelining. */
export function useIngestionQueue<T>(
  options: IngestionQueueOptions = {},
): {
  /** Currently visible (emitted) events, in emission order. */
  readonly active: readonly QueuedEvent<T>[];
  /** Number of events waiting in the buffer. */
  readonly buffered: number;
  /** Push a new event into the buffer. */
  readonly enqueue: (id: string, data: T) => void;
  /** Remove an event after its animation completes. */
  readonly retire: (id: string) => void;
} {
  const staggerMs = options.staggerMs ?? 80;
  const maxBuffer = options.maxBuffer ?? 200;

  const bufferRef = useRef<Array<{ id: string; data: T; queuedAt: number }>>([]);
  const [active, setActive] = useState<readonly QueuedEvent<T>[]>([]);
  const [buffered, setBuffered] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastEmitRef = useRef(0);

  // Drain loop: release one buffered event per stagger interval via RAF
  useEffect(() => {
    const drain = (now: number) => {
      if (bufferRef.current.length > 0 && now - lastEmitRef.current >= staggerMs) {
        const next = bufferRef.current.shift()!;
        lastEmitRef.current = now;
        setActive((prev) => [...prev, { ...next, emittedAt: now }]);
        setBuffered(bufferRef.current.length);
      }
      rafRef.current = requestAnimationFrame(drain);
    };
    rafRef.current = requestAnimationFrame(drain);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [staggerMs]);

  const enqueue = useCallback((id: string, data: T) => {
    const buf = bufferRef.current;
    buf.push({ id, data, queuedAt: performance.now() });
    // Drop oldest if over capacity
    while (buf.length > maxBuffer) buf.shift();
    setBuffered(buf.length);
  }, [maxBuffer]);

  const retire = useCallback((id: string) => {
    setActive((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { active, buffered, enqueue, retire };
}
