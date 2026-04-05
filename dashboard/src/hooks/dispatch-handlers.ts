/**
 * Dispatch handler factories — pure higher-order functions for WebSocket event routing.
 *
 * Each factory captures React state setters and returns a typed handler.
 * All use the ref pattern (.current) for closure stability — the dispatch table
 * captures these at build time and never needs to be rebuilt.
 *
 * These are extracted from the app/App.tsx shell for separation of concerns:
 *   app/App.tsx owns composition (hooks + components)
 *   dispatch-handlers.ts owns event routing (pure transforms)
 */

import type React from 'react';
import type {
  ProbeEvent, ScreenCapture, ViewportDimensions, ElementEscalatedEvent,
  RungShiftEvent, CalibrationUpdateEvent, ProposalActivatedEvent,
  ConfidenceCrossedEvent, ArtifactWrittenEvent, StageLifecycleEvent,
  InboxItemEvent,
} from '../spatial/types';
import type { WorkItem, QueuedItem, DisplayStatus, ProgressEvent, Workbench, Scorecard } from '../types';
import type { DashboardEventKind } from '../../../lib/domain/observation/dashboard';
import type { DashboardEventMap, EventHandler, ScreenGroupStartPayload, ConnectedPayload, ErrorPayload } from '../types/events';
import type { QueryClient } from '@tanstack/react-query';

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

/** O(1). Sets fiber-paused state with full pause context for 3D decision overlay. */
export const dispatchFiberPaused = (setPauseContext: (ctx: import('../types').PauseContext | null) => void) =>
  (data: unknown) => {
    const d = data as { workItemId: string; screen: string; element: string | null; reason: string };
    setPauseContext({
      workItemId: d.workItemId,
      screen: d.screen ?? 'unknown',
      element: d.element ?? null,
      reason: d.reason ?? '',
    });
  };

/** O(1). Clears fiber-paused state. */
export const dispatchFiberResumed = (setPauseContext: (ctx: import('../types').PauseContext | null) => void) =>
  (_data: unknown) => setPauseContext(null);


/** O(1). Explicit no-op routing for currently unrendered event kinds. */
export const dispatchDeadLetter = <K extends DashboardEventKind>(
  kind: K,
  onDeadLetter?: (event: { readonly kind: K; readonly data: DashboardEventMap[K] }) => void,
): EventHandler<K> =>
  (data) => onDeadLetter?.({ kind, data });

// ─── Typed dispatch handlers for previously unconsumed events ───

/** O(1). Routes rung-shift events to convergence state via stable ref. */
export const dispatchRungShift = (
  pushRungRef: React.RefObject<(event: RungShiftEvent) => void>,
): EventHandler<'rung-shift'> =>
  (data) => pushRungRef.current?.(data);

/** O(1). Routes calibration-update events to convergence state via stable ref. */
export const dispatchCalibrationUpdate = (
  pushCalRef: React.RefObject<(event: CalibrationUpdateEvent) => void>,
): EventHandler<'calibration-update'> =>
  (data) => pushCalRef.current?.(data);

/** O(1). Routes proposal-activated events to ingestion queue via stable ref. */
export const dispatchProposalActivated = (
  enqueueRef: React.RefObject<(id: string, data: ProposalActivatedEvent) => void>,
): EventHandler<'proposal-activated'> =>
  (data) => enqueueRef.current?.(data.proposalId, data);

/** O(1). Routes confidence-crossed events to ingestion queue via stable ref. */
export const dispatchConfidenceCrossed = (
  enqueueRef: React.RefObject<(id: string, data: ConfidenceCrossedEvent) => void>,
): EventHandler<'confidence-crossed'> =>
  (data) => enqueueRef.current?.(data.artifactId, data);

/** O(1). Routes artifact-written events to ingestion queue via stable ref. */
export const dispatchArtifactWritten = (
  enqueueRef: React.RefObject<(id: string, data: ArtifactWrittenEvent) => void>,
): EventHandler<'artifact-written'> =>
  (data) => enqueueRef.current?.(data.path, data);

/** O(1). Signals iteration start via stable ref. */
export const dispatchIterationStart = (
  onStartRef: React.RefObject<() => void>,
): EventHandler<'iteration-start'> =>
  (_data) => onStartRef.current?.();

/** O(1). Signals iteration complete via stable ref. */
export const dispatchIterationComplete = (
  onCompleteRef: React.RefObject<() => void>,
): EventHandler<'iteration-complete'> =>
  (_data) => onCompleteRef.current?.();

/** O(1). Routes workbench-updated events to React Query cache. */
export const dispatchWorkbenchUpdated = (
  qc: QueryClient,
): EventHandler<'workbench-updated'> =>
  (data) => qc.setQueryData(['workbench'], data);

/** O(1). Routes fitness-updated events to React Query cache. */
export const dispatchFitnessUpdated = (
  qc: QueryClient,
): EventHandler<'fitness-updated'> =>
  (data) => qc.setQueryData(['fitness'], data);

/** O(1). Routes stage-lifecycle events to stage tracker via stable ref. */
export const dispatchStageLifecycle = (
  stageDispatchRef: React.RefObject<(event: StageLifecycleEvent) => void>,
): EventHandler<'stage-lifecycle'> =>
  (data) => stageDispatchRef.current?.(data);

/** O(n). Appends inbox item to bounded feed via state setter. */
export const dispatchInboxItemArrived = (
  setInboxItems: React.Dispatch<React.SetStateAction<readonly InboxItemEvent[]>>,
  maxItems = 50,
): EventHandler<'inbox-item-arrived'> =>
  (data) => setInboxItems((prev) => [...prev.slice(-(maxItems - 1)), data]);

/** O(1). Routes screen-group-start to state setter. */
export const dispatchScreenGroupStart = (
  setScreenGroup: (group: ScreenGroupStartPayload | null) => void,
): EventHandler<'screen-group-start'> =>
  (data) => setScreenGroup(data);

/** O(1). Routes connected event. Typically a no-op beyond logging. */
export const dispatchConnected = (
  onConnected?: (payload: ConnectedPayload) => void,
): EventHandler<'connected'> =>
  (data) => onConnected?.(data);

/** O(1). Routes error event to state setter. */
export const dispatchError = (
  setLastError: React.Dispatch<React.SetStateAction<ErrorPayload | null>>,
): EventHandler<'error'> =>
  (data) => setLastError(data);
