/**
 * Tesseract Dashboard — Effect-driven React view.
 *
 * This is a thin composition shell. All concerns are decomposed:
 *   - Types:      dashboard/src/types.ts
 *   - Dispatch:   dashboard/src/hooks/dispatch-handlers.ts
 *   - WebSocket:  dashboard/src/hooks/use-web-socket.ts
 *   - Queues:     dashboard/src/hooks/use-ingestion-queue.ts
 *   - Convergence: dashboard/src/hooks/use-convergence-state.ts
 *   - Stages:     dashboard/src/hooks/use-stage-tracker.ts
 *   - Pulse:      dashboard/src/hooks/use-iteration-pulse.ts
 *   - Atoms:      dashboard/src/atoms/
 *   - Molecules:  dashboard/src/molecules/
 *   - Organisms:  dashboard/src/organisms/
 *   - Spatial:    dashboard/src/spatial/
 */

import { useState, useEffect, useRef, useTransition, Suspense, use, useDeferredValue, useOptimistic } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SpatialCanvas } from './spatial/canvas';
import { LiveDomPortal, PortalLoading } from './spatial/live-dom-portal';
import { SceneErrorBoundary } from './atoms/error-boundary';
import { useIngestionQueue } from './hooks/use-ingestion-queue';
import { useWebSocket } from './hooks/use-web-socket';
import { useScreencastStream } from './hooks/use-screencast-stream';
import { useWebMcpCapabilities } from './hooks/use-mcp-capabilities';
import { useConvergenceState } from './hooks/use-convergence-state';
import { useStageTracker } from './hooks/use-stage-tracker';
import { useIterationPulse } from './hooks/use-iteration-pulse';
import { useSabBridge } from './hooks/use-sab-bridge';
import { useFlywheelAct } from './hooks/use-flywheel-act';
import { useSceneStateSnapshots } from './hooks/use-scene-state-snapshots';
import {
  dispatchProgress, dispatchProbe, dispatchCapture,
  dispatchItemPending, dispatchItemProcessing, dispatchItemCompleted,
  dispatchEscalation, dispatchFiberPaused, dispatchFiberResumed, dispatchDeadLetter,
} from './hooks/dispatch-handlers';
import { ConvergencePanel } from './organisms/convergence-panel';
import { PipelineProgress } from './organisms/pipeline-progress';
import { StatusBar } from './molecules/status-bar';
import { FitnessCard } from './molecules/fitness-card';
import { ProgressCard } from './molecules/progress-card';
import { QueueVisualization } from './organisms/queue-visualization';
import { WorkbenchPanel } from './organisms/workbench-panel';
import { CompletionsPanel } from './organisms/completions-panel';
import { DiagnosticsPanel } from './organisms/diagnostics-panel';
import type {
  ProbeEvent, ScreenCapture, ViewportDimensions, ElementEscalatedEvent,
  RungShiftEvent, CalibrationUpdateEvent, ProposalActivatedEvent, StageLifecycleEvent,
  ArtifactWrittenEvent,
} from './spatial/types';
import type { Workbench, Scorecard, ProgressEvent, QueuedItem, PauseContext, DecisionResult } from './types';
import type { DiagnosticsProjection } from './types';
import type { FrameBudgetSample } from './spatial/frame-budget-instrumentation';

// ─── W3.2: SharedArrayBuffer global (set by in-process server when same-origin) ───

declare global {
  interface Window {
    readonly __PIPELINE_SAB?: SharedArrayBuffer | undefined;
  }
}

// ─── Effect Stream Hook ───

