import { expect, test } from '@playwright/test';
import { planSyntheticScenarios, resolvePerturbation } from '../lib/domain/synthesis/scenario-plan';

const CATALOG = {
  screens: [
    {
      screenId: 'policy-search',
      screenAliases: ['policy search'],
      elements: [
        { elementId: 'policyNumberInput', widget: 'os-input', aliases: ['policy number', 'policy number field', 'search field'], required: true },
        { elementId: 'searchButton', widget: 'os-button', aliases: ['search button', 'search'], required: true },
        { elementId: 'resultsTable', widget: 'os-table', aliases: ['search results', 'results table'], required: false },
        { elementId: 'validationSummary', widget: 'os-region', aliases: ['validation summary', 'error summary'], required: false },
      ],
    },
    {
      screenId: 'policy-detail',
      screenAliases: ['policy detail'],
      elements: [
        { elementId: 'policyNumber', widget: 'os-region', aliases: ['policy number', 'policy number display'], required: false },
        { elementId: 'policyStatus', widget: 'os-region', aliases: ['policy status', 'status', 'status badge'], required: false },
        { elementId: 'effectiveDate', widget: 'os-region', aliases: ['effective date', 'date'], required: false },
        { elementId: 'claimsTable', widget: 'os-table', aliases: ['claims table', 'claims', 'claims list'], required: false },
      ],
    },
    {
      screenId: 'policy-amendment',
      screenAliases: ['amendment', 'policy amendment'],
      elements: [
        { elementId: 'amendmentStatus', widget: 'os-region', aliases: ['amendment status'], required: false },
        { elementId: 'reviewButton', widget: 'os-button', aliases: ['review', 'submit review', 'review changes'], required: true },
        { elementId: 'inceptionDate', widget: 'os-region', aliases: ['inception date', 'effective date'], required: false },
      ],
    },
  ],
} as const;

const CATALOG_WITH_POSTURES = {
  screens: [
    {
      screenId: 'policy-search',
      screenAliases: ['policy search'],
      elements: [
        {
          elementId: 'policyNumberInput',
          widget: 'os-input',
          aliases: ['policy number'],
          required: true,
          postureValues: [
            { posture: 'valid', values: ['POL-001', 'POL-002'] },
            { posture: 'invalid', values: ['NOTAPOLICY'] },
          ],
        },
        { elementId: 'searchButton', widget: 'os-button', aliases: ['search button'], required: true },
        { elementId: 'resultsTable', widget: 'os-table', aliases: ['search results'], required: false },
      ],
    },
    {
      screenId: 'policy-detail',
      screenAliases: ['policy detail'],
      elements: [
        { elementId: 'policyNumber', widget: 'os-region', aliases: ['policy number'], required: false },
        { elementId: 'effectiveDate', widget: 'os-region', aliases: ['effective date'], required: false },
      ],
    },
  ],
} as const;

const extractIntents = (yaml: string): readonly string[] =>
  yaml
    .split('\n')
    .filter((line) => line.includes('intent:'))
    .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''));

const STEP_INTENT_PATTERN =
  /enter|type|click|press|tap|hit|activate|submit|verify|check|confirm|select|choose|pick|navigate|open|go to|pull up|access|load|visit|bring up/;

// --- Determinism laws ---

test.describe('scenario planner determinism laws', () => {
  test('identical tuple yields identical fingerprints and yaml payloads', () => {
    const config = {
      catalog: CATALOG,
      seed: 'law-seed',
      count: 6,
      perturbation: { lexicalGap: 0.3 },
      validationSplit: 0.25,
    } as const;

    const first = planSyntheticScenarios(config);
    const second = planSyntheticScenarios(config);

    expect(first.plans.map((plan) => plan.fingerprint)).toEqual(second.plans.map((plan) => plan.fingerprint));
    expect(first.plans.map((plan) => plan.yaml)).toEqual(second.plans.map((plan) => plan.yaml));
  });

  test('different seed yields a different fingerprint sequence', () => {
    const first = planSyntheticScenarios({ catalog: CATALOG, seed: 'seed-a', count: 4 });
    const second = planSyntheticScenarios({ catalog: CATALOG, seed: 'seed-b', count: 4 });

    expect(first.plans.map((plan) => plan.fingerprint)).not.toEqual(second.plans.map((plan) => plan.fingerprint));
  });
});

