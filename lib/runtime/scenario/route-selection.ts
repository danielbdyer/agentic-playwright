import { rankRouteVariants } from '../../domain/route-knowledge';
import { chooseByPrecedence, routeSelectionPrecedenceLaw } from '../../domain/precedence';
import type { InterfaceResolutionContext, GroundedStep, ResolutionReceipt } from '../../domain/types';
import type { RouteVariantKnowledge } from '../../domain/types/route-knowledge';

export interface RouteSelection {
  readonly selectedRouteVariantRef: string | null;
  readonly selectedRouteUrl: string | null;
  readonly semanticDestination: string | null;
  readonly fallbackRoutePath: readonly string[];
  readonly rationale: string | null;
  readonly preNavigationRequested: boolean;
}

export function normalizeStateRecord(value: Readonly<Record<string, string>> | null | undefined): Readonly<Record<string, string>> {
  return Object.entries(value ?? {})
    .map(([key, entry]) => [key.trim().toLowerCase(), entry.trim().toLowerCase()] as const)
    .filter(([key, entry]) => key.length > 0 && entry.length > 0)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .reduce<Readonly<Record<string, string>>>((acc, [key, entry]) => ({ ...acc, [key]: entry }), {});
}

export function variantStateMatchScore(
  variant: RouteVariantKnowledge & {
    readonly state?: Readonly<Record<string, string>> | undefined;
    readonly tab?: string | null | undefined;
    readonly hash?: string | null | undefined;
    readonly query?: Readonly<Record<string, string>> | undefined;
  },
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

export function selectRouteForNavigate(input: {
  readonly context: InterfaceResolutionContext;
  readonly task: GroundedStep;
  readonly interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
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
