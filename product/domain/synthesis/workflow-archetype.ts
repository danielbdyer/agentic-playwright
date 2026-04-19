import { type SeededRng, pick, shuffle } from '../kernel/random';
import type { WidgetAction } from '../knowledge/widget-types';
import {
  affordanceFamiliesForWidget,
  affordancesForRole,
  preferredScenarioActionForRole,
  roleForWidget,
  widgetHasAffordanceFamily,
} from '../widgets/role-affordances';
import type { ScreenElementPlanInput, ScreenPlanInput } from './scenario-plan';
import { generateHeldOutPhrases, generateNavPhrase, generateNavExpectation, selectAtGapDistance } from './translation-gap';

// ─── Archetype types ───

export type ArchetypeId =
  | 'search-verify'
  | 'detail-inspect'
  | 'cross-screen-journey'
  | 'form-submit'
  | 'read-only-audit';

export interface ArchetypeStep {
  readonly intent: string;
  readonly actionText: string;
  readonly expectedText: string;
  readonly required: boolean;
  readonly role: 'navigation' | 'interaction' | 'verification';
}

export interface ArchetypeContext {
  readonly screens: readonly ScreenPlanInput[];
  readonly primaryScreen: ScreenPlanInput;
  readonly lexicalGap: number;
  readonly dataVariation: number;
  readonly rng: SeededRng;
}

// ─── Archetype implementations ───

interface ClassifiedElements {
  readonly fillable: readonly ScreenElementPlanInput[];
  readonly checkable: readonly ScreenElementPlanInput[];
  readonly selects: readonly ScreenElementPlanInput[];
  readonly activators: readonly ScreenElementPlanInput[];
  readonly readOnly: readonly ScreenElementPlanInput[];
  readonly tables: readonly ScreenElementPlanInput[];
}

/**
 * Classify elements by their role affordances for archetype composition.
 * Derived from ROLE_AFFORDANCES: roles with 'fill' → inputs, 'click' → buttons, etc.
 */
const classifyElements = (elements: readonly ScreenElementPlanInput[]): ClassifiedElements => {
  return {
    fillable: elements.filter((e) => widgetHasAffordanceFamily(e.widget, 'fillable')),
    checkable: elements.filter((e) => widgetHasAffordanceFamily(e.widget, 'checkable')),
    selects: elements.filter((e) => widgetHasAffordanceFamily(e.widget, 'selectable')),
    activators: elements.filter((e) =>
      widgetHasAffordanceFamily(e.widget, 'clickable') &&
      !widgetHasAffordanceFamily(e.widget, 'fillable') &&
      !widgetHasAffordanceFamily(e.widget, 'checkable') &&
      !widgetHasAffordanceFamily(e.widget, 'selectable')),
    readOnly: elements.filter((e) => {
      const families = affordanceFamiliesForWidget(e.widget);
      const interactiveFamilies = families.filter((family) =>
        family === 'clickable' || family === 'fillable' || family === 'checkable' || family === 'selectable');
      if (interactiveFamilies.length > 0) return false;
      const role = roleForWidget(e.widget);
      if (!role) return true;
      return affordancesForRole(role).every((a) => a.effectCategory === 'observation');
    }),
    tables: elements.filter((e) => {
      const role = roleForWidget(e.widget);
      return role === 'table' || role === 'grid';
    }),
  };
};

const uniqueElements = (elements: readonly ScreenElementPlanInput[]): readonly ScreenElementPlanInput[] => {
  const seen = new Set<string>();
  return elements.filter((element) => {
    if (seen.has(element.elementId)) return false;
    seen.add(element.elementId);
    return true;
  });
};

const preferredMutationActionForElement = (element: ScreenElementPlanInput): WidgetAction | null => {
  const role = roleForWidget(element.widget);
  return role ? preferredScenarioActionForRole(role) : null;
};

