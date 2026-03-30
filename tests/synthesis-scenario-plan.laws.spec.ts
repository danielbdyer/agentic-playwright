import { expect, test } from '@playwright/test';
import { planSyntheticScenarios } from '../lib/domain/synthesis/scenario-plan';

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
