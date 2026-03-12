import path from 'path';
import { Effect } from 'effect';
import {
  createCanonicalTargetRef,
  createElementId,
  createRouteId,
  createRouteVariantId,
  createScreenId,
  createSelectorRef,
  createSnapshotTemplateId,
  createSurfaceId,
  type CanonicalTargetRef,
  type ElementId,
  type RouteId,
  type RouteVariantId,
  type ScreenId,
  type SnapshotTemplateId,
  type SurfaceId,
} from '../domain/identity';
import { graphIds } from '../domain/ids';
import type {
  ApplicationInterfaceGraph,
  ArtifactConfidenceRecord,
  DiscoveryRun,
  HarvestManifest,
  InterfaceGraphEdge,
  InterfaceGraphNode,
  LocatorStrategy,
  SelectorCanon,
  SelectorCanonEntry,
  SelectorProbe,
} from '../domain/types';
import { validateDiscoveryRun } from '../domain/validation';
import { walkFiles } from './artifacts';
import { readJsonArtifact } from './catalog/loaders';
import type { ArtifactEnvelope, WorkspaceCatalog } from './catalog/types';
import type { ProjectPaths } from './paths';
import { relativeProjectPath } from './paths';
import { FileSystem } from './ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { runProjection, type ProjectionIncremental } from './projections/runner';

export interface InterfaceIntelligenceProjectionResult {
  interfaceGraph: ApplicationInterfaceGraph;
  selectorCanon: SelectorCanon;
  discoveryRuns: ArtifactEnvelope<DiscoveryRun>[];
  interfaceGraphPath: string;
  selectorCanonPath: string;
  incremental: ProjectionIncremental;
}

type TargetKind = 'surface' | 'element' | 'snapshot-anchor' | 'discovered';
type TargetDescriptor = {
  targetRef: CanonicalTargetRef;
  screen: ScreenId;
  kind: TargetKind;
  source: InterfaceGraphNode['source'];
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  artifactPaths: string[];
  payload?: Record<string, unknown> | undefined;
};
type RouteBinding = {
  app: string;
  routeId: RouteId;
  screen: ScreenId;
  entryUrl: string;
  rootSelector: string | null;
  variants: Array<{
    variantId: RouteVariantId;
    screen: ScreenId;
    url: string;
    rootSelector: string | null;
  }>;
  sourceArtifacts: string[];
};
type SelectorProbeSeed = {
  targetRef: CanonicalTargetRef;
  screen: ScreenId;
  kind: SelectorCanonEntry['kind'];
  source: SelectorProbe['source'];
  strategy: LocatorStrategy;
  rung: number;
  artifactPath: string;
  variantRefs?: string[] | undefined;
  discoveredFrom?: string | null | undefined;
  evidenceRefs?: string[] | undefined;
  successCount?: number | undefined;
  failureCount?: number | undefined;
  lastUsedAt?: string | null | undefined;
  lineage?: SelectorProbe['lineage'] | undefined;
};

function manifestPath(paths: ProjectPaths): string {
  return path.join(paths.interfaceDir, 'manifest.json');
}

function sortStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function selectorValue(strategy: LocatorStrategy): string {
  return 'value' in strategy ? strategy.value : `${strategy.role}:${strategy.name ?? ''}`;
}

function routeRef(app: string, routeId: RouteId): string {
  return `route:${app}:${routeId}`;
}

function routeVariantRef(app: string, routeId: RouteId, variantId: RouteVariantId): string {
  return `route-variant:${app}:${routeId}:${variantId}`;
}

function surfaceTargetRef(screen: ScreenId, surfaceId: SurfaceId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:surface:${screen}:${surfaceId}`);
}

function elementTargetRef(screen: ScreenId, elementId: ElementId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:element:${screen}:${elementId}`);
}