const mutationStepForElement = (
  element: ScreenElementPlanInput,
  phrase: string,
  value: string,
): ArchetypeStep => {
  const action = preferredMutationActionForElement(element);
  switch (action) {
    case 'select':
      return interactionStep(`Select ${value} in the ${phrase}`, `${phrase} accepts the selection`, element.required);
    case 'check':
      return interactionStep(`Check the ${phrase}`, `${phrase} is checked`, element.required);
    case 'uncheck':
      return interactionStep(`Uncheck the ${phrase}`, `${phrase} is cleared`, element.required);
    case 'click':
      return interactionStep(`Click the ${phrase}`, `${phrase} is activated`, element.required);
    case 'clear':
      return interactionStep(`Clear the ${phrase}`, `${phrase} is cleared`, element.required);
    case 'fill':
    default:
      return interactionStep(`Enter ${value} in the ${phrase}`, `${phrase} accepts the value`, element.required);
  }
};

/**
 * Pick a value for an input field, using posture data when available.
 */
const pickValue = (element: ScreenElementPlanInput, rng: SeededRng, dataVariation: number): string => {
  if (dataVariation > 0 && rng() < dataVariation) {
    const postures = element.postureValues ?? [];
    const allValues = postures.flatMap((p) => [...p.values]).filter((v) => v.length > 0);
    if (allValues.length > 0) return pick(allValues, rng);
  }
  return 'a valid value';
};

/**
 * Get the element phrase — either held-out or known alias, based on lexical gap distance.
 */
const phraseForElement = (
  element: ScreenElementPlanInput,
  screen: ScreenPlanInput,
  lexicalGap: number,
  rng: SeededRng,
): string => {
  const knownAlias = element.aliases.length > 0
    ? pick(element.aliases, rng)
    : element.elementId.replace(/([A-Z])/g, ' $1').replace(/-/g, ' ').trim().toLowerCase();

  const heldOut = generateHeldOutPhrases(element.elementId, element.widget, screen.screenId, rng);
  const selected = selectAtGapDistance(knownAlias, heldOut, lexicalGap, rng, screen.screenId, element.elementId);
  return selected.text;
};

const navigationStep = (
  actionText: string,
  expectedText: string,
): ArchetypeStep => ({
  intent: actionText,
  actionText,
  expectedText,
  required: true,
  role: 'navigation',
});

const interactionStep = (
  actionText: string,
  expectedText: string,
  required: boolean,
): ArchetypeStep => ({
  intent: actionText,
  actionText,
  expectedText,
  required,
  role: 'interaction',
});

const verificationStep = (
  actionText: string,
  expectedText: string,
  required: boolean,
): ArchetypeStep => ({
  intent: actionText,
  actionText,
  expectedText,
  required,
  role: 'verification',
});

const replicateArchetypeByWeight = (candidate: ArchetypeId, weight: number): readonly ArchetypeId[] =>
  Array.from({ length: Math.max(0, weight) }, () => candidate);

// ─── search-verify: Navigate → enter criteria → search → verify results ───

const searchVerify = (ctx: ArchetypeContext): readonly ArchetypeStep[] => {
  const { primaryScreen, lexicalGap, rng, dataVariation } = ctx;
  const { fillable, checkable, selects, activators, readOnly, tables } = classifyElements(primaryScreen.elements);
  const screenAlias = primaryScreen.screenAliases[0] ?? primaryScreen.screenId;

  const navPhrase = generateNavPhrase(primaryScreen.screenId, screenAlias, rng);
  const navAction = lexicalGap > 0 ? navPhrase.text : `Navigate to ${screenAlias}`;
  const navExpected = lexicalGap > 0
    ? generateNavExpectation(primaryScreen.screenId, rng)
    : `${screenAlias} loads successfully`;

  const navStep = navigationStep(navAction, navExpected);

  // Enter search criteria
  const criteriaFields = uniqueElements([...fillable, ...selects, ...checkable]);
  const inputSteps = criteriaFields.length > 0
    ? [criteriaFields[0]!].map((input) => {
      const phrase = phraseForElement(input, primaryScreen, lexicalGap, rng);
      const value = pickValue(input, rng, dataVariation);
      return mutationStepForElement(input, phrase, value);
    })
    : [];

  // Click search
  const buttonSteps = activators.length > 0
    ? [activators[0]!].map((button) => {
      const phrase = phraseForElement(button, primaryScreen, lexicalGap, rng);
      return mutationStepForElement(button, phrase, pickValue(button, rng, dataVariation));
    })
    : [];

  // Verify results
  const verifyTargets = [...tables, ...readOnly];
  const verifySteps = verifyTargets.length > 0
    ? [verifyTargets[0]!].map((target) => {
      const phrase = phraseForElement(target, primaryScreen, lexicalGap, rng);
      const actionText = `Verify ${phrase} shows the expected results`;
      return verificationStep(actionText, `${phrase} displays matching data`, target.required);
    })
    : [];

  return [navStep, ...inputSteps, ...buttonSteps, ...verifySteps];
};