// --- Lexical gap laws ---

test.describe('lexical gap laws', () => {
  test('lexicalGap=0 produces text using known aliases', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'gap-zero',
      count: 20,
    });

    const knownAliases = new Set(
      CATALOG.screens.flatMap((screen) => [
        ...screen.screenAliases,
        ...screen.elements.flatMap((e) => e.aliases),
      ]).map((a) => a.toLowerCase()),
    );

    const allIntents = result.plans.flatMap((plan) => {
      return extractIntents(plan.yaml).map((intent) => intent.toLowerCase());
    });

    const containsKnownAlias = allIntents.filter((intent) =>
      [...knownAliases].some((alias) => intent.includes(alias)),
    );

    expect(containsKnownAlias.length / allIntents.length).toBeGreaterThan(0.6);
  });

  test('lexicalGap=1 produces text with domain synonyms NOT in alias pool', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'gap-max',
      count: 30,
      perturbation: { lexicalGap: 1.0 },
    });

    const heldOutTerms = [
      'coverage', 'plan', 'insurance', 'account', 'contract',
      'incident', 'loss', 'endorsement', 'modification', 'rider',
      'identifier', 'reference', 'code',
      'look up', 'locate', 'retrieve', 'pull up', 'bring up',
      'confirm', 'make sure', 'validate', 'see that',
    ].map((t) => t.toLowerCase());

    const allIntents = result.plans.flatMap((plan) => {
      return extractIntents(plan.yaml).map((intent) => intent.toLowerCase());
    });

    const allText = allIntents.join(' ');
    const heldOutMatches = heldOutTerms.filter((term) => allText.includes(term));

    expect(heldOutMatches.length).toBeGreaterThan(0);
  });

  test('lexicalGap=0.5 produces a mix of known and held-out vocabulary', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'gap-half',
      count: 40,
      perturbation: { lexicalGap: 0.5 },
    });

    const knownAliases = new Set(
      CATALOG.screens.flatMap((screen) => [
        ...screen.screenAliases,
        ...screen.elements.flatMap((e) => e.aliases),
      ]).map((a) => a.toLowerCase()),
    );

    const allIntents = result.plans.flatMap((plan) => {
      return extractIntents(plan.yaml).map((intent) => intent.toLowerCase());
    });

    const withKnown = allIntents.filter((intent) =>
      [...knownAliases].some((alias) => intent.includes(alias)),
    );

    const knownRatio = withKnown.length / allIntents.length;
    expect(knownRatio).toBeGreaterThan(0.15);
    expect(knownRatio).toBeLessThan(0.95);
  });

  test('lexicalGap determinism: same gap + seed = same output', () => {
    const config = {
      catalog: CATALOG,
      seed: 'gap-determinism',
      count: 10,
      perturbation: { lexicalGap: 0.7 },
    } as const;

    const first = planSyntheticScenarios(config);
    const second = planSyntheticScenarios(config);

    expect(first.plans.map((plan) => plan.yaml)).toEqual(second.plans.map((plan) => plan.yaml));
  });

  test('resolvePerturbation clamps out-of-range values into the supported [0,1] interval', () => {
    expect(resolvePerturbation(undefined, {
      lexicalGap: 2,
      dataVariation: -1,
      coverageGap: 9,
      crossScreen: -5,
    })).toEqual({
      lexicalGap: 1,
      dataVariation: 0,
      coverageGap: 1,
      crossScreen: 0,
    });
  });
});

// --- Workflow archetype laws ---

