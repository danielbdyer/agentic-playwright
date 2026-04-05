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

import { memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProbeEvent, ViewportDimensions } from './types';
import { domToWorld, actorToColor } from './types';
import {
  useParticleSimulation,
  interpolatePosition,
  type Particle,
  type ParticlePhysics,
} from '../hooks/use-particle-simulation';

// ─── Pure Factories ───

/** Blend actor hue with confidence brightness. Pure.
 *  Actor provides the base hue (cyan/magenta/gold), confidence scales intensity. */
const probeColor = (probe: ProbeEvent): [number, number, number] => {
  const [r, g, b] = actorToColor(probe.actor);
  const brightness = 0.4 + probe.confidence * 0.6;
  return [r * brightness, g * brightness, b * brightness];
};

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
    color: probeColor(probe),
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

/** Write particle state to GPU buffers. Imperative (required by Three.js).
 *  Uses for-loop (no closure allocation) and shared interpolation buffer. */
const writeToBuffers = (
  particles: readonly Particle[],
  geometry: THREE.BufferGeometry,
  physics: ParticlePhysics,
  max: number,
): void => {
  const posArr = (geometry.attributes.position!).array as Float32Array;
  const lifeArr = (geometry.attributes.aLife!).array as Float32Array;
  const colorArr = (geometry.attributes.aColor!).array as Float32Array;
  const count = Math.min(particles.length, max);
  const { easing, arcHeight } = physics;

  for (let i = 0; i < count; i++) {
    const p = particles[i]!;
    // interpolatePosition writes to shared _pos buffer — read immediately
    const pos = interpolatePosition(p, easing, arcHeight);
    const i3 = i * 3;
    posArr[i3] = pos[0];
    posArr[i3 + 1] = pos[1];
    posArr[i3 + 2] = pos[2];
    lifeArr[i] = p.life;
    colorArr[i3] = p.color[0];
    colorArr[i3 + 1] = p.color[1];
    colorArr[i3 + 2] = p.color[2];
  }

  geometry.attributes.position!.needsUpdate = true;
  geometry.attributes.aLife!.needsUpdate = true;
  geometry.attributes.aColor!.needsUpdate = true;
  geometry.setDrawRange(0, count);
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

  const max = physics.maxParticles;
  const positions = new Float32Array(max * 3);
  const lifes = new Float32Array(max);
  const colors = new Float32Array(max * 3);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(lifes, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const geometry = geo;

  // Spawn factory
  const buildSpawns =
    () => probesToParticles(sources, viewport, planeWidth, planeHeight, targetX);

  useFrame((_, delta) => {
    const spawns = buildSpawns();
    const { current, died } = step(delta, spawns);

    // Fire arrival callbacks for particles that completed their journey
    if (onArrived && died.length > 0) {
      for (let i = 0; i < died.length; i++) onArrived(died[i]!.id);
    }

    // Write to GPU buffers (the only imperative part — required by Three.js)
    writeToBuffers(current, geometry, physics, physics.maxParticles);
  });

  return <points geometry={geometry} material={material} />;
});
