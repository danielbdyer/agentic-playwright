/**
 * FitnessCard — high-water mark fitness metrics with rung distribution.
 * FP: flatMap for rung segments (elides zero-win in one pass).
 * Molecule. Memo-wrapped.
 */
import { memo } from 'react';
import { RungBar } from '../atoms/rung-bar';

interface Scorecard {
  readonly highWaterMark: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly convergenceVelocity: number;
    readonly proposalYield: number;
    readonly resolutionByRung?: ReadonlyArray<{ readonly rung: string; readonly wins: number; readonly rate: number }>;
  };
}

interface FitnessCardProps { readonly scorecard: Scorecard | null }

const cls = (v: number): string => v >= 0.8 ? 'good' : v >= 0.5 ? 'warn' : 'bad';

export const FitnessCard = memo(function FitnessCard({ scorecard }: FitnessCardProps) {
  if (!scorecard) return <div className="card"><h2>Fitness</h2><div className="empty">No scorecard yet.</div></div>;
  const h = scorecard.highWaterMark;
  return (
    <div className="card">
      <h2>Fitness High-Water Mark</h2>
      <div className="metric"><span className="metric-label">Knowledge Hit Rate</span><span className={`metric-value ${cls(h.knowledgeHitRate)}`}>{(h.knowledgeHitRate * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Translation Precision</span><span className={`metric-value ${cls(h.translationPrecision)}`}>{(h.translationPrecision * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Convergence</span><span className="metric-value">{h.convergenceVelocity} iter</span></div>
      <div className="metric"><span className="metric-label">Proposal Yield</span><span className={`metric-value ${cls(h.proposalYield)}`}>{(h.proposalYield * 100).toFixed(1)}%</span></div>
      {h.resolutionByRung && h.resolutionByRung.some((r) => r.wins > 0) && (
        <div style={{ marginTop: 8 }}>
          <RungBar distribution={h.resolutionByRung} />
        </div>
      )}
    </div>
  );
});
