import { deriveCapabilities } from './grammar';
import { normalizeIntentText } from './inference';
import type { ScreenId, SnapshotTemplateId } from './identity';
import { createElementId, createPostureId, createSurfaceId } from './identity';
import { provenanceKindForBoundStep } from './provenance';
import { explainBoundScenario } from './scenario/explanation';
import { capabilityForInstruction, compileStepProgram, traceStepProgram } from './program';
import { sha256, stableStringify } from './hash';
import { graphIds, mcpUris } from './ids';
import type {
  AdoSnapshot,
  ConfidenceOverlayCatalog,
  BoundScenario,
  DatasetControl,
  DerivedCapability,
  DerivedGraph,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  MappedMcpResource,
  MappedMcpTemplate,
  PatternDocument,
  ResolutionControl,
  RunRecord,
  InterpretationDriftRecord,
  RunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from './types';

interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
}

export interface ScenarioGraphArtifact extends ArtifactEnvelope<Scenario> {
  generatedSpecPath: string;
  generatedSpecExists: boolean;
  generatedTracePath: string;
  generatedTraceExists: boolean;
  generatedReviewPath: string;
  generatedReviewExists: boolean;
}

export interface BoundScenarioGraphArtifact extends ArtifactEnvelope<BoundScenario> {}

export interface InterpretationSurfaceGraphArtifact extends ArtifactEnvelope<ScenarioInterpretationSurface> {}

export interface KnowledgeSnapshotArtifact {
  relativePath: SnapshotTemplateId;
  artifactPath: string;
}

export interface ScreenHintsArtifact extends ArtifactEnvelope<ScreenHints> {}

export interface SharedPatternsArtifact extends ArtifactEnvelope<PatternDocument> {}
export interface DatasetControlArtifact extends ArtifactEnvelope<DatasetControl> {}
export interface ResolutionControlArtifact extends ArtifactEnvelope<ResolutionControl> {}
export interface RunbookControlArtifact extends ArtifactEnvelope<RunbookControl> {}
export interface ConfidenceOverlayArtifact extends ArtifactEnvelope<ConfidenceOverlayCatalog> {}

export interface EvidenceArtifact {
  artifactPath: string;
  targetNodeId?: string;
}

export interface PolicyDecisionArtifact {
  id: string;
  decision: 'allow' | 'review' | 'deny';
  artifactPath: string;
  targetNodeId: string;
  reasons: string[];
}

export interface GraphBuildInput {
  snapshots: ArtifactEnvelope<AdoSnapshot>[];
  surfaceGraphs: ArtifactEnvelope<SurfaceGraph>[];
  knowledgeSnapshots: KnowledgeSnapshotArtifact[];
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenPostures: ArtifactEnvelope<ScreenPostures>[];
  screenHints?: ScreenHintsArtifact[];
  sharedPatterns?: SharedPatternsArtifact[];
  datasets?: DatasetControlArtifact[];
  resolutionControls?: ResolutionControlArtifact[];
  runbooks?: RunbookControlArtifact[];
  confidenceOverlays?: ConfidenceOverlayArtifact[];
  scenarios: ScenarioGraphArtifact[];
  boundScenarios?: BoundScenarioGraphArtifact[];
  interpretationSurfaces?: InterpretationSurfaceGraphArtifact[];
  runRecords?: ArtifactEnvelope<RunRecord>[];
  interpretationDriftRecords?: ArtifactEnvelope<InterpretationDriftRecord>[];
  evidence: EvidenceArtifact[];
  policyDecisions?: PolicyDecisionArtifact[];
}

interface StepGraphContext {
  step: Scenario['steps'][number];
  boundStep: BoundScenario['steps'][number] | null;
}

function nodeFingerprint(kind: GraphNodeKind, id: string, payload?: Record<string, unknown>): string {
  return sha256(stableStringify({ kind, id, payload: payload ?? null }));
}

function edgeFingerprint(kind: GraphEdgeKind, from: string, to: string, payload?: Record<string, unknown>): string {
  return sha256(stableStringify({ kind, from, to, payload: payload ?? null }));
}

function createNode(input: {
  id: string;
  kind: GraphNodeKind;
  label: string;
  artifactPath?: string;
  provenance?: GraphNode['provenance'];
  payload?: Record<string, unknown>;
}): GraphNode {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    artifactPath: input.artifactPath,
    provenance: input.provenance ?? {},
    payload: input.payload,
    fingerprint: nodeFingerprint(input.kind, input.id, input.payload),
  };
}

function createEdge(input: {
  kind: GraphEdgeKind;
  from: string;
  to: string;
  provenance?: GraphEdge['provenance'];
  payload?: Record<string, unknown>;
}): GraphEdge {
  const edgeId = `${input.kind}:${input.from}->${input.to}`;
  return {
    id: edgeId,
    kind: input.kind,
    from: input.from,
    to: input.to,
    provenance: input.provenance ?? {},
    payload: input.payload,
    fingerprint: edgeFingerprint(input.kind, input.from, input.to, input.payload),
  };
}

function addNode(store: Map<string, GraphNode>, node: GraphNode): void {
  store.set(node.id, node);
}

function addEdge(store: Map<string, GraphEdge>, edge: GraphEdge): void {
  store.set(edge.id, edge);
}

// --- GraphAccumulator: immutable graph building ---

interface GraphAccumulator {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
}

const EMPTY_GRAPH: GraphAccumulator = { nodes: new Map(), edges: new Map() };

const withNode = (acc: GraphAccumulator, node: GraphNode): GraphAccumulator => ({
  nodes: new Map([...acc.nodes, [node.id, node]]),
  edges: acc.edges,
});

const withEdge = (acc: GraphAccumulator, edge: GraphEdge): GraphAccumulator => ({
  nodes: acc.nodes,
  edges: new Map([...acc.edges, [edge.id, edge]]),
});