test.describe('workflow archetype laws', () => {
  test('every scenario starts with a navigation step', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'nav-first',
      count: 20,
    });

    for (const plan of result.plans) {
      const firstIntent = extractIntents(plan.yaml)[0]?.toLowerCase();

      const isNav = firstIntent !== undefined && (
        firstIntent.includes('navigate') ||
        firstIntent.includes('open') ||
        firstIntent.includes('go to') ||
        firstIntent.includes('pull up') ||
        firstIntent.includes('access') ||
        firstIntent.includes('load') ||
        firstIntent.includes('visit') ||
        firstIntent.includes('bring up')
      );
      expect(isNav).toBe(true);
    }
  });

  test('scenarios have coherent multi-step structure', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'coherent',
      count: 10,
    });

    for (const plan of result.plans) {
      const intents = extractIntents(plan.yaml).map((intent) => intent.toLowerCase());

      expect(intents.length).toBeGreaterThanOrEqual(2);

      // Steps after the first should be either interactions, verifications, or mid-scenario navigation
      const subsequentSteps = intents.slice(1);
      for (const step of subsequentSteps) {
        const isValid = step.match(STEP_INTENT_PATTERN);
        expect(isValid).toBeTruthy();
      }
    }
  });

  test('screen distribution covers all catalog screens', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'distribution',
      count: 30,
    });

    const screenIds = new Set(result.screenDistribution.map((d) => d.screen));
    expect(screenIds.size).toBeGreaterThanOrEqual(CATALOG.screens.length);
  });

  test('crossScreen perturbation materially increases cross-screen journeys', () => {
    const withoutCrossScreen = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'cross-screen-weight',
      count: 60,
      perturbation: { crossScreen: 0 },
    });

    const withCrossScreen = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'cross-screen-weight',
      count: 60,
      perturbation: { crossScreen: 1 },
    });

    const noCrossScreenPerturbationCount = withoutCrossScreen.plans
      .filter((plan) => plan.screenId === 'cross-screen').length;
    const withCrossScreenPerturbationCount = withCrossScreen.plans
      .filter((plan) => plan.screenId === 'cross-screen').length;

    expect(noCrossScreenPerturbationCount).toBe(0);
    expect(withCrossScreenPerturbationCount).toBeGreaterThan(0);
  });
});

// --- Data variation laws ---

test.describe('data variation laws', () => {
  test('dataVariation=0 uses generic placeholder values', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG_WITH_POSTURES,
      seed: 'data-off',
      count: 20,
    });

    const inputSteps = result.plans.flatMap((plan) => {
      return extractIntents(plan.yaml)
        .filter((intent) => intent.match(/\b(Enter|Type|Fill in|Set|Input|Provide|Supply|Key in|Put in)\b/));
    });

    for (const intent of inputSteps) {
      expect(intent).toContain('a valid value');
    }
  });

  test('dataVariation=1 uses posture-driven values', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG_WITH_POSTURES,
      seed: 'data-full',
      count: 30,
      perturbation: { dataVariation: 1.0 },
    });

    const inputSteps = result.plans.flatMap((plan) => {
      return extractIntents(plan.yaml)
        .filter((intent) => intent.match(/\b(Enter|Type|Fill in|Set|Input|Provide|Supply|Key in|Put in)\b/));
    });

    const usesPostureData = inputSteps.some((intent) =>
      intent.includes('POL-001') || intent.includes('POL-002') || intent.includes('NOTAPOLICY'),
    );
    expect(usesPostureData).toBe(true);
  });
});

// --- Coverage gap laws ---

test.describe('coverage gap laws', () => {
  test('coverageGap reduces step count compared to baseline', () => {
    const resultNoCovGap = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'cov-zero',
      count: 10,
    });

    const resultHighCovGap = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'cov-zero',
      count: 10,
      perturbation: { coverageGap: 0.8 },
    });

    const avgStepsNoCovGap = resultNoCovGap.plans.reduce((sum, plan) => {
      const stepCount = extractIntents(plan.yaml).length;
      return sum + stepCount;
    }, 0) / resultNoCovGap.plans.length;

    const avgStepsHighCovGap = resultHighCovGap.plans.reduce((sum, plan) => {
      const stepCount = extractIntents(plan.yaml).length;
      return sum + stepCount;
    }, 0) / resultHighCovGap.plans.length;

    expect(avgStepsNoCovGap).toBeGreaterThan(avgStepsHighCovGap);
  });

  test('coverageGap still preserves at least one non-navigation step per scenario', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'coverage-floor',
      count: 20,
      perturbation: { coverageGap: 1 },
    });

    for (const plan of result.plans) {
      expect(extractIntents(plan.yaml).length).toBeGreaterThanOrEqual(2);
    }
  });
});
