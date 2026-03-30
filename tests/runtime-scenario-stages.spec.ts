import { expect, test } from '@playwright/test';
import { defaultRecoveryPolicy } from '../lib/domain/execution/recovery-policy';
import { createScreenId } from '../lib/domain/identity';
import { selectRouteForNavigate } from '../lib/runtime/scenario/route-selection';
import { runRecoveryStage } from '../lib/runtime/scenario/recovery';
import { createGroundedStep, createInterfaceResolutionContext } from './support/interface-fixtures';

function routeFixtureContext() {
  const context = createInterfaceResolutionContext({
    screens: [
      {
        ...createInterfaceResolutionContext().screens[0]!,
        screen: createScreenId('policy-search'),
        routeVariantRefs: [
          'route-variant:demo:policy-search:default',
          'route-variant:demo:policy-search:tab-open',
        ],
        routeVariants: [
          {
            routeVariantRef: 'route-variant:demo:policy-search:default',
            url: '/policy-search',
            state: { tab: 'summary' },
            tab: 'summary',
            expectedEntryStateRefs: [],
            dimensions: [],
            historicalSuccess: { successCount: 2, failureCount: 0, lastSuccessAt: null },
          },
          {
            routeVariantRef: 'route-variant:demo:policy-search:tab-open',
            url: '/policy-search?tab=open',
            state: { tab: 'open' },
            tab: 'open',
            expectedEntryStateRefs: [],
            dimensions: [],
            historicalSuccess: { successCount: 1, failureCount: 0, lastSuccessAt: null },
          },
        ],
      },
    ] as never,
  });
  return context;
}

test('route-selection stage is deterministic for identical fixtures and route-state precedence', () => {
  const context = routeFixtureContext();
  const task = createGroundedStep({
    actionText: 'Navigate to open items',
    normalizedIntent: 'navigate open items => open tab visible',
    grounding: {
      ...createGroundedStep().grounding,
      resultStateRefs: [],
    },
  }, context);
  const interpretation = {
    kind: 'resolved' as const,
    governance: 'approved' as const,
    confidence: 'compiler-derived' as const,
    target: {
      action: 'navigate' as const,
      screen: createScreenId('policy-search'),
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      routeVariantRef: null,
      routeState: { tab: 'open' },
      semanticDestination: 'open policy tab',
    },
  };

  const first = selectRouteForNavigate({ context, task, interpretation });
  const second = selectRouteForNavigate({ context, task, interpretation });

  expect(first).toEqual(second);
  expect(first.selectedRouteUrl).toBe('/policy-search?tab=open');
  expect(first.selectedRouteVariantRef).toBe('route-variant:demo:policy-search:tab-open');
});

test('recovery stage transitions from failed verification to recovered execute-prerequisite-actions', async () => {
  const recovery = await runRecoveryStage({
    family: 'precondition-failure',
    policy: defaultRecoveryPolicy,
    preconditionFailures: ['required field missing'],
    diagnostics: [{ code: 'runtime-widget-precondition-failed', message: 'required field missing' }],
    degraded: false,
  });

  expect(recovery.envelope.stage).toBe('recovery');
  expect(recovery.recovered).toBeTruthy();
  expect(recovery.envelope.governance).toBe('approved');
  expect(recovery.attempts.map((attempt) => [attempt.strategyId, attempt.result])).toEqual([
    ['verify-prerequisites', 'failed'],
    ['execute-prerequisite-actions', 'recovered'],
  ]);
});