const withItems = (
  acc: GraphAccumulator,
  items: { readonly nodes?: readonly GraphNode[]; readonly edges?: readonly GraphEdge[] },
): GraphAccumulator => ({
  nodes: new Map([...acc.nodes, ...(items.nodes ?? []).map((n) => [n.id, n] as const)]),
  edges: new Map([...acc.edges, ...(items.edges ?? []).map((e) => [e.id, e] as const)]),
});

const mergeAccumulators = (a: GraphAccumulator, b: GraphAccumulator): GraphAccumulator => ({
  nodes: new Map([...a.nodes, ...b.nodes]),
  edges: new Map([...a.edges, ...b.edges]),
});

// --- Phase type ---

interface Lookups {
  readonly interpretationSurfaces: ReadonlyMap<string, ScenarioInterpretationSurface>;
  readonly runRecords: ReadonlyMap<string, RunRecord>;
  readonly surfaceGraphs: ReadonlyMap<string, SurfaceGraph>;
  readonly screenElements: ReadonlyMap<string, ScreenElements>;
  readonly boundScenarios: ReadonlyMap<string, BoundScenario>;
  readonly driftRecords: readonly ArtifactEnvelope<InterpretationDriftRecord>[];
  readonly screenHintsArtifacts: readonly ScreenHintsArtifact[];
  readonly sharedPatternsArtifacts: readonly SharedPatternsArtifact[];
  readonly datasetArtifacts: readonly DatasetControlArtifact[];
  readonly resolutionControlArtifacts: readonly ResolutionControlArtifact[];
  readonly runbookArtifacts: readonly RunbookControlArtifact[];
  readonly confidenceOverlayArtifacts: readonly ConfidenceOverlayArtifact[];
  readonly boundScenarioArtifacts: readonly BoundScenarioGraphArtifact[];
}

type GraphPhase = (acc: GraphAccumulator, input: GraphBuildInput, lookups: Lookups) => GraphAccumulator;

function buildLookups(input: GraphBuildInput): Lookups {
  return {
    interpretationSurfaces: new Map((input.interpretationSurfaces ?? []).map((entry) => [entry.artifact.payload.adoId, entry.artifact] as const)),
    runRecords: new Map(
      [...(input.runRecords ?? [])].sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))
        .map((entry) => [entry.artifact.adoId, entry.artifact] as const),
    ),
    surfaceGraphs: new Map(input.surfaceGraphs.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenElements: new Map(input.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    boundScenarios: new Map((input.boundScenarios ?? []).map((entry) => [entry.artifact.source.ado_id, entry.artifact] as const)),
    driftRecords: [...(input.interpretationDriftRecords ?? [])].sort((left, right) => right.artifact.comparedAt.localeCompare(left.artifact.comparedAt)),
    screenHintsArtifacts: input.screenHints ?? [],
    sharedPatternsArtifacts: input.sharedPatterns ?? [],
    datasetArtifacts: input.datasets ?? [],
    resolutionControlArtifacts: input.resolutionControls ?? [],
    runbookArtifacts: input.runbooks ?? [],
    confidenceOverlayArtifacts: input.confidenceOverlays ?? [],
    boundScenarioArtifacts: input.boundScenarios ?? [],
  };
}

// --- Pure phases ---

const snapshotPhase: GraphPhase = (_acc, input) =>
  input.snapshots.reduce<GraphAccumulator>(
    (acc, { artifact: snapshot, artifactPath }) =>
      withNode(acc, createNode({
        id: graphIds.snapshot.ado(snapshot.id),
        kind: 'snapshot',
        label: snapshot.title,
        artifactPath,
        provenance: {
          contentHash: snapshot.contentHash,
          snapshotPath: artifactPath,
          sourceRevision: snapshot.revision,
        },
        payload: {
          category: 'ado',
          suite: snapshot.suitePath,
        },
      })),
    EMPTY_GRAPH,
  );

const knowledgeSnapshotPhase: GraphPhase = (_acc, input) =>
  input.knowledgeSnapshots.reduce<GraphAccumulator>(
    (acc, knowledgeSnapshot) =>
      withNode(acc, createNode({
        id: graphIds.snapshot.knowledge(knowledgeSnapshot.relativePath),
        kind: 'snapshot',
        label: basename(knowledgeSnapshot.artifactPath),
        artifactPath: knowledgeSnapshot.artifactPath,
        provenance: {
          knowledgePath: knowledgeSnapshot.artifactPath,
        },
        payload: {
          category: 'knowledge',
        },
      })),
    EMPTY_GRAPH,
  );

const datasetPhase: GraphPhase = (_acc, _input, lookups) =>
  lookups.datasetArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: dataset, artifactPath }) =>
      withNode(acc, createNode({
        id: graphIds.dataset(dataset.name),
        kind: 'dataset',
        label: dataset.name,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          default: Boolean(dataset.default),
          elementDefaults: Object.keys(dataset.defaults?.elements ?? {}).length,
          fixtureKeys: Object.keys(dataset.fixtures ?? {}),
        },
      })),
    EMPTY_GRAPH,
  );

const resolutionControlPhase: GraphPhase = (_acc, _input, lookups) =>
  lookups.resolutionControlArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: control, artifactPath }) =>
      withNode(acc, createNode({
        id: graphIds.resolutionControl(control.name),
        kind: 'resolution-control',
        label: control.name,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          stepIndexes: control.steps.map((step) => step.stepIndex),
          selector: control.selector,
        },
      })),
    EMPTY_GRAPH,
  );

