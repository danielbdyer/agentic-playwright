import { expect, test } from '@playwright/test';
import * as handlers from '../dashboard/src/hooks/flywheel-dispatch-handlers';

test.describe('Flywheel dispatch handler laws', () => {
  test('Law 1: all 14 flywheel dispatch factories exist', () => {
    const expectedFactories = [
      'dispatchSurfaceDiscovered',
      'dispatchRouteNavigated',
      'dispatchAriaTreeCaptured',
      'dispatchSuiteSliceSelected',
      'dispatchScenarioPrioritized',
      'dispatchStepBound',
      'dispatchScenarioCompiled',
      'dispatchStepExecuting',
      'dispatchStepResolved',
      'dispatchScenarioExecuted',
      'dispatchTrustPolicyEvaluated',
      'dispatchKnowledgeActivated',
      'dispatchConvergenceEvaluated',
      'dispatchIterationSummary',
    ];
    expectedFactories.forEach((name) => {
      expect(typeof (handlers as Record<string, unknown>)[name]).toBe('function');
    });
  });

  test('Law 2: factories return callable functions', () => {
    const noopRef = { current: null };
    const noopSetter = () => {};

    expect(typeof handlers.dispatchSurfaceDiscovered(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchRouteNavigated(noopSetter)).toBe('function');
    expect(typeof handlers.dispatchAriaTreeCaptured(noopSetter)).toBe('function');
    expect(typeof handlers.dispatchSuiteSliceSelected(noopSetter)).toBe('function');
    expect(typeof handlers.dispatchScenarioPrioritized(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchStepBound(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchScenarioCompiled(noopSetter as never)).toBe('function');
    expect(typeof handlers.dispatchStepExecuting(noopSetter)).toBe('function');
    expect(typeof handlers.dispatchStepResolved(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchScenarioExecuted(noopSetter as never)).toBe('function');
    expect(typeof handlers.dispatchTrustPolicyEvaluated(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchKnowledgeActivated(noopRef as never)).toBe('function');
    expect(typeof handlers.dispatchConvergenceEvaluated(noopSetter)).toBe('function');
    expect(typeof handlers.dispatchIterationSummary(noopSetter as never)).toBe('function');
  });

  test('Law 3: ref-based handlers tolerate null ref.current without throwing', () => {
    const nullRef = { current: null };
    const handler = handlers.dispatchSurfaceDiscovered(nullRef as never);
    expect(() => handler({ screen: 'test', region: 'main', role: 'landmark', boundingBox: { x: 0, y: 0, width: 100, height: 100 }, childCount: 3 })).not.toThrow();
  });

  test('Law 4: state setter handler invokes callback with data', () => {
    let captured: unknown = null;
    const setter = (data: unknown) => { captured = data; };
    const handler = handlers.dispatchRouteNavigated(setter);
    const payload = { url: 'http://test.com', screenId: 'home', isSeeded: true };
    handler(payload);
    expect(captured).toEqual(payload);
  });
});
