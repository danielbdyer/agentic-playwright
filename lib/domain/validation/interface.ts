import {
  createCanonicalTargetRef,
  createElementId,
  createRouteId,
  createRouteVariantId,
  createScreenId,
  createSectionId,
  createSelectorRef,
  createSnapshotTemplateId,
  createSurfaceId,
} from '../identity';
import type {
  ApplicationInterfaceGraph,
  DiscoveryRun,
  InterfaceGraphEdge,
  InterfaceGraphNode,
  SelectorCanon,
  SelectorCanonEntry,
  SelectorProbe,
} from '../types';
import {
  expectArray,
  expectBoolean,
  expectEnum,
  expectId,
  expectNumber,
  expectOptionalId,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
} from './primitives';

function validateLocatorStrategy(value: unknown, path: string) {
  const strategy = expectRecord(value, path);
  const kind = expectEnum(strategy.kind, `${path}.kind`, ['test-id', 'role-name', 'css'] as const);
  if (kind === 'test-id' || kind === 'css') {
    return {
      kind,
      value: expectString(strategy.value, `${path}.value`),
    } as const;
  }
  return {
    kind,
    role: expectString(strategy.role, `${path}.role`),
    name: expectOptionalString(strategy.name, `${path}.name`) ?? null,
  } as const;
}

function validateInterfaceGraphNode(value: unknown, path: string): InterfaceGraphNode {
  const node = expectRecord(value, path);
  return {
    id: expectString(node.id, `${path}.id`),
    kind: expectEnum(node.kind, `${path}.kind`, ['route', 'route-variant', 'screen', 'section', 'surface', 'target', 'snapshot-anchor', 'harvest-run'] as const),
    label: expectString(node.label, `${path}.label`),
    fingerprint: expectString(node.fingerprint, `${path}.fingerprint`),
    route: expectOptionalId(node.route, `${path}.route`, createRouteId) ?? null,
    variant: expectOptionalId(node.variant, `${path}.variant`, createRouteVariantId) ?? null,
    screen: expectOptionalId(node.screen, `${path}.screen`, createScreenId) ?? null,
    section: expectOptionalId(node.section, `${path}.section`, createSectionId) ?? null,
    surface: expectOptionalId(node.surface, `${path}.surface`, createSurfaceId) ?? null,
    element: expectOptionalId(node.element, `${path}.element`, createElementId) ?? null,
    snapshotTemplate: expectOptionalId(node.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId) ?? null,
    targetRef: expectOptionalId(node.targetRef, `${path}.targetRef`, createCanonicalTargetRef) ?? null,
    artifactPaths: expectStringArray(node.artifactPaths ?? [], `${path}.artifactPaths`),
    source: expectEnum(node.source, `${path}.source`, ['approved-knowledge', 'discovery', 'derived-working'] as const),
    payload: node.payload === undefined ? undefined : expectRecord(node.payload, `${path}.payload`),
  };
}

function validateInterfaceGraphEdge(value: unknown, path: string): InterfaceGraphEdge {
  const edge = expectRecord(value, path);
  return {
    id: expectString(edge.id, `${path}.id`),
    kind: expectEnum(edge.kind, `${path}.kind`, ['route-target', 'variant-of-route', 'contains', 'references-target', 'references-snapshot', 'discovered-by'] as const),
    from: expectString(edge.from, `${path}.from`),
    to: expectString(edge.to, `${path}.to`),
    fingerprint: expectString(edge.fingerprint, `${path}.fingerprint`),
    lineage: expectStringArray(edge.lineage ?? [], `${path}.lineage`),
    payload: edge.payload === undefined ? undefined : expectRecord(edge.payload, `${path}.payload`),
  };
}

