/**
 * DecisionBurst — particle burst animation triggered when a decision is made.
 *
 * Approved: green particles arc from element position through glass to knowledge space.
 * Skipped: red particles scatter outward from element position and fade.
 *
 * Semantic: green = knowledge crystallized. Red = deferred/rejected.
 * The burst is a visual closure for the decision loop — the human's agency
 * made visible as particle energy flowing into the system.
 *
 * Phase 6: Human-in-the-Loop Integration.
 */

import { useState, useEffect, useMemo, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DecisionResult } from '../types';
import {
  useParticleSimulation,
  interpolatePosition,
  type Particle,
  type ParticlePhysics,
} from '../hooks/use-particle-simulation';

// ─── Physics Presets ───

const APPROVE_PHYSICS: ParticlePhysics = {
  speed: 0.6,
  easing: (t) => t * t * (3 - 2 * t), // smoothstep
  arcHeight: (t) => Math.sin(t * Math.PI) * 0.4, // Higher arc for dramatic effect
  maxParticles: 60,
};

const SKIP_PHYSICS: ParticlePhysics = {
  speed: 1.2,
  easing: (t) => 1 - (1 - t) * (1 - t), // ease-out quadratic
  arcHeight: (t) => Math.sin(t * Math.PI) * 0.15,
  maxParticles: 40,
};

const APPROVE_COLOR: readonly [number, number, number] = [0.3, 1.0, 0.4];
const SKIP_COLOR: readonly [number, number, number] = [1.0, 0.3, 0.2];

// ─── Burst Spawn Factories (pure) ───

/** Generate burst particles from origin toward target. Pure. */
const createBurstParticles = (
  origin: readonly [number, number, number],
  result: DecisionResult,
  glassX: number,
  knowledgeX: number,
): readonly Particle[] => {
  const count = result === 'approved' ? 30 : 20;
  const color = result === 'approved' ? [...APPROVE_COLOR] : [...SKIP_COLOR];

  return Array.from({ length: count }, (_, i) => {
    const spread = (i / count - 0.5) * 1.5;
    const target: [number, number, number] = result === 'approved'
      ? [knowledgeX, origin[1] + spread * 0.3, Math.random() * 0.1] // Arc through glass to knowledge
      : [origin[0] + spread, origin[1] + (Math.random() - 0.5) * 0.8, origin[2] - 0.3]; // Scatter outward

    return {
      id: `burst-${i}-${Date.now()}`,
      origin: [...origin] as [number, number, number],
      target,
      color: color as [number, number, number],
      life: 0,
    };
  });
};

// ─── Shaders ───

const VERTEX = `
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mix(10.0, 1.0, aLife) * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = `
  varying float vLife;
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.1, dist) * (1.0 - vLife * 0.8);
    gl_FragColor = vec4(vColor * 2.5, alpha);
  }
`;

// ─── Component ───

interface DecisionBurstProps {
  readonly origin: readonly [number, number, number];
  readonly result: DecisionResult;
  readonly glassX: number;
  readonly knowledgeX: number;
  readonly onComplete?: () => void;
}

export const DecisionBurst = memo(function DecisionBurst({
  origin,
  result,
  glassX,
  knowledgeX,
  onComplete,
}: DecisionBurstProps) {
  const physics = result === 'approved' ? APPROVE_PHYSICS : SKIP_PHYSICS;
  const { step } = useParticleSimulation(physics);
  const [spawned, setSpawned] = useState(false);
  const [done, setDone] = useState(false);

  // Generate burst particles once on mount
  const burstParticles = useMemo(
    () => createBurstParticles(origin, result, glassX, knowledgeX),
    [origin, result, glassX, knowledgeX],
  );

  const { geometry, material } = useMemo(() => {
    const max = physics.maxParticles;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(max), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
  }, [physics.maxParticles]);

  useFrame((_, delta) => {
    if (done) return;

    // Inject burst particles on first frame only
    const spawns = !spawned ? burstParticles : [];
    if (!spawned) setSpawned(true);

    const { current } = step(delta, spawns);

    // Burst is complete when all particles have died
    if (spawned && current.length === 0) {
      setDone(true);
      onComplete?.();
      return;
    }

    // Write to GPU buffers
    const max = physics.maxParticles;
    const posArr = (geometry.attributes.position!).array as Float32Array;
    const lifeArr = (geometry.attributes.aLife!).array as Float32Array;
    const colorArr = (geometry.attributes.aColor!).array as Float32Array;
    const count = Math.min(current.length, max);

    for (let i = 0; i < count; i++) {
      const p = current[i]!;
      const pos = interpolatePosition(p, physics.easing, physics.arcHeight);
      const i3 = i * 3;
      posArr[i3] = pos[0]; posArr[i3 + 1] = pos[1]; posArr[i3 + 2] = pos[2];
      lifeArr[i] = p.life;
      colorArr[i3] = p.color[0]; colorArr[i3 + 1] = p.color[1]; colorArr[i3 + 2] = p.color[2];
    }

    geometry.attributes.position!.needsUpdate = true;
    geometry.attributes.aLife!.needsUpdate = true;
    geometry.attributes.aColor!.needsUpdate = true;
    geometry.setDrawRange(0, count);
  });

  if (done) return null;
  return <points geometry={geometry} material={material} />;
});
