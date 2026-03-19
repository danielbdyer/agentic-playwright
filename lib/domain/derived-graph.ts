import { sortByStringKey } from './collections';
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
  ImprovementRun,
  RunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from './types';

interface ArtifactEnvelope<T> {
  readonly artifact: T;
  readonly artifactPath: string;
}

export interface ScenarioGraphArtifact extends ArtifactEnvelope<Scenario> {
  readonly generatedSpecPath: string;
  readonly generatedSpecExists: boolean;
  readonly generatedTracePath: string;
  readonly generatedTraceExists: boolean;
  readonly generatedReviewPath: string;
  readonly generatedReviewExists: boolean;
}

export interface BoundScenarioGraphArtifact extends ArtifactEnvelope<BoundScenario> {}

export interface InterpretationSurfaceGraphArtifact extends ArtifactEnvelope<ScenarioInterpretationSurface> {}
export interface ImprovementRunGraphArtifact extends ArtifactEnvelope<ImprovementRun> {}

export interface KnowledgeSnapshotArtifact {
  readonly relativePath: SnapshotTemplateId;
  readonly artifactPath: string;
}

export interface ScreenHintsArtifact extends ArtifactEnvelope<ScreenHints> {}

export interface SharedPatternsArtifact extends ArtifactEnvelope<PatternDocument> {}
export interface DatasetControlArtifact extends ArtifactEnvelope<DatasetControl> {}
export interface ResolutionControlArtifact extends ArtifactEnvelope<ResolutionControl> {}
export interface RunbookControlArtifact extends ArtifactEnvelope<RunbookControl> {}
export interface ConfidenceOverlayArtifact extends ArtifactEnvelope<ConfidenceOverlayCatalog> {}

export interface EvidenceArtifact {
  readonly artifactPath: string;
  readonly targetNodeId?: string;
}

export interface PolicyDecisionArtifact {
  readonly id: string;
  readonly decision: 'allow' | 'review' | 'deny';
  readonly artifactPath: string;
  readonly targetNodeId: string;
  readonly reasons: readonly string[];
}

export interface GraphBuildInput {
  readonly snapshots: readonly ArtifactEnvelope<AdoSnapshot>[];
  readonly surfaceGraphs: readonly ArtifactEnvelope<SurfaceGraph>[];
  readonly knowledgeSnapshots: readonly KnowledgeSnapshotArtifact[];
  readonly screenElements: readonly ArtifactEnvelope<ScreenElements>[];
  readonly screenPostures: readonly ArtifactEnvelope<ScreenPostures>[];
  readonly screenHints?: readonly ScreenHintsArtifact[];
  readonly sharedPatterns?: readonly SharedPatternsArtifact[];
  readonly datasets?: readonly DatasetControlArtifact[];
  readonly resolutionControls?: readonly ResolutionControlArtifact[];
  readonly runbooks?: readonly RunbookControlArtifact[];
  readonly confidenceOverlays?: readonly ConfidenceOverlayArtifact[];
  readonly scenarios: readonly ScenarioGraphArtifact[];
  readonly boundScenarios?: readonly BoundScenarioGraphArtifact[];
  readonly interpretationSurfaces?: readonly InterpretationSurfaceGraphArtifact[];
  readonly runRecords?: readonly ArtifactEnvelope<RunRecord>[];
  readonly improvementRuns?: readonly ImprovementRunGraphArtifact[];
  readonly interpretationDriftRecords?: readonly ArtifactEnvelope<InterpretationDriftRecord>[];
  readonly evidence: readonly EvidenceArtifact[];
  readonly policyDecisions?: readonly PolicyDecisionArtifact[];
}

