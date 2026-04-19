import { expect, test } from '@playwright/test';
import { buildDiscoveryArtifacts } from '../../product/domain/knowledge/discovery';

test('buildDiscoveryArtifacts emits deterministic selector and action scaffolds from first-run discovery', () => {
  const input = {
    screen: 'policy-journey',
    url: 'http://127.0.0.1:3100/policy-journey.html',
    title: 'Policy Journey',
    rootSelector: 'main',
    rootSnapshot: [
      'role: main',
      'name: Policy Journey',
      'children:',
      '  - role: button',
      '    name: Continue to Coverage',
    ].join('\n'),
    surfaces: [
      {
        selector: "[data-testid='eligibility-step']",
        parentSelector: "[data-testid='policy-journey-shell']",
        role: 'region',
        name: 'Eligibility Step',
        testId: 'eligibility-step',
        idAttribute: 'eligibility-step',
        contract: 'eligibilityStep',
        tagName: 'section',
      },
      {
        selector: "[data-testid='policy-journey-shell']",
        parentSelector: null,
        role: 'region',
        name: 'Policy Journey Shell',
        testId: 'policy-journey-shell',
        idAttribute: 'policy-journey-shell',
        contract: 'journeyShell',
        tagName: 'section',
      },
    ],
    elements: [
      {
        selector: "[data-testid='continue-to-coverage-button']",
        surfaceSelector: "[data-testid='eligibility-step']",
        role: 'button',
        name: 'Continue to Coverage',
        testId: 'continue-to-coverage-button',
        idAttribute: 'continue-to-coverage-button',
        contract: 'continueToCoverageButton',
        tagName: 'button',
        inputType: null,
        required: false,
      },
      {
        selector: "[data-testid='journey-policy-number-input']",
        surfaceSelector: "[data-testid='eligibility-step']",
        role: 'textbox',
        name: 'Policy Number',
        testId: 'journey-policy-number-input',
        idAttribute: 'journey-policy-number-input',
        contract: 'policyNumberInput',
        tagName: 'input',
        inputType: 'text',
        required: true,
      },
    ],
  } as const;

  const first = buildDiscoveryArtifacts(input);
  const second = buildDiscoveryArtifacts({
    ...input,
    surfaces: [...input.surfaces].reverse(),
    elements: [...input.elements].reverse(),
  });

  expect(first.report.snapshotHash).toBe(second.report.snapshotHash);
  expect(first.surfaceScaffold).toEqual(second.surfaceScaffold);
  expect(first.elementsScaffold).toEqual(second.elementsScaffold);
  expect(first.report.elements.find((element) => element.id === 'continueToCoverageButton')).toEqual(expect.objectContaining({
    locatorHint: 'test-id',
    supportedActions: ['click'],
    locatorCandidates: [
      { kind: 'test-id', value: 'continue-to-coverage-button' },
      { kind: 'role-name', role: 'button', name: 'Continue to Coverage' },
    ],
  }));
  expect(first.report.elements.find((element) => element.id === 'policyNumberInput')).toEqual(expect.objectContaining({
    surfaceId: 'eligibilityStep',
    widgetSuggestion: 'os-input',
    supportedActions: ['input'],
  }));
  expect(first.report.reviewNotes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'state-exploration-recommended',
      targetId: 'journeyShell',
      targetKind: 'surface',
    }),
  ]));
  expect(first.surfaceScaffold.surfaces.eligibilityStep?.parents).toEqual(['journeyShell']);
  expect(first.elementsScaffold.elements.policyNumberInput?.locator).toEqual([
    { kind: 'test-id', value: 'journey-policy-number-input' },
    { kind: 'role-name', role: 'textbox', name: 'Policy Number' },
  ]);
  expect(first.sectionArtifacts.eligibilityStep).toEqual(expect.objectContaining({
    id: 'eligibilityStep',
    depth: 1,
    surfaceIds: ['eligibilityStep'],
    elementIds: ['continueToCoverageButton', 'policyNumberInput'],
  }));
  const journeyShellSection = first.sectionArtifacts.journeyShell;
  const rootSection = first.sectionArtifacts.journeyShell;
  expect(journeyShellSection).toBeDefined();
  expect(rootSection).toBeDefined();
  expect(journeyShellSection?.surfaceScaffold.sections.journeyShellSection).toEqual({
    selector: "[data-testid='policy-journey-shell']",
    kind: 'section-root',
    surfaces: ['journeyShell'],
    snapshot: null,
  });
  expect(journeyShellSection?.surfaceScaffold.surfaces.journeyShell?.children).toEqual(['eligibilityStep']);
  expect(rootSection?.elementsScaffold.elements).toEqual({
    continueToCoverageButton: expect.any(Object),
    policyNumberInput: expect.any(Object),
  });
});