const surfaceGraphPhase: GraphPhase = (_acc, input) =>
  input.surfaceGraphs.reduce<GraphAccumulator>(
    (acc, { artifact: surfaceGraph, artifactPath }) => {
      const screenNode = createNode({
        id: graphIds.screen(surfaceGraph.screen),
        kind: 'screen',
        label: surfaceGraph.screen,
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: { url: surfaceGraph.url },
      });

      const sectionItems = Object.entries(surfaceGraph.sections).flatMap(([sectionId, section]) => {
        const sectionNodeId = graphIds.section(surfaceGraph.screen, sectionId);
        const sectionNode = createNode({
          id: sectionNodeId,
          kind: 'section',
          label: sectionId,
          artifactPath,
          provenance: { knowledgePath: artifactPath },
          payload: {
            selector: section.selector,
            kind: section.kind,
            url: section.url ?? null,
            snapshot: section.snapshot ?? null,
          },
        });
        const containsEdge = createEdge({
          kind: 'contains',
          from: graphIds.screen(surfaceGraph.screen),
          to: sectionNodeId,
          provenance: { knowledgePath: artifactPath },
        });
        const snapshotEdges: readonly GraphEdge[] = section.snapshot
          ? [createEdge({
              kind: 'observed-by',
              from: sectionNodeId,
              to: graphIds.snapshot.knowledge(section.snapshot),
              provenance: { knowledgePath: artifactPath },
            })]
          : [];
        return { nodes: [sectionNode], edges: [containsEdge, ...snapshotEdges] };
      });

      const surfaceItems = Object.entries(surfaceGraph.surfaces).flatMap(([surfaceKey, surface]) => {
        const surfaceId = createSurfaceId(surfaceKey);
        const surfaceNodeId = graphIds.surface(surfaceGraph.screen, surfaceId);
        const surfaceNode = createNode({
          id: surfaceNodeId,
          kind: 'surface',
          label: surfaceId,
          artifactPath,
          provenance: { knowledgePath: artifactPath },
          payload: {
            section: surface.section,
            selector: surface.selector,
            kind: surface.kind,
            assertions: surface.assertions,
          },
        });
        const sectionEdge = createEdge({
          kind: 'contains',
          from: graphIds.section(surfaceGraph.screen, surface.section),
          to: surfaceNodeId,
          provenance: { knowledgePath: artifactPath },
        });
        const parentEdges = surface.parents.map((parentId) =>
          createEdge({
            kind: 'contains',
            from: graphIds.surface(surfaceGraph.screen, parentId),
            to: surfaceNodeId,
            provenance: { knowledgePath: artifactPath },
          }),
        );
        return { nodes: [surfaceNode], edges: [sectionEdge, ...parentEdges] };
      });

      const allNodes = [screenNode, ...sectionItems.flatMap((i) => i.nodes), ...surfaceItems.flatMap((i) => i.nodes)];
      const allEdges = [...sectionItems.flatMap((i) => i.edges), ...surfaceItems.flatMap((i) => i.edges)];
      return withItems(acc, { nodes: allNodes, edges: allEdges });
    },
    EMPTY_GRAPH,
  );

const screenElementPhase: GraphPhase = (_acc, input, lookups) =>
  input.screenElements.reduce<GraphAccumulator>(
    (acc, { artifact: elements, artifactPath }) => {
      const elementItems = Object.entries(elements.elements).flatMap(([elementKey, element]) => {
        const elementId = createElementId(elementKey);
        const elementNodeId = graphIds.element(elements.screen, elementId);
        const elementNode = createNode({
          id: elementNodeId,
          kind: 'element',
          label: elementId,
          artifactPath,
          provenance: { knowledgePath: artifactPath },
          payload: {
            role: element.role,
            name: element.name ?? null,
            widget: element.widget,
            surface: element.surface,
            affordance: element.affordance ?? null,
            locator: element.locator ?? null,
          },
        });
        const containsEdge = createEdge({
          kind: 'contains',
          from: graphIds.surface(elements.screen, element.surface),
          to: elementNodeId,
          provenance: { knowledgePath: artifactPath },
        });
        return { nodes: [elementNode], edges: [containsEdge] };
      });

      const surfaceGraph = lookups.surfaceGraphs.get(elements.screen);
      const capabilityItems = surfaceGraph
        ? deriveCapabilities(surfaceGraph, elements).flatMap((capability) => {
            const capNode = createNode({
              id: capability.id,
              kind: 'capability',
              label: capability.target,
              artifactPath,
              provenance: capability.provenance,
              payload: {
                targetKind: capability.targetKind,
                target: capability.target,
                operations: capability.operations,
              },
            });
            const capEdge = createEdge({
              kind: 'contains',
              from: capabilityTargetNodeId(elements.screen, capability),
              to: capability.id,
              provenance: capability.provenance,
            });
            return { nodes: [capNode], edges: [capEdge] };
          })
        : [];

      const allNodes = [...elementItems.flatMap((i) => i.nodes), ...capabilityItems.flatMap((i) => i.nodes)];
      const allEdges = [...elementItems.flatMap((i) => i.edges), ...capabilityItems.flatMap((i) => i.edges)];
      return withItems(acc, { nodes: allNodes, edges: allEdges });
    },
    EMPTY_GRAPH,
  );

