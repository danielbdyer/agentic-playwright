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

// ─── Phrasing Templates ───

interface PhrasingTemplate {
  readonly navigate: readonly string[];
  readonly input: readonly string[];
  readonly click: readonly string[];
  readonly assert: readonly string[];
}

const PHRASING_TEMPLATES: PhrasingTemplate = {
  navigate: [
    'Navigate to {screen}',
    'Go to the {screen}',
    'Open {screen}',
    'Load the {screen} page',
    'Access {screen}',
    'Visit the {screen}',
    'Browse to {screen}',
    'Switch to {screen}',
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
  ],
  click: [
    'Click {element}',
    'Press the {element}',
    'Tap {element}',
    'Hit the {element}',
    'Select {element}',
    'Activate {element}',
    'Click on the {element}',
    'Trigger {element}',
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
  ],
} as const;

// ─── Element Action Classification ───

function classifyWidget(widget: string): 'input' | 'click' | 'assert' {
  switch (widget) {
    case 'os-input': return 'input';
    case 'os-button': return 'click';
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
  action: 'navigate' | 'input' | 'click' | 'assert',
  screenName: string,
  elementAlias: string | null,
  valueDesc: string,
  rng: () => number,
): string {
  const templates = action === 'navigate'
    ? PHRASING_TEMPLATES.navigate
    : action === 'input'
      ? PHRASING_TEMPLATES.input
      : action === 'click'
        ? PHRASING_TEMPLATES.click
        : PHRASING_TEMPLATES.assert;
  const template = pick(templates, rng);
  return template
    .replace('{screen}', screenName)
    .replace('{element}', elementAlias ?? 'element')
    .replace('{value}', valueDesc);
}

function generateExpectedText(
  action: 'navigate' | 'input' | 'click' | 'assert',
  screenName: string,
  elementAlias: string | null,
): string {
  switch (action) {
    case 'navigate': return `${screenName} loads successfully`;
    case 'input': return `${elementAlias ?? 'field'} accepts the input`;
    case 'click': return `${elementAlias ?? 'button'} action completes`;
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
  readonly screenElements: ReadonlyArray<{ readonly artifact: { readonly screen: string; readonly elements: Record<string, { widget?: string; required?: boolean }> } }>;
  readonly screenHints: ReadonlyArray<{ readonly artifact: { readonly screen: string; readonly screenAliases?: readonly string[]; readonly elements?: Record<string, { aliases?: readonly string[] }> } }>;
}): readonly ScreenInfo[] {
  return catalog.screenElements.map((elemEntry) => {
    const screenId = elemEntry.artifact.screen;
    const hintsEntry = catalog.screenHints.find((h) => h.artifact.screen === screenId);
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

// ─── Scenario Generation Strategies ───

function generateSingleScreenScenario(
  screen: ScreenInfo,
  scenarioIndex: number,
  rng: () => number,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  // Navigate to screen
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

  // Interact with elements in shuffled order
  const shuffledElements = shuffle(screen.elements, rng);
  const elementCount = Math.min(shuffledElements.length, 2 + Math.floor(rng() * 3));

  for (let i = 0; i < elementCount; i += 1) {
    const element = shuffledElements[i]!;
    const action = classifyWidget(element.widget);
    const elementAlias = element.aliases.length > 0
      ? pick(element.aliases, rng)
      : element.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const valueDesc = action === 'input' ? 'a valid value' : '';

    const actionText = generateActionText(action, screenAlias, elementAlias, valueDesc, rng);
    steps.push({
      index: stepIndex,
      intent: actionText,
      action_text: actionText,
      expected_text: generateExpectedText(action, screenAlias, elementAlias),
    });
    stepIndex += 1;
  }

  return {
    steps,
    title: `Synthetic scenario ${scenarioIndex}: ${screen.screenId} with ${steps.length} steps`,
  };
}

function generateCrossScreenScenario(
  screens: readonly ScreenInfo[],
  scenarioIndex: number,
  rng: () => number,
): { readonly steps: readonly SyntheticStep[]; readonly title: string } {
  const steps: SyntheticStep[] = [];
  let stepIndex = 1;

  for (const screen of screens) {
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

    // Pick 1-2 elements from each screen
    const picked = shuffle(screen.elements, rng).slice(0, 1 + Math.floor(rng() * 2));
    for (const element of picked) {
      const action = classifyWidget(element.widget);
      const elementAlias = element.aliases.length > 0
        ? pick(element.aliases, rng)
        : element.elementId.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
      const valueDesc = action === 'input' ? 'test data' : '';

      const actionText = generateActionText(action, screenAlias, elementAlias, valueDesc, rng);
      steps.push({
        index: stepIndex,
        intent: actionText,
        action_text: actionText,
        expected_text: generateExpectedText(action, screenAlias, elementAlias),
      });
      stepIndex += 1;
    }
  }

  return {
    steps,
    title: `Synthetic cross-screen scenario ${scenarioIndex}`,
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
}

export interface GenerateSyntheticScenariosResult {
  readonly scenariosGenerated: number;
  readonly files: readonly string[];
  readonly screens: readonly string[];
}

export function generateSyntheticScenarios(options: GenerateSyntheticScenariosOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const screens = extractScreenInfo(catalog);
    const rng = createRng(options.seed);
    const files: string[] = [];
    const baseId = 20000;
    const outputDir = options.outputDir ?? `${options.paths.rootDir}/scenarios/synthetic`;

    yield* fs.ensureDir(outputDir);

    for (let i = 0; i < options.count; i += 1) {
      const adoId = String(baseId + i);
      const isCrossScreen = screens.length > 1 && rng() < 0.3;
      const scenario = isCrossScreen
        ? generateCrossScreenScenario(screens, i, rng)
        : generateSingleScreenScenario(pick(screens, rng), i, rng);

      const primaryScreen = screens[0]!.screenId;
      const suite = isCrossScreen
        ? 'synthetic/cross-screen'
        : `synthetic/${primaryScreen}`;

      const suiteDir = `${outputDir}/${isCrossScreen ? 'cross-screen' : primaryScreen}`;
      yield* fs.ensureDir(suiteDir);

      const yaml = scenarioToYaml(adoId, scenario.title, suite, scenario.steps);
      const filePath = `${suiteDir}/${adoId}.scenario.yaml`;
      yield* fs.writeText(filePath, yaml);
      files.push(filePath);
    }

    return {
      scenariosGenerated: files.length,
      files,
      screens: screens.map((s) => s.screenId),
    } satisfies GenerateSyntheticScenariosResult;
  });
}
