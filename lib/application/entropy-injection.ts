/**
 * Structured entropy injection for scenario variant generation.
 *
 * Accelerates knowledge hardening by increasing exposure diversity.
 * All variant generation is deterministic given a seed — the same
 * seed always produces the same variants, enabling reproducible
 * testing and regression analysis.
 *
 * Uses mulberry32 for deterministic PRNG.
 */

// ─── PRNG ───

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6d2b79f5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Types ───

export interface VarianceProfile {
  readonly adoPhrasingVariants: number;
  readonly dataPostureCombinations: number;
  readonly screenStatePermutations: number;
  readonly navigationPathVariants: number;
}

export interface VariantMutation {
  readonly kind: 'phrasing' | 'data' | 'state' | 'navigation';
  readonly field: string;
  readonly original: string;
  readonly variant: string;
}

export interface ScenarioVariant {
  readonly baseScenarioId: string;
  readonly variantId: string;
  readonly mutations: readonly VariantMutation[];
}

export interface ScenarioSeed {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly ScenarioSeedStep[];
}

export interface ScenarioSeedStep {
  readonly index: number;
  readonly intent: string;
  readonly action: string;
  readonly screen: string | null;
  readonly element: string | null;
  readonly dataValue: string | null;
}

// ─── Default profile ───

export function defaultVarianceProfile(): VarianceProfile {
  return {
    adoPhrasingVariants: 3,
    dataPostureCombinations: 2,
    screenStatePermutations: 2,
    navigationPathVariants: 1,
  };
}

// ─── Phrasing synonyms ───

const PHRASING_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  click: ['press', 'tap', 'select', 'hit', 'activate'],
  enter: ['type', 'input', 'fill in', 'provide', 'write'],
  navigate: ['go to', 'open', 'visit', 'browse to', 'load'],
  verify: ['check', 'confirm', 'validate', 'assert', 'ensure'],
  submit: ['save', 'send', 'complete', 'finish', 'confirm'],
  select: ['choose', 'pick', 'opt for', 'mark', 'highlight'],
  delete: ['remove', 'clear', 'erase', 'discard', 'drop'],
  search: ['find', 'look up', 'query', 'locate', 'filter'],
};

// ─── Data posture vocabulary ───

const DATA_POSTURE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  name: ['Jane Doe', 'Bob Smith', 'Alice Martinez', 'Charlie O\'Brien'],
  email: ['test@example.com', 'user@demo.org', 'admin@test.net', 'qa@sample.io'],
  phone: ['555-0100', '555-0199', '555-0142', '555-0177'],
  date: ['2025-01-15', '2025-06-30', '2025-12-01', '2024-03-14'],
  number: ['0', '1', '42', '999', '-1'],
  text: ['Lorem ipsum', 'Test value', 'Sample input', 'Quick brown fox'],
};

// ─── Screen state vocabulary ───

const SCREEN_STATES: readonly string[] = [
  'pristine',
  'dirty',
  'loading',
  'error-visible',
  'validation-shown',
  'modal-open',
  'expanded',
  'collapsed',
];

// ─── Navigation path vocabulary ───

const NAVIGATION_PREFIXES: readonly string[] = [
  'direct',
  'via-breadcrumb',
  'via-sidebar',
  'via-search',
  'via-back-button',
  'via-deep-link',
];

// ─── Internal helpers ───

function pickFromArray<T>(next: () => number, values: readonly T[]): T {
  return values[Math.floor(next() * values.length)] as T;
}

function generatePhrasingMutations(
  step: ScenarioSeedStep,
  next: () => number,
  count: number,
): readonly VariantMutation[] {
  const intent = step.intent.toLowerCase();
  const matchingVerbs = Object.entries(PHRASING_SYNONYMS).filter(
    ([verb]) => intent.includes(verb),
  );

  if (matchingVerbs.length === 0) {
    return [];
  }

  return Array.from({ length: count }, (_, i) => {
    const [verb, synonyms] = pickFromArray(next, matchingVerbs) as [string, readonly string[]];
    const synonym = pickFromArray(next, synonyms);
    return {
      kind: 'phrasing' as const,
      field: `steps[${step.index}].intent`,
      original: verb,
      variant: `${synonym} (phrasing-${i})`,
    };
  });
}

