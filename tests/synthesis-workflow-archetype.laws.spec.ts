import { expect, test } from '@playwright/test';
import { createSeededRng } from '../lib/domain/kernel/random';
import { composeWorkflowSteps, selectArchetype } from '../lib/domain/synthesis/workflow-archetype';
import type { ScreenPlanInput } from '../lib/domain/synthesis/scenario-plan';

function policyFormScreen(): ScreenPlanInput {
  return {
    screenId: 'policy-form',
    screenAliases: ['policy form'],
    elements: [
      { elementId: 'policyNumberInput', widget: 'os-input', aliases: ['policy number'], required: true },
      { elementId: 'policyTypeSelect', widget: 'os-select', aliases: ['policy type'], required: true },
      { elementId: 'acceptTermsCheckbox', widget: 'os-checkbox', aliases: ['accept terms'], required: true },
      { elementId: 'saveButton', widget: 'os-button', aliases: ['save'], required: true },
      { elementId: 'summaryPanel', widget: 'os-region', aliases: ['summary'], required: false },
    ],
  };
}

test('form-submit composition derives interaction verbs from affordance families', () => {
  const screen = policyFormScreen();
  const steps = composeWorkflowSteps('form-submit', {
    screens: [screen],
    primaryScreen: screen,
    lexicalGap: 0,
    dataVariation: 0,
    rng: createSeededRng('workflow-form-submit'),
  });

  const actionTexts = steps.map((step) => step.actionText);

  expect(actionTexts.some((text) => text.startsWith('Enter a valid value in the policy number'))).toBe(true);
  expect(actionTexts.some((text) => text.startsWith('Select a valid value in the policy type'))).toBe(true);
  expect(actionTexts.some((text) => text.startsWith('Check the accept terms'))).toBe(true);
});

test('archetype selection treats selectable and checkable fields as form-capable inputs', () => {
  const screen = {
    screenId: 'approval-form',
    screenAliases: ['approval form'],
    elements: [
      { elementId: 'approvalType', widget: 'os-select', aliases: ['approval type'], required: true },
      { elementId: 'expediteReview', widget: 'os-checkbox', aliases: ['expedite review'], required: false },
      { elementId: 'submitButton', widget: 'os-button', aliases: ['submit'], required: true },
    ],
  } satisfies ScreenPlanInput;

  const archetype = selectArchetype(screen, [screen], createSeededRng('workflow-archetype-selectable'));

  expect(['search-verify', 'form-submit', 'detail-inspect', 'read-only-audit']).toContain(archetype);
  expect(archetype).not.toBe('cross-screen-journey');
});
