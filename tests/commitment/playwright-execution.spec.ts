/**
 * Playwright execution test: exercises the real playwrightStepProgramInterpreter
 * against the demo harness HTML, verifying that the interpreter can navigate,
 * fill inputs, click buttons, and observe DOM structure.
 */
import { expect, test } from '@playwright/test';
import { createElementId, createScreenId, createSectionId, createSurfaceId, createWidgetId } from '../../product/domain/kernel/identity';
import type { LoadedScreen, ScreenRegistry } from '../../product/domain/commitment/runtime-loaders';
import type { StepProgram, ValueRef } from '../../product/domain/intent/types';
import { playwrightStepProgramInterpreter } from '../../product/runtime/execute/program';

function buildPolicySearchScreen(): LoadedScreen {
  return {
    screen: {
      screen: createScreenId('policy-search'),
      url: '/policy-search.html',
      sections: {
        'search-form': {
          selector: '#search-form',
          kind: 'form',
          surfaces: [createSurfaceId('search-form')],
        },
        'results-section': {
          selector: '#results-wrapper',
          kind: 'result-set',
          surfaces: [createSurfaceId('results-section')],
        },
      },
    },
    surfaces: {
      'search-form': {
        kind: 'form',
        section: createSectionId('search-form'),
        selector: '#search-form',
        parents: [],
        children: [],
        elements: [createElementId('policyNumberInput'), createElementId('searchButton'), createElementId('validationSummary')],
        assertions: ['state'],
        required: true,
      },
      'results-section': {
        kind: 'result-set',
        section: createSectionId('results-section'),
        selector: '#results-wrapper',
        parents: [],
        children: [],
        elements: [createElementId('resultsTable')],
        assertions: ['structure', 'state'],
        required: false,
      },
    },
    elements: {
      [createElementId('policyNumberInput')]: {
        role: 'textbox',
        name: 'Policy Number',
        testId: 'policy-number-input',
        surface: createSurfaceId('search-form'),
        widget: createWidgetId('os-input'),
        affordance: 'text-entry',
        locator: [
          { kind: 'test-id', value: 'policy-number-input' },
          { kind: 'role-name', role: 'textbox', name: 'Policy Number' },
        ],
      },
      [createElementId('searchButton')]: {
        role: 'button',
        name: 'Search',
        testId: 'search-button',
        surface: createSurfaceId('search-form'),
        widget: createWidgetId('os-button'),
        affordance: 'action',
        locator: [
          { kind: 'test-id', value: 'search-button' },
          { kind: 'role-name', role: 'button', name: 'Search' },
        ],
      },
      [createElementId('validationSummary')]: {
        role: 'alert',
        name: '',
        testId: 'validation-summary',
        surface: createSurfaceId('search-form'),
        widget: createWidgetId('os-region'),
        locator: [
          { kind: 'test-id', value: 'validation-summary' },
          { kind: 'role-name', role: 'alert' },
        ],
      },
      [createElementId('resultsTable')]: {
        role: 'table',
        name: 'Search Results',
        testId: 'search-results-table',
        surface: createSurfaceId('results-section'),
        widget: createWidgetId('os-region'),
        locator: [
          { kind: 'test-id', value: 'search-results-table' },
          { kind: 'role-name', role: 'table', name: 'Search Results' },
        ],
      },
    },
    postures: {
      policyNumberInput: {
        valid: {
          values: ['POL-001'],
          effects: [],
        },
      },
    },
  };
}

function buildScreenRegistry(): ScreenRegistry {
  const screenId = createScreenId('policy-search');
  return { [screenId]: buildPolicySearchScreen() };
}

function literal(value: string): ValueRef {
  return { kind: 'literal', value };
}

