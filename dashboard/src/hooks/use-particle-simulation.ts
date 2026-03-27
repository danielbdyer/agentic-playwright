/**
 * useParticleSimulation — pure functional particle physics as a reusable hook.
 *
 * The simulation is a fold over time:
 *   next = step(current, delta, newSpawns)
 *        = current.map(advance).filter(alive).concat(spawns)
 *
 * No .push(), no mutation of particle state. Each frame produces a new
 * immutable array. The only imperative part is writing to GPU buffers
 * (required by Three.js BufferGeometry).
 *
 * Configurable via ParticlePhysics: speed, easing, arc shape.
 * Reusable for any particle system (glows, trails, bursts, confetti).
 */

import { useRef, useCallback } from 'react';

// ─── Pure Particle Domain ───

export interface Particle {
  readonly id: string;
  readonly origin: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  readonly life: number;
}

export interface ParticlePhysics {
  readonly speed: number;
  readonly easing: (t: number) => number;
  readonly arcHeight: (t: number) => number;
  readonly maxParticles: number;
}

/** Default physics: cubic ease, sine arc, 500 max. */
export const defaultPhysics: ParticlePhysics = {
  speed: 0.8,
  easing: (t) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  arcHeight: (t) => Math.sin(t * Math.PI) * 0.3,
  maxParticles: 500,
};

/** Advance a particle by delta. Pure. */
export const advanceParticle = (delta: number, speed: number) =>
  (p: Particle): Particle => ({ ...p, life: p.life + delta * speed });

/** Alive predicate. Pure. */
export const isAlive = (p: Particle): boolean => p.life < 1.0;

/** Interpolate position along eased arc. Pure. */
export const interpolatePosition = (
  p: Particle,
  easing: (t: number) => number,
  arcHeight: (t: number) => number,
): readonly [number, number, number] => {
  const t = easing(p.life);
  return [
    p.origin[0] + (p.target[0] - p.origin[0]) * t,
    p.origin[1] + (p.target[1] - p.origin[1]) * t + arcHeight(t),
    p.origin[2] + (p.target[2] - p.origin[2]) * t,
  ];
};

/** One simulation step. Pure fold: (particles, delta, spawns) → { alive, died }. */
export const stepSimulation = (
  particles: readonly Particle[],
  delta: number,
  speed: number,
  spawns: readonly Particle[],
  max: number,
): { readonly alive: readonly Particle[]; readonly died: readonly Particle[] } => {
  const advanced = particles.map(advanceParticle(delta, speed));
  return {
    alive: [...advanced.filter(isAlive), ...spawns].slice(0, max),
    died: advanced.filter((p) => !isAlive(p)),
  };
};

// ─── Hook ───

/** Reusable particle simulation hook.
 *  Returns the current particle state and a step function.
 *  Call step() in useFrame to advance the simulation. */
export function useParticleSimulation(physics: ParticlePhysics = defaultPhysics) {
  const particlesRef = useRef<readonly Particle[]>([]);
  const spawnedIdsRef = useRef<ReadonlySet<string>>(new Set());

  /** Step the simulation forward by delta seconds with new spawns.
   *  Returns the set of particles that died this frame (for callbacks). */
  const step = useCallback((delta: number, spawns: readonly Particle[]): {
    readonly current: readonly Particle[];
    readonly died: readonly Particle[];
  } => {
    // Filter spawns to only new IDs
    const newSpawns = spawns.filter((s) => !spawnedIdsRef.current.has(s.id));
    if (newSpawns.length > 0) {
      spawnedIdsRef.current = new Set([...spawnedIdsRef.current, ...newSpawns.map((s) => s.id)]);
    }

    const { alive, died } = stepSimulation(
      particlesRef.current,
      delta,
      physics.speed,
      newSpawns,
      physics.maxParticles,
    );
    particlesRef.current = alive;
    return { current: alive, died };
  }, [physics.speed, physics.maxParticles]);

  /** Reset the simulation. */
  const reset = useCallback(() => {
    particlesRef.current = [];
    spawnedIdsRef.current = new Set();
  }, []);

  return { step, reset, physics };
}