export function validateApplicationInterfaceGraph(value: unknown): ApplicationInterfaceGraph {
  const graph = expectRecord(value, 'applicationInterfaceGraph');
  return {
    kind: expectEnum(graph.kind, 'applicationInterfaceGraph.kind', ['application-interface-graph'] as const),
    version: expectNumber(graph.version, 'applicationInterfaceGraph.version') as 1,
    generatedAt: expectString(graph.generatedAt, 'applicationInterfaceGraph.generatedAt'),
    fingerprint: expectString(graph.fingerprint, 'applicationInterfaceGraph.fingerprint'),
    discoveryRunIds: expectStringArray(graph.discoveryRunIds ?? [], 'applicationInterfaceGraph.discoveryRunIds'),
    routeRefs: expectStringArray(graph.routeRefs ?? [], 'applicationInterfaceGraph.routeRefs'),
    routeVariantRefs: expectStringArray(graph.routeVariantRefs ?? [], 'applicationInterfaceGraph.routeVariantRefs'),
    targetRefs: expectArray(graph.targetRefs ?? [], 'applicationInterfaceGraph.targetRefs').map((entry, index) =>
      expectId(entry, `applicationInterfaceGraph.targetRefs[${index}]`, createCanonicalTargetRef),
    ),
    nodes: expectArray(graph.nodes ?? [], 'applicationInterfaceGraph.nodes').map((entry, index) =>
      validateInterfaceGraphNode(entry, `applicationInterfaceGraph.nodes[${index}]`),
    ),
    edges: expectArray(graph.edges ?? [], 'applicationInterfaceGraph.edges').map((entry, index) =>
      validateInterfaceGraphEdge(entry, `applicationInterfaceGraph.edges[${index}]`),
    ),
  };
}

function validateSelectorProbe(value: unknown, path: string): SelectorProbe {
  const probe = expectRecord(value, path);
  const lineage = expectRecord(probe.lineage ?? {}, `${path}.lineage`);
  return {
    id: expectString(probe.id, `${path}.id`),
    selectorRef: expectId(probe.selectorRef, `${path}.selectorRef`, createSelectorRef),
    strategy: validateLocatorStrategy(probe.strategy, `${path}.strategy`),
    source: expectEnum(probe.source, `${path}.source`, ['approved-knowledge', 'discovery', 'evidence'] as const),
    status: expectEnum(probe.status, `${path}.status`, ['healthy', 'degraded', 'unverified'] as const),
    rung: expectNumber(probe.rung, `${path}.rung`),
    artifactPath: expectString(probe.artifactPath, `${path}.artifactPath`),
    variantRefs: expectStringArray(probe.variantRefs ?? [], `${path}.variantRefs`),
    discoveredFrom: expectOptionalString(probe.discoveredFrom, `${path}.discoveredFrom`) ?? null,
    evidenceRefs: expectStringArray(probe.evidenceRefs ?? [], `${path}.evidenceRefs`),
    successCount: expectNumber(probe.successCount, `${path}.successCount`),
    failureCount: expectNumber(probe.failureCount, `${path}.failureCount`),
    lastUsedAt: expectOptionalString(probe.lastUsedAt, `${path}.lastUsedAt`) ?? null,
    lineage: {
      sourceArtifactPaths: expectStringArray(lineage.sourceArtifactPaths ?? [], `${path}.lineage.sourceArtifactPaths`),
      discoveryRunIds: expectStringArray(lineage.discoveryRunIds ?? [], `${path}.lineage.discoveryRunIds`),
      evidenceRefs: expectStringArray(lineage.evidenceRefs ?? [], `${path}.lineage.evidenceRefs`),
    },
  };
}

function validateSelectorCanonEntry(value: unknown, path: string): SelectorCanonEntry {
  const entry = expectRecord(value, path);
  return {
    targetRef: expectId(entry.targetRef, `${path}.targetRef`, createCanonicalTargetRef),
    screen: expectId(entry.screen, `${path}.screen`, createScreenId),
    kind: expectEnum(entry.kind, `${path}.kind`, ['surface', 'element', 'snapshot-anchor', 'discovered'] as const),
    surface: expectOptionalId(entry.surface, `${path}.surface`, createSurfaceId) ?? null,
    element: expectOptionalId(entry.element, `${path}.element`, createElementId) ?? null,
    snapshotTemplate: expectOptionalId(entry.snapshotTemplate, `${path}.snapshotTemplate`, createSnapshotTemplateId) ?? null,
    probes: expectArray(entry.probes ?? [], `${path}.probes`).map((probe, index) =>
      validateSelectorProbe(probe, `${path}.probes[${index}]`),
    ),
  };
}

