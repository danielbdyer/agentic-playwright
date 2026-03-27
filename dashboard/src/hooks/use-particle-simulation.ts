/**
 * useParticleSimulation — pure functional particle physics as a reusable hook.
 *
 * The simulation is a fold over time:
 *   next = step(current, delta, newSpawns)
 *
 * Performance optimizations:
 *   - Single-pass stepSimulation (no double filter)
 *   - Pre-allocated interpolation output (zero GC per particle per frame)
 *   - flatMap for spawn dedup (single pass, no intermediate Set spread)
 *   - Bounded spawn ID tracking with automatic eviction
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

// ─── Zero-allocation interpolation ───
// Reuse a single mutable tuple for position output.
// The caller reads it immediately before the next call overwrites it.
// This eliminates one [number,number,number] allocation per particle per frame.

const _pos: [number, number, number] = [0, 0, 0];

/** Interpolate position along eased arc. Writes to shared buffer.
 *  Caller must consume the result before the next call. */
export const interpolatePosition = (
  p: Particle,
  easing: (t: number) => number,
  arcHeight: (t: number) => number,
): readonly [number, number, number] => {
  const t = easing(p.life);
  _pos[0] = p.origin[0] + (p.target[0] - p.origin[0]) * t;
  _pos[1] = p.origin[1] + (p.target[1] - p.origin[1]) * t + arcHeight(t);
  _pos[2] = p.origin[2] + (p.target[2] - p.origin[2]) * t;
  return _pos;
};

/** Single-pass simulation step. Pure fold: (particles, delta, spawns) → { alive, died }.
 *  Avoids double-filter by partitioning in one loop. */
export const stepSimulation = (
  particles: readonly Particle[],
  delta: number,
  speed: number,
  spawns: readonly Particle[],
  max: number,
): { readonly alive: readonly Particle[]; readonly died: readonly Particle[] } => {
  const alive: Particle[] = [];
  const died: Particle[] = [];
  const advance = advanceParticle(delta, speed);

  // Single pass: advance + partition
  for (let i = 0; i < particles.length; i++) {
    const p = advance(particles[i]!);
    (p.life < 1.0 ? alive : died).push(p);
  }

  // Append spawns, respecting max
  const remaining = max - alive.length;
  if (remaining > 0 && spawns.length > 0) {
    const take = Math.min(spawns.length, remaining);
    for (let i = 0; i < take; i++) alive.push(spawns[i]!);
  }

  return { alive, died };
};

// ─── Hook ───

/** Max tracked spawn IDs before eviction. Prevents unbounded Set growth. */
const MAX_TRACKED_IDS = 2000;

export function useParticleSimulation(physics: ParticlePhysics = defaultPhysics) {
  const particlesRef = useRef<readonly Particle[]>([]);
  const spawnedIdsRef = useRef<Set<string>>(new Set());

  const step = useCallback((delta: number, spawns: readonly Particle[]): {
    readonly current: readonly Particle[];
    readonly died: readonly Particle[];
  } => {
    const ids = spawnedIdsRef.current;

    // Filter to new spawns only. Single pass.
    const newSpawns = spawns.filter((s) => !ids.has(s.id));

    // Track new IDs
    for (let i = 0; i < newSpawns.length; i++) ids.add(newSpawns[i]!.id);

    // Evict oldest IDs if tracking set grows too large
    if (ids.size > MAX_TRACKED_IDS) {
      const iter = ids.values();
      const excess = ids.size - MAX_TRACKED_IDS;
      for (let i = 0; i < excess; i++) ids.delete(iter.next().value!);
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

  const reset = useCallback(() => {
    particlesRef.current = [];
    spawnedIdsRef.current = new Set();
  }, []);

  return { step, reset, physics };
}