const screenPosturePhase: GraphPhase = (acc, input, lookups) =>
  input.screenPostures.reduce<GraphAccumulator>(
    (outerAcc, { artifact: postures, artifactPath }) => {
      const surfaceGraph = lookups.surfaceGraphs.get(postures.screen);
      const items = Object.entries(postures.postures).flatMap(([elementKey, postureSet]) => {
        const elementId = createElementId(elementKey);
        return Object.entries(postureSet).flatMap(([postureKey, posture]) => {
          const postureId = createPostureId(postureKey);
          const postureNodeId = graphIds.posture(postures.screen, elementId, postureId);
          const postureNode = createNode({
            id: postureNodeId,
            kind: 'posture',
            label: postureId,
            artifactPath,
            provenance: { knowledgePath: artifactPath },
            payload: { values: posture.values },
          });
          const containsEdge = createEdge({
            kind: 'contains',
            from: graphIds.element(postures.screen, elementId),
            to: postureNodeId,
            provenance: { knowledgePath: artifactPath },
          });
          const effectEdges = posture.effects.flatMap((effect) => {
            if (effect.target === 'self' || effect.targetKind === 'self') {
              return [createEdge({
                kind: 'affects',
                from: postureNodeId,
                to: graphIds.element(postures.screen, elementId),
                provenance: { knowledgePath: artifactPath },
                payload: { state: effect.state, message: effect.message ?? null },
              })];
            }
            const targetKind = effect.targetKind ?? (surfaceGraph?.surfaces[effect.target] ? 'surface' : 'element');
            const targetNodeId = targetKind === 'surface'
              ? graphIds.surface(postures.screen, effect.target as ReturnType<typeof createSurfaceId>)
              : graphIds.element(postures.screen, effect.target as ReturnType<typeof createElementId>);
            return acc.nodes.has(targetNodeId)
              ? [createEdge({
                  kind: 'affects',
                  from: postureNodeId,
                  to: targetNodeId,
                  provenance: { knowledgePath: artifactPath },
                  payload: { state: effect.state, message: effect.message ?? null },
                })]
              : [];
          });
          return { nodes: [postureNode], edges: [containsEdge, ...effectEdges] };
        });
      });
      return withItems(outerAcc, {
        nodes: items.flatMap((i) => i.nodes),
        edges: items.flatMap((i) => i.edges),
      });
    },
    acc,
  );

const screenHintPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.screenHintsArtifacts.reduce<GraphAccumulator>(
    (hintsAcc, { artifact: hints, artifactPath }) => {
      const hintsNodeId = graphIds.screenHints(hints.screen);
      const hintsNode = createNode({
        id: hintsNodeId,
        kind: 'screen-hints',
        label: `${hints.screen} hints`,
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: {
          screenAliases: hints.screenAliases,
          elementCount: Object.keys(hints.elements).length,
        },
      });
      const containsEdge = acc.nodes.has(graphIds.screen(hints.screen))
        ? [createEdge({
            kind: 'contains',
            from: graphIds.screen(hints.screen),
            to: hintsNodeId,
            provenance: { knowledgePath: artifactPath },
          })]
        : [];
      return withItems(hintsAcc, { nodes: [hintsNode], edges: containsEdge });
    },
    acc,
  );

const sharedPatternPhase: GraphPhase = (_acc, _input, lookups) =>
  lookups.sharedPatternsArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: patterns, artifactPath }) => {
      const rootId = patternFileNodeId(artifactPath);
      const rootNode = createNode({
        id: rootId,
        kind: 'pattern',
        label: basename(artifactPath),
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: { category: 'registry', version: patterns.version },
      });

      const actionItems = Object.entries(patterns.actions ?? {}).map(([actionKey, descriptor]) => {
        const actionNodeId = graphIds.pattern(descriptor.id);
        return {
          nodes: [createNode({
            id: actionNodeId,
            kind: 'pattern' as const,
            label: descriptor.id,
            artifactPath,
            provenance: { knowledgePath: artifactPath },
            payload: { category: 'action', action: actionKey, aliases: descriptor.aliases },
          })],
          edges: [createEdge({
            kind: 'contains',
            from: rootId,
            to: actionNodeId,
            provenance: { knowledgePath: artifactPath },
          })],
        };
      });

      const postureItems = Object.entries(patterns.postures ?? {}).map(([postureKey, descriptor]) => {
        const posturePatternNodeId = graphIds.pattern(descriptor.id);
        return {
          nodes: [createNode({
            id: posturePatternNodeId,
            kind: 'pattern' as const,
            label: descriptor.id,
            artifactPath,
            provenance: { knowledgePath: artifactPath },
            payload: { category: 'posture', posture: postureKey, aliases: descriptor.aliases },
          })],
          edges: [createEdge({
            kind: 'contains',
            from: rootId,
            to: posturePatternNodeId,
            provenance: { knowledgePath: artifactPath },
          })],
        };
      });

      const allItems = [...actionItems, ...postureItems];
      return withItems(acc, {
        nodes: [rootNode, ...allItems.flatMap((i) => i.nodes)],
        edges: allItems.flatMap((i) => i.edges),
      });
    },
    EMPTY_GRAPH,
  );

function overlayTargetNodeId(record: ConfidenceOverlayCatalog['records'][number]): string | null {
  return record.snapshotTemplate
    ? graphIds.snapshot.knowledge(record.snapshotTemplate)
    : record.posture && record.screen && record.element
      ? graphIds.posture(record.screen, record.element, record.posture)
      : record.element && record.screen
        ? graphIds.element(record.screen, record.element)
        : record.screen && record.artifactType === 'hints'
          ? graphIds.screenHints(record.screen)
          : record.artifactType === 'patterns'
            ? graphIds.pattern(basenameWithoutExtension(record.artifactPath))
            : null;
}

const confidenceOverlayPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.confidenceOverlayArtifacts.reduce<GraphAccumulator>(
    (outerAcc, { artifact: confidenceCatalog, artifactPath }) =>
      confidenceCatalog.records.reduce<GraphAccumulator>(
        (innerAcc, record) => {
          const overlayNodeId = graphIds.confidenceOverlay(record.id);
          const overlayNode = createNode({
            id: overlayNodeId,
            kind: 'confidence-overlay',
            label: record.id,
            artifactPath,
            provenance: { knowledgePath: artifactPath },
            payload: {
              artifactType: record.artifactType,
              artifactPath: record.artifactPath,
              score: record.score,
              threshold: record.threshold,
              status: record.status,
              screen: record.screen ?? null,
              element: record.element ?? null,
              posture: record.posture ?? null,
              snapshotTemplate: record.snapshotTemplate ?? null,
              learnedAliases: record.learnedAliases,
            },
          });

          const targetNodeId = overlayTargetNodeId(record);
          const refEdges: readonly GraphEdge[] = targetNodeId && acc.nodes.has(targetNodeId)
            ? [createEdge({
                kind: 'references',
                from: overlayNodeId,
                to: targetNodeId,
                provenance: { knowledgePath: artifactPath },
                payload: { status: record.status },
              })]
            : [];

          const evidenceEdges = record.lineage.evidenceIds.map((evidenceId) =>
            createEdge({
              kind: 'learns-from',
              from: overlayNodeId,
              to: graphIds.evidence(evidenceId),
              provenance: { knowledgePath: artifactPath },
            }),
          );

          return withItems(innerAcc, { nodes: [overlayNode], edges: [...refEdges, ...evidenceEdges] });
        },
        outerAcc,
      ),
    acc,
  );

