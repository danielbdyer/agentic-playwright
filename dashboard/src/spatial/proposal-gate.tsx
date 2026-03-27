/**
 * ProposalGate — particles splitting at the glass pane.
 *
 * Semantic: activated proposals (green) pass through glass and arc toward
 * knowledge space. Blocked proposals (red) reflect and fade backward.
 *
 * Reuses the existing useParticleSimulation hook with different spawn
 * factories and physics. Same GLSL shaders as ParticleTransport.
 * Zero-allocation GPU rendering via shared buffers.
 */

import { useMemo, memo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ProposalActivatedEvent } from './types';
import {
  useParticleSimulation,
  interpolatePosition,
  type Particle,
  type ParticlePhysics,
} from '../hooks/use-particle-simulation';

// ─── Pure Factories ───

const ACTIVATED_COLOR: readonly [number, number, number] = [0.2, 0.9, 0.3];
const BLOCKED_COLOR: readonly [number, number, number] = [0.9, 0.2, 0.2];

const proposalToParticle = (
  event: ProposalActivatedEvent,
  glassX: number,
  targetX: number,
): Particle => ({
  id: event.proposalId,
  origin: [glassX, (Math.random() - 0.5) * 1.8, 0.05],
  target: event.status === 'activated'
    ? [targetX, (Math.random() - 0.5) * 0.8, 0]
    : [glassX - 1.0, (Math.random() - 0.5) * 1.0, 0.1],
  color: event.status === 'activated' ? [...ACTIVATED_COLOR] : [...BLOCKED_COLOR],
  life: 0,
});

const GATE_PHYSICS: ParticlePhysics = {
  speed: 0.4,
  easing: (t) => t * t * (3 - 2 * t), // smoothstep
  arcHeight: (t) => Math.sin(t * Math.PI) * 0.15,
  maxParticles: 200,
};

// ─── Shaders (same as ParticleTransport) ───

const VERTEX = `
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = mix(6.0, 1.5, aLife) * (200.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT = `
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

interface ProposalGateProps {
  readonly events: readonly ProposalActivatedEvent[];
  readonly glassX: number;
  readonly targetX: number;
}

export const ProposalGate = memo(function ProposalGate({ events, glassX, targetX }: ProposalGateProps) {
  const { step, physics } = useParticleSimulation(GATE_PHYSICS);

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

  const buildSpawns = useCallback(
    () => events.map((e) => proposalToParticle(e, glassX, targetX)),
    [events, glassX, targetX],
  );

  useFrame((_, delta) => {
    const spawns = buildSpawns();
    const { current } = step(delta, spawns);
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

  return <points geometry={geometry} material={material} />;
});
