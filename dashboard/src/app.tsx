/**
 * Tesseract Dashboard — TanStack Query + WebSocket + Effect-backed mutations.
 *
 * Real-time visualization of the recursive improvement loop with
 * human-in-the-loop intervention support.
 *
 * Architecture:
 *   TanStack Query — data fetching, caching, optimistic updates
 *   WebSocket — real-time streaming (progress, completions, fitness)
 *   REST mutations — Effect programs called server-side on POST
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ─── Types (domain projections) ───

interface WorkItem {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly adoId: string | null;
  readonly iteration: number;
  readonly actions: ReadonlyArray<{ kind: string; target: { kind: string; ref: string; label: string }; params: Record<string, unknown> }>;
  readonly context: { screen?: string; element?: string; proposalId?: string; artifactRefs: readonly string[] };
  readonly evidence: { confidence: number; sources: readonly string[] };
}

interface Completion {
  readonly workItemId: string;
  readonly status: string;
  readonly completedAt: string;
  readonly rationale: string;
}

interface Workbench {
  readonly kind: string;
  readonly generatedAt: string;
  readonly iteration: number;
  readonly items: readonly WorkItem[];
  readonly completions: readonly Completion[];
  readonly summary: { total: number; pending: number; completed: number; byKind: Record<string, number>; topPriority: WorkItem | null };
}

interface Scorecard {
  readonly highWaterMark: { knowledgeHitRate: number; translationPrecision: number; convergenceVelocity: number; proposalYield: number; resolutionByRung?: ReadonlyArray<{ rung: string; wins: number; rate: number }> };
  readonly history: ReadonlyArray<{ seed: string; knowledgeHitRate: number }>;
}

interface ProgressEvent {
  readonly phase: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: { knowledgeHitRate: number; proposalsActivated: number; totalSteps: number; unresolvedSteps: number } | null;
  readonly convergenceReason: string | null;
  readonly elapsed: number;
  readonly calibration?: { weights: Record<string, number>; weightDrift: number; topCorrelation: { signal: string; strength: number } | null } | null;
}

// ─── WebSocket Hook ───

function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastProgress, setLastProgress] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'workbench-updated') {
            qc.setQueryData(['workbench'], msg.data);
          } else if (msg.type === 'fitness-updated') {
            qc.setQueryData(['fitness'], msg.data);
          } else if (msg.type === 'speedrun-progress') {
            setLastProgress(msg.data);
          } else if (msg.type === 'work-item-completed') {
            qc.invalidateQueries({ queryKey: ['workbench'] });
          }
        } catch { /* ignore malformed */ }
      };
    }
    connect();
    return () => { wsRef.current?.close(); };
  }, [url, qc]);

  const send = useCallback((msg: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, send, lastProgress };
}

// ─── Data Hooks ───

function useWorkbench() {
  return useQuery<Workbench | null>({
    queryKey: ['workbench'],
    queryFn: async () => {
      const res = await fetch('/api/workbench');
      return res.ok ? res.json() : null;
    },
    refetchInterval: 10000,
    staleTime: 3000,
  });
}

function useFitness() {
  return useQuery<Scorecard | null>({
    queryKey: ['fitness'],
    queryFn: async () => {
      const res = await fetch('/api/fitness');
      return res.ok ? res.json() : null;
    },
    refetchInterval: 15000,
    staleTime: 5000,
  });
}

function useCompleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { workItemId: string; status: 'completed' | 'skipped'; rationale: string }) => {
      const res = await fetch('/api/workbench/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completion: {
            workItemId: input.workItemId,
            status: input.status,
            completedAt: new Date().toISOString(),
            rationale: input.rationale,
            artifactsWritten: [],
          },
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workbench'] });
    },
  });
}

// ─── Components ───

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: connected ? '#3fb950' : '#f85149', marginRight: 8 }} />
  );
}

function StatusBar({ workbench, scorecard, connected, progress }: {
  workbench: Workbench | null;
  scorecard: Scorecard | null;
  connected: boolean;
  progress: ProgressEvent | null;
}) {
  return (
    <div className="status-bar">
      <div className="status-item"><ConnectionBadge connected={connected} /><span className="status-label">WS</span></div>
      <div className="status-item"><span className="status-label">Iteration:</span><span className="status-value">{workbench?.iteration ?? '—'}</span></div>
      <div className="status-item"><span className="status-label">Items:</span><span className="status-value">{workbench?.summary.pending ?? 0} pending / {workbench?.summary.completed ?? 0} done</span></div>
      <div className="status-item"><span className="status-label">HWM:</span><span className="status-value">{scorecard ? `${(scorecard.highWaterMark.knowledgeHitRate * 100).toFixed(1)}%` : '—'}</span></div>
      {progress && (
        <div className="status-item"><span className="status-label">Live:</span><span className="status-value">[{progress.phase}] iter {progress.iteration}/{progress.maxIterations}{progress.calibration ? ` drift=${progress.calibration.weightDrift.toFixed(4)}` : ''}</span></div>
      )}
    </div>
  );
}

