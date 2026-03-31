import { expect, test } from '@playwright/test';
import { planSyntheticScenarios, templatePhrasing, type PhrasingProvider, type PhrasingResult } from '../lib/domain/synthesis/scenario-plan';

const CATALOG = {
  screens: [
    {
      screenId: 'policy-search',
      screenAliases: ['policy search'],
      elements: [
        { elementId: 'policyNumber', widget: 'os-input', aliases: ['policy number'], required: true },
        { elementId: 'searchButton', widget: 'os-button', aliases: ['search button'], required: true },
      ],
    },
    {
      screenId: 'policy-detail',
      screenAliases: ['policy detail'],
      elements: [
        { elementId: 'status', widget: 'os-region', aliases: ['status'], required: false },
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
          elementId: 'policyNumber',
          widget: 'os-input',
          aliases: ['policy number'],
          required: true,
          postureValues: [
            { posture: 'valid', values: ['POL-001', 'POL-002'] },
            { posture: 'invalid', values: ['NOTAPOLICY'] },
          ],
        },
        { elementId: 'searchButton', widget: 'os-button', aliases: ['search button'], required: true },
      ],
    },
    {
      screenId: 'policy-detail',
      screenAliases: ['policy detail'],
      elements: [
        { elementId: 'status', widget: 'os-region', aliases: ['status'], required: false },
      ],
    },
  ],
} as const;

test.describe('scenario planner determinism laws', () => {
  test('identical tuple yields identical fingerprints and yaml payloads', () => {
    const config = {
      catalog: CATALOG,
      seed: 'law-seed',
      count: 6,
      perturbation: { vocab: 0.2, aliasGap: 0.1, crossScreen: 0.15, coverageGap: 0.05 },
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

test.describe('data variation perturbation laws', () => {
  test('dataVariation=0 always produces default placeholder values', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG_WITH_POSTURES,
      seed: 'data-var-off',
      count: 20,
      perturbation: { dataVariation: 0 },
    });

    const inputSteps = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''))
        .filter((intent) => intent.match(/\b(Enter|Type|Fill in|Set|Input|Provide)\b/));
    });

    // With dataVariation=0, all input steps should use "a valid value"
    for (const intent of inputSteps) {
      expect(intent).toContain('a valid value');
    }
  });

  test('dataVariation=1 uses posture-driven or generic values, never just "a valid value"', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG_WITH_POSTURES,
      seed: 'data-var-full',
      count: 30,
      perturbation: { dataVariation: 1.0 },
    });

    const inputSteps = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''))
        .filter((intent) => intent.match(/\b(Enter|Type|Fill in|Set|Input|Provide)\b/));
    });

    // With posture values available and dataVariation=1.0, at least some steps
    // should use posture-driven values (POL-001, POL-002, NOTAPOLICY) or generic pool
    const usesVariedData = inputSteps.some((intent) => !intent.includes('a valid value'));
    expect(usesVariedData).toBe(true);
  });

  test('dataVariation determinism: same seed produces same values', () => {
    const config = {
      catalog: CATALOG_WITH_POSTURES,
      seed: 'data-determinism',
      count: 10,
      perturbation: { dataVariation: 0.8 },
    } as const;

    const first = planSyntheticScenarios(config);
    const second = planSyntheticScenarios(config);

    expect(first.plans.map((plan) => plan.yaml)).toEqual(second.plans.map((plan) => plan.yaml));
  });
});

test.describe('assertion variation perturbation laws', () => {
  test('assertionVariation=0 always produces "{alias} handled" expectations', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'assert-off',
      count: 10,
    });

    const expectedTexts = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('expected_text:'))
        .map((line) => line.replace(/^\s*expected_text:\s*/, '').replace(/^"/, '').replace(/"$/, ''));
    });

    // Without assertionVariation, non-nav expected_text should end with "handled"
    // or be navigation expectations ("loads successfully")
    for (const text of expectedTexts) {
      const isNav = text.includes('loads successfully');
      const isDefault = text.includes('handled');
      expect(isNav || isDefault).toBe(true);
    }
  });

  test('assertionVariation=1 produces varied assertion expectations', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'assert-varied',
      count: 30,
      perturbation: { assertionVariation: 1.0 },
    });

    const expectedTexts = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('expected_text:'))
        .map((line) => line.replace(/^\s*expected_text:\s*/, '').replace(/^"/, '').replace(/"$/, ''));
    });

    // With full assertion variation, at least some should use rich assertion templates
    const hasRichAssertions = expectedTexts.some((text) =>
      text.includes('is visible on screen') ||
      text.includes('shows expected content') ||
      text.includes('displays correct information') ||
      text.includes('is present and readable') ||
      text.includes('content matches expected value') ||
      text.includes('renders without errors') ||
      text.includes('is accessible and visible'),
    );
    expect(hasRichAssertions).toBe(true);

    // Navigation steps should also show variation
    const navTexts = expectedTexts.filter((text) =>
      text.includes('is displayed') ||
      text.includes('becomes visible') ||
      text.includes('opens correctly') ||
      text.includes('renders on screen'),
    );
    expect(navTexts.length).toBeGreaterThan(0);
  });
});

