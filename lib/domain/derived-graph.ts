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
  ScenarioTaskPacket,
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

export interface TaskPacketGraphArtifact extends ArtifactEnvelope<ScenarioTaskPacket> {}

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
  taskPackets?: TaskPacketGraphArtifact[];
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

function patternIdsForStep(stepContext: StepGraphContext, sharedPatternsArtifacts: SharedPatternsArtifact[]): string[] {
  const ids: string[] = [];
  const binding = stepBinding(stepContext);
  if (binding?.ruleId) {
    ids.push(graphIds.pattern(binding.ruleId));
  }

  if (stepContext.step.posture) {
    for (const entry of sharedPatternsArtifacts) {
      const descriptor = entry.artifact.postures?.[stepContext.step.posture];
      if (descriptor?.id) {
        ids.push(graphIds.pattern(descriptor.id));
      }
    }
  }

  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
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
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const screenHintsArtifacts = input.screenHints ?? [];
  const sharedPatternsArtifacts = input.sharedPatterns ?? [];
  const datasetArtifacts = input.datasets ?? [];
  const resolutionControlArtifacts = input.resolutionControls ?? [];
  const runbookArtifacts = input.runbooks ?? [];
  const confidenceOverlayArtifacts = input.confidenceOverlays ?? [];
  const boundScenarioArtifacts = input.boundScenarios ?? [];
  const taskPackets = new Map((input.taskPackets ?? []).map((entry) => [entry.artifact.adoId, entry.artifact] as const));
  const runRecords = new Map(
    (input.runRecords ?? [])
      .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))
      .map((entry) => [entry.artifact.adoId, entry.artifact] as const),
  );
  const surfaceGraphs = new Map(input.surfaceGraphs.map((entry) => [entry.artifact.screen, entry.artifact] as const));
  const driftRecords = (input.interpretationDriftRecords ?? []).slice().sort((left, right) => right.artifact.comparedAt.localeCompare(left.artifact.comparedAt));
  const screenElements = new Map(input.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const));
  const boundScenarios = new Map(boundScenarioArtifacts.map((entry) => [entry.artifact.source.ado_id, entry.artifact] as const));

  for (const { artifact: snapshot, artifactPath } of input.snapshots) {
    addNode(nodes, createNode({
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
    }));
  }

  for (const { artifact: surfaceGraph, artifactPath } of input.surfaceGraphs) {
    addNode(nodes, createNode({
      id: graphIds.screen(surfaceGraph.screen),
      kind: 'screen',
      label: surfaceGraph.screen,
      artifactPath,
      provenance: {
        knowledgePath: artifactPath,
      },
      payload: { url: surfaceGraph.url },
    }));

    for (const [sectionId, section] of Object.entries(surfaceGraph.sections)) {
      const sectionNodeId = graphIds.section(surfaceGraph.screen, sectionId);
      addNode(nodes, createNode({
        id: sectionNodeId,
        kind: 'section',
        label: sectionId,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          selector: section.selector,
          kind: section.kind,
          url: section.url ?? null,
          snapshot: section.snapshot ?? null,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.screen(surfaceGraph.screen),
        to: sectionNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));

      if (section.snapshot) {
        addEdge(edges, createEdge({
          kind: 'observed-by',
          from: sectionNodeId,
          to: graphIds.snapshot.knowledge(section.snapshot),
          provenance: {
            knowledgePath: artifactPath,
          },
        }));
      }
    }

    for (const [surfaceKey, surface] of Object.entries(surfaceGraph.surfaces)) {
      const surfaceId = createSurfaceId(surfaceKey);
      const surfaceNodeId = graphIds.surface(surfaceGraph.screen, surfaceId);
      addNode(nodes, createNode({
        id: surfaceNodeId,
        kind: 'surface',
        label: surfaceId,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          section: surface.section,
          selector: surface.selector,
          kind: surface.kind,
          assertions: surface.assertions,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.section(surfaceGraph.screen, surface.section),
        to: surfaceNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));

      for (const parentId of surface.parents) {
        addEdge(edges, createEdge({
          kind: 'contains',
          from: graphIds.surface(surfaceGraph.screen, parentId),
          to: surfaceNodeId,
          provenance: {
            knowledgePath: artifactPath,
          },
        }));
      }
    }
  }

  for (const knowledgeSnapshot of input.knowledgeSnapshots) {
    addNode(nodes, createNode({
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
    }));
  }

  for (const { artifact: elements, artifactPath } of input.screenElements) {
    for (const [elementKey, element] of Object.entries(elements.elements)) {
      const elementId = createElementId(elementKey);
      const elementNodeId = graphIds.element(elements.screen, elementId);
      addNode(nodes, createNode({
        id: elementNodeId,
        kind: 'element',
        label: elementId,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          role: element.role,
          name: element.name ?? null,
          widget: element.widget,
          surface: element.surface,
          affordance: element.affordance ?? null,
          locator: element.locator ?? null,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.surface(elements.screen, element.surface),
        to: elementNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }

    const surfaceGraph = surfaceGraphs.get(elements.screen);
    if (!surfaceGraph) {
      continue;
    }

    for (const capability of deriveCapabilities(surfaceGraph, elements)) {
      addNode(nodes, createNode({
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
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: capabilityTargetNodeId(elements.screen, capability),
        to: capability.id,
        provenance: capability.provenance,
      }));
    }
  }

  for (const { artifact: postures, artifactPath } of input.screenPostures) {
    const surfaceGraph = surfaceGraphs.get(postures.screen);
    for (const [elementKey, postureSet] of Object.entries(postures.postures)) {
      const elementId = createElementId(elementKey);
      for (const [postureKey, posture] of Object.entries(postureSet)) {
        const postureId = createPostureId(postureKey);
        const postureNodeId = graphIds.posture(postures.screen, elementId, postureId);
        addNode(nodes, createNode({
          id: postureNodeId,
          kind: 'posture',
          label: postureId,
          artifactPath,
          provenance: {
            knowledgePath: artifactPath,
          },
          payload: {
            values: posture.values,
          },
        }));
        addEdge(edges, createEdge({
          kind: 'contains',
          from: graphIds.element(postures.screen, elementId),
          to: postureNodeId,
          provenance: {
            knowledgePath: artifactPath,
          },
        }));

        for (const effect of posture.effects) {
          if (effect.target === 'self' || effect.targetKind === 'self') {
            addEdge(edges, createEdge({
              kind: 'affects',
              from: postureNodeId,
              to: graphIds.element(postures.screen, elementId),
              provenance: {
                knowledgePath: artifactPath,
              },
              payload: {
                state: effect.state,
                message: effect.message ?? null,
              },
            }));
            continue;
          }

          const targetKind = effect.targetKind ?? (surfaceGraph?.surfaces[effect.target] ? 'surface' : 'element');
          const targetNodeId = targetKind === 'surface'
            ? graphIds.surface(postures.screen, effect.target as ReturnType<typeof createSurfaceId>)
            : graphIds.element(postures.screen, effect.target as ReturnType<typeof createElementId>);
          if (!nodes.has(targetNodeId)) {
            continue;
          }

          addEdge(edges, createEdge({
            kind: 'affects',
            from: postureNodeId,
            to: targetNodeId,
            provenance: {
              knowledgePath: artifactPath,
            },
            payload: {
              state: effect.state,
              message: effect.message ?? null,
            },
          }));
        }
      }
    }
  }

  for (const { artifact: hints, artifactPath } of screenHintsArtifacts) {
    const hintsNodeId = graphIds.screenHints(hints.screen);
    addNode(nodes, createNode({
      id: hintsNodeId,
      kind: 'screen-hints',
      label: `${hints.screen} hints`,
      artifactPath,
      provenance: {
        knowledgePath: artifactPath,
      },
      payload: {
        screenAliases: hints.screenAliases,
        elementCount: Object.keys(hints.elements).length,
      },
    }));

    if (nodes.has(graphIds.screen(hints.screen))) {
      addEdge(edges, createEdge({
        kind: 'contains',
        from: graphIds.screen(hints.screen),
        to: hintsNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }
  }

  for (const { artifact: patterns, artifactPath } of sharedPatternsArtifacts) {
    const rootId = patternFileNodeId(artifactPath);
    addNode(nodes, createNode({
      id: rootId,
      kind: 'pattern',
      label: basename(artifactPath),
      artifactPath,
      provenance: {
        knowledgePath: artifactPath,
      },
      payload: {
        category: 'registry',
        version: patterns.version,
      },
    }));

    for (const [actionKey, descriptor] of Object.entries(patterns.actions ?? {})) {
      const actionNodeId = graphIds.pattern(descriptor.id);
      addNode(nodes, createNode({
        id: actionNodeId,
        kind: 'pattern',
        label: descriptor.id,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          category: 'action',
          action: actionKey,
          aliases: descriptor.aliases,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: rootId,
        to: actionNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }

    for (const [postureKey, descriptor] of Object.entries(patterns.postures ?? {})) {
      const posturePatternNodeId = graphIds.pattern(descriptor.id);
      addNode(nodes, createNode({
        id: posturePatternNodeId,
        kind: 'pattern',
        label: descriptor.id,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
        payload: {
          category: 'posture',
          posture: postureKey,
          aliases: descriptor.aliases,
        },
      }));
      addEdge(edges, createEdge({
        kind: 'contains',
        from: rootId,
        to: posturePatternNodeId,
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }
  }

  for (const { artifact: dataset, artifactPath } of datasetArtifacts) {
    addNode(nodes, createNode({
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
    }));
  }

  for (const { artifact: confidenceCatalog, artifactPath } of confidenceOverlayArtifacts) {
    for (const record of confidenceCatalog.records) {
      const overlayNodeId = graphIds.confidenceOverlay(record.id);
      addNode(nodes, createNode({
        id: overlayNodeId,
        kind: 'confidence-overlay',
        label: record.id,
        artifactPath,
        provenance: {
          knowledgePath: artifactPath,
        },
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
      }));

      const targetNodeId = record.snapshotTemplate
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

      if (targetNodeId && nodes.has(targetNodeId)) {
        addEdge(edges, createEdge({
          kind: 'references',
          from: overlayNodeId,
          to: targetNodeId,
          provenance: {
            knowledgePath: artifactPath,
          },
          payload: {
            status: record.status,
          },
        }));
      }

      for (const evidenceId of record.lineage.evidenceIds) {
        addEdge(edges, createEdge({
          kind: 'learns-from',
          from: overlayNodeId,
          to: graphIds.evidence(evidenceId),
          provenance: {
            knowledgePath: artifactPath,
          },
        }));
      }
    }
  }

  for (const { artifact: control, artifactPath } of resolutionControlArtifacts) {
    addNode(nodes, createNode({
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
    }));
  }

  for (const { artifact: runbook, artifactPath } of runbookArtifacts) {
    addNode(nodes, createNode({
      id: graphIds.runbook(runbook.name),
      kind: 'runbook',
      label: runbook.name,
      artifactPath,
      provenance: {
        knowledgePath: artifactPath,
      },
      payload: {
        default: Boolean(runbook.default),
        selector: runbook.selector,
        dataset: runbook.dataset ?? null,
        resolutionControl: runbook.resolutionControl ?? null,
        interpreterMode: runbook.interpreterMode ?? null,
      },
    }));

    if (runbook.dataset) {
      addEdge(edges, createEdge({
        kind: 'references',
        from: graphIds.runbook(runbook.name),
        to: graphIds.dataset(runbook.dataset),
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }

    if (runbook.resolutionControl) {
      addEdge(edges, createEdge({
        kind: 'references',
        from: graphIds.runbook(runbook.name),
        to: graphIds.resolutionControl(runbook.resolutionControl),
        provenance: {
          knowledgePath: artifactPath,
        },
      }));
    }
  }

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
    const taskPacket = taskPackets.get(scenario.source.ado_id) ?? null;
    const latestRun = runRecords.get(scenario.source.ado_id) ?? null;
    const explanationByStepIndex = new Map(
      (boundScenario ? explainBoundScenario(boundScenario, 'normal', latestRun).steps : []).map((step) => [step.index, step] as const),
    );

    for (const step of scenario.steps) {
      const boundStep = boundScenario?.steps.find((candidate) => candidate.index === step.index) ?? null;
      const explanation = explanationByStepIndex.get(step.index);
      const stepContext: StepGraphContext = { step, boundStep };
      const taskStep = taskPacket?.steps.find((candidate) => candidate.index === step.index) ?? null;
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
        const normalizedIntent = taskStep.normalizedIntent;
        const matchedScreenAliases = taskStep.runtimeKnowledge.screens.flatMap((screen) =>
          bestAliasMatches(normalizedIntent, screen.screenAliases).map((alias) => ({
            screen: screen.screen,
            alias,
          })),
        );
        const onlyScreen = taskStep.runtimeKnowledge.screens[0] ?? null;
        const taskScreens = matchedScreenAliases.length > 0
          ? [...new Map(matchedScreenAliases.map((entry) => [entry.screen, entry])).values()]
          : onlyScreen && taskStep.runtimeKnowledge.screens.length === 1
            ? [{ screen: onlyScreen.screen, alias: null }]
            : [];
        for (const candidate of taskScreens) {
          const screenNodeId = graphIds.screen(candidate.screen);
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
              alias: candidate.alias,
            },
          }));
        }

        for (const screen of taskStep.runtimeKnowledge.screens) {
          const matchedAliases = screen.elements.flatMap((element) =>
            bestAliasMatches(normalizedIntent, element.aliases).map((alias) => ({
              element: element.element,
              screen: screen.screen,
              alias,
            })),
          );
          const maxLength = matchedAliases.reduce((current, candidate) => Math.max(current, candidate.alias.length), 0);
          for (const match of matchedAliases.filter((candidate) => candidate.alias.length === maxLength)) {
            const elementNodeId = graphIds.element(match.screen, match.element);
            if (!nodes.has(elementNodeId)) {
              continue;
            }
            addEdge(edges, createEdge({
              kind: 'uses',
              from: stepNodeId,
              to: elementNodeId,
              provenance: {
                confidence: stepConfidence(stepContext),
                scenarioPath: artifactPath,
              },
              payload: {
                source: 'task-packet-alias',
                alias: match.alias,
              },
            }));
          }
        }

        for (const dataset of taskStep.runtimeKnowledge.controls.datasets) {
          const usesDataset = Object.keys(dataset.elementDefaults).length > 0;
          if (!usesDataset || !nodes.has(graphIds.dataset(dataset.name))) {
            continue;
          }
          addEdge(edges, createEdge({
            kind: 'references',
            from: stepNodeId,
            to: graphIds.dataset(dataset.name),
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              source: 'dataset-control',
            },
          }));
        }

        for (const resolutionControl of taskStep.runtimeKnowledge.controls.resolutionControls.filter((entry) => entry.stepIndex === step.index)) {
          if (!nodes.has(graphIds.resolutionControl(resolutionControl.name))) {
            continue;
          }
          addEdge(edges, createEdge({
            kind: 'references',
            from: stepNodeId,
            to: graphIds.resolutionControl(resolutionControl.name),
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              source: 'resolution-control',
            },
          }));
        }

        for (const runbook of taskStep.runtimeKnowledge.controls.runbooks) {
          if (!nodes.has(graphIds.runbook(runbook.name))) {
            continue;
          }
          addEdge(edges, createEdge({
            kind: 'references',
            from: stepNodeId,
            to: graphIds.runbook(runbook.name),
            provenance: {
              confidence: stepConfidence(stepContext),
              scenarioPath: artifactPath,
            },
            payload: {
              source: 'runbook-control',
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
