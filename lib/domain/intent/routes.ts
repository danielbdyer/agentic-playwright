import type { RouteId, RouteVariantId, ScreenId } from '../kernel/identity';
import type { Governance } from '../governance/workflow-types';

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
  /** Canonical normalized path template used for deterministic matching. */
  readonly pathTemplate?: string | null | undefined;
  /** Required query-parameter discriminators for this variant. */
  readonly query?: Readonly<Record<string, string>> | undefined;
  /** Required hash discriminator for this variant. */
  readonly hash?: string | null | undefined;
  /** Canonical tab discriminator for this variant. */
  readonly tab?: string | null | undefined;
  readonly rootSelector?: string | null | undefined;
  /** Canonical semantic pattern used for route-intent matching. */
  readonly urlPattern?: string | null | undefined;
  /** Variant dimensions captured in this route knowledge entry. */
  readonly dimensions?: readonly RouteVariantDimension[] | undefined;
  /** Declarative entry-state references expected after navigation to this variant. */
  readonly expectedEntryState?: RouteVariantExpectedEntryState | undefined;
  /** Runtime-derived historical success summary for tie-breaking. */
  readonly historicalSuccess?: RouteVariantHistoricalSuccess | undefined;
  /**
   * Canonical route-state discriminators used for runtime pre-navigation.
   * Keys are normalized lower-case state names (for example: "tab", "mode").
   */
  readonly state?: Readonly<Record<string, string>> | undefined;
  /** Additional screen IDs this variant can map to (for shared routes). */
  readonly mappedScreens?: readonly ScreenId[] | undefined;
}

export interface HarvestRouteDefinition {
  readonly id: RouteId;
  readonly screen: ScreenId;
  readonly entryUrl: string;
  readonly rootSelector?: string | null | undefined;
  readonly variants: readonly HarvestRouteVariant[];
}

export interface HarvestManifest {
  readonly kind: 'harvest-manifest' | 'route-knowledge';
  readonly version: 1;
  readonly governance?: Governance | undefined;
  readonly app: string;
  readonly baseUrl?: string | null | undefined;
  readonly routes: readonly HarvestRouteDefinition[];
}
