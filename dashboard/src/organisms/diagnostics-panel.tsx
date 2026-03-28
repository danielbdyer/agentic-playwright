import { memo } from 'react';
import type { DiagnosticsProjection } from '../types';

interface DiagnosticsPanelProps {
  readonly diagnostics: DiagnosticsProjection;
}

export const DiagnosticsPanel = memo(function DiagnosticsPanel({ diagnostics }: DiagnosticsPanelProps) {
  return (
    <section className="diagnostics-panel" aria-label="Replay diagnostics">
      <h2>Diagnostics HUD</h2>
      <div className="metric"><span className="metric-label">Throughput</span><span className="metric-value">{diagnostics.throughputPerSecond.toFixed(1)} ev/s</span></div>
      <div className="metric"><span className="metric-label">Coalescing</span><span className="metric-value">{(diagnostics.coalescingRatio * 100).toFixed(1)}%</span></div>
      <div className="metric"><span className="metric-label">Frame Time</span><span className="metric-value">{diagnostics.avgFrameTimeMs.toFixed(2)} ms</span></div>
      <div className="metric"><span className="metric-label">Dropped Frames</span><span className="metric-value">{diagnostics.droppedFrames}</span></div>
      <div className="metric"><span className="metric-label">Lag</span><span className="metric-value">{diagnostics.lagMs.toFixed(1)} ms</span></div>
      <div className="metric">
        <span className="metric-label">Queue Depth by Act</span>
        <span className="metric-value mono">{Object.entries(diagnostics.queueDepthByAct).map(([act, depth]) => `A${act}:${depth}`).join(' ')}</span>
      </div>
    </section>
  );
});
