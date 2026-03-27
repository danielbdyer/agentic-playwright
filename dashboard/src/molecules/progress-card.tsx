/** ProgressCard — live speedrun progress metrics. Molecule. Memo-wrapped. */
import { memo } from 'react';

interface ProgressEvent {
  readonly phase: string;
  readonly iteration: number;
  readonly maxIterations: number;
  readonly metrics: { readonly knowledgeHitRate: number; readonly proposalsActivated: number; readonly totalSteps: number; readonly unresolvedSteps: number } | null;
  readonly convergenceReason: string | null;
  readonly elapsed: number;
  readonly calibration?: { readonly weightDrift: number; readonly topCorrelation: { readonly signal: string; readonly strength: number } | null } | null;
}

interface ProgressCardProps { readonly progress: ProgressEvent | null }

const hitCls = (v: number): string => v >= 0.8 ? 'good' : v >= 0.5 ? 'warn' : 'bad';

export const ProgressCard = memo(function ProgressCard({ progress }: ProgressCardProps) {
  if (!progress) return <div className="card"><h2>Live Progress</h2><div className="empty">No active run.</div></div>;
  const m = progress.metrics;
  return (
    <div className="card">
      <h2>Live — [{progress.phase}]</h2>
      {m && (
        <>
          <div className="metric"><span className="metric-label">Hit Rate</span><span className={`metric-value ${hitCls(m.knowledgeHitRate)}`}>{(m.knowledgeHitRate * 100).toFixed(1)}%</span></div>
          <div className="metric"><span className="metric-label">Steps</span><span className="metric-value">{m.totalSteps} ({m.unresolvedSteps} unresolved)</span></div>
        </>
      )}
      <div className="metric"><span className="metric-label">Elapsed</span><span className="metric-value">{(progress.elapsed / 1000).toFixed(1)}s</span></div>
      {progress.calibration && <div className="metric"><span className="metric-label">Drift</span><span className="metric-value">{progress.calibration.weightDrift.toFixed(4)}</span></div>}
    </div>
  );
});
