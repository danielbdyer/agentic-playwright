import os from 'os';

/**
 * Resolve a concurrency level suitable for Effect.all / Effect.forEach.
 *
 * When the caller specifies a value, it's used directly. Otherwise the
 * concurrency is derived from the available CPUs — clamped to at least 1
 * and at most `ceiling` (defaults to the CPU count itself).
 *
 * The env var `TESSERACT_CONCURRENCY` overrides auto-detection, letting
 * operators tune for constrained or over-provisioned environments.
 */
export function resolveEffectConcurrency(options?: {
  readonly ceiling?: number | undefined;
  readonly explicit?: number | undefined;
  readonly envConcurrency?: number | undefined;
}): number {
  if (options?.explicit !== undefined && options.explicit > 0) {
    return options.explicit;
  }
  const envOverride = options?.envConcurrency ?? NaN;
  if (Number.isFinite(envOverride) && envOverride > 0) {
    return envOverride;
  }
  const cpus = os.availableParallelism?.() ?? os.cpus().length;
  const ceiling = options?.ceiling ?? cpus;
  return Math.max(1, Math.min(cpus, ceiling));
}
