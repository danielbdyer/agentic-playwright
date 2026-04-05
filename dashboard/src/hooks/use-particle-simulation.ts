/**
 * useParticleSimulation — pure functional particle physics as a reusable hook.
 *
 * The simulation is a fold over time:
 *   next = step(current, delta, newSpawns)
 *
 * Complexity:
 *   advanceParticle:     O(1) — pure struct copy with life increment
 *   isAlive:             O(1) — predicate on life field
 *   interpolatePosition: O(1) — writes to shared mutable buffer (see safety contract below)
 *   stepSimulation:      O(n) — single-pass advance + partition, n = particle count
 *   spawn dedup:         O(m) — filter new spawns, m = spawn count. Set.has is O(1) amortized.
 *   ID eviction:         O(excess) — linear deletion of oldest IDs when Set > MAX_TRACKED_IDS
 *
 * Performance:
 *   - Single-pass stepSimulation (no double filter)
 *   - Pre-allocated interpolation output (zero GC per particle per frame)
 *   - Bounded spawn ID tracking with automatic eviction (max 2000)
 *
 * Intentional mutation:
 *   - `alive.push()` / `died.push()` in stepSimulation hot path — avoids spread in O(n) loop.
 *     These arrays are freshly created each call and returned as readonly.
 *   - `_pos` shared buffer — zero-allocation optimization. See safety contract.
 */

import { useRef } from 'react';

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

/** O(1). Advance a particle by delta. Pure — returns new Particle. */
export const advanceParticle = (delta: number, speed: number) =>
  (p: Particle): Particle => ({ ...p, life: p.life + delta * speed });

/** O(1). Alive predicate. Pure. */
export const isAlive = (p: Particle): boolean => p.life < 1.0;

// ─── Zero-allocation interpolation ───
// Safety contract: writes to a single shared mutable tuple `_pos`.
// The caller MUST consume the returned reference immediately before
// the next call overwrites it. This eliminates one [number,number,number]
// allocation per particle per frame (~500 allocations/frame at 60fps).

const _pos: [number, number, number] = [0, 0, 0];

/** O(1). Interpolate position along eased arc. Writes to shared `_pos` buffer.
 *  Caller must consume result before next call (shared mutable reference). */
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

/** O(n). Single-pass simulation step. Pure fold: (particles, delta, spawns) → { alive, died }.
 *  Uses push() on freshly created arrays for hot-path performance (not mutation of inputs). */
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

  // Single pass: advance + partition (no double filter)
  for (let i = 0; i < particles.length; i++) {
    const p = advance(particles[i]!);
    (p.life < 1.0 ? alive : died).push(p);
  }

  // Append spawns, respecting max capacity
  const remaining = max - alive.length;
  if (remaining > 0 && spawns.length > 0) {
    const take = Math.min(spawns.length, remaining);
    for (let i = 0; i < take; i++) alive.push(spawns[i]!);
  }

  return { alive, died };
};

// ─── Hook ───

/** Max tracked spawn IDs before eviction. Prevents unbounded Set growth.
 *  Eviction is O(excess) where excess = size - MAX_TRACKED_IDS. */
const MAX_TRACKED_IDS = 2000;

export function useParticleSimulation(physics: ParticlePhysics = defaultPhysics) {
  const particlesRef = useRef<readonly Particle[]>([]);
  const spawnedIdsRef = useRef<Set<string>>(new Set());

  /** O(n + m). Steps the simulation forward by delta, ingesting new spawns.
   *  n = current particle count, m = new spawn count. */
  const step = (delta: number, spawns: readonly Particle[]): {
    readonly current: readonly Particle[];
    readonly died: readonly Particle[];
  } => {
    const ids = spawnedIdsRef.current;

    // O(m). Filter to new spawns only. Set.has is O(1) amortized.
    const newSpawns = spawns.filter((s) => !ids.has(s.id));

    // O(m). Track new IDs. Set.add is O(1) amortized.
    for (let i = 0; i < newSpawns.length; i++) ids.add(newSpawns[i]!.id);

    // O(excess). Evict oldest IDs if tracking set grows too large.
    if (ids.size > MAX_TRACKED_IDS) {
      const iter = ids.values();
      const excess = ids.size - MAX_TRACKED_IDS;
      for (let i = 0; i < excess; i++) ids.delete(iter.next().value!);
    }

    const { alive, died } = stepSimulation(
      particlesRef.current, delta, physics.speed, newSpawns, physics.maxParticles,
    );
    particlesRef.current = alive;
    return { current: alive, died };
  };

  const reset = () => {
    particlesRef.current = [];
    spawnedIdsRef.current = new Set();
  };

  return { step, reset, physics } as const;
}
