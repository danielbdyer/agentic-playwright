/**
 * Screen Facade Emission — Law Tests
 *
 * Exercises the pre-generated per-screen facade emitter added in
 * step-4b.a.4 per v2-direction.md §3.2. Each law asserts a specific
 * property of the emitted module text.
 */

import { expect, test } from '@playwright/test';
import {
  renderScreenFacadeModule,
  screenFacadesFromFlow,
  type ResolvedScreenMethod,
} from '../../product/instruments/codegen/spec-codegen';
import type { GroundedSpecFlow } from '../../product/domain/intent/types';
import { createAdoId, createElementId, createScreenId } from '../../product/domain/kernel/identity';

function makeMethods(): ReadonlyArray<ResolvedScreenMethod> {
  return [
    { screenId: 'policy-search', methodName: 'navigate', stepIndex: 0, stepTitle: 'Navigate' },
    { screenId: 'policy-search', methodName: 'enterPolicyNumber', stepIndex: 1, stepTitle: 'Enter' },
  ];
}

function makeFlow(): GroundedSpecFlow {
  const adoId = createAdoId('10001');
  const baseStep = {
    dataValue: null,
    dataSource: 'none' as const,
    confidence: 'compiler-derived' as const,
    governance: 'approved' as const,
    bindingKind: 'bound' as const,
    provenanceKind: 'approved-knowledge' as const,
    knowledgeRefs: [] as ReadonlyArray<string>,
    supplementRefs: [] as ReadonlyArray<string>,
    posture: null,
    snapshotTemplate: null,
  };
  return {
    kind: 'grounded-spec-flow',
    metadata: {
      adoId,
      revision: 1,
      contentHash: 'hash1',
      title: 'Policy search flow',
      suite: 'policy-journey',
      tags: [],
      lifecycle: 'normal',
      confidence: 'compiler-derived',
      governance: 'approved',
      fixtures: [],
    },
    steps: [
      {
        ...baseStep,
        index: 0,
        intent: 'Navigate to policy search',
        action: 'navigate',
        screen: createScreenId('policy-search'),
        element: createElementId('root'),
        normalizedIntent: 'navigate-policy-search',
      },
      {
        ...baseStep,
        index: 1,
        intent: 'Enter policy number',
        action: 'input',
        screen: createScreenId('policy-search'),
        element: createElementId('policyNumber'),
        normalizedIntent: 'enter-policy-number',
      },
      {
        ...baseStep,
        index: 2,
        intent: 'View detail',
        action: 'navigate',
        screen: createScreenId('policy-detail'),
        element: createElementId('root'),
        normalizedIntent: 'navigate-policy-detail',
      },
    ],
  };
}

// ─── Law 1: emitted module exports a named factory ───

test('renderScreenFacadeModule exports a factory named after the camelCased screen id', () => {
  const { code, factoryName } = renderScreenFacadeModule({
    screenId: 'policy-search',
    methods: makeMethods(),
    scenarioContextTypeModule: '../../scenario-context',
  });
  expect(factoryName).toBe('policySearch');
  expect(code).toContain('export const policySearch');
  expect(code).toContain('navigate: ()');
  expect(code).toContain('enterPolicyNumber: ()');
});

// ─── Law 2: emitted module uses a type-only import of ScenarioContext ───

test('renderScreenFacadeModule emits `import type { ScenarioContext }` — no runtime binding leak', () => {
  const { code } = renderScreenFacadeModule({
    screenId: 'policy-search',
    methods: makeMethods().slice(0, 1),
    scenarioContextTypeModule: '../../scenario-context',
  });
  expect(code).toMatch(/import type \{ ScenarioContext \}/);
});

// ─── Law 3: method bodies invoke scenario.executeStep with index + title ───

test('each method delegates to scenario.executeStep(stepIndex, stepTitle)', () => {
  const { code } = renderScreenFacadeModule({
    screenId: 'policy-search',
    methods: [
      { screenId: 'policy-search', methodName: 'search', stepIndex: 3, stepTitle: 'Search for policy' },
    ],
    scenarioContextTypeModule: '../../scenario-context',
  });
  expect(code).toMatch(/scenario\.executeStep\(3,\s*"Search for policy"\)/);
});

// ─── Law 4: screenFacadesFromFlow partitions steps by screen, drops __global__ ───

test('screenFacadesFromFlow groups steps by screen and excludes global-scoped steps', () => {
  const flow = makeFlow();
  const facades = screenFacadesFromFlow(flow);
  expect([...facades.keys()].sort()).toEqual(['policy-detail', 'policy-search']);
  expect(facades.get('policy-search')?.length).toBe(2);
  expect(facades.get('policy-detail')?.length).toBe(1);
  expect(facades.has('__global__')).toBe(false);
});

// ─── Law 5: round-trip — facade rendering is deterministic ───

test('renderScreenFacadeModule is deterministic across repeated calls', () => {
  const methods = makeMethods();
  const a = renderScreenFacadeModule({
    screenId: 'policy-search',
    methods,
    scenarioContextTypeModule: '../../scenario-context',
  });
  const b = renderScreenFacadeModule({
    screenId: 'policy-search',
    methods,
    scenarioContextTypeModule: '../../scenario-context',
  });
  expect(a.code).toBe(b.code);
  expect(a.factoryName).toBe(b.factoryName);
});
