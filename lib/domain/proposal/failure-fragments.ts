/**
 * FailureFragments — pure domain module for failure particle physics.
 *
 * When a step resolution fails (Act 5), the resolution rings shatter into
 * fragments that scatter radially, then drift toward the glass pane under
 * attraction forces. Near the glass boundary, fragments coalesce into
 * proposal clusters (Act 6 handoff).
 *
 * Physics model:
 *   1. Shatter — rings break into 5-8 fragments with radial velocity
 *   2. Gravity — slight downward pull (y-axis)
 *   3. Drag — velocity decays exponentially
 *   4. Glass attraction — fragments beyond threshold are pulled toward glass x-position
 *   5. Coalesce — fragments within proximity merge into proposal clusters
 *
 * All physics is discrete-time stepped. Pure functions, no mutation.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 5), Part VIII
 */

// ─── Fragment Types ───

/** A single failure fragment particle. */
export interface FailureFragment {
  readonly id: string;
  readonly sourceElementId: string;
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly color: string;           // Inherited from failed rung
  readonly opacity: number;         // Fades over time
  readonly size: number;            // Shrinks over time
  readonly age: number;             // ms since creation
  readonly coalesced: boolean;      // True when merged into proposal
}

/** Configuration for fragment physics. */
export interface FragmentPhysicsConfig {
  readonly gravity: number;              // Downward acceleration (units/s²)
  readonly drag: number;                 // Velocity decay factor per step [0,1)
  readonly glassPaneX: number;           // X position of glass pane
  readonly attractionThreshold: number;  // Distance at which glass attraction begins
  readonly attractionStrength: number;   // Pull toward glass (units/s²)
  readonly coalesceRadius: number;       // Proximity for merging
  readonly fadeRate: number;             // Opacity decay per second
  readonly shrinkRate: number;           // Size decay per second
  readonly maxAge: number;               // Auto-remove after this many ms
}

/** Physics state for all fragments in the scene. */
export interface FragmentSystemState {
  readonly fragments: readonly FailureFragment[];
  readonly totalShattered: number;
  readonly totalCoalesced: number;
}

// ─── Constants ───

export const DEFAULT_PHYSICS: FragmentPhysicsConfig = {
  gravity: 0.3,
  drag: 0.95,
  glassPaneX: 0.1,
  attractionThreshold: 2.0,
  attractionStrength: 0.15,
  coalesceRadius: 0.15,
  fadeRate: 0.2,
  shrinkRate: 0.1,
  maxAge: 8000,
} as const;

export const INITIAL_FRAGMENT_STATE: FragmentSystemState = {
  fragments: [],
  totalShattered: 0,
  totalCoalesced: 0,
};

// ─── Fragment Generation ───

/**
 * Generate shatter fragments from a failed resolution.
 *
 * Creates 5-8 fragments (deterministic from elementId hash) with
 * random-looking but reproducible radial velocities.
 *
 * @param elementId - The element whose resolution failed
 * @param position - World position of the element
 * @param color - Color from the failed rung
 * @param fragmentCount - Number of fragments (5-8)
 * @returns Array of new fragments
 */
export function generateShatterFragments(
  elementId: string,
  position: readonly [number, number, number],
  color: string,
  fragmentCount: number = 6,
): readonly FailureFragment[] {
  const count = Math.max(3, Math.min(8, fragmentCount));
  const angleStep = (2 * Math.PI) / count;

  return Array.from({ length: count }, (_, i) => {
    // Deterministic "random" angle offset from element ID
    const hash = simpleHash(elementId + i);
    const angle = angleStep * i + (hash % 100) / 100 * angleStep * 0.5;
    const speed = 0.4 + (hash % 50) / 100; // 0.4 - 0.9 units/s

    return {
      id: `frag-${elementId}-${i}`,
      sourceElementId: elementId,
      position,
      velocity: [
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.8 + 0.2, // Slight upward bias
        (hash % 30 - 15) / 100, // Small z scatter
      ] as const,
      color,
      opacity: 1.0,
      size: 0.03 + (hash % 20) / 1000,
      age: 0,
      coalesced: false,
    };
  });
}

// ─── Physics Simulation ───

/**
 * Advance all fragments by one physics step.
 *
 * Pure function: takes state + deltaMs, returns new state.
 * Applies gravity, drag, glass attraction, fading, and coalescing.
 */
