/**
 * Glass Pane — frosted translucent overlay between the live DOM and
 * the knowledge observatory.
 *
 * Uses Three.js MeshPhysicalMaterial with physically-based transmission
 * for real refraction and scattering. The pane is a single quad that
 * floats between the screen plane and the knowledge layer.
 *
 * Pure component: position and dimensions in, frosted glass out.
 */

import { memo } from 'react';
import * as THREE from 'three';

interface GlassPaneProps {
  readonly width: number;
  readonly height: number;
  readonly position: [number, number, number];
  readonly opacity?: number;
}

/** Frosted glass material — physically-based transmission + roughness.
 *  Shared across instances (immutable after creation). */
const glassMaterial = new THREE.MeshPhysicalMaterial({
  transmission: 0.96,
  thickness: 1.5,
  roughness: 0.08,
  metalness: 0,
  ior: 1.33,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
  color: 0x111827,
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
  depthWrite: false,
});

export const GlassPane = memo(function GlassPane({
  width,
  height,
  position,
}: GlassPaneProps) {
  return (
    <mesh position={position}>
      <planeGeometry args={[width, height]} />
      <primitive object={glassMaterial} attach="material" />
    </mesh>
  );
});
