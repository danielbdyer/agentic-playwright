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

// ─── Deterministic RNG (same algorithm as policy-journey-fuzz.ts) ───

function hashSeed(seed: string): number {
  let hash = 2166136261;
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

// ─── Vocabulary Perturbation (generalization stress test) ───
// These substitutions replace known aliases with synonyms/abbreviations
// that do NOT exist in the knowledge base, testing whether the resolution
// pipeline can generalize beyond memorized vocabulary.

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
];

/** Apply random synonym substitutions to step text, introducing vocabulary
 *  the knowledge base has never seen. Returns perturbed text and a flag. */
function perturbStepText(text: string, perturbationRate: number, rng: () => number): { text: string; perturbed: boolean } {
  let result = text;
  let changed = false;
  for (const [pattern, synonyms] of SYNONYM_SUBSTITUTIONS) {
    if (rng() < perturbationRate && pattern.test(result)) {
      const synonym = synonyms[Math.floor(rng() * synonyms.length)]!;
      result = result.replace(pattern, synonym);
      changed = true;
    }
  }
  return { text: result, perturbed: changed };
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
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  // Navigate to screen
  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Occasionally use colloquial navigation phrasing (20%)
  const navText = rng() < 0.2
    ? pick(COLLOQUIAL_NAVIGATE_TEMPLATES, rng).replace('{screen}', screenAlias)
    : generateActionText('navigate', screenAlias, null, '', rng);
  steps.push({
    index: stepIndex,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  });
  stepIndex += 1;

  // Interact with elements — coverage-aware selection
  const elementCount = Math.min(screen.elements.length, 2 + Math.floor(rng() * 4));
  const usedElements = new Set<string>();

  for (let i = 0; i < elementCount; i += 1) {
    const element = pickCoverageAware(screen, tracker, rng);
    if (usedElements.has(element.elementId) && screen.elements.length > usedElements.size) {
      // Try to pick a different element if possible
      const unused = screen.elements.filter((e) => !usedElements.has(e.elementId));
      if (unused.length > 0) {
        const altElement = pick(unused, rng);
        usedElements.add(altElement.elementId);
        recordElementUsage(tracker, screen.screenId, altElement);
        const step = generateElementStep(altElement, screenAlias, stepIndex, rng);
        steps.push(step);
        stepIndex += 1;
        continue;
      }
    }
    usedElements.add(element.elementId);
    recordElementUsage(tracker, screen.screenId, element);
    const step = generateElementStep(element, screenAlias, stepIndex, rng);
    steps.push(step);
    stepIndex += 1;
  }

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
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Step 1: Navigate
  const navText = generateActionText('navigate', screenAlias, null, '', rng);
  steps.push({
    index: stepIndex,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  });
  stepIndex += 1;

  // Steps 2-N: Fill inputs/selects in order
  const inputElements = screen.elements.filter((e) =>
    classifyWidget(e.widget) === 'input' || classifyWidget(e.widget) === 'select',
  );
  for (const element of shuffle(inputElements, rng).slice(0, 3)) {
    recordElementUsage(tracker, screen.screenId, element);
    const step = generateElementStep(element, screenAlias, stepIndex, rng);
    steps.push(step);
    stepIndex += 1;
  }

  // Step N+1: Click action button
  const clickElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'click');
  if (clickElements.length > 0) {
    const clickEl = pick(clickElements, rng);
    recordElementUsage(tracker, screen.screenId, clickEl);
    const step = generateElementStep(clickEl, screenAlias, stepIndex, rng);
    steps.push(step);
    stepIndex += 1;
  }

  // Step N+2: Assert result
  const assertElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'assert');
  if (assertElements.length > 0) {
    const assertEl = pick(assertElements, rng);
    recordElementUsage(tracker, screen.screenId, assertEl);
    const step = generateElementStep(assertEl, screenAlias, stepIndex, rng);
    steps.push(step);
    stepIndex += 1;
  }

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
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  const screenAlias = screen.screenAliases.length > 0
    ? pick(screen.screenAliases, rng)
    : screen.screenId.replace(/-/g, ' ');

  // Navigate
  const navText = generateActionText('navigate', screenAlias, null, '', rng);
  steps.push({
    index: stepIndex,
    intent: navText,
    action_text: navText,
    expected_text: generateExpectedText('navigate', screenAlias, null),
  });
  stepIndex += 1;

  const assertElements = screen.elements.filter((e) => classifyWidget(e.widget) === 'assert');

  // Negation assertion
  if (assertElements.length > 0) {
    const el = pick(assertElements, rng);
    recordElementUsage(tracker, screen.screenId, el);
    const alias = el.aliases.length > 0
      ? pick(el.aliases, rng)
      : el.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const negText = pick(NEGATION_ASSERT_TEMPLATES, rng).replace('{element}', alias);
    steps.push({
      index: stepIndex,
      intent: negText,
      action_text: negText,
      expected_text: `${alias} is not visible on screen`,
    });
    stepIndex += 1;
  }

  // Compound assertion
  if (assertElements.length >= 2) {
    const shuffled = shuffle(assertElements, rng);
    const el1 = shuffled[0]!;
    const el2 = shuffled[1]!;
    recordElementUsage(tracker, screen.screenId, el1);
    recordElementUsage(tracker, screen.screenId, el2);
    const alias1 = el1.aliases.length > 0 ? pick(el1.aliases, rng) : el1.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const alias2 = el2.aliases.length > 0 ? pick(el2.aliases, rng) : el2.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const compText = pick(COMPOUND_ASSERT_TEMPLATES, rng).replace('{element1}', alias1).replace('{element2}', alias2);
    steps.push({
      index: stepIndex,
      intent: compText,
      action_text: compText,
      expected_text: `${alias1} and ${alias2} are both visible`,
    });
    stepIndex += 1;
  }

  // Regular assertions for remaining elements
  for (const el of shuffle(assertElements, rng).slice(0, 2)) {
    recordElementUsage(tracker, screen.screenId, el);
    const step = generateElementStep(el, screenAlias, stepIndex, rng);
    steps.push(step);
    stepIndex += 1;
  }

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
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  // Pick 2-3 screens for the journey
  const journeyLength = Math.min(screens.length, 2 + Math.floor(rng() * 2));
  const journeyScreens = shuffle(screens, rng).slice(0, journeyLength);

  let prevScreen: string | null = null;
  for (const screen of journeyScreens) {
    if (prevScreen !== null) {
      recordScreenPair(tracker, prevScreen, screen.screenId);
    }
    prevScreen = screen.screenId;

    const screenAlias = screen.screenAliases.length > 0
      ? pick(screen.screenAliases, rng)
      : screen.screenId.replace(/-/g, ' ');
    const navText = generateActionText('navigate', screenAlias, null, '', rng);
    steps.push({
      index: stepIndex,
      intent: navText,
      action_text: navText,
      expected_text: generateExpectedText('navigate', screenAlias, null),
    });
    stepIndex += 1;

    // Pick 1-3 elements from each screen, coverage-aware
    const pickCount = 1 + Math.floor(rng() * 3);
    const usedElements = new Set<string>();
    for (let i = 0; i < pickCount && i < screen.elements.length; i += 1) {
      const element = pickCoverageAware(screen, tracker, rng);
      if (usedElements.has(element.elementId)) continue;
      usedElements.add(element.elementId);
      recordElementUsage(tracker, screen.screenId, element);
      const step = generateElementStep(element, screenAlias, stepIndex, rng);
      steps.push(step);
      stepIndex += 1;
    }
  }

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
): string {
  const lines: string[] = [
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
    '    - synthetic',
    '    - dogfood',
    '  priority: 2',
    '  status: active',
    '  status_detail: null',
    'preconditions:',
    '  - fixture: demoSession',
    'steps:',
  ];

  const q = (s: string): string => s.includes(':') ? `"${s.replace(/"/g, '\\"')}"` : s;

  for (const step of steps) {
    lines.push(
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
    );
  }

  lines.push('postconditions: []');
  return lines.join('\n') + '\n';
}

