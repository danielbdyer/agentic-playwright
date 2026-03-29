/**
 * Synthetic scenario generator.
 *
 * Walks the knowledge model (screens, elements, hints, behaviors, transitions)
 * and produces scenario YAML files with varied phrasings that exercise the
 * translation pipeline and proposal generation. Uses deterministic seeded RNG
 * for reproducibility.
 */

import { Effect } from 'effect';
import { FileSystem } from '../ports';
import { loadWorkspaceCatalog } from '../catalog';
import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog } from '../catalog';

// ─── Deterministic RNG (same algorithm as policy-journey-fuzz.ts) ───

function hashSeed(seed: string): number {
  // eslint-disable-next-line no-restricted-syntax -- baseline: imperative hash computation
  let hash = 2166136261;
  // eslint-disable-next-line no-restricted-syntax -- baseline: imperative hash computation
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<T>(array: readonly T[], rng: () => number): T {
  return array[Math.floor(rng() * array.length)]!;
}

function shuffle<T>(input: readonly T[], rng: () => number): readonly T[] {
  const result = [...input];
  // eslint-disable-next-line no-restricted-syntax -- baseline: Fisher-Yates requires index-based swap
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

// ─── Action Types ───

type ActionType = 'navigate' | 'input' | 'click' | 'select' | 'assert';

// ─── Phrasing Templates (16 per action for diversity) ───

const PHRASING_TEMPLATES: Readonly<Record<ActionType, readonly string[]>> = {
  navigate: [
    'Navigate to {screen}',
    'Go to the {screen}',
    'Open {screen}',
    'Load the {screen} page',
    'Access {screen}',
    'Visit the {screen}',
    'Browse to {screen}',
    'Switch to {screen}',
    'Head over to {screen}',
    'Pull up the {screen}',
    'Jump to {screen}',
    'Move to the {screen} page',
    'Bring up {screen}',
    'Go ahead and open {screen}',
    'Get to the {screen}',
    'Take me to {screen}',
  ],
  input: [
    'Enter {value} in {element}',
    'Type {value} into the {element}',
    'Fill in {element} with {value}',
    'Input {value} in the {element}',
    'Set {element} to {value}',
    'Put {value} in {element} field',
    'Provide {value} for {element}',
    'Key in {value} at {element}',
    'Write {value} in the {element}',
    'Populate {element} with {value}',
    'In the {element} field enter {value}',
    'For {element} use {value}',
    'Supply {value} to {element}',
    'Fill out the {element} with {value}',
    'Update {element} to say {value}',
    'Place {value} into the {element} field',
  ],
  click: [
    'Click {element}',
    'Press the {element}',
    'Tap {element}',
    'Hit the {element}',
    'Click on {element}',
    'Activate {element}',
    'Click on the {element}',
    'Trigger {element}',
    'Use the {element}',
    'Push the {element}',
    'Press {element} button',
    'Go ahead and click {element}',
    'Tap on the {element}',
    'Click the {element} button',
    'Hit {element}',
    'Smash that {element}',
  ],
  select: [
    'Select {value} from {element}',
    'Choose {value} in the {element}',
    'Pick {value} from {element} dropdown',
    'Set {element} to {value}',
    'From {element} choose {value}',
    'In the {element} dropdown select {value}',
    'Change {element} to {value}',
    'Switch {element} to {value}',
    'Use {element} to pick {value}',
    'Select the {value} option in {element}',
    'From the {element} list choose {value}',
    'Set the {element} dropdown to {value}',
    'Pick {value} in {element}',
    'Change the {element} to show {value}',
    'Under {element} select {value}',
    'Go to {element} and pick {value}',
  ],
  assert: [
    'Verify {element} is visible',
    'Check that {element} is displayed',
    'Confirm {element} appears',
    'Assert {element} is shown',
    'Validate {element} is present',
    'Ensure {element} can be seen',
    'See that {element} is on screen',
    'Observe {element} content',
    'Make sure {element} is there',
    'Look for {element} on the page',
    'Verify that {element} shows up',
    'Confirm that {element} is on screen',
    'Check {element} is present',
    '{element} should be visible',
    'The {element} must be displayed',
    'Expect {element} to appear',
  ],
} as const;

// ─── Negation and compound assertion templates ───

const NEGATION_ASSERT_TEMPLATES: readonly string[] = [
  'Verify {element} is NOT visible',
  'Confirm {element} does not appear',
  'Check that {element} is hidden',
  'Ensure {element} is not displayed',
  '{element} should not be visible',
  'Assert {element} is not shown',
];

const COMPOUND_ASSERT_TEMPLATES: readonly string[] = [
  'Check that {element1} and {element2} are both displayed',
  'Verify both {element1} and {element2} are visible',
  'Confirm {element1} and {element2} appear on screen',
  'Ensure {element1} is visible along with {element2}',
];

// ─── Colloquial/imprecise phrasing templates ───

const COLLOQUIAL_NAVIGATE_TEMPLATES: readonly string[] = [
  'Go check out the {screen}',
  'Show me the {screen}',
  'I want to see {screen}',
  'Can you open {screen}',
  'Lets look at {screen}',
  'Find the {screen}',
];

const COLLOQUIAL_ACTION_TEMPLATES: readonly string[] = [
  'Make sure the {element} works',
  'Try the {element}',
  'Use the {element} thing',
  'Do the {element}',
  'Interact with {element}',
  'Look at the {element}',
];

// ─── Multi-Signal Perturbation (generalization stress tests) ───
//
// Four orthogonal perturbation modes, each stressing a different bottleneck
// signal. Modes are independent and composable — applying all four
// simultaneously creates a realistic distribution of failure classes.
//
// Mode 1 (vocab):         translation-fallback-dominant signal
// Mode 2 (alias-gap):     high-unresolved-rate signal
// Mode 3 (cross-screen):  repair-recovery-hotspot signal
// Mode 4 (coverage-gap):  thin-screen-coverage signal

/** Perturbation configuration — all four modes are independent [0,1] rates. */
export interface PerturbationConfig {
  /** Replace known aliases with unseen synonyms. Stresses translation normalization. */
  readonly vocab: number;
  /** Randomly use the raw elementId instead of a known alias. Stresses unresolved resolution. */
  readonly aliasGap: number;
  /** Force cross-screen element references (use an alias from a DIFFERENT screen). Stresses repair/recovery. */
  readonly crossScreen: number;
  /** Skip some elements entirely, leaving coverage gaps. Stresses thin-screen detection. */
  readonly coverageGap: number;
}

export const ZERO_PERTURBATION: PerturbationConfig = { vocab: 0, aliasGap: 0, crossScreen: 0, coverageGap: 0 };

/** Build perturbation config from a single rate (backward-compatible) or a full config. */
export function resolvePerturbation(rate?: number, config?: Partial<PerturbationConfig>): PerturbationConfig {
  if (config) return { ...ZERO_PERTURBATION, ...config };
  if (rate && rate > 0) return { ...ZERO_PERTURBATION, vocab: rate };
  return ZERO_PERTURBATION;
}

const SYNONYM_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/\bpolicy\b/gi, ['insurance record', 'coverage', 'pol', 'acct policy']],
  [/\bsearch\b/gi, ['find', 'lookup', 'query', 'look up']],
  [/\bresults?\b/gi, ['outcome', 'matches', 'hits', 'findings']],
  [/\bbutton\b/gi, ['btn', 'control', 'action']],
  [/\bfield\b/gi, ['input', 'box', 'entry', 'textbox']],
  [/\btable\b/gi, ['grid', 'list', 'data view']],
  [/\benter\b/gi, ['type', 'key in', 'put', 'input']],
  [/\bclick\b/gi, ['press', 'tap', 'hit', 'activate']],
  [/\bnavigate\b/gi, ['go', 'proceed', 'head']],
  [/\bscreen\b/gi, ['page', 'view', 'form']],
  [/\bnumber\b/gi, ['num', 'no', '#', 'ID']],
  [/\bdetail\b/gi, ['info', 'summary', 'overview']],
  [/\bverify\b/gi, ['check', 'confirm', 'validate', 'assert']],
  [/\bopen\b/gi, ['launch', 'pull up', 'bring up']],
  [/\beffective date\b/gi, ['start date', 'inception date', 'eff date']],
  [/\bclaims?\b/gi, ['incidents', 'cases', 'filings']],
  [/\bstatus\b/gi, ['state', 'condition', 'disposition']],
  [/\bvalidation\b/gi, ['error', 'warning', 'alert']],
  [/\bamendment\b/gi, ['change request', 'modification', 'revision']],
  [/\breview\b/gi, ['approve', 'inspect', 'examine']],
];

