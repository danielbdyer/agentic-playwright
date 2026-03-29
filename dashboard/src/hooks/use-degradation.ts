/**
 * useDegradation — FPS monitoring and automatic visual quality reduction.
 *
 * Monitors requestAnimationFrame timing and automatically degrades
 * visual quality when frame rate drops below defined thresholds.
 *
 * Degradation tiers (from docs/first-day-flywheel-visualization.md Part VII):
 *   Tier 0 (full):     ≥45 fps — all effects enabled
 *   Tier 1 (no bloom):  30-45 fps — disable bloom postprocessing (saves ~5ms)
 *   Tier 2 (reduced):   20-30 fps — halve particle pool, increase stagger 2×
 *   Tier 3 (no glass):  15-20 fps — disable glass pane transmission effect
 *   Tier 4 (2D):        <15 fps — flat panels instead of 3D scene
 *
 * The controller uses exponential moving average (EMA) to smooth FPS
 * readings and avoid rapid tier switching (hysteresis). Tier upgrades
 * require sustained improvement (8 seconds above threshold) while
 * downgrades trigger after 2 seconds below threshold.
 *
 * @see docs/first-day-flywheel-visualization.md Part VII: Performance Budget
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ─── Degradation Tier ───

export type DegradationTier = 0 | 1 | 2 | 3 | 4;

export interface DegradationState {
  /** Current quality tier (0 = full quality, 4 = maximum degradation). */
  readonly tier: DegradationTier;
  /** Whether bloom postprocessing is enabled. */
  readonly bloomEnabled: boolean;
  /** Particle density multiplier [0.25, 1.0]. */
  readonly particleDensity: number;
  /** Glass pane transmission effect enabled. */
  readonly glassTransmissionEnabled: boolean;
  /** Whether the scene should render in 3D (false = 2D fallback). */
  readonly scene3dEnabled: boolean;
  /** Ingestion stagger multiplier (1.0 = normal, 2.0 = doubled). */
  readonly staggerMultiplier: number;
  /** Current smoothed FPS reading. */
  readonly currentFps: number;
  /** Whether auto-degradation is active. */
  readonly autoEnabled: boolean;
  /** Force a specific tier (overrides auto). */
  readonly forceTier: (tier: DegradationTier | null) => void;
  /** Toggle auto-degradation on/off. */
  readonly toggleAuto: () => void;
}

// ─── Tier Thresholds ───

/**
 * FPS thresholds for each degradation tier.
 * Downgrade: drop below `downgrade` for `downgradeHoldMs`.
 * Upgrade:   sustain above `upgrade` for `upgradeHoldMs`.
 */
export interface TierThreshold {
  readonly tier: DegradationTier;
  readonly downgrade: number;
  readonly upgrade: number;
  readonly downgradeHoldMs: number;
  readonly upgradeHoldMs: number;
}

export const TIER_THRESHOLDS: readonly TierThreshold[] = [
  { tier: 0, downgrade: 45, upgrade: Infinity, downgradeHoldMs: 2000, upgradeHoldMs: Infinity },
  { tier: 1, downgrade: 30, upgrade: 50,       downgradeHoldMs: 2000, upgradeHoldMs: 8000 },
  { tier: 2, downgrade: 20, upgrade: 35,       downgradeHoldMs: 2000, upgradeHoldMs: 8000 },
  { tier: 3, downgrade: 15, upgrade: 25,       downgradeHoldMs: 2000, upgradeHoldMs: 8000 },
  { tier: 4, downgrade: 0,  upgrade: 18,       downgradeHoldMs: 0,    upgradeHoldMs: 8000 },
] as const;

// ─── Tier → Visual Settings ───

/** Compute visual settings from degradation tier. Pure. */
export function tierToSettings(tier: DegradationTier): Omit<DegradationState, 'currentFps' | 'autoEnabled' | 'forceTier' | 'toggleAuto'> {
  switch (tier) {
    case 0:
      return {
        tier: 0,
        bloomEnabled: true,
        particleDensity: 1.0,
        glassTransmissionEnabled: true,
        scene3dEnabled: true,
        staggerMultiplier: 1.0,
      };
    case 1:
      return {
        tier: 1,
        bloomEnabled: false,
        particleDensity: 1.0,
        glassTransmissionEnabled: true,
        scene3dEnabled: true,
        staggerMultiplier: 1.0,
      };
    case 2:
      return {
        tier: 2,
        bloomEnabled: false,
        particleDensity: 0.5,
        glassTransmissionEnabled: true,
        scene3dEnabled: true,
        staggerMultiplier: 2.0,
      };
    case 3:
      return {
        tier: 3,
        bloomEnabled: false,
        particleDensity: 0.5,
        glassTransmissionEnabled: false,
        scene3dEnabled: true,
        staggerMultiplier: 2.0,
      };
    case 4:
      return {
        tier: 4,
        bloomEnabled: false,
        particleDensity: 0.25,
        glassTransmissionEnabled: false,
        scene3dEnabled: false,
        staggerMultiplier: 2.0,
      };
  }
}