interface StepGraphContext {
  readonly step: Scenario['steps'][number];
  readonly boundStep: BoundScenario['steps'][number] | null;
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

const snapshotPhase: GraphPhase = (acc, input) =>
  input.snapshots.reduce<GraphAccumulator>(
    (innerAcc, { artifact: snapshot, artifactPath }) =>
      withNode(innerAcc, createNode({
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
    acc,
  );

const knowledgeSnapshotPhase: GraphPhase = (acc, input) =>
  input.knowledgeSnapshots.reduce<GraphAccumulator>(
    (innerAcc, knowledgeSnapshot) =>
      withNode(innerAcc, createNode({
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
    acc,
  );

const datasetPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.datasetArtifacts.reduce<GraphAccumulator>(
    (innerAcc, { artifact: dataset, artifactPath }) =>
      withNode(innerAcc, createNode({
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
    acc,
  );

const resolutionControlPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.resolutionControlArtifacts.reduce<GraphAccumulator>(
    (innerAcc, { artifact: control, artifactPath }) =>
      withNode(innerAcc, createNode({
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
    acc,
  );

const surfaceGraphPhase: GraphPhase = (acc, input) =>
  input.surfaceGraphs.reduce<GraphAccumulator>(
    (innerAcc, { artifact: surfaceGraph, artifactPath }) => {
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
      return withItems(innerAcc, { nodes: allNodes, edges: allEdges });
    },
    acc,
  );

const screenElementPhase: GraphPhase = (acc, input, lookups) =>
  input.screenElements.reduce<GraphAccumulator>(
    (innerAcc, { artifact: elements, artifactPath }) => {
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
      return withItems(innerAcc, { nodes: allNodes, edges: allEdges });
    },
    acc,
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

const sharedPatternPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.sharedPatternsArtifacts.reduce<GraphAccumulator>(
    (innerAcc, { artifact: patterns, artifactPath }) => {
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
      return withItems(innerAcc, {
        nodes: [rootNode, ...allItems.flatMap((i) => i.nodes)],
        edges: allItems.flatMap((i) => i.edges),
      });
    },
    acc,
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

const runbookPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.runbookArtifacts.reduce<GraphAccumulator>(
    (innerAcc, { artifact: runbook, artifactPath }) => {
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

      return withItems(innerAcc, { nodes: [runbookNode], edges: [...datasetEdge, ...controlEdge] });
    },
    acc,
  );

// --- Scenario step edge sub-functions (each pure, returns readonly GraphEdge[]) ---

interface StepEdgeContext {
  readonly stepNodeId: string;
  readonly stepContext: StepGraphContext;
  readonly artifactPath: string;
  readonly explanation: ReturnType<typeof explainBoundScenario>['steps'][number] | undefined;
  readonly program: ReturnType<typeof compileStepProgram>;
  readonly trace: ReturnType<typeof traceStepProgram>;
  readonly taskStep: { readonly grounding?: { readonly targetRefs?: readonly string[] } } | null;
  readonly surface: ScenarioInterpretationSurface | null;
}

function stepScreenEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  return ctx.trace.screens
    .filter((screenId) => acc.nodes.has(graphIds.screen(screenId)))
    .map((screenId) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: graphIds.screen(screenId),
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
      }),
    );
}

function stepTaskGroundingEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  if (!ctx.taskStep) return [];

  const taskScreenEdges = (ctx.surface?.payload.knowledgeSlice.screenRefs ?? [])
    .filter((screenId) => acc.nodes.has(graphIds.screen(screenId)))
    .map((screenId) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: graphIds.screen(screenId),
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'task-packet-screen' },
      }),
    );

  const groundingEdges = (ctx.taskStep.grounding?.targetRefs ?? []).flatMap((targetRef) => {
    const targetNodeId = graphIds.target(targetRef);
    const directEdge = acc.nodes.has(targetNodeId)
      ? [createEdge({
          kind: 'uses',
          from: ctx.stepNodeId,
          to: targetNodeId,
          provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          payload: { source: 'task-grounding' },
        })]
      : [];

    const match = String(targetRef).match(/^target:(element|surface):([^:]+):(.+)$/);
    const legacyEdge = match
      ? (() => {
          const [, kind, screenId, localId] = match;
          const legacyNodeId = kind === 'element'
            ? graphIds.element(screenId as never, localId as never)
            : graphIds.surface(screenId as never, localId as never);
          return acc.nodes.has(legacyNodeId)
            ? [createEdge({
                kind: 'uses',
                from: ctx.stepNodeId,
                to: legacyNodeId,
                provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
                payload: { source: 'task-grounding' },
              })]
            : [];
        })()
      : [];

    return [...directEdge, ...legacyEdge];
  });

  return [...taskScreenEdges, ...groundingEdges];
}

function stepInstructionEdges(ctx: StepEdgeContext, acc: GraphAccumulator, lookups: Lookups): readonly GraphEdge[] {
  return ctx.program.instructions
    .filter((instruction) => instruction.kind !== 'custom-escape-hatch')
    .flatMap((instruction) => {
      if (instruction.kind === 'navigate') {
        const capabilityNodeId = graphIds.capability.screen(instruction.screen);
        return acc.nodes.has(capabilityNodeId)
          ? [createEdge({
              kind: 'uses',
              from: ctx.stepNodeId,
              to: capabilityNodeId,
              provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
            })]
          : [];
      }

      const elementNodeId = graphIds.element(instruction.screen, instruction.element);
      const elementEdge = acc.nodes.has(elementNodeId)
        ? [createEdge({
            kind: 'uses',
            from: ctx.stepNodeId,
            to: elementNodeId,
            provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
          })]
        : [];

      const element = lookups.screenElements.get(instruction.screen)?.elements[instruction.element];
      const surfaceEdge = element
        ? (() => {
            const surfaceNodeId = graphIds.surface(instruction.screen, element.surface);
            return acc.nodes.has(surfaceNodeId)
              ? [createEdge({
                  kind: 'references',
                  from: ctx.stepNodeId,
                  to: surfaceNodeId,
                  provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
                })]
              : [];
          })()
        : [];

      const capabilityNodeId = graphIds.capability.element(instruction.screen, instruction.element);
      const capabilityEdge = acc.nodes.has(capabilityNodeId)
        ? [createEdge({
            kind: 'uses',
            from: ctx.stepNodeId,
            to: capabilityNodeId,
            provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
            payload: { capability: capabilityForInstruction(instruction) },
          })]
        : [];

      return [...elementEdge, ...surfaceEdge, ...capabilityEdge];
    });
}

function stepSnapshotEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  return ctx.trace.snapshotTemplates
    .filter((template) => acc.nodes.has(graphIds.snapshot.knowledge(template)))
    .map((template) =>
      createEdge({
        kind: 'asserts',
        from: ctx.stepNodeId,
        to: graphIds.snapshot.knowledge(template),
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
      }),
    );
}

function stepKnowledgeRefEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  const binding = stepBinding(ctx.stepContext);
  return (binding?.knowledgeRefs ?? [])
    .map((ref) => ({ ref, targetNodeId: mapKnowledgePathToNodeId(ref, ctx.stepContext) }))
    .filter((entry): entry is { ref: string; targetNodeId: string } =>
      entry.targetNodeId !== null && acc.nodes.has(entry.targetNodeId))
    .map(({ ref, targetNodeId }) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: targetNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'knowledge-ref', ref },
      }),
    );
}

function stepSupplementEdges(ctx: StepEdgeContext, acc: GraphAccumulator, lookups: Lookups): readonly GraphEdge[] {
  const binding = stepBinding(ctx.stepContext);
  const supplementFromRefs = (binding?.supplementRefs ?? [])
    .map((ref) => mapKnowledgePathToNodeId(ref, ctx.stepContext))
    .filter((id): id is string => id !== null);
  const supplementFromPatterns = patternIdsForStep(ctx.stepContext, lookups.sharedPatternsArtifacts);
  const uniqueIds = [...new Set([...supplementFromRefs, ...supplementFromPatterns])];
  return uniqueIds
    .filter((targetNodeId) => acc.nodes.has(targetNodeId))
    .map((targetNodeId) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: targetNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'supplement-ref' },
      }),
    );
}

function stepEvidenceRefEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  const binding = stepBinding(ctx.stepContext);
  return (binding?.evidenceIds ?? [])
    .map((evidenceId) => graphIds.evidence(evidenceId))
    .filter((evidenceNodeId) => acc.nodes.has(evidenceNodeId))
    .map((evidenceNodeId) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: evidenceNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'evidence-ref' },
      }),
    );
}

function stepOverlayRefEdges(ctx: StepEdgeContext, acc: GraphAccumulator): readonly GraphEdge[] {
  return (ctx.explanation?.overlayRefs ?? [])
    .map((overlayRef) => graphIds.confidenceOverlay(overlayRef))
    .filter((overlayNodeId) => acc.nodes.has(overlayNodeId))
    .map((overlayNodeId) =>
      createEdge({
        kind: 'references',
        from: ctx.stepNodeId,
        to: overlayNodeId,
        provenance: { confidence: stepConfidence(ctx.stepContext), scenarioPath: ctx.artifactPath },
        payload: { source: 'approved-equivalent-overlay' },
      }),
    );
}

// --- Scenario phase ---

function scenarioBaseItems(
  scenarioArtifact: ScenarioGraphArtifact,
  acc: GraphAccumulator,
): { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] } {
  const { artifact: scenario, artifactPath, generatedSpecPath, generatedSpecExists,
    generatedTracePath, generatedTraceExists, generatedReviewPath, generatedReviewExists } = scenarioArtifact;
  const scenarioNodeId = graphIds.scenario(scenario.source.ado_id);
  const scenarioNode = createNode({
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
  });

  const adoSnapshotId = graphIds.snapshot.ado(scenario.source.ado_id);
  const derivedFromEdge: readonly GraphEdge[] = acc.nodes.has(adoSnapshotId)
    ? [createEdge({
        kind: 'derived-from',
        from: scenarioNodeId,
        to: adoSnapshotId,
        provenance: {
          contentHash: scenario.source.content_hash,
          scenarioPath: artifactPath,
          sourceRevision: scenario.source.revision,
        },
      })]
    : [];

  const generatedArtifacts = [
    { id: graphIds.generatedSpec(scenario.source.ado_id), kind: 'generated-spec' as const, label: basename(generatedSpecPath), artifactPath: generatedSpecPath, exists: generatedSpecExists },
    { id: graphIds.generatedTrace(scenario.source.ado_id), kind: 'generated-trace' as const, label: basename(generatedTracePath), artifactPath: generatedTracePath, exists: generatedTraceExists },
    { id: graphIds.generatedReview(scenario.source.ado_id), kind: 'generated-review' as const, label: basename(generatedReviewPath), artifactPath: generatedReviewPath, exists: generatedReviewExists },
  ];

  const generatedNodes = generatedArtifacts.map((ga) =>
    createNode({
      id: ga.id,
      kind: ga.kind,
      label: ga.label,
      artifactPath: ga.artifactPath,
      provenance: { scenarioPath: artifactPath },
      payload: { exists: ga.exists },
    }),
  );

  const emitsEdges = generatedArtifacts.map((ga) =>
    createEdge({
      kind: 'emits',
      from: scenarioNodeId,
      to: ga.id,
      provenance: { scenarioPath: artifactPath },
    }),
  );

  return {
    nodes: [scenarioNode, ...generatedNodes],
    edges: [...derivedFromEdge, ...emitsEdges],
  };
}