/** Mode 1: Synonym replacement — introduces vocabulary the knowledge base has never seen. */
function perturbVocab(text: string, rate: number, rng: () => number): string {
  return SYNONYM_SUBSTITUTIONS.reduce(
    (result, [pattern, synonyms]) =>
      rng() < rate && pattern.test(result)
        ? result.replace(pattern, synonyms[Math.floor(rng() * synonyms.length)]!)
        : result,
    text,
  );
}

/** Mode 2: Alias gap — use the raw camelCase elementId instead of a human-readable alias.
 *  This creates steps the knowledge base can't resolve via alias matching. */
function _perturbAliasGap(
  elementAlias: string,
  elementId: string,
  rate: number,
  rng: () => number,
): string {
  return rng() < rate ? elementId : elementAlias;
}

/** Mode 3: Cross-screen confusion — substitute an element alias from a DIFFERENT screen.
 *  This creates ambiguous steps that reference elements on the wrong screen. */
function _perturbCrossScreen(
  elementAlias: string,
  currentScreen: ScreenInfo,
  allScreens: readonly ScreenInfo[],
  rate: number,
  rng: () => number,
): string {
  if (rng() >= rate || allScreens.length < 2) return elementAlias;
  const otherScreens = allScreens.filter((s) => s.screenId !== currentScreen.screenId);
  const otherScreen = pick(otherScreens, rng);
  const otherElement = pick(otherScreen.elements, rng);
  return otherElement.aliases.length > 0 ? pick(otherElement.aliases, rng) : otherElement.elementId;
}

