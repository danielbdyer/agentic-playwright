/**
 * ConvergencePanel — sidebar card showing the learning trajectory.
 *
 * Composes ConvergenceRibbon + CalibrationRadar.
 * Header shows iteration count and latest knowledge hit rate.
 * Organism: feature-level composition. Memo-wrapped.
 */

import { memo } from 'react';
import type { ConvergenceState } from '../hooks/use-convergence-state';
import { ConvergenceRibbon } from '../molecules/convergence-ribbon';
import { CalibrationRadar } from '../molecules/calibration-radar';

interface ConvergencePanelProps {
  readonly state: ConvergenceState;
}

export const ConvergencePanel = memo(function ConvergencePanel({ state }: ConvergencePanelProps) {
  const latestHitRate = state.rungHistory.length > 0
    ? state.rungHistory[state.rungHistory.length - 1]!.knowledgeHitRate
    : null;

  return (
    <div className="card card-full">
      <h2>
        Convergence
        {state.iterationCount > 0 && (
          <span style={{ float: 'right', fontSize: 12, color: '#c9d1d9' }}>
            iter {state.iterationCount}
            {latestHitRate != null && ` · ${(latestHitRate * 100).toFixed(1)}% hit`}
          </span>
        )}
      </h2>
      <ConvergenceRibbon history={state.rungHistory} />
      <CalibrationRadar calibration={state.calibration} />
    </div>
  );
});
