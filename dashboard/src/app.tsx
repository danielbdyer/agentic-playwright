/**
 * Tesseract Dashboard — Effect-driven React view with queue animation.
 *
 * The Effect fiber IS the source of truth. This React app is a service
 * consumer that renders the fiber's state. The fiber pushes events over
 * WebSocket; the React app renders them. When the fiber pauses for a
 * human decision, this app renders the decision UI and sends the response.
 *
 * Architecture:
 *   Effect fiber → DashboardPort → WS adapter → WebSocket → React
 *   React (human click) → WebSocket → WS adapter → fiber resumes
 *
 * Animation: CSS-only transitions on GPU-composited properties (transform,
 * opacity). No animation library. 60fps via will-change + translate3d.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SpatialCanvas } from './spatial/canvas';
import { LiveDomPortal, PortalLoading } from './spatial/live-dom-portal';
import { SceneErrorBoundary } from './atoms/error-boundary';
import { useIngestionQueue } from './hooks/use-ingestion-queue';
import { useWebSocket } from './hooks/use-web-socket';
import { useWebMcpCapabilities } from './hooks/use-mcp-capabilities';
import { useConvergenceState } from './hooks/use-convergence-state';
import { useStageTracker } from './hooks/use-stage-tracker';
import { useIterationPulse } from './hooks/use-iteration-pulse';
import { ConvergencePanel } from './organisms/convergence-panel';
import { PipelineProgress } from './organisms/pipeline-progress';
import { StatusBar } from './molecules/status-bar';
import { FitnessCard } from './molecules/fitness-card';
import { ProgressCard } from './molecules/progress-card';
import { QueueVisualization } from './organisms/queue-visualization';
import { WorkbenchPanel } from './organisms/workbench-panel';
import { CompletionsPanel } from './organisms/completions-panel';
import type {
  ProbeEvent, ScreenCapture, ViewportDimensions, ElementEscalatedEvent,
  RungShiftEvent, CalibrationUpdateEvent, ProposalActivatedEvent, StageLifecycleEvent,
  ArtifactWrittenEvent,
} from './spatial/types';

// ─── Types (projections of domain types) ───

interface WorkItem {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly context: { readonly screen?: string; readonly element?: string; readonly proposalId?: string; readonly artifactRefs: readonly string[] };
  readonly evidence: { readonly confidence: number; readonly sources: readonly string[] };
}

interface Completion {
  readonly workItemId: string;
  readonly status: string;
  readonly completedAt: string;
  readonly rationale: string;
}

interface Workbench {
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly WorkItem[];
  readonly completions: readonly Completion[];
  readonly summary: { readonly total: number; readonly pending: number; readonly completed: number; readonly byKind: Readonly<Record<string, number>>; readonly topPriority: WorkItem | null };
}

interface Scorecard {
  readonly highWaterMark: { readonly knowledgeHitRate: number; readonly translationPrecision: number; readonly convergenceVelocity: number; readonly proposalYield: number; readonly resolutionByRung?: ReadonlyArray<{ readonly rung: string; readonly wins: number; readonly rate: number }> };
}

interface ProgressEvent {
  readonly phase: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: { readonly knowledgeHitRate: number; readonly proposalsActivated: number; readonly totalSteps: number; readonly unresolvedSteps: number } | null;
  readonly convergenceReason: string | null;
  readonly elapsed: number;
  readonly calibration?: { readonly weightDrift: number; readonly topCorrelation: { readonly signal: string; readonly strength: number } | null } | null;
}

// Queue item extends WorkItem with animation display status
type DisplayStatus = 'entering' | 'pending' | 'processing' | 'completed' | 'skipped';
interface QueuedItem extends WorkItem { readonly displayStatus: DisplayStatus }

// ─── Pure Message Dispatch ───
// Each handler is a higher-order function: (deps) → (data) → void.
// All use the ref pattern (.current) for closure stability.

const dispatchProgress = (setProgress: (p: ProgressEvent) => void) =>
  (data: unknown) => setProgress(data as ProgressEvent);

const dispatchProbe = (enqueueRef: React.RefObject<(id: string, data: ProbeEvent) => void>) =>
  (data: unknown) => { const p = data as ProbeEvent; enqueueRef.current?.(p.id, p); };

const dispatchCapture = (
  setCapture: (c: ScreenCapture) => void,
  setViewport: (v: ViewportDimensions) => void,
) => (data: unknown) => {
  const cap = data as ScreenCapture;
  setCapture(cap);
  setViewport({ width: cap.width, height: cap.height });
};

const dispatchItemPending = (setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>) =>
  (data: unknown) => {
    const item = data as WorkItem;
    setQueue((prev) => [...prev, { ...item, displayStatus: 'entering' }]);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, displayStatus: 'pending' } : q)),
    ));
  };

const dispatchItemProcessing = (
  setProcessingId: (id: string | null) => void,
  setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>,
) => (data: unknown) => {
  const { workItemId } = data as { workItemId: string };
  setProcessingId(workItemId);
  setQueue((prev) => prev.map((q) => q.id === workItemId ? { ...q, displayStatus: 'processing' } : q));
};

/** Dispatch with tracked timeout cleanup to prevent memory leaks at scale. */
const dispatchItemCompleted = (
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

const dispatchEscalation = (enqueueRef: React.RefObject<(id: string, data: ElementEscalatedEvent) => void>) =>
  (data: unknown) => { const e = data as ElementEscalatedEvent; enqueueRef.current?.(e.id, e); };

const dispatchFiberPaused = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(true);

const dispatchFiberResumed = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(false);

// ─── WebSocket Hook ───

function useEffectStream(url: string) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [queue, setQueue] = useState<readonly QueuedItem[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [capture, setCapture] = useState<ScreenCapture | null>(null);
  const [appViewport, setAppViewport] = useState<ViewportDimensions>({ width: 1280, height: 720 });
  const [fiberPaused, setFiberPaused] = useState(false);

  const probeQueue = useIngestionQueue<ProbeEvent>({ staggerMs: 60, maxBuffer: 300 });
  const escalationQueue = useIngestionQueue<ElementEscalatedEvent>({ staggerMs: 80, maxBuffer: 100 });
  const proposalQueue = useIngestionQueue<ProposalActivatedEvent>({ staggerMs: 100, maxBuffer: 200 });
  const artifactQueue = useIngestionQueue<ArtifactWrittenEvent>({ staggerMs: 50, maxBuffer: 50 });

  // Convergence, stage, and iteration hooks (Layer 2-4 visualization state)
  const convergence = useConvergenceState();
  const stageTracker = useStageTracker();
  const iterationPulse = useIterationPulse();

  // Timer cleanup set for dispatchItemCompleted (prevents memory leak at scale)
  const cleanupTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  // ─── Stable refs for all dispatch targets ───
  // The dispatch table is built once and captures these refs.
  // The refs are synced every render so the table always calls the latest version.
  const enqueueRef = useRef(probeQueue.enqueue);
  enqueueRef.current = probeQueue.enqueue;
  const escalationEnqueueRef = useRef(escalationQueue.enqueue);
  escalationEnqueueRef.current = escalationQueue.enqueue;
  const proposalEnqueueRef = useRef(proposalQueue.enqueue);
  proposalEnqueueRef.current = proposalQueue.enqueue;
  const artifactEnqueueRef = useRef(artifactQueue.enqueue);
  artifactEnqueueRef.current = artifactQueue.enqueue;
  // Fix: convergence/iteration/stage handlers also use the ref pattern
  // to avoid stale closures in the dispatch table.
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

  // Build dispatch table once — all handlers use refs for closure stability.
  const dispatchRef = useRef<Record<string, (data: unknown) => void> | null>(null);
  if (!dispatchRef.current) {
    dispatchRef.current = {
      'progress': dispatchProgress(setProgress),
      'element-probed': dispatchProbe(enqueueRef),
      'screen-captured': dispatchCapture(setCapture, setAppViewport),
      'item-pending': dispatchItemPending(setQueue),
      'item-processing': dispatchItemProcessing(setProcessingId, setQueue),
      'item-completed': dispatchItemCompleted(setProcessingId, setQueue, cleanupTimersRef.current),
      'element-escalated': dispatchEscalation(escalationEnqueueRef),
      'fiber-paused': dispatchFiberPaused(setFiberPaused),
      'fiber-resumed': dispatchFiberResumed(setFiberPaused),
      // Layer 2: Convergence signals — via refs to avoid stale closures
      'rung-shift': (data) => convergenceRungRef.current(data as RungShiftEvent),
      'calibration-update': (data) => convergenceCalRef.current(data as CalibrationUpdateEvent),
      'iteration-start': () => iterationStartRef.current(),
      'iteration-complete': () => iterationCompleteRef.current(),
      // Layer 2: Proposal flow
      'proposal-activated': (data) => { const e = data as ProposalActivatedEvent; proposalEnqueueRef.current?.(e.proposalId, e); },
      // Layer 3: Artifact aurora
      'artifact-written': (data) => { const e = data as ArtifactWrittenEvent; artifactEnqueueRef.current?.(e.path, e); },
      // Layer 4: Stage lifecycle
      'stage-lifecycle': (data) => stageDispatchRef.current(data as StageLifecycleEvent),
    };
  }

  // WebSocket lifecycle — extracted to useWebSocket for clean separation.
  // The message handler routes through the dispatch table + React Query cache.
  const handleMessage = useCallback((msg: { readonly type: string; readonly data: unknown }) => {
    const handler = dispatchRef.current?.[msg.type];
    if (handler && msg.data != null) handler(msg.data);
    else if (msg.type === 'workbench-updated') qc.setQueryData(['workbench'], msg.data);
    else if (msg.type === 'fitness-updated') qc.setQueryData(['fitness'], msg.data);
  }, [qc]);

  const { connected, send } = useWebSocket(url, handleMessage);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = cleanupTimersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  return { connected, send, progress, queue, processingId, capture, appViewport, probeQueue, escalationQueue, fiberPaused, convergence, stageTracker, iterationPulse, proposalQueue, artifactQueue };
}

// ─── Data Hooks ───

const useWorkbench = () => useQuery<Workbench | null>({
  queryKey: ['workbench'],
  queryFn: async () => { const r = await fetch('/api/workbench'); return r.ok ? r.json() : null; },
  refetchInterval: 15000,
  staleTime: 5000,
});

const useFitness = () => useQuery<Scorecard | null>({
  queryKey: ['fitness'],
  queryFn: async () => { const r = await fetch('/api/fitness'); return r.ok ? r.json() : null; },
  refetchInterval: 30000,
  staleTime: 10000,
});

/** Fetch knowledge graph nodes for the observatory via MCP tool. */
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
  const { data: scorecard } = useFitness();
  const { data: knowledgeNodes } = useKnowledgeNodes();
  const { connected, send, progress, queue, capture, appViewport, probeQueue, fiberPaused, convergence, stageTracker, iterationPulse, proposalQueue, artifactQueue } = useEffectStream(`ws://${window.location.host}/ws`);
  const decisionMutation = useDecision(send);

  const capabilities = useWebMcpCapabilities(capture?.url);
  const [portalLoaded, setPortalLoaded] = useState(false);
  const portalActive = capabilities.liveDomPortal && portalLoaded;

  const handleApprove = useCallback((id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'completed', rationale: `Dashboard approved` });
  }, [decisionMutation]);

  const handleSkip = useCallback((id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'skipped', rationale: `Dashboard skipped` });
  }, [decisionMutation]);

  // Derive spatial data — React Compiler auto-memoizes
  const activeProbes = probeQueue.active.map((q) => q.data);
  const activeProposals = proposalQueue.active.map((q) => q.data);
  const activeArtifacts = artifactQueue.active.map((q) => q.data);

  const handleParticleArrived = useCallback((probeId: string) => {
    probeQueue.retire(probeId);
  }, [probeQueue]);

  const handlePortalLoaded = useCallback(() => setPortalLoaded(true), []);

  return (
    <div className="dashboard-layout">
      {/* Spatial visualization — layered viewport */}
      <div className="spatial-viewport" role="main" aria-label="Pipeline visualization">
        {capabilities.liveDomPortal && capabilities.appUrl && (
          <LiveDomPortal appUrl={capabilities.appUrl} onLoad={handlePortalLoaded} />
        )}
        <PortalLoading visible={capabilities.liveDomPortal && !portalLoaded} />

        {/* R3F canvas with error boundary for WebGL/shader failures */}
        <SceneErrorBoundary>
          <SpatialCanvas
            probes={activeProbes}
            capture={portalActive ? null : capture}
            viewport={appViewport}
            knowledgeNodes={knowledgeNodes ?? []}
            onParticleArrived={handleParticleArrived}
            portalActive={portalActive}
            proposalEvents={activeProposals}
            artifactEvents={activeArtifacts}
            iterationTick={iterationPulse.tick}
          />
        </SceneErrorBoundary>

        {probeQueue.buffered > 0 && (
          <div className="buffer-indicator">{probeQueue.buffered} buffered</div>
        )}
        {capabilities.mcpAvailable && (
          <div className="mcp-indicator">MCP</div>
        )}
        {fiberPaused && (
          <div className="fiber-paused-indicator" aria-live="polite">AWAITING HUMAN</div>
        )}
      </div>

      {/* Control panel — scrollable sidebar */}
      <div className="control-panel" role="complementary" aria-label="Dashboard controls">
        <h1>Tesseract Dashboard</h1>
        <StatusBar workbench={workbench ?? null} scorecard={scorecard ?? null} connected={connected} progress={progress} />
        <PipelineProgress stages={stageTracker.stages} activeStage={stageTracker.activeStage} />
        <ConvergencePanel state={convergence.state} />
        <div className="grid">
          <FitnessCard scorecard={scorecard ?? null} />
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
