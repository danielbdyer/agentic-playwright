import {
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createRouteId,
  createRouteVariantId,
  createScreenId,
  createSectionId,
  createSelectorRef,
  createSnapshotTemplateId,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
} from '../kernel/identity';
import * as schemaDecode from '../schemas/decode';
import * as schemas from '../schemas';
import type {
  ApplicationInterfaceGraph,
  DiscoveryIndex,
  DiscoveryRun,
  InterfaceGraphEdge,
  InterfaceGraphNode,
  SelectorCanon,
  SelectorCanonEntry,
  SelectorProbe,
  StateTransitionGraph,
  TransitionObservation,
} from '../target/interface-graph';
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
  expectStringRecord,
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
    kind: expectEnum(node.kind, `${path}.kind`, ['route', 'route-variant', 'screen', 'section', 'surface', 'target', 'snapshot-anchor', 'harvest-run', 'state', 'event-signature', 'transition'] as const),
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
    kind: expectEnum(edge.kind, `${path}.kind`, ['route-target', 'variant-of-route', 'contains', 'references-target', 'references-snapshot', 'discovered-by', 'requires-state', 'causes-transition', 'results-in-state'] as const),
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
    version: expectNumber(graph.version, 'applicationInterfaceGraph.version') as 2,
    generatedAt: expectString(graph.generatedAt, 'applicationInterfaceGraph.generatedAt'),
    fingerprint: expectString(graph.fingerprint, 'applicationInterfaceGraph.fingerprint'),
    discoveryRunIds: expectStringArray(graph.discoveryRunIds ?? [], 'applicationInterfaceGraph.discoveryRunIds'),
    routeRefs: expectStringArray(graph.routeRefs ?? [], 'applicationInterfaceGraph.routeRefs'),
    routeVariantRefs: expectStringArray(graph.routeVariantRefs ?? [], 'applicationInterfaceGraph.routeVariantRefs'),
    targetRefs: expectArray(graph.targetRefs ?? [], 'applicationInterfaceGraph.targetRefs').map((entry, index) =>
      expectId(entry, `applicationInterfaceGraph.targetRefs[${index}]`, createCanonicalTargetRef),
    ),
    stateRefs: expectArray(graph.stateRefs ?? [], 'applicationInterfaceGraph.stateRefs').map((entry, index) =>
      expectId(entry, `applicationInterfaceGraph.stateRefs[${index}]`, createStateNodeRef),
    ),
    eventSignatureRefs: expectArray(graph.eventSignatureRefs ?? [], 'applicationInterfaceGraph.eventSignatureRefs').map((entry, index) =>
      expectId(entry, `applicationInterfaceGraph.eventSignatureRefs[${index}]`, createEventSignatureRef),
    ),
    transitionRefs: expectArray(graph.transitionRefs ?? [], 'applicationInterfaceGraph.transitionRefs').map((entry, index) =>
      expectId(entry, `applicationInterfaceGraph.transitionRefs[${index}]`, createTransitionRef),
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
    validWhenStateRefs: expectArray(probe.validWhenStateRefs ?? [], `${path}.validWhenStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.validWhenStateRefs[${index}]`, createStateNodeRef),
    ),
    invalidWhenStateRefs: expectArray(probe.invalidWhenStateRefs ?? [], `${path}.invalidWhenStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.invalidWhenStateRefs[${index}]`, createStateNodeRef),
    ),
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

