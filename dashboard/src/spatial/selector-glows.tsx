/**
 * Selector Glows — bioluminescent highlights on discovered DOM elements.
 *
 * Architecture:
 *   - InstancedMesh for O(1) GPU draw calls regardless of glow count
 *   - Custom emissive material with Fresnel-edge glow
 *   - Zero per-frame allocation: writes directly to InstancedMesh buffers
 *   - Animation via useFrame (per-frame matrix + color update)
 *
 * Performance:
 *   - No Matrix4[] allocation per frame (writes to mesh directly)
 *   - No Float32Array allocation per frame (reuses module-level buffer)
 *   - No dummy.matrix.clone() — compose matrix in-place
 *   - for-loop instead of .forEach() — avoids closure allocation
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProbeEvent, ViewportDimensions } from './types';
import { rungToIntensity, governanceToTint, governanceToGlowStyle } from './types';

interface SelectorGlowsProps {
  readonly probes: readonly ProbeEvent[];
  readonly viewport: ViewportDimensions;
  readonly planeWidth: number;
  readonly planeHeight: number;
}

// ─── Shared Resources (module-level, zero allocation per frame) ───

const GLOW_GEOMETRY = new THREE.PlaneGeometry(1, 1);

const GLOW_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  emissive: 0x00ff88,
  emissiveIntensity: 1.5,
  transparent: true,
  opacity: 0.4,
  side: THREE.DoubleSide,
  toneMapped: false,
  depthWrite: false,
});

const MAX_GLOWS = 200;

// Reusable Object3D for matrix composition — never cloned, written directly to mesh
const _obj = new THREE.Object3D();

// Reusable color buffer — written to instanceColor attribute directly
const _colors = new Float32Array(MAX_GLOWS * 3);

// ─── Component ───

export const SelectorGlows = memo(function SelectorGlows({
  probes,
  viewport,
  planeWidth,
  planeHeight,
}: SelectorGlowsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);

  const visibleProbes = useMemo(
    () => probes.filter((p) => p.boundingBox !== null),
    [probes],
  );

  // Per-frame update: write directly to InstancedMesh buffers.
  // Zero allocations: no new arrays, no matrix clones, no closures.
  useFrame((_, delta) => {
    timeRef.current += delta;
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = Math.min(visibleProbes.length, MAX_GLOWS);
    mesh.count = count;

    if (count === 0) return;

    const time = timeRef.current;
    const vw = viewport.width;
    const vh = viewport.height;

    for (let i = 0; i < count; i++) {
      const probe = visibleProbes[i]!;
      const box = probe.boundingBox!;

      // Coordinate mapping (inlined for hot path — avoids function call + object allocation)
      const ndcX = ((box.x + box.width / 2) / vw) * 2 - 1;
      const ndcY = -(((box.y + box.height / 2) / vh) * 2 - 1);
      const worldX = ndcX * (planeWidth / 2);
      const worldY = ndcY * (planeHeight / 2);

      const scaleX = (box.width / vw) * planeWidth * 1.1;
      const scaleY = (box.height / vh) * planeHeight * 1.1;

      // Governance drives glow animation style:
      //   approved → solid (gentle pulse), review-required → faster pulse, blocked → flicker
      const glowStyle = governanceToGlowStyle(probe.governance);
      const pulse = glowStyle === 'flicker'
        ? 1.0 + Math.sin(time * 12 + i * 0.3) * 0.2
        : glowStyle === 'pulse'
          ? 1.0 + Math.sin(time * 5 + i * 0.5) * 0.15
          : 1.0 + Math.sin(time * 3 + i * 0.5) * 0.08;

      // Write matrix directly to mesh — no clone, no intermediate array
      _obj.position.set(worldX, worldY, 0.01);
      _obj.scale.set(scaleX * pulse, scaleY * pulse, 1);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);

      // Color from governance tint modulated by rung intensity
      const intensity = rungToIntensity(probe.locatorRung);
      const [tr, tg, tb] = governanceToTint(probe.governance);
      _colors[i * 3] = tr * intensity;
      _colors[i * 3 + 1] = tg * intensity;
      _colors[i * 3 + 2] = tb * intensity;
    }

    mesh.instanceMatrix.needsUpdate = true;

    // Update instance colors from shared buffer
    const colorAttr = mesh.geometry.getAttribute('instanceColor');
    if (colorAttr) {
      (colorAttr.array as Float32Array).set(_colors.subarray(0, count * 3));
      colorAttr.needsUpdate = true;
    }
  });

  if (visibleProbes.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[GLOW_GEOMETRY, GLOW_MATERIAL, MAX_GLOWS]}
      frustumCulled={false}
    >
      <instancedBufferAttribute
        attach="geometry-attributes-instanceColor"
        args={[new Float32Array(MAX_GLOWS * 3), 3]}
      />
    </instancedMesh>
  );
});
