/**
 * DriftMeter — convergence drift progress bar approaching zero.
 *
 * Semantic: amber = active learning (high drift). Green = converged (drift → 0).
 * Shows "Converged" label when drift < 0.005.
 *
 * Pure atom. Memo-wrapped.
 */

import { memo } from 'react';

interface DriftMeterProps {
  readonly drift: number;
  readonly maxDrift?: number;
}

export const DriftMeter = memo(function DriftMeter({ drift, maxDrift = 0.1 }: DriftMeterProps) {
  const pct = Math.min(100, (drift / maxDrift) * 100);
  const converged = drift < 0.005;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="metric-label" style={{ minWidth: 36 }}>Drift</span>
      <div className="drift-meter" style={{ flex: 1 }}>
        <div
          className={`drift-meter-fill ${converged ? 'converging' : 'learning'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span style={{ fontSize: 11, color: converged ? '#3fb950' : '#d29922', minWidth: 56, textAlign: 'right' }}>
        {converged ? 'Converged' : drift.toFixed(4)}
      </span>
    </div>
  );
});
