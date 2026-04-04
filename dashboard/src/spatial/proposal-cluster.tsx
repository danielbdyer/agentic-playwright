/**
 * ProposalCluster (R3F) — particle cluster approaching glass pane (Act 6).
 *
 * In Act 6, coalesced failure fragments form proposal clusters that
 * approach the glass pane. Each cluster:
 *   - Is colored by artifact type
 *   - Sized proportional to confidence
 *   - Pulses based on governance prediction
 *   - Interacts with glass (pass/reflect/shatter)
 *
 * Consumes pure domain logic from lib/domain/proposal-cluster.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 6), Part VIII
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  ARTIFACT_COLORS,
  type ProposalCluster as ProposalClusterData,
} from '../../../lib/domain/proposal/cluster';

// ─── Types ───

export interface ProposalClusterProps {
  readonly clusters: readonly ProposalClusterData[];
  readonly glassPaneX: number;
}

// ─── Constants ───

const MAX_CLUSTERS = 30;
const CLUSTER_GEOMETRY = new THREE.SphereGeometry(0.05, 8, 6);
const CLUSTER_MATERIAL = new THREE.MeshStandardMaterial({
  transparent: true,
  opacity: 0.8,
  emissiveIntensity: 0.4,
  toneMapped: false,
  depthWrite: false,
});

const _obj = new THREE.Object3D();
const _color = new THREE.Color();

// ─── Pure Helpers ───

/** Compute pulse scale factor from phase and time. */
export function pulseScale(pulseRate: number, time: number): number {
  return 1.0 + 0.1 * Math.sin(time * pulseRate * Math.PI * 2);
}

// ─── Component ───

export const ProposalCluster = memo(function ProposalCluster({
  clusters,
  glassPaneX,
}: ProposalClusterProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const clockRef = useRef(0);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    clockRef.current += delta;
    const time = clockRef.current;

    let count = 0;
    for (const cluster of clusters) {
      if (count >= MAX_CLUSTERS) break;
      if (cluster.phase === 'complete') continue;

      const [px, py, pz] = cluster.position;
      _obj.position.set(px, py, pz);

      // Size based on confidence with pulse
      const baseSize = cluster.size;
      const pulse = pulseScale(cluster.pulseRate, time);
      _obj.scale.setScalar(baseSize * pulse);

      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);

      // Color by artifact type
      _color.set(ARTIFACT_COLORS[cluster.artifactType]);
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
      args={[CLUSTER_GEOMETRY, CLUSTER_MATERIAL, MAX_CLUSTERS]}
      frustumCulled={false}
    />
  );
});
