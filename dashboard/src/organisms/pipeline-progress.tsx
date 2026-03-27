/**
 * PipelineProgress — sidebar card showing pipeline stage progression.
 *
 * Composes StagePipeline molecule.
 * Organism: feature-level composition. Memo-wrapped.
 */

import { memo } from 'react';
import type { StageState } from '../hooks/use-stage-tracker';
import { StagePipeline } from '../molecules/stage-pipeline';

interface PipelineProgressProps {
  readonly stages: ReadonlyMap<string, StageState>;
  readonly activeStage: string | null;
}

export const PipelineProgress = memo(function PipelineProgress({ stages, activeStage }: PipelineProgressProps) {
  return (
    <div className="card card-full">
      <h2>
        Pipeline
        {activeStage && (
          <span style={{ float: 'right', fontSize: 12, color: '#58a6ff' }}>
            {activeStage}
          </span>
        )}
      </h2>
      <StagePipeline stages={stages} />
    </div>
  );
});