export function validateSelectorCanon(value: unknown): SelectorCanon {
  const canon = expectRecord(value, 'selectorCanon');
  const summary = expectRecord(canon.summary ?? {}, 'selectorCanon.summary');
  return {
    kind: expectEnum(canon.kind, 'selectorCanon.kind', ['selector-canon'] as const),
    version: expectNumber(canon.version, 'selectorCanon.version') as 1,
    generatedAt: expectString(canon.generatedAt, 'selectorCanon.generatedAt'),
    fingerprint: expectString(canon.fingerprint, 'selectorCanon.fingerprint'),
    entries: expectArray(canon.entries ?? [], 'selectorCanon.entries').map((entry, index) =>
      validateSelectorCanonEntry(entry, `selectorCanon.entries[${index}]`),
    ),
    summary: {
      totalTargets: expectNumber(summary.totalTargets ?? 0, 'selectorCanon.summary.totalTargets'),
      totalProbes: expectNumber(summary.totalProbes ?? 0, 'selectorCanon.summary.totalProbes'),
      approvedKnowledgeProbeCount: expectNumber(summary.approvedKnowledgeProbeCount ?? 0, 'selectorCanon.summary.approvedKnowledgeProbeCount'),
      discoveryProbeCount: expectNumber(summary.discoveryProbeCount ?? 0, 'selectorCanon.summary.discoveryProbeCount'),
      degradedProbeCount: expectNumber(summary.degradedProbeCount ?? 0, 'selectorCanon.summary.degradedProbeCount'),
      healthyProbeCount: expectNumber(summary.healthyProbeCount ?? 0, 'selectorCanon.summary.healthyProbeCount'),
    },
  };
}

