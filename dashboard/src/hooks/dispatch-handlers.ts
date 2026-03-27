/**
 * Dispatch handler factories — pure higher-order functions for WebSocket event routing.
 *
 * Each factory captures React state setters and returns a (data: unknown) => void handler.
 * All use the ref pattern (.current) for closure stability — the dispatch table
 * captures these at build time and never needs to be rebuilt.
 *
 * These are extracted from app.tsx for separation of concerns:
 *   app.tsx owns composition (hooks + components)
 *   dispatch-handlers.ts owns event routing (pure transforms)
 */

import type React from 'react';
import type {
  ProbeEvent, ScreenCapture, ViewportDimensions, ElementEscalatedEvent,
} from '../spatial/types';
import type { WorkItem, QueuedItem, DisplayStatus, ProgressEvent } from '../types';

/** O(1). Routes progress events to state setter. */
export const dispatchProgress = (setProgress: (p: ProgressEvent) => void) =>
  (data: unknown) => setProgress(data as ProgressEvent);

/** O(1). Routes probe events to ingestion queue via stable ref. */
export const dispatchProbe = (enqueueRef: React.RefObject<(id: string, data: ProbeEvent) => void>) =>
  (data: unknown) => { const p = data as ProbeEvent; enqueueRef.current?.(p.id, p); };

/** O(1). Routes screen captures to state + viewport setters. */
export const dispatchCapture = (
  setCapture: (c: ScreenCapture) => void,
  setViewport: (v: ViewportDimensions) => void,
) => (data: unknown) => {
  const cap = data as ScreenCapture;
  setCapture(cap);
  setViewport({ width: cap.width, height: cap.height });
};

/** O(n). Adds a work item with entering → pending animation via double RAF. */
export const dispatchItemPending = (setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>) =>
  (data: unknown) => {
    const item = data as WorkItem;
    setQueue((prev) => [...prev, { ...item, displayStatus: 'entering' as const }]);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, displayStatus: 'pending' as const } : q)),
    ));
  };

/** O(n). Updates queue item status to processing. */
export const dispatchItemProcessing = (
  setProcessingId: (id: string | null) => void,
  setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>,
) => (data: unknown) => {
  const { workItemId } = data as { workItemId: string };
  setProcessingId(workItemId);
  setQueue((prev) => prev.map((q) => q.id === workItemId ? { ...q, displayStatus: 'processing' as const } : q));
};

/** O(n). Completes queue item with tracked timeout cleanup to prevent memory leaks. */
export const dispatchItemCompleted = (
  setProcessingId: React.Dispatch<React.SetStateAction<string | null>>,
  setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>,
  cleanupTimers: Set<ReturnType<typeof setTimeout>>,
) => (data: unknown) => {
  const { workItemId, status } = data as { workItemId: string; status: string };
  const exitStatus: DisplayStatus = status === 'completed' ? 'completed' : 'skipped';
  setQueue((prev) => prev.map((q) => q.id === workItemId ? { ...q, displayStatus: exitStatus } : q));
  setProcessingId((prev) => prev === workItemId ? null : prev);
  const timer = setTimeout(() => {
    setQueue((prev) => prev.filter((q) => q.id !== workItemId));
    cleanupTimers.delete(timer);
  }, 400);
  cleanupTimers.add(timer);
};

/** O(1). Routes escalation events to ingestion queue via stable ref. */
export const dispatchEscalation = (enqueueRef: React.RefObject<(id: string, data: ElementEscalatedEvent) => void>) =>
  (data: unknown) => { const e = data as ElementEscalatedEvent; enqueueRef.current?.(e.id, e); };

/** O(1). Sets fiber-paused state. */
export const dispatchFiberPaused = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(true);

/** O(1). Clears fiber-paused state. */
export const dispatchFiberResumed = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(false);
