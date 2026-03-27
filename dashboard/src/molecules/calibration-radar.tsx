/**
 * CalibrationRadar — four bottleneck weights with drift indicator.
 *
 * Semantic: shows which signals (repair density, translation rate,
 * unresolved rate, fragment share) drive the self-improving loop.
 * Drift approaching zero = convergence.
 *
 * Uses flatMap to pair weights with their strongest correlation.
 * Molecule: composes WeightIndicator + DriftMeter atoms. Memo-wrapped.
 */

import { memo } from 'react';
import type { CalibrationUpdateEvent } from '../spatial/types';
import { WeightIndicator } from '../atoms/weight-indicator';
import { DriftMeter } from '../atoms/drift-meter';

interface CalibrationRadarProps {
  readonly calibration: CalibrationUpdateEvent | null;
}

interface WeightEntry {
  readonly label: string;
  readonly key: keyof CalibrationUpdateEvent['weights'];
  readonly value: number;
  readonly correlation: number;
}

const WEIGHT_LABELS: readonly { readonly label: string; readonly key: keyof CalibrationUpdateEvent['weights']; readonly signal: string }[] = [
  { label: 'Repair', key: 'repairDensity', signal: 'repair-recovery-hotspot' },
  { label: 'Translation', key: 'translationRate', signal: 'translation-fallback-dominant' },
  { label: 'Unresolved', key: 'unresolvedRate', signal: 'high-unresolved-rate' },
  { label: 'Coverage', key: 'inverseFragmentShare', signal: 'thin-screen-coverage' },
];

export const CalibrationRadar = memo(function CalibrationRadar({ calibration }: CalibrationRadarProps) {
  // React Compiler auto-memoizes this derivation
  const entries: readonly WeightEntry[] = (() => {
    if (!calibration) return [];
    const correlationMap = new Map(calibration.correlations.map((c) => [c.signal, c.strength]));
    return WEIGHT_LABELS.flatMap(({ label, key, signal }) => [{
      label,
      key,
      value: calibration.weights[key],
      correlation: correlationMap.get(signal) ?? 0,
    }]);
  })();

  if (!calibration) {
    return <div className="empty" style={{ padding: 8, fontSize: 12 }}>Awaiting calibration…</div>;
  }

  return (
    <div className="calibration-card">
      {entries.map((entry) => (
        <WeightIndicator
          key={entry.key}
          label={entry.label}
          value={entry.value}
          correlation={entry.correlation}
        />
      ))}
      <DriftMeter drift={calibration.weightDrift} />
    </div>
  );
});
