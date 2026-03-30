import { hashSeed, createSeededRng, pick, shuffle, type SeededRng } from '../random';
import { sha256, stableStringify } from '../hash';

type ActionType = 'navigate' | 'input' | 'click' | 'select' | 'assert';

export interface ScreenElementPlanInput {
  readonly elementId: string;
  readonly widget: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
}

export interface ScreenPlanInput {
  readonly screenId: string;
  readonly screenAliases: readonly string[];
  readonly elements: readonly ScreenElementPlanInput[];
}

export interface SyntheticCatalogPlanInput {
  readonly screens: readonly ScreenPlanInput[];
}

export interface PerturbationConfig {
  readonly vocab: number;
  readonly aliasGap: number;
  readonly crossScreen: number;
  readonly coverageGap: number;
}

export const ZERO_PERTURBATION: PerturbationConfig = { vocab: 0, aliasGap: 0, crossScreen: 0, coverageGap: 0 };

export function resolvePerturbation(rate?: number, config?: Partial<PerturbationConfig>): PerturbationConfig {
  return config
    ? { ...ZERO_PERTURBATION, ...config }
    : rate && rate > 0
      ? { ...ZERO_PERTURBATION, vocab: rate }
      : ZERO_PERTURBATION;
}

interface SyntheticStep {
  readonly index: number;
  readonly intent: string;
  readonly action_text: string;
  readonly expected_text: string;
}

type Strategy = 'single-screen' | 'cross-screen' | 'workflow';

interface ScenarioPlanInternal {
  readonly adoId: string;
  readonly screenId: string;
  readonly title: string;
  readonly suite: string;
  readonly tags: readonly string[];
  readonly steps: readonly SyntheticStep[];
}

export interface ScenarioPlan {
  readonly adoId: string;
  readonly screenId: string;
  readonly title: string;
  readonly suite: string;
  readonly fileName: string;
  readonly yaml: string;
  readonly fingerprint: string;
}

export interface ScenarioPlanningInput {
  readonly catalog: SyntheticCatalogPlanInput;
  readonly seed: string;
  readonly count: number;
  readonly baseId?: number;
  readonly perturbationRate?: number;
  readonly perturbation?: Partial<PerturbationConfig>;
  readonly validationSplit?: number;
}

export interface ScenarioPlanningResult {
  readonly plans: readonly ScenarioPlan[];
  readonly screens: readonly string[];
  readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

const TEMPLATES: Readonly<Record<ActionType, readonly string[]>> = {
  navigate: ['Navigate to {screen}', 'Open {screen}', 'Go to {screen}'],
  input: ['Enter {value} in {element}', 'Type {value} into {element}'],
  click: ['Click {element}', 'Press {element}'],
  select: ['Select {value} from {element}', 'Choose {value} in {element}'],
  assert: ['Verify {element} is visible', 'Check {element} is displayed'],
} as const;

const SYNONYM_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\bsearch\b/gi, ['find', 'lookup']],
  [/\bresults?\b/gi, ['matches', 'outcome']],
  [/\bfield\b/gi, ['input', 'box']],
  [/\bbutton\b/gi, ['control', 'trigger']],
];

const actionForWidget = (widget: string): ActionType =>
  widget === 'os-input' || widget === 'os-textarea'
    ? 'input'
    : widget === 'os-button'
      ? 'click'
      : widget === 'os-select'
        ? 'select'
        : 'assert';

const humanize = (value: string): string => value.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ').trim().toLowerCase();

const perturbVocab = (text: string, rate: number, rng: SeededRng): string =>
  SYNONYM_SUBSTITUTIONS.reduce(
    (result, [pattern, synonyms]) => (rng() < rate && pattern.test(result)
      ? result.replace(pattern, pick(synonyms, rng))
      : result),
    text,
  );

const deterministicSyncedAt = (seed: string): string => {
  const days = hashSeed(seed) % 3650;
  const base = Date.parse('2020-01-01T00:00:00.000Z');
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
};

const renderYaml = (plan: ScenarioPlanInternal, syncedAt: string): string => {
  const q = (value: string): string => (value.includes(':') ? `"${value.replace(/"/g, '\\"')}"` : value);
  return [
    'source:',
    `  ado_id: "${plan.adoId}"`,
    '  revision: 1',
    `  content_hash: sha256:synthetic-${plan.adoId}`,
    `  synced_at: ${syncedAt}`,
    '  origin: synthetic',
    'metadata:',
    `  title: "${plan.title.replace(/"/g, '\\"')}"`,
    `  suite: ${plan.suite}`,
    '  tags:',
    ...['synthetic', 'dogfood', ...plan.tags].map((tag) => `    - ${tag}`),
    '  priority: 2',
    '  status: active',
    '  status_detail: null',
    'preconditions:',
    '  - fixture: demoSession',
    'steps:',
    ...plan.steps.flatMap((step) => [
      `  - index: ${step.index}`,
      `    intent: ${q(step.intent)}`,
      `    action_text: ${q(step.action_text)}`,
      `    expected_text: ${q(step.expected_text)}`,
      '    action: custom',
      '    screen: null',
      '    element: null',
      '    posture: null',
      '    override: null',
      '    snapshot_template: null',
      '    resolution: null',
      '    confidence: intent-only',
    ]),
    'postconditions: []',
  ].join('\n') + '\n';
};

