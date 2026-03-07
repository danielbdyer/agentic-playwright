import { expect, test } from '@playwright/test';
import {
  missingActionHandlerError,
  snapshotHandleResolutionError,
  unknownEffectTargetError,
  unknownScreenError,
} from '../lib/domain/errors';
import { createAdoId } from '../lib/domain/identity';
import { StepProgram } from '../lib/domain/types';
import { deriveCapabilities } from '../lib/domain/grammar';
import { runStepProgram, runtimeFailureDiagnostic } from '../lib/runtime/program';
import { interact } from '../lib/runtime/interact';
import { ScreenRegistry } from '../lib/runtime/load';

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

function createRuntimeHarness(widget: string = 'os-button'): {
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
      'policy-search': {
        screen: {
          screen: 'policy-search',
          url: 'http://example.test/policy-search',
          sections: {},
        },
        surfaces: {},
        postures: {},
        elements: {
          searchButton: {
            role: 'button',
            name: 'Search',
            cssFallback: '#search-button',
            surface: 'search-form',
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
          screen: 'policy-search',
          element: 'searchButton',
          action: 'click',
        },
      ],
    },
  };
}

test('invoke executes through registered widget action handlers', async () => {
  const harness = createRuntimeHarness('os-button');
  const result = await runStepProgram(harness.page as never, harness.screens, {}, harness.program);

  expect(result.ok).toBeTruthy();
  expect(harness.clicks.count).toBe(1);
});

test('invoke fails with runtime-missing-action-handler when widget action is not registered', async () => {
  const harness = createRuntimeHarness('os-date' as never);
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

  const result = await interact(locator as never, 'os-button', 'fill', 'x');
  expect(result.ok).toBeFalsy();
  if (!result.ok) {
    expect(result.error.code).toBe('runtime-missing-action-handler');
    expect(result.error.message).toBe('No fill action registered for os-button');
  }
});

test('capability derivation remains deterministic with contract-driven actions', () => {
  const surfaceGraph = {
    screen: 'policy-search',
    url: 'http://example.test/policy-search',
    sections: {
      search: {
        selector: '#search',
        kind: 'form',
        surfaces: ['search-form'],
        snapshot: null,
      },
    },
    surfaces: {
      'search-form': {
        kind: 'form',
        section: 'search',
        selector: '#search',
        parents: [],
        children: [],
        elements: ['searchButton'],
        assertions: ['state'],
      },
    },
  } as const;
  const elements = {
    screen: 'policy-search',
    url: 'http://example.test/policy-search',
    elements: {
      searchButton: {
        role: 'button',
        name: 'Search',
        testId: null,
        cssFallback: '#search-button',
        surface: 'search-form',
        widget: 'os-button',
      },
    },
  } as const;

  const first = deriveCapabilities(surfaceGraph as never, elements as never);
  const second = deriveCapabilities(surfaceGraph as never, elements as never);
  expect(first).toEqual(second);
});
