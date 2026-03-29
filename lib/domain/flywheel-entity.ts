/**
 * FlywheelEntity — unified particle type with act-specific visual properties.
 *
 * Solves Part X Challenge 1: "Seven Visual Languages in One Scene".
 *
 * Every visible element in the flywheel visualization is a FlywheelEntity
 * with phase-dependent properties. This allows a single InstancedMesh
 * rendering pipeline to handle all visual elements across all 7 acts,
 * with act-specific appearance controlled by pure computed properties.
 *
 * Entity types:
 *   - scenario-card     (Acts 1, 3)
 *   - surface-overlay    (Act 2)
 *   - probe-particle     (Acts 2, 5)
 *   - selector-glow      (Acts 2, 4, 5)
 *   - step-overlay       (Act 4)
 *   - resolution-ring    (Act 5)
 *   - failure-fragment   (Acts 5, 6)
 *   - proposal-cluster   (Act 6)
 *   - knowledge-node     (Acts 2-7)
 *   - transport-particle (Acts 2-7)
 *   - convergence-wave   (Act 7)
 *   - scorecard-element  (Act 7)
 *
 * Each entity type has:
 *   - Base visual properties (color, size, opacity, pulse frequency)
 *   - Act-specific overrides (e.g., "first discovery" tentative vs confirmed)
 *   - Phase-within-act modifiers (entering, active, exiting)
 *
 * The system maintains a SeenElements set to distinguish first-time
 * discovery (tentative: wider glow, lower intensity, blue-white shift)
 * from confirmed elements (focused glow, full intensity, actor color).
 *
 * Pure domain logic. No React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part X Challenge 1, Part X Challenge 4
 */

import type { FlywheelAct } from './scene-state-accumulator';

// ─── Entity Types ───

export type EntityType =
  | 'scenario-card'
  | 'surface-overlay'
  | 'probe-particle'
  | 'selector-glow'
  | 'step-overlay'
  | 'resolution-ring'
  | 'failure-fragment'
  | 'proposal-cluster'
  | 'knowledge-node'
  | 'transport-particle'
  | 'convergence-wave'
  | 'scorecard-element';

/** Entity lifecycle phase within the current act. */
export type EntityPhase = 'entering' | 'active' | 'exiting' | 'hidden';

/** Actor identity for color mapping. */
export type EntityActor = 'system' | 'agent' | 'operator';

// ─── Visual Properties ───

/** Complete computed visual properties for one entity. */
export interface EntityVisualProperties {
  readonly color: readonly [number, number, number]; // RGB [0-1]
  readonly opacity: number;          // [0, 1]
  readonly scale: number;            // Relative size multiplier
  readonly glowRadius: number;       // World units
  readonly glowIntensity: number;    // [0, 1]
  readonly pulseFrequency: number;   // Hz
  readonly pulseAmplitude: number;   // [0, 1] — amount of brightness variation
  readonly trailLength: number;      // Number of trail particles (0 = no trail)
  readonly trailDecay: number;       // [0, 1] — how fast trail fades
}

/** A single FlywheelEntity instance. */
export interface FlywheelEntity {
  readonly id: string;
  readonly type: EntityType;
  readonly phase: EntityPhase;
  readonly position: readonly [number, number, number];
  readonly visual: EntityVisualProperties;
  readonly metadata: EntityMetadata;
}

/** Entity-specific metadata for contextual rendering. */
export interface EntityMetadata {
  readonly screen?: string;
  readonly element?: string;
  readonly actor?: EntityActor;
  readonly confidence?: number;
  readonly governance?: string;
  readonly firstEncounter?: boolean; // True if this is the first time seeing this entity
}

// ─── Base Visual Profiles ───

