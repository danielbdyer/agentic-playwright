/**
 * EmotionalPacing — pure domain module for verbosity-driven animation pacing.
 *
 * The flywheel visualization must serve both first-time and experienced
 * operators. The verbosity setting controls not just narration text, but
 * the entire animation rhythm:
 *
 *   minimal:  Fast, efficient. Short transitions (0.6×), less stagger,
 *             lower ambient. For experienced operators who want throughput.
 *
 *   normal:   Balanced default. Standard transitions (1.0×), normal stagger,
 *             standard ambient. For day-to-day use.
 *
 *   verbose:  Expressive, educational. Long transitions (1.5×), more stagger,
 *             brighter ambient. For first-time or demo audiences.
 *
 * Computed properties:
 *   - Transition duration multiplier
 *   - Stagger interval multiplier
 *   - Ambient light ramp rate
 *   - Particle density multiplier
 *   - Caption display duration multiplier
 *   - Act transition hold time
 *   - Convergence ceremony duration
 *
 * Solves Part X Challenge 5: "Emotional Pacing".
 *
 * Pure domain logic. No React.
 *
 * @see docs/first-day-flywheel-visualization.md Part X Challenge 5
 */

// ─── Verbosity Levels ───

export type VerbosityLevel = 'minimal' | 'normal' | 'verbose';

// ─── Pacing Profile ───

/** Complete pacing profile for one verbosity level. */
export interface PacingProfile {
  readonly level: VerbosityLevel;

  // Duration multipliers
  readonly transitionDurationMultiplier: number;   // [0.4, 2.0]
  readonly staggerIntervalMultiplier: number;      // [0.5, 2.0]
  readonly captionDurationMultiplier: number;       // [0.6, 1.5]

  // Ambient
  readonly ambientLightIntensity: number;          // [0.1, 1.0]
  readonly ambientRampRate: number;                 // Brightness change per second

  // Particles
  readonly particleDensityMultiplier: number;      // [0.5, 1.5]

  // Act transitions
  readonly actTransitionHoldMs: number;            // Pause at act boundary
  readonly actTransitionFadeMs: number;            // Cross-fade duration

  // Convergence ceremony
  readonly convergenceCeremonyDurationMs: number;   // Finale length
  readonly convergenceWaveCount: number;            // Radial wave pulses

  // Discovery
  readonly firstEncounterGlowDuration: number;     // How long first-discovery glows
  readonly discoveryStaggerMs: number;              // Delay between region reveals

  // Narration
  readonly maxConcurrentCaptions: number;           // Max visible captions
  readonly captionFadeMs: number;                   // Caption fade-out time
}

// ─── Profile Definitions ───

export const PACING_PROFILES: Readonly<Record<VerbosityLevel, PacingProfile>> = {
  minimal: {
    level: 'minimal',
    transitionDurationMultiplier: 0.6,
    staggerIntervalMultiplier: 0.5,
    captionDurationMultiplier: 0.6,
    ambientLightIntensity: 0.3,
    ambientRampRate: 0.5,
    particleDensityMultiplier: 0.6,
    actTransitionHoldMs: 200,
    actTransitionFadeMs: 500,
    convergenceCeremonyDurationMs: 8000,
    convergenceWaveCount: 1,
    firstEncounterGlowDuration: 1000,
    discoveryStaggerMs: 80,
    maxConcurrentCaptions: 1,
    captionFadeMs: 200,
  },
  normal: {
    level: 'normal',
    transitionDurationMultiplier: 1.0,
    staggerIntervalMultiplier: 1.0,
    captionDurationMultiplier: 1.0,
    ambientLightIntensity: 0.5,
    ambientRampRate: 0.3,
    particleDensityMultiplier: 1.0,
    actTransitionHoldMs: 400,
    actTransitionFadeMs: 800,
    convergenceCeremonyDurationMs: 15000,
    convergenceWaveCount: 3,
    firstEncounterGlowDuration: 2000,
    discoveryStaggerMs: 150,
    maxConcurrentCaptions: 2,
    captionFadeMs: 400,
  },
  verbose: {
    level: 'verbose',
    transitionDurationMultiplier: 1.5,
    staggerIntervalMultiplier: 2.0,
    captionDurationMultiplier: 1.5,
    ambientLightIntensity: 0.7,
    ambientRampRate: 0.15,
    particleDensityMultiplier: 1.3,
    actTransitionHoldMs: 800,
    actTransitionFadeMs: 1200,
    convergenceCeremonyDurationMs: 20000,
    convergenceWaveCount: 5,
    firstEncounterGlowDuration: 3500,
    discoveryStaggerMs: 250,
    maxConcurrentCaptions: 3,
    captionFadeMs: 600,
  },
} as const;

// ─── Profile Access ───

/**
 * Get the pacing profile for a verbosity level.
 */
export function getPacingProfile(level: VerbosityLevel): PacingProfile {
  return PACING_PROFILES[level];
}

/**
 * Apply the transition duration multiplier to a base duration.
 */
export function adjustTransitionDuration(
  baseDurationMs: number,
  level: VerbosityLevel,
): number {
  return Math.round(baseDurationMs * PACING_PROFILES[level].transitionDurationMultiplier);
}

/**
 * Apply the stagger interval multiplier to a base stagger.
 */
export function adjustStaggerInterval(
  baseIntervalMs: number,
  level: VerbosityLevel,
): number {
  return Math.round(baseIntervalMs * PACING_PROFILES[level].staggerIntervalMultiplier);
}

/**
 * Apply the caption duration multiplier.
 */
export function adjustCaptionDuration(
  baseDurationMs: number,
  level: VerbosityLevel,
): number {
  return Math.round(baseDurationMs * PACING_PROFILES[level].captionDurationMultiplier);
}

/**
 * Compute ambient light intensity for a given progress through an act.
 * Light ramps up from a dim start to the profile's target intensity.
 *
 * @param elapsedMs - Time elapsed in current act
 * @param level - Current verbosity level
 * @returns Light intensity [0, 1]
 */
export function computeAmbientLight(
  elapsedMs: number,
  level: VerbosityLevel,
): number {
  const profile = PACING_PROFILES[level];
  const targetIntensity = profile.ambientLightIntensity;
  const rampRate = profile.ambientRampRate;
  const elapsedSec = elapsedMs / 1000;

  // Exponential ramp: starts at 0.1, approaches target
  const base = 0.1;
  const progress = 1 - Math.exp(-rampRate * elapsedSec);
  return base + (targetIntensity - base) * progress;
}

/**
 * Compute particle pool size multiplied by density.
 */
export function adjustParticlePool(
  basePoolSize: number,
  level: VerbosityLevel,
): number {
  return Math.round(basePoolSize * PACING_PROFILES[level].particleDensityMultiplier);
}

/**
 * Should a caption be shown at this verbosity level?
 * Captions have their own minimum verbosity requirement.
 */
export function shouldShowCaption(
  captionMinVerbosity: VerbosityLevel,
  currentLevel: VerbosityLevel,
): boolean {
  const order: Readonly<Record<VerbosityLevel, number>> = {
    minimal: 0,
    normal: 1,
    verbose: 2,
  };
  return order[currentLevel] >= order[captionMinVerbosity];
}

/**
 * Get the total event stagger delay for a batch of N regions.
 */
export function totalStaggerDuration(
  regionCount: number,
  level: VerbosityLevel,
): number {
  const stagger = PACING_PROFILES[level].discoveryStaggerMs;
  return Math.max(0, (regionCount - 1) * stagger);
}
