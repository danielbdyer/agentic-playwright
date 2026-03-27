/**
 * IterationPulse — scene-wide ambient light modulation driven by iteration heartbeat.
 *
 * Semantic: scene "breathes" with each iteration cycle.
 * iteration-start → pulse to 1.0 → exponential decay → idle.
 *
 * Renders nothing visible — only affects ambient lighting.
 * Zero allocation per frame. Memo-wrapped.
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface IterationPulseProps {
  readonly tick: (delta: number) => number;
  readonly baseIntensity?: number;
  readonly pulseBoost?: number;
}

export const IterationPulse = memo(function IterationPulse({
  tick,
  baseIntensity = 0.3,
  pulseBoost = 0.25,
}: IterationPulseProps) {
  const lightRef = useRef<THREE.AmbientLight>(null);

  useFrame((_, delta) => {
    const pulse = tick(delta);
    const light = lightRef.current;
    if (light) {
      light.intensity = baseIntensity + pulse * pulseBoost;
    }
  });

  return <ambientLight ref={lightRef} intensity={baseIntensity} />;
});
