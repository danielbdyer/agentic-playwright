import { expect, test } from '@playwright/test';
import {
  missingActionHandlerError,
  snapshotHandleResolutionError,
  unknownEffectTargetError,
  unknownScreenError,
} from '../../product/domain/kernel/errors';
import {
  createAdoId,
  createElementId,
  createPostureId,
  createScreenId,
  createSurfaceId,
  createWidgetId,
  type WidgetId,
} from '../../product/domain/kernel/identity';
import type { StepProgram } from '../../product/domain/intent/types';
import { deriveCapabilities } from '../../product/domain/commitment/grammar';
import { playwrightStepProgramInterpreter, runStepProgram, runtimeFailureDiagnostic } from '../../product/runtime/execute/program';
import { interact } from '../../product/runtime/widgets/interact';
import type { ScreenRegistry } from '../../product/runtime/adapters/load';
import { validateScreenElements, validateSurfaceGraph } from '../../product/domain/validation';

const policySearchScreenId = createScreenId('policy-search');
const policyNumberInputId = createElementId('policyNumberInput');
const searchButtonId = createElementId('searchButton');
const searchFormId = createSurfaceId('search-form');
const osButtonWidgetId = createWidgetId('os-button');
const osCheckboxWidgetId = createWidgetId('os-checkbox');
const osInputWidgetId = createWidgetId('os-input');
const osDateWidgetId = createWidgetId('os-date');

test('runtime/domain error constructors keep stable machine-classifiable codes', () => {
  expect(unknownScreenError('policy-search').code).toBe('runtime-unknown-screen');
  expect(unknownScreenError('policy-search').message).toBe('Unknown screen policy-search');

  expect(unknownEffectTargetError('results-grid', 'surface').code).toBe('runtime-unknown-effect-target');
  expect(unknownEffectTargetError('results-grid', 'surface').message).toBe('Unknown surface target results-grid');

  expect(missingActionHandlerError('os-date', 'fill').code).toBe('runtime-missing-action-handler');
  expect(missingActionHandlerError('os-date', 'fill').message).toBe('No fill action registered for os-date');

  expect(snapshotHandleResolutionError().code).toBe('runtime-snapshot-handle-resolution-failed');
  expect(snapshotHandleResolutionError().message).toBe('Unable to resolve element handle for ARIA snapshot');
});

test('runtime failures map to compiler diagnostics with provenance for reporting/graph flows', () => {
  const diagnostic = runtimeFailureDiagnostic(
    {
      code: 'runtime-unknown-screen',
      message: 'Unknown screen policy-search',
      context: { screenId: 'policy-search' },
    },
    {
      adoId: createAdoId('10001'),
      stepIndex: 3,
      artifactPath: 'generated/specs/demo/10001.spec.ts',
      provenance: {
        sourceRevision: 12,
        contentHash: 'abc123',
      },
    },
  );

  expect(diagnostic.code).toBe('runtime-unknown-screen');
  expect(diagnostic.message).toBe('Unknown screen policy-search');
  expect(diagnostic.adoId).toBe(createAdoId('10001'));
  expect(diagnostic.stepIndex).toBe(3);
  expect(diagnostic.provenance.sourceRevision).toBe(12);
  expect(diagnostic.provenance.contentHash).toBe('abc123');
});

function createRuntimeHarness(widget: WidgetId = osButtonWidgetId): {
  page: unknown;
  screens: ScreenRegistry;
  clicks: { count: number };
  program: StepProgram;
} {
  const clicks = { count: 0 };
  const locator = {
    click: async () => {
      clicks.count += 1;
    },
    count: async () => 1,
    isVisible: async () => true,
    isEnabled: async () => true,
    isEditable: async () => true,
    or: () => locator,
    locator: () => locator,
  };
  const page = {
    locator: () => locator,
    getByTestId: () => locator,
    getByRole: () => locator,
    goto: async () => undefined,
  };

  return {
    page,
    screens: {
      [policySearchScreenId]: {
        screen: {
          screen: policySearchScreenId,
          url: 'http://example.test/policy-search',
          sections: {},
        },
        surfaces: {},
        postures: {},
        elements: {
          [searchButtonId]: {
            role: 'button',
            name: 'Search',
            cssFallback: '#search-button',
            surface: searchFormId,
            widget,
          },
        },
      },
    },
    clicks,
    program: {
      kind: 'step-program',
      instructions: [
        {
          kind: 'invoke',
          screen: policySearchScreenId,
          element: searchButtonId,
          action: 'click',
        },
      ],
    },
  };
}

test('invoke executes through role-derived widget dispatch', async () => {
  const harness = createRuntimeHarness(osButtonWidgetId);
  const result = await runStepProgram(harness.page as never, harness.screens, {}, harness.program);

  expect(result.ok).toBeTruthy();
  expect(harness.clicks.count).toBe(1);
});

test('invoke fails with runtime-missing-action-handler when widget action is not registered', async () => {
  const harness = createRuntimeHarness(osDateWidgetId);
  const result = await runStepProgram(harness.page as never, harness.screens, {}, harness.program);

  expect(result.ok).toBeFalsy();
  if (!result.ok) {
    expect(result.error.code).toBe('runtime-missing-action-handler');
    expect(result.error.message).toBe('No click action registered for os-date');
  }
  expect(harness.clicks.count).toBe(0);
});