function useEffectStream(url: string) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [queue, setQueue] = useState<readonly QueuedItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<ScreenCapture | null>(null);
  const [appViewport, setAppViewport] = useState<ViewportDimensions>({ width: 1280, height: 720 });
  const [pauseContext, setPauseContext] = useState<PauseContext | null>(null);

  const convergence = useConvergenceState();
  const stageTracker = useStageTracker();
  const iterationPulse = useIterationPulse();
  const playbackSpeed = 1;
  const act = useFlywheelAct(stageTracker.activeStage, progress?.phase ?? null);
  const throughputRef = useRef({ windowStart: performance.now(), eventsInWindow: 0 });
  const [throughputPerSecond, setThroughputPerSecond] = useState(0);

  const probeQueue = useIngestionQueue<ProbeEvent>({
    staggerMs: 60,
    maxBuffer: 300,
    act,
    playbackSpeed,
    maxBatchPerFrame: 2,
    semanticKey: (probe) => `${probe.screen}::${probe.element}`,
    onStateDelta: () => {
      throughputRef.current.eventsInWindow += 1;
      const elapsed = performance.now() - throughputRef.current.windowStart;
      if (elapsed >= 1000) {
        setThroughputPerSecond(throughputRef.current.eventsInWindow / (elapsed / 1000));
        throughputRef.current.windowStart = performance.now();
        throughputRef.current.eventsInWindow = 0;
      }
    },
  });
  const escalationQueue = useIngestionQueue<ElementEscalatedEvent>({ staggerMs: 80, maxBuffer: 100, act, playbackSpeed, maxBatchPerFrame: 2 });
  const proposalQueue = useIngestionQueue<ProposalActivatedEvent>({
    staggerMs: 100,
    maxBuffer: 200,
    act,
    playbackSpeed,
    maxBatchPerFrame: 2,
    semanticKey: (proposal) => `${proposal.iteration}::${proposal.targetPath}`,
  });
  const artifactQueue = useIngestionQueue<ArtifactWrittenEvent>({ staggerMs: 50, maxBuffer: 50, act, playbackSpeed, maxBatchPerFrame: 3 });

  // W5.18: useTransition for non-blocking high-frequency event dispatch.
  // element-probed, rung-shift, and calibration-update yield to user interactions
  // so the 3D spatial canvas stays at 60fps during burst events.
  const [, startTransition] = useTransition();

  const cleanupTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  // ─── Stable refs for all dispatch targets ───
  const enqueueRef = useRef(probeQueue.enqueue);
  enqueueRef.current = probeQueue.enqueue;
  const escalationEnqueueRef = useRef(escalationQueue.enqueue);
  escalationEnqueueRef.current = escalationQueue.enqueue;
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
  const deadLetterRef = useRef((eventType: string) => {
    console.debug('[dashboard] flywheel event dead-lettered', eventType);
  });


  // ─── Dispatch table (built once, all handlers use refs) ───
  const dispatchRef = useRef<Record<string, (data: unknown) => void> | null>(null);
  if (!dispatchRef.current) {
    dispatchRef.current = {
      'progress': dispatchProgress(setProgress),
      // W5.18: high-frequency events wrapped in startTransition to yield to user interactions
      'element-probed': (data) => startTransition(() => dispatchProbe(enqueueRef)(data)),
      'screen-captured': dispatchCapture(setCapture, setAppViewport),
      'item-pending': dispatchItemPending(setQueue),
      'item-processing': dispatchItemProcessing(setProcessingId, setQueue),
      'item-completed': dispatchItemCompleted(setProcessingId, setQueue, cleanupTimersRef.current),
      'element-escalated': dispatchEscalation(escalationEnqueueRef),
      'fiber-paused': dispatchFiberPaused(setPauseContext),
      'fiber-resumed': dispatchFiberResumed(setPauseContext),
      'rung-shift': (data) => startTransition(() => convergenceRungRef.current(data as RungShiftEvent)),
      'calibration-update': (data) => startTransition(() => convergenceCalRef.current(data as CalibrationUpdateEvent)),
      'iteration-start': () => iterationStartRef.current(),
      'iteration-complete': () => iterationCompleteRef.current(),
      'proposal-activated': (data) => { const e = data as ProposalActivatedEvent; proposalEnqueueRef.current?.(e.proposalId, e); },
      'artifact-written': (data) => { const e = data as ArtifactWrittenEvent; artifactEnqueueRef.current?.(e.path, e); },
      'stage-lifecycle': (data) => stageDispatchRef.current(data as StageLifecycleEvent),
      'surface-discovered': dispatchDeadLetter('surface-discovered', ({ kind }) => deadLetterRef.current(kind)),
      'route-navigated': dispatchDeadLetter('route-navigated', ({ kind }) => deadLetterRef.current(kind)),
      'aria-tree-captured': dispatchDeadLetter('aria-tree-captured', ({ kind }) => deadLetterRef.current(kind)),
      'suite-slice-selected': dispatchDeadLetter('suite-slice-selected', ({ kind }) => deadLetterRef.current(kind)),
      'scenario-prioritized': dispatchDeadLetter('scenario-prioritized', ({ kind }) => deadLetterRef.current(kind)),
      'step-bound': dispatchDeadLetter('step-bound', ({ kind }) => deadLetterRef.current(kind)),
      'scenario-compiled': dispatchDeadLetter('scenario-compiled', ({ kind }) => deadLetterRef.current(kind)),
      'step-executing': dispatchDeadLetter('step-executing', ({ kind }) => deadLetterRef.current(kind)),
      'step-resolved': dispatchDeadLetter('step-resolved', ({ kind }) => deadLetterRef.current(kind)),
      'scenario-executed': dispatchDeadLetter('scenario-executed', ({ kind }) => deadLetterRef.current(kind)),
      'trust-policy-evaluated': dispatchDeadLetter('trust-policy-evaluated', ({ kind }) => deadLetterRef.current(kind)),
      'knowledge-activated': dispatchDeadLetter('knowledge-activated', ({ kind }) => deadLetterRef.current(kind)),
      'convergence-evaluated': dispatchDeadLetter('convergence-evaluated', ({ kind }) => deadLetterRef.current(kind)),
      'iteration-summary': dispatchDeadLetter('iteration-summary', ({ kind }) => deadLetterRef.current(kind)),
      'diagnostics': dispatchDeadLetter('diagnostics', ({ kind }) => deadLetterRef.current(kind)),
    };
  }

  const handleMessage = (msg: { readonly type: string; readonly data: unknown }) => {
    const handler = dispatchRef.current?.[msg.type];
    if (handler && msg.data != null) handler(msg.data);
    else if (msg.type === 'workbench-updated') qc.setQueryData(['workbench'], msg.data);
    else if (msg.type === 'fitness-updated') qc.setQueryData(['fitness'], msg.data);
  };

  const screencastStream = useScreencastStream();
  const { connected, send } = useWebSocket(url, handleMessage, screencastStream.onBinaryFrame);

  // W3.2: Wire SharedArrayBuffer zero-copy path for high-frequency events.
  // When the pipeline runs in-process, window.__PIPELINE_SAB is set and the
  // SAB bridge dispatches events through the same handleMessage path — no
  // JSON serialization, no WebSocket overhead, no GC pressure.
  const sabBridge = useSabBridge({
    sab: (typeof window !== 'undefined' ? window.__PIPELINE_SAB : undefined) ?? null,
    onMessage: handleMessage,
  });

  useEffect(() => {
    const timers = cleanupTimersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  return {
    connected: connected || sabBridge.connected,
    send,
    progress,
    queue,
    processingId,
    capture,
    appViewport,
    screencastStream,
    probeQueue,
    escalationQueue,
    pauseContext,
    convergence,
    stageTracker,
    iterationPulse,
    proposalQueue,
    artifactQueue,
    act,
    playbackSpeed,
    throughputPerSecond,
  };
}

// ─── Data Hooks ───

const useWorkbench = () => useQuery<Workbench | null>({
  queryKey: ['workbench'],
  queryFn: async () => { const r = await fetch('/api/workbench'); return r.ok ? r.json() : null; },
  refetchInterval: 15000,
  staleTime: 5000,
});

/** W5.19: Streaming fitness data via use() hook.
 *  Creates a promise that resolves with scorecard data, replacing the polling pattern.
 *  The promise is cached and refreshed on WebSocket push ('fitness-updated'). */
const createFitnessPromise = (): Promise<Scorecard | null> =>
  fetch('/api/fitness').then((r) => r.ok ? r.json() as Promise<Scorecard | null> : null).catch(() => null);

/** W5.19: SuspenseFitnessCard reads scorecard via use() instead of useQuery polling.
 *  Paired with <Suspense> boundary for non-blocking loading states. */
function SuspenseFitnessCard({ fitnessPromise }: { readonly fitnessPromise: Promise<Scorecard | null> }) {
  const scorecard = use(fitnessPromise);
  return <FitnessCard scorecard={scorecard} />;
}

const useKnowledgeNodes = () => useQuery<readonly import('./spatial/types').KnowledgeNode[]>({
  queryKey: ['knowledge-nodes'],
  queryFn: async () => {
    const r = await fetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_knowledge_state', arguments: {} }),
    });
    if (!r.ok) return [];
    const result = await r.json();
    const nodes = result?.result?.nodes ?? [];
    return nodes.flatMap((n: Record<string, unknown>) => {
      const id = String(n.id ?? '');
      const parts = id.split('/');
      if (parts.length < 2) return [];
      return [{
        screen: parts[0] ?? 'unknown',
        element: parts.slice(1).join('/'),
        confidence: typeof n.confidence === 'number' ? n.confidence : 0.5,
        aliases: Array.isArray(n.aliases) ? n.aliases : [],
        status: (n.status as import('./spatial/types').KnowledgeNodeStatus) ?? 'learning',
        lastActor: (n.lastActor as import('./spatial/types').ActorKind) ?? 'system',
        governance: (n.governance as import('./spatial/types').Governance) ?? 'approved',
      }];
    });
  },
  refetchInterval: 20000,
  staleTime: 10000,
});

