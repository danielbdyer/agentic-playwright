/**
 * Particle Transport — animated flow from DOM positions to knowledge observatory.
 *
 * When an element is discovered, a luminous particle spawns at its DOM position
 * and arcs toward the observatory, carrying confidence as color intensity.
 *
 * Architecture:
 *   - Points system for GPU-parallel rendering
 *   - Custom vertex/fragment shaders for trail fade and color
 *   - Delegates physics to useParticleSimulation hook (pure fold over time)
 *   - No .push(), no mutation — pure functional particle physics
 */

import { useMemo, memo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProbeEvent, ViewportDimensions } from './types';
import { domToWorld, confidenceToColor } from './types';
import {
  useParticleSimulation,
  interpolatePosition,
  type Particle,
  type ParticlePhysics,
} from '../hooks/use-particle-simulation';

// ─── Pure Factories ───

/** Create a particle from a probe event. Pure factory. */
const probeToParticle = (
  probe: ProbeEvent,
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
  targetX: number,
): Particle | null => {
  if (!probe.boundingBox) return null;
  const world = domToWorld(probe.boundingBox, viewport, planeWidth, planeHeight);
  return {
    id: probe.id,
    origin: [world.x, world.y, world.z],
    target: [targetX, world.y * 0.5, 0],
    color: confidenceToColor(probe.confidence),
    life: 0,
  };
};

/** Map probes to particles, filtering nulls. Pure. */
const probesToParticles = (
  probes: readonly ProbeEvent[],
  viewport: ViewportDimensions,
  planeWidth: number,
  planeHeight: number,
  targetX: number,
): readonly Particle[] =>
  probes.flatMap((p) => {
    const particle = probeToParticle(p, viewport, planeWidth, planeHeight, targetX);
    return particle ? [particle] : [];
  });

// ─── Shaders ───

const VERTEX_SHADER = `
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;

  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mix(8.0, 2.0, aLife) * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = `
  varying float vLife;
  varying vec3 vColor;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.15, dist) * (1.0 - vLife);
    gl_FragColor = vec4(vColor * 2.0, alpha);
  }
`;

// ─── Component ───

interface ParticleTransportProps {
  readonly sources: readonly ProbeEvent[];
  readonly viewport: ViewportDimensions;
  readonly planeWidth: number;
  readonly planeHeight: number;
  readonly targetX: number;
  readonly physics?: ParticlePhysics;
  readonly onArrived?: (probeId: string) => void;
}

/** Write particle state to GPU buffers. Imperative (required by Three.js). */
const writeToBuffers = (
  particles: readonly Particle[],
  geometry: THREE.BufferGeometry,
  physics: ParticlePhysics,
  max: number,
): void => {
  const posAttr = geometry.attributes.position!;
  const lifeAttr = geometry.attributes.aLife!;
  const colorAttr = geometry.attributes.aColor!;
  const posArr = posAttr.array as Float32Array;
  const lifeArr = lifeAttr.array as Float32Array;
  const colorArr = colorAttr.array as Float32Array;

  particles.forEach((p, i) => {
    if (i >= max) return;
    const [x, y, z] = interpolatePosition(p, physics.easing, physics.arcHeight);
    posArr[i * 3] = x;
    posArr[i * 3 + 1] = y;
    posArr[i * 3 + 2] = z;
    lifeArr[i] = p.life;
    colorArr[i * 3] = p.color[0];
    colorArr[i * 3 + 1] = p.color[1];
    colorArr[i * 3 + 2] = p.color[2];
  });

  posAttr.needsUpdate = true;
  lifeAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  geometry.setDrawRange(0, Math.min(particles.length, max));
};

export const ParticleTransport = memo(function ParticleTransport({
  sources,
  viewport,
  planeWidth,
  planeHeight,
  targetX,
  physics: customPhysics,
  onArrived,
}: ParticleTransportProps) {
  const { step, physics } = useParticleSimulation(customPhysics);

  const { geometry, material } = useMemo(() => {
    const max = physics.maxParticles;
    const positions = new Float32Array(max * 3);
    const lifes = new Float32Array(max);
    const colors = new Float32Array(max * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [physics.maxParticles]);

  // Stable spawn factory
  const buildSpawns = useCallback(
    () => probesToParticles(sources, viewport, planeWidth, planeHeight, targetX),
    [sources, viewport, planeWidth, planeHeight, targetX],
  );

  useFrame((_, delta) => {
    const spawns = buildSpawns();
    const { current, died } = step(delta, spawns);

    // Fire arrival callbacks for particles that completed their journey
    died.forEach((p) => onArrived?.(p.id));

    // Write to GPU buffers (the only imperative part — required by Three.js)
    writeToBuffers(current, geometry, physics, physics.maxParticles);
  });

  return <points geometry={geometry} material={material} />;
});