/** Mode 4: Coverage gap — skip this element entirely (return null to signal omission). */
function perturbCoverageGap(rate: number, rng: () => number): boolean {
  return rng() < rate;
}

/** Apply all perturbation modes to a generated step. Pure function. */
function applyPerturbations(
  step: SyntheticStep,
  config: PerturbationConfig,
  rng: () => number,
): SyntheticStep {
  const vocabAction = config.vocab > 0 ? perturbVocab(step.action_text, config.vocab, rng) : step.action_text;
  const vocabExpected = config.vocab > 0 ? perturbVocab(step.expected_text, config.vocab, rng) : step.expected_text;
  return vocabAction !== step.action_text || vocabExpected !== step.expected_text
    ? { ...step, action_text: vocabAction, expected_text: vocabExpected, intent: vocabAction }
    : step;
}

// Backward-compatible wrapper
function _perturbStepText(text: string, perturbationRate: number, rng: () => number): { text: string; perturbed: boolean } {
  const result = perturbVocab(text, perturbationRate, rng);
  return { text: result, perturbed: result !== text };
}

// ─── Element Action Classification ───

function classifyWidget(widget: string): ActionType {
  switch (widget) {
    case 'os-input': return 'input';
    case 'os-textarea': return 'input';
    case 'os-button': return 'click';
    case 'os-select': return 'select';
    case 'os-table': return 'assert';
    case 'os-region': return 'assert';
    default: return 'assert';
  }
}

// ─── Scenario Step Generation ───

interface SyntheticStep {
  readonly index: number;
  readonly intent: string;
  readonly action_text: string;
  readonly expected_text: string;
}

function generateActionText(
  action: ActionType,
  screenName: string,
  elementAlias: string | null,
  valueDesc: string,
  rng: () => number,
): string {
  const templates = PHRASING_TEMPLATES[action];
  const template = pick(templates, rng);
  return template
    .replace('{screen}', screenName)
    .replace('{element}', elementAlias ?? 'element')
    .replace('{value}', valueDesc);
}

function generateExpectedText(
  action: ActionType,
  _screenName: string,
  elementAlias: string | null,
): string {
  switch (action) {
    case 'navigate': return `${_screenName} loads successfully`;
    case 'input': return `${elementAlias ?? 'field'} accepts the input`;
    case 'click': return `${elementAlias ?? 'button'} action completes`;
    case 'select': return `${elementAlias ?? 'dropdown'} shows the selected value`;
    case 'assert': return `${elementAlias ?? 'element'} is visible on screen`;
  }
}

// ─── Screen Knowledge Extraction ───

interface ScreenElementInfo {
  readonly elementId: string;
  readonly widget: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
}

