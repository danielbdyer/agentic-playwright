import type { Locator, Page } from '@playwright/test';
import type {
  EventSignature,
  InterfaceResolutionContext,
  LocatorStrategy,
  StateNode,
  StateTransition,
  StateTransitionGraph,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
  TransitionObservation,
} from '../domain/types';
import type { CanonicalTargetRef, EventSignatureRef, StateNodeRef, TransitionRef } from '../domain/identity';
import { uniqueSorted } from '../domain/collections';
import { foldLocatorStrategy } from '../domain/visitors';

export interface ObservationContextScreen {
  screen: StepTaskScreenCandidate['screen'];
  routeVariantRefs: string[];
  elements: Array<Pick<
    StepTaskElementCandidate,
    'element' | 'targetRef' | 'role' | 'name' | 'locator' | 'widget' | 'surface'
  >>;
}

export interface PlaywrightStateObservationContext {
  stateGraph: StateTransitionGraph;
  screens: ObservationContextScreen[];
}

export interface StateObservationResult {
  stateRef: StateNodeRef;
  observed: boolean;
  detail?: Record<string, string> | undefined;
}

interface ResolvedObservationLocator {
  locator: Locator;
  strategy: LocatorStrategy;
  strategyIndex: number;
  degraded: boolean;
}

function fallbackLocatorStrategy(candidate: Pick<StepTaskElementCandidate, 'role' | 'name'>): LocatorStrategy {
  return {
    kind: 'role-name',
    role: candidate.role,
    name: candidate.name ?? null,
  };
}

function candidateStrategies(candidate: Pick<StepTaskElementCandidate, 'role' | 'name' | 'locator'>): LocatorStrategy[] {
  return candidate.locator.length > 0 ? candidate.locator : [fallbackLocatorStrategy(candidate)];
}

function locatorForStrategy(page: Page, strategy: LocatorStrategy): Locator {
  return foldLocatorStrategy(strategy, {
    testId: (s) => page.getByTestId(s.value),
    roleName: (s) => page.getByRole(s.role as never, s.name ? { name: s.name } : undefined),
    css: (s) => page.locator(s.value),
  });
}

function describeLocatorStrategy(strategy: LocatorStrategy): string {
  return foldLocatorStrategy(strategy, {
    testId: (s) => `test-id:${s.value}`,
    roleName: (s) => s.name ? `role:${s.role}[name=${s.name}]` : `role:${s.role}`,
    css: (s) => `css:${s.value}`,
  });
}

async function strategyMatches(locator: Locator): Promise<boolean> {
  const count = await locator.count().catch(() => 0);
  if (count > 0) {
    return true;
  }
  return locator.isVisible().catch(() => false);
}

async function resolveObservationLocator(
  page: Page,
  candidate: Pick<StepTaskElementCandidate, 'role' | 'name' | 'locator'>,
): Promise<ResolvedObservationLocator> {
  const strategies = candidateStrategies(candidate);
  for (const [index, strategy] of strategies.entries()) {
    const locator = locatorForStrategy(page, strategy);
    if (await strategyMatches(locator)) {
      return {
        locator,
        strategy,
        strategyIndex: index,
        degraded: index > 0,
      };
    }
  }

  return {
    locator: locatorForStrategy(page, strategies[0] ?? fallbackLocatorStrategy(candidate)),
    strategy: strategies[0] ?? fallbackLocatorStrategy(candidate),
    strategyIndex: 0,
    degraded: false,
  };
}

function fromInterfaceResolutionContext(resolutionContext: InterfaceResolutionContext): PlaywrightStateObservationContext {
  return {
    stateGraph: resolutionContext.stateGraph ?? {
      kind: 'state-transition-graph',
      version: 1,
      generatedAt: '',
      fingerprint: '',
      stateRefs: [],
      eventSignatureRefs: [],
      transitionRefs: [],
      states: [],
      eventSignatures: [],
      transitions: [],
      observations: [],
    },
    screens: resolutionContext.screens.map((screen) => ({
      screen: screen.screen,
      routeVariantRefs: screen.routeVariantRefs,
      elements: screen.elements.map((element) => ({
        element: element.element,
        targetRef: element.targetRef,
        role: element.role,
        name: element.name,
        locator: element.locator,
        widget: element.widget,
        surface: element.surface,
      })),
    })),
  };
}

export function observationContextFromResolutionContext(resolutionContext: InterfaceResolutionContext): PlaywrightStateObservationContext {
  return fromInterfaceResolutionContext(resolutionContext);
}