export function validateDiscoveryRun(value: unknown): DiscoveryRun {
  const run = expectRecord(value, 'discoveryRun');
  return {
    kind: expectEnum(run.kind, 'discoveryRun.kind', ['discovery-run'] as const),
    version: expectNumber(run.version, 'discoveryRun.version') as 2,
    stage: expectEnum(run.stage, 'discoveryRun.stage', ['preparation'] as const),
    scope: expectEnum(run.scope, 'discoveryRun.scope', ['workspace'] as const),
    governance: expectEnum(run.governance, 'discoveryRun.governance', ['approved'] as const),
    app: expectString(run.app, 'discoveryRun.app'),
    routeId: expectId(run.routeId, 'discoveryRun.routeId', createRouteId),
    variantId: expectId(run.variantId, 'discoveryRun.variantId', createRouteVariantId),
    routeVariantRef: expectString(run.routeVariantRef, 'discoveryRun.routeVariantRef'),
    runId: expectString(run.runId, 'discoveryRun.runId'),
    screen: expectId(run.screen, 'discoveryRun.screen', createScreenId),
    url: expectString(run.url, 'discoveryRun.url'),
    title: expectString(run.title, 'discoveryRun.title'),
    discoveredAt: expectString(run.discoveredAt, 'discoveryRun.discoveredAt'),
    artifactPath: expectString(run.artifactPath, 'discoveryRun.artifactPath'),
    rootSelector: expectString(run.rootSelector, 'discoveryRun.rootSelector'),
    snapshotHash: expectString(run.snapshotHash, 'discoveryRun.snapshotHash'),
    sections: expectArray(run.sections ?? [], 'discoveryRun.sections').map((entry, index) => {
      const section = expectRecord(entry, `discoveryRun.sections[${index}]`);
      return {
        id: expectId(section.id, `discoveryRun.sections[${index}].id`, createSectionId),
        depth: expectNumber(section.depth, `discoveryRun.sections[${index}].depth`),
        selector: expectString(section.selector, `discoveryRun.sections[${index}].selector`),
        surfaceIds: expectArray(section.surfaceIds ?? [], `discoveryRun.sections[${index}].surfaceIds`).map((value, valueIndex) =>
          expectId(value, `discoveryRun.sections[${index}].surfaceIds[${valueIndex}]`, createSurfaceId),
        ),
        elementIds: expectArray(section.elementIds ?? [], `discoveryRun.sections[${index}].elementIds`).map((value, valueIndex) =>
          expectId(value, `discoveryRun.sections[${index}].elementIds[${valueIndex}]`, createElementId),
        ),
      };
    }),
    surfaces: expectArray(run.surfaces ?? [], 'discoveryRun.surfaces').map((entry, index) => {
      const surface = expectRecord(entry, `discoveryRun.surfaces[${index}]`);
      return {
        id: expectId(surface.id, `discoveryRun.surfaces[${index}].id`, createSurfaceId),
        targetRef: expectId(surface.targetRef, `discoveryRun.surfaces[${index}].targetRef`, createCanonicalTargetRef),
        section: expectId(surface.section, `discoveryRun.surfaces[${index}].section`, createSectionId),
        selector: expectString(surface.selector, `discoveryRun.surfaces[${index}].selector`),
        role: expectOptionalString(surface.role, `discoveryRun.surfaces[${index}].role`) ?? null,
        name: expectOptionalString(surface.name, `discoveryRun.surfaces[${index}].name`) ?? null,
        kind: expectEnum(surface.kind, `discoveryRun.surfaces[${index}].kind`, ['screen-root', 'form', 'action-cluster', 'validation-region', 'result-set', 'details-pane', 'modal', 'section-root'] as const),
        assertions: expectArray(surface.assertions ?? [], `discoveryRun.surfaces[${index}].assertions`).map((value, valueIndex) =>
          expectEnum(value, `discoveryRun.surfaces[${index}].assertions[${valueIndex}]`, ['state', 'structure'] as const),
        ),
        testId: expectOptionalString(surface.testId, `discoveryRun.surfaces[${index}].testId`) ?? null,
      };
    }),
    elements: expectArray(run.elements ?? [], 'discoveryRun.elements').map((entry, index) => {
      const element = expectRecord(entry, `discoveryRun.elements[${index}]`);
      return {
        id: expectId(element.id, `discoveryRun.elements[${index}].id`, createElementId),
        targetRef: expectId(element.targetRef, `discoveryRun.elements[${index}].targetRef`, createCanonicalTargetRef),
        surface: expectId(element.surface, `discoveryRun.elements[${index}].surface`, createSurfaceId),
        selector: expectString(element.selector, `discoveryRun.elements[${index}].selector`),
        role: expectString(element.role, `discoveryRun.elements[${index}].role`),
        name: expectOptionalString(element.name, `discoveryRun.elements[${index}].name`) ?? null,
        testId: expectOptionalString(element.testId, `discoveryRun.elements[${index}].testId`) ?? null,
        widget: expectString(element.widget, `discoveryRun.elements[${index}].widget`),
        required: expectBoolean(element.required, `discoveryRun.elements[${index}].required`),
        locatorHint: expectEnum(element.locatorHint, `discoveryRun.elements[${index}].locatorHint`, ['test-id', 'role-name', 'css'] as const),
        locatorCandidates: expectArray(element.locatorCandidates ?? [], `discoveryRun.elements[${index}].locatorCandidates`).map((value, valueIndex) =>
          validateLocatorStrategy(value, `discoveryRun.elements[${index}].locatorCandidates[${valueIndex}]`),
        ),
      };
    }),
    snapshotAnchors: expectStringArray(run.snapshotAnchors ?? [], 'discoveryRun.snapshotAnchors'),
    targets: expectArray(run.targets ?? [], 'discoveryRun.targets').map((entry, index) => {
      const target = expectRecord(entry, `discoveryRun.targets[${index}]`);
      return {
        targetRef: expectId(target.targetRef, `discoveryRun.targets[${index}].targetRef`, createCanonicalTargetRef),
        graphNodeId: expectString(target.graphNodeId, `discoveryRun.targets[${index}].graphNodeId`),
        kind: expectEnum(target.kind, `discoveryRun.targets[${index}].kind`, ['surface', 'element', 'snapshot-anchor'] as const),
        screen: expectId(target.screen, `discoveryRun.targets[${index}].screen`, createScreenId),
        section: expectOptionalId(target.section, `discoveryRun.targets[${index}].section`, createSectionId) ?? null,
        surface: expectOptionalId(target.surface, `discoveryRun.targets[${index}].surface`, createSurfaceId) ?? null,
        element: expectOptionalId(target.element, `discoveryRun.targets[${index}].element`, createElementId) ?? null,
        snapshotTemplate: expectOptionalId(target.snapshotTemplate, `discoveryRun.targets[${index}].snapshotTemplate`, createSnapshotTemplateId) ?? null,
      };
    }),
    reviewNotes: expectArray(run.reviewNotes ?? [], 'discoveryRun.reviewNotes').map((entry, index) => {
      const note = expectRecord(entry, `discoveryRun.reviewNotes[${index}]`);
      return {
        code: expectEnum(note.code, `discoveryRun.reviewNotes[${index}].code`, ['missing-accessible-name', 'css-fallback-only', 'state-exploration-recommended'] as const),
        message: expectString(note.message, `discoveryRun.reviewNotes[${index}].message`),
        targetId: expectString(note.targetId, `discoveryRun.reviewNotes[${index}].targetId`),
        targetKind: expectEnum(note.targetKind, `discoveryRun.reviewNotes[${index}].targetKind`, ['surface', 'element', 'snapshot-anchor'] as const),
      };
    }),
    selectorProbes: expectArray(run.selectorProbes ?? [], 'discoveryRun.selectorProbes').map((entry, index) => {
      const probe = expectRecord(entry, `discoveryRun.selectorProbes[${index}]`);
      return {
        id: expectString(probe.id, `discoveryRun.selectorProbes[${index}].id`),
        selectorRef: expectId(probe.selectorRef, `discoveryRun.selectorProbes[${index}].selectorRef`, createSelectorRef),
        targetRef: expectId(probe.targetRef, `discoveryRun.selectorProbes[${index}].targetRef`, createCanonicalTargetRef),
        graphNodeId: expectString(probe.graphNodeId, `discoveryRun.selectorProbes[${index}].graphNodeId`),
        screen: expectId(probe.screen, `discoveryRun.selectorProbes[${index}].screen`, createScreenId),
        section: expectOptionalId(probe.section, `discoveryRun.selectorProbes[${index}].section`, createSectionId) ?? null,
        element: expectOptionalId(probe.element, `discoveryRun.selectorProbes[${index}].element`, createElementId) ?? null,
        strategy: validateLocatorStrategy(probe.strategy, `discoveryRun.selectorProbes[${index}].strategy`),
        source: expectEnum(probe.source, `discoveryRun.selectorProbes[${index}].source`, ['discovery'] as const),
        variantRef: expectString(probe.variantRef, `discoveryRun.selectorProbes[${index}].variantRef`),
      };
    }),
    graphDeltas: (() => {
      const deltas = expectRecord(run.graphDeltas ?? {}, 'discoveryRun.graphDeltas');
      return {
        nodeIds: expectStringArray(deltas.nodeIds ?? [], 'discoveryRun.graphDeltas.nodeIds'),
        edgeIds: expectStringArray(deltas.edgeIds ?? [], 'discoveryRun.graphDeltas.edgeIds'),
      };
    })(),
  };
}
