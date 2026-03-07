import { expect, test } from '@playwright/test';
import { diagnosticInterpreter } from '../lib/application/interpreters/diagnostic';
import { dryRunInterpreter } from '../lib/application/interpreters/dry-run';
import { InterpreterEnvironment } from '../lib/application/interpreters/types';
import { createAdoId } from '../lib/domain/identity';
import { StepProgram } from '../lib/domain/types';
import { playwrightStepProgramInterpreter } from '../lib/runtime/program';

function createHarness(widget: string = 'os-button') {
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

  const screens = {
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
  } as const;

  const environment: InterpreterEnvironment = {
    screens: screens as never,
    fixtures: {},
    hasSnapshotTemplate: () => true,
    resolveValue: () => undefined,
  };

  const program: StepProgram = {
    kind: 'step-program',
    instructions: [
      {
        kind: 'invoke',
        screen: 'policy-search',
        element: 'searchButton',
        action: 'click',
      },
    ],
  };

  return { page, screens, program, environment, clicks };
}

test('same program yields same structural trace across playwright, dry-run, and diagnostic interpreters', async () => {
  const harness = createHarness();
  const context = { adoId: createAdoId('10001'), stepIndex: 1 };
  const playwrightResult = await playwrightStepProgramInterpreter.run(harness.program, {
    page: harness.page as never,
    screens: harness.screens as never,
    fixtures: {},
  }, context);
  const dryRunResult = await dryRunInterpreter.run(harness.program, harness.environment, context);
  const diagnosticResult = await diagnosticInterpreter.run(harness.program, harness.environment, context);

  expect(playwrightResult.ok).toBeTruthy();
  expect(dryRunResult.ok).toBeTruthy();
  expect(diagnosticResult.ok).toBeTruthy();

  const traceShape = (result: { value: { outcomes: Array<{ instructionIndex: number; instructionKind: string }> } }) =>
    result.value.outcomes.map((outcome) => ({ index: outcome.instructionIndex, kind: outcome.instructionKind }));

  expect(traceShape(playwrightResult as never)).toEqual(traceShape(dryRunResult as never));
  expect(traceShape(playwrightResult as never)).toEqual(traceShape(diagnosticResult as never));
});

test('diagnostic codes remain stable and provenance-preserving', async () => {
  const harness = createHarness();
  const failingProgram: StepProgram = {
    kind: 'step-program',
    instructions: [{ kind: 'navigate', screen: 'missing-screen' as never }],
  };

  const result = await diagnosticInterpreter.run(
    failingProgram,
    harness.environment,
    {
      adoId: createAdoId('10001'),
      stepIndex: 2,
      artifactPath: 'generated/demo/policy-search/10001.spec.ts',
      provenance: {
        sourceRevision: 17,
        contentHash: 'stable-hash',
      },
    },
  );

  expect(result.ok).toBeFalsy();
  if (!result.ok) {
    expect(result.error.code).toBe('runtime-unknown-screen');
    expect(result.error.context?.classification).toBe('resolvability');
    expect(result.diagnostic?.code).toBe('runtime-unknown-screen');
    expect(result.diagnostic?.provenance.sourceRevision).toBe(17);
    expect(result.diagnostic?.provenance.contentHash).toBe('stable-hash');
  }
});