function buildStepNode(
  step: Scenario['steps'][number],
  stepContext: StepGraphContext,
  explanation: ReturnType<typeof explainBoundScenario>['steps'][number] | undefined,
  program: ReturnType<typeof compileStepProgram>,
  trace: ReturnType<typeof traceStepProgram>,
  scenarioNodeId: string,
  scenario: Scenario,
  artifactPath: string,
): { readonly node: GraphNode; readonly containsEdge: GraphEdge } {
  const binding = stepBinding(stepContext);
  const stepNodeId = graphIds.step(scenario.source.ado_id, step.index);
  const node = createNode({
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
        setupMs: 0, resolutionMs: 0, actionMs: 0, assertionMs: 0,
        retriesMs: 0, teardownMs: 0, totalMs: 0,
      },
    },
  });
  const containsEdge = createEdge({
    kind: 'contains',
    from: scenarioNodeId,
    to: stepNodeId,
    provenance: { scenarioPath: artifactPath },
  });
  return { node, containsEdge };
}

const scenarioPhase: GraphPhase = (acc, input, lookups) =>
  input.scenarios.reduce<GraphAccumulator>(
    (outerAcc, scenarioArtifact) => {
      const { artifact: scenario, artifactPath } = scenarioArtifact;
      const base = scenarioBaseItems(scenarioArtifact, outerAcc);
      const withBase = withItems(outerAcc, base);

      const boundScenario = lookups.boundScenarios.get(scenario.source.ado_id) ?? null;
      const surface = lookups.interpretationSurfaces.get(scenario.source.ado_id) ?? null;
      const latestRun = lookups.runRecords.get(scenario.source.ado_id) ?? null;
      const explanationByStepIndex = new Map(
        (boundScenario ? explainBoundScenario(boundScenario, 'normal', latestRun).steps : [])
          .map((step) => [step.index, step] as const),
      );
      const scenarioNodeId = graphIds.scenario(scenario.source.ado_id);

      return scenario.steps.reduce<GraphAccumulator>(
        (stepAcc, step) => {
          const boundStep = boundScenario?.steps.find((candidate) => candidate.index === step.index) ?? null;
          const explanation = explanationByStepIndex.get(step.index);
          const stepContext: StepGraphContext = { step, boundStep };
          const taskStep = surface?.payload.steps.find((candidate) => candidate.index === step.index) ?? null;
          const program = explanation?.program ?? compileStepProgram(step);
          const trace = traceStepProgram(program);
          const stepNodeId = graphIds.step(scenario.source.ado_id, step.index);

          const { node: stepNode, containsEdge } = buildStepNode(
            step, stepContext, explanation, program, trace, scenarioNodeId, scenario, artifactPath,
          );

          const ctx: StepEdgeContext = { stepNodeId, stepContext, artifactPath, explanation, program, trace, taskStep, surface };
          const edgeFns = [
            (c: StepEdgeContext, a: GraphAccumulator) => stepScreenEdges(c, a),
            (c: StepEdgeContext, a: GraphAccumulator) => stepTaskGroundingEdges(c, a),
            (c: StepEdgeContext, a: GraphAccumulator, l: Lookups) => stepInstructionEdges(c, a, l),
            (c: StepEdgeContext, a: GraphAccumulator) => stepSnapshotEdges(c, a),
            (c: StepEdgeContext, a: GraphAccumulator) => stepKnowledgeRefEdges(c, a),
            (c: StepEdgeContext, a: GraphAccumulator, l: Lookups) => stepSupplementEdges(c, a, l),
            (c: StepEdgeContext, a: GraphAccumulator) => stepEvidenceRefEdges(c, a),
            (c: StepEdgeContext, a: GraphAccumulator) => stepOverlayRefEdges(c, a),
          ];
          const allStepEdges = edgeFns.flatMap((fn) => fn(ctx, stepAcc, lookups));

          return withItems(stepAcc, { nodes: [stepNode], edges: [containsEdge, ...allStepEdges] });
        },
        withBase,
      );
    },
    acc,
  );

