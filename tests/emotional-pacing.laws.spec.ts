import { expect, test } from '@playwright/test';
import {
  PACING_PROFILES,
  getPacingProfile,
  adjustTransitionDuration,
  adjustStaggerInterval,
  adjustCaptionDuration,
  computeAmbientLight,
  adjustParticlePool,
  shouldShowCaption,
  totalStaggerDuration,
  type VerbosityLevel,
} from '../lib/domain/emotional-pacing';

const ALL_LEVELS: readonly VerbosityLevel[] = ['minimal', 'normal', 'verbose'];

test.describe('EmotionalPacing laws', () => {

  test('Law 1: exactly 3 verbosity levels defined', () => {
    expect(ALL_LEVELS).toHaveLength(3);
    ALL_LEVELS.forEach((level) => {
      expect(PACING_PROFILES[level]).toBeDefined();
    });
  });

  test('Law 2: transition duration multiplier increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.transitionDurationMultiplier)
      .toBeLessThan(PACING_PROFILES.normal.transitionDurationMultiplier);
    expect(PACING_PROFILES.normal.transitionDurationMultiplier)
      .toBeLessThan(PACING_PROFILES.verbose.transitionDurationMultiplier);
  });

  test('Law 3: stagger interval multiplier increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.staggerIntervalMultiplier)
      .toBeLessThan(PACING_PROFILES.normal.staggerIntervalMultiplier);
    expect(PACING_PROFILES.normal.staggerIntervalMultiplier)
      .toBeLessThan(PACING_PROFILES.verbose.staggerIntervalMultiplier);
  });

  test('Law 4: convergence ceremony duration increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.convergenceCeremonyDurationMs)
      .toBeLessThan(PACING_PROFILES.normal.convergenceCeremonyDurationMs);
    expect(PACING_PROFILES.normal.convergenceCeremonyDurationMs)
      .toBeLessThan(PACING_PROFILES.verbose.convergenceCeremonyDurationMs);
  });

  test('Law 5: getPacingProfile returns correct profile', () => {
    ALL_LEVELS.forEach((level) => {
      const profile = getPacingProfile(level);
      expect(profile.level).toBe(level);
    });
  });

  test('Law 6: adjustTransitionDuration scales by multiplier', () => {
    const base = 1000;
    const minimal = adjustTransitionDuration(base, 'minimal');
    const normal = adjustTransitionDuration(base, 'normal');
    const verbose = adjustTransitionDuration(base, 'verbose');
    expect(minimal).toBeLessThan(normal);
    expect(normal).toBeLessThan(verbose);
    expect(normal).toBe(base);
  });

  test('Law 7: adjustStaggerInterval scales by multiplier', () => {
    const base = 150;
    expect(adjustStaggerInterval(base, 'minimal')).toBeLessThan(base);
    expect(adjustStaggerInterval(base, 'normal')).toBe(base);
    expect(adjustStaggerInterval(base, 'verbose')).toBeGreaterThan(base);
  });

  test('Law 8: adjustCaptionDuration scales by multiplier', () => {
    const base = 4000;
    expect(adjustCaptionDuration(base, 'minimal')).toBeLessThan(base);
    expect(adjustCaptionDuration(base, 'normal')).toBe(base);
    expect(adjustCaptionDuration(base, 'verbose')).toBeGreaterThan(base);
  });

  test('Law 9: computeAmbientLight starts above baseline and approaches target', () => {
    const early = computeAmbientLight(0, 'normal');
    expect(early).toBeCloseTo(0.1, 1);
    const late = computeAmbientLight(30000, 'normal');
    const target = PACING_PROFILES.normal.ambientLightIntensity;
    expect(late).toBeGreaterThan(early);
    expect(late).toBeLessThanOrEqual(target + 0.01);
  });

  test('Law 10: verbose ambient ramps slower than minimal', () => {
    const minimalLight = computeAmbientLight(2000, 'minimal');
    const verboseLight = computeAmbientLight(2000, 'verbose');
    const minimalProgress = (minimalLight - 0.1) / (PACING_PROFILES.minimal.ambientLightIntensity - 0.1);
    const verboseProgress = (verboseLight - 0.1) / (PACING_PROFILES.verbose.ambientLightIntensity - 0.1);
    expect(minimalProgress).toBeGreaterThan(verboseProgress);
  });

  test('Law 11: adjustParticlePool scales by density multiplier', () => {
    const base = 500;
    expect(adjustParticlePool(base, 'minimal')).toBeLessThan(base);
    expect(adjustParticlePool(base, 'normal')).toBe(base);
    expect(adjustParticlePool(base, 'verbose')).toBeGreaterThan(base);
  });

  test('Law 12: shouldShowCaption respects verbosity hierarchy', () => {
    expect(shouldShowCaption('verbose', 'verbose')).toBe(true);
    expect(shouldShowCaption('verbose', 'normal')).toBe(false);
    expect(shouldShowCaption('verbose', 'minimal')).toBe(false);
    expect(shouldShowCaption('normal', 'verbose')).toBe(true);
    expect(shouldShowCaption('normal', 'normal')).toBe(true);
    expect(shouldShowCaption('normal', 'minimal')).toBe(false);
    expect(shouldShowCaption('minimal', 'minimal')).toBe(true);
  });

  test('Law 13: totalStaggerDuration is (n-1) * stagger', () => {
    expect(totalStaggerDuration(1, 'normal')).toBe(0);
    expect(totalStaggerDuration(5, 'normal')).toBe(4 * PACING_PROFILES.normal.discoveryStaggerMs);
  });

  test('Law 14: totalStaggerDuration is 0 for 0 regions', () => {
    expect(totalStaggerDuration(0, 'normal')).toBe(0);
  });

  test('Law 15: all profiles have positive particle density', () => {
    ALL_LEVELS.forEach((level) => {
      expect(PACING_PROFILES[level].particleDensityMultiplier).toBeGreaterThan(0);
    });
  });

  test('Law 16: convergence wave count increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.convergenceWaveCount)
      .toBeLessThan(PACING_PROFILES.normal.convergenceWaveCount);
    expect(PACING_PROFILES.normal.convergenceWaveCount)
      .toBeLessThan(PACING_PROFILES.verbose.convergenceWaveCount);
  });

  test('Law 17: maxConcurrentCaptions increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.maxConcurrentCaptions)
      .toBeLessThanOrEqual(PACING_PROFILES.normal.maxConcurrentCaptions);
    expect(PACING_PROFILES.normal.maxConcurrentCaptions)
      .toBeLessThanOrEqual(PACING_PROFILES.verbose.maxConcurrentCaptions);
  });

  test('Law 18: act transition hold time increases with verbosity', () => {
    expect(PACING_PROFILES.minimal.actTransitionHoldMs)
      .toBeLessThan(PACING_PROFILES.normal.actTransitionHoldMs);
    expect(PACING_PROFILES.normal.actTransitionHoldMs)
      .toBeLessThan(PACING_PROFILES.verbose.actTransitionHoldMs);
  });
});
