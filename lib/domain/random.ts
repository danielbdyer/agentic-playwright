export type SeededRng = () => number;

export function hashSeed(seed: string): number {
  return [...seed].reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
}

export function createSeededRng(seed: string): SeededRng {
  const initialState = hashSeed(seed) || 1;
  const nextState = (state: number): number => (Math.imul(state, 1664525) + 1013904223) >>> 0;

  const step = (state: number): readonly [number, number] => {
    const next = nextState(state);
    return [next, next / 4294967296] as const;
  };

  const ref = { state: initialState };
  return (): number => {
    const [next, value] = step(ref.state);
    ref.state = next;
    return value;
  };
}

export function pick<T>(array: readonly T[], rng: SeededRng): T {
  return array[Math.floor(rng() * array.length)]!;
}

export function shuffle<T>(input: readonly T[], rng: SeededRng): readonly T[] {
  const withKeys = input.map((item, index) => ({ item, key: rng(), index }));
  return withKeys
    .slice()
    .sort((left, right) => (left.key - right.key) || (left.index - right.index))
    .map(({ item }) => item);
}