function candidateForTargetRef(
  context: PlaywrightStateObservationContext,
  targetRef: CanonicalTargetRef | null | undefined,
): ObservationContextScreen['elements'][number] | null {
  if (!targetRef) {
    return null;
  }
  for (const screen of context.screens) {
    const found = screen.elements.find((element) => element.targetRef === targetRef);
    if (found) {
      return found;
    }
  }
  return null;
}

async function readLocatorAttribute(locator: Locator, attribute: string | null | undefined): Promise<string | null> {
  if (!attribute || attribute === 'textContent') {
    return (await locator.textContent().catch(() => null))?.trim() ?? null;
  }
  if (attribute === 'value') {
    const inputValue = await locator.inputValue().catch(() => null);
    if (inputValue !== null && inputValue !== undefined) {
      return inputValue;
    }
    return (await locator.textContent().catch(() => null))?.trim() ?? null;
  }
  return locator.getAttribute(attribute).catch(() => null);
}

function observedRouteMatch(
  routeVariantRef: string | null | undefined,
  activeRouteVariantRefs: readonly string[],
  page: Page,
  expectedValue: string | null | undefined,
): boolean {
  if (routeVariantRef) {
    return activeRouteVariantRefs.includes(routeVariantRef);
  }
  if (expectedValue) {
    return page.url().includes(expectedValue);
  }
  return activeRouteVariantRefs.length > 0;
}

async function evaluateStateNode(
  page: Page,
  context: PlaywrightStateObservationContext,
  state: StateNode,
  activeRouteVariantRefs: readonly string[],
): Promise<StateObservationResult> {
  const details: Record<string, string> = {};
  let observed = true;

  for (const predicate of state.predicates) {
    if (predicate.kind === 'active-route') {
      const matched = observedRouteMatch(predicate.routeVariantRef ?? null, activeRouteVariantRefs, page, predicate.value ?? null);
      details.route = matched ? 'active' : 'inactive';
      observed &&= matched;
      continue;
    }

    const candidate = candidateForTargetRef(context, predicate.targetRef ?? state.targetRef ?? null);
    if (!candidate) {
      details.unresolved = 'missing-target';
      observed = false;
      continue;
    }

    const resolved = await resolveObservationLocator(page, candidate);
    const locator = resolved.locator;
    const visible = await locator.isVisible().catch(() => false);
    const enabled = await locator.isEnabled().catch(() => false);
    const attributeValue = await readLocatorAttribute(locator, predicate.attribute ?? null);
    details.locator = describeLocatorStrategy(resolved.strategy);
    details.locatorRung = String(resolved.strategyIndex + 1);
    if (attributeValue !== null && attributeValue !== undefined) {
      details[predicate.attribute ?? 'value'] = attributeValue;
    }

    const expected = predicate.value ?? null;
    const normalizedValue = (attributeValue ?? '').trim();
    const matchesExpected = expected === null
      ? normalizedValue.length > 0
      : normalizedValue === expected;

    let predicateObserved = false;
    switch (predicate.kind) {
      case 'visible':
      case 'open':
      case 'expanded':
      case 'active-modal':
        predicateObserved = visible;
        break;
      case 'hidden':
      case 'closed':
      case 'collapsed':
        predicateObserved = !visible;
        break;
      case 'enabled':
        predicateObserved = enabled;
        break;
      case 'disabled':
        predicateObserved = !enabled;
        break;
      case 'populated':
        predicateObserved = expected === null ? normalizedValue.length > 0 : matchesExpected;
        break;
      case 'cleared':
        predicateObserved = expected === null ? normalizedValue.length === 0 : matchesExpected;
        break;
      case 'valid': {
        const validity = predicate.attribute ? matchesExpected : normalizedValue !== 'true';
        predicateObserved = predicate.attribute ? validity : (attributeValue ?? 'false') !== 'true';
        break;
      }
      case 'invalid': {
        const invalidity = predicate.attribute ? matchesExpected : normalizedValue === 'true';
        predicateObserved = predicate.attribute ? invalidity : (attributeValue ?? 'false') === 'true';
        break;
      }
      default:
        predicateObserved = false;
        break;
    }

    observed &&= predicateObserved;
  }

  return {
    stateRef: state.ref,
    observed,
    detail: Object.keys(details).length > 0 ? details : undefined,
  };
}

