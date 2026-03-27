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

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SpatialCanvas } from './spatial/canvas';
import { LiveDomPortal, PortalLoading } from './spatial/live-dom-portal';
import { useIngestionQueue } from './hooks/use-ingestion-queue';
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
// Extracted from the hook so the WS handler is a pure router with no closure overhead.
// Each handler is a higher-order function: (deps) → (data) → void.

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

const dispatchItemCompleted = (
  setProcessingId: React.Dispatch<React.SetStateAction<string | null>>,
  setQueue: React.Dispatch<React.SetStateAction<readonly QueuedItem[]>>,
) => (data: unknown) => {
  const { workItemId, status } = data as { workItemId: string; status: string };
  const exitStatus: DisplayStatus = status === 'completed' ? 'completed' : 'skipped';
  setQueue((prev) => prev.map((q) => q.id === workItemId ? { ...q, displayStatus: exitStatus } : q));
  setProcessingId((prev) => prev === workItemId ? null : prev);
  setTimeout(() => setQueue((prev) => prev.filter((q) => q.id !== workItemId)), 400);
};

const dispatchEscalation = (enqueueRef: React.RefObject<(id: string, data: ElementEscalatedEvent) => void>) =>
  (data: unknown) => { const e = data as ElementEscalatedEvent; enqueueRef.current?.(e.id, e); };

const dispatchFiberPaused = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(true);

const dispatchFiberResumed = (setFiberPaused: (paused: boolean) => void) =>
  (_data: unknown) => setFiberPaused(false);

// ─── WebSocket Hook ───

function useEffectStream(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
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

  // Stable ref to enqueue — prevents WS reconnection on probeQueue reference change
  const enqueueRef = useRef(probeQueue.enqueue);
  enqueueRef.current = probeQueue.enqueue;
  const escalationEnqueueRef = useRef(escalationQueue.enqueue);
  escalationEnqueueRef.current = escalationQueue.enqueue;
  const proposalEnqueueRef = useRef(proposalQueue.enqueue);
  proposalEnqueueRef.current = proposalQueue.enqueue;
  const artifactEnqueueRef = useRef(artifactQueue.enqueue);
  artifactEnqueueRef.current = artifactQueue.enqueue;

  const send = useCallback((msg: unknown) => {
    wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.send(JSON.stringify(msg));
  }, []);

  // Build dispatch table once — stable refs, no closure recreation per message
  const dispatchRef = useRef<Record<string, (data: unknown) => void> | null>(null);
  if (!dispatchRef.current) {
    dispatchRef.current = {
      'progress': dispatchProgress(setProgress),
      'element-probed': dispatchProbe(enqueueRef),
      'screen-captured': dispatchCapture(setCapture, setAppViewport),
      'item-pending': dispatchItemPending(setQueue),
      'item-processing': dispatchItemProcessing(setProcessingId, setQueue),
      'item-completed': dispatchItemCompleted(setProcessingId, setQueue),
      'element-escalated': dispatchEscalation(escalationEnqueueRef),
      'fiber-paused': dispatchFiberPaused(setFiberPaused),
      'fiber-resumed': dispatchFiberResumed(setFiberPaused),
      // Layer 2: Convergence signals
      'rung-shift': (data) => convergence.pushRung(data as RungShiftEvent),
      'calibration-update': (data) => convergence.pushCalibration(data as CalibrationUpdateEvent),
      'iteration-start': (_data) => iterationPulse.onStart(),
      'iteration-complete': (_data) => iterationPulse.onComplete(),
      // Layer 2: Proposal flow
      'proposal-activated': (data) => { const e = data as ProposalActivatedEvent; proposalEnqueueRef.current?.(e.proposalId, e); },
      // Layer 3: Artifact aurora
      'artifact-written': (data) => { const e = data as ArtifactWrittenEvent; artifactEnqueueRef.current?.(e.path, e); },
      // Layer 4: Stage lifecycle
      'stage-lifecycle': (data) => stageTracker.dispatch(data as StageLifecycleEvent),
    };
  }

  useEffect(() => {
    const dispatch = dispatchRef.current!;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let reconnectDelay = 1000; // Exponential backoff: 1s → 2s → 4s → 8s (capped)

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { setConnected(true); reconnectDelay = 1000; };
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const handler = dispatch[msg.type];
          if (handler) handler(msg.data);
          else if (msg.type === 'workbench-updated') qc.setQueryData(['workbench'], msg.data);
          else if (msg.type === 'fitness-updated') qc.setQueryData(['fitness'], msg.data);
        } catch { /* ignore malformed */ }
      };
    }

    connect();
    return () => { clearTimeout(reconnectTimer); wsRef.current?.close(); };
  }, [url, qc]); // No probeQueue dependency — uses stable ref

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
    // Map graph nodes to KnowledgeNode shape
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
      // Send decision over WebSocket — this resumes the Effect fiber
      send({ type: 'decision', ...input });
      // Also POST for persistence (server handles both paths)
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

  // Progressive enhancement: detect available capabilities (MCP, live portal)
  const capabilities = useWebMcpCapabilities(capture?.url);
  const [portalLoaded, setPortalLoaded] = useState(false);
  const portalActive = capabilities.liveDomPortal && portalLoaded;

  const handleApprove = useCallback((id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'completed', rationale: `Dashboard approved` });
  }, [decisionMutation]);

  const handleSkip = useCallback((id: string) => {
    decisionMutation.mutate({ workItemId: id, status: 'skipped', rationale: `Dashboard skipped` });
  }, [decisionMutation]);

  // Derive probe events from the staggered ingestion queue
  // React Compiler auto-memoizes this derivation
  const activeProbes = probeQueue.active.map((q) => q.data);

  const handleParticleArrived = useCallback((probeId: string) => {
    probeQueue.retire(probeId);
  }, [probeQueue]);

  const handlePortalLoaded = useCallback(() => setPortalLoaded(true), []);

  // Derive spatial data from ingestion queues — compiler auto-memoizes
  const activeProposals = proposalQueue.active.map((q) => q.data);
  const activeArtifacts = artifactQueue.active.map((q) => q.data);

  return (
    <div className="dashboard-layout">
      {/* Spatial visualization — layered viewport */}
      <div className="spatial-viewport">
        {/* Layer 1: Live DOM portal (iframe, behind canvas) — progressive enhancement */}
        {capabilities.liveDomPortal && capabilities.appUrl && (
          <LiveDomPortal appUrl={capabilities.appUrl} onLoad={handlePortalLoaded} />
        )}
        <PortalLoading visible={capabilities.liveDomPortal && !portalLoaded} />

        {/* Layer 0/1: R3F canvas (transparent when portal active) */}
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

        {/* Buffer indicator */}
        {probeQueue.buffered > 0 && (
          <div className="buffer-indicator">{probeQueue.buffered} buffered</div>
        )}

        {/* MCP indicator */}
        {capabilities.mcpAvailable && (
          <div className="mcp-indicator">MCP</div>
        )}

        {/* Fiber pause indicator */}
        {fiberPaused && (
          <div className="fiber-paused-indicator">AWAITING HUMAN</div>
        )}
      </div>

      {/* Control panel — scrollable sidebar */}
      <div className="control-panel">
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
