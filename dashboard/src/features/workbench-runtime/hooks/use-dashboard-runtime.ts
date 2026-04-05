import { useState, useEffect, useRef, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIngestionQueue } from '../../../hooks/use-ingestion-queue';
import { useWebSocket } from '../../../hooks/use-web-socket';
import { useConvergenceState } from '../../../hooks/use-convergence-state';
import { useStageTracker } from '../../../hooks/use-stage-tracker';
import { useIterationPulse } from '../../../hooks/use-iteration-pulse';
import {
  createProbeEventBuffer,
  useProbePipelineBridge,
  writeProbeEventToBuffer,
} from '../../../hooks/probe-event-buffer';
import {
  dispatchProgress,
  dispatchProbe,
  dispatchCapture,
  dispatchItemPending,
  dispatchItemProcessing,
  dispatchItemCompleted,
  dispatchFiberPaused,
  dispatchFiberResumed,
} from '../../../hooks/dispatch-handlers';
import {
  createDashboardEventObserver,
  dispatchDashboardEvent,
  type DashboardEventMessage,
} from '../../../hooks/dashboard-event-observer';
import { isDashboardEventKind } from '../../../projections/events/dashboard-event-metadata';
import type {
  ArtifactWrittenEvent,
  ProbeEvent,
  ProposalActivatedEvent,
  ScreenCapture,
  ViewportDimensions,
} from '../../../spatial/types';
import type { PauseContext, ProgressEvent, QueuedItem } from '../../../types';

export function useDashboardRuntime(url: string) {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [queue, setQueue] = useState<readonly QueuedItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<ScreenCapture | null>(null);
  const [appViewport, setAppViewport] = useState<ViewportDimensions>({
    width: 1280,
    height: 720,
  });
  const [pauseContext, setPauseContext] = useState<PauseContext | null>(null);

  const probeQueue = useIngestionQueue<ProbeEvent>({ staggerMs: 60, maxBuffer: 300 });
  const proposalQueue = useIngestionQueue<ProposalActivatedEvent>({
    staggerMs: 100,
    maxBuffer: 200,
  });
  const artifactQueue = useIngestionQueue<ArtifactWrittenEvent>({
    staggerMs: 50,
    maxBuffer: 50,
  });
  const probeBufferRef = useRef(createProbeEventBuffer(2048));

  const convergence = useConvergenceState();
  const stageTracker = useStageTracker();
  const iterationPulse = useIterationPulse();
  const cleanupTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  const enqueueRef = useRef(probeQueue.enqueue);
  enqueueRef.current = probeQueue.enqueue;

  const proposalEnqueueRef = useRef(proposalQueue.enqueue);
  proposalEnqueueRef.current = proposalQueue.enqueue;

  const artifactEnqueueRef = useRef(artifactQueue.enqueue);
  artifactEnqueueRef.current = artifactQueue.enqueue;

  const convergenceRungRef = useRef(convergence.pushRung);
  convergenceRungRef.current = convergence.pushRung;

  const convergenceCalRef = useRef(convergence.pushCalibration);
  convergenceCalRef.current = convergence.pushCalibration;

  const iterationStartRef = useRef(iterationPulse.onStart);
  iterationStartRef.current = iterationPulse.onStart;

  const iterationCompleteRef = useRef(iterationPulse.onComplete);
  iterationCompleteRef.current = iterationPulse.onComplete;

  const stageDispatchRef = useRef(stageTracker.dispatch);
  stageDispatchRef.current = stageTracker.dispatch;

  const dashboardEventObserverRef = useRef<ReturnType<
    typeof createDashboardEventObserver
  > | null>(null);

  if (!dashboardEventObserverRef.current) {
    dashboardEventObserverRef.current = createDashboardEventObserver({
      queryClient,
      iterationStart: () => iterationStartRef.current(),
      iterationComplete: () => iterationCompleteRef.current(),
      progress: dispatchProgress(setProgress),
      elementProbed: dispatchProbe(enqueueRef),
      screenCaptured: dispatchCapture(setCapture, setAppViewport),
      itemPending: dispatchItemPending(setQueue),
      itemProcessing: dispatchItemProcessing(setProcessingId, setQueue),
      itemCompleted: dispatchItemCompleted(
        setProcessingId,
        setQueue,
        cleanupTimersRef.current,
      ),
      elementEscalated: () => void 0,
      fiberPaused: dispatchFiberPaused(setPauseContext),
      fiberResumed: dispatchFiberResumed(setPauseContext),
      rungShift: convergenceRungRef.current,
      calibrationUpdate: convergenceCalRef.current,
      proposalActivated: (event) => {
        proposalEnqueueRef.current?.(event.proposalId, event);
      },
      artifactWritten: (event) => {
        artifactEnqueueRef.current?.(event.path, event);
      },
      stageLifecycle: stageDispatchRef.current,
    });
  }

  useProbePipelineBridge({
    buffer: probeBufferRef.current,
    enqueue: probeQueue.enqueue,
  });

  const handleMessage = (message: {
    readonly type: string;
    readonly data: unknown;
  }) => {
    if (!dashboardEventObserverRef.current || !isDashboardEventKind(message.type)) {
      return;
    }

    if (message.type === 'element-probed' && probeBufferRef.current !== null) {
      writeProbeEventToBuffer(probeBufferRef.current, message.data as ProbeEvent);
      return;
    }

    startTransition(() => {
      dispatchDashboardEvent(
        dashboardEventObserverRef.current!,
        message as DashboardEventMessage,
      );
    });
  };

  const { connected, send } = useWebSocket(url, handleMessage);

  useEffect(() => {
    const timers = cleanupTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return {
    connected,
    send,
    progress,
    queue,
    processingId,
    capture,
    appViewport,
    probeQueue,
    pauseContext,
    convergence,
    stageTracker,
    iterationPulse,
    proposalQueue,
    artifactQueue,
  } as const;
}
