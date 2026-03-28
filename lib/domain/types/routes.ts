import type { RouteId, RouteVariantId, ScreenId } from '../identity';

export type RouteVariantDimension = 'query' | 'hash' | 'tab' | 'segment';

export interface RouteVariantExpectedEntryState {
  readonly requiredStateRefs: readonly string[];
  readonly forbiddenStateRefs: readonly string[];
}

export interface RouteVariantHistoricalSuccess {
  readonly successCount: number;
  readonly failureCount: number;
  readonly lastSuccessAt?: string | null | undefined;
}

export interface HarvestRouteVariant {
  readonly id: RouteVariantId;
  readonly url: string;
  readonly screen: ScreenId;
  readonly rootSelector?: string | null | undefined;
  /** Canonical semantic pattern used for route-intent matching. */
  readonly urlPattern?: string | null | undefined;
  /** Variant dimensions captured in this route knowledge entry. */
  readonly dimensions?: readonly RouteVariantDimension[] | undefined;
  /** Declarative entry-state references expected after navigation to this variant. */
  readonly expectedEntryState?: RouteVariantExpectedEntryState | undefined;
  /** Runtime-derived historical success summary for tie-breaking. */
  readonly historicalSuccess?: RouteVariantHistoricalSuccess | undefined;
}

export interface HarvestRouteDefinition {
  readonly id: RouteId;
  readonly screen: ScreenId;
  readonly entryUrl: string;
  readonly rootSelector?: string | null | undefined;
  readonly variants: readonly HarvestRouteVariant[];
}

export interface HarvestManifest {
  readonly kind: 'harvest-manifest';
  readonly version: 1;
  readonly app: string;
  readonly baseUrl?: string | null | undefined;
  readonly routes: readonly HarvestRouteDefinition[];
}