export async function observeStateRefsOnPage(input: {
  page: Page;
  context: PlaywrightStateObservationContext | InterfaceResolutionContext;
  stateRefs: readonly StateNodeRef[];
  activeRouteVariantRefs?: readonly string[] | undefined;
}): Promise<StateObservationResult[]> {
  const context = 'screens' in input.context && 'stateGraph' in input.context && Array.isArray(input.context.screens)
    ? ('knowledgeFingerprint' in input.context ? fromInterfaceResolutionContext(input.context) : input.context)
    : fromInterfaceResolutionContext(input.context as InterfaceResolutionContext);
  const stateRefs = uniqueSorted(input.stateRefs);
  const activeRouteVariantRefs = input.activeRouteVariantRefs ?? [];
  const states = context.stateGraph.states.filter((state) => stateRefs.includes(state.ref));
  const results: StateObservationResult[] = [];
  for (const state of states) {
    results.push(await evaluateStateNode(input.page, context, state, activeRouteVariantRefs));
  }
  return results.sort((left, right) => left.stateRef.localeCompare(right.stateRef));
}

function eventByRef(stateGraph: StateTransitionGraph, ref: EventSignatureRef | null | undefined): EventSignature | null {
  if (!ref) {
    return null;
  }
  return stateGraph.eventSignatures.find((entry) => entry.ref === ref) ?? null;
}

function transitionsByRefs(stateGraph: StateTransitionGraph, refs: readonly TransitionRef[]): StateTransition[] {
  const set = new Set(refs);
  return stateGraph.transitions.filter((transition) => set.has(transition.ref));
}

function supportingTransitionsForState(stateGraph: StateTransitionGraph, stateRef: StateNodeRef): StateTransition[] {
  return stateGraph.transitions
    .filter((transition) => transition.targetStateRefs.includes(stateRef))
    .sort((left, right) =>
      left.sourceStateRefs.length - right.sourceStateRefs.length
      || left.eventSignatureRef.localeCompare(right.eventSignatureRef)
      || left.ref.localeCompare(right.ref),
    );
}

export async function performSafeActiveEvent(input: {
  page: Page;
  context: PlaywrightStateObservationContext | InterfaceResolutionContext;
  eventSignature: EventSignature;
}): Promise<{ performed: boolean; detail: Record<string, string> }> {
  const context = 'screens' in input.context && 'stateGraph' in input.context && Array.isArray(input.context.screens)
    ? ('knowledgeFingerprint' in input.context ? fromInterfaceResolutionContext(input.context) : input.context)
    : fromInterfaceResolutionContext(input.context as InterfaceResolutionContext);
  const candidate = candidateForTargetRef(context, input.eventSignature.targetRef);
  if (!candidate) {
    return { performed: false, detail: { reason: 'missing-target' } };
  }

  const resolved = await resolveObservationLocator(input.page, candidate);
  const detail = {
    locator: describeLocatorStrategy(resolved.strategy),
    locatorRung: String(resolved.strategyIndex + 1),
    action: input.eventSignature.dispatch.action ?? 'custom',
  };

  switch (input.eventSignature.dispatch.action) {
    case 'input':
      await resolved.locator.fill(input.eventSignature.dispatch.sampleValue ?? '');
      break;
    case 'click':
      await resolved.locator.click();
      break;
    default:
      return { performed: false, detail: { ...detail, reason: 'unsupported-action' } };
  }

  const settleMs = input.eventSignature.observationPlan.settleMs ?? 0;
  if (settleMs > 0) {
    await input.page.waitForTimeout(settleMs);
  }

  return { performed: true, detail };
}

export async function primeRequiredStatesOnPage(input: {
  page: Page;
  context: PlaywrightStateObservationContext | InterfaceResolutionContext;
  eventSignature: EventSignature;
  activeRouteVariantRefs?: readonly string[] | undefined;
  visitedEventRefs?: Set<EventSignatureRef> | undefined;
}): Promise<void> {
  const context = 'screens' in input.context && 'stateGraph' in input.context && Array.isArray(input.context.screens)
    ? ('knowledgeFingerprint' in input.context ? fromInterfaceResolutionContext(input.context) : input.context)
    : fromInterfaceResolutionContext(input.context as InterfaceResolutionContext);
  const visited = input.visitedEventRefs ?? new Set<EventSignatureRef>();
  if (visited.has(input.eventSignature.ref)) {
    return;
  }
  visited.add(input.eventSignature.ref);

  const activeRouteVariantRefs = input.activeRouteVariantRefs ?? [];
  const observations = await observeStateRefsOnPage({
    page: input.page,
    context,
    stateRefs: input.eventSignature.requiredStateRefs,
    activeRouteVariantRefs,
  });
  const missing = observations.filter((entry) => !entry.observed).map((entry) => entry.stateRef);
  if (missing.length === 0) {
    return;
  }

  for (const stateRef of missing) {
    const supportingTransition = supportingTransitionsForState(context.stateGraph, stateRef)[0] ?? null;
    const supportingEvent = eventByRef(context.stateGraph, supportingTransition?.eventSignatureRef ?? null);
    if (!supportingTransition || !supportingEvent) {
      continue;
    }
    await primeRequiredStatesOnPage({
      page: input.page,
      context,
      eventSignature: supportingEvent,
      activeRouteVariantRefs,
      visitedEventRefs: visited,
    });
    await performSafeActiveEvent({
      page: input.page,
      context,
      eventSignature: supportingEvent,
    });
  }
}