interface ScreenInfo {
  readonly screenId: string;
  readonly screenAliases: readonly string[];
  readonly elements: readonly ScreenElementInfo[];
}

function extractScreenInfo(catalog: {
  readonly screenElements: ReadonlyArray<{ readonly artifact: { readonly screen: string; readonly elements: Record<string, { widget?: string | undefined; required?: boolean | undefined }> } }>;
  readonly screenHints: ReadonlyArray<{ readonly artifact: { readonly screen: string; readonly screenAliases?: readonly string[] | undefined; readonly elements?: Record<string, { aliases?: readonly string[] | undefined }> | undefined } }>;
}): readonly ScreenInfo[] {
  // Pre-index hints by screen: O(M) build, then O(1) lookups per element entry
  const hintsByScreen = new Map(catalog.screenHints.map((h) => [h.artifact.screen, h]));
  return catalog.screenElements.map((elemEntry) => {
    const screenId = elemEntry.artifact.screen;
    const hintsEntry = hintsByScreen.get(screenId);
    const screenAliases = hintsEntry?.artifact.screenAliases ?? [];
    const elements = Object.entries(elemEntry.artifact.elements).map(([elementId, elem]) => {
      const hintAliases = hintsEntry?.artifact.elements?.[elementId]?.aliases ?? [];
      return {
        elementId,
        widget: elem.widget ?? 'os-region',
        aliases: hintAliases,
        required: elem.required ?? false,
      };
    });
    return { screenId, screenAliases, elements };
  });
}

// ─── Coverage Tracking ───

interface CoverageTracker {
  readonly elementHits: Map<string, number>;
  readonly widgetTypeHits: Map<string, number>;
  readonly screenPairHits: Map<string, number>;
}

function createCoverageTracker(screens: readonly ScreenInfo[]): CoverageTracker {
  const elementHits = new Map<string, number>();
  const widgetTypeHits = new Map<string, number>();
  const screenPairHits = new Map<string, number>();

  for (const screen of screens) {
    for (const element of screen.elements) {
      elementHits.set(`${screen.screenId}:${element.elementId}`, 0);
      widgetTypeHits.set(element.widget, 0);
    }
  }
  return { elementHits, widgetTypeHits, screenPairHits };
}

function recordElementUsage(
  tracker: CoverageTracker,
  screenId: string,
  element: ScreenElementInfo,
): void {
  const key = `${screenId}:${element.elementId}`;
  tracker.elementHits.set(key, (tracker.elementHits.get(key) ?? 0) + 1);
  tracker.widgetTypeHits.set(element.widget, (tracker.widgetTypeHits.get(element.widget) ?? 0) + 1);
}

function recordScreenPair(tracker: CoverageTracker, from: string, to: string): void {
  const key = `${from}->${to}`;
  tracker.screenPairHits.set(key, (tracker.screenPairHits.get(key) ?? 0) + 1);
}

/** Pick element with preference for under-covered elements. */
function pickCoverageAware(
  screen: ScreenInfo,
  tracker: CoverageTracker,
  rng: () => number,
): ScreenElementInfo {
  const withCoverage = screen.elements.map((el) => ({
    element: el,
    hits: tracker.elementHits.get(`${screen.screenId}:${el.elementId}`) ?? 0,
  }));
  const minHits = Math.min(...withCoverage.map((e) => e.hits));
  const underCovered = withCoverage.filter((e) => e.hits === minHits);
  return pick(underCovered, rng).element;
}

// ─── Scenario Generation Strategies ───