const generateStep = (
  element: ScreenElementPlanInput,
  screen: ScreenPlanInput,
  stepIndex: number,
  allScreens: readonly ScreenPlanInput[],
  perturbation: PerturbationConfig,
  rng: SeededRng,
): SyntheticStep | null => {
  if (rng() < perturbation.coverageGap) return null;
  const action = actionForWidget(element.widget);
  const baseAlias = element.aliases.length > 0 ? pick(element.aliases, rng) : humanize(element.elementId);
  const crossAlias = perturbation.crossScreen > 0 && rng() < perturbation.crossScreen && allScreens.length > 1
    ? (() => {
      const alternatives = allScreens
        .filter((candidate) => candidate.screenId !== screen.screenId)
        .flatMap((candidate) => candidate.elements)
        .map((candidate) => (candidate.aliases.length > 0 ? pick(candidate.aliases, rng) : humanize(candidate.elementId)));
      return alternatives.length > 0 ? pick(alternatives, rng) : baseAlias;
    })()
    : baseAlias;
  const alias = perturbation.aliasGap > 0 && rng() < perturbation.aliasGap ? element.elementId : crossAlias;
  const value = action === 'input' ? 'a valid value' : action === 'select' ? 'the correct option' : '';
  const template = pick(TEMPLATES[action], rng)
    .replace('{screen}', screen.screenAliases[0] ?? humanize(screen.screenId))
    .replace('{element}', alias)
    .replace('{value}', value);
  const actionText = perturbation.vocab > 0 ? perturbVocab(template, perturbation.vocab, rng) : template;
  return {
    index: stepIndex,
    intent: actionText,
    action_text: actionText,
    expected_text: `${alias} handled`,
  };
};

const generateScenario = (
  screen: ScreenPlanInput,
  strategy: Strategy,
  scenarioIndex: number,
  screens: readonly ScreenPlanInput[],
  perturbation: PerturbationConfig,
  rng: SeededRng,
): ScenarioPlanInternal => {
  const selectedScreens = strategy === 'cross-screen'
    ? shuffle(screens, rng).slice(0, Math.min(2, screens.length))
    : [screen];

  const navSteps = selectedScreens.map((selected, idx) => {
    const alias = selected.screenAliases[0] ?? humanize(selected.screenId);
    const navText = pick(TEMPLATES.navigate, rng).replace('{screen}', alias);
    return { index: idx + 1, intent: navText, action_text: navText, expected_text: `${alias} loads successfully` } satisfies SyntheticStep;
  });

  const stepSeed = navSteps.length + 1;
  const interactionSteps = selectedScreens.flatMap((selected, screenIdx) =>
    shuffle(selected.elements, rng)
      .slice(0, strategy === 'workflow' ? 3 : 2)
      .flatMap((element, elementIdx) => {
        const generated = generateStep(
          element,
          selected,
          stepSeed + screenIdx * 3 + elementIdx,
          screens,
          perturbation,
          rng,
        );
        return generated ? [generated] : [];
      }),
  );

  const steps = [...navSteps, ...interactionSteps].map((step, index) => ({ ...step, index: index + 1 }));
  const primary = selectedScreens[0]?.screenId ?? screen.screenId;
  return {
    adoId: String((20000) + scenarioIndex),
    screenId: strategy === 'cross-screen' ? 'cross-screen' : primary,
    title: `Synthetic ${strategy} ${scenarioIndex}: ${selectedScreens.map((item) => item.screenId).join(' -> ')}`,
    suite: `synthetic/${strategy === 'cross-screen' ? 'cross-screen' : primary}`,
    tags: [],
    steps,
  };
};

export function planSyntheticScenarios(input: ScenarioPlanningInput): ScenarioPlanningResult {
  const rng = createSeededRng(input.seed);
  const perturbation = resolvePerturbation(input.perturbationRate, input.perturbation);
  const screens = input.catalog.screens;
  const syncedAt = deterministicSyncedAt(input.seed);
  const baseId = input.baseId ?? 20000;

  const allocations = Array.from({ length: input.count }, (_, index) => ({
    screen: screens[index % Math.max(screens.length, 1)] ?? { screenId: 'empty', screenAliases: ['empty'], elements: [] },
    strategy: pick((['single-screen', 'workflow', 'cross-screen'] as const), rng),
    index,
  }));

  const plans = allocations.map(({ screen, strategy, index }) => {
    const scenario = generateScenario(screen, strategy, index, screens, perturbation, rng);
    const adoId = String(baseId + index);
    const materialized = { ...scenario, adoId };
    const split = input.validationSplit && input.validationSplit > 0 && rng() < input.validationSplit ? ['validation-heldout'] : ['training'];
    const yaml = renderYaml({ ...materialized, tags: split }, syncedAt);
    return {
      adoId,
      screenId: materialized.screenId,
      title: materialized.title,
      suite: materialized.suite,
      fileName: `${adoId}.scenario.yaml`,
      yaml,
      fingerprint: `sha256:${sha256(stableStringify({ adoId, yaml }))}`,
    } satisfies ScenarioPlan;
  });

  const screenDistributionMap = plans.reduce<ReadonlyMap<string, number>>(
    (acc, plan) => new Map([...acc, [plan.screenId, (acc.get(plan.screenId) ?? 0) + 1]]),
    new Map<string, number>(),
  );

  return {
    plans,
    screens: screens.map((screen) => screen.screenId),
    screenDistribution: [...screenDistributionMap.entries()]
      .map(([screen, count]) => ({ screen, count }))
      .sort((left, right) => right.count - left.count),
  };
}