export async function observeTransitionOnPage(input: {
  page: Page;
  context: PlaywrightStateObservationContext | InterfaceResolutionContext;
  screen: StateNode['screen'];
  eventSignatureRef?: EventSignatureRef | null | undefined;
  expectedTransitionRefs: readonly TransitionRef[];
  beforeObservedStateRefs?: readonly StateNodeRef[] | undefined;
  activeRouteVariantRefs?: readonly string[] | undefined;
  source: TransitionObservation['source'];
  actor: TransitionObservation['actor'];
  observationId: string;
}): Promise<TransitionObservation> {
  const context = 'screens' in input.context && 'stateGraph' in input.context && Array.isArray(input.context.screens)
    ? ('knowledgeFingerprint' in input.context ? fromInterfaceResolutionContext(input.context) : input.context)
    : fromInterfaceResolutionContext(input.context as InterfaceResolutionContext);
  const activeRouteVariantRefs = input.activeRouteVariantRefs ?? [];
  const eventSignature = eventByRef(context.stateGraph, input.eventSignatureRef ?? null);
  const expectedTransitions = transitionsByRefs(context.stateGraph, input.expectedTransitionRefs);
  const stateRefsToObserve = uniqueSorted([
    ...(eventSignature?.observationPlan.observeStateRefs ?? []),
    ...expectedTransitions.flatMap((transition) => transition.targetStateRefs),
  ]);
  const afterObservations = await observeStateRefsOnPage({
    page: input.page,
    context,
    stateRefs: stateRefsToObserve,
    activeRouteVariantRefs,
  });
  const afterObservedStateRefs = afterObservations.filter((entry) => entry.observed).map((entry) => entry.stateRef);
  const beforeSet = new Set(input.beforeObservedStateRefs ?? []);
  const afterSet = new Set(afterObservedStateRefs);
  const matchedTransitions = expectedTransitions.filter((transition) =>
    transition.targetStateRefs.every((stateRef) => afterSet.has(stateRef))
    && transition.sourceStateRefs.every((stateRef) => beforeSet.has(stateRef) || transition.sourceStateRefs.length === 0),
  );
  const matchedTransition = matchedTransitions.length === 1 ? matchedTransitions[0]! : null;
  const expectedTargetStates = new Set(expectedTransitions.flatMap((transition) => transition.targetStateRefs));
  const unexpectedStateRefs = afterObservedStateRefs.filter((stateRef) => !expectedTargetStates.has(stateRef) && !beforeSet.has(stateRef));
  const classification = matchedTransitions.length > 1
    ? 'ambiguous-match'
    : matchedTransition
    ? 'matched'
    : unexpectedStateRefs.length > 0
      ? 'unexpected-effects'
      : 'missing-expected';

  return {
    observationId: input.observationId,
    source: input.source,
    actor: input.actor,
    screen: input.screen,
    eventSignatureRef: input.eventSignatureRef ?? null,
    transitionRef: matchedTransition?.ref ?? (classification === 'matched' && input.expectedTransitionRefs.length === 1 ? input.expectedTransitionRefs[0]! : null),
    expectedTransitionRefs: uniqueSorted(input.expectedTransitionRefs),
    observedStateRefs: uniqueSorted(afterObservedStateRefs),
    unexpectedStateRefs: uniqueSorted(unexpectedStateRefs),
    confidence: 'observed',
    classification,
    detail: Object.fromEntries(
      afterObservations
        .filter((entry) => entry.detail)
        .map((entry) => [entry.stateRef, JSON.stringify(entry.detail)]),
    ),
  };
}