const runbookPhase: GraphPhase = (_acc, _input, lookups) =>
  lookups.runbookArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: runbook, artifactPath }) => {
      const runbookNode = createNode({
        id: graphIds.runbook(runbook.name),
        kind: 'runbook',
        label: runbook.name,
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: {
          default: Boolean(runbook.default),
          selector: runbook.selector,
          dataset: runbook.dataset ?? null,
          resolutionControl: runbook.resolutionControl ?? null,
          interpreterMode: runbook.interpreterMode ?? null,
        },
      });

      const datasetEdge: readonly GraphEdge[] = runbook.dataset
        ? [createEdge({
            kind: 'references',
            from: graphIds.runbook(runbook.name),
            to: graphIds.dataset(runbook.dataset),
            provenance: { knowledgePath: artifactPath },
          })]
        : [];

      const controlEdge: readonly GraphEdge[] = runbook.resolutionControl
        ? [createEdge({
            kind: 'references',
            from: graphIds.runbook(runbook.name),
            to: graphIds.resolutionControl(runbook.resolutionControl),
            provenance: { knowledgePath: artifactPath },
          })]
        : [];

      return withItems(acc, { nodes: [runbookNode], edges: [...datasetEdge, ...controlEdge] });
    },
    EMPTY_GRAPH,
  );

function createResources(): MappedMcpResource[] {
  return [
    {
      uri: mcpUris.graph,
      description: 'Derived dependency and provenance graph for the current workspace.',
    },
  ];
}

function createResourceTemplates(): MappedMcpTemplate[] {
  return [
    {
      uriTemplate: mcpUris.screenTemplate,
      description: 'Approved surface graph, elements, postures, and derived capabilities for one screen.',
    },
    {
      uriTemplate: mcpUris.scenarioTemplate,
      description: 'Scenario trace view for one ADO case.',
    },
    {
      uriTemplate: mcpUris.impactTemplate,
      description: 'Impact graph view for a graph node id.',
    },
  ];
}

