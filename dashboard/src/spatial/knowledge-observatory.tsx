/**
 * Knowledge Observatory — 3D visualization of accumulated knowledge nodes.
 *
 * Sits to the right of the GlassPane. Each discovered element becomes a
 * luminous sphere that grows brighter as confidence increases. Particles
 * from ParticleTransport arrive here and crystallize into nodes.
 *
 * Architecture:
 *   - InstancedMesh for O(1) GPU draw calls (same pattern as SelectorGlows)
 *   - Zero per-frame allocations: writes directly to instance buffers
 *   - Spatial layout: force-directed columnar arrangement by screen
 *   - Color encodes status: learning (blue) → approved (green) → needs-review (amber)
 *
 * Pure: knowledge state in, glowing nodes out.
 */

import { useRef, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { KnowledgeNode } from './types';
import { governanceToTint, actorToColor } from './types';

// ─── Types ───

interface KnowledgeObservatoryProps {
  /** Knowledge nodes from the graph. */
  readonly nodes: readonly KnowledgeNode[];
  /** Center X position in world space. */
  readonly centerX: number;
  /** Vertical spread. */
  readonly height: number;
}

// ─── Pure Layout ───

/** Node color: blend governance tint with actor hue, modulated by confidence. Pure.
 *  Governance provides the base (green/amber/red), actor shifts the hue. */
const nodeColor = (node: KnowledgeNode): [number, number, number] => {
  const [gr, gg, gb] = governanceToTint(node.governance);
  const [ar, ag, ab] = actorToColor(node.lastActor);
  const blend = 0.7; // governance-dominant blend
  const brightness = 0.5 + node.confidence * 0.5;
  return [
    (gr * blend + ar * (1 - blend)) * brightness,
    (gg * blend + ag * (1 - blend)) * brightness,
    (gb * blend + ab * (1 - blend)) * brightness,
  ];
};

/** Confidence to sphere radius: higher confidence = larger node. Pure. */
const confidenceToRadius = (confidence: number): number =>
  0.02 + confidence * 0.04;

/** Confidence to emissive intensity. Pure. */
const confidenceToEmission = (confidence: number): number =>
  0.3 + confidence * 1.2;

/** Group nodes by screen, then layout in vertical columns. Pure.
 *  Returns world positions for each node. */
const layoutNodes = (
  nodes: readonly KnowledgeNode[],
  centerX: number,
  height: number,
): readonly { readonly x: number; readonly y: number; readonly z: number }[] => {
  // Group by screen
  const screenGroups = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    const screen = nodes[i]!.screen;
    const group = screenGroups.get(screen);
    if (group) group.push(i);
    else screenGroups.set(screen, [i]);
  }

  const positions: { x: number; y: number; z: number }[] = new Array(nodes.length);
  const screenCount = screenGroups.size;
  let col = 0;

  for (const [, indices] of screenGroups) {
    // Each screen gets a vertical column
    const colX = centerX + (col - (screenCount - 1) / 2) * 0.25;
    const rowCount = indices.length;

    for (let row = 0; row < rowCount; row++) {
      const idx = indices[row]!;
      const rowY = (row - (rowCount - 1) / 2) * 0.12;
      // Slight depth variation for visual interest
      const rowZ = Math.sin(col * 1.7 + row * 0.9) * 0.05;
      positions[idx] = {
        x: colX,
        y: Math.max(-height / 2, Math.min(height / 2, rowY)),
        z: rowZ,
      };
    }
    col++;
  }

  return positions;
};

// ─── Shared Resources ───

const MAX_NODES = 300;
const NODE_GEOMETRY = new THREE.SphereGeometry(1, 12, 8);
const NODE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x00ff88,
  emissive: 0x00ff88,
  emissiveIntensity: 1.0,
  transparent: true,
  opacity: 0.7,
  toneMapped: false,
  depthWrite: false,
});

const _obj = new THREE.Object3D();
const _colors = new Float32Array(MAX_NODES * 3);

// ─── Component ───

export const KnowledgeObservatory = memo(function KnowledgeObservatory({
  nodes,
  centerX,
  height,
}: KnowledgeObservatoryProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const timeRef = useRef(0);

  // Memoize layout — only recomputes when nodes change
  const positions = useMemo(
    () => layoutNodes(nodes, centerX, height),
    [nodes, centerX, height],
  );

  // Per-frame update: pulse animation + color writes
  useFrame((_, delta) => {
    timeRef.current += delta;
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = Math.min(nodes.length, MAX_NODES);
    mesh.count = count;
    if (count === 0) return;

    const time = timeRef.current;

    for (let i = 0; i < count; i++) {
      const node = nodes[i]!;
      const pos = positions[i]!;
      const radius = confidenceToRadius(node.confidence);

      // Gentle pulse: breathe based on time + index offset
      const pulse = 1.0 + Math.sin(time * 2 + i * 0.7) * 0.1;
      // Crystallization effect: learning nodes shimmer faster, blocked nodes flicker
      const shimmer = node.status === 'learning'
        ? 1.0 + Math.sin(time * 5 + i * 1.3) * 0.15
        : node.status === 'blocked'
          ? 1.0 + Math.sin(time * 10 + i * 0.9) * 0.2
          : 1.0;

      _obj.position.set(pos.x, pos.y, pos.z);
      _obj.scale.set(radius * pulse * shimmer, radius * pulse * shimmer, radius * pulse * shimmer);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);

      // Color from governance + actor blend
      const [r, g, b] = nodeColor(node);
      const emission = confidenceToEmission(node.confidence);
      _colors[i * 3] = r * emission;
      _colors[i * 3 + 1] = g * emission;
      _colors[i * 3 + 2] = b * emission;
    }

    mesh.instanceMatrix.needsUpdate = true;

    const colorAttr = mesh.geometry.getAttribute('instanceColor');
    if (colorAttr) {
      (colorAttr.array as Float32Array).set(_colors.subarray(0, count * 3));
      colorAttr.needsUpdate = true;
    }
  });

  if (nodes.length === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[NODE_GEOMETRY, NODE_MATERIAL, MAX_NODES]}
      frustumCulled={false}
    >
      <instancedBufferAttribute
        attach="geometry-attributes-instanceColor"
        args={[new Float32Array(MAX_NODES * 3), 3]}
      />
    </instancedMesh>
  );
});