export function stepFragmentPhysics(
  state: FragmentSystemState,
  deltaMs: number,
  config: FragmentPhysicsConfig = DEFAULT_PHYSICS,
): FragmentSystemState {
  const dt = deltaMs / 1000; // Convert to seconds

  const stepped = state.fragments.map((frag) => {
    if (frag.coalesced) return frag;

    // Apply gravity
    const gravityVy = frag.velocity[1] - config.gravity * dt;

    // Apply drag
    const draggedVx = frag.velocity[0] * Math.pow(config.drag, dt * 60);
    const draggedVy = gravityVy * Math.pow(config.drag, dt * 60);
    const draggedVz = frag.velocity[2] * Math.pow(config.drag, dt * 60);

    // Glass pane attraction
    const distToGlass = Math.abs(frag.position[0] - config.glassPaneX);
    const attractionVx = distToGlass < config.attractionThreshold
      ? Math.sign(config.glassPaneX - frag.position[0]) * config.attractionStrength * dt
      : 0;

    // New velocity
    const vx = draggedVx + attractionVx;
    const vy = draggedVy;
    const vz = draggedVz;

    // New position
    const px = frag.position[0] + vx * dt;
    const py = frag.position[1] + vy * dt;
    const pz = frag.position[2] + vz * dt;

    // Fading and shrinking
    const newOpacity = Math.max(0, frag.opacity - config.fadeRate * dt);
    const newSize = Math.max(0.005, frag.size - config.shrinkRate * dt);

    return {
      ...frag,
      position: [px, py, pz] as const,
      velocity: [vx, vy, vz] as const,
      opacity: newOpacity,
      size: newSize,
      age: frag.age + deltaMs,
    };
  });

  // Remove expired and fully faded fragments
  const alive = stepped.filter(
    (f) => f.age < config.maxAge && f.opacity > 0.01 && !f.coalesced,
  );

  // Detect coalescing (fragments near glass pane)
  const { active, coalesced: newlyCoalesced } = detectCoalescing(alive, config);

  return {
    fragments: active,
    totalShattered: state.totalShattered,
    totalCoalesced: state.totalCoalesced + newlyCoalesced,
  };
}

/**
 * Add new shatter fragments to the system.
 */
export function addShatterEvent(
  state: FragmentSystemState,
  elementId: string,
  position: readonly [number, number, number],
  color: string,
  count: number = 6,
): FragmentSystemState {
  const newFragments = generateShatterFragments(elementId, position, color, count);
  return {
    fragments: [...state.fragments, ...newFragments],
    totalShattered: state.totalShattered + newFragments.length,
    totalCoalesced: state.totalCoalesced,
  };
}

// ─── Coalescing Detection ───

/**
 * Detect fragments that have reached the glass pane zone and should coalesce.
 */
function detectCoalescing(
  fragments: readonly FailureFragment[],
  config: FragmentPhysicsConfig,
): { readonly active: readonly FailureFragment[]; readonly coalesced: number } {
  const { active, coalesced } = fragments.reduce<{
    readonly active: readonly FailureFragment[];
    readonly coalesced: number;
  }>(
    (acc, frag) => {
      const distToGlass = Math.abs(frag.position[0] - config.glassPaneX);
      const shouldCoalesce = distToGlass < config.coalesceRadius && frag.age > 1000;
      return shouldCoalesce
        ? { active: acc.active, coalesced: acc.coalesced + 1 }
        : { active: [...acc.active, frag], coalesced: acc.coalesced };
    },
    { active: [], coalesced: 0 },
  );

  return { active, coalesced };
}

// ─── Utility ───

/** Simple deterministic hash from string → number. */
function simpleHash(str: string): number {
  return Math.abs(
    Array.from(str).reduce(
      (hash, ch) => ((hash << 5) - hash + ch.charCodeAt(0)) | 0,
      0,
    ),
  );
}

/**
 * Count active (non-coalesced) fragments.
 */
export function activeFragmentCount(state: FragmentSystemState): number {
  return state.fragments.filter((f) => !f.coalesced).length;
}

/**
 * Get fragments grouped by source element.
 */
export function fragmentsByElement(
  state: FragmentSystemState,
): ReadonlyMap<string, readonly FailureFragment[]> {
  return state.fragments.reduce<Map<string, FailureFragment[]>>(
    (map, frag) => {
      const existing = map.get(frag.sourceElementId);
      return map.set(frag.sourceElementId, existing ? [...existing, frag] : [frag]);
    },
    new Map(),
  );
}
