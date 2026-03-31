/**
 * Number of seeds used for property-based law tests.
 * 20 seeds is sufficient for deterministic PRNG-based tests — every seed
 * explores a distinct input partition, and the PRNG is full-period so
 * additional seeds do not improve coverage for pure functions.
 */
export const LAW_SEED_COUNT = 20;

/**
 * Deterministic PRNG for property-based testing.
 * Mulberry32: simple, fast, 32-bit state, full-period.
 */
export function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a random word from a small alphabet. */
export function randomWord(next: () => number): string {
  const alphabet = 'abcxyz';
  const length = 1 + Math.floor(next() * 6);
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]).join('');
}

/** Generate a random integer in [0, max). */
export function randomInt(next: () => number, max: number): number {
  return Math.floor(next() * max);
}

/** Pick a random element from an array. */
export function pick<T>(next: () => number, values: readonly T[]): T {
  return values[randomInt(next, values.length)] as T;
}

/** Randomly return the value or undefined. */
export function maybe<T>(next: () => number, value: T): T | undefined {
  return next() > 0.5 ? value : undefined;
}
