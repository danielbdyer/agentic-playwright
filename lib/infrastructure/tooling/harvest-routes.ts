import path from 'path';
import { pathToFileURL } from 'url';
import { Effect } from 'effect';
import type { DiscoveryRun } from '../../domain/types';
import type { HarvestManifest, HarvestRouteDefinition, HarvestRouteVariant } from '../../domain/types';
import { relativeProjectPath, type ProjectPaths } from '../../application/paths';
import { loadWorkspaceCatalog } from '../../application/catalog';
import { FileSystem } from '../../application/ports';
import { discoverScreenScaffold } from './discover-screen';

export interface HarvestRoutesResult {
  generatedAt: string;
  apps: string[];
  receipts: string[];
  failures: Array<{
    app: string;
    routeId: string;
    variantId: string;
    message: string;
  }>;
}

function resolveManifestBaseUrl(paths: ProjectPaths, manifest: HarvestManifest): URL | null {
  if (!manifest.baseUrl) {
    return null;
  }

  try {
    const url = new URL(manifest.baseUrl);
    return new URL(url.href.endsWith('/') ? url.href : `${url.href}/`);
  } catch {
    const basePath = path.resolve(paths.rootDir, manifest.baseUrl);
    const baseHref = pathToFileURL(basePath).href;
    return new URL(baseHref.endsWith('/') ? baseHref : `${baseHref}/`);
  }
}

function normalizeUrlForBase(baseUrl: URL, value: string): string {
  return baseUrl.protocol === 'file:'
    ? value.replace(/^\/+/, '')
    : value;
}

function resolveHarvestUrl(input: {
  paths: ProjectPaths;
  manifest: HarvestManifest;
  route: HarvestRouteDefinition;
  variant: HarvestRouteVariant;
}): string {
  const baseUrl = resolveManifestBaseUrl(input.paths, input.manifest);
  if (!baseUrl) {
    return input.variant.url;
  }

  const routeBaseUrl = new URL(normalizeUrlForBase(baseUrl, input.route.entryUrl), baseUrl);
  return new URL(normalizeUrlForBase(routeBaseUrl, input.variant.url || input.route.entryUrl), routeBaseUrl).href;
}

export function harvestDeclaredRoutes(options: {
  paths: ProjectPaths;
  app?: string | undefined;
  all?: boolean | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const manifests = (options.all ? catalog.routeManifests : catalog.routeManifests.filter((entry) => entry.artifact.app === options.app))
      .sort((left, right) => left.artifact.app.localeCompare(right.artifact.app));

    if (manifests.length === 0) {
      throw new Error(options.app
        ? `No harvest manifest found for app "${options.app}".`
        : 'No harvest manifests found. Pass --routes <app> or add knowledge/routes/*.routes.yaml.');
    }

    const receipts: string[] = [];
    const failures: HarvestRoutesResult['failures'] = [];
    const generatedAt = new Date().toISOString();

    for (const manifest of manifests) {
      const appIndexPath = path.join(options.paths.discoveryDir, manifest.artifact.app, 'index.json');
      const appReceipts: Array<{
        routeId: string;
        variantId: string;
        screen: string;
        status: 'ok' | 'failed';
        receiptPath?: string | undefined;
        message?: string | undefined;
      }> = [];

      for (const route of manifest.artifact.routes) {
        for (const variant of route.variants) {
          try {
            const resolvedUrl = resolveHarvestUrl({
              paths: options.paths,
              manifest: manifest.artifact,
              route,
              variant,
            });
            const discovery = yield* discoverScreenScaffold({
              screen: variant.screen,
              url: resolvedUrl,
              rootSelector: variant.rootSelector ?? route.rootSelector ?? 'body',
              paths: options.paths,
            });
            const rawValue = yield* fs.readJson(discovery.crawlPath);
            const raw = rawValue as DiscoveryRun;
            const receiptPath = path.join(options.paths.discoveryDir, manifest.artifact.app, route.id, variant.id, 'crawl.json');
            yield* fs.ensureDir(path.dirname(receiptPath));
            const routeVariantRef = `route-variant:${manifest.artifact.app}:${route.id}:${variant.id}`;
            const receipt: DiscoveryRun = {
              ...raw,
              app: manifest.artifact.app,
              routeId: route.id,
              variantId: variant.id,
              routeVariantRef,
              url: resolvedUrl,
              artifactPath: relativeProjectPath(options.paths, receiptPath),
              rootSelector: variant.rootSelector ?? route.rootSelector ?? raw.rootSelector,
              graphDeltas: raw.graphDeltas ?? {
                nodeIds: raw.targets.map((target: DiscoveryRun['targets'][number]) => target.graphNodeId),
                edgeIds: [],
              },
            };
            yield* fs.writeJson(receiptPath, receipt);
            receipts.push(relativeProjectPath(options.paths, receiptPath));
            appReceipts.push({
              routeId: route.id,
              variantId: variant.id,
              screen: variant.screen,
              status: 'ok',
              receiptPath: relativeProjectPath(options.paths, receiptPath),
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push({
              app: manifest.artifact.app,
              routeId: route.id,
              variantId: variant.id,
              message,
            });
            appReceipts.push({
              routeId: route.id,
              variantId: variant.id,
              screen: variant.screen,
              status: 'failed',
              message,
            });
          }
        }
      }

      yield* fs.ensureDir(path.dirname(appIndexPath));
      yield* fs.writeJson(appIndexPath, {
        kind: 'discovery-index',
        version: 1,
        app: manifest.artifact.app,
        generatedAt,
        receipts: appReceipts,
      });
    }

    return {
      generatedAt,
      apps: manifests.map((entry) => entry.artifact.app),
      receipts,
      failures,
    } satisfies HarvestRoutesResult;
  });
}
