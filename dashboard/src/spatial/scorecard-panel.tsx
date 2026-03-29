/**
 * ScorecardPanel3D — floating 3D panel showing iteration scorecard metrics.
 *
 * During Act 7 (Meta-Measurement), a scorecard panel floats in the scene
 * showing the 9 key metrics from the iteration summary. After convergence,
 * this panel persists as part of the summary view.
 *
 * Renders as a billboard plane with HTML texture overlay.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 7), Part VIII
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Types ───

export interface ScorecardMetric {
  readonly label: string;
  readonly value: number;
  readonly target: number;
  readonly unit: '%' | 'count' | 'ms' | 'score';
}

export interface ScorecardPanel3DProps {
  readonly metrics: readonly ScorecardMetric[];
  readonly iteration: number;
  readonly position: readonly [number, number, number];
  readonly visible: boolean;
}

// ─── Pure Helpers ───

/** Format metric value for display. */
export function formatMetricValue(value: number, unit: ScorecardMetric['unit']): string {
  switch (unit) {
    case '%': return `${Math.round(value * 100)}%`;
    case 'count': return String(Math.round(value));
    case 'ms': return `${Math.round(value)}ms`;
    case 'score': return value.toFixed(2);
  }
}

/** Compute metric status color based on target proximity. */
export function metricColor(value: number, target: number): string {
  const ratio = target > 0 ? value / target : 0;
  if (ratio >= 0.95) return '#22c55e'; // Green — target met
  if (ratio >= 0.7) return '#f59e0b';  // Amber — approaching
  return '#ef4444';                     // Red — below target
}

/** Overall scorecard health: fraction of metrics at or above target. */
export function scorecardHealth(metrics: readonly ScorecardMetric[]): number {
  if (metrics.length === 0) return 0;
  const metCount = metrics.filter((m) => m.value >= m.target).length;
  return metCount / metrics.length;
}

// ─── Constants ───

const PANEL_GEOMETRY = new THREE.PlaneGeometry(1.2, 0.8);
const PANEL_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x111122,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

// ─── Component ───

export const ScorecardPanel3D = memo(function ScorecardPanel3D({
  metrics,
  iteration,
  position,
  visible,
}: ScorecardPanel3DProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    group.visible = visible;
    if (!visible) return;

    // Billboard: face camera
    group.quaternion.copy(state.camera.quaternion);

    // Gentle hover animation
    const time = state.clock.getElapsedTime();
    group.position.set(
      position[0],
      position[1] + Math.sin(time * 0.5) * 0.02,
      position[2],
    );
  });

  const health = scorecardHealth(metrics);

  return (
    <group ref={groupRef} position={[position[0], position[1], position[2]]}>
      {/* Background panel */}
      <mesh geometry={PANEL_GEOMETRY} material={PANEL_MATERIAL} />

      {/* Border glow */}
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[1.22, 0.82]} />
        <meshStandardMaterial
          color={health >= 0.7 ? '#22c55e' : '#f59e0b'}
          transparent
          opacity={0.15}
          emissive={health >= 0.7 ? '#22c55e' : '#f59e0b'}
          emissiveIntensity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
});
