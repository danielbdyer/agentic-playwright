/**
 * Route-selection helpers — carved out of `product/runtime/scenario.ts`
 * at Step 4a (round 2) per `docs/v2-direction.md §6 Step 4a` and
 * §3.7's named split.
 *
 * Pure route-variant ranking + selection utilities used by
 * `runScenarioStep` when the current step is a navigate or carries
 * a route-state request. The v2 navigate-verb shape adjustments
 * (Step 4b) will consume these functions unchanged.
 *
 * Pure domain — no Effect, no IO.
 */

import { uniqueSorted } from '../../domain/kernel/collections';
import { rankRouteVariants } from '../../domain/knowledge/route-knowledge';
import { chooseByPrecedence, routeSelectionPrecedenceLaw } from '../../domain/resolution/precedence';
import type { StateNodeRef } from '../../domain/kernel/identity';
import type { InterfaceResolutionContext } from '../../domain/knowledge/types';
import type { RouteVariantKnowledge } from '../../domain/knowledge/route-knowledge-types';
import type { GroundedStep, ResolutionReceipt } from '../../domain/resolution/types';
import type { ScenarioRunState } from '../../domain/aggregates/runtime-scenario-run';

/** Ranked + scored route-variant candidate used by the selection pass. */
export interface RouteSelection {
  readonly selectedRouteVariantRef: string | null;
  readonly selectedRouteUrl: string | null;
  readonly semanticDestination: string | null;
  readonly fallbackRoutePath: readonly string[];
  readonly rationale: string | null;
  readonly preNavigationRequested: boolean;
}

/** Active route-variant refs for a step. Observed-session refs take
 *  precedence; if none are recorded, fall back to grounding hints. */
export function activeRouteVariantRefs(
  state: ScenarioRunState,
  task: GroundedStep,
): readonly string[] {
  return state.observedStateSession.activeRouteVariantRefs.length > 0
    ? state.observedStateSession.activeRouteVariantRefs
    : task.grounding.routeVariantRefs;
}

/** State refs relevant to a step's outcome observation (required +
 *  forbidden + result). De-duped and sorted. */
export function relevantStateRefs(task: GroundedStep): readonly StateNodeRef[] {
  return uniqueSorted([
    ...task.grounding.requiredStateRefs,
    ...task.grounding.forbiddenStateRefs,
    ...task.grounding.resultStateRefs,
  ]);
}

/** Normalize a routeState / variant record: trim + lowercase keys
 *  and values, drop empties, sort deterministically. */
export function normalizeStateRecord(
  value: Readonly<Record<string, string>> | null | undefined,
): Readonly<Record<string, string>> {
  return Object.entries(value ?? {})
    .map(([key, entry]) => [key.trim().toLowerCase(), entry.trim().toLowerCase()] as const)
    .filter(([key, entry]) => key.length > 0 && entry.length > 0)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .reduce<Readonly<Record<string, string>>>((acc, [key, entry]) => ({ ...acc, [key]: entry }), {});
}

/** Score a route-variant against a requested-state record. Returns
 *  the normalized match ratio in [0, 1]. */