const useDecision = (send: (msg: unknown) => void) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workItemId: string; status: 'completed' | 'skipped'; rationale: string }) => {
      send({ type: 'decision', ...input });
      await fetch('/api/workbench/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completion: { ...input, completedAt: new Date().toISOString(), artifactsWritten: [] } }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workbench'] }),
  });
};

// ─── App ───

function App() {
  const { data: workbench } = useWorkbench();
  // W5.19: fitness data loaded via use() + Suspense instead of useQuery polling.
  // fitnessPromiseRef holds the current promise; refreshed on WebSocket 'fitness-updated'.
  const fitnessPromiseRef = useRef(createFitnessPromise());
  const { data: knowledgeNodes } = useKnowledgeNodes();
  const {
    connected,
    send,
    progress,
    queue,
    capture,
    appViewport,
    screencastStream,
    probeQueue,
    pauseContext,
    convergence,
    stageTracker,
    iterationPulse,
    proposalQueue,
    artifactQueue,
    act,
    throughputPerSecond,
  } = useEffectStream(`ws://${window.location.host}/ws`);
  const decisionMutation = useDecision(send);

  // W5.19: refresh fitness promise when WebSocket pushes 'fitness-updated'
  const refreshFitness = () => {
    fitnessPromiseRef.current = createFitnessPromise();
  };

  const capabilities = useWebMcpCapabilities(capture?.url);
  const [portalLoaded, setPortalLoaded] = useState(false);
  // CDP screencast takes priority over LiveDomPortal — if we're receiving
  // real compositor frames, there's no need for the iframe fallback.
  // Check the binary stream ref (no re-render) OR the legacy capture state.
  const hasScreencast = screencastStream.hasFrame.current || capture !== null;
  const portalActive = !hasScreencast && capabilities.liveDomPortal && portalLoaded;

  const handleApprove = (id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'completed', rationale: `Dashboard approved` });
  };

  const handleSkip = (id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'skipped', rationale: `Dashboard skipped` });
  };

  const activeProbes = probeQueue.active.map((q) => q.data);
  const activeProposals = proposalQueue.active.map((q) => q.data);
  const activeArtifacts = artifactQueue.active.map((q) => q.data);
  const [frameSample, setFrameSample] = useState<FrameBudgetSample>({ avgFrameTimeMs: 16.67, droppedFrames: 0 });
  const [lastEventLagMs, setLastEventLagMs] = useState(0);

  const handleParticleArrived = (probeId: string) => {
    probeQueue.retire(probeId);
  };

  const handlePortalLoaded = () => setPortalLoaded(true);
  const handleFrameBudgetSample = (sample: FrameBudgetSample) => {
    setFrameSample(sample);
  };

  const probeActiveLength = probeQueue.active.length;
  useEffect(() => {
    const lastProbe = probeQueue.active[probeQueue.active.length - 1];
    if (!lastProbe || lastProbe.emittedAt == null) return;
    setLastEventLagMs(Math.max(0, performance.now() - lastProbe.queuedAt));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on length to avoid infinite loop from array identity
  }, [probeActiveLength]);

  // Phase 6: decision burst state — set when approve/skip triggers, cleared when animation completes
  const [decisionBurst, setDecisionBurst] = useState<{ readonly origin: readonly [number, number, number]; readonly result: DecisionResult } | null>(null);

  const handleApprove3D = (workItemId: string) => {
    // Find matching probe to get burst origin position
    const probe = activeProbes.find((p) => pauseContext?.element === p.element && p.boundingBox);
    const origin: [number, number, number] = probe?.boundingBox
      ? [((probe.boundingBox.x + probe.boundingBox.width / 2) / appViewport.width) * 3 - 1.5 - 1.8,
         -(((probe.boundingBox.y + probe.boundingBox.height / 2) / appViewport.height) * 2 - 1) * 1.1,
         0.1]
      : [-1.8, 0, 0.1];
    setDecisionBurst({ origin, result: 'approved' });
    handleApprove(workItemId);
  };

  const handleSkip3D = (workItemId: string) => {
    const probe = activeProbes.find((p) => pauseContext?.element === p.element && p.boundingBox);
    const origin: [number, number, number] = probe?.boundingBox
      ? [((probe.boundingBox.x + probe.boundingBox.width / 2) / appViewport.width) * 3 - 1.5 - 1.8,
         -(((probe.boundingBox.y + probe.boundingBox.height / 2) / appViewport.height) * 2 - 1) * 1.1,
         0.1]
      : [-1.8, 0, 0.1];
    setDecisionBurst({ origin, result: 'skipped' });
    handleSkip(workItemId);
  };

  const handleBurstComplete = () => setDecisionBurst(null);
  const coalescingRatio = probeQueue.diagnostics.ingestedCount === 0
    ? 0
    : probeQueue.diagnostics.coalescedCount / probeQueue.diagnostics.ingestedCount;
  const diagnostics: DiagnosticsProjection = {
    throughputPerSecond,
    coalescingRatio,
    avgFrameTimeMs: frameSample.avgFrameTimeMs,
    lagMs: lastEventLagMs,
    droppedFrames: Math.max(frameSample.droppedFrames, probeQueue.diagnostics.droppedFrames),
    queueDepthByAct: probeQueue.diagnostics.queueDepthByAct,
  };

  const snapshotState = useSceneStateSnapshots({
    enabled: true,
    everyNEvents: 1000,
    everyMs: 5000,
    eventSequence: probeQueue.diagnostics.ingestedCount,
    iteration: progress?.iteration ?? 0,
    act,
    knowledgeNodeCount: (knowledgeNodes ?? []).length,
    activeProbeCount: activeProbes.length,
    activeProposalCount: activeProposals.length,
    activeArtifactCount: activeArtifacts.length,
    throughputPerSecond,
    queueDepthByAct: probeQueue.diagnostics.queueDepthByAct,
  });

  return (
    <div className="dashboard-layout">
      <div className="spatial-viewport" role="main" aria-label="Pipeline visualization">
        {!hasScreencast && capabilities.liveDomPortal && capabilities.appUrl && (
          <LiveDomPortal appUrl={capabilities.appUrl} onLoad={handlePortalLoaded} />
        )}
        <PortalLoading visible={!hasScreencast && capabilities.liveDomPortal && !portalLoaded} />

        <SceneErrorBoundary>
          <SpatialCanvas
            probes={activeProbes}
            capture={portalActive ? null : capture}
            stream={screencastStream}
            viewport={screencastStream.hasFrame.current ? screencastStream.dimensions.current : appViewport}
            knowledgeNodes={knowledgeNodes ?? []}
            onParticleArrived={handleParticleArrived}
            portalActive={portalActive}
            proposalEvents={activeProposals}
            artifactEvents={activeArtifacts}
            iterationTick={iterationPulse.tick}
            pauseContext={pauseContext}
            onApprove={handleApprove3D}
            onSkip={handleSkip3D}
            decisionBurst={decisionBurst}
            onBurstComplete={handleBurstComplete}
            onFrameBudgetSample={handleFrameBudgetSample}
          />
        </SceneErrorBoundary>

        <DiagnosticsPanel diagnostics={diagnostics} />
        {probeQueue.buffered > 0 && <div className="buffer-indicator">{probeQueue.buffered} buffered</div>}
        {capabilities.mcpAvailable && <div className="mcp-indicator">MCP</div>}
        {pauseContext !== null && <div className="fiber-paused-indicator" aria-live="polite">AWAITING HUMAN</div>}
        {snapshotState.snapshots.length > 0 && (
          <div className="buffer-indicator" style={{ bottom: 36 }}>
            snapshots: {snapshotState.snapshots.length}
          </div>
        )}
      </div>

      <div className="control-panel" role="complementary" aria-label="Dashboard controls">
        <h1>Tesseract Dashboard</h1>
        <StatusBar workbench={workbench ?? null} scorecard={null} connected={connected} progress={progress} />
        <PipelineProgress stages={stageTracker.stages} activeStage={stageTracker.activeStage} />
        <ConvergencePanel state={convergence.state} />
        <div className="grid">
          {/* W5.19: use() + Suspense replaces useQuery polling for fitness data */}
          <Suspense fallback={<FitnessCard scorecard={null} />}>
            <SuspenseFitnessCard fitnessPromise={fitnessPromiseRef.current} />
          </Suspense>
          <ProgressCard progress={progress} />
        </div>
        <QueueVisualization queue={queue} onApprove={handleApprove} onSkip={handleSkip} />
        <WorkbenchPanel workbench={workbench ?? null} onApprove={handleApprove} onSkip={handleSkip} />
        <div className="grid">
          <CompletionsPanel completions={workbench?.completions ?? []} />
        </div>
      </div>
    </div>
  );
}

// ─── Mount ───

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><App /></QueryClientProvider>,
);
