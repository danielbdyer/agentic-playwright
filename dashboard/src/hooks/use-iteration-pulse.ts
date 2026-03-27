/**
 * useIterationPulse — converts iteration-start/complete into a decaying
 * pulse value for driving scene-wide ambient effects.
 *
 * The pulse value lives in a ref (not state) to avoid React re-renders.
 * Consumers read it in useFrame or RAF callbacks.
 */

import { useRef, useCallback } from 'react';

export type IterationPhase = 'idle' | 'running' | 'complete';

export function useIterationPulse(decayRate = 1.5) {
  const pulseRef = useRef(0);
  const phaseRef = useRef<IterationPhase>('idle');

  const onStart = useCallback(() => {
    pulseRef.current = 1.0;
    phaseRef.current = 'running';
  }, []);

  const onComplete = useCallback(() => {
    phaseRef.current = 'complete';
  }, []);

  /** Call from useFrame with frame delta. Returns current pulse [0..1]. */
  const tick = useCallback((delta: number) => {
    if (pulseRef.current > 0) {
      pulseRef.current = Math.max(0, pulseRef.current - delta * decayRate);
    }
    if (pulseRef.current <= 0 && phaseRef.current === 'complete') {
      phaseRef.current = 'idle';
    }
    return pulseRef.current;
  }, [decayRate]);

  return { tick, onStart, onComplete, phase: phaseRef } as const;
}