// ─── Public API ───

export interface GenerateSyntheticScenariosOptions {
  readonly paths: ProjectPaths;
  readonly count: number;
  readonly seed: string;
  readonly outputDir?: string;
  readonly catalog?: import('../catalog').WorkspaceCatalog | undefined;
  /** Rate [0,1] at which step text is perturbed with synonyms NOT in the knowledge base.
   *  0 = no perturbation (default), 0.5 = ~50% of substitution opportunities applied.
   *  Use > 0 to stress-test resolution generalization beyond memorized vocabulary. */
  readonly perturbationRate?: number | undefined;
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
    const files: string[] = [];
    const baseId = 20000;
    const outputDir = options.outputDir ?? `${options.paths.scenariosDir}/synthetic`;
    const tracker = createCoverageTracker(screens);

    yield* fs.ensureDir(outputDir);

    // Pre-allocate scenarios to screens round-robin with strategy mix
    const allocations = buildScreenAllocations(screens, options.count, rng);
    const screenCountMap = new Map<string, number>();

    for (let i = 0; i < allocations.length; i += 1) {
      const adoId = String(baseId + i);
      const allocation = allocations[i]!;
      const isCrossScreen = allocation.strategy === 'cross-screen' && screens.length > 1;

      const scenario = isCrossScreen
        ? generateCrossScreenScenario(screens, i, rng, tracker)
        : allocation.strategy === 'workflow'
          ? generateWorkflowScenario(allocation.screen, i, rng, tracker)
          : allocation.strategy === 'assertion-variant'
            ? generateAssertionVariantScenario(allocation.screen, i, rng, tracker)
            : generateSingleScreenScenario(allocation.screen, i, rng, tracker);

      const screenId = isCrossScreen ? 'cross-screen' : allocation.screen.screenId;
      const suite = `synthetic/${screenId}`;
      const suiteDir = `${outputDir}/${screenId}`;
      yield* fs.ensureDir(suiteDir);

      // Apply vocabulary perturbation if requested (generalization stress test)
      const perturbRate = options.perturbationRate ?? 0;
      const perturbedSteps = perturbRate > 0
        ? scenario.steps.map((step) => {
            const p1 = perturbStepText(step.action_text, perturbRate, rng);
            const p2 = perturbStepText(step.expected_text, perturbRate, rng);
            return p1.perturbed || p2.perturbed
              ? { ...step, action_text: p1.text, expected_text: p2.text, intent: p1.text }
              : step;
          })
        : scenario.steps;

      const yaml = scenarioToYaml(adoId, scenario.title, suite, perturbedSteps);
      const filePath = `${suiteDir}/${adoId}.scenario.yaml`;
      yield* fs.writeText(filePath, yaml);
      files.push(filePath);

      // Track distribution
      screenCountMap.set(screenId, (screenCountMap.get(screenId) ?? 0) + 1);
    }

    const screenDistribution = [...screenCountMap.entries()]
      .map(([screen, count]) => ({ screen, count }))
      .sort((a, b) => b.count - a.count);

    return {
      scenariosGenerated: files.length,
      files,
      screens: screens.map((s) => s.screenId),
      screenDistribution,
    } satisfies GenerateSyntheticScenariosResult;
  });
}