test.describe('Playwright interpreter against demo harness', () => {
  test('navigate to policy search page', async ({ page }) => {
    const program: StepProgram = {
      kind: 'step-program',
      instructions: [
        { kind: 'navigate', screen: createScreenId('policy-search') },
      ],
    };

    const result = await playwrightStepProgramInterpreter.run(program, {
      page,
      screens: buildScreenRegistry(),
      fixtures: {},
      snapshotLoader: undefined,
    });

    expect(result.ok).toBe(true);
    expect(result.value.mode).toBe('playwright');
    expect(result.value.outcomes).toHaveLength(1);
    expect(result.value.outcomes[0]!.status).toBe('ok');
    expect(result.value.outcomes[0]!.observedEffects).toContain('effect-applied');
    await expect(page).toHaveTitle('Policy Search');
  });

  test('enter policy number and click search', async ({ page }) => {
    await page.goto('/policy-search.html');

    const enterProgram: StepProgram = {
      kind: 'step-program',
      instructions: [
        {
          kind: 'enter',
          screen: createScreenId('policy-search'),
          element: createElementId('policyNumberInput'),
          posture: null,
          value: literal('POL-001'),
        },
      ],
    };

    const enterResult = await playwrightStepProgramInterpreter.run(enterProgram, {
      page,
      screens: buildScreenRegistry(),
      fixtures: {},
      snapshotLoader: undefined,
    });

    expect(enterResult.ok).toBe(true);
    expect(enterResult.value.outcomes[0]!.status).toBe('ok');

    // Verify the input was filled
    const inputValue = await page.locator('[data-testid="policy-number-input"]').inputValue();
    expect(inputValue).toBe('POL-001');

    // Now click search
    const clickProgram: StepProgram = {
      kind: 'step-program',
      instructions: [
        {
          kind: 'invoke',
          screen: createScreenId('policy-search'),
          element: createElementId('searchButton'),
          action: 'click',
        },
      ],
    };

    const clickResult = await playwrightStepProgramInterpreter.run(clickProgram, {
      page,
      screens: buildScreenRegistry(),
      fixtures: {},
      snapshotLoader: undefined,
    });

    expect(clickResult.ok).toBe(true);
    expect(clickResult.value.outcomes[0]!.status).toBe('ok');

    // Results table should be visible
    await expect(page.locator('[data-testid="search-results-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="result-row"]')).toBeVisible();
  });

  test('search with invalid policy shows validation', async ({ page }) => {
    await page.goto('/policy-search.html');

    // Enter invalid policy
    await page.locator('[data-testid="policy-number-input"]').fill('INVALID');

    const clickProgram: StepProgram = {
      kind: 'step-program',
      instructions: [
        {
          kind: 'invoke',
          screen: createScreenId('policy-search'),
          element: createElementId('searchButton'),
          action: 'click',
        },
      ],
    };

    const result = await playwrightStepProgramInterpreter.run(clickProgram, {
      page,
      screens: buildScreenRegistry(),
      fixtures: {},
      snapshotLoader: undefined,
    });

    expect(result.ok).toBe(true);

    // Validation message should appear
    await expect(page.locator('[data-testid="validation-summary"]')).toBeVisible();
    await expect(page.locator('[data-testid="validation-summary"]')).toContainText('No matching policy');
  });

  test('full journey: navigate, enter, search, verify results', async ({ page }) => {
    const registry = buildScreenRegistry();
    const env = { page, screens: registry, fixtures: {}, snapshotLoader: undefined };

    // Step 1: Navigate
    const navResult = await playwrightStepProgramInterpreter.run({
      kind: 'step-program',
      instructions: [{ kind: 'navigate', screen: createScreenId('policy-search') }],
    }, env);
    expect(navResult.ok).toBe(true);

    // Step 2: Enter policy number
    const enterResult = await playwrightStepProgramInterpreter.run({
      kind: 'step-program',
      instructions: [{
        kind: 'enter',
        screen: createScreenId('policy-search'),
        element: createElementId('policyNumberInput'),
        posture: null,
        value: literal('POL-001'),
      }],
    }, env);
    expect(enterResult.ok).toBe(true);

    // Step 3: Click search
    const clickResult = await playwrightStepProgramInterpreter.run({
      kind: 'step-program',
      instructions: [{
        kind: 'invoke',
        screen: createScreenId('policy-search'),
        element: createElementId('searchButton'),
        action: 'click',
      }],
    }, env);
    expect(clickResult.ok).toBe(true);

    // Step 4: Verify results
    await expect(page.locator('[data-testid="search-results-table"]')).toBeVisible();
    const resultText = await page.locator('[data-testid="result-link"]').textContent();
    expect(resultText).toBe('POL-001');

    // Verify invoke (click) receipt has locator strategy and widget contract
    const clickOutcome = clickResult.value.outcomes[0]!;
    expect(clickOutcome.locatorStrategy).toBeDefined();
    expect(clickOutcome.locatorRung).toBeDefined();
    expect(clickOutcome.widgetContract).toBeDefined();
  });
});