test.describe('expanded phrasing template laws', () => {
  test('scenarios use expanded navigation templates beyond original three', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'nav-templates-expanded',
      count: 50,
    });

    const navIntents = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''))
        .filter((intent) =>
          intent.match(/^(Navigate|Open|Go|Switch|Browse|Load|Visit|Access)\b/),
        );
    });

    // Should use some of the new templates (Switch, Browse, Load, Visit, Access)
    const usesNewTemplates = navIntents.some((intent) =>
      intent.startsWith('Switch') ||
      intent.startsWith('Browse') ||
      intent.startsWith('Load') ||
      intent.startsWith('Visit') ||
      intent.startsWith('Access'),
    );
    expect(usesNewTemplates).toBe(true);
  });

  test('vocab perturbation uses expanded synonym vocabulary', () => {
    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'vocab-expanded',
      count: 80,
      perturbation: { vocab: 1.0 },
    });

    const allIntents = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''));
    });

    const allText = allIntents.join(' ');

    // Should contain at least some of the new synonym families
    const newSynonymMatches = [
      /\bquery\b/i, /\blook up\b/i,           // search synonyms
      /\brecords\b/i, /\blistings\b/i,         // results synonyms
      /\binsurance policy\b/i, /\baccount\b/i,  // policy synonyms
      /\binformation\b/i, /\boverview\b/i,      // detail synonyms
      /\bgrid\b/i, /\bdata view\b/i,           // table synonyms
    ].filter((pattern) => pattern.test(allText));

    expect(newSynonymMatches.length).toBeGreaterThan(0);
  });
});

test.describe('PhrasingProvider contract laws', () => {
  test('custom PhrasingProvider replaces template text in generated scenarios', () => {
    const agenticPhrasing: PhrasingProvider = (request): PhrasingResult => ({
      actionText: `AGENTIC: ${request.action} on ${request.screenAlias}/${request.elementAlias ?? 'screen'}`,
      expectedText: `AGENTIC: verified ${request.elementAlias ?? request.screenAlias}`,
      source: 'agentic',
    });

    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'phrasing-provider',
      count: 5,
      phrasingProvider: agenticPhrasing,
    });

    const allIntents = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''));
    });

    // Every step should use the agentic phrasing
    expect(allIntents.length).toBeGreaterThan(0);
    for (const intent of allIntents) {
      expect(intent).toContain('AGENTIC:');
    }
  });

  test('templatePhrasing is used by default and produces template-sourced results', () => {
    const result = templatePhrasing(
      { action: 'click', screenId: 'test-screen', screenAlias: 'test', elementId: 'btn', elementAlias: 'submit button', value: '' },
      () => 0.5,
    );

    expect(result.source).toBe('template');
    expect(result.actionText).toContain('submit button');
    expect(result.expectedText).toContain('submit button');
  });

  test('vocab perturbation is skipped for agentic-sourced text', () => {
    const agenticPhrasing: PhrasingProvider = (request): PhrasingResult => ({
      actionText: `Make sure the search results load properly for ${request.elementAlias ?? 'screen'}`,
      expectedText: `search results are visible`,
      source: 'agentic',
    });

    const result = planSyntheticScenarios({
      catalog: CATALOG,
      seed: 'agentic-no-vocab',
      count: 10,
      perturbation: { vocab: 1.0 },
      phrasingProvider: agenticPhrasing,
    });

    // Agentic text should NOT have vocab substitutions applied
    const allIntents = result.plans.flatMap((plan) => {
      const lines = plan.yaml.split('\n');
      return lines
        .filter((line) => line.includes('intent:'))
        .map((line) => line.replace(/^\s*intent:\s*/, '').replace(/^"/, '').replace(/"$/, ''));
    });

    // The word "search" should remain — not be replaced with "find", "lookup", etc.
    const searchSteps = allIntents.filter((intent) => intent.includes('search'));
    expect(searchSteps.length).toBeGreaterThan(0);
  });

  test('PhrasingProvider determinism: same provider + seed = same output', () => {
    const customPhrasing: PhrasingProvider = (request, rng): PhrasingResult => {
      const variants = ['Version A', 'Version B', 'Version C'];
      const idx = Math.floor(rng() * variants.length);
      return {
        actionText: `${variants[idx]} ${request.action} ${request.elementAlias ?? request.screenAlias}`,
        expectedText: `${variants[idx]} verified`,
        source: 'agentic',
      };
    };

    const config = {
      catalog: CATALOG,
      seed: 'determinism-test',
      count: 8,
      phrasingProvider: customPhrasing,
    } as const;

    const first = planSyntheticScenarios(config);
    const second = planSyntheticScenarios(config);

    expect(first.plans.map((plan) => plan.fingerprint)).toEqual(second.plans.map((plan) => plan.fingerprint));
  });
});