// ─── detail-inspect: Navigate → verify multiple fields ───

const detailInspect = (ctx: ArchetypeContext): readonly ArchetypeStep[] => {
  const { primaryScreen, lexicalGap, rng } = ctx;
  const { readOnly, tables } = classifyElements(primaryScreen.elements);
  const screenAlias = primaryScreen.screenAliases[0] ?? primaryScreen.screenId;

  const navPhrase = generateNavPhrase(primaryScreen.screenId, screenAlias, rng);
  const navAction = lexicalGap > 0 ? navPhrase.text : `Navigate to ${screenAlias}`;
  const navExpected = lexicalGap > 0
    ? generateNavExpectation(primaryScreen.screenId, rng)
    : `${screenAlias} loads successfully`;

  const navStep = navigationStep(navAction, navExpected);

  // Inspect multiple fields
  const inspectTargets = shuffle([...readOnly, ...tables], rng).slice(0, Math.min(3, readOnly.length + tables.length));
  const inspectSteps = inspectTargets.map((target) => {
    const phrase = phraseForElement(target, primaryScreen, lexicalGap, rng);
    const actionText = `Check that ${phrase} is displayed correctly`;
    return verificationStep(actionText, `${phrase} shows the correct information`, target.required);
  });

  return [navStep, ...inspectSteps];
};

// ─── cross-screen-journey: Navigate A → interact → navigate B → verify ───

const crossScreenJourney = (ctx: ArchetypeContext): readonly ArchetypeStep[] => {
  const { screens, primaryScreen, lexicalGap, rng, dataVariation } = ctx;
  const otherScreens = screens.filter((s) => s.screenId !== primaryScreen.screenId);
  const secondScreen = otherScreens.length > 0 ? pick(otherScreens, rng) : primaryScreen;

  const screenAlias1 = primaryScreen.screenAliases[0] ?? primaryScreen.screenId;
  const screenAlias2 = secondScreen.screenAliases[0] ?? secondScreen.screenId;

  // Navigate to first screen
  const nav1Phrase = generateNavPhrase(primaryScreen.screenId, screenAlias1, rng);
  const nav1Action = lexicalGap > 0 ? nav1Phrase.text : `Navigate to ${screenAlias1}`;
  const nav1Expected = lexicalGap > 0
    ? generateNavExpectation(primaryScreen.screenId, rng)
    : `${screenAlias1} loads successfully`;

  // Interact with first screen
  const { fillable, checkable, selects, activators } = classifyElements(primaryScreen.elements);
  const interactionFields = uniqueElements([...fillable, ...selects, ...checkable]);
  const interactSteps = interactionFields.length > 0
    ? [interactionFields[0]!].map((input) => {
        const phrase = phraseForElement(input, primaryScreen, lexicalGap, rng);
        const value = pickValue(input, rng, dataVariation);
        return mutationStepForElement(input, phrase, value);
      })
    : activators.length > 0
      ? [activators[0]!].map((btn) => {
        const phrase = phraseForElement(btn, primaryScreen, lexicalGap, rng);
        return mutationStepForElement(btn, phrase, pickValue(btn, rng, dataVariation));
      })
      : [];

  // Navigate to second screen
  const nav2Phrase = generateNavPhrase(secondScreen.screenId, screenAlias2, rng);
  const nav2Action = lexicalGap > 0 ? nav2Phrase.text : `Navigate to ${screenAlias2}`;
  const nav2Expected = lexicalGap > 0
    ? generateNavExpectation(secondScreen.screenId, rng)
    : `${screenAlias2} loads successfully`;

  // Verify on second screen
  const { readOnly: readOnly2, tables: tables2 } = classifyElements(secondScreen.elements);
  const verifyTargets = [...readOnly2, ...tables2];
  const verifySteps = verifyTargets.length > 0
    ? [verifyTargets[0]!].map((target) => {
      const phrase = phraseForElement(target, secondScreen, lexicalGap, rng);
      return verificationStep(
        `Verify ${phrase} on ${screenAlias2}`,
        `${phrase} is displayed correctly`,
        target.required,
      );
    })
    : [];

  return [
    navigationStep(nav1Action, nav1Expected),
    ...interactSteps,
    navigationStep(nav2Action, nav2Expected),
    ...verifySteps,
  ];
};