// ─── EMA FPS Computation ───

const EMA_ALPHA = 0.1; // smoothing factor (lower = smoother, slower to react)

/** Compute exponential moving average. Pure. */
export function emaFps(prevEma: number, frameDeltaMs: number): number {
  if (frameDeltaMs <= 0) return prevEma;
  const instantFps = 1000 / frameDeltaMs;
  return prevEma === 0
    ? instantFps
    : EMA_ALPHA * instantFps + (1 - EMA_ALPHA) * prevEma;
}

// ─── Tier Decision ───

/**
 * Determine the target tier based on current FPS and hold timers.
 * Pure function — takes current state and returns the new tier.
 */
export function computeTargetTier(
  currentTier: DegradationTier,
  fps: number,
  belowThresholdMs: number,
  aboveThresholdMs: number,
): DegradationTier {
  const current = TIER_THRESHOLDS[currentTier]!;

  // Check downgrade: FPS below current tier's downgrade threshold
  if (currentTier < 4 && fps < current.downgrade && belowThresholdMs >= current.downgradeHoldMs) {
    return (currentTier + 1) as DegradationTier;
  }

  // Check upgrade: FPS above current tier's upgrade threshold
  if (currentTier > 0 && fps > current.upgrade && aboveThresholdMs >= current.upgradeHoldMs) {
    return (currentTier - 1) as DegradationTier;
  }

  return currentTier;
}

// ─── Hook ───

export interface DegradationOptions {
  readonly enabled?: boolean;
  readonly initialTier?: DegradationTier;
}

export function useDegradation(options?: DegradationOptions): DegradationState {
  const enabled = options?.enabled ?? true;
  const initialTier = options?.initialTier ?? 0;

  const [tier, setTier] = useState<DegradationTier>(initialTier);
  const [fps, setFps] = useState(60);
  const [autoEnabled, setAutoEnabled] = useState(enabled);
  const forcedTierRef = useRef<DegradationTier | null>(null);

  // Internal monitoring state
  const emaRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const belowRef = useRef(0);   // ms below downgrade threshold
  const aboveRef = useRef(0);   // ms above upgrade threshold
  const tierRef = useRef(initialTier);
  const rafRef = useRef(0);

  const forceTier = useCallback((t: DegradationTier | null) => {
    forcedTierRef.current = t;
    if (t !== null) {
      setTier(t);
      tierRef.current = t;
    }
  }, []);

  const toggleAuto = useCallback(() => {
    setAutoEnabled((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!autoEnabled) return;

    const tick = (now: number) => {
      const last = lastFrameRef.current;
      if (last !== null) {
        const delta = now - last;
        emaRef.current = emaFps(emaRef.current, delta);

        // Only update React state at 4 Hz to avoid re-render pressure
        if (Math.floor(now / 250) !== Math.floor(last / 250)) {
          setFps(Math.round(emaRef.current));
        }

        // Skip tier computation if forced
        if (forcedTierRef.current !== null) {
          lastFrameRef.current = now;
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const currentTier = tierRef.current;
        const threshold = TIER_THRESHOLDS[currentTier]!;

        // Accumulate hold timers
        if (emaRef.current < threshold.downgrade) {
          belowRef.current += delta;
          aboveRef.current = 0;
        } else if (emaRef.current > threshold.upgrade) {
          aboveRef.current += delta;
          belowRef.current = 0;
        } else {
          // In the "safe zone" — reset both timers
          belowRef.current = 0;
          aboveRef.current = 0;
        }

        const newTier = computeTargetTier(currentTier, emaRef.current, belowRef.current, aboveRef.current);
        if (newTier !== currentTier) {
          tierRef.current = newTier;
          setTier(newTier);
          // Reset hold timers after tier change
          belowRef.current = 0;
          aboveRef.current = 0;
        }
      }

      lastFrameRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoEnabled]);

  const settings = tierToSettings(forcedTierRef.current ?? tier);

  return {
    ...settings,
    currentFps: fps,
    autoEnabled,
    forceTier,
    toggleAuto,
  };
}
