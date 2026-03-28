import { memo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export interface FrameBudgetSample {
  readonly avgFrameTimeMs: number;
  readonly droppedFrames: number;
}

interface FrameBudgetInstrumentationProps {
  readonly onSample?: (sample: FrameBudgetSample) => void;
}

export const FrameBudgetInstrumentation = memo(function FrameBudgetInstrumentation({ onSample }: FrameBudgetInstrumentationProps) {
  const stateRef = useRef({ elapsed: 0, samples: 0, avg: 16.67, dropped: 0 });

  useFrame((_, delta) => {
    const frameMs = delta * 1000;
    stateRef.current.samples += 1;
    stateRef.current.elapsed += frameMs;
    stateRef.current.avg = stateRef.current.avg * 0.9 + frameMs * 0.1;
    stateRef.current.dropped += Math.max(0, Math.floor(frameMs / 16.67) - 1);

    if (stateRef.current.elapsed >= 250) {
      onSample?.({
        avgFrameTimeMs: stateRef.current.avg,
        droppedFrames: stateRef.current.dropped,
      });
      stateRef.current.elapsed = 0;
      stateRef.current.samples = 0;
    }
  });

  return null;
});