// ─── form-submit: Navigate → fill fields → submit → verify outcome ───

const formSubmit = (ctx: ArchetypeContext): readonly ArchetypeStep[] => {
  const { primaryScreen, lexicalGap, rng, dataVariation } = ctx;
  const { fillable, checkable, selects, activators, readOnly } = classifyElements(primaryScreen.elements);
  const screenAlias = primaryScreen.screenAliases[0] ?? primaryScreen.screenId;

  const navPhrase = generateNavPhrase(primaryScreen.screenId, screenAlias, rng);
  const navAction = lexicalGap > 0 ? navPhrase.text : `Navigate to ${screenAlias}`;
  const navExpected = lexicalGap > 0
    ? generateNavExpectation(primaryScreen.screenId, rng)
    : `${screenAlias} loads successfully`;

  // Fill all input fields
  const fillSteps = uniqueElements([...fillable, ...selects, ...checkable]).slice(0, 3).map((field) => {
    const phrase = phraseForElement(field, primaryScreen, lexicalGap, rng);
    const value = pickValue(field, rng, dataVariation);
    return mutationStepForElement(field, phrase, value);
  });

  // Submit
  const submitSteps = activators.length > 0
    ? [activators[0]!].map((btn) => {
      const phrase = phraseForElement(btn, primaryScreen, lexicalGap, rng);
      return interactionStep(`Submit by clicking ${phrase}`, 'Form submission is processed', btn.required);
    })
    : [];

  // Verify outcome
  const verifySteps = readOnly.length > 0
    ? [readOnly[0]!].map((target) => {
      const phrase = phraseForElement(target, primaryScreen, lexicalGap, rng);
      return verificationStep(
        `Verify ${phrase} shows the updated information`,
        `${phrase} reflects the changes`,
        target.required,
      );
    })
    : [];

  return [
    navigationStep(navAction, navExpected),
    ...fillSteps,
    ...submitSteps,
    ...verifySteps,
  ];
};

// ─── read-only-audit: Navigate → verify multiple read-only fields ───

const readOnlyAudit = (ctx: ArchetypeContext): readonly ArchetypeStep[] => {
  const { primaryScreen, lexicalGap, rng } = ctx;
  const allElements = shuffle([...primaryScreen.elements], rng);
  const screenAlias = primaryScreen.screenAliases[0] ?? primaryScreen.screenId;

  const navPhrase = generateNavPhrase(primaryScreen.screenId, screenAlias, rng);
  const navAction = lexicalGap > 0 ? navPhrase.text : `Navigate to ${screenAlias}`;
  const navExpected = lexicalGap > 0
    ? generateNavExpectation(primaryScreen.screenId, rng)
    : `${screenAlias} loads successfully`;

  // Audit up to 4 fields
  const auditSteps = allElements.slice(0, Math.min(4, allElements.length)).map((target) => {
    const phrase = phraseForElement(target, primaryScreen, lexicalGap, rng);
    const actionText = `Confirm ${phrase} is present on the page`;
    return verificationStep(actionText, `${phrase} is visible and shows expected data`, target.required);
  });

  return [
    navigationStep(navAction, navExpected),
    ...auditSteps,
  ];
};

// ─── Archetype registry ───