// --- Remaining phases ---

const policyDecisionPhase: GraphPhase = (acc, input) =>
  (input.policyDecisions ?? []).reduce<GraphAccumulator>(
    (policyAcc, policyDecision) => {
      const decisionNodeId = graphIds.policyDecision(policyDecision.id);
      const decisionNode = createNode({
        id: decisionNodeId,
        kind: 'policy-decision',
        label: `${policyDecision.decision}: ${basename(policyDecision.artifactPath)}`,
        artifactPath: policyDecision.artifactPath,
        provenance: { knowledgePath: policyDecision.artifactPath },
        payload: { decision: policyDecision.decision, reasons: policyDecision.reasons },
      });
      const governsEdge: readonly GraphEdge[] = acc.nodes.has(policyDecision.targetNodeId)
        ? [createEdge({
            kind: 'governs',
            from: decisionNodeId,
            to: policyDecision.targetNodeId,
            provenance: { knowledgePath: policyDecision.artifactPath },
            payload: { decision: policyDecision.decision },
          })]
        : [];
      return withItems(policyAcc, { nodes: [decisionNode], edges: governsEdge });
    },
    acc,
  );

const driftPhase: GraphPhase = (acc, _input, lookups) =>
  lookups.driftRecords.reduce<GraphAccumulator>(
    (driftAcc, { artifact: drift }) => {
      const changedSteps = drift.steps.filter((step) => step.changed);
      const driftEdges = changedSteps
        .filter((step) => acc.nodes.has(graphIds.step(drift.adoId, step.stepIndex)))
        .map((step) =>
          createEdge({
            kind: 'drifts-to',
            from: graphIds.scenario(drift.adoId),
            to: graphIds.step(drift.adoId, step.stepIndex),
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
          }),
        );
      return withItems(driftAcc, { edges: driftEdges });
    },
    acc,
  );