function FitnessCard({ scorecard }: { scorecard: Scorecard | null }) {
  if (!scorecard) return <div className="card"><h2>Fitness</h2><div className="empty">No scorecard. Run a speedrun first.</div></div>;
  const h = scorecard.highWaterMark;
  const cls = (v: number) => v >= 0.8 ? 'good' : v >= 0.5 ? 'warn' : 'bad';
  return (
    <div className="card">
      <h2>Fitness High-Water Mark</h2>
      <div className="metric"><span className="metric-label">Knowledge Hit Rate</span><span className={`metric-value ${cls(h.knowledgeHitRate)}`}>{(h.knowledgeHitRate * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Translation Precision</span><span className={`metric-value ${cls(h.translationPrecision)}`}>{(h.translationPrecision * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Convergence</span><span className="metric-value">{h.convergenceVelocity} iterations</span></div>
      <div className="metric"><span className="metric-label">Proposal Yield</span><span className={`metric-value ${cls(h.proposalYield)}`}>{(h.proposalYield * 100).toFixed(1)}%</span></div>
      {h.resolutionByRung && h.resolutionByRung.length > 0 && (
        <>
          <h2 style={{ marginTop: 12 }}>Resolution by Rung</h2>
          <div className="rung-bar">
            {h.resolutionByRung.filter(r => r.wins > 0).map((r) => (
              <div key={r.rung} className="rung-segment" style={{ flex: r.wins, backgroundColor: rungColor(r.rung) }} title={`${r.rung}: ${r.wins} (${(r.rate * 100).toFixed(0)}%)`}>
                {r.wins > 2 ? r.wins : ''}
              </div>
            ))}
          </div>
          {h.resolutionByRung.filter(r => r.wins > 0).map((r) => (
            <div key={r.rung} className="metric">
              <span className="metric-label" style={{ color: rungColor(r.rung) }}>{r.rung}</span>
              <span className="metric-value">{r.wins} ({(r.rate * 100).toFixed(0)}%)</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const RUNG_COLORS: Record<string, string> = {
  'explicit': '#3fb950', 'control': '#2ea043', 'approved-screen-knowledge': '#56d364',
  'shared-patterns': '#79c0ff', 'prior-evidence': '#a5d6ff',
  'approved-equivalent-overlay': '#58a6ff', 'structured-translation': '#d29922',
  'live-dom': '#e3b341', 'agent-interpreted': '#bc8cff', 'needs-human': '#f85149',
};
function rungColor(rung: string): string { return RUNG_COLORS[rung] ?? '#484f58'; }

function WorkItemRow({ item, onAction }: { item: WorkItem; onAction: (id: string, status: 'completed' | 'skipped', rationale: string) => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const badgeColor = item.kind === 'approve-proposal' ? '#1f6feb' : item.kind === 'interpret-step' ? '#f85149' : '#d29922';
  return (
    <div className={`work-item ${item.priority >= 0.5 ? 'high' : 'low'}`}>
      <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setShowDetail(!showDetail)}>
        <span className="item-badge" style={{ background: `${badgeColor}33`, color: badgeColor }}>{item.kind}</span>
        {' '}<span className="item-title">{item.title}</span>
        {showDetail && (
          <div style={{ fontSize: 12, color: '#8b949e', marginTop: 8, paddingLeft: 8 }}>
            <div>{item.rationale}</div>
            {item.context.screen && <div>Screen: {item.context.screen}</div>}
            {item.context.element && <div>Element: {item.context.element}</div>}
            <div>Confidence: {item.evidence.confidence.toFixed(2)} | Sources: {item.evidence.sources.length}</div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="priority-score">{item.priority.toFixed(3)}</span>
        <button className="btn btn-primary" onClick={() => onAction(item.id, 'completed', `Dashboard approved: ${item.title}`)}>✓</button>
        <button className="btn" onClick={() => onAction(item.id, 'skipped', `Dashboard skipped: ${item.title}`)}>○</button>
      </div>
    </div>
  );
}

function WorkbenchPanel({ workbench, onAction }: { workbench: Workbench | null; onAction: (id: string, status: 'completed' | 'skipped', rationale: string) => void }) {
  if (!workbench || workbench.items.length === 0) {
    return <div className="card card-full"><h2>Agent Workbench</h2><div className="empty">No pending work items. System is converged.</div></div>;
  }

  const byScreen = new Map<string, WorkItem[]>();
  for (const item of workbench.items) {
    const screen = item.context.screen ?? 'unknown';
    byScreen.set(screen, [...(byScreen.get(screen) ?? []), item]);
  }

  return (
    <div className="card card-full">
      <h2>Agent Workbench — {workbench.summary.pending} pending</h2>
      {[...byScreen.entries()].map(([screen, items]) => (
        <div key={screen} className="screen-group">
          <div className="screen-header">{screen} ({items.length} items)</div>
          {items.map((item) => <WorkItemRow key={item.id} item={item} onAction={onAction} />)}
        </div>
      ))}
    </div>
  );
}

function KindDistribution({ workbench }: { workbench: Workbench | null }) {
  if (!workbench) return null;
  const kinds = Object.entries(workbench.summary.byKind).filter(([, c]) => c > 0);
  if (kinds.length === 0) return null;
  const total = kinds.reduce((s, [, c]) => s + c, 0);
  const colors: Record<string, string> = {
    'interpret-step': '#f85149', 'approve-proposal': '#58a6ff', 'author-knowledge': '#3fb950',
    'investigate-hotspot': '#d29922', 'validate-calibration': '#bc8cff', 'request-rerun': '#79c0ff',
  };
  return (
    <div className="card">
      <h2>Distribution</h2>
      <div className="rung-bar">
        {kinds.map(([k, c]) => <div key={k} className="rung-segment" style={{ flex: c, backgroundColor: colors[k] ?? '#484f58' }} title={`${k}: ${c}`}>{c}</div>)}
      </div>
      {kinds.map(([k, c]) => (
        <div key={k} className="metric"><span className="metric-label" style={{ color: colors[k] }}>{k}</span><span className="metric-value">{c} ({((c / total) * 100).toFixed(0)}%)</span></div>
      ))}
    </div>
  );
}

function CompletionsPanel({ workbench }: { workbench: Workbench | null }) {
  const completions = workbench?.completions ?? [];
  if (completions.length === 0) return null;
  return (
    <div className="card">
      <h2>Recent Completions ({completions.length})</h2>
      {completions.slice(-10).reverse().map((c, i) => (
        <div key={i} className="lineage-entry">
          {c.status === 'completed' ? '✓' : '○'} {c.workItemId.slice(0, 8)} — {c.rationale.slice(0, 60)}
        </div>
      ))}
    </div>
  );
}

function ProgressPanel({ progress }: { progress: ProgressEvent | null }) {
  if (!progress) return <div className="card"><h2>Live Progress</h2><div className="empty">No active speedrun. Start one to see real-time progress.</div></div>;
  const m = progress.metrics;
  return (
    <div className="card">
      <h2>Live Progress — [{progress.phase}]</h2>
      {m && (
        <>
          <div className="metric"><span className="metric-label">Hit Rate</span><span className={`metric-value ${m.knowledgeHitRate >= 0.8 ? 'good' : m.knowledgeHitRate >= 0.5 ? 'warn' : 'bad'}`}>{(m.knowledgeHitRate * 100).toFixed(1)}%</span></div>
          <div className="metric"><span className="metric-label">Steps</span><span className="metric-value">{m.totalSteps} ({m.unresolvedSteps} unresolved)</span></div>
          <div className="metric"><span className="metric-label">Proposals</span><span className="metric-value">{m.proposalsActivated}</span></div>
        </>
      )}
      <div className="metric"><span className="metric-label">Elapsed</span><span className="metric-value">{(progress.elapsed / 1000).toFixed(1)}s</span></div>
      {progress.convergenceReason && <div className="metric"><span className="metric-label">Convergence</span><span className="metric-value">{progress.convergenceReason}</span></div>}
      {progress.calibration && (
        <>
          <div className="metric"><span className="metric-label">Weight Drift</span><span className="metric-value">{progress.calibration.weightDrift.toFixed(4)}</span></div>
          {progress.calibration.topCorrelation && <div className="metric"><span className="metric-label">Top Signal</span><span className="metric-value">{progress.calibration.topCorrelation.signal} ({progress.calibration.topCorrelation.strength > 0 ? '+' : ''}{progress.calibration.topCorrelation.strength.toFixed(3)})</span></div>}
        </>
      )}
    </div>
  );
}

// ─── App ───

function App() {
  const { data: workbench } = useWorkbench();
  const { data: scorecard } = useFitness();
  const completeMutation = useCompleteItem();
  const { connected, lastProgress } = useWebSocket(`ws://${window.location.host}/ws`);

  const handleAction = useCallback((id: string, status: 'completed' | 'skipped', rationale: string) => {
    completeMutation.mutate({ workItemId: id, status, rationale });
  }, [completeMutation]);

  return (
    <div className="container">
      <h1>Tesseract Dashboard</h1>
      <StatusBar workbench={workbench ?? null} scorecard={scorecard ?? null} connected={connected} progress={lastProgress} />
      <div className="grid">
        <FitnessCard scorecard={scorecard ?? null} />
        <ProgressPanel progress={lastProgress} />
        <KindDistribution workbench={workbench ?? null} />
        <CompletionsPanel workbench={workbench ?? null} />
      </div>
      <WorkbenchPanel workbench={workbench ?? null} onAction={handleAction} />
    </div>
  );
}

// ─── Mount with QueryClient ───

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
