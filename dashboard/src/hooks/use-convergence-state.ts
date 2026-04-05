/**
 * useConvergenceState — accumulates rung-shift and calibration-update events
 * into a bounded immutable history for convergence visualization.
 *
 * Complexity: O(1) append, O(k) bounded copy where k = maxHistory (default 20).
 * Uses useTransition for non-urgent state updates — convergence metrics
 * should never block particle rendering.
 */

import { useState, useTransition } from 'react';
import type { RungShiftEvent, CalibrationUpdateEvent } from '../spatial/types';

export interface ConvergenceState {
  readonly rungHistory: readonly RungShiftEvent[];
  readonly calibration: CalibrationUpdateEvent | null;
  readonly iterationCount: number;
}

const INITIAL: ConvergenceState = { rungHistory: [], calibration: null, iterationCount: 0 };

export function useConvergenceState(maxHistory = 20) {
  const [state, setState] = useState<ConvergenceState>(INITIAL);
  const [, startTransition] = useTransition();

  const pushRung = (event: RungShiftEvent) => {
    startTransition(() => {
      setState((prev) => ({
        ...prev,
        rungHistory: [...prev.rungHistory.slice(-(maxHistory - 1)), event],
        iterationCount: event.iteration,
      }));
    });
  };

  const pushCalibration = (event: CalibrationUpdateEvent) => {
    startTransition(() => {
      setState((prev) => ({ ...prev, calibration: event, iterationCount: event.iteration }));
    });
  };

  return { state, pushRung, pushCalibration } as const;
}
