/** StatusBar — top-level metrics strip. Molecule: composes ConnectionDot atom. */
import { memo } from 'react';
import { ConnectionDot } from '../atoms/connection-dot';

interface StatusBarProps {
  readonly workbench: { readonly iteration?: number; readonly summary: { readonly pending: number; readonly completed: number } } | null;
  readonly scorecard: { readonly highWaterMark: { readonly knowledgeHitRate: number } } | null;
  readonly connected: boolean;
  readonly progress: { readonly phase: string; readonly iteration: number; readonly maxIterations: number } | null;
}

export const StatusBar = memo(function StatusBar({ workbench, scorecard, connected, progress }: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-item"><ConnectionDot connected={connected} /><span className="status-label">WS</span></div>
      <div className="status-item"><span className="status-label">Iter:</span><span className="status-value">{workbench?.iteration ?? '\u2014'}</span></div>
      <div className="status-item"><span className="status-label">Queue:</span><span className="status-value">{workbench?.summary.pending ?? 0} pending / {workbench?.summary.completed ?? 0} done</span></div>
      <div className="status-item"><span className="status-label">HWM:</span><span className="status-value">{scorecard?.highWaterMark ? `${(scorecard.highWaterMark.knowledgeHitRate * 100).toFixed(1)}%` : '\u2014'}</span></div>
      {progress && <div className="status-item"><span className="status-label">Live:</span><span className="status-value">[{progress.phase}] {progress.iteration}/{progress.maxIterations}</span></div>}
    </div>
  );
});
