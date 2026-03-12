import type { RouteId, RouteVariantId, ScreenId } from '../identity';

export interface HarvestRouteVariant {
  id: RouteVariantId;
  url: string;
  screen: ScreenId;
  rootSelector?: string | null | undefined;
}

export interface HarvestRouteDefinition {
  id: RouteId;
  screen: ScreenId;
  entryUrl: string;
  rootSelector?: string | null | undefined;
  variants: HarvestRouteVariant[];
}

export interface HarvestManifest {
  kind: 'harvest-manifest';
  version: 1;
  app: string;
  baseUrl?: string | null | undefined;
  routes: HarvestRouteDefinition[];
}
