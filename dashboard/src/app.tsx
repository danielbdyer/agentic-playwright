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
import type { ProbeEvent, ScreenCapture, ViewportDimensions } from './spatial/types';

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

  const probeQueue = useIngestionQueue<ProbeEvent>({ staggerMs: 60, maxBuffer: 300 });

  // Stable ref to enqueue — prevents WS reconnection on probeQueue reference change
  const enqueueRef = useRef(probeQueue.enqueue);
  enqueueRef.current = probeQueue.enqueue;

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

  return { connected, send, progress, queue, processingId, capture, appViewport, probeQueue };
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

// ─── Pure Components ───

const RUNG_COLORS: Record<string, string> = {
  'explicit': '#3fb950', 'control': '#2ea043', 'approved-screen-knowledge': '#56d364',
  'shared-patterns': '#79c0ff', 'prior-evidence': '#a5d6ff',
  'approved-equivalent-overlay': '#58a6ff', 'structured-translation': '#d29922',
  'live-dom': '#e3b341', 'agent-interpreted': '#bc8cff', 'needs-human': '#f85149',
};

const KIND_COLORS: Record<string, string> = {
  'interpret-step': '#f85149', 'approve-proposal': '#58a6ff', 'author-knowledge': '#3fb950',
  'investigate-hotspot': '#d29922', 'validate-calibration': '#bc8cff', 'request-rerun': '#79c0ff',
};

const ConnectionDot = memo(function ConnectionDot({ connected }: { connected: boolean }) {
  return <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />;
});

const StatusBar = memo(function StatusBar({ workbench, scorecard, connected, progress }: {
  workbench: Workbench | null; scorecard: Scorecard | null; connected: boolean; progress: ProgressEvent | null;
}) {
  return (
    <div className="status-bar">
      <div className="status-item"><ConnectionDot connected={connected} /><span className="status-label">WS</span></div>
      <div className="status-item"><span className="status-label">Iter:</span><span className="status-value">{workbench?.iteration ?? '—'}</span></div>
      <div className="status-item"><span className="status-label">Queue:</span><span className="status-value">{workbench?.summary.pending ?? 0} pending / {workbench?.summary.completed ?? 0} done</span></div>
      <div className="status-item"><span className="status-label">HWM:</span><span className="status-value">{scorecard ? `${(scorecard.highWaterMark.knowledgeHitRate * 100).toFixed(1)}%` : '—'}</span></div>
      {progress && <div className="status-item"><span className="status-label">Live:</span><span className="status-value">[{progress.phase}] {progress.iteration}/{progress.maxIterations}</span></div>}
    </div>
  );
});

