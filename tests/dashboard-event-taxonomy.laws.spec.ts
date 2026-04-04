import { expect, test } from '@playwright/test';
import type {
  DashboardEventKind,
  SurfaceDiscoveredEvent,
  RouteNavigatedEvent,
  AriaTreeCapturedEvent,
  SuiteSliceSelectedEvent,
  ScenarioPrioritizedEvent,
  StepBoundEvent,
  ScenarioCompiledEvent,
  StepExecutingEvent,
  StepResolvedEvent,
  ScenarioExecutedEvent,
  TrustPolicyEvaluatedEvent,
  KnowledgeActivatedEvent,
  ConvergenceEvaluatedEvent,
  IterationSummaryEvent,
} from '../lib/domain/observation/dashboard';
import { ALL_DASHBOARD_EVENT_KINDS, type DashboardEventMap } from '../dashboard/src/types/events';

// ─── Type-level payload laws ───

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

type _SurfaceDiscoveredPayload = Assert<Equals<DashboardEventMap['surface-discovered'], SurfaceDiscoveredEvent>>;
type _RouteNavigatedPayload = Assert<Equals<DashboardEventMap['route-navigated'], RouteNavigatedEvent>>;
type _AriaTreeCapturedPayload = Assert<Equals<DashboardEventMap['aria-tree-captured'], AriaTreeCapturedEvent>>;
type _SuiteSliceSelectedPayload = Assert<Equals<DashboardEventMap['suite-slice-selected'], SuiteSliceSelectedEvent>>;
type _ScenarioPrioritizedPayload = Assert<Equals<DashboardEventMap['scenario-prioritized'], ScenarioPrioritizedEvent>>;
type _StepBoundPayload = Assert<Equals<DashboardEventMap['step-bound'], StepBoundEvent>>;
type _ScenarioCompiledPayload = Assert<Equals<DashboardEventMap['scenario-compiled'], ScenarioCompiledEvent>>;
type _StepExecutingPayload = Assert<Equals<DashboardEventMap['step-executing'], StepExecutingEvent>>;
type _StepResolvedPayload = Assert<Equals<DashboardEventMap['step-resolved'], StepResolvedEvent>>;
type _ScenarioExecutedPayload = Assert<Equals<DashboardEventMap['scenario-executed'], ScenarioExecutedEvent>>;
type _TrustPolicyEvaluatedPayload = Assert<Equals<DashboardEventMap['trust-policy-evaluated'], TrustPolicyEvaluatedEvent>>;
type _KnowledgeActivatedPayload = Assert<Equals<DashboardEventMap['knowledge-activated'], KnowledgeActivatedEvent>>;
type _ConvergenceEvaluatedPayload = Assert<Equals<DashboardEventMap['convergence-evaluated'], ConvergenceEvaluatedEvent>>;
type _IterationSummaryPayload = Assert<Equals<DashboardEventMap['iteration-summary'], IterationSummaryEvent>>;

test.describe('Dashboard event taxonomy laws', () => {
  test('Law 1: flywheel event kinds are present in ALL_DASHBOARD_EVENT_KINDS exactly once', () => {
    const flywheelKinds: readonly DashboardEventKind[] = [
      'surface-discovered',
      'route-navigated',
      'aria-tree-captured',
      'suite-slice-selected',
      'scenario-prioritized',
      'step-bound',
      'scenario-compiled',
      'step-executing',
      'step-resolved',
      'scenario-executed',
      'trust-policy-evaluated',
      'knowledge-activated',
      'convergence-evaluated',
      'iteration-summary',
    ];

    const duplicates = ALL_DASHBOARD_EVENT_KINDS.filter(
      (kind, idx, kinds) => kinds.indexOf(kind) !== idx,
    );

    expect(duplicates).toEqual([]);
    flywheelKinds.forEach((kind) => {
      const occurrences = ALL_DASHBOARD_EVENT_KINDS.filter((k) => k === kind);
      expect(occurrences).toHaveLength(1);
    });
  });

  test('Law 2: DashboardEventMap statically preserves flywheel payload contracts', () => {
    // Compile-time law: the type aliases above fail compilation on mismatch.
    expect(true).toBe(true);
  });
});
