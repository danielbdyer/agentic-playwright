/**
 * StagePipeline — horizontal row of pipeline stage indicators.
 *
 * Semantic: shows scenarios flowing through bind→compile→resolve→execute→propose.
 * Stage dots light up cyan (active) then green (complete) with timing labels.
 *
 * Molecule: composes StageDot atoms. Memo-wrapped.
 */

import { memo, useMemo } from 'react';
import type { StageState } from '../hooks/use-stage-tracker';
import { StageDot } from '../atoms/stage-dot';

interface StagePipelineProps {
  readonly stages: ReadonlyMap<string, StageState>;
}

export const StagePipeline = memo(function StagePipeline({ stages }: StagePipelineProps) {
  // Map insertion order is stable — reflects first-seen pipeline order.
  const entries = useMemo(
    () => [...stages.values()],
    [stages],
  );

  if (entries.length === 0) {
    return <div className="empty" style={{ padding: 8, fontSize: 12 }}>Awaiting pipeline…</div>;
  }

  return (
    <div className="stage-pipeline">
      {entries.map((stage) => (
        <StageDot
          key={stage.name}
          name={stage.name}
          phase={stage.phase}
          durationMs={stage.durationMs}
        />
      ))}
    </div>
  );
});
