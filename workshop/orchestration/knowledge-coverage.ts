import type { KnowledgeCoverageSummary } from '../../domain/fitness/types';
import type { WorkspaceCatalog } from '../catalog/types';

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function rate(count: number, total: number): number {
  return total > 0 ? round4(count / total) : 0;
}

export function summarizeKnowledgeCoverage(catalog: WorkspaceCatalog): KnowledgeCoverageSummary {
  const bundles = Object.values(catalog.screenBundles);
  const elementCoverage = bundles.flatMap((bundle) =>
    Object.entries(bundle.elements.artifact.elements).map(([elementId, element]) => {
      const hint = bundle.hints?.artifact.elements[elementId];
      const postures = bundle.postures?.artifact.postures[elementId];
      const role = hint?.role ?? element.role ?? null;
      const affordance = hint?.affordance ?? element.affordance ?? null;
      const locatorLadder = hint?.locatorLadder ?? element.locator ?? [];

      return {
        hasRole: typeof role === 'string' && role.length > 0,
        hasAffordance: typeof affordance === 'string' && affordance.length > 0,
        hasLocator: locatorLadder.length > 0,
        hasPosture: postures !== undefined && Object.keys(postures).length > 0,
      };
    }),
  );

  const totalElements = elementCoverage.length;
  const totalScreens = bundles.length;
  const routeEntries = catalog.routeManifests.flatMap((entry) => entry.artifact.routes);
  const screensWithRoutes = new Set(routeEntries.map((route) => route.screen));
  const routesWithVariants = routeEntries.filter((route) => route.variants.length > 0).length;

  return {
    totalElements,
    totalScreens,
    roleCoverageRate: rate(elementCoverage.filter((entry) => entry.hasRole).length, totalElements),
    affordanceCoverageRate: rate(elementCoverage.filter((entry) => entry.hasAffordance).length, totalElements),
    locatorCoverageRate: rate(elementCoverage.filter((entry) => entry.hasLocator).length, totalElements),
    postureCoverageRate: rate(elementCoverage.filter((entry) => entry.hasPosture).length, totalElements),
    routeScreenCoverageRate: rate(screensWithRoutes.size, totalScreens),
    routeVariantCoverageRate: rate(routesWithVariants, routeEntries.length),
  };
}