const FitnessCard = memo(function FitnessCard({ scorecard }: { scorecard: Scorecard | null }) {
  if (!scorecard) return <div className="card"><h2>Fitness</h2><div className="empty">No scorecard yet.</div></div>;
  const h = scorecard.highWaterMark;
  const cls = (v: number) => v >= 0.8 ? 'good' : v >= 0.5 ? 'warn' : 'bad';
  return (
    <div className="card">
      <h2>Fitness High-Water Mark</h2>
      <div className="metric"><span className="metric-label">Knowledge Hit Rate</span><span className={`metric-value ${cls(h.knowledgeHitRate)}`}>{(h.knowledgeHitRate * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Translation Precision</span><span className={`metric-value ${cls(h.translationPrecision)}`}>{(h.translationPrecision * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Convergence</span><span className="metric-value">{h.convergenceVelocity} iter</span></div>
      <div className="metric"><span className="metric-label">Proposal Yield</span><span className={`metric-value ${cls(h.proposalYield)}`}>{(h.proposalYield * 100).toFixed(1)}%</span></div>
      {h.resolutionByRung && h.resolutionByRung.filter(r => r.wins > 0).length > 0 && (
        <div className="rung-bar" style={{ marginTop: 8 }}>
          {h.resolutionByRung.filter(r => r.wins > 0).map(r => (
            <div key={r.rung} className="rung-segment" style={{ flex: r.wins, backgroundColor: RUNG_COLORS[r.rung] ?? '#484f58' }} title={`${r.rung}: ${r.wins}`}>{r.wins > 2 ? r.wins : ''}</div>
          ))}
        </div>
      )}
    </div>
  );
});

const ProgressCard = memo(function ProgressCard({ progress }: { progress: ProgressEvent | null }) {
  if (!progress) return <div className="card"><h2>Live Progress</h2><div className="empty">No active run.</div></div>;
  const m = progress.metrics;
  return (
    <div className="card">
      <h2>Live — [{progress.phase}]</h2>
      {m && (
        <>
          <div className="metric"><span className="metric-label">Hit Rate</span><span className={`metric-value ${m.knowledgeHitRate >= 0.8 ? 'good' : m.knowledgeHitRate >= 0.5 ? 'warn' : 'bad'}`}>{(m.knowledgeHitRate * 100).toFixed(1)}%</span></div>
          <div className="metric"><span className="metric-label">Steps</span><span className="metric-value">{m.totalSteps} ({m.unresolvedSteps} unresolved)</span></div>
        </>
      )}
      <div className="metric"><span className="metric-label">Elapsed</span><span className="metric-value">{(progress.elapsed / 1000).toFixed(1)}s</span></div>
      {progress.calibration && <div className="metric"><span className="metric-label">Drift</span><span className="metric-value">{progress.calibration.weightDrift.toFixed(4)}</span></div>}
    </div>
  );
});

// The key component: animated queue item
const QueueItemView = memo(function QueueItemView({ item, onApprove, onSkip }: {
  item: QueuedItem;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const color = KIND_COLORS[item.kind] ?? '#484f58';
  const isDeciding = item.displayStatus === 'processing';
  return (
    <div className="queue-item" data-status={item.displayStatus} style={{ position: 'relative' }}>
      <div className="item-content">
        <div className="item-title">
          <span className="item-badge" style={{ background: `${color}33`, color }}>{item.kind}</span>
          {item.title}
        </div>
        {isDeciding && <div className="item-detail">{item.rationale}</div>}
        {isDeciding && item.context.screen && <div className="item-detail">Screen: {item.context.screen}{item.context.element ? ` / ${item.context.element}` : ''}</div>}
      </div>
      <div className="item-actions">
        <span className="priority-score">{item.priority.toFixed(3)}</span>
        {isDeciding && (
          <>
            <button className="btn btn-approve" onClick={() => onApprove(item.id)}>✓ Approve</button>
            <button className="btn" onClick={() => onSkip(item.id)}>○ Skip</button>
          </>
        )}
      </div>
    </div>
  );
});

// Queue visualization — the animated container
const QueueVisualization = memo(function QueueVisualization({ queue, onApprove, onSkip }: {
  queue: readonly QueuedItem[];
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  if (queue.length === 0) return null;
  return (
    <div className="card card-full">
      <h2>Effect Queue — {queue.length} items</h2>
      <div className="queue-container">
        {queue.map((item) => (
          <QueueItemView key={item.id} item={item} onApprove={onApprove} onSkip={onSkip} />
        ))}
      </div>
    </div>
  );
});

// Static workbench (loaded from API, not the live queue)
const WorkbenchPanel = memo(function WorkbenchPanel({ workbench, onApprove, onSkip }: {
  workbench: Workbench | null;
  onApprove: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  if (!workbench || workbench.items.length === 0) return <div className="card card-full"><h2>Workbench</h2><div className="empty">No pending items. Converged.</div></div>;
  const byScreen = new Map<string, WorkItem[]>();
  for (const item of workbench.items) {
    const s = item.context.screen ?? 'unknown';
    byScreen.set(s, [...(byScreen.get(s) ?? []), item]);
  }
  return (
    <div className="card card-full">
      <h2>Workbench — {workbench.summary.pending} pending</h2>
      {[...byScreen.entries()].map(([screen, items]) => (
        <div key={screen} className="screen-group">
          <div className="screen-header">{screen} ({items.length})</div>
          {items.map((item) => (
            <div key={item.id} className="queue-item" data-status="pending">
              <div className="item-content">
                <div className="item-title"><span className="item-badge" style={{ background: `${KIND_COLORS[item.kind] ?? '#484f58'}33`, color: KIND_COLORS[item.kind] ?? '#484f58' }}>{item.kind}</span> {item.title}</div>
              </div>
              <div className="item-actions">
                <span className="priority-score">{item.priority.toFixed(3)}</span>
                <button className="btn btn-approve" onClick={() => onApprove(item.id)}>✓</button>
                <button className="btn" onClick={() => onSkip(item.id)}>○</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

const CompletionsPanel = memo(function CompletionsPanel({ workbench }: { workbench: Workbench | null }) {
  const completions = workbench?.completions ?? [];
  if (completions.length === 0) return null;
  return (
    <div className="card">
      <h2>Completions ({completions.length})</h2>
      {completions.slice(-8).reverse().map((c, i) => (
        <div key={i} className="lineage-entry">{c.status === 'completed' ? '✓' : '○'} {c.workItemId.slice(0, 8)} — {c.rationale.slice(0, 50)}</div>
      ))}
    </div>
  );
});

// ─── App ───

function App() {
  const { data: workbench } = useWorkbench();
  const { data: scorecard } = useFitness();
  const { connected, send, progress, queue, capture, appViewport, probeQueue } = useEffectStream(`ws://${window.location.host}/ws`);
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
  const activeProbes = useMemo(
    () => probeQueue.active.map((q) => q.data),
    [probeQueue.active],
  );

  const handleParticleArrived = useCallback((probeId: string) => {
    probeQueue.retire(probeId);
  }, [probeQueue]);

  const handlePortalLoaded = useCallback(() => setPortalLoaded(true), []);

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
          onParticleArrived={handleParticleArrived}
          portalActive={portalActive}
        />

        {/* Buffer indicator */}
        {probeQueue.buffered > 0 && (
          <div className="buffer-indicator">{probeQueue.buffered} buffered</div>
        )}

        {/* MCP indicator */}
        {capabilities.mcpAvailable && (
          <div className="mcp-indicator">MCP</div>
        )}
      </div>

      {/* Control panel — scrollable sidebar */}
      <div className="control-panel">
        <h1>Tesseract Dashboard</h1>
        <StatusBar workbench={workbench ?? null} scorecard={scorecard ?? null} connected={connected} progress={progress} />
        <div className="grid">
          <FitnessCard scorecard={scorecard ?? null} />
          <ProgressCard progress={progress} />
        </div>
        <QueueVisualization queue={queue} onApprove={handleApprove} onSkip={handleSkip} />
        <WorkbenchPanel workbench={workbench ?? null} onApprove={handleApprove} onSkip={handleSkip} />
        <div className="grid">
          <CompletionsPanel workbench={workbench ?? null} />
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
