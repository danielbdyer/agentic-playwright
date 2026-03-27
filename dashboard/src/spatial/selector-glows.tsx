/**
 * Selector Glows — bioluminescent highlights on discovered DOM elements.
 *
 * When the Effect fiber probes an element, it emits an 'element-probed' event
 * with a bounding box. This component renders a glowing quad at that position,
 * fading in on discovery and pulsing while active.
 *
 * Architecture:
 *   - InstancedMesh for O(1) GPU draw calls regardless of glow count
 *   - Custom emissive material with Fresnel-edge glow
 *   - Each instance driven by a matrix + color from the probe event
 *   - Animation via useFrame (per-frame shader uniform update)
 *
 * Pure: no side effects. State in, visuals out.
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProbeEvent, ViewportDimensions } from './types';
import { domToWorld, confidenceToColor, rungToIntensity } from './types';

interface SelectorGlowsProps {
  /** Active probe events (from ingestion queue). */
  readonly probes: readonly ProbeEvent[];
  /** Viewport dimensions for coordinate mapping. */
  readonly viewport: ViewportDimensions;
  /** Screen plane dimensions in world space. */
  readonly planeWidth: number;
  readonly planeHeight: number;
}

// Shared geometry: a thin quad slightly larger than the element
const GLOW_GEOMETRY = new THREE.PlaneGeometry(1, 1);

// Shared material: emissive + transparent for bloom interaction
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
const dummy = new THREE.Object3D();
const colorArray = new Float32Array(MAX_GLOWS * 3);

/** Pure: compute instance matrices and colors from probe events. */
function computeInstances(
  probes: readonly ProbeEvent[],
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
  time: number,
): { count: number; matrices: THREE.Matrix4[]; colors: Float32Array } {
  const matrices: THREE.Matrix4[] = [];
  const colors = new Float32Array(Math.min(probes.length, MAX_GLOWS) * 3);

  for (let i = 0; i < Math.min(probes.length, MAX_GLOWS); i++) {
    const probe = probes[i]!;
    if (!probe.boundingBox) continue;

    const world = domToWorld(probe.boundingBox, viewport, planeWidth, planeHeight);
    const scaleX = (probe.boundingBox.width / viewport.width) * planeWidth * 1.1;
    const scaleY = (probe.boundingBox.height / viewport.height) * planeHeight * 1.1;

    // Pulse animation: gentle breathe based on time + probe index
    const pulse = 1.0 + Math.sin(time * 3 + i * 0.5) * 0.08;
    const intensity = rungToIntensity(probe.locatorRung);

    dummy.position.set(world.x, world.y, world.z);
    dummy.scale.set(scaleX * pulse, scaleY * pulse, 1);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());

    // Color from confidence: learning (cyan) → approved (green)
    const [r, g, b] = confidenceToColor(probe.confidence);
    colors[i * 3] = r * intensity;
    colors[i * 3 + 1] = g * intensity;
    colors[i * 3 + 2] = b * intensity;
  }

  return { count: matrices.length, matrices, colors };
}

/** Selector Glows — InstancedMesh of bioluminescent element highlights.
 *  Renders at GPU speed: one draw call for all glows. */
export const SelectorGlows = memo(function SelectorGlows({
  probes,
  viewport,
  planeWidth,
  planeHeight,
}: SelectorGlowsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);

  // Memoize visible probes (only those with bounding boxes)
  const visibleProbes = useMemo(
    () => probes.filter((p) => p.boundingBox !== null),
    [probes],
  );

  // Per-frame update: recompute positions with pulse animation
  useFrame((_, delta) => {
    timeRef.current += delta;
    const mesh = meshRef.current;
    if (!mesh || visibleProbes.length === 0) return;

    const { count, matrices, colors } = computeInstances(
      visibleProbes,
      viewport,
      planeWidth,
      planeHeight,
      timeRef.current,
    );

    mesh.count = count;
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, matrices[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // Update instance colors
    const attr = mesh.geometry.getAttribute('instanceColor');
    if (attr) {
      (attr.array as Float32Array).set(colors.subarray(0, count * 3));
      attr.needsUpdate = true;
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
        args={[colorArray, 3]}
      />
    </instancedMesh>
  );
});
