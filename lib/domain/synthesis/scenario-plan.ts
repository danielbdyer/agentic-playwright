import { hashSeed, createSeededRng, pick, shuffle, type SeededRng } from '../random';
import { sha256, stableStringify } from '../hash';

type ActionType = 'navigate' | 'input' | 'click' | 'select' | 'assert';

export interface PostureValue {
  readonly posture: string;
  readonly values: readonly string[];
}

export interface ScreenElementPlanInput {
  readonly elementId: string;
  readonly widget: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
  /** Posture-driven values for data variation (e.g. valid, invalid, empty). */
  readonly postureValues?: readonly PostureValue[];
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
  /** Probability of using posture-driven values instead of generic placeholders. */
  readonly dataVariation: number;
  /** Probability of generating richer assertion expectations. */
  readonly assertionVariation: number;
}

export const ZERO_PERTURBATION: PerturbationConfig = {
  vocab: 0, aliasGap: 0, crossScreen: 0, coverageGap: 0,
  dataVariation: 0, assertionVariation: 0,
};

export function resolvePerturbation(rate?: number, config?: Partial<PerturbationConfig>): PerturbationConfig {
  return config
    ? { ...ZERO_PERTURBATION, ...config }
    : rate && rate > 0
      ? { ...ZERO_PERTURBATION, vocab: rate }
      : ZERO_PERTURBATION;
}

// ─── Phrasing provider abstraction ───
//
// The PhrasingProvider is the extension point for how step text is generated.
// The deterministic template approach is the fallback. An agentic implementation
// uses an LLM to produce diverse, realistic QA phrasing that genuinely challenges
// the translation layer — text that is semantically valid but lexically distant
// from any alias in the knowledge model. See docs/recursive-self-improvement.md.

/** Structured intent for a single step, used by PhrasingProvider to generate text. */
export interface PhrasingRequest {
  readonly action: ActionType;
  readonly screenId: string;
  readonly screenAlias: string;
  readonly elementId: string | null;
  readonly elementAlias: string | null;
  readonly value: string;
}

/** Result of phrasing a step — the natural-language text and its provenance. */
export interface PhrasingResult {
  readonly actionText: string;
  readonly expectedText: string;
  readonly source: 'template' | 'agentic';
}

/**
 * Produces natural-language step text from a structured intent.
 *
 * - **template**: Deterministic, fast, CI-safe. Uses finite template pool with
 *   optional synonym substitution. Tests lexical matching breadth.
 * - **agentic**: LLM-backed, produces phrasing that a real QA tester would write.
 *   Tests semantic understanding and forces the translation pipeline to fall through
 *   to lower rungs, which drives genuine proposal generation and knowledge accumulation.
 *
 * The planner accepts this as an optional input. When absent, falls back to
 * `templatePhrasing` (the deterministic path).
 */
export type PhrasingProvider = (request: PhrasingRequest, rng: SeededRng) => PhrasingResult;

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
  /**
   * Optional phrasing provider. When absent, uses deterministic template phrasing.
   * Supply an agentic provider to generate diverse, realistic QA phrasing via LLM.
   */
  readonly phrasingProvider?: PhrasingProvider;
}

