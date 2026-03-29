/**
 * ConvergenceFinale (R3F) — green pulse radiating from observatory on convergence.
 *
 * When convergence is detected (Act 7), a radial color wave emanates from
 * the knowledge observatory. The visual treatment depends on convergence reason:
 *
 *   - threshold-met: Green pulse, full ceremony (15s)
 *   - no-proposals: Amber pulse, partial ceremony (15s)
 *   - budget-exhausted: Neutral, narration + summary only (12s)
 *
 * Consumes pure domain logic from lib/domain/convergence-finale.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part IX: Convergence Finale
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  type FinaleState,
  type FinaleTint,
} from '../../../lib/domain/convergence-finale';

// ─── Types ───

export interface ConvergenceFinaleProps {
  readonly state: FinaleState;
  /** Observatory center in world coordinates. */
  readonly observatoryPosition: readonly [number, number, number];
}

// ─── Constants ───

/** Color mapping for convergence tints. */
export const TINT_COLORS: Readonly<Record<FinaleTint, string>> = {
  'green': '#22c55e',
  'amber': '#f59e0b',
  'neutral': '#94a3b8',
} as const;

// ─── Constants ───

const WAVE_RING_COUNT = 5;
const RING_GEOMETRY = new THREE.RingGeometry(0.1, 0.15, 32);
const RING_MATERIAL = new THREE.MeshStandardMaterial({
  transparent: true,
  opacity: 0.6,
  emissiveIntensity: 1.0,
  toneMapped: false,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const _obj = new THREE.Object3D();
const _color = new THREE.Color();

// ─── Pure Helpers ───

/** Compute ring opacity based on wave phase and ring index. */
export function ringOpacity(
  waveProgress: number,
  ringIndex: number,
  totalRings: number,
): number {
  const ringPhase = ringIndex / totalRings;
  const distance = Math.abs(waveProgress - ringPhase);
  return Math.max(0, 1 - distance * 3);
}

/** Compute ring scale based on wave progress. */
export function ringScale(
  waveProgress: number,
  ringIndex: number,
  maxRadius: number,
): number {
  const baseRadius = (ringIndex + 1) * (maxRadius / WAVE_RING_COUNT);
  return baseRadius * (0.5 + waveProgress * 0.5);
}

// ─── Component ───

export const ConvergenceFinale = memo(function ConvergenceFinale({
  state,
  observatoryPosition,
}: ConvergenceFinaleProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Only render during active phases
    const phase = state.active ? state.visual.phase : 'idle';
    if (phase === 'idle' || phase === 'summary-transition') {
      mesh.count = 0;
      return;
    }

    const [ox, oy, oz] = observatoryPosition;
    const tint = state.visual?.tint ?? 'neutral';
    const tintColor = TINT_COLORS[tint];
    const waveProgress = state.visual.waveRadius;

    let count = 0;
    for (let i = 0; i < WAVE_RING_COUNT; i++) {
      const opacity = ringOpacity(waveProgress, i, WAVE_RING_COUNT);
      if (opacity <= 0) continue;

      const scale = ringScale(waveProgress, i, 3.0);
      _obj.position.set(ox, oy, oz + 0.02);
      _obj.scale.set(scale, scale, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);

      _color.set(tintColor);
      mesh.setColorAt(count, _color);
      count++;
    }

    mesh.count = count;
    if (count > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[RING_GEOMETRY, RING_MATERIAL, WAVE_RING_COUNT]}
      frustumCulled={false}
    />
  );
});