function generateSingleScreenScenario(
  screen: ScreenInfo,
  scenarioIndex: number,
  rng: () => number,
  tracker: CoverageTracker,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  // Navigate to screen
  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Occasionally use colloquial navigation phrasing (20%)
  const navText = rng() < 0.2
    ? pick(COLLOQUIAL_NAVIGATE_TEMPLATES, rng).replace('{screen}', screenAlias)
    : generateActionText('navigate', screenAlias, null, '', rng);
  const navStep: SyntheticStep = {
    index: 1,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  };

  // Interact with elements — coverage-aware selection
  const elementCount = Math.min(screen.elements.length, 2 + Math.floor(rng() * 4));

  const buildElementSteps = (
    remaining: number,
    acc: readonly SyntheticStep[],
    used: ReadonlySet<string>,
    nextIndex: number,
  ): readonly SyntheticStep[] => {
    if (remaining <= 0) return acc;
    const element = pickCoverageAware(screen, tracker, rng);
    if (element.elementId && used.has(element.elementId) && screen.elements.length > used.size) {
      const unused = screen.elements.filter((e) => !used.has(e.elementId));
      if (unused.length > 0) {
        const altElement = pick(unused, rng);
        recordElementUsage(tracker, screen.screenId, altElement);
        const step = generateElementStep(altElement, screenAlias, nextIndex, rng);
        return buildElementSteps(remaining - 1, [...acc, step], new Set([...used, altElement.elementId]), nextIndex + 1);
      }
    }
    recordElementUsage(tracker, screen.screenId, element);
    const step = generateElementStep(element, screenAlias, nextIndex, rng);
    return buildElementSteps(remaining - 1, [...acc, step], new Set([...used, element.elementId]), nextIndex + 1);
  };

  const elementSteps = buildElementSteps(elementCount, [], new Set<string>(), 2);
  const steps = [navStep, ...elementSteps];

  return {
    steps,
    title: `Synthetic scenario ${scenarioIndex}: ${screen.screenId} with ${steps.length} steps`,
  };
}

/** Generate a step for an element interaction. */
function generateElementStep(
  element: ScreenElementInfo,
  screenAlias: string,
  stepIndex: number,
  rng: () => number,
): SyntheticStep {
  const action = classifyWidget(element.widget);
  const elementAlias = element.aliases.length > 0
    ? pick(element.aliases, rng)
    : element.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();

  // Occasionally use colloquial phrasing (10%)
  if (rng() < 0.1 && action === 'assert') {
    const colloquialText = pick(COLLOQUIAL_ACTION_TEMPLATES, rng).replace('{element}', elementAlias);
    return {
      index: stepIndex,
      intent: colloquialText,
      action_text: colloquialText,
      expected_text: generateExpectedText(action, screenAlias, elementAlias),
    };
  }

  const valueDesc = action === 'input' ? 'a valid value'
    : action === 'select' ? 'the correct option'
    : '';

  const actionText = generateActionText(action, screenAlias, elementAlias, valueDesc, rng);
  return {
    index: stepIndex,
    intent: actionText,
    action_text: actionText,
    expected_text: generateExpectedText(action, screenAlias, elementAlias),
  };
}

/** Generate a structured workflow: navigate → input fields → click → assert results. */
function generateWorkflowScenario(
  screen: ScreenInfo,
  scenarioIndex: number,
  rng: () => number,
  tracker: CoverageTracker,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Step 1: Navigate
  const navText = generateActionText('navigate', screenAlias, null, '', rng);
  const navStep: SyntheticStep = {
    index: 1,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  };

  // Steps 2-N: Fill inputs/selects in order
  const inputElements = screen.elements.filter((e) =>
    classifyWidget(e.widget) === 'input' || classifyWidget(e.widget) === 'select',
  );
  const inputSteps = shuffle(inputElements, rng).slice(0, 3).map((element, i) => {
    recordElementUsage(tracker, screen.screenId, element);
    return generateElementStep(element, screenAlias, 2 + i, rng);
  });

  // Step N+1: Click action button
  const clickElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'click');
  const clickSteps = clickElements.length > 0 ? (() => {
    const clickEl = pick(clickElements, rng);
    recordElementUsage(tracker, screen.screenId, clickEl);
    return [generateElementStep(clickEl, screenAlias, 2 + inputSteps.length, rng)];
  })() : [];

  // Step N+2: Assert result
  const assertElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'assert');
  const assertSteps = assertElements.length > 0 ? (() => {
    const assertEl = pick(assertElements, rng);
    recordElementUsage(tracker, screen.screenId, assertEl);
    return [generateElementStep(assertEl, screenAlias, 2 + inputSteps.length + clickSteps.length, rng)];
  })() : [];

  const steps = [navStep, ...inputSteps, ...clickSteps, ...assertSteps];

  return {
    steps,
    title: `Synthetic workflow ${scenarioIndex}: ${screen.screenId} form-fill-verify`,
  };
}