export function variantStateMatchScore(
  variant: RouteVariantKnowledge & { state?: Readonly<Record<string, string>> | undefined; tab?: string | null | undefined; hash?: string | null | undefined; query?: Readonly<Record<string, string>> | undefined },
  requestedState: Readonly<Record<string, string>>,
): number {
  const requestedEntries = Object.entries(requestedState);
  if (requestedEntries.length === 0) {
    return 0;
  }
  const variantState = normalizeStateRecord(variant.state ?? {});
  const matched = requestedEntries.filter(([key, value]) =>
    variantState[key] === value
    || (key === 'tab' && ((variant.tab ?? '').toLowerCase() === value))
    || (key === 'hash' && ((variant.hash ?? '').replace(/^#/, '').toLowerCase() === value.replace(/^#/, '').toLowerCase()))
    || ((variant.query ?? {})[key]?.toLowerCase() === value),
  ).length;
  return Number((matched / requestedEntries.length).toFixed(3));
}

/** All route-variant knowledge records for a screen, projected into
 *  the shape the ranker consumes. */
export function routeVariantsForScreen(
  context: InterfaceResolutionContext,
  screen: string,
): readonly RouteVariantKnowledge[] {
  const screenEntry = context.screens.find((candidate) => candidate.screen === screen);
  return (screenEntry?.routeVariants ?? []).map((variant) => ({
    routeVariantRef: variant.routeVariantRef,
    screenId: screen,
    url: variant.url,
    urlPattern: variant.urlPattern ?? variant.url,
    dimensions: variant.dimensions ?? [],
    expectedEntryStateRefs: variant.expectedEntryStateRefs ?? [],
    historicalSuccess: {
      successCount: variant.historicalSuccess?.successCount ?? 0,
      failureCount: variant.historicalSuccess?.failureCount ?? 0,
      lastSuccessAt: variant.historicalSuccess?.lastSuccessAt ?? null,
    },
    state: variant.state ?? {},
    tab: variant.tab ?? null,
    hash: variant.hash ?? null,
    query: variant.query ?? {},
  }));
}

/** Pick a route variant for a navigate step or a route-state
 *  request. Ranks candidates by knowledge score plus requested-state
 *  match; respects explicit-URL and runbook-binding precedence. */
export function selectRouteForNavigate(input: {
  context: InterfaceResolutionContext;
  task: GroundedStep;
  interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
}): RouteSelection {
  const requestedRouteState = normalizeStateRecord(input.interpretation.target.routeState ?? null);
  if (input.interpretation.target.action !== 'navigate' && Object.keys(requestedRouteState).length === 0) {
    return {
      selectedRouteVariantRef: null,
      selectedRouteUrl: null,
      semanticDestination: null,
      fallbackRoutePath: [],
      rationale: null,
      preNavigationRequested: false,
    };
  }
  const semanticDestination = input.interpretation.target.semanticDestination
    ?? `${input.task.normalizedIntent} ${input.task.actionText}`.trim();
  const rankedBase = rankRouteVariants(
    routeVariantsForScreen(input.context, input.interpretation.target.screen),
    {
      screenId: input.interpretation.target.screen,
      semanticDestination,
      expectedEntryStateRefs: input.task.grounding.resultStateRefs,
    },
  );
  const ranked = rankedBase
    .map((entry) => ({
      ...entry,
      routeStateScore: variantStateMatchScore(entry.variant, requestedRouteState),
      score: Number((entry.score + variantStateMatchScore(entry.variant, requestedRouteState) * 8).toFixed(3)),
    }))
    .sort((left, right) => right.score - left.score || left.variant.routeVariantRef.localeCompare(right.variant.routeVariantRef));
  const selected = ranked[0] ?? null;
  const explicitVariant = ranked.find((entry) => entry.variant.routeVariantRef === input.interpretation.target.routeVariantRef) ?? null;
  const selectedRouteUrl = chooseByPrecedence(
    [
      { rung: 'explicit-url' as const, value: explicitVariant?.variant.url ?? null },
      { rung: 'runbook-binding' as const, value: null },
      { rung: 'route-knowledge' as const, value: selected?.variant.url ?? null },
      { rung: 'screen-default' as const, value: null },
    ],
    routeSelectionPrecedenceLaw,
  );
  const selectedRouteVariantRef = selectedRouteUrl === explicitVariant?.variant.url
    ? explicitVariant?.variant.routeVariantRef ?? null
    : (selected?.variant.routeVariantRef ?? input.interpretation.target.routeVariantRef ?? null);
  return {
    selectedRouteVariantRef,
    selectedRouteUrl,
    semanticDestination,
    fallbackRoutePath: ranked.slice(1, 4).map((entry) => entry.variant.routeVariantRef),
    rationale: selected ? `${selected.rationale}, routeState=${selected.routeStateScore.toFixed(3)}` : null,
    preNavigationRequested: Object.keys(requestedRouteState).length > 0,
  };
}
