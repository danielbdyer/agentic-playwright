export interface FuzzProfile {
  chromeTone: 'reef' | 'ember' | 'atlas';
  density: 'tidy' | 'layered' | 'stacked';
  wrapperDepth: number;
  calloutOrder: readonly number[];
  badgeLabels: readonly string[];
}

const badgePool = [
  'contract-persistent',
  'fsm-backed',
  'drift-ready',
  'aria-first',
  'reviewable',
] as const;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const next = [...input];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = next[index];
    const swapped = next[swapIndex];
    if (current === undefined || swapped === undefined) {
      continue;
    }
    next[index] = swapped;
    next[swapIndex] = current;
  }
  return next;
}

export function createFuzzProfile(seed: string): FuzzProfile {
  const rng = createRng(seed);
  const calloutOrder = shuffle([0, 1, 2], rng);
  const badgeLabels = shuffle(badgePool, rng).slice(0, 3);
  const tones: FuzzProfile['chromeTone'][] = ['reef', 'ember', 'atlas'];
  const densities: FuzzProfile['density'][] = ['tidy', 'layered', 'stacked'];

  return {
    chromeTone: tones[Math.floor(rng() * tones.length)] ?? 'reef',
    density: densities[Math.floor(rng() * densities.length)] ?? 'tidy',
    wrapperDepth: 1 + Math.floor(rng() * 3),
    calloutOrder,
    badgeLabels,
  };
}