/** Generate a negation/compound assertion scenario. */
function generateAssertionVariantScenario(
  screen: ScreenInfo,
  scenarioIndex: number,
  rng: () => number,
  tracker: CoverageTracker,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Navigate
  const navText = generateActionText('navigate', screenAlias, null, '', rng);
  const navStep: SyntheticStep = {
    index: 1,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  };

  const assertElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'assert');
  let nextIndex = 2;

  // Negation assertion
  const negationSteps: readonly SyntheticStep[] = assertElements.length > 0 ? (() => {
    const el = pick(assertElements, rng);
    recordElementUsage(tracker, screen.screenId, el);
    const alias = el.aliases.length > 0
      ? pick(el.aliases, rng)
      : el.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const negText = pick(NEGATION_ASSERT_TEMPLATES, rng).replace('{element}', alias);
    const step: SyntheticStep = {
      index: nextIndex,
      intent: negText,
      action_text: negText,
      expected_text: `${alias} is not visible on screen`,
    };
    nextIndex += 1;
    return [step];
  })() : [];

  // Compound assertion
  const compoundSteps: readonly SyntheticStep[] = assertElements.length >= 2 ? (() => {
    const shuffled = shuffle(assertElements, rng);
    const el1 = shuffled[0]!;
    const el2 = shuffled[1]!;
    recordElementUsage(tracker, screen.screenId, el1);
    recordElementUsage(tracker, screen.screenId, el2);
    const alias1 = el1.aliases.length > 0 ? pick(el1.aliases, rng) : el1.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const alias2 = el2.aliases.length > 0 ? pick(el2.aliases, rng) : el2.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const compText = pick(COMPOUND_ASSERT_TEMPLATES, rng).replace('{element1}', alias1).replace('{element2}', alias2);
    const step: SyntheticStep = {
      index: nextIndex,
      intent: compText,
      action_text: compText,
      expected_text: `${alias1} and ${alias2} are both visible`,
    };
    nextIndex += 1;
    return [step];
  })() : [];

  // Regular assertions for remaining elements
  const regularSteps = shuffle(assertElements, rng).slice(0, 2).map((el) => {
    recordElementUsage(tracker, screen.screenId, el);
    const step = generateElementStep(el, screenAlias, nextIndex, rng);
    nextIndex += 1;
    return step;
  });

  const steps = [navStep, ...negationSteps, ...compoundSteps, ...regularSteps];

  return {
    steps,
    title: `Synthetic assertion-variant ${scenarioIndex}: ${screen.screenId}`,
  };
}

function generateCrossScreenScenario(
  screens: readonly ScreenInfo[],
  scenarioIndex: number,
  rng: () => number,
  tracker: CoverageTracker,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  // Pick 2-3 screens for the journey
  const journeyLength = Math.min(screens.length, 2 + Math.floor(rng() * 2));
  const journeyScreens = shuffle(screens, rng).slice(0, journeyLength);

  const buildScreenElementSteps = (
    count: number,
    screen: ScreenInfo,
    screenAlias: string,
    startIndex: number,
    used: ReadonlySet<string>,
  ): readonly SyntheticStep[] => {
    if (count <= 0 || used.size >= screen.elements.length) return [];
    const element = pickCoverageAware(screen, tracker, rng);
    if (used.has(element.elementId)) return buildScreenElementSteps(count - 1, screen, screenAlias, startIndex, used);
    recordElementUsage(tracker, screen.screenId, element);
    const step = generateElementStep(element, screenAlias, startIndex, rng);
    return [step, ...buildScreenElementSteps(count - 1, screen, screenAlias, startIndex + 1, new Set([...used, element.elementId]))];
  };

  const processScreens = (
    remaining: readonly ScreenInfo[],
    acc: readonly SyntheticStep[],
    nextIndex: number,
    prev: string | null,
  ): readonly SyntheticStep[] => {
    if (remaining.length === 0) return acc;
    const [screen, ...rest] = remaining;
    if (prev !== null) recordScreenPair(tracker, prev, screen!.screenId);

    const screenAlias = screen!.screenAliases.length > 0
      ? pick(screen!.screenAliases, rng)
      : screen!.screenId.replace(/-/g, ' ');
    const navText = generateActionText('navigate', screenAlias, null, '', rng);
    const navStep: SyntheticStep = {
      index: nextIndex,
      intent: navText,
      action_text: navText,
      expected_text: generateExpectedText('navigate', screenAlias, null),
    };

    const pickCount = 1 + Math.floor(rng() * 3);
    const elSteps = buildScreenElementSteps(pickCount, screen!, screenAlias, nextIndex + 1, new Set<string>());

    return processScreens(rest, [...acc, navStep, ...elSteps], nextIndex + 1 + elSteps.length, screen!.screenId);
  };

  const steps = processScreens(journeyScreens, [], 1, null);

  const screenNames = journeyScreens.map((s) => s.screenId).join(' → ');
  return {
    steps,
    title: `Synthetic cross-screen ${scenarioIndex}: ${screenNames}`,
  };
}

