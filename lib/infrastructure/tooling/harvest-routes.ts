import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from '@playwright/test';
import { Effect } from 'effect';
import { fingerprintFor, taggedFingerprintFor } from '../../domain/kernel/hash';
import { createCanonicalTargetRef, createElementId } from '../../domain/kernel/identity';
import type { RouteKnowledgeManifest, RouteKnowledgeRoute, RouteKnowledgeVariant } from '../../domain/intent/routes';
import type {
  EventSignature,
  ScreenBehavior,
  StateNode,
  StateTransition,
} from '../../domain/knowledge/types';
import type {
  DiscoveryIndex,
  DiscoveryIndexEntry,
  DiscoveryRun,
  StateTransitionGraph,
} from '../../domain/target/interface-graph';
import { validateDiscoveryIndex, validateDiscoveryRun } from '../../domain/validation';
import { relativeProjectPath, type ProjectPaths } from '../../application/paths';
import { loadWorkspaceCatalog } from '../../application/catalog';
import type { WorkspaceCatalog } from '../../application/catalog';
import { FileSystem } from '../../application/ports';
import {
  observeStateRefsOnPage,
  observeTransitionOnPage,
  performSafeActiveEvent,
  primeRequiredStatesOnPage,
  type PlaywrightStateObservationContext,
} from '../../playwright/state-topology';
import { discoverScreenScaffold } from './discover-screen';
import { launchSharedBrowser, resolvePlaywrightHeadless, resolvePreferredPlaywrightChannel } from './browser-options';

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

function resolveManifestBaseUrl(paths: ProjectPaths, manifest: RouteKnowledgeManifest): URL | null {
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
  manifest: RouteKnowledgeManifest;
  route: RouteKnowledgeRoute;
  variant: RouteKnowledgeVariant;
}): string {
  const baseUrl = resolveManifestBaseUrl(input.paths, input.manifest);
  if (!baseUrl) {
    return input.variant.url;
  }

  const routeBaseUrl = new URL(normalizeUrlForBase(baseUrl, input.route.entryUrl), baseUrl);
  return new URL(normalizeUrlForBase(routeBaseUrl, input.variant.url || input.route.entryUrl), routeBaseUrl).href;
}

function createDiscoveryReceiptId(input: {
  app: string;
  routeId: string;
  variantId: string;
  snapshotHash: string;
}): string {
  return fingerprintFor('discovery-receipt-id', input);
}

