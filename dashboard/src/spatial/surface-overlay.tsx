/**
 * SurfaceOverlay (R3F) — ARIA landmark region outlines overlaid on screen plane.
 *
 * During Act 2, discovered surface regions are highlighted on the screen plane.
 * Each region gets a translucent colored overlay based on its ARIA role.
 *
 * Consumes pure domain logic from lib/domain/surface-overlay.ts for:
 *   - Region management (add/remove/dim/activate)
 *   - Color mapping by role
 *   - Stagger delay computation
 *   - Opacity with pulse boost
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 2), Part VIII
 */

import { useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  regionColor,
  effectiveOpacity,
  staggerDelay,
  STAGGER_DELAY_MS,
  type SurfaceRegion,
} from '../../../lib/domain/projection/surface-overlay';

// ─── Types ───

export interface SurfaceOverlayProps {
  readonly regions: readonly SurfaceRegion[];
  /** Screen plane bounds in world coordinates: [x, y, width, height]. */
  readonly screenBounds: readonly [number, number, number, number];
  /** Elapsed time since Act 2 start (ms). */
  readonly elapsedMs: number;
}

// ─── Constants ───

const MAX_REGIONS = 50;
const REGION_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const REGION_MATERIAL = new THREE.MeshStandardMaterial({
  transparent: true,
  opacity: 0.3,
  side: THREE.DoubleSide,
  depthWrite: false,
});

const _obj = new THREE.Object3D();
const _color = new THREE.Color();

// ─── Component ───

export const SurfaceOverlay = memo(function SurfaceOverlay({
  regions,
  screenBounds,
  elapsedMs,
}: SurfaceOverlayProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const [sx, sy, sw, sh] = screenBounds;
    let count = 0;

    for (let i = 0; i < regions.length && count < MAX_REGIONS; i++) {
      const region = regions[i]!;
      const delay = staggerDelay(i);

      // Skip if not yet staggered in
      if (elapsedMs < delay) continue;

      const opacity = effectiveOpacity(region);
      if (opacity <= 0) continue;

      // Map bounding box to world coordinates
      const bb = region.boundingBox;
      const worldX = sx + bb.x * sw;
      const worldY = sy + (1 - bb.y - bb.height) * sh; // Flip Y
      const worldW = bb.width * sw;
      const worldH = bb.height * sh;

      _obj.position.set(worldX + worldW / 2, worldY + worldH / 2, 0.01);
      _obj.scale.set(worldW, worldH, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(count, _obj.matrix);

      // Per-instance color
      _color.set(regionColor(region));
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
      args={[REGION_GEOMETRY, REGION_MATERIAL, MAX_REGIONS]}
      frustumCulled={false}
    />
  );
});