function validateTransitionObservation(value: unknown, path: string): TransitionObservation {
  const observation = expectRecord(value, path);
  return {
    observationId: expectString(observation.observationId, `${path}.observationId`),
    source: expectEnum(observation.source, `${path}.source`, ['harvest', 'runtime'] as const),
    actor: expectEnum(observation.actor, `${path}.actor`, ['safe-active-harvest', 'runtime-execution', 'live-dom'] as const),
    screen: expectId(observation.screen, `${path}.screen`, createScreenId),
    eventSignatureRef: expectOptionalId(observation.eventSignatureRef, `${path}.eventSignatureRef`, createEventSignatureRef) ?? null,
    transitionRef: expectOptionalId(observation.transitionRef, `${path}.transitionRef`, createTransitionRef) ?? null,
    expectedTransitionRefs: expectArray(observation.expectedTransitionRefs ?? [], `${path}.expectedTransitionRefs`).map((entry, index) =>
      expectId(entry, `${path}.expectedTransitionRefs[${index}]`, createTransitionRef),
    ),
    observedStateRefs: expectArray(observation.observedStateRefs ?? [], `${path}.observedStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.observedStateRefs[${index}]`, createStateNodeRef),
    ),
    unexpectedStateRefs: expectArray(observation.unexpectedStateRefs ?? [], `${path}.unexpectedStateRefs`).map((entry, index) =>
      expectId(entry, `${path}.unexpectedStateRefs[${index}]`, createStateNodeRef),
    ),
    confidence: expectEnum(observation.confidence, `${path}.confidence`, ['observed', 'inferred', 'missing'] as const),
    classification: expectEnum(observation.classification, `${path}.classification`, ['matched', 'ambiguous-match', 'missing-expected', 'unexpected-effects'] as const),
    detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `${path}.detail`),
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
        validWhenStateRefs: expectArray(probe.validWhenStateRefs ?? [], `discoveryRun.selectorProbes[${index}].validWhenStateRefs`).map((value, valueIndex) =>
          expectId(value, `discoveryRun.selectorProbes[${index}].validWhenStateRefs[${valueIndex}]`, createStateNodeRef),
        ),
        invalidWhenStateRefs: expectArray(probe.invalidWhenStateRefs ?? [], `discoveryRun.selectorProbes[${index}].invalidWhenStateRefs`).map((value, valueIndex) =>
          expectId(value, `discoveryRun.selectorProbes[${index}].invalidWhenStateRefs[${valueIndex}]`, createStateNodeRef),
        ),
      };
    }),
    stateObservations: expectArray(run.stateObservations ?? [], 'discoveryRun.stateObservations').map((entry, index) => {
      const observation = expectRecord(entry, `discoveryRun.stateObservations[${index}]`);
      return {
        stateRef: expectId(observation.stateRef, `discoveryRun.stateObservations[${index}].stateRef`, createStateNodeRef),
        source: expectEnum(observation.source, `discoveryRun.stateObservations[${index}].source`, ['baseline', 'active-harvest'] as const),
        observed: expectBoolean(observation.observed, `discoveryRun.stateObservations[${index}].observed`),
        detail: observation.detail === undefined ? undefined : expectStringRecord(observation.detail, `discoveryRun.stateObservations[${index}].detail`),
      };
    }),
    eventCandidates: expectArray(run.eventCandidates ?? [], 'discoveryRun.eventCandidates').map((entry, index) => {
      const candidate = expectRecord(entry, `discoveryRun.eventCandidates[${index}]`);
      return {
        eventSignatureRef: expectId(candidate.eventSignatureRef, `discoveryRun.eventCandidates[${index}].eventSignatureRef`, createEventSignatureRef),
        targetRef: expectId(candidate.targetRef, `discoveryRun.eventCandidates[${index}].targetRef`, createCanonicalTargetRef),
        action: expectEnum(candidate.action, `discoveryRun.eventCandidates[${index}].action`, ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const),
        source: expectEnum(candidate.source, `discoveryRun.eventCandidates[${index}].source`, ['approved-behavior', 'active-harvest'] as const),
      };
    }),
    transitionObservations: expectArray(run.transitionObservations ?? [], 'discoveryRun.transitionObservations').map((entry, index) =>
      validateTransitionObservation(entry, `discoveryRun.transitionObservations[${index}]`),
    ),
    observationDiffs: expectArray(run.observationDiffs ?? [], 'discoveryRun.observationDiffs').map((entry, index) => {
      const diff = expectRecord(entry, `discoveryRun.observationDiffs[${index}]`);
      return {
        beforeStateRef: expectOptionalId(diff.beforeStateRef, `discoveryRun.observationDiffs[${index}].beforeStateRef`, createStateNodeRef) ?? null,
        afterStateRef: expectOptionalId(diff.afterStateRef, `discoveryRun.observationDiffs[${index}].afterStateRef`, createStateNodeRef) ?? null,
        eventSignatureRef: expectOptionalId(diff.eventSignatureRef, `discoveryRun.observationDiffs[${index}].eventSignatureRef`, createEventSignatureRef) ?? null,
        transitionRef: expectOptionalId(diff.transitionRef, `discoveryRun.observationDiffs[${index}].transitionRef`, createTransitionRef) ?? null,
        classification: expectEnum(diff.classification, `discoveryRun.observationDiffs[${index}].classification`, ['observed', 'missing', 'unexpected'] as const),
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

export function validateDiscoveryIndex(value: unknown): DiscoveryIndex {
  const index = expectRecord(value, 'discoveryIndex');
  return {
    kind: expectEnum(index.kind, 'discoveryIndex.kind', ['discovery-index'] as const),
    version: expectNumber(index.version, 'discoveryIndex.version') as 2,
    app: expectString(index.app, 'discoveryIndex.app'),
    generatedAt: expectString(index.generatedAt, 'discoveryIndex.generatedAt'),
    receipts: expectArray(index.receipts ?? [], 'discoveryIndex.receipts').map((entry, entryIndex) => {
      const receipt = expectRecord(entry, `discoveryIndex.receipts[${entryIndex}]`);
      return {
        routeId: expectId(receipt.routeId, `discoveryIndex.receipts[${entryIndex}].routeId`, createRouteId),
        variantId: expectId(receipt.variantId, `discoveryIndex.receipts[${entryIndex}].variantId`, createRouteVariantId),
        routeVariantRef: expectString(receipt.routeVariantRef, `discoveryIndex.receipts[${entryIndex}].routeVariantRef`),
        screen: expectId(receipt.screen, `discoveryIndex.receipts[${entryIndex}].screen`, createScreenId),
        status: expectEnum(receipt.status, `discoveryIndex.receipts[${entryIndex}].status`, ['ok', 'failed'] as const),
        receiptId: expectOptionalString(receipt.receiptId, `discoveryIndex.receipts[${entryIndex}].receiptId`) ?? null,
        receiptPath: expectOptionalString(receipt.receiptPath, `discoveryIndex.receipts[${entryIndex}].receiptPath`) ?? null,
        contentFingerprint: expectOptionalString(receipt.contentFingerprint, `discoveryIndex.receipts[${entryIndex}].contentFingerprint`) ?? null,
        writeDisposition: expectEnum(receipt.writeDisposition, `discoveryIndex.receipts[${entryIndex}].writeDisposition`, ['reused', 'rewritten', 'failed'] as const),
        resolvedUrl: expectOptionalString(receipt.resolvedUrl, `discoveryIndex.receipts[${entryIndex}].resolvedUrl`) ?? null,
        rootSelector: expectOptionalString(receipt.rootSelector, `discoveryIndex.receipts[${entryIndex}].rootSelector`) ?? null,
        message: expectOptionalString(receipt.message, `discoveryIndex.receipts[${entryIndex}].message`) ?? null,
        inputFingerprint: expectOptionalString(receipt.inputFingerprint, `discoveryIndex.receipts[${entryIndex}].inputFingerprint`) ?? null,
      };
    }),
  };
}

export function validateStateTransitionGraph(value: unknown): StateTransitionGraph {
  return schemaDecode.decoderFor<StateTransitionGraph>(schemas.StateTransitionGraphSchema)(value);
}