const ARCHETYPES = {
  'search-verify': searchVerify,
  'detail-inspect': detailInspect,
  'cross-screen-journey': crossScreenJourney,
  'form-submit': formSubmit,
  'read-only-audit': readOnlyAudit,
} as const satisfies Readonly<Record<ArchetypeId, (ctx: ArchetypeContext) => readonly ArchetypeStep[]>>;

// Previously this was a hand-maintained parallel array to ARCHETYPES
// that drift-risked going out of sync. Derived via Object.keys()
// against the `as const satisfies` registry so adding a new
// archetype to ARCHETYPES automatically updates the id list.
const ARCHETYPE_IDS: readonly ArchetypeId[] = Object.keys(ARCHETYPES) as readonly ArchetypeId[];

/**
 * Per-cohort archetype selection bias. When supplied to
 * `selectArchetype()`, replaces the element-classification-based
 * weighted candidate pool with cohort-specific weights. A cohort that
 * wants only `search-verify` scenarios passes
 * `{ weights: { 'search-verify': 1 } }`. A cohort that wants equal
 * representation passes equal weights for the desired archetypes.
 *
 * Pure type — see `lib/domain/synthesis/cohort-plan.ts` for the
 * canonical definition of `ArchetypePreference`. This declaration is
 * here only to avoid a circular import; it must stay structurally
 * identical.
 */
export interface ArchetypeSelectionPreference {
  readonly weights: Readonly<Partial<Record<ArchetypeId, number>>>;
}

/**
 * Select an archetype appropriate for the given screen's element composition.
 * Screens with inputs get search-verify or form-submit; read-only screens get audit or inspect.
 *
 * When `preference` is supplied, the cohort's explicit weights replace
 * the default classification-driven candidate pool. This is the
 * extension point the cohort orchestrator uses to ensure each cohort's
 * archetype distribution matches its declared preference.
 */
export function selectArchetype(
  screen: ScreenPlanInput,
  screens: readonly ScreenPlanInput[],
  rng: SeededRng,
  crossScreen = 0,
  preference?: ArchetypeSelectionPreference,
): ArchetypeId {
  if (preference !== undefined) {
    const preferenceCandidates: readonly ArchetypeId[] = (Object.entries(preference.weights) as ReadonlyArray<[ArchetypeId, number | undefined]>)
      .flatMap(([id, weight]) => replicateArchetypeByWeight(id, Math.max(0, weight ?? 0)));
    if (preferenceCandidates.length > 0) {
      return pick(preferenceCandidates, rng);
    }
  }

  const { fillable, checkable, selects, activators, readOnly, tables } = classifyElements(screen.elements);
  const hasInputs = fillable.length > 0 || checkable.length > 0 || selects.length > 0;
  const hasButtons = activators.length > 0;
  const hasOutputs = readOnly.length > 0 || tables.length > 0;
  const hasSelectableFields = selects.length > 0;
  const hasMultipleScreens = screens.length > 1;

  const candidates: readonly ArchetypeId[] = [
    ...replicateArchetypeByWeight('search-verify', hasInputs && hasButtons && hasOutputs ? 4 : 0),
    ...replicateArchetypeByWeight('form-submit', hasInputs && (hasButtons || hasSelectableFields) ? 3 : 0),
    ...replicateArchetypeByWeight('detail-inspect', hasOutputs ? 2 : 1),
    ...replicateArchetypeByWeight('read-only-audit', screen.elements.length > 0 ? 1 : 0),
    ...replicateArchetypeByWeight(
      'cross-screen-journey',
      hasMultipleScreens ? Math.round(Math.max(0, Math.min(1, crossScreen)) * 4) : 0,
    ),
  ];

  return candidates.length > 0 ? pick(candidates, rng) : pick(ARCHETYPE_IDS, rng);
}

/**
 * Compose a scenario using the given archetype.
 * Returns a coherent sequence of steps with causal dependencies.
 */
export function composeWorkflowSteps(
  archetypeId: ArchetypeId,
  context: ArchetypeContext,
): readonly ArchetypeStep[] {
  const archetype = ARCHETYPES[archetypeId];
  return archetype(context);
}
