/**
 * Tesseract Dashboard — real-time visualization of the recursive improvement loop.
 *
 * Consumes the same JSON artifacts that the CLI and agent-speedrun produce:
 *   - .tesseract/workbench/index.json (work items, completions, summary)
 *   - .tesseract/workbench/lineage.json (intervention lineage)
 *   - .tesseract/inbox/index.json (operator inbox)
 *   - .tesseract/benchmarks/scorecard.json (fitness scorecard)
 *
 * All data is loaded via fetch from the dev server. The dashboard is a
 * read-only visualization — mutations go through the CLI commands.
 */

import { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ─── Types (projections of domain types) ───

interface WorkItem {
  id: string;
  kind: string;
  priority: number;
  title: string;
  rationale: string;
  adoId: string | null;
  iteration: number;
  actions: Array<{ kind: string; target: { kind: string; ref: string; label: string }; params: Record<string, unknown> }>;
  context: { screen?: string; element?: string; proposalId?: string; artifactRefs: string[] };
  evidence: { confidence: number; sources: string[] };
}

interface WorkbenchData {
  kind: string;
  generatedAt: string;
  iteration: number;
  items: WorkItem[];
  completions: Array<{ workItemId: string; status: string; completedAt: string; rationale: string }>;
  summary: { total: number; pending: number; completed: number; byKind: Record<string, number>; topPriority: WorkItem | null };
}

interface LineageEntry {
  kind: string;
  iteration: number;
  proposalId: string | null;
  workItemId: string | null;
  completionStatus: string | null;
  timestamp: string;
}

interface InboxItem {
  id: string;
  kind: string;
  status: string;
  title: string;
  summary: string;
  adoId?: string;
  screen?: string;
}

interface ScorecardData {
  kind: string;
  highWaterMark: {
    knowledgeHitRate: number;
    translationPrecision: number;
    convergenceVelocity: number;
    proposalYield: number;
  };
  history: Array<{ seed: string; knowledgeHitRate: number; translationPrecision: number }>;
}

// ─── Data Loading ───

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

// ─── Components ───

function StatusBar({ workbench, scorecard }: { workbench: WorkbenchData | null; scorecard: ScorecardData | null }) {
  return (
    <div className="status-bar">
      <div className="status-item">
        <span className="status-label">Iteration:</span>
        <span className="status-value">{workbench?.iteration ?? '—'}</span>
      </div>
      <div className="status-item">
        <span className="status-label">Work Items:</span>
        <span className="status-value">{workbench?.summary.pending ?? 0} pending / {workbench?.summary.completed ?? 0} completed</span>
      </div>
      <div className="status-item">
        <span className="status-label">Hit Rate HWM:</span>
        <span className="status-value">{scorecard ? `${(scorecard.highWaterMark.knowledgeHitRate * 100).toFixed(1)}%` : '—'}</span>
      </div>
      <div className="status-item">
        <span className="status-label">Last Updated:</span>
        <span className="status-value">{workbench ? new Date(workbench.generatedAt).toLocaleTimeString() : '—'}</span>
      </div>
    </div>
  );
}

function FitnessCard({ scorecard }: { scorecard: ScorecardData | null }) {
  if (!scorecard) return <div className="card"><h2>Fitness Scorecard</h2><div className="empty">No scorecard found. Run a speedrun first.</div></div>;
  const hwm = scorecard.highWaterMark;
  const rateClass = (v: number) => v >= 0.8 ? 'good' : v >= 0.5 ? 'warn' : 'bad';
  return (
    <div className="card">
      <h2>Fitness Scorecard</h2>
      <div className="metric"><span className="metric-label">Knowledge Hit Rate</span><span className={`metric-value ${rateClass(hwm.knowledgeHitRate)}`}>{(hwm.knowledgeHitRate * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Translation Precision</span><span className={`metric-value ${rateClass(hwm.translationPrecision)}`}>{(hwm.translationPrecision * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Convergence Velocity</span><span className="metric-value">{hwm.convergenceVelocity} iterations</span></div>
      <div className="metric"><span className="metric-label">Proposal Yield</span><span className={`metric-value ${rateClass(hwm.proposalYield)}`}>{(hwm.proposalYield * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Scorecard Entries</span><span className="metric-value">{scorecard.history.length}</span></div>
    </div>
  );
}

function WorkItemCard({ item }: { item: WorkItem }) {
  const badgeClass = item.kind === 'approve-proposal' ? 'badge-proposal'
    : item.kind === 'interpret-step' ? 'badge-interpret'
    : 'badge-hotspot';
  const priorityClass = item.priority >= 0.5 ? 'high' : 'low';
  return (
    <div className={`work-item ${priorityClass}`}>
      <div className="item-title">
        <span className={`item-badge ${badgeClass}`}>{item.kind}</span>
        {' '}{item.title}
      </div>
      <div className="priority-score">{item.priority.toFixed(3)}</div>
    </div>
  );
}

function WorkbenchCard({ workbench }: { workbench: WorkbenchData | null }) {
  if (!workbench || workbench.items.length === 0) {
    return <div className="card card-full"><h2>Agent Workbench</h2><div className="empty">No pending work items. System is converged.</div></div>;
  }

  // Group by screen
  const byScreen = new Map<string, WorkItem[]>();
  for (const item of workbench.items) {
    const screen = item.context.screen ?? 'unknown';
    const existing = byScreen.get(screen) ?? [];
    byScreen.set(screen, [...existing, item]);
  }

  return (
    <div className="card card-full">
      <h2>Agent Workbench — {workbench.summary.pending} pending</h2>
      {[...byScreen.entries()].map(([screen, items]) => (
        <div key={screen} className="screen-group">
          <div className="screen-header">{screen} ({items.length} items)</div>
          {items.map((item) => <WorkItemCard key={item.id} item={item} />)}
        </div>
      ))}
    </div>
  );
}

function KindDistribution({ workbench }: { workbench: WorkbenchData | null }) {
  if (!workbench) return null;
  const kinds = Object.entries(workbench.summary.byKind).filter(([, count]) => count > 0);
  if (kinds.length === 0) return null;
  const total = kinds.reduce((sum, [, count]) => sum + count, 0);

  const colors: Record<string, string> = {
    'interpret-step': '#f85149',
    'approve-proposal': '#58a6ff',
    'author-knowledge': '#3fb950',
    'investigate-hotspot': '#d29922',
    'validate-calibration': '#bc8cff',
    'request-rerun': '#79c0ff',
  };

  return (
    <div className="card">
      <h2>Work Item Distribution</h2>
      <div className="rung-bar">
        {kinds.map(([kind, count]) => (
          <div
            key={kind}
            className="rung-segment"
            style={{ flex: count, backgroundColor: colors[kind] ?? '#484f58' }}
            title={`${kind}: ${count}`}
          >
            {count > 0 ? count : ''}
          </div>
        ))}
      </div>
      {kinds.map(([kind, count]) => (
        <div key={kind} className="metric">
          <span className="metric-label" style={{ color: colors[kind] ?? '#8b949e' }}>{kind}</span>
          <span className="metric-value">{count} ({((count / total) * 100).toFixed(0)}%)</span>
        </div>
      ))}
    </div>
  );
}

function LineageCard({ lineage }: { lineage: LineageEntry[] }) {
  if (lineage.length === 0) return <div className="card"><h2>Intervention Lineage</h2><div className="empty">No interventions recorded yet.</div></div>;
  return (
    <div className="card">
      <h2>Intervention Lineage ({lineage.length} entries)</h2>
      {lineage.slice(-10).reverse().map((entry, i) => (
        <div key={i} className="lineage-entry">
          iter {entry.iteration} — {entry.completionStatus ?? 'pending'} — {entry.workItemId?.slice(0, 8) ?? '—'} — {new Date(entry.timestamp).toLocaleTimeString()}
        </div>
      ))}
    </div>
  );
}

function CompletionsCard({ workbench }: { workbench: WorkbenchData | null }) {
  const completions = workbench?.completions ?? [];
  if (completions.length === 0) return null;
  return (
    <div className="card">
      <h2>Recent Completions ({completions.length})</h2>
      {completions.slice(-8).reverse().map((c, i) => (
        <div key={i} className="lineage-entry">
          {c.status === 'completed' ? '✓' : '○'} {c.workItemId.slice(0, 8)} — {c.rationale.slice(0, 60)}
        </div>
      ))}
    </div>
  );
}

// ─── App ───

function App() {
  const [workbench, setWorkbench] = useState<WorkbenchData | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [lineage, setLineage] = useState<LineageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [wb, sc, lin] = await Promise.all([
      loadJson<WorkbenchData>('.tesseract/workbench/index.json'),
      loadJson<ScorecardData>('.tesseract/benchmarks/scorecard.json'),
      loadJson<{ entries: LineageEntry[] }>('.tesseract/workbench/lineage.json'),
    ]);
    setWorkbench(wb);
    setScorecard(sc);
    setLineage(lin?.entries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="container">
      <h1>
        Tesseract Dashboard
        <button className="btn refresh-btn" onClick={refresh} disabled={loading}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </h1>
      <StatusBar workbench={workbench} scorecard={scorecard} />
      <div className="grid">
        <FitnessCard scorecard={scorecard} />
        <KindDistribution workbench={workbench} />
        <CompletionsCard workbench={workbench} />
        <LineageCard lineage={lineage} />
      </div>
      <WorkbenchCard workbench={workbench} />
    </div>
  );
}

// ─── Mount ───

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