// ─── Scenario YAML Serialization ───

function scenarioToYaml(
  adoId: string,
  title: string,
  suite: string,
  steps: readonly SyntheticStep[],
  extraTags: readonly string[] = [],
): string {
  const allTags = ['synthetic', 'dogfood', ...extraTags];
  const q = (s: string): string => s.includes(':') ? `"${s.replace(/"/g, '\\"')}"` : s;

  const lines = [
    'source:',
    `  ado_id: "${adoId}"`,
    '  revision: 1',
    `  content_hash: sha256:synthetic-${adoId}`,
    `  synced_at: ${new Date().toISOString()}`,
    '  origin: synthetic',
    'metadata:',
    `  title: "${title.replace(/"/g, '\\"')}"`,
    `  suite: ${suite}`,
    '  tags:',
    ...allTags.map((tag) => `    - ${tag}`),
    '  priority: 2',
    '  status: active',
    '  status_detail: null',
    'preconditions:',
    '  - fixture: demoSession',
    'steps:',
    ...steps.flatMap((step) => [
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
  ];
  return lines.join('\n') + '\n';
}

// ─── Public API ───

export interface GenerateSyntheticScenariosOptions {
  readonly paths: ProjectPaths;
  readonly count: number;
  readonly seed: string;
  readonly outputDir?: string;
  readonly catalog?: WorkspaceCatalog | undefined;
  /** Rate [0,1] at which step text is perturbed with synonyms NOT in the knowledge base.
   *  0 = no perturbation (default). Shorthand for { vocab: rate }. */
  readonly perturbationRate?: number | undefined;
  /** Fine-grained perturbation control — four independent modes.
   *  Overrides perturbationRate when provided. */
  readonly perturbation?: Partial<PerturbationConfig> | undefined;
  /** Fraction of scenarios tagged as 'validation-heldout' (0.0-1.0).
   *  Remaining scenarios tagged as 'training'. Default 0 (all training). */
  readonly validationSplit?: number | undefined;
}

export interface GenerateSyntheticScenariosResult {
  readonly scenariosGenerated: number;
  readonly files: readonly string[];
  readonly screens: readonly string[];
  readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

type ScenarioStrategy = 'single-screen' | 'cross-screen' | 'workflow' | 'assertion-variant';

interface ScreenAllocation {
  readonly screen: ScreenInfo;
  readonly strategy: ScenarioStrategy;
}

/**
 * Distribute scenario count across screens round-robin, then assign strategies
 * within each screen's allocation. Cross-screen scenarios are pulled from
 * a proportional budget rather than being assigned to a single screen.
 *
 * Strategy mix: 40% single-screen, 30% cross-screen, 20% workflow, 10% assertion-variant.
 */
function buildScreenAllocations(
  screens: readonly ScreenInfo[],
  count: number,
  rng: () => number,
): readonly ScreenAllocation[] {
  if (screens.length === 0) {
    return [];
  }

  // Reserve cross-screen budget (30% of total)
  const crossScreenBudget = Math.round(count * 0.3);
  const perScreenBudget = count - crossScreenBudget;

  // Round-robin base allocation for per-screen scenarios
  const basePerScreen = Math.floor(perScreenBudget / screens.length);
  const remainder = perScreenBudget - basePerScreen * screens.length;

  // Each screen gets basePerScreen, first `remainder` screens get +1
  const screenCounts = screens.map((_, idx) =>
    basePerScreen + (idx < remainder ? 1 : 0),
  );

  // Within each screen's allocation, apply strategy mix:
  // single-screen ~57%, workflow ~29%, assertion-variant ~14%
  // (normalized from 40/20/10 after removing cross-screen)
  const perScreenAllocations: ScreenAllocation[] = screenCounts.flatMap(
    (screenCount, screenIdx) => {
      const screen = screens[screenIdx]!;
      const workflowCount = Math.round(screenCount * (20 / 70));
      const assertionCount = Math.round(screenCount * (10 / 70));
      const singleCount = screenCount - workflowCount - assertionCount;

      return [
        ...Array.from({ length: singleCount }, (): ScreenAllocation => ({ screen, strategy: 'single-screen' })),
        ...Array.from({ length: workflowCount }, (): ScreenAllocation => ({ screen, strategy: 'workflow' })),
        ...Array.from({ length: assertionCount }, (): ScreenAllocation => ({ screen, strategy: 'assertion-variant' })),
      ];
    },
  );

  // Cross-screen scenarios (not bound to a single screen)
  const crossScreenAllocations: ScreenAllocation[] = Array.from(
    { length: crossScreenBudget },
    (): ScreenAllocation => ({ screen: screens[0]!, strategy: 'cross-screen' }),
  );

  // Shuffle to interleave strategies and screens
  return shuffle([...perScreenAllocations, ...crossScreenAllocations], rng);
}

export function generateSyntheticScenarios(options: GenerateSyntheticScenariosOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const screens = extractScreenInfo(catalog);
    const rng = createRng(options.seed);
    const baseId = 20000;
    const outputDir = options.outputDir ?? `${options.paths.scenariosDir}/synthetic`;
    const tracker = createCoverageTracker(screens);

    yield* fs.ensureDir(outputDir);

    // Pre-allocate scenarios to screens round-robin with strategy mix
    const allocations = buildScreenAllocations(screens, options.count, rng);

    type GenAcc = {
      readonly files: readonly string[];
      readonly screenCounts: ReadonlyMap<string, number>;
    };

    const genStep = (
      idx: number,
      acc: GenAcc,
    ): Effect.Effect<GenAcc, unknown, FileSystem> =>
      Effect.gen(function* () {
        if (idx >= allocations.length) return acc;
        const adoId = String(baseId + idx);
        const allocation = allocations[idx]!;
        const isCrossScreen = allocation.strategy === 'cross-screen' && screens.length > 1;

        const scenario = isCrossScreen
          ? generateCrossScreenScenario(screens, idx, rng, tracker)
          : allocation.strategy === 'workflow'
            ? generateWorkflowScenario(allocation.screen, idx, rng, tracker)
            : allocation.strategy === 'assertion-variant'
              ? generateAssertionVariantScenario(allocation.screen, idx, rng, tracker)
              : generateSingleScreenScenario(allocation.screen, idx, rng, tracker);

        const screenId = isCrossScreen ? 'cross-screen' : allocation.screen.screenId;
        const suite = `synthetic/${screenId}`;
        const suiteDir = `${outputDir}/${screenId}`;
        yield* fs.ensureDir(suiteDir);

        // Apply multi-signal perturbation if requested (generalization stress test).
        const perturbConfig = resolvePerturbation(options.perturbationRate, options.perturbation);
        const hasPerturbation = perturbConfig.vocab > 0 || perturbConfig.aliasGap > 0
          || perturbConfig.crossScreen > 0 || perturbConfig.coverageGap > 0;
        const perturbedSteps = hasPerturbation
          ? scenario.steps
              .flatMap((step) => perturbCoverageGap(perturbConfig.coverageGap, rng) ? [] : [applyPerturbations(step, perturbConfig, rng)])
          : scenario.steps;

        const splitRate = options.validationSplit ?? 0;
        const partitionTag = splitRate > 0 && rng() < splitRate ? 'validation-heldout' : 'training';
        const yaml = scenarioToYaml(adoId, scenario.title, suite, perturbedSteps, splitRate > 0 ? [partitionTag] : []);
        const filePath = `${suiteDir}/${adoId}.scenario.yaml`;
        yield* fs.writeText(filePath, yaml);

        return yield* genStep(idx + 1, {
          files: [...acc.files, filePath],
          screenCounts: new Map([...acc.screenCounts, [screenId, (acc.screenCounts.get(screenId) ?? 0) + 1]]),
        });
      });

    const genResult = yield* genStep(0, { files: [], screenCounts: new Map() });

    const screenDistribution = [...genResult.screenCounts.entries()]
      .map(([screen, count]) => ({ screen, count }))
      .sort((a, b) => b.count - a.count);

    return {
      scenariosGenerated: genResult.files.length,
      files: [...genResult.files],
      screens: screens.map((s) => s.screenId),
      screenDistribution,
    } satisfies GenerateSyntheticScenariosResult;
  });
}