function snapshotTargetRef(screen: ScreenId, snapshotTemplate: SnapshotTemplateId): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:snapshot:${screen}:${snapshotTemplate}`);
}

function discoveredTargetRef(screen: ScreenId, kind: string, stableDiscoveryId: string): CanonicalTargetRef {
  return createCanonicalTargetRef(`target:discovered:${screen}:${kind}:${stableDiscoveryId}`);
}

function selectorProbeId(targetRef: CanonicalTargetRef, strategy: LocatorStrategy, rung: number): string {
  return `${targetRef}:probe:${strategy.kind}:${rung}:${selectorValue(strategy)}`;
}

function selectorRefForProbe(targetRef: CanonicalTargetRef, strategy: LocatorStrategy, rung: number) {
  return createSelectorRef(`selector:${targetRef}:${strategy.kind}:${rung}:${selectorValue(strategy)}`);
}

function nodeFingerprint(kind: InterfaceGraphNode['kind'], id: string, payload?: Record<string, unknown>) {
  return fingerprintProjectionOutput({ kind, id, payload: payload ?? null });
}

function edgeFingerprint(kind: InterfaceGraphEdge['kind'], from: string, to: string, payload?: Record<string, unknown>) {
  return fingerprintProjectionOutput({ kind, from, to, payload: payload ?? null });
}

function createNode(input: {
  id: string;
  kind: InterfaceGraphNode['kind'];
  label: string;
  artifactPaths: string[];
  source: InterfaceGraphNode['source'];
  route?: RouteId | null | undefined;
  variant?: RouteVariantId | null | undefined;
  screen?: ScreenId | null | undefined;
  surface?: SurfaceId | null | undefined;
  element?: ElementId | null | undefined;
  snapshotTemplate?: SnapshotTemplateId | null | undefined;
  targetRef?: CanonicalTargetRef | null | undefined;
  payload?: Record<string, unknown> | undefined;
}): InterfaceGraphNode {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    fingerprint: nodeFingerprint(input.kind, input.id, input.payload),
    route: input.route ?? null,
    variant: input.variant ?? null,
    screen: input.screen ?? null,
    section: null,
    surface: input.surface ?? null,
    element: input.element ?? null,
    snapshotTemplate: input.snapshotTemplate ?? null,
    targetRef: input.targetRef ?? null,
    artifactPaths: sortStrings(input.artifactPaths),
    source: input.source,
    payload: input.payload,
  };
}

function createEdge(input: {
  kind: InterfaceGraphEdge['kind'];
  from: string;
  to: string;
  lineage: string[];
  payload?: Record<string, unknown> | undefined;
}): InterfaceGraphEdge {
  return {
    id: `${input.kind}:${input.from}->${input.to}`,
    kind: input.kind,
    from: input.from,
    to: input.to,
    fingerprint: edgeFingerprint(input.kind, input.from, input.to, input.payload),
    lineage: sortStrings(input.lineage),
    payload: input.payload,
  };
}

function upsertNode(map: Map<string, InterfaceGraphNode>, node: InterfaceGraphNode) {
  const existing = map.get(node.id);
  if (!existing) {
    map.set(node.id, node);
    return;
  }
  map.set(node.id, createNode({
    ...existing,
    artifactPaths: [...existing.artifactPaths, ...node.artifactPaths],
    payload: { ...(existing.payload ?? {}), ...(node.payload ?? {}) },
  }));
}

function upsertEdge(map: Map<string, InterfaceGraphEdge>, edge: InterfaceGraphEdge) {
  const existing = map.get(edge.id);
  if (!existing) {
    map.set(edge.id, edge);
    return;
  }
  map.set(edge.id, createEdge({
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    lineage: [...existing.lineage, ...edge.lineage],
    payload: { ...(existing.payload ?? {}), ...(edge.payload ?? {}) },
  }));
}

function latestDeterministicTimestamp(input: {
  discoveryRuns: readonly ArtifactEnvelope<DiscoveryRun>[];
  confidenceRecords: readonly ArtifactConfidenceRecord[];
}): string {
  const candidates = [
    ...input.discoveryRuns.map((entry) => entry.artifact.discoveredAt),
    ...input.confidenceRecords.flatMap((entry) => [entry.lastSuccessAt, entry.lastFailureAt].filter((value): value is string => Boolean(value))),
  ].sort((left, right) => right.localeCompare(left));
  return candidates[0] ?? '1970-01-01T00:00:00.000Z';
}

function routeBindings(catalog: WorkspaceCatalog): RouteBinding[] {
  if (catalog.routeManifests.length > 0) {
    return catalog.routeManifests.flatMap((entry) =>
      entry.artifact.routes.map((route) => ({
        app: entry.artifact.app,
        routeId: route.id,
        screen: route.screen,
        entryUrl: route.entryUrl,
        rootSelector: route.rootSelector ?? null,
        variants: route.variants.map((variant) => ({
          variantId: variant.id,
          screen: variant.screen,
          url: variant.url,
          rootSelector: variant.rootSelector ?? route.rootSelector ?? null,
        })),
        sourceArtifacts: [entry.artifactPath],
      })),
    ).sort((left, right) => routeRef(left.app, left.routeId).localeCompare(routeRef(right.app, right.routeId)));
  }

  return catalog.surfaces.map((entry) => ({
    app: 'workspace',
    routeId: createRouteId(`implicit:${entry.artifact.screen}`),
    screen: entry.artifact.screen,
    entryUrl: entry.artifact.url,
    rootSelector: null,
    variants: [{
      variantId: createRouteVariantId('default'),
      screen: entry.artifact.screen,
      url: entry.artifact.url,
      rootSelector: null,
    }],
    sourceArtifacts: [entry.artifactPath],
  })).sort((left, right) => left.entryUrl.localeCompare(right.entryUrl));
}

function targetDescriptors(input: {
  catalog: WorkspaceCatalog;
  discoveryRuns: readonly ArtifactEnvelope<DiscoveryRun>[];
}): TargetDescriptor[] {
  const descriptors = new Map<CanonicalTargetRef, TargetDescriptor>();

  for (const surfaceEntry of input.catalog.surfaces) {
    for (const [sectionId, section] of Object.entries(surfaceEntry.artifact.sections)) {
      if (!section.snapshot) continue;
      const snapshotTemplate = createSnapshotTemplateId(section.snapshot);
      const targetRef = snapshotTargetRef(surfaceEntry.artifact.screen, snapshotTemplate);
      descriptors.set(targetRef, {
        targetRef,
        screen: surfaceEntry.artifact.screen,
        kind: 'snapshot-anchor',
        source: 'approved-knowledge',
        snapshotTemplate,
        artifactPaths: [surfaceEntry.artifactPath],
        payload: { section: sectionId, selector: section.selector },
      });
    }
    for (const [surfaceId, surface] of Object.entries(surfaceEntry.artifact.surfaces)) {
      const targetRef = surfaceTargetRef(surfaceEntry.artifact.screen, createSurfaceId(surfaceId));
      descriptors.set(targetRef, {
        targetRef,
        screen: surfaceEntry.artifact.screen,
        kind: 'surface',
        source: 'approved-knowledge',
        surface: createSurfaceId(surfaceId),
        artifactPaths: [surfaceEntry.artifactPath],
        payload: { section: surface.section, selector: surface.selector, assertions: surface.assertions },
      });
    }
  }

  for (const elementsEntry of input.catalog.screenElements) {
    for (const [elementId, element] of Object.entries(elementsEntry.artifact.elements)) {
      const targetRef = elementTargetRef(elementsEntry.artifact.screen, createElementId(elementId));
      descriptors.set(targetRef, {
        targetRef,
        screen: elementsEntry.artifact.screen,
        kind: 'element',
        source: 'approved-knowledge',
        surface: element.surface,
        element: createElementId(elementId),
        artifactPaths: [elementsEntry.artifactPath],
        payload: { role: element.role, name: element.name ?? null, widget: element.widget },
      });
    }
  }

  for (const discoveryEntry of input.discoveryRuns) {
    for (const target of discoveryEntry.artifact.targets) {
      const targetRef = target.kind === 'surface' && target.surface
        ? surfaceTargetRef(target.screen, target.surface)
        : target.kind === 'element' && target.element
          ? elementTargetRef(target.screen, target.element)
          : target.kind === 'snapshot-anchor' && target.snapshotTemplate
            ? snapshotTargetRef(target.screen, target.snapshotTemplate)
            : discoveredTargetRef(target.screen, target.kind, target.graphNodeId);
      const existing = descriptors.get(targetRef);
      descriptors.set(targetRef, {
        targetRef,
        screen: target.screen,
        kind: target.kind === 'snapshot-anchor' ? 'snapshot-anchor' : target.kind === 'element' ? 'element' : target.kind === 'surface' ? 'surface' : 'discovered',
        source: existing?.source ?? 'discovery',
        surface: target.surface ?? existing?.surface ?? null,
        element: target.element ?? existing?.element ?? null,
        snapshotTemplate: target.snapshotTemplate ?? existing?.snapshotTemplate ?? null,
        artifactPaths: sortStrings([...(existing?.artifactPaths ?? []), discoveryEntry.artifactPath]),
        payload: { ...(existing?.payload ?? {}), graphNodeId: target.graphNodeId, discoveryRunId: discoveryEntry.artifact.runId },
      });
    }
  }

  return [...descriptors.values()].sort((left, right) => left.targetRef.localeCompare(right.targetRef));
}

function matchingConfidenceRecord(input: {
  catalog: WorkspaceCatalog;
  screen: ScreenId;
  element?: ElementId | null | undefined;
}): ArtifactConfidenceRecord | null {
  if (!input.element) return null;
  return input.catalog.confidenceCatalog?.artifact.records.find((entry) =>
    entry.screen === input.screen && entry.element === input.element,
  ) ?? null;
}

function selectorStatus(input: { confidenceRecord: ArtifactConfidenceRecord | null; strategy: LocatorStrategy }): SelectorProbe['status'] {
  if (input.confidenceRecord) return input.confidenceRecord.failureCount > 0 ? 'degraded' : 'healthy';
  return input.strategy.kind === 'css' ? 'unverified' : 'healthy';
}

function buildApplicationInterfaceGraph(_input: {
  catalog: WorkspaceCatalog;
  discoveryRuns: readonly ArtifactEnvelope<DiscoveryRun>[];
}): ApplicationInterfaceGraph {
  const input = _input;
  const nodes = new Map<string, InterfaceGraphNode>();
  const edges = new Map<string, InterfaceGraphEdge>();
  const routes = routeBindings(input.catalog);
  const targets = targetDescriptors(input);
  const targetRefs = new Set<CanonicalTargetRef>(targets.map((entry) => entry.targetRef));

  for (const binding of routes) {
    const routeNodeId = graphIds.route(`${binding.app}:${binding.routeId}`);
    upsertNode(nodes, createNode({
      id: routeNodeId,
      kind: 'route',
      label: binding.entryUrl,
      artifactPaths: binding.sourceArtifacts,
      source: 'approved-knowledge',
      route: binding.routeId,
      screen: binding.screen,
      payload: { app: binding.app, entryUrl: binding.entryUrl, routeRef: routeRef(binding.app, binding.routeId) },
    }));
    upsertEdge(edges, createEdge({
      kind: 'route-target',
      from: routeNodeId,
      to: graphIds.screen(binding.screen),
      lineage: binding.sourceArtifacts,
    }));

    for (const variant of binding.variants) {
      const variantNodeId = graphIds.routeVariant(`${binding.app}:${binding.routeId}`, variant.variantId);
      upsertNode(nodes, createNode({
        id: variantNodeId,
        kind: 'route-variant',
        label: variant.url,
        artifactPaths: binding.sourceArtifacts,
        source: 'approved-knowledge',
        route: binding.routeId,
        variant: variant.variantId,
        screen: variant.screen,
        payload: {
          app: binding.app,
          url: variant.url,
          routeVariantRef: routeVariantRef(binding.app, binding.routeId, variant.variantId),
          rootSelector: variant.rootSelector,
        },
      }));
      upsertEdge(edges, createEdge({
        kind: 'variant-of-route',
        from: variantNodeId,
        to: routeNodeId,
        lineage: binding.sourceArtifacts,
      }));
      upsertEdge(edges, createEdge({
        kind: 'route-target',
        from: variantNodeId,
        to: graphIds.screen(variant.screen),
        lineage: binding.sourceArtifacts,
      }));
    }
  }

  for (const surfaceEntry of input.catalog.surfaces) {
    const surfaceGraph = surfaceEntry.artifact;
    const screenNodeId = graphIds.screen(surfaceGraph.screen);
    upsertNode(nodes, createNode({
      id: screenNodeId,
      kind: 'screen',
      label: surfaceGraph.screen,
      artifactPaths: [surfaceEntry.artifactPath],
      source: 'approved-knowledge',
      screen: surfaceGraph.screen,
      payload: { url: surfaceGraph.url },
    }));

    for (const [sectionId, section] of Object.entries(surfaceGraph.sections)) {
      const sectionNodeId = graphIds.section(surfaceGraph.screen, sectionId);
      upsertNode(nodes, createNode({
        id: sectionNodeId,
        kind: 'section',
        label: sectionId,
        artifactPaths: [surfaceEntry.artifactPath],
        source: 'approved-knowledge',
        screen: surfaceGraph.screen,
        payload: { selector: section.selector, kind: section.kind },
      }));
      upsertEdge(edges, createEdge({
        kind: 'contains',
        from: screenNodeId,
        to: sectionNodeId,
        lineage: [surfaceEntry.artifactPath],
      }));

      if (!section.snapshot) continue;
      const snapshotTemplate = createSnapshotTemplateId(section.snapshot);
      const targetRef = snapshotTargetRef(surfaceGraph.screen, snapshotTemplate);
      const snapshotNodeId = graphIds.snapshotAnchor(surfaceGraph.screen, snapshotTemplate);
      upsertNode(nodes, createNode({
        id: snapshotNodeId,
        kind: 'snapshot-anchor',
        label: section.snapshot,
        artifactPaths: [surfaceEntry.artifactPath],
        source: 'approved-knowledge',
        screen: surfaceGraph.screen,
        snapshotTemplate,
        targetRef,
        payload: { selector: section.selector },
      }));
      upsertEdge(edges, createEdge({
        kind: 'references-snapshot',
        from: sectionNodeId,
        to: snapshotNodeId,
        lineage: [surfaceEntry.artifactPath],
      }));
      upsertEdge(edges, createEdge({
        kind: 'references-target',
        from: snapshotNodeId,
        to: graphIds.target(targetRef),
        lineage: [surfaceEntry.artifactPath],
      }));
    }

    for (const [surfaceId, surface] of Object.entries(surfaceGraph.surfaces)) {
      const surfaceIdValue = createSurfaceId(surfaceId);
      const targetRef = surfaceTargetRef(surfaceGraph.screen, surfaceIdValue);
      const surfaceNodeId = graphIds.surface(surfaceGraph.screen, surfaceIdValue);
      upsertNode(nodes, createNode({
        id: surfaceNodeId,
        kind: 'surface',
        label: surfaceId,
        artifactPaths: [surfaceEntry.artifactPath],
        source: 'approved-knowledge',
        screen: surfaceGraph.screen,
        surface: surfaceIdValue,
        targetRef,
        payload: { selector: surface.selector, assertions: surface.assertions, section: surface.section },
      }));
      upsertEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.section(surfaceGraph.screen, surface.section),
        to: surfaceNodeId,
        lineage: [surfaceEntry.artifactPath],
      }));
      upsertEdge(edges, createEdge({
        kind: 'references-target',
        from: surfaceNodeId,
        to: graphIds.target(targetRef),
        lineage: [surfaceEntry.artifactPath],
      }));
    }
  }

  for (const target of targets) {
    upsertNode(nodes, createNode({
      id: graphIds.target(target.targetRef),
      kind: 'target',
      label: target.targetRef,
      artifactPaths: target.artifactPaths,
      source: target.source,
      screen: target.screen,
      surface: target.surface ?? null,
      element: target.element ?? null,
      snapshotTemplate: target.snapshotTemplate ?? null,
      targetRef: target.targetRef,
      payload: { kind: target.kind, ...(target.payload ?? {}) },
    }));
  }

  for (const elementsEntry of input.catalog.screenElements) {
    for (const [elementId, element] of Object.entries(elementsEntry.artifact.elements)) {
      const targetRef = elementTargetRef(elementsEntry.artifact.screen, createElementId(elementId));
      upsertEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.surface(elementsEntry.artifact.screen, element.surface),
        to: graphIds.target(targetRef),
        lineage: [elementsEntry.artifactPath],
      }));
    }
  }

  for (const discoveryEntry of input.discoveryRuns) {
    const run = discoveryEntry.artifact;
    const harvestRunNodeId = graphIds.harvestRun(run.runId);
    upsertNode(nodes, createNode({
      id: harvestRunNodeId,
      kind: 'harvest-run',
      label: run.routeVariantRef,
      artifactPaths: [discoveryEntry.artifactPath],
      source: 'discovery',
      route: run.routeId,
      variant: run.variantId,
      screen: run.screen,
      payload: { app: run.app, url: run.url, rootSelector: run.rootSelector },
    }));
    upsertEdge(edges, createEdge({
      kind: 'discovered-by',
      from: graphIds.screen(run.screen),
      to: harvestRunNodeId,
      lineage: [discoveryEntry.artifactPath],
    }));

    for (const target of run.targets) {
      const targetRef = target.kind === 'surface' && target.surface
        ? surfaceTargetRef(target.screen, target.surface)
        : target.kind === 'element' && target.element
          ? elementTargetRef(target.screen, target.element)
          : target.kind === 'snapshot-anchor' && target.snapshotTemplate
            ? snapshotTargetRef(target.screen, target.snapshotTemplate)
            : discoveredTargetRef(target.screen, target.kind, target.graphNodeId);
      targetRefs.add(targetRef);
      upsertEdge(edges, createEdge({
        kind: 'discovered-by',
        from: graphIds.target(targetRef),
        to: harvestRunNodeId,
        lineage: [discoveryEntry.artifactPath],
      }));
    }
  }

  const graph = {
    kind: 'application-interface-graph' as const,
    version: 1 as const,
    generatedAt: latestDeterministicTimestamp({
      discoveryRuns: input.discoveryRuns,
      confidenceRecords: input.catalog.confidenceCatalog?.artifact.records ?? [],
    }),
    fingerprint: '',
    discoveryRunIds: sortStrings(input.discoveryRuns.map((entry) => entry.artifact.runId)),
    routeRefs: sortStrings(routes.map((binding) => routeRef(binding.app, binding.routeId))),
    routeVariantRefs: sortStrings(routes.flatMap((binding) =>
      binding.variants.map((variant) => routeVariantRef(binding.app, binding.routeId, variant.variantId)),
    )),
    targetRefs: [...targetRefs].sort((left, right) => left.localeCompare(right)),
    nodes: [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };

  return {
    ...graph,
    fingerprint: fingerprintProjectionOutput({
      discoveryRunIds: graph.discoveryRunIds,
      routeRefs: graph.routeRefs,
      routeVariantRefs: graph.routeVariantRefs,
      targetRefs: graph.targetRefs,
      nodes: graph.nodes,
      edges: graph.edges,
    }),
  };
}

function buildSelectorCanon(_input: {
  catalog: WorkspaceCatalog;
  discoveryRuns: readonly ArtifactEnvelope<DiscoveryRun>[];
  interfaceGraph: ApplicationInterfaceGraph;
}): SelectorCanon {
  const input = _input;
  const descriptors = new Map<CanonicalTargetRef, TargetDescriptor>(
    targetDescriptors({ catalog: input.catalog, discoveryRuns: input.discoveryRuns }).map((entry) => [entry.targetRef, entry]),
  );
  const seeds: SelectorProbeSeed[] = [];

  for (const surfaceEntry of input.catalog.surfaces) {
    for (const [sectionId, section] of Object.entries(surfaceEntry.artifact.sections)) {
      if (!section.snapshot) continue;
      const snapshotTemplate = createSnapshotTemplateId(section.snapshot);
      seeds.push({
        targetRef: snapshotTargetRef(surfaceEntry.artifact.screen, snapshotTemplate),
        screen: surfaceEntry.artifact.screen,
        kind: 'snapshot-anchor',
        source: 'approved-knowledge',
        strategy: { kind: 'css', value: section.selector },
        rung: 0,
        artifactPath: surfaceEntry.artifactPath,
      });
    }
    for (const [surfaceId, surface] of Object.entries(surfaceEntry.artifact.surfaces)) {
      seeds.push({
        targetRef: surfaceTargetRef(surfaceEntry.artifact.screen, createSurfaceId(surfaceId)),
        screen: surfaceEntry.artifact.screen,
        kind: 'surface',
        source: 'approved-knowledge',
        strategy: { kind: 'css', value: surface.selector },
        rung: 0,
        artifactPath: surfaceEntry.artifactPath,
      });
    }
  }

  for (const elementsEntry of input.catalog.screenElements) {
    for (const [elementId, element] of Object.entries(elementsEntry.artifact.elements)) {
      const confidenceRecord = matchingConfidenceRecord({
        catalog: input.catalog,
        screen: elementsEntry.artifact.screen,
        element: createElementId(elementId),
      });
      (element.locator ?? []).forEach((strategy, rung) => {
        seeds.push({
          targetRef: elementTargetRef(elementsEntry.artifact.screen, createElementId(elementId)),
          screen: elementsEntry.artifact.screen,
          kind: 'element',
          source: 'approved-knowledge',
          strategy,
          rung,
          artifactPath: elementsEntry.artifactPath,
          successCount: confidenceRecord?.successCount ?? 0,
          failureCount: confidenceRecord?.failureCount ?? 0,
          lastUsedAt: confidenceRecord?.lastSuccessAt ?? null,
          evidenceRefs: confidenceRecord?.lineage.evidenceIds ?? [],
          lineage: {
            sourceArtifactPaths: [elementsEntry.artifactPath],
            discoveryRunIds: [],
            evidenceRefs: confidenceRecord?.lineage.evidenceIds ?? [],
          },
        });
      });
    }
  }

  for (const discoveryEntry of input.discoveryRuns) {
    for (const probe of discoveryEntry.artifact.selectorProbes) {
      seeds.push({
        targetRef: probe.targetRef,
        screen: probe.screen,
        kind: probe.element ? 'element' : probe.section ? 'surface' : 'discovered',
        source: 'discovery',
        strategy: probe.strategy,
        rung: 0,
        artifactPath: discoveryEntry.artifactPath,
        variantRefs: [probe.variantRef],
        discoveredFrom: discoveryEntry.artifact.runId,
        lineage: {
          sourceArtifactPaths: [discoveryEntry.artifactPath],
          discoveryRunIds: [discoveryEntry.artifact.runId],
          evidenceRefs: [],
        },
      });
    }
  }

  const grouped = new Map<CanonicalTargetRef, SelectorProbe[]>();
  for (const seed of seeds) {
    const descriptor = descriptors.get(seed.targetRef);
    const confidenceRecord = descriptor?.kind === 'element'
      ? matchingConfidenceRecord({ catalog: input.catalog, screen: descriptor.screen, element: descriptor.element ?? null })
      : null;
    const probe: SelectorProbe = {
      id: selectorProbeId(seed.targetRef, seed.strategy, seed.rung),
      selectorRef: selectorRefForProbe(seed.targetRef, seed.strategy, seed.rung),
      strategy: seed.strategy,
      source: seed.source,
      status: seed.source === 'approved-knowledge' ? selectorStatus({ confidenceRecord, strategy: seed.strategy }) : 'unverified',
      rung: seed.rung,
      artifactPath: seed.artifactPath,
      variantRefs: sortStrings(seed.variantRefs ?? []),
      discoveredFrom: seed.discoveredFrom ?? null,
      evidenceRefs: sortStrings(seed.evidenceRefs ?? []),
      successCount: seed.successCount ?? 0,
      failureCount: seed.failureCount ?? 0,
      lastUsedAt: seed.lastUsedAt ?? null,
      lineage: seed.lineage ?? { sourceArtifactPaths: [seed.artifactPath], discoveryRunIds: [], evidenceRefs: [] },
    };
    const existing = grouped.get(seed.targetRef) ?? [];
    if (!existing.some((entry) => entry.id === probe.id)) {
      existing.push(probe);
      grouped.set(seed.targetRef, existing);
    }
  }

  const entries: SelectorCanonEntry[] = [...grouped.entries()].map(([targetRef, probes]) => {
    const descriptor = descriptors.get(targetRef);
      return {
        targetRef,
        screen: descriptor?.screen ?? createScreenId('unknown'),
        kind: descriptor?.kind ?? 'discovered',
      surface: descriptor?.surface ?? null,
      element: descriptor?.element ?? null,
      snapshotTemplate: descriptor?.snapshotTemplate ?? null,
      probes: probes.sort((left, right) => left.id.localeCompare(right.id)),
    };
  }).sort((left, right) => left.targetRef.localeCompare(right.targetRef));

  const canon = {
    kind: 'selector-canon' as const,
    version: 1 as const,
    generatedAt: input.interfaceGraph.generatedAt,
    fingerprint: '',
    entries,
    summary: {
      totalTargets: entries.length,
      totalProbes: entries.reduce((total, entry) => total + entry.probes.length, 0),
      approvedKnowledgeProbeCount: entries.reduce((total, entry) => total + entry.probes.filter((probe) => probe.source === 'approved-knowledge').length, 0),
      discoveryProbeCount: entries.reduce((total, entry) => total + entry.probes.filter((probe) => probe.source === 'discovery').length, 0),
      degradedProbeCount: entries.reduce((total, entry) => total + entry.probes.filter((probe) => probe.status === 'degraded').length, 0),
      healthyProbeCount: entries.reduce((total, entry) => total + entry.probes.filter((probe) => probe.status === 'healthy').length, 0),
    },
  };

  return {
    ...canon,
    fingerprint: fingerprintProjectionOutput({ entries: canon.entries, summary: canon.summary }),
  };
}

export function loadDiscoveryRuns(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const files = (yield* walkFiles(fs, options.paths.discoveryDir)).filter((filePath) => path.basename(filePath) === 'crawl.json');
    const runs: ArtifactEnvelope<DiscoveryRun>[] = [];
    for (const filePath of files) {
      runs.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateDiscoveryRun,
        'discovery-run-validation-failed',
        `Discovery run ${filePath} failed validation`,
      ));
    }
    return runs.sort((left, right) => left.artifact.runId.localeCompare(right.artifact.runId));
  });
}

export function projectInterfaceIntelligence(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? null;
    if (!catalog) throw new Error('projectInterfaceIntelligence requires a loaded catalog');
    const discoveryRuns = catalog.discoveryRuns.length > 0 ? catalog.discoveryRuns : yield* loadDiscoveryRuns({ paths: options.paths });
    const inputFingerprints: ProjectionInputFingerprint[] = [
      ...catalog.routeManifests.map((entry) => fingerprintProjectionArtifact('harvest-manifest', entry.artifactPath, entry.artifact as HarvestManifest)),
      ...catalog.surfaces.map((entry) => fingerprintProjectionArtifact('surface', entry.artifactPath, entry.artifact)),
      ...catalog.screenElements.map((entry) => fingerprintProjectionArtifact('elements', entry.artifactPath, entry.artifact)),
      ...catalog.screenHints.map((entry) => fingerprintProjectionArtifact('hints', entry.artifactPath, entry.artifact)),
      ...catalog.screenPostures.map((entry) => fingerprintProjectionArtifact('postures', entry.artifactPath, entry.artifact)),
      ...catalog.patternDocuments.map((entry) => fingerprintProjectionArtifact('patterns', entry.artifactPath, entry.artifact)),
      ...catalog.evidenceRecords.map((entry) => fingerprintProjectionArtifact('evidence', entry.artifactPath, entry.artifact)),
      ...(catalog.confidenceCatalog ? [fingerprintProjectionArtifact('confidence-overlay-catalog', catalog.confidenceCatalog.artifactPath, catalog.confidenceCatalog.artifact)] : []),
      ...discoveryRuns.map((entry) => fingerprintProjectionArtifact('discovery-run', entry.artifactPath, entry.artifact)),
    ];
    const interfaceGraph = buildApplicationInterfaceGraph({ catalog, discoveryRuns });
    const selectorCanon = buildSelectorCanon({ catalog, discoveryRuns, interfaceGraph });
    const outputFingerprint = fingerprintProjectionOutput({ interfaceGraph, selectorCanon });

    return yield* runProjection({
      projection: 'interface-intelligence',
      manifestPath: manifestPath(options.paths),
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: (expectedOutputFingerprint) => Effect.gen(function* () {
        const interfaceExists = yield* fs.exists(options.paths.interfaceGraphIndexPath);
        const selectorExists = yield* fs.exists(options.paths.selectorCanonPath);
        if (!interfaceExists || !selectorExists) return { status: 'missing-output' as const };
        const persistedInterface = yield* fs.readJson(options.paths.interfaceGraphIndexPath);
        const persistedSelectors = yield* fs.readJson(options.paths.selectorCanonPath);
        const persistedFingerprint = fingerprintProjectionOutput({ interfaceGraph: persistedInterface, selectorCanon: persistedSelectors });
        if (persistedFingerprint !== expectedOutputFingerprint) return { status: 'invalid-output' as const };
        return { status: 'ok' as const, outputFingerprint: persistedFingerprint };
      }),
      buildAndWrite: () => Effect.gen(function* () {
        yield* fs.writeJson(options.paths.interfaceGraphIndexPath, interfaceGraph);
        yield* fs.writeJson(options.paths.selectorCanonPath, selectorCanon);
        return {
          result: {
            interfaceGraph,
            selectorCanon,
            discoveryRuns,
            interfaceGraphPath: options.paths.interfaceGraphIndexPath,
            selectorCanonPath: options.paths.selectorCanonPath,
          },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, options.paths.interfaceGraphIndexPath),
            relativeProjectPath(options.paths, options.paths.selectorCanonPath),
            relativeProjectPath(options.paths, manifestPath(options.paths)),
          ],
        };
      }),
      withCacheHit: (incremental) => ({
        interfaceGraph,
        selectorCanon,
        discoveryRuns,
        interfaceGraphPath: options.paths.interfaceGraphIndexPath,
        selectorCanonPath: options.paths.selectorCanonPath,
        incremental,
      }),
      withCacheMiss: (built, incremental) => ({ ...built, incremental }),
    });
  });
}
