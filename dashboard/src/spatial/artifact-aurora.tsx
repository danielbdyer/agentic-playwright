/**
 * ArtifactAurora — brief emissive flashes near the glass pane on artifact writes.
 *
 * Semantic: pipeline output activity. Brief, ambient, non-distracting.
 * Each artifact-written event spawns one instance that fades over ~0.8s.
 *
 * InstancedMesh for O(1) GPU draw calls. Ring buffer recycling (50 max).
 * Zero allocation per frame via module-level buffers.
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ArtifactWrittenEvent } from './types';

interface ArtifactAuroraProps {
  readonly events: readonly ArtifactWrittenEvent[];
  readonly position: readonly [number, number, number];
}

const MAX_FLASHES = 50;
const FLASH_DURATION = 0.8; // seconds

const FLASH_GEOMETRY = new THREE.PlaneGeometry(0.15, 0.03);
const FLASH_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xccddff,
  emissive: 0xccddff,
  emissiveIntensity: 2.0,
  transparent: true,
  opacity: 0.6,
  toneMapped: false,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const _obj = new THREE.Object3D();

// Flash state: mutable ring buffer (GPU-side only, not React state)
interface FlashState {
  readonly y: number;
  life: number;
}

export const ArtifactAurora = memo(function ArtifactAurora({ events, position }: ArtifactAuroraProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const flashesRef = useRef<FlashState[]>([]);
  const lastEventCountRef = useRef(0);

  // Detect new events by count (O(1) — no array comparison)
  const newCount = events.length - lastEventCountRef.current;

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const flashes = flashesRef.current;

    // Spawn new flashes for events arrived since last frame
    if (newCount > 0) {
      lastEventCountRef.current = events.length;
      const spawns = Math.min(newCount, 5); // Cap burst spawns per frame
      for (let i = 0; i < spawns; i++) {
        if (flashes.length >= MAX_FLASHES) flashes.shift(); // Ring recycle
        flashes.push({ y: (Math.random() - 0.5) * 2.0, life: 0 });
      }
    }

    // Advance and render active flashes
    let count = 0;
    for (let i = 0; i < flashes.length; i++) {
      const f = flashes[i]!;
      f.life += delta;
      if (f.life >= FLASH_DURATION) continue;

      const alpha = 1.0 - f.life / FLASH_DURATION;
      const spread = f.life * 0.3; // Expand outward as it fades
      _obj.position.set(position[0] + spread, f.y + position[1], position[2]);
      _obj.scale.set(1 + f.life * 2, 1, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);
      count++;
    }

    // Prune dead flashes
    flashesRef.current = flashes.filter((f) => f.life < FLASH_DURATION);

    mesh.count = count;
    if (count > 0) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[FLASH_GEOMETRY, FLASH_MATERIAL, MAX_FLASHES]} frustumCulled={false} />
  );
});
