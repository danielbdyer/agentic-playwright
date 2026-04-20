import {
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createScreenId,
  createSelectorRef,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
  createWidgetId,
} from '../../product/domain/kernel/identity';
import type { InterfaceResolutionContext, StepTaskElementCandidate, StepTaskScreenCandidate } from '../../product/domain/knowledge/types';
import type { GroundedStep, StepGrounding } from '../../product/domain/resolution/types';
import type { RuntimeStepAgentContext } from '../../product/runtime/resolution/types';

/** Strips readonly modifiers from the top-level fields — for test fixture mutation only. */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export function cloneJson<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

export function createPolicySearchElement(overrides: Partial<StepTaskElementCandidate> = {}): StepTaskElementCandidate {
  const screen = createScreenId('policy-search');
  const element = createElementId('policyNumberInput');
  const targetRef = createCanonicalTargetRef(`target:element:${screen}:${element}`);
  return {
    element,
    targetRef,
    role: 'textbox',
    name: 'Policy Number',
    surface: createSurfaceId('search-form'),
    widget: createWidgetId('os-input'),
    affordance: 'text-entry',
    aliases: ['policy number', 'policy ref'],
    locator: [],
    postures: [],
    defaultValueRef: null,
    parameter: null,
    snapshotAliases: {},
    selectorRefs: [createSelectorRef(`selector:${targetRef}:role:0:textbox:Policy Number`)],
    ...overrides,
  };
}

export function createPolicySearchScreen(overrides: Partial<StepTaskScreenCandidate> = {}): StepTaskScreenCandidate {
  return {
    screen: createScreenId('policy-search'),
    url: '/policy-search',
    routeVariantRefs: ['route-variant:demo:policy-search:default'],
    screenAliases: ['policy search', 'policy lookup'],
    knowledgeRefs: ['knowledge/surfaces/policy-search.surface.yaml', 'knowledge/screens/policy-search.elements.yaml'],
    supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
    elements: [createPolicySearchElement()],
    sectionSnapshots: [],
    ...overrides,
  };
}

export function createInterfaceResolutionContext(overrides: Partial<InterfaceResolutionContext> = {}): Mutable<InterfaceResolutionContext> {
  return {
    knowledgeFingerprint: 'sha256:knowledge',
    confidenceFingerprint: 'sha256:confidence',
    interfaceGraphFingerprint: 'sha256:interface',
    selectorCanonFingerprint: 'sha256:selectors',
    stateGraphFingerprint: 'sha256:state-graph',
    interfaceGraphPath: '.tesseract/interface/index.json',
    selectorCanonPath: '.tesseract/interface/selectors.json',
    stateGraphPath: '.tesseract/interface/state-graph.json',
    sharedPatterns: {
      version: 1,
      actions: {
        navigate: { id: 'core.navigate', aliases: ['navigate'] },
        input: { id: 'core.input', aliases: ['enter', 'input', 'type'] },
        click: { id: 'core.click', aliases: ['click', 'select'] },
        'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
      },
      postures: {},
      documents: ['knowledge/patterns/core.patterns.yaml'],
      sources: {
        actions: {
          navigate: 'knowledge/patterns/core.patterns.yaml',
          input: 'knowledge/patterns/core.patterns.yaml',
          click: 'knowledge/patterns/core.patterns.yaml',
          'assert-snapshot': 'knowledge/patterns/core.patterns.yaml',
        },
        postures: {},
      },
    },
    screens: [createPolicySearchScreen()],
    evidenceRefs: [],
    confidenceOverlays: [],
    controls: {
      datasets: [],
      resolutionControls: [],
      runbooks: [],
    },
    stateGraph: {
      kind: 'state-transition-graph',
      version: 1,
      generatedAt: '2026-03-12T00:00:00.000Z',
      fingerprint: 'sha256:state-graph',
      stateRefs: [createStateNodeRef('state:policy-search:policy-number-ready')],
      eventSignatureRefs: [createEventSignatureRef('event:policy-search:enter-policy-number')],
      transitionRefs: [createTransitionRef('transition:policy-search:policy-number-populated')],
      states: [],
      eventSignatures: [],
      transitions: [],
      observations: [],
    },
    ...overrides,
  };
}

export function groundingFromContext(
  resolutionContext: InterfaceResolutionContext,
  overrides: Partial<StepGrounding> = {},
): StepGrounding {
  const screens = resolutionContext.screens;
  const elements = screens.flatMap((screen) => screen.elements);
  return {
    targetRefs: elements.map((element) => element.targetRef),
    selectorRefs: elements.flatMap((element) => element.selectorRefs),
    fallbackSelectorRefs: screens.flatMap((screen) => screen.elements.flatMap((element) => element.selectorRefs)),
    routeVariantRefs: screens.flatMap((screen) => screen.routeVariantRefs),
    assertionAnchors: screens.flatMap((screen) => screen.sectionSnapshots.map((snapshot) => `snapshot-anchor:${screen.screen}:${snapshot}`)),
    effectAssertions: [],
    requiredStateRefs: [],
    forbiddenStateRefs: [],
    eventSignatureRefs: [],
    expectedTransitionRefs: [],
    resultStateRefs: [],
    ...overrides,
  };
}

export function createGroundedStep(overrides: Partial<GroundedStep> = {}, resolutionContext = createInterfaceResolutionContext()): Mutable<GroundedStep> {
  return {
    index: 1,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input', 'click'],
    explicitResolution: null,
    controlResolution: null,
    grounding: groundingFromContext(resolutionContext),
    stepFingerprint: 'sha256:step',
    taskFingerprint: 'sha256:task',
    ...overrides,
  };
}

export function createAgentContext(
  resolutionContext: InterfaceResolutionContext,
  overrides: Partial<RuntimeStepAgentContext> = {},
): RuntimeStepAgentContext {
  return {
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    resolutionContext,
    ...overrides,
  };
}