/** Default visual properties per entity type. */
const BASE_PROFILES: Readonly<Record<EntityType, EntityVisualProperties>> = {
  'scenario-card': {
    color: [0.4, 0.4, 0.6],
    opacity: 0.8,
    scale: 1.0,
    glowRadius: 0.02,
    glowIntensity: 0.3,
    pulseFrequency: 0.5,
    pulseAmplitude: 0.1,
    trailLength: 0,
    trailDecay: 0,
  },
  'surface-overlay': {
    color: [0.1, 0.7, 0.9],
    opacity: 0.5,
    scale: 1.0,
    glowRadius: 0.05,
    glowIntensity: 0.4,
    pulseFrequency: 0.3,
    pulseAmplitude: 0.15,
    trailLength: 0,
    trailDecay: 0,
  },
  'probe-particle': {
    color: [0.2, 0.8, 0.9],
    opacity: 0.9,
    scale: 0.3,
    glowRadius: 0.01,
    glowIntensity: 0.6,
    pulseFrequency: 2.0,
    pulseAmplitude: 0.3,
    trailLength: 5,
    trailDecay: 0.7,
  },
  'selector-glow': {
    color: [0.1, 0.9, 0.7],
    opacity: 0.7,
    scale: 1.0,
    glowRadius: 0.03,
    glowIntensity: 0.5,
    pulseFrequency: 1.0,
    pulseAmplitude: 0.2,
    trailLength: 0,
    trailDecay: 0,
  },
  'step-overlay': {
    color: [0.2, 0.8, 0.3],
    opacity: 0.6,
    scale: 1.0,
    glowRadius: 0.02,
    glowIntensity: 0.3,
    pulseFrequency: 0,
    pulseAmplitude: 0,
    trailLength: 0,
    trailDecay: 0,
  },
  'resolution-ring': {
    color: [0.5, 0.8, 0.5],
    opacity: 0.6,
    scale: 1.0,
    glowRadius: 0.015,
    glowIntensity: 0.4,
    pulseFrequency: 0.5,
    pulseAmplitude: 0.1,
    trailLength: 0,
    trailDecay: 0,
  },
  'failure-fragment': {
    color: [0.9, 0.2, 0.2],
    opacity: 0.8,
    scale: 0.4,
    glowRadius: 0.01,
    glowIntensity: 0.7,
    pulseFrequency: 4.0,
    pulseAmplitude: 0.5,
    trailLength: 3,
    trailDecay: 0.9,
  },
  'proposal-cluster': {
    color: [0.6, 0.3, 0.9],
    opacity: 0.7,
    scale: 0.8,
    glowRadius: 0.025,
    glowIntensity: 0.5,
    pulseFrequency: 0.8,
    pulseAmplitude: 0.2,
    trailLength: 2,
    trailDecay: 0.6,
  },
  'knowledge-node': {
    color: [0.2, 0.7, 0.4],
    opacity: 0.9,
    scale: 1.0,
    glowRadius: 0.02,
    glowIntensity: 0.6,
    pulseFrequency: 0.3,
    pulseAmplitude: 0.15,
    trailLength: 0,
    trailDecay: 0,
  },
  'transport-particle': {
    color: [0.3, 0.9, 0.7],
    opacity: 0.8,
    scale: 0.2,
    glowRadius: 0.008,
    glowIntensity: 0.7,
    pulseFrequency: 1.5,
    pulseAmplitude: 0.25,
    trailLength: 8,
    trailDecay: 0.8,
  },
  'convergence-wave': {
    color: [0.1, 0.9, 0.3],
    opacity: 0.6,
    scale: 2.0,
    glowRadius: 0.1,
    glowIntensity: 0.8,
    pulseFrequency: 0.2,
    pulseAmplitude: 0.4,
    trailLength: 0,
    trailDecay: 0,
  },
  'scorecard-element': {
    color: [0.3, 0.5, 0.9],
    opacity: 0.9,
    scale: 1.0,
    glowRadius: 0.01,
    glowIntensity: 0.3,
    pulseFrequency: 0,
    pulseAmplitude: 0,
    trailLength: 0,
    trailDecay: 0,
  },
};

// ─── Actor Colors ───

const ACTOR_COLORS: Readonly<Record<EntityActor, readonly [number, number, number]>> = {
  system:   [0.1, 0.8, 0.9],  // Cyan
  agent:    [0.8, 0.2, 0.8],  // Magenta
  operator: [0.9, 0.7, 0.1],  // Gold
};

// ─── First-Encounter Modifiers ───

/** Visual modifiers for first-time discovery (tentative visual language). */
const FIRST_ENCOUNTER_MODIFIERS: Partial<EntityVisualProperties> = {
  glowRadius: 0.05,        // Wider glow
  glowIntensity: 0.3,      // Lower intensity
  color: [0.3, 0.6, 0.95], // Blue-white shift
  pulseFrequency: 0.3,     // Slower pulse
  trailLength: 2,          // Fewer particles
};

/** Visual modifiers for confirmed elements (seen before). */
const CONFIRMED_MODIFIERS: Partial<EntityVisualProperties> = {
  glowRadius: 0.02,        // Focused glow
  glowIntensity: 0.7,      // Full intensity
  pulseFrequency: 1.0,     // Normal pulse
};

// ─── Computed Properties ───