function sortGraph(graph: Omit<DerivedGraph, 'fingerprint'>): DerivedGraph {
  const nodes = [...graph.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const edges = [...graph.edges].sort((left, right) => left.id.localeCompare(right.id));
  const resources = [...graph.resources].sort((left, right) => left.uri.localeCompare(right.uri));
  const resourceTemplates = [...graph.resourceTemplates].sort((left, right) => left.uriTemplate.localeCompare(right.uriTemplate));
  return {
    ...graph,
    nodes,
    edges,
    resources,
    resourceTemplates,
    fingerprint: sha256(stableStringify({ nodes, edges, resources, resourceTemplates })),
  };
}

function capabilityTargetNodeId(screenId: ScreenId, capability: DerivedCapability): string {
  switch (capability.targetKind) {
    case 'screen':
      return graphIds.screen(screenId);
    case 'surface':
      return graphIds.surface(screenId, capability.target as ReturnType<typeof createSurfaceId>);
    case 'element':
    default:
      return graphIds.element(screenId, capability.target as ReturnType<typeof createElementId>);
  }
}

function basenameWithoutExtension(value: string): string {
  return basename(value).replace(/\.[^.]+$/, '');
}

function basename(value: string): string {
  return value.split(/[\\/]/).pop() ?? value;
}

function patternFileNodeId(artifactPath: string): string {
  return graphIds.pattern(basenameWithoutExtension(artifactPath));
}

function stepConfidence(context: StepGraphContext): Scenario['steps'][number]['confidence'] {
  return context.boundStep?.confidence ?? context.step.confidence;
}

function stepBinding(context: StepGraphContext): BoundScenario['steps'][number]['binding'] | null {
  return context.boundStep?.binding ?? null;
}

function stepProvenanceKind(context: StepGraphContext) {
  if (context.boundStep) {
    return provenanceKindForBoundStep(context.boundStep);
  }

  if (context.step.confidence === 'intent-only' || context.step.confidence === 'unbound') {
    return 'unresolved';
  }
  if (context.step.resolution) {
    return 'explicit';
  }
  return 'approved-knowledge';
}

function mapKnowledgePathToNodeId(ref: string, context: StepGraphContext): string | null {
  if (ref.startsWith('knowledge/snapshots/')) {
    return graphIds.snapshot.knowledge(ref.replace(/^knowledge\//, ''));
  }

  if (ref.startsWith('knowledge/surfaces/') && ref.endsWith('.surface.yaml')) {
    return graphIds.screen(basename(ref).replace('.surface.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.elements.yaml')) {
    if (context.step.screen && context.step.element) {
      return graphIds.element(context.step.screen, context.step.element);
    }
    return graphIds.screen(basename(ref).replace('.elements.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.postures.yaml')) {
    if (context.step.screen && context.step.element && context.step.posture) {
      return graphIds.posture(context.step.screen, context.step.element, context.step.posture);
    }
    return graphIds.screen(basename(ref).replace('.postures.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/screens/') && ref.endsWith('.hints.yaml')) {
    return graphIds.screenHints(basename(ref).replace('.hints.yaml', '') as ScreenId);
  }

  if (ref.startsWith('knowledge/patterns/')) {
    return patternFileNodeId(ref);
  }

  return null;
}

function patternIdsForStep(stepContext: StepGraphContext, sharedPatternsArtifacts: readonly SharedPatternsArtifact[]): string[] {
  const binding = stepBinding(stepContext);
  const bindingIds = binding?.ruleId ? [graphIds.pattern(binding.ruleId)] : [];

  const postureIds = stepContext.step.posture
    ? sharedPatternsArtifacts
        .map((entry) => entry.artifact.postures?.[stepContext.step.posture!]?.id)
        .filter((id): id is string => id !== undefined && id !== null)
        .map((id) => graphIds.pattern(id))
    : [];

  return [...new Set([...bindingIds, ...postureIds])].sort((left, right) => left.localeCompare(right));
}

function bestAliasMatches(normalizedIntent: string, aliases: string[]): string[] {
  const matches = aliases
    .map((alias) => normalizeIntentText(alias))
    .filter((alias) => alias.length > 0 && normalizedIntent.includes(alias));
  if (matches.length === 0) {
    return [];
  }
  const maxLength = Math.max(...matches.map((alias) => alias.length));
  return [...new Set(matches.filter((alias) => alias.length === maxLength))].sort((left, right) => left.localeCompare(right));
}

export function deriveGraph(input: GraphBuildInput): DerivedGraph {
  const lookups = buildLookups(input);
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  const preScenarioPhases: readonly GraphPhase[] = [
    snapshotPhase, surfaceGraphPhase, knowledgeSnapshotPhase, screenElementPhase,
    screenPosturePhase, screenHintPhase, sharedPatternPhase, datasetPhase,
    confidenceOverlayPhase, resolutionControlPhase, runbookPhase,
  ];
  const accumulated = preScenarioPhases.reduce(
    (acc, phase) => phase(acc, input, lookups),
    EMPTY_GRAPH,
  );
  accumulated.nodes.forEach((node) => nodes.set(node.id, node));
  accumulated.edges.forEach((edge) => edges.set(edge.id, edge));

  // Aliases from lookups for remaining imperative phases (will be removed as phases are converted)
  const { boundScenarios, interpretationSurfaces, runRecords, driftRecords, screenElements, sharedPatternsArtifacts } = lookups;

  for (const scenarioArtifact of input.scenarios) {
    const { artifact: scenario, artifactPath, generatedSpecPath, generatedSpecExists, generatedTracePath, generatedTraceExists, generatedReviewPath, generatedReviewExists } = scenarioArtifact;
    const scenarioNodeId = graphIds.scenario(scenario.source.ado_id);
    addNode(nodes, createNode({
      id: scenarioNodeId,
      kind: 'scenario',
      label: scenario.metadata.title,
      artifactPath,
      provenance: {
        contentHash: scenario.source.content_hash,
        scenarioPath: artifactPath,
        sourceRevision: scenario.source.revision,
      },
      payload: {
        suite: scenario.metadata.suite,
        status: scenario.metadata.status,
        tags: scenario.metadata.tags,
      },
    }));

    const adoSnapshotId = graphIds.snapshot.ado(scenario.source.ado_id);
    if (nodes.has(adoSnapshotId)) {
      addEdge(edges, createEdge({
        kind: 'derived-from',
        from: scenarioNodeId,
        to: adoSnapshotId,
        provenance: {
          contentHash: scenario.source.content_hash,
          scenarioPath: artifactPath,
          sourceRevision: scenario.source.revision,
        },
      }));
    }

    const generatedArtifacts = [
      {
        id: graphIds.generatedSpec(scenario.source.ado_id),
        kind: 'generated-spec' as const,
        label: basename(generatedSpecPath),
        artifactPath: generatedSpecPath,
        exists: generatedSpecExists,
      },
      {
        id: graphIds.generatedTrace(scenario.source.ado_id),
        kind: 'generated-trace' as const,
        label: basename(generatedTracePath),
        artifactPath: generatedTracePath,
        exists: generatedTraceExists,
      },
      {
        id: graphIds.generatedReview(scenario.source.ado_id),
        kind: 'generated-review' as const,
        label: basename(generatedReviewPath),
        artifactPath: generatedReviewPath,
        exists: generatedReviewExists,
      },
    ];

    for (const generatedArtifact of generatedArtifacts) {
      addNode(nodes, createNode({
        id: generatedArtifact.id,
        kind: generatedArtifact.kind,
        label: generatedArtifact.label,
        artifactPath: generatedArtifact.artifactPath,
        provenance: {
          scenarioPath: artifactPath,
        },
        payload: {
          exists: generatedArtifact.exists,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'emits',
        from: scenarioNodeId,
        to: generatedArtifact.id,
        provenance: {
          scenarioPath: artifactPath,
        },
      }));
    }

    const boundScenario = boundScenarios.get(scenario.source.ado_id) ?? null;
    const surface = interpretationSurfaces.get(scenario.source.ado_id) ?? null;
    const latestRun = runRecords.get(scenario.source.ado_id) ?? null;
    const explanationByStepIndex = new Map(
      (boundScenario ? explainBoundScenario(boundScenario, 'normal', latestRun).steps : []).map((step) => [step.index, step] as const),
    );

    for (const step of scenario.steps) {
      const boundStep = boundScenario?.steps.find((candidate) => candidate.index === step.index) ?? null;
      const explanation = explanationByStepIndex.get(step.index);
      const stepContext: StepGraphContext = { step, boundStep };
      const taskStep = surface?.payload.steps.find((candidate) => candidate.index === step.index) ?? null;
      const stepNodeId = graphIds.step(scenario.source.ado_id, step.index);
      const program = explanation?.program ?? compileStepProgram(step);
      const trace = traceStepProgram(program);
      const binding = stepBinding(stepContext);
      addNode(nodes, createNode({
        id: stepNodeId,
        kind: 'step',
        label: step.intent,
        artifactPath,
        provenance: {
          confidence: stepConfidence(stepContext),
          contentHash: scenario.source.content_hash,
          scenarioPath: artifactPath,
          sourceRevision: scenario.source.revision,
        },
        payload: {
          action: step.action,
          instructionKinds: trace.instructionKinds,
          bindingKind: binding?.kind ?? (trace.hasEscapeHatch ? 'unbound' : 'bound'),
          provenanceKind: explanation?.provenanceKind ?? stepProvenanceKind(stepContext),
          governance: explanation?.governance ?? binding?.governance ?? 'approved',
          handshakes: explanation?.handshakes ?? ['preparation'],
          winningConcern: explanation?.winningConcern ?? 'intent',
          winningSource: explanation?.winningSource ?? (step.resolution ? 'scenario-explicit' : 'approved-knowledge'),
          resolutionMode: explanation?.resolutionMode ?? 'deterministic',
          ruleId: explanation?.ruleId ?? binding?.ruleId ?? null,
          knowledgeRefs: explanation?.knowledgeRefs ?? binding?.knowledgeRefs ?? [],
          supplementRefs: explanation?.supplementRefs ?? binding?.supplementRefs ?? [],
          controlRefs: explanation?.controlRefs ?? [],
          evidenceRefs: explanation?.evidenceRefs ?? [],
          overlayRefs: explanation?.overlayRefs ?? [],
          evidenceIds: explanation?.evidenceIds ?? binding?.evidenceIds ?? [],
          reviewReasons: explanation?.reviewReasons ?? binding?.reviewReasons ?? [],
          reasons: explanation?.reasons ?? binding?.reasons ?? [],
          runtimeStatus: explanation?.runtime?.status ?? 'pending',
          runtimeRunId: explanation?.runtime?.runId ?? null,
          runtimeResolutionMode: explanation?.runtime?.resolutionMode ?? null,
          runtimeWidgetContract: explanation?.runtime?.widgetContract ?? null,
          runtimeLocatorStrategy: explanation?.runtime?.locatorStrategy ?? null,
          runtimeLocatorRung: explanation?.runtime?.locatorRung ?? null,
          runtimeDegraded: explanation?.runtime?.degraded ?? false,
          runtimeFailureFamily: explanation?.runtime?.failure?.family ?? 'none',
          runtimeBudgetStatus: explanation?.runtime?.budget?.status ?? 'not-configured',
          runtimeBudgetBreaches: explanation?.runtime?.budget?.breaches ?? [],
          runtimeTimingMs: explanation?.runtime?.timing ?? {
            setupMs: 0,
            resolutionMs: 0,
            actionMs: 0,
            assertionMs: 0,
            retriesMs: 0,
            teardownMs: 0,
            totalMs: 0,
          },
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: scenarioNodeId,
        to: stepNodeId,
        provenance: {
          scenarioPath: artifactPath,
        },
      }));

      for (const screenId of trace.screens) {
        const screenNodeId = graphIds.screen(screenId);
        if (!nodes.has(screenNodeId)) {
          continue;
        }

        addEdge(edges, createEdge({
          kind: 'references',
          from: stepNodeId,
          to: screenNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
        }));
      }

      if (taskStep) {
        for (const screenId of (surface?.payload.knowledgeSlice.screenRefs ?? [])) {
          const screenNodeId = graphIds.screen(screenId);
          if (!nodes.has(screenNodeId)) {
            continue;
          }
          addEdge(edges, createEdge({
            kind: 'references',
            from: stepNodeId,
            to: screenNodeId,
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              source: 'task-packet-screen',
            },
          }));
        }

        for (const targetRef of taskStep.grounding?.targetRefs ?? []) {
          const targetNodeId = graphIds.target(targetRef);
          if (nodes.has(targetNodeId)) {
            addEdge(edges, createEdge({
              kind: 'uses',
              from: stepNodeId,
              to: targetNodeId,
              provenance: {
                confidence: stepConfidence(stepContext),
                scenarioPath: artifactPath,
              },
              payload: {
                source: 'task-grounding',
              },
            }));
          }

          const match = String(targetRef).match(/^target:(element|surface):([^:]+):(.+)$/);
          if (!match) continue;
          const [, kind, screenId, localId] = match;
          const legacyNodeId = kind === 'element'
            ? graphIds.element(screenId as never, localId as never)
            : graphIds.surface(screenId as never, localId as never);
          if (!nodes.has(legacyNodeId)) continue;
          addEdge(edges, createEdge({
            kind: 'uses',
            from: stepNodeId,
            to: legacyNodeId,
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              source: 'task-grounding',
            },
          }));
        }
      }

      for (const instruction of program.instructions) {
        if (instruction.kind === 'custom-escape-hatch') {
          continue;
        }

        if (instruction.kind !== 'navigate') {
          const elementNodeId = graphIds.element(instruction.screen, instruction.element);
          if (nodes.has(elementNodeId)) {
            addEdge(edges, createEdge({
              kind: 'uses',
              from: stepNodeId,
              to: elementNodeId,
              provenance: {
                confidence: stepConfidence(stepContext),
                scenarioPath: artifactPath,
              },
            }));
          }

          const element = screenElements.get(instruction.screen)?.elements[instruction.element];
          if (element) {
            const surfaceNodeId = graphIds.surface(instruction.screen, element.surface);
            if (nodes.has(surfaceNodeId)) {
              addEdge(edges, createEdge({
                kind: 'references',
                from: stepNodeId,
                to: surfaceNodeId,
                provenance: {
                  confidence: stepConfidence(stepContext),
                  scenarioPath: artifactPath,
                },
              }));
            }
          }
        }

        if (instruction.kind === 'navigate') {
          const capabilityNodeId = graphIds.capability.screen(instruction.screen);
          if (nodes.has(capabilityNodeId)) {
            addEdge(edges, createEdge({
              kind: 'uses',
              from: stepNodeId,
              to: capabilityNodeId,
              provenance: {
                confidence: stepConfidence(stepContext),
                scenarioPath: artifactPath,
              },
            }));
          }
          continue;
        }

        const capabilityNodeId = graphIds.capability.element(instruction.screen, instruction.element);
        if (nodes.has(capabilityNodeId)) {
          addEdge(edges, createEdge({
            kind: 'uses',
            from: stepNodeId,
            to: capabilityNodeId,
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              capability: capabilityForInstruction(instruction),
            },
          }));
        }
      }

      for (const snapshotTemplate of trace.snapshotTemplates) {
        const snapshotNodeId = graphIds.snapshot.knowledge(snapshotTemplate);
        if (!nodes.has(snapshotNodeId)) {
          continue;
        }

        addEdge(edges, createEdge({
          kind: 'asserts',
          from: stepNodeId,
          to: snapshotNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
        }));
      }

      const boundKnowledgeRefs = binding?.knowledgeRefs ?? [];
      for (const ref of boundKnowledgeRefs) {
        const targetNodeId = mapKnowledgePathToNodeId(ref, stepContext);
        if (!targetNodeId || !nodes.has(targetNodeId)) {
          continue;
        }
        addEdge(edges, createEdge({
          kind: 'references',
          from: stepNodeId,
          to: targetNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
          payload: {
            source: 'knowledge-ref',
            ref,
          },
        }));
      }

      const supplementNodeIds = new Set<string>();
      for (const ref of binding?.supplementRefs ?? []) {
        const targetNodeId = mapKnowledgePathToNodeId(ref, stepContext);
        if (targetNodeId) {
          supplementNodeIds.add(targetNodeId);
        }
      }
      for (const patternNodeId of patternIdsForStep(stepContext, sharedPatternsArtifacts)) {
        supplementNodeIds.add(patternNodeId);
      }
      for (const targetNodeId of [...supplementNodeIds]) {
        if (!nodes.has(targetNodeId)) {
          continue;
        }
        addEdge(edges, createEdge({
          kind: 'references',
          from: stepNodeId,
          to: targetNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
          payload: {
            source: 'supplement-ref',
          },
        }));
      }

      for (const evidenceId of binding?.evidenceIds ?? []) {
        const evidenceNodeId = graphIds.evidence(evidenceId);
        if (!nodes.has(evidenceNodeId)) {
          continue;
        }
        addEdge(edges, createEdge({
          kind: 'references',
          from: stepNodeId,
          to: evidenceNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
          payload: {
            source: 'evidence-ref',
          },
        }));
      }

      for (const overlayRef of explanation?.overlayRefs ?? []) {
        const overlayNodeId = graphIds.confidenceOverlay(overlayRef);
        if (!nodes.has(overlayNodeId)) {
          continue;
        }
        addEdge(edges, createEdge({
          kind: 'references',
          from: stepNodeId,
          to: overlayNodeId,
          provenance: {
            confidence: stepConfidence(stepContext),
            scenarioPath: artifactPath,
          },
          payload: {
            source: 'approved-equivalent-overlay',
          },
        }));
      }
    }
  }

  for (const policyDecision of input.policyDecisions ?? []) {
    const decisionNodeId = graphIds.policyDecision(policyDecision.id);
    addNode(nodes, createNode({
      id: decisionNodeId,
      kind: 'policy-decision',
      label: `${policyDecision.decision}: ${basename(policyDecision.artifactPath)}`,
      artifactPath: policyDecision.artifactPath,
      provenance: {
        knowledgePath: policyDecision.artifactPath,
      },
      payload: {
        decision: policyDecision.decision,
        reasons: policyDecision.reasons,
      },
    }));

    if (nodes.has(policyDecision.targetNodeId)) {
      addEdge(edges, createEdge({
        kind: 'governs',
        from: decisionNodeId,
        to: policyDecision.targetNodeId,
        provenance: {
          knowledgePath: policyDecision.artifactPath,
        },
        payload: {
          decision: policyDecision.decision,
        },
      }));
    }
  }

  for (const { artifact: drift } of driftRecords) {
    const changedSteps = drift.steps.filter((step) => step.changed);
    if (changedSteps.length === 0) {
      continue;
    }
    for (const step of changedSteps) {
      const stepNodeId = graphIds.step(drift.adoId, step.stepIndex);
      if (!nodes.has(stepNodeId)) {
        continue;
      }
      addEdge(edges, createEdge({
        kind: 'drifts-to',
        from: graphIds.scenario(drift.adoId),
        to: stepNodeId,
        provenance: {
          confidence: drift.explainableByFingerprintDelta ? 'compiler-derived' : 'agent-proposed',
        },
        payload: {
          runId: drift.runId,
          comparedRunId: drift.comparedRunId,
          changedFields: step.changes.map((change) => change.field),
          taskFingerprint: drift.provenance.taskFingerprint,
          knowledgeFingerprint: drift.provenance.knowledgeFingerprint,
          controlsFingerprint: drift.provenance.controlsFingerprint,
          explainableByFingerprintDelta: drift.explainableByFingerprintDelta,
        },
      }));
    }
  }

  for (const evidenceArtifact of input.evidence) {
    const evidenceNodeId = graphIds.evidence(evidenceArtifact.artifactPath);
    addNode(nodes, createNode({
      id: evidenceNodeId,
      kind: 'evidence',
      label: basename(evidenceArtifact.artifactPath),
      artifactPath: evidenceArtifact.artifactPath,
      provenance: {
        knowledgePath: evidenceArtifact.artifactPath,
      },
    }));

    if (evidenceArtifact.targetNodeId && nodes.has(evidenceArtifact.targetNodeId)) {
      addEdge(edges, createEdge({
        kind: 'proposed-change-for',
        from: evidenceNodeId,
        to: evidenceArtifact.targetNodeId,
        provenance: {
          knowledgePath: evidenceArtifact.artifactPath,
        },
      }));
    }
  }

  return sortGraph({
    version: 'v1',
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    resources: createResources(),
    resourceTemplates: createResourceTemplates(),
  });
}