export interface ScenarioPlanningResult {
  readonly plans: readonly ScenarioPlan[];
  readonly screens: readonly string[];
  readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

const TEMPLATES: Readonly<Record<ActionType, readonly string[]>> = {
  navigate: [
    'Navigate to {screen}', 'Open {screen}', 'Go to {screen}',
    'Switch to {screen}', 'Browse to {screen}', 'Load {screen}',
    'Visit {screen}', 'Access {screen}',
  ],
  input: [
    'Enter {value} in {element}', 'Type {value} into {element}',
    'Fill in {element} with {value}', 'Set {element} to {value}',
    'Input {value} in the {element}', 'Provide {value} for {element}',
  ],
  click: [
    'Click {element}', 'Press {element}',
    'Activate {element}', 'Trigger {element}',
    'Tap {element}', 'Hit {element}',
  ],
  select: [
    'Select {value} from {element}', 'Choose {value} in {element}',
    'Pick {value} from {element}', 'Set {element} to {value}',
  ],
  assert: [
    'Verify {element} is visible', 'Check {element} is displayed',
    'Confirm {element} is present', 'Assert {element} is shown',
    'Validate {element} appears on screen', 'Ensure {element} is rendered',
  ],
} as const;

const SYNONYM_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\bsearch\b/gi, ['find', 'lookup', 'query', 'look up']],
  [/\bresults?\b/gi, ['matches', 'outcome', 'records', 'listings', 'items']],
  [/\bfield\b/gi, ['input', 'box', 'entry', 'text area', 'control']],
  [/\bbutton\b/gi, ['control', 'trigger', 'action', 'link']],
  [/\bpolicy\b/gi, ['insurance policy', 'account', 'policy record']],
  [/\bdetail\b/gi, ['information', 'overview', 'summary', 'specifics']],
  [/\btable\b/gi, ['grid', 'list', 'listing', 'data view']],
  [/\bnavigate\b/gi, ['go', 'browse', 'proceed', 'move']],
  [/\bscreen\b/gi, ['page', 'view', 'panel', 'section']],
  [/\bverify\b/gi, ['check', 'confirm', 'validate', 'assert']],
  [/\bvisible\b/gi, ['displayed', 'shown', 'present', 'rendered']],
  [/\benter\b/gi, ['type', 'input', 'fill in', 'provide']],
  [/\bstatus\b/gi, ['state', 'condition', 'current status']],
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

// ─── Data value pools for realistic input generation ───

const GENERIC_INPUT_VALUES: readonly string[] = [
  'a valid value', 'test data', 'sample input', 'example text',
  'John Doe', 'jane.doe@example.com', '555-0100', '12345',
  'POL-999', 'CLM-001', 'AMD-100', '2025-01-15',
];

const GENERIC_SELECT_VALUES: readonly string[] = [
  'the correct option', 'the first option', 'an available option',
  'Active', 'Pending', 'Closed', 'In Review', 'Approved',
];

/**
 * Select a data value for an input step, considering posture data and perturbation settings.
 * Falls back through: posture values → generic pools → hardcoded placeholder.
 */
const pickDataValue = (
  element: ScreenElementPlanInput,
  action: ActionType,
  perturbation: PerturbationConfig,
  rng: SeededRng,
): string => {
  if (action !== 'input' && action !== 'select') return '';

  // Data variation: use posture-driven values or generic pool
  if (perturbation.dataVariation > 0 && rng() < perturbation.dataVariation) {
    const postures = element.postureValues ?? [];
    const allValues = postures.flatMap((p) => p.values).filter((v) => v.length > 0);
    if (allValues.length > 0) return pick(allValues, rng);
    return action === 'input' ? pick(GENERIC_INPUT_VALUES, rng) : pick(GENERIC_SELECT_VALUES, rng);
  }

  // Default placeholders
  return action === 'input' ? 'a valid value' : action === 'select' ? 'the correct option' : '';
};

// ─── Assertion expectation generation ───

const RICH_ASSERTIONS: readonly string[] = [
  '{element} is visible on screen',
  '{element} shows expected content',
  '{element} displays correct information',
  '{element} is present and readable',
  '{element} content matches expected value',
  '{element} renders without errors',
  '{element} is accessible and visible',
];

const pickAssertionText = (
  alias: string,
  perturbation: PerturbationConfig,
  rng: SeededRng,
): string => {
  if (perturbation.assertionVariation > 0 && rng() < perturbation.assertionVariation) {
    return pick(RICH_ASSERTIONS, rng).replace('{element}', alias);
  }
  return `${alias} handled`;
};

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

// ─── Default template phrasing (deterministic fallback) ───
//
// Tests lexical matching breadth: synonym substitution and template variety.
// Does NOT produce semantically novel phrasing — for that, use an agentic provider.