/**
 * Compute the visual properties for an entity given its context.
 *
 * This is the core function that resolves the "seven visual languages"
 * challenge. It composes:
 *   1. Base profile for the entity type
 *   2. Actor color blend (if applicable)
 *   3. First-encounter vs confirmed modifiers
 *   4. Confidence scaling
 *   5. Phase modifiers (entering/exiting fade)
 *
 * Pure function. O(1).
 *
 * @param type Entity type
 * @param phase Lifecycle phase
 * @param metadata Context including actor, confidence, first-encounter
 * @returns Computed visual properties
 */
export function computeEntityVisuals(
  type: EntityType,
  phase: EntityPhase,
  metadata: EntityMetadata,
): EntityVisualProperties {
  // 1. Start with base profile
  const base = BASE_PROFILES[type];

  // 2. Apply actor color blend
  const actorColor = metadata.actor ? ACTOR_COLORS[metadata.actor] : null;
  const color: readonly [number, number, number] = actorColor
    ? blendColors(base.color, actorColor, 0.6)
    : base.color;

  // 3. Apply first-encounter modifiers
  const encounterMods = metadata.firstEncounter === true
    ? FIRST_ENCOUNTER_MODIFIERS
    : metadata.firstEncounter === false
      ? CONFIRMED_MODIFIERS
      : {};

  // 4. Confidence scaling
  const confidenceScale = metadata.confidence !== undefined
    ? 0.5 + metadata.confidence * 0.5
    : 1.0;

  // 5. Phase modifiers
  const phaseMods = phaseModifiers(phase);

  return {
    color: encounterMods.color ?? color,
    opacity: (base.opacity * phaseMods.opacityMultiplier * confidenceScale),
    scale: base.scale * phaseMods.scaleMultiplier,
    glowRadius: encounterMods.glowRadius ?? base.glowRadius,
    glowIntensity: (encounterMods.glowIntensity ?? base.glowIntensity) * confidenceScale,
    pulseFrequency: encounterMods.pulseFrequency ?? base.pulseFrequency,
    pulseAmplitude: base.pulseAmplitude,
    trailLength: encounterMods.trailLength ?? base.trailLength,
    trailDecay: base.trailDecay,
  };
}

/** Phase-specific multipliers for fade-in/out effects. */
function phaseModifiers(phase: EntityPhase): { readonly opacityMultiplier: number; readonly scaleMultiplier: number } {
  switch (phase) {
    case 'entering':  return { opacityMultiplier: 0.5,  scaleMultiplier: 0.7 };
    case 'active':    return { opacityMultiplier: 1.0,  scaleMultiplier: 1.0 };
    case 'exiting':   return { opacityMultiplier: 0.3,  scaleMultiplier: 0.9 };
    case 'hidden':    return { opacityMultiplier: 0.0,  scaleMultiplier: 0.0 };
  }
}

/**
 * Determine which entity types are active in a given act.
 * Used for culling — only active types get rendered.
 *
 * @param act Current flywheel act
 * @returns Set of entity types that should be visible
 */
export function activeEntityTypes(act: FlywheelAct): ReadonlySet<EntityType> {
  const types: EntityType[] = ['knowledge-node', 'transport-particle']; // Always visible (2-7)

  switch (act) {
    case 1:
      return new Set(['scenario-card']);
    case 2:
      return new Set([...types, 'surface-overlay', 'probe-particle', 'selector-glow']);
    case 3:
      return new Set([...types, 'scenario-card']);
    case 4:
      return new Set([...types, 'step-overlay', 'selector-glow']);
    case 5:
      return new Set([...types, 'probe-particle', 'selector-glow', 'resolution-ring', 'failure-fragment']);
    case 6:
      return new Set([...types, 'proposal-cluster', 'failure-fragment']);
    case 7:
      return new Set([...types, 'convergence-wave', 'scorecard-element']);
  }
}

/**
 * Get the pool size for each entity type.
 * Used for InstancedMesh pre-allocation.
 *
 * @param type Entity type
 * @returns Maximum number of instances for this type
 */
export function entityPoolSize(type: EntityType): number {
  switch (type) {
    case 'scenario-card':      return 200;
    case 'surface-overlay':    return 50;
    case 'probe-particle':     return 500;
    case 'selector-glow':      return 100;
    case 'step-overlay':       return 200;
    case 'resolution-ring':    return 100;
    case 'failure-fragment':   return 100;
    case 'proposal-cluster':   return 50;
    case 'knowledge-node':     return 500;
    case 'transport-particle': return 200;
    case 'convergence-wave':   return 10;
    case 'scorecard-element':  return 20;
  }
}

// ─── Color Helpers ───

/** Blend two RGB colors. Pure. */
function blendColors(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