const evidencePhase: GraphPhase = (acc, input) =>
  input.evidence.reduce<GraphAccumulator>(
    (evAcc, evidenceArtifact) => {
      const evidenceNodeId = graphIds.evidence(evidenceArtifact.artifactPath);
      const evidenceNode = createNode({
        id: evidenceNodeId,
        kind: 'evidence',
        label: basename(evidenceArtifact.artifactPath),
        artifactPath: evidenceArtifact.artifactPath,
        provenance: { knowledgePath: evidenceArtifact.artifactPath },
      });
      const targetEdge: readonly GraphEdge[] = evidenceArtifact.targetNodeId && acc.nodes.has(evidenceArtifact.targetNodeId)
        ? [createEdge({
            kind: 'proposed-change-for',
            from: evidenceNodeId,
            to: evidenceArtifact.targetNodeId,
            provenance: { knowledgePath: evidenceArtifact.artifactPath },
          })]
        : [];
      return withItems(evAcc, { nodes: [evidenceNode], edges: targetEdge });
    },
    acc,
  );

function knowledgeNodeIdForArtifactPath(artifactPath: string): string | null {
  if (artifactPath.startsWith('knowledge/snapshots/')) {
    return graphIds.snapshot.knowledge(artifactPath.replace(/^knowledge\//, ''));
  }
  if (artifactPath.startsWith('knowledge/surfaces/') && artifactPath.endsWith('.surface.yaml')) {
    return graphIds.screen(basename(artifactPath).replace('.surface.yaml', '') as ScreenId);
  }
  if (artifactPath.startsWith('knowledge/screens/') && artifactPath.endsWith('.elements.yaml')) {
    return graphIds.screen(basename(artifactPath).replace('.elements.yaml', '') as ScreenId);
  }
  if (artifactPath.startsWith('knowledge/screens/') && artifactPath.endsWith('.postures.yaml')) {
    return graphIds.screen(basename(artifactPath).replace('.postures.yaml', '') as ScreenId);
  }
  if (artifactPath.startsWith('knowledge/screens/') && artifactPath.endsWith('.hints.yaml')) {
    return graphIds.screenHints(basename(artifactPath).replace('.hints.yaml', '') as ScreenId);
  }
  if (artifactPath.startsWith('knowledge/patterns/')) {
    return patternFileNodeId(artifactPath);
  }
  return null;
}

function nodeIdForInterventionTarget(
  target: ImprovementRun['interventions'][number]['target'],
): string | null {
  if (target.kind === 'graph-node') {
    return target.ref;
  }
  if (target.kind === 'scenario' && target.ids?.adoId) {
    return graphIds.scenario(target.ids.adoId);
  }
  if (target.kind === 'step' && target.ids?.adoId && target.ids.stepIndex !== null && target.ids.stepIndex !== undefined) {
    return graphIds.step(target.ids.adoId, target.ids.stepIndex);
  }
  if (target.kind === 'artifact' && target.artifactPath) {
    if (target.ids?.adoId && target.artifactPath.endsWith('.spec.ts')) {
      return graphIds.generatedSpec(target.ids.adoId);
    }
    if (target.ids?.adoId && target.artifactPath.endsWith('.trace.json')) {
      return graphIds.generatedTrace(target.ids.adoId);
    }
    if (target.ids?.adoId && target.artifactPath.endsWith('.review.md')) {
      return graphIds.generatedReview(target.ids.adoId);
    }
    if (target.artifactPath.startsWith('.tesseract/evidence/')) {
      return graphIds.evidence(target.artifactPath);
    }
    return knowledgeNodeIdForArtifactPath(target.artifactPath);
  }
  if (target.kind === 'knowledge' && target.artifactPath) {
    return knowledgeNodeIdForArtifactPath(target.artifactPath);
  }
  return null;
}

const improvementPhase: GraphPhase = (acc, input) =>
  (input.improvementRuns ?? []).reduce<GraphAccumulator>(
    (outerAcc, { artifact: run, artifactPath }) => {
      const runNodeId = graphIds.improvementRun(run.improvementRunId);
      const runNode = createNode({
        id: runNodeId,
        kind: 'improvement-run',
        label: run.improvementRunId,
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: {
          pipelineVersion: run.pipelineVersion,
          accepted: run.accepted,
          converged: run.converged,
          convergenceReason: run.convergenceReason,
          substrate: run.substrateContext.substrate,
          tags: run.tags,
        },
      });

      const withRunNode = withNode(outerAcc, runNode);
      const scenarioEdges = [...new Set(run.iterations.flatMap((iteration) => iteration.scenarioIds))]
        .map((adoId) => graphIds.scenario(adoId as Scenario['source']['ado_id']))
        .filter((scenarioNodeId) => withRunNode.nodes.has(scenarioNodeId))
        .map((scenarioNodeId) =>
          createEdge({
            kind: 'derived-from',
            from: runNodeId,
            to: scenarioNodeId,
            provenance: { knowledgePath: artifactPath },
          }),
        );

      const withScenarioEdges = withItems(withRunNode, { edges: scenarioEdges });

      const withParticipants = run.participants.reduce<GraphAccumulator>(
        (participantAcc, participant) => {
          const participantNodeId = graphIds.participant(participant.participantId);
          return withItems(participantAcc, {
            nodes: [createNode({
              id: participantNodeId,
              kind: 'participant',
              label: participant.label,
              artifactPath,
              provenance: { knowledgePath: artifactPath },
              payload: {
                kind: participant.kind,
                providerId: participant.providerId ?? null,
                adapterId: participant.adapterId ?? null,
                capabilities: participant.capabilities,
              },
            })],
            edges: [createEdge({
              kind: 'uses',
              from: runNodeId,
              to: participantNodeId,
              provenance: { knowledgePath: artifactPath },
            })],
          });
        },
        withScenarioEdges,
      );

      const withInterventions = run.interventions.reduce<GraphAccumulator>(
        (interventionAcc, intervention) => {
          const interventionNodeId = graphIds.intervention(intervention.interventionId);
          const participantEdges = intervention.participantRefs
            .map((participantRef) => graphIds.participant(participantRef.participantId))
            .filter((participantNodeId) => interventionAcc.nodes.has(participantNodeId))
            .map((participantNodeId) =>
              createEdge({
                kind: 'uses',
                from: interventionNodeId,
                to: participantNodeId,
                provenance: { knowledgePath: artifactPath },
              }),
            );
          const targetNodeId = nodeIdForInterventionTarget(intervention.target);
          const targetEdges = targetNodeId && interventionAcc.nodes.has(targetNodeId)
            ? [createEdge({
                kind: 'references',
                from: interventionNodeId,
                to: targetNodeId,
                provenance: { knowledgePath: artifactPath },
                payload: { targetKind: intervention.target.kind },
              })]
            : [];

          return withItems(interventionAcc, {
            nodes: [createNode({
              id: interventionNodeId,
              kind: 'intervention',
              label: intervention.summary,
              artifactPath,
              provenance: { knowledgePath: artifactPath },
              payload: {
                kind: intervention.kind,
                status: intervention.status,
                targetKind: intervention.target.kind,
              },
            })],
            edges: [
              createEdge({
                kind: 'emits',
                from: runNodeId,
                to: interventionNodeId,
                provenance: { knowledgePath: artifactPath },
              }),
              ...participantEdges,
              ...targetEdges,
            ],
          });
        },
        withParticipants,
      );

      return run.acceptanceDecisions.reduce<GraphAccumulator>(
        (decisionAcc, decision) => {
          const decisionNodeId = graphIds.acceptanceDecision(decision.decisionId);
          const participantNodeId = graphIds.participant(decision.decidedBy.participantId);
          const governedTargets = run.candidateInterventions
            .filter((candidate) => decision.candidateInterventionIds.includes(candidate.candidateId))
            .map((candidate) => nodeIdForInterventionTarget(candidate.target))
            .filter((targetNodeId): targetNodeId is string => targetNodeId !== null && decisionAcc.nodes.has(targetNodeId))
            .map((targetNodeId) =>
              createEdge({
                kind: 'governs',
                from: decisionNodeId,
                to: targetNodeId,
                provenance: { knowledgePath: artifactPath },
                payload: { verdict: decision.verdict },
              }),
            );

          return withItems(decisionAcc, {
            nodes: [createNode({
              id: decisionNodeId,
              kind: 'acceptance-decision',
              label: decision.verdict,
              artifactPath,
              provenance: { knowledgePath: artifactPath },
              payload: {
                verdict: decision.verdict,
                checkpointRef: decision.checkpointRef ?? null,
                candidateInterventionIds: decision.candidateInterventionIds,
              },
            })],
            edges: [
              createEdge({
                kind: 'emits',
                from: runNodeId,
                to: decisionNodeId,
                provenance: { knowledgePath: artifactPath },
              }),
              ...(decisionAcc.nodes.has(participantNodeId)
                ? [createEdge({
                    kind: 'uses',
                    from: decisionNodeId,
                    to: participantNodeId,
                    provenance: { knowledgePath: artifactPath },
                  })]
                : []),
              ...governedTargets,
            ],
          });
        },
        withInterventions,
      );
    },
    acc,
  );

// --- Finalize ---

function finalize(acc: GraphAccumulator): DerivedGraph {
  return sortGraph({
    version: 'v1',
    nodes: [...acc.nodes.values()],
    edges: [...acc.edges.values()],
    resources: createResources(),
    resourceTemplates: createResourceTemplates(),
  });
}

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
  const nodes = sortByStringKey(graph.nodes, (n) => n.id);
  const edges = sortByStringKey(graph.edges, (e) => e.id);
  const resources = sortByStringKey(graph.resources, (r) => r.uri);
  const resourceTemplates = sortByStringKey(graph.resourceTemplates, (r) => r.uriTemplate);
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

  const phases: readonly GraphPhase[] = [
    snapshotPhase,
    surfaceGraphPhase,
    knowledgeSnapshotPhase,
    screenElementPhase,
    screenPosturePhase,
    screenHintPhase,
    sharedPatternPhase,
    datasetPhase,
    confidenceOverlayPhase,
    resolutionControlPhase,
    runbookPhase,
    scenarioPhase,
    policyDecisionPhase,
    driftPhase,
    evidencePhase,
    improvementPhase,
  ];

  const accumulated = phases.reduce(
    (acc, phase) => phase(acc, input, lookups),
    EMPTY_GRAPH,
  );

  return finalize(accumulated);
}