export const templatePhrasing: PhrasingProvider = (request, rng) => {
  const { action, screenAlias, elementAlias, value } = request;

  if (action === 'navigate') {
    const navText = pick(TEMPLATES.navigate, rng).replace('{screen}', screenAlias);
    return { actionText: navText, expectedText: `${screenAlias} loads successfully`, source: 'template' };
  }

  const alias = elementAlias ?? screenAlias;
  const template = pick(TEMPLATES[action], rng)
    .replace('{screen}', screenAlias)
    .replace('{element}', alias)
    .replace('{value}', value);
  return { actionText: template, expectedText: `${alias} handled`, source: 'template' };
};

const generateStep = (
  element: ScreenElementPlanInput,
  screen: ScreenPlanInput,
  stepIndex: number,
  allScreens: readonly ScreenPlanInput[],
  perturbation: PerturbationConfig,
  rng: SeededRng,
  phrasing: PhrasingProvider,
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
  const value = pickDataValue(element, action, perturbation, rng);

  const phrasingResult = phrasing({
    action,
    screenId: screen.screenId,
    screenAlias: screen.screenAliases[0] ?? humanize(screen.screenId),
    elementId: element.elementId,
    elementAlias: alias,
    value,
  }, rng);

  // Apply vocab perturbation on template-sourced text (agentic text is already diverse)
  const actionText = phrasingResult.source === 'template' && perturbation.vocab > 0
    ? perturbVocab(phrasingResult.actionText, perturbation.vocab, rng)
    : phrasingResult.actionText;

  // Apply assertion variation on template-sourced text
  const expectedText = phrasingResult.source === 'template'
    ? pickAssertionText(alias, perturbation, rng)
    : phrasingResult.expectedText;

  return {
    index: stepIndex,
    intent: actionText,
    action_text: actionText,
    expected_text: expectedText,
  };
};

const NAV_EXPECTATIONS: readonly string[] = [
  'loads successfully', 'is displayed', 'becomes visible', 'opens correctly', 'renders on screen',
];

const generateScenario = (
  screen: ScreenPlanInput,
  strategy: Strategy,
  scenarioIndex: number,
  screens: readonly ScreenPlanInput[],
  perturbation: PerturbationConfig,
  rng: SeededRng,
  phrasing: PhrasingProvider,
): ScenarioPlanInternal => {
  const selectedScreens = strategy === 'cross-screen'
    ? shuffle(screens, rng).slice(0, Math.min(2, screens.length))
    : [screen];

  const navSteps = selectedScreens.map((selected, idx) => {
    const alias = selected.screenAliases[0] ?? humanize(selected.screenId);
    const phrasingResult = phrasing({
      action: 'navigate' as ActionType,
      screenId: selected.screenId,
      screenAlias: alias,
      elementId: null,
      elementAlias: null,
      value: '',
    }, rng);

    // Apply vocab perturbation on template-sourced nav text
    const navText = phrasingResult.source === 'template' && perturbation.vocab > 0
      ? perturbVocab(phrasingResult.actionText, perturbation.vocab, rng)
      : phrasingResult.actionText;

    // Apply assertion variation on template-sourced nav expectations
    const expectedText = phrasingResult.source === 'template' && perturbation.assertionVariation > 0 && rng() < perturbation.assertionVariation
      ? `${alias} ${pick(NAV_EXPECTATIONS, rng)}`
      : phrasingResult.expectedText;

    return { index: idx + 1, intent: navText, action_text: navText, expected_text: expectedText } satisfies SyntheticStep;
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
          phrasing,
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
  const phrasing = input.phrasingProvider ?? templatePhrasing;

  const allocations = Array.from({ length: input.count }, (_, index) => ({
    screen: screens[index % Math.max(screens.length, 1)] ?? { screenId: 'empty', screenAliases: ['empty'], elements: [] },
    strategy: pick((['single-screen', 'workflow', 'cross-screen'] as const), rng),
    index,
  }));

  const plans = allocations.map(({ screen, strategy, index }) => {
    const scenario = generateScenario(screen, strategy, index, screens, perturbation, rng, phrasing);
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
