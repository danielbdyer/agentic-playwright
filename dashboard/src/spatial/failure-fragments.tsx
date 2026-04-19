/**
 * FailureFragments (R3F) — shattered particles from failed steps (Acts 5, 6).
 *
 * When a step resolution fails, resolution rings shatter into fragments
 * that scatter radially, then drift toward the glass pane under attraction
 * forces. Near the glass boundary, fragments coalesce into proposal clusters.
 *
 * Consumes pure domain logic from product/domain/failure-fragments.ts for:
 *   - Fragment physics (gravity, drag, attraction)
 *   - Shatter generation
 *   - Coalescing detection
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 5), Part VIII
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  stepFragmentPhysics,
  type FragmentSystemState,
} from '../../../product/domain/proposal/failure-fragments';

// ─── Types ───

export interface FailureFragmentsProps {
  /** Current fragment physics state. */
  readonly fragmentState: FragmentSystemState;
  /** Callback to update fragment state after physics step. */
  readonly onPhysicsStep: (state: FragmentSystemState) => void;
}

// ─── Constants ───

const MAX_FRAGMENTS = 200;
const FRAGMENT_GEOMETRY = new THREE.TetrahedronGeometry(0.02, 0);
const FRAGMENT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff4444,
  emissive: 0xff2222,
  emissiveIntensity: 0.5,
  transparent: true,
  opacity: 0.8,
  toneMapped: false,
  depthWrite: false,
});

const _obj = new THREE.Object3D();
const _color = new THREE.Color();

// ─── Component ───

export const FailureFragments = memo(function FailureFragments({
  fragmentState,
  onPhysicsStep,
}: FailureFragmentsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastTimeRef = useRef(performance.now());

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const now = performance.now();
    const deltaMs = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Step physics
    const nextState = stepFragmentPhysics(fragmentState, deltaMs);
    if (nextState !== fragmentState) {
      onPhysicsStep(nextState);
    }

    // Render fragments
    let count = 0;
    for (const fragment of nextState.fragments) {
      if (count >= MAX_FRAGMENTS) break;

      const [px, py, pz] = fragment.position;
      _obj.position.set(px, py, pz);

      // Scale based on age — shrink as they age
      const ageRatio = fragment.age / fragment.maxAge;
      const scale = 1.0 - ageRatio * 0.5;
      _obj.scale.setScalar(Math.max(0.1, scale));

      // Rotate based on velocity
      _obj.rotation.set(
        fragment.velocity[0] * 2,
        fragment.velocity[1] * 2,
        fragment.age * 3,
      );
      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);

      // Color: start red, shift to amber as they approach glass
      _color.set(fragment.color);
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
      args={[FRAGMENT_GEOMETRY, FRAGMENT_MATERIAL, MAX_FRAGMENTS]}
      frustumCulled={false}
    />
  );
});