function normalizeDiscoveryRun(receipt: DiscoveryRun): DiscoveryRun {
  return {
    ...receipt,
    sections: [...receipt.sections]
      .map((section) => ({
        ...section,
        surfaceIds: [...section.surfaceIds].sort((left, right) => left.localeCompare(right)),
        elementIds: [...section.elementIds].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => {
        const depthOrder = left.depth - right.depth;
        if (depthOrder !== 0) {
          return depthOrder;
        }
        return left.id.localeCompare(right.id);
      }),
    surfaces: [...receipt.surfaces].sort((left, right) => left.id.localeCompare(right.id)),
    elements: [...receipt.elements].sort((left, right) => left.id.localeCompare(right.id)),
    snapshotAnchors: [...receipt.snapshotAnchors].sort((left, right) => left.localeCompare(right)),
    targets: [...receipt.targets].sort((left, right) => left.targetRef.localeCompare(right.targetRef)),
    reviewNotes: [...receipt.reviewNotes].sort((left, right) => {
      const codeOrder = left.code.localeCompare(right.code);
      if (codeOrder !== 0) {
        return codeOrder;
      }
      const targetOrder = left.targetId.localeCompare(right.targetId);
      if (targetOrder !== 0) {
        return targetOrder;
      }
      return left.message.localeCompare(right.message);
    }),
    selectorProbes: [...receipt.selectorProbes].sort((left, right) => left.id.localeCompare(right.id)),
    stateObservations: [...(receipt.stateObservations ?? [])].sort((left, right) =>
      left.stateRef.localeCompare(right.stateRef) || left.source.localeCompare(right.source),
    ),
    eventCandidates: [...(receipt.eventCandidates ?? [])].sort((left, right) =>
      left.eventSignatureRef.localeCompare(right.eventSignatureRef) || left.targetRef.localeCompare(right.targetRef),
    ),
    transitionObservations: [...(receipt.transitionObservations ?? [])].sort((left, right) =>
      left.observationId.localeCompare(right.observationId),
    ),
    observationDiffs: [...(receipt.observationDiffs ?? [])].sort((left, right) =>
      `${left.transitionRef ?? ''}:${left.beforeStateRef ?? ''}:${left.afterStateRef ?? ''}`.localeCompare(
        `${right.transitionRef ?? ''}:${right.beforeStateRef ?? ''}:${right.afterStateRef ?? ''}`,
      ),
    ),
    graphDeltas: {
      nodeIds: [...receipt.graphDeltas.nodeIds].sort((left, right) => left.localeCompare(right)),
      edgeIds: [...receipt.graphDeltas.edgeIds].sort((left, right) => left.localeCompare(right)),
    },
  };
}

function fingerprintDiscoveryRun(receipt: DiscoveryRun): string {
  const { discoveredAt: _discoveredAt, ...stableReceipt } = normalizeDiscoveryRun(receipt);
  return taggedFingerprintFor('harvest-receipt', stableReceipt);
}

function fingerprintDiscoveryIndex(index: DiscoveryIndex): string {
  const stableIndex = {
    ...index,
    generatedAt: null,
    receipts: [...index.receipts].map(({ inputFingerprint: _ip, ...rest }) => rest).sort((left, right) => {
      const routeOrder = left.routeId.localeCompare(right.routeId);
      if (routeOrder !== 0) {
        return routeOrder;
      }
      return left.variantId.localeCompare(right.variantId);
    }),
  };
  return taggedFingerprintFor('harvest-index', stableIndex);
}


/**
 * Compute a fingerprint of the inputs that determine harvest output for a route variant.
 * When this fingerprint matches the stored one, the browser crawl can be skipped entirely.
 */
function computeHarvestInputFingerprint(input: {
  resolvedUrl: string;
  route: RouteKnowledgeRoute;
  variant: RouteKnowledgeVariant;
  catalog: WorkspaceCatalog;
}): string {
  const behaviorFingerprints = behaviorArtifactsForScreen(input.catalog, input.variant.screen)
    .map((entry) => ({ path: entry.artifactPath, hash: fingerprintFor('artifact', entry.artifact) }));
  const knowledgeInputs = {
    url: input.resolvedUrl,
    routeId: input.route.id,
    entryUrl: input.route.entryUrl,
    rootSelector: input.variant.rootSelector ?? input.route.rootSelector ?? 'body',
    variantId: input.variant.id,
    variantUrl: input.variant.url,
    variantScreen: input.variant.screen,
    behaviorFingerprints,
  };
  return taggedFingerprintFor('harvest-input', knowledgeInputs);
}

function behaviorArtifactsForScreen(catalog: WorkspaceCatalog, screen: string): Array<{
  artifactPath: string;
  artifact: ScreenBehavior | { stateNodes: readonly StateNode[]; eventSignatures: readonly EventSignature[]; transitions: readonly StateTransition[] };
}> {
  return [
    ...catalog.screenBehaviors
      .filter((entry) => entry.artifact.screen === screen)
      .map((entry) => ({ artifactPath: entry.artifactPath, artifact: entry.artifact })),
    ...catalog.behaviorPatterns.map((entry) => ({ artifactPath: entry.artifactPath, artifact: entry.artifact })),
  ].sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
}

function buildHarvestStateGraph(input: {
  catalog: WorkspaceCatalog;
  screen: string;
}): StateTransitionGraph | null {
  const states = new Map<string, StateNode>();
  const events = new Map<string, EventSignature>();
  const transitions = new Map<string, StateTransition>();

  for (const entry of behaviorArtifactsForScreen(input.catalog, input.screen)) {
    for (const state of entry.artifact.stateNodes) {
      states.set(state.ref, state);
    }
    for (const event of entry.artifact.eventSignatures) {
      events.set(event.ref, event);
    }
    for (const transition of entry.artifact.transitions) {
      transitions.set(transition.ref, transition);
    }
  }

  if (states.size === 0 && events.size === 0 && transitions.size === 0) {
    return null;
  }

  return {
    kind: 'state-transition-graph',
    version: 1,
    generatedAt: new Date(0).toISOString(),
    fingerprint: taggedFingerprintFor('state-transition-graph', {
      states: [...states.values()],
      events: [...events.values()],
      transitions: [...transitions.values()],
    }),
    stateRefs: [...states.keys()].sort((left, right) => left.localeCompare(right)) as unknown as StateTransitionGraph['stateRefs'],
    eventSignatureRefs: [...events.keys()].sort((left, right) => left.localeCompare(right)) as unknown as StateTransitionGraph['eventSignatureRefs'],
    transitionRefs: [...transitions.keys()].sort((left, right) => left.localeCompare(right)) as unknown as StateTransitionGraph['transitionRefs'],
    states: [...states.values()].sort((left, right) => left.ref.localeCompare(right.ref)),
    eventSignatures: [...events.values()].sort((left, right) => left.ref.localeCompare(right.ref)),
    transitions: [...transitions.values()].sort((left, right) => left.ref.localeCompare(right.ref)),
    observations: [],
  };
}

function buildHarvestObservationContext(input: {
  catalog: WorkspaceCatalog;
  screen: string;
  routeVariantRef: string;
  stateGraph: StateTransitionGraph;
}): PlaywrightStateObservationContext | null {
  const bundleEntry = input.catalog.screenBundles[input.screen];
  if (!bundleEntry) {
    return null;
  }

  const elements = Object.entries(bundleEntry.bundle.mergedElements)
    .map(([elementId, element]) => ({
      element: createElementId(elementId),
      targetRef: createCanonicalTargetRef(`target:element:${input.screen}:${elementId}`),
      role: element.role,
      name: element.name ?? null,
      locator: element.locator ?? [],
      widget: element.widget,
      surface: element.surface,
    }))
    .sort((left, right) => left.element.localeCompare(right.element));

  return {
    stateGraph: input.stateGraph,
    screens: [{
      screen: bundleEntry.bundle.screen,
      routeVariantRefs: [input.routeVariantRef],
      elements,
    }],
  };
}

async function collectBehaviorObservations(input: {
  catalog: WorkspaceCatalog;
  paths: ProjectPaths;
  screen: string;
  routeVariantRef: string;
  url: string;
  sharedBrowser?: import('@playwright/test').Browser;
}) {
  const stateGraph = buildHarvestStateGraph({ catalog: input.catalog, screen: input.screen });
  if (!stateGraph) {
    return {
      stateObservations: [] as DiscoveryRun['stateObservations'],
      eventCandidates: [] as DiscoveryRun['eventCandidates'],
      transitionObservations: [] as DiscoveryRun['transitionObservations'],
      observationDiffs: [] as DiscoveryRun['observationDiffs'],
    };
  }

  const observationContext = buildHarvestObservationContext({
    catalog: input.catalog,
    screen: input.screen,
    routeVariantRef: input.routeVariantRef,
    stateGraph,
  });
  if (!observationContext) {
    return {
      stateObservations: [] as DiscoveryRun['stateObservations'],
      eventCandidates: [] as DiscoveryRun['eventCandidates'],
      transitionObservations: [] as DiscoveryRun['transitionObservations'],
      observationDiffs: [] as DiscoveryRun['observationDiffs'],
    };
  }

  const ownsBrowser = !input.sharedBrowser;
  const environment = process.env;
  const channel = resolvePreferredPlaywrightChannel(environment);
  const browser = input.sharedBrowser ?? await chromium.launch({
    headless: resolvePlaywrightHeadless(environment),
    ...(channel ? { channel } : {}),
  });

  try {
    const baselinePage = await browser.newPage();
    // Local file:// pages load instantly — 5s is generous for any selector
    // resolution. Without this, each non-matching locator waits 30s (the
    // Playwright default), which cascades across multiple states/events.
    baselinePage.setDefaultTimeout(2_000);
    await baselinePage.goto(input.url, { waitUntil: 'load' });
    const baselineObservations = await observeStateRefsOnPage({
      page: baselinePage,
      context: observationContext,
      stateRefs: stateGraph.stateRefs,
      activeRouteVariantRefs: [input.routeVariantRef],
    });
    await baselinePage.close();

    const stateObservationMap = new Map<string, DiscoveryRun['stateObservations'][number]>();
    for (const observation of baselineObservations) {
      stateObservationMap.set(`baseline:${observation.stateRef}`, {
        stateRef: observation.stateRef,
        source: 'baseline',
        observed: observation.observed,
        detail: observation.detail,
      });
    }

    const eventCandidates = stateGraph.eventSignatures
      .filter((event) => event.screen === input.screen)
      .map((event) => ({
        eventSignatureRef: event.ref,
        targetRef: event.targetRef,
        action: event.dispatch.action ?? 'custom',
        source: 'approved-behavior' as const,
      }))
      .sort((left, right) => left.eventSignatureRef.localeCompare(right.eventSignatureRef));

    // Process events concurrently — each event gets its own page, so they
    // are independent and can run in parallel within the shared browser.
    const screenEvents = stateGraph.eventSignatures.filter((entry) => entry.screen === input.screen);
    const eventResults = await Promise.all(screenEvents.map(async (event) => {
      const page = await browser.newPage();
      page.setDefaultTimeout(2_000);
      await page.goto(input.url, { waitUntil: 'load' });

      await primeRequiredStatesOnPage({
        page,
        context: observationContext,
        eventSignature: event,
        activeRouteVariantRefs: [input.routeVariantRef],
      });

      const before = await observeStateRefsOnPage({
        page,
        context: observationContext,
        stateRefs: stateGraph.stateRefs,
        activeRouteVariantRefs: [input.routeVariantRef],
      });
      const beforeObservedRefs = before.filter((entry) => entry.observed).map((entry) => entry.stateRef);

      const dispatched = await performSafeActiveEvent({
        page,
        context: observationContext,
        eventSignature: event,
      });

      const observation = await observeTransitionOnPage({
        page,
        context: observationContext,
        screen: event.screen,
        eventSignatureRef: event.ref,
        expectedTransitionRefs: event.effects.transitionRefs,
        beforeObservedStateRefs: beforeObservedRefs,
        activeRouteVariantRefs: [input.routeVariantRef],
        source: 'harvest',
        actor: 'safe-active-harvest',
        observationId: `harvest:${input.routeVariantRef}:${event.ref}`,
      });

      const afterObservedSet = new Set(observation.observedStateRefs);
      const beforeObservedSet = new Set(beforeObservedRefs);
      const diffs: Array<DiscoveryRun['observationDiffs'][number]> = [];
      for (const stateRef of stateGraph.stateRefs) {
        if (afterObservedSet.has(stateRef) === beforeObservedSet.has(stateRef)) {
          continue;
        }
        diffs.push({
          beforeStateRef: beforeObservedSet.has(stateRef) ? stateRef : null,
          afterStateRef: afterObservedSet.has(stateRef) ? stateRef : null,
          eventSignatureRef: event.ref,
          transitionRef: observation.transitionRef,
          classification: afterObservedSet.has(stateRef) ? 'observed' : 'missing',
        });
      }

      const afterObservations = await observeStateRefsOnPage({
        page,
        context: observationContext,
        stateRefs: stateGraph.stateRefs,
        activeRouteVariantRefs: [input.routeVariantRef],
      });

      await page.close();

      return {
        transitionObservation: {
          ...observation,
          detail: {
            ...(observation.detail ?? {}),
            ...dispatched.detail,
          },
        },
        diffs,
        afterObservations,
      };
    }));

    // Merge parallel results
    const transitionObservations: Array<DiscoveryRun['transitionObservations'][number]> = [];
    const observationDiffs: Array<DiscoveryRun['observationDiffs'][number]> = [];
    for (const result of eventResults) {
      transitionObservations.push(result.transitionObservation);
      observationDiffs.push(...result.diffs);
      for (const state of result.afterObservations) {
        stateObservationMap.set(`active-harvest:${state.stateRef}`, {
          stateRef: state.stateRef,
          source: 'active-harvest',
          observed: state.observed,
          detail: state.detail,
        });
      }
    }

    return {
      stateObservations: [...stateObservationMap.values()].sort((left, right) =>
        left.stateRef.localeCompare(right.stateRef) || left.source.localeCompare(right.source),
      ),
      eventCandidates,
      transitionObservations: transitionObservations.sort((left, right) => left.observationId.localeCompare(right.observationId)),
      observationDiffs: observationDiffs.sort((left, right) =>
        `${left.eventSignatureRef ?? ''}:${left.beforeStateRef ?? ''}:${left.afterStateRef ?? ''}`.localeCompare(
          `${right.eventSignatureRef ?? ''}:${right.beforeStateRef ?? ''}:${right.afterStateRef ?? ''}`,
        ),
      ),
    };
  } finally {
    if (ownsBrowser) {
      await browser.close();
    }
  }
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

    // Launch a single browser to reuse across all variants, avoiding the
    // ~2-5s Chromium startup cost per variant pair (discover + behavior).
    const sharedBrowser = yield* Effect.promise(() => launchSharedBrowser());

    for (const manifest of manifests) {
      const appIndexPath = path.join(options.paths.discoveryDir, manifest.artifact.app, 'index.json');
      const appReceipts: DiscoveryIndexEntry[] = [];

      // Load existing index for incremental skip check
      let existingIndexEntries = new Map<string, DiscoveryIndexEntry>();
      if (yield* fs.exists(appIndexPath)) {
        try {
          const existingIndex = validateDiscoveryIndex(yield* fs.readJson(appIndexPath));
          existingIndexEntries = new Map(
            existingIndex.receipts.map((entry) => [`${entry.routeId}:${entry.variantId}`, entry]),
          );
        } catch {
          // Corrupted index — will recrawl everything
        }
      }

      // Group variants by screen so that variants sharing a screen directory
      // are processed sequentially (discoverScreenScaffold writes to a shared
      // {discoveryDir}/{screen}/ path), while independent screens run in parallel.
      const variantsByScreen = new Map<string, Array<{ route: RouteKnowledgeRoute; variant: RouteKnowledgeVariant }>>();
      for (const route of manifest.artifact.routes) {
        for (const variant of route.variants) {
          const group = variantsByScreen.get(variant.screen) ?? [];
          group.push({ route, variant });
          variantsByScreen.set(variant.screen, group);
        }
      }

      const screenGroupResults = yield* Effect.all(
        [...variantsByScreen.entries()].map(([_screen, variants]) =>
          Effect.gen(function* () {
            const groupReceipts: string[] = [];
            const groupAppReceipts: DiscoveryIndexEntry[] = [];
            const groupFailures: HarvestRoutesResult['failures'] = [];

            for (const { route, variant } of variants) {
              try {
                const resolvedUrl = resolveHarvestUrl({
                  paths: options.paths,
                  manifest: manifest.artifact,
                  route,
                  variant,
                });

                // Incremental: skip crawl if inputs haven't changed
                const candidateInputFingerprint = computeHarvestInputFingerprint({
                  resolvedUrl, route, variant, catalog,
                });
                const existingEntry = existingIndexEntries.get(`${route.id}:${variant.id}`);
                const receiptPath = path.join(options.paths.discoveryDir, manifest.artifact.app, route.id, variant.id, 'crawl.json');
                if (
                  existingEntry?.status === 'ok'
                  && existingEntry.inputFingerprint === candidateInputFingerprint
                  && existingEntry.contentFingerprint
                  && (yield* fs.exists(receiptPath))
                ) {
                  // Inputs unchanged — reuse existing receipt without crawling
                  groupReceipts.push(relativeProjectPath(options.paths, receiptPath));
                  groupAppReceipts.push({ ...existingEntry, writeDisposition: 'reused' });
                  continue;
                }

                const discovery = yield* discoverScreenScaffold({
                  screen: variant.screen,
                  url: resolvedUrl,
                  rootSelector: variant.rootSelector ?? route.rootSelector ?? 'body',
                  paths: options.paths,
                  sharedBrowser,
                });
                const rawValue = yield* fs.readJson(discovery.crawlPath);
                const raw = rawValue as DiscoveryRun;
                yield* fs.ensureDir(path.dirname(receiptPath));
                const routeVariantRef = `route-variant:${manifest.artifact.app}:${route.id}:${variant.id}`;
                const behaviorObservations = yield* Effect.promise(() => collectBehaviorObservations({
                  catalog,
                  paths: options.paths,
                  screen: variant.screen,
                  routeVariantRef,
                  url: resolvedUrl,
                  sharedBrowser,
                }));
                const receiptId = createDiscoveryReceiptId({
                  app: manifest.artifact.app,
                  routeId: route.id,
                  variantId: variant.id,
                  snapshotHash: raw.snapshotHash,
                });
                const candidateReceipt = validateDiscoveryRun(normalizeDiscoveryRun({
                  ...raw,
                  app: manifest.artifact.app,
                  routeId: route.id,
                  variantId: variant.id,
                  routeVariantRef,
                  runId: receiptId,
                  url: resolvedUrl,
                  artifactPath: relativeProjectPath(options.paths, receiptPath),
                  rootSelector: variant.rootSelector ?? route.rootSelector ?? raw.rootSelector,
                  selectorProbes: raw.selectorProbes.map((probe) => ({
                    ...probe,
                    variantRef: routeVariantRef,
                  })),
                  stateObservations: behaviorObservations.stateObservations,
                  eventCandidates: behaviorObservations.eventCandidates,
                  transitionObservations: behaviorObservations.transitionObservations,
                  observationDiffs: behaviorObservations.observationDiffs,
                  graphDeltas: raw.graphDeltas ?? {
                    nodeIds: raw.targets.map((target: DiscoveryRun['targets'][number]) => target.graphNodeId),
                    edgeIds: [],
                  },
                }));
                const candidateFingerprint = fingerprintDiscoveryRun(candidateReceipt);
                let existingReceipt: DiscoveryRun | null = null;
                if (yield* fs.exists(receiptPath)) {
                  try {
                    existingReceipt = validateDiscoveryRun(yield* fs.readJson(receiptPath));
                  } catch {
                    existingReceipt = null;
                  }
                }
                const existingFingerprint = existingReceipt ? fingerprintDiscoveryRun(existingReceipt) : null;
                const writeDisposition = existingFingerprint === candidateFingerprint ? 'reused' : 'rewritten';
                const receipt = writeDisposition === 'reused'
                  ? existingReceipt
                  : {
                    ...candidateReceipt,
                    discoveredAt: new Date().toISOString(),
                  };
                if (!receipt) {
                  throw new Error(`Unable to resolve receipt for ${manifest.artifact.app}/${route.id}/${variant.id}`);
                }
                if (writeDisposition === 'rewritten') {
                  yield* fs.writeJson(receiptPath, receipt);
                }
                groupReceipts.push(relativeProjectPath(options.paths, receiptPath));
                groupAppReceipts.push({
                  routeId: route.id,
                  variantId: variant.id,
                  routeVariantRef,
                  screen: variant.screen,
                  status: 'ok',
                  receiptId: receipt.runId,
                  receiptPath: relativeProjectPath(options.paths, receiptPath),
                  contentFingerprint: candidateFingerprint,
                  writeDisposition,
                  resolvedUrl,
                  rootSelector: receipt.rootSelector,
                  inputFingerprint: candidateInputFingerprint,
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                groupFailures.push({
                  app: manifest.artifact.app,
                  routeId: route.id,
                  variantId: variant.id,
                  message,
                });
                groupAppReceipts.push({
                  routeId: route.id,
                  variantId: variant.id,
                  routeVariantRef: `route-variant:${manifest.artifact.app}:${route.id}:${variant.id}`,
                  screen: variant.screen,
                  status: 'failed',
                  receiptId: null,
                  receiptPath: null,
                  contentFingerprint: null,
                  writeDisposition: 'failed',
                  resolvedUrl: null,
                  rootSelector: variant.rootSelector ?? route.rootSelector ?? null,
                  message,
                });
              }
            }

            return { groupReceipts, groupAppReceipts, groupFailures };
          }),
        ),
        { concurrency: 'unbounded' },
      );

      // Merge screen-group results
      for (const { groupReceipts, groupAppReceipts, groupFailures } of screenGroupResults) {
        receipts.push(...groupReceipts);
        appReceipts.push(...groupAppReceipts);
        failures.push(...groupFailures);
      }

      yield* fs.ensureDir(path.dirname(appIndexPath));
      const candidateIndex = validateDiscoveryIndex({
        kind: 'discovery-index',
        version: 2,
        app: manifest.artifact.app,
        generatedAt,
        receipts: [...appReceipts].sort((left, right) => {
          const routeOrder = left.routeId.localeCompare(right.routeId);
          if (routeOrder !== 0) {
            return routeOrder;
          }
          return left.variantId.localeCompare(right.variantId);
        }),
      });
      let existingIndex: DiscoveryIndex | null = null;
      if (yield* fs.exists(appIndexPath)) {
        try {
          existingIndex = validateDiscoveryIndex(yield* fs.readJson(appIndexPath));
        } catch {
          existingIndex = null;
        }
      }
      const existingIndexFingerprint = existingIndex ? fingerprintDiscoveryIndex(existingIndex) : null;
      const candidateIndexFingerprint = fingerprintDiscoveryIndex(candidateIndex);
      if (existingIndexFingerprint !== candidateIndexFingerprint) {
        yield* fs.writeJson(appIndexPath, candidateIndex);
      }
    }

    yield* Effect.promise(() => sharedBrowser.close());

    return {
      generatedAt,
      apps: manifests.map((entry) => entry.artifact.app),
      receipts,
      failures,
    } satisfies HarvestRoutesResult;
  });
}