function generateDataMutations(
  step: ScenarioSeedStep,
  next: () => number,
  count: number,
): readonly VariantMutation[] {
  if (step.dataValue === null) {
    return [];
  }

  const matchingPostures = Object.entries(DATA_POSTURE_VARIANTS).filter(
    ([category]) => {
      const lower = (step.element ?? '').toLowerCase();
      return lower.includes(category) || category === 'text';
    },
  );

  if (matchingPostures.length === 0) {
    return [];
  }

  return Array.from({ length: count }, (_, i) => {
    const [_category, variants] = pickFromArray(next, matchingPostures) as [string, readonly string[]];
    const variant = pickFromArray(next, variants);
    return {
      kind: 'data' as const,
      field: `steps[${step.index}].dataValue`,
      original: step.dataValue as string,
      variant: `${variant} (data-${i})`,
    };
  });
}

function generateStateMutations(
  step: ScenarioSeedStep,
  next: () => number,
  count: number,
): readonly VariantMutation[] {
  if (step.screen === null) {
    return [];
  }

  return Array.from({ length: count }, (_, i) => {
    const state = pickFromArray(next, SCREEN_STATES);
    return {
      kind: 'state' as const,
      field: `steps[${step.index}].screenState`,
      original: 'pristine',
      variant: `${state} (state-${i})`,
    };
  });
}

function generateNavigationMutations(
  step: ScenarioSeedStep,
  next: () => number,
  count: number,
): readonly VariantMutation[] {
  if (step.action !== 'navigate' || step.screen === null) {
    return [];
  }

  return Array.from({ length: count }, (_, i) => {
    const prefix = pickFromArray(next, NAVIGATION_PREFIXES);
    return {
      kind: 'navigation' as const,
      field: `steps[${step.index}].navigationPath`,
      original: 'direct',
      variant: `${prefix} (nav-${i})`,
    };
  });
}

function generateMutationsForStep(
  step: ScenarioSeedStep,
  profile: VarianceProfile,
  next: () => number,
): readonly VariantMutation[] {
  return [
    ...generatePhrasingMutations(step, next, profile.adoPhrasingVariants),
    ...generateDataMutations(step, next, profile.dataPostureCombinations),
    ...generateStateMutations(step, next, profile.screenStatePermutations),
    ...generateNavigationMutations(step, next, profile.navigationPathVariants),
  ];
}

// ─── Public API ───

/**
 * Compute the total number of variants a profile would produce for a given scenario.
 * This is the sum across all steps of applicable mutation dimensions.
 */
export function computeVariantCount(scenario: ScenarioSeed, profile: VarianceProfile): number {
  return scenario.steps.reduce((acc, step) => {
    const phrasingCount = Object.keys(PHRASING_SYNONYMS).some(
      (verb) => step.intent.toLowerCase().includes(verb),
    ) ? profile.adoPhrasingVariants : 0;

    const dataCount = step.dataValue !== null ? profile.dataPostureCombinations : 0;

    const stateCount = step.screen !== null ? profile.screenStatePermutations : 0;

    const navCount = (step.action === 'navigate' && step.screen !== null)
      ? profile.navigationPathVariants
      : 0;

    return acc + phrasingCount + dataCount + stateCount + navCount;
  }, 0);
}

/**
 * Generate deterministic scenario variants from a scenario seed and variance profile.
 *
 * Each variant gets a unique ID derived from the base scenario ID and variant index.
 * The PRNG seed ensures reproducibility — same inputs always produce same outputs.
 */
export function generateVariants(
  scenario: ScenarioSeed,
  profile: VarianceProfile,
  seed: number,
): readonly ScenarioVariant[] {
  const next = mulberry32(seed);

  const allMutations: readonly VariantMutation[] = scenario.steps.flatMap(
    (step) => generateMutationsForStep(step, profile, next),
  );

  if (allMutations.length === 0) {
    return [];
  }

  // Group mutations into variants — each variant gets one mutation from each applicable dimension
  const grouped = allMutations.reduce<Readonly<Record<string, readonly VariantMutation[]>>>(
    (acc, mutation) => {
      const existing = acc[mutation.kind] ?? [];
      return { ...acc, [mutation.kind]: [...existing, mutation] };
    },
    {},
  );

  const maxVariants = Math.max(...Object.values(grouped).map((ms) => ms.length));

  return Array.from({ length: maxVariants }, (_, i) => {
    const mutations = Object.values(grouped).flatMap(
      (ms) => (i < ms.length ? [ms[i] as VariantMutation] : []),
    );

    return {
      baseScenarioId: scenario.id,
      variantId: `${scenario.id}::variant-${i}`,
      mutations,
    };
  });
}