test('interact fails with stable error codes for unsupported widget actions', async () => {
  const locator = {
    click: async () => undefined,
    fill: async () => undefined,
  };

  const result = await interact(locator as never, osButtonWidgetId, 'fill', 'x');
  expect(result.ok).toBeFalsy();
  if (!result.ok) {
    expect(result.error.code).toBe('runtime-missing-action-handler');
    expect(result.error.message).toBe('No fill action registered for button');
  }
});

test('interact supports checkbox state changes through the widget-role bridge', async () => {
  const calls: string[] = [];
  const locator = {
    check: async () => {
      calls.push('check');
    },
    isVisible: async () => true,
    isEnabled: async () => true,
  };
  const result = await interact(locator as never, osCheckboxWidgetId, 'check');
  expect(result.ok).toBeTruthy();
  expect(calls).toEqual(['check']);
});

test('enter prefers fill over clear when an input widget supports both actions', async () => {
  const calls: string[] = [];
  const locator = {
    count: async () => 1,
    fill: async (value: string) => {
      calls.push(`fill:${value}`);
    },
    clear: async () => {
      calls.push('clear');
    },
    isEditable: async () => true,
    isEnabled: async () => true,
    isVisible: async () => true,
    or: () => locator,
  };
  const page = {
    getByTestId: () => locator,
    getByRole: () => locator,
    locator: () => locator,
    goto: async () => undefined,
  };

  const result = await runStepProgram(page as never, {
      [policySearchScreenId]: {
        screen: {
          screen: policySearchScreenId,
          url: 'http://example.test/policy-search',
          sections: {},
        },
        surfaces: {},
        postures: {},
        elements: {
          [policyNumberInputId]: {
            role: 'textbox',
            name: 'Policy Number',
            testId: 'policy-number-input',
            locator: [
              { kind: 'test-id', value: 'policy-number-input' },
              { kind: 'role', role: 'textbox', name: 'Policy Number' },
            ],
            surface: searchFormId,
            widget: osInputWidgetId,
          },
        },
      },
    }, {
      activePolicy: { number: 'POL-001' },
    }, {
      kind: 'step-program',
        instructions: [{
          kind: 'enter',
          screen: policySearchScreenId,
          element: policyNumberInputId,
          posture: createPostureId('valid'),
          value: {
            kind: 'fixture-path',
            path: { segments: ['activePolicy', 'number'] },
        },
      }],
    });

  expect(result.ok).toBeTruthy();
  expect(calls).toEqual(['fill:POL-001']);
});

test('playwright interpreter records degraded locator use when a fallback rung succeeds', async () => {
  const primaryLocator = {
    count: async () => 0,
    isVisible: async () => false,
    or: () => primaryLocator,
  };
  const fallbackLocator = {
    count: async () => 1,
    click: async () => undefined,
    isVisible: async () => true,
    isEnabled: async () => true,
    or: () => fallbackLocator,
  };
  const page = {
    getByTestId: () => primaryLocator,
    getByRole: () => fallbackLocator,
    locator: () => fallbackLocator,
    goto: async () => undefined,
  };

  const result = await playwrightStepProgramInterpreter.run({
    kind: 'step-program',
    instructions: [{
      kind: 'invoke',
      screen: policySearchScreenId,
      element: searchButtonId,
      action: 'click',
    }],
  }, {
    page: page as never,
    fixtures: {},
    screens: {
      [policySearchScreenId]: {
        screen: {
          screen: policySearchScreenId,
          url: 'http://example.test/policy-search',
          sections: {},
        },
        surfaces: {},
        postures: {},
        elements: {
          [searchButtonId]: {
            role: 'button',
            name: 'Search',
            testId: 'search-button',
            locator: [
              { kind: 'test-id', value: 'search-button' },
              { kind: 'role', role: 'button', name: 'Search' },
            ],
            surface: searchFormId,
            widget: osButtonWidgetId,
          },
        },
      },
    },
  });

  expect(result.ok).toBeTruthy();
  if (result.ok) {
    const firstOutcome = result.value.outcomes[0];
    expect(firstOutcome?.observedEffects).toContain('degraded-locator');
  }
});

test('capability derivation remains deterministic with contract-driven actions', () => {
  const surfaceGraph = validateSurfaceGraph({
    screen: policySearchScreenId,
    url: 'http://example.test/policy-search',
    sections: {
      search: {
        selector: '#search',
        kind: 'form',
        surfaces: [searchFormId],
        snapshot: null,
      },
    },
    surfaces: {
      [searchFormId]: {
        kind: 'form',
        section: 'search',
        selector: '#search',
        parents: [],
        children: [],
        elements: [searchButtonId],
        assertions: ['state'],
      },
    },
  });

  const elements = validateScreenElements({
    screen: policySearchScreenId,
    url: 'http://example.test/policy-search',
    elements: {
      [searchButtonId]: {
        role: 'button',
        name: 'Search',
        testId: null,
        cssFallback: '#search-button',
        surface: searchFormId,
        widget: osButtonWidgetId,
      },
    },
  });

  const first = deriveCapabilities(surfaceGraph, elements);
  const second = deriveCapabilities(surfaceGraph, elements);
  expect(first).toEqual(second);
});
