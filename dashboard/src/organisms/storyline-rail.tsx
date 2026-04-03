/**
 * StorylineRail — horizontal pipeline timeline docked at the bottom of the viewport.
 *
 * Five-zone layout: this is the bottom bar that shows the pipeline's temporal
 * progression as connected stage nodes. Replaces the sidebar PipelineProgress
 * card with a spatial-narrative-oriented horizontal rail.
 *
 * FP: pure derivation of stage entries from immutable Map.
 * React North Star: renders, does not reason. Pure props in, JSX out.
 * Organism. Memo-wrapped.
 */

import { memo } from 'react';
import type { StageState } from '../hooks/use-stage-tracker';
import type { ProgressEvent } from '../types';

interface StorylineRailProps {
  readonly stages: ReadonlyMap<string, StageState>;
  readonly activeStage: string | null;
  readonly progress: ProgressEvent | null;
  readonly connected: boolean;
}

/** Human-readable short label for pipeline stages. Pure. */
const stageLabel = (name: string): string =>
  name.replace(/^(run-|build-|emit-|compile-|load-)/, '');

/** Format duration for display. Pure. */
const formatDuration = (ms: number): string =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

/** Derive phase display text from progress. Pure. */
const phaseText = (progress: ProgressEvent | null): string | null => {
  if (!progress) return null;
  const parts: readonly string[] = [
    progress.phase ?? '',
    progress.iteration != null ? `iter ${progress.iteration}` : '',
    progress.scenarioCount != null ? `${progress.scenarioCount} scenarios` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
};

export const StorylineRail = memo(function StorylineRail({
  stages,
  activeStage,
  progress,
  connected,
}: StorylineRailProps) {
  const entries = [...stages.values()];
  const phase = phaseText(progress);

  return (
    <div className="storyline-rail" role="navigation" aria-label="Pipeline timeline">
      {/* Left: connection + phase label */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}
          title={connected ? 'WebSocket connected' : 'Disconnected'}
        />
        {phase && (
          <span className="text-xs text-fg-muted whitespace-nowrap">{phase}</span>
        )}
      </div>

      {/* Separator */}
      {entries.length > 0 && (
        <div className="w-px h-4 bg-surface-border shrink-0" />
      )}

      {/* Center: stage node chain */}
      <div className="stage-pipeline flex-1 overflow-x-auto">
        {entries.length === 0 ? (
          <span className="text-xs text-fg-muted italic">Awaiting pipeline…</span>
        ) : (
          entries.map((stage, index) => (
            <span key={stage.name} className="contents">
              {index > 0 && (
                <span
                  className={`stage-connector ${stage.phase === 'complete' ? 'complete' : ''}`}
                />
              )}
              <span
                className={`stage-node ${stage.phase}`}
                title={stage.durationMs != null ? formatDuration(stage.durationMs) : stage.name}
              >
                <span className={`stage-dot ${stage.phase}`} />
                <span>{stageLabel(stage.name)}</span>
                {stage.phase === 'complete' && stage.durationMs != null && (
                  <span className="text-[10px] text-fg-muted ml-0.5">
                    {formatDuration(stage.durationMs)}
                  </span>
                )}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Right: active stage callout */}
      {activeStage && (
        <div className="flex items-center gap-1.5 shrink-0 text-xs text-actor-system font-semibold whitespace-nowrap">
          <span className="stage-dot active" />
          {stageLabel(activeStage)}
        </div>
      )}
    </div>
  );
});
