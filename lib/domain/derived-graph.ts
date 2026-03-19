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

interface GraphAccumulator {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
}

const EMPTY_GRAPH: GraphAccumulator = { nodes: new Map(), edges: new Map() };

const withNode = (acc: GraphAccumulator, node: GraphNode): GraphAccumulator => ({
  ...acc,
  nodes: new Map([...acc.nodes, [node.id, node]]),
});

const withEdge = (acc: GraphAccumulator, edge: GraphEdge): GraphAccumulator => ({
  ...acc,
  edges: new Map([...acc.edges, [edge.id, edge]]),
});

const withItems = (acc: GraphAccumulator, items: { readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[] }): GraphAccumulator => ({
  nodes: new Map([...acc.nodes, ...items.nodes.map((n) => [n.id, n] as const)]),
  edges: new Map([...acc.edges, ...items.edges.map((e) => [e.id, e] as const)]),
});

const withAll = (a: GraphAccumulator, b: GraphAccumulator): GraphAccumulator => ({
  nodes: new Map([...a.nodes, ...b.nodes]),
  edges: new Map([...a.edges, ...b.edges]),
});


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

function patternIdsForStep(stepContext: StepGraphContext, sharedPatternsArtifacts: ReadonlyArray<SharedPatternsArtifact>): string[] {
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

function graphFromSnapshots(snapshots: ReadonlyArray<ArtifactEnvelope<AdoSnapshot>>): GraphAccumulator {
  return snapshots.reduce<GraphAccumulator>(
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
}

function graphFromKnowledgeSnapshots(knowledgeSnapshots: ReadonlyArray<KnowledgeSnapshotArtifact>): GraphAccumulator {
  return knowledgeSnapshots.reduce<GraphAccumulator>(
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
}

function graphFromDatasets(datasetArtifacts: ReadonlyArray<DatasetControlArtifact>): GraphAccumulator {
  return datasetArtifacts.reduce<GraphAccumulator>(
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
}

function graphFromResolutionControls(resolutionControlArtifacts: ReadonlyArray<ResolutionControlArtifact>): GraphAccumulator {
  return resolutionControlArtifacts.reduce<GraphAccumulator>(
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
}

function graphFromSurfaceGraphs(surfaceGraphArtifacts: ReadonlyArray<ArtifactEnvelope<SurfaceGraph>>): GraphAccumulator {
  return surfaceGraphArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: sg, artifactPath }) => {
      const screenAcc = withNode(acc, createNode({
        id: graphIds.screen(sg.screen),
        kind: 'screen',
        label: sg.screen,
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: { url: sg.url },
      }));

      const sectionAcc = Object.entries(sg.sections).reduce<GraphAccumulator>(
        (a, [sectionId, section]) => {
          const sectionNodeId = graphIds.section(sg.screen, sectionId);
          const withSectionNode = withNode(a, createNode({
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
          }));
          const withContainsEdge = withEdge(withSectionNode, createEdge({
            kind: 'contains',
            from: graphIds.screen(sg.screen),
            to: sectionNodeId,
            provenance: { knowledgePath: artifactPath },
          }));
          return section.snapshot
            ? withEdge(withContainsEdge, createEdge({
                kind: 'observed-by',
                from: sectionNodeId,
                to: graphIds.snapshot.knowledge(section.snapshot),
                provenance: { knowledgePath: artifactPath },
              }))
            : withContainsEdge;
        },
        screenAcc,
      );

      return Object.entries(sg.surfaces).reduce<GraphAccumulator>(
        (a, [surfaceKey, surface]) => {
          const surfaceId = createSurfaceId(surfaceKey);
          const surfaceNodeId = graphIds.surface(sg.screen, surfaceId);
          const withSurfaceNode = withNode(a, createNode({
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
          }));
          const withSectionEdge = withEdge(withSurfaceNode, createEdge({
            kind: 'contains',
            from: graphIds.section(sg.screen, surface.section),
            to: surfaceNodeId,
            provenance: { knowledgePath: artifactPath },
          }));
          return surface.parents.reduce<GraphAccumulator>(
            (b, parentId) => withEdge(b, createEdge({
              kind: 'contains',
              from: graphIds.surface(sg.screen, parentId),
              to: surfaceNodeId,
              provenance: { knowledgePath: artifactPath },
            })),
            withSectionEdge,
          );
        },
        sectionAcc,
      );
    },
    EMPTY_GRAPH,
  );
}

function graphFromScreenHints(acc: GraphAccumulator, screenHintsArtifacts: ReadonlyArray<ScreenHintsArtifact>): GraphAccumulator {
  return screenHintsArtifacts.reduce<GraphAccumulator>(
    (phaseAcc, { artifact: hints, artifactPath }) => {
      const hintsNodeId = graphIds.screenHints(hints.screen);
      const nodeAcc = withNode(phaseAcc, createNode({
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
      return nodeAcc.nodes.has(graphIds.screen(hints.screen))
        ? withEdge(nodeAcc, createEdge({
            kind: 'contains',
            from: graphIds.screen(hints.screen),
            to: hintsNodeId,
            provenance: {
              knowledgePath: artifactPath,
            },
          }))
        : nodeAcc;
    },
    acc,
  );
}

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

function graphFromConfidenceOverlays(
  acc: GraphAccumulator,
  confidenceOverlayArtifacts: ReadonlyArray<ConfidenceOverlayArtifact>,
): GraphAccumulator {
  return confidenceOverlayArtifacts.reduce<GraphAccumulator>(
    (outerAcc, { artifact: confidenceCatalog, artifactPath }) =>
      confidenceCatalog.records.reduce<GraphAccumulator>(
        (recAcc, record) => {
          const overlayNodeId = graphIds.confidenceOverlay(record.id);
          const withOverlayNode = withNode(recAcc, createNode({
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
          }));

          const targetNodeId = overlayTargetNodeId(record);
          const withRefEdge = targetNodeId && withOverlayNode.nodes.has(targetNodeId)
            ? withEdge(withOverlayNode, createEdge({
                kind: 'references',
                from: overlayNodeId,
                to: targetNodeId,
                provenance: { knowledgePath: artifactPath },
                payload: { status: record.status },
              }))
            : withOverlayNode;

          return record.lineage.evidenceIds.reduce<GraphAccumulator>(
            (evAcc, evidenceId) =>
              withEdge(evAcc, createEdge({
                kind: 'learns-from',
                from: overlayNodeId,
                to: graphIds.evidence(evidenceId),
                provenance: { knowledgePath: artifactPath },
              })),
            withRefEdge,
          );
        },
        outerAcc,
      ),
    acc,
  );
}

function graphFromRunbooks(runbookArtifacts: ReadonlyArray<RunbookControlArtifact>): GraphAccumulator {
  return runbookArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: runbook, artifactPath }) => {
      const nodeAcc = withNode(acc, createNode({
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
      }));

      const withDatasetEdge = runbook.dataset
        ? withEdge(nodeAcc, createEdge({
            kind: 'references',
            from: graphIds.runbook(runbook.name),
            to: graphIds.dataset(runbook.dataset),
            provenance: { knowledgePath: artifactPath },
          }))
        : nodeAcc;

      return runbook.resolutionControl
        ? withEdge(withDatasetEdge, createEdge({
            kind: 'references',
            from: graphIds.runbook(runbook.name),
            to: graphIds.resolutionControl(runbook.resolutionControl),
            provenance: { knowledgePath: artifactPath },
          }))
        : withDatasetEdge;
    },
    EMPTY_GRAPH,
  );
}

interface GraphLookups {
  readonly interpretationSurfaces: ReadonlyMap<string, ScenarioInterpretationSurface>;
  readonly runRecords: ReadonlyMap<string, RunRecord>;
  readonly surfaceGraphs: ReadonlyMap<ScreenId, SurfaceGraph>;
  readonly screenElements: ReadonlyMap<ScreenId, ScreenElements>;
  readonly boundScenarios: ReadonlyMap<string, BoundScenario>;
}

function stepInstructionEdges(
  acc: GraphAccumulator,
  program: ReturnType<typeof compileStepProgram>,
  stepNodeId: string,
  stepContext: StepGraphContext,
  artifactPath: string,
  screenElementsLookup: ReadonlyMap<ScreenId, ScreenElements>,
): readonly GraphEdge[] {
  return program.instructions
    .filter((instruction) => instruction.kind !== 'custom-escape-hatch')
    .flatMap((instruction) => {
      if (instruction.kind === 'navigate') {
        const capNodeId = graphIds.capability.screen(instruction.screen);
        return acc.nodes.has(capNodeId)
          ? [createEdge({
              kind: 'uses',
              from: stepNodeId,
              to: capNodeId,
              provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
            })]
          : [];
      }

      const elementNodeId = graphIds.element(instruction.screen, instruction.element);
      const elementEdge = acc.nodes.has(elementNodeId)
        ? [createEdge({
            kind: 'uses',
            from: stepNodeId,
            to: elementNodeId,
            provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
          })]
        : [];

      const element = screenElementsLookup.get(instruction.screen)?.elements[instruction.element];
      const surfaceEdge = element
        ? (() => {
            const surfaceNodeId = graphIds.surface(instruction.screen, element.surface);
            return acc.nodes.has(surfaceNodeId)
              ? [createEdge({
                  kind: 'references',
                  from: stepNodeId,
                  to: surfaceNodeId,
                  provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
                })]
              : [];
          })()
        : [];

      const capNodeId = graphIds.capability.element(instruction.screen, instruction.element);
      const capEdge = acc.nodes.has(capNodeId)
        ? [createEdge({
            kind: 'uses',
            from: stepNodeId,
            to: capNodeId,
            provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
            payload: { capability: capabilityForInstruction(instruction) },
          })]
        : [];

      return [...elementEdge, ...surfaceEdge, ...capEdge];
    });
}

function stepTargetRefEdges(
  acc: GraphAccumulator,
  taskStep: { grounding?: { targetRefs?: readonly string[] } } | null,
  stepNodeId: string,
  stepContext: StepGraphContext,
  artifactPath: string,
): readonly GraphEdge[] {
  return (taskStep?.grounding?.targetRefs ?? []).flatMap((targetRef) => {
    const targetNodeId = graphIds.target(targetRef);
    const targetEdge = acc.nodes.has(targetNodeId)
      ? [createEdge({
          kind: 'uses',
          from: stepNodeId,
          to: targetNodeId,
          provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
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
                from: stepNodeId,
                to: legacyNodeId,
                provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
                payload: { source: 'task-grounding' },
              })]
            : [];
        })()
      : [];

    return [...targetEdge, ...legacyEdge];
  });
}

function graphFromSingleStep(
  acc: GraphAccumulator,
  step: Scenario['steps'][number],
  scenario: Scenario,
  artifactPath: string,
  scenarioNodeId: string,
  lookups: GraphLookups,
  sharedPatternsArtifacts: ReadonlyArray<SharedPatternsArtifact>,
): GraphAccumulator {
  const boundScenario = lookups.boundScenarios.get(scenario.source.ado_id) ?? null;
  const surface = lookups.interpretationSurfaces.get(scenario.source.ado_id) ?? null;
  const latestRun = lookups.runRecords.get(scenario.source.ado_id) ?? null;
  const explanationByStepIndex = new Map(
    (boundScenario ? explainBoundScenario(boundScenario, 'normal', latestRun).steps : []).map((s) => [s.index, s] as const),
  );

  const boundStep = boundScenario?.steps.find((candidate) => candidate.index === step.index) ?? null;
  const explanation = explanationByStepIndex.get(step.index);
  const stepContext: StepGraphContext = { step, boundStep };
  const taskStep = surface?.payload.steps.find((candidate) => candidate.index === step.index) ?? null;
  const stepNodeId = graphIds.step(scenario.source.ado_id, step.index);
  const program = explanation?.program ?? compileStepProgram(step);
  const trace = traceStepProgram(program);
  const binding = stepBinding(stepContext);

  const stepNode = createNode({
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

  const stepAcc = withEdge(withNode(acc, stepNode), containsEdge);

  const screenEdges = trace.screens
    .filter((screenId) => stepAcc.nodes.has(graphIds.screen(screenId)))
    .map((screenId) => createEdge({
      kind: 'references',
      from: stepNodeId,
      to: graphIds.screen(screenId),
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
    }));

  const taskPacketScreenEdges = taskStep
    ? (surface?.payload.knowledgeSlice.screenRefs ?? [])
        .filter((screenId) => stepAcc.nodes.has(graphIds.screen(screenId)))
        .map((screenId) => createEdge({
          kind: 'references',
          from: stepNodeId,
          to: graphIds.screen(screenId),
          provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
          payload: { source: 'task-packet-screen' },
        }))
    : [];

  const targetRefEdges = taskStep
    ? stepTargetRefEdges(stepAcc, taskStep, stepNodeId, stepContext, artifactPath)
    : [];

  const instrEdges = stepInstructionEdges(stepAcc, program, stepNodeId, stepContext, artifactPath, lookups.screenElements);

  const snapshotEdges = trace.snapshotTemplates
    .filter((tmpl) => stepAcc.nodes.has(graphIds.snapshot.knowledge(tmpl)))
    .map((tmpl) => createEdge({
      kind: 'asserts',
      from: stepNodeId,
      to: graphIds.snapshot.knowledge(tmpl),
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
    }));

  const knowledgeRefEdges = (binding?.knowledgeRefs ?? [])
    .map((ref) => ({ ref, targetNodeId: mapKnowledgePathToNodeId(ref, stepContext) }))
    .filter((r): r is { ref: string; targetNodeId: string } => r.targetNodeId !== null && stepAcc.nodes.has(r.targetNodeId!))
    .map(({ ref, targetNodeId }) => createEdge({
      kind: 'references',
      from: stepNodeId,
      to: targetNodeId,
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
      payload: { source: 'knowledge-ref', ref },
    }));

  const supplementNodeIds = new Set([
    ...(binding?.supplementRefs ?? [])
      .map((ref) => mapKnowledgePathToNodeId(ref, stepContext))
      .filter((id): id is string => id !== null),
    ...patternIdsForStep(stepContext, sharedPatternsArtifacts),
  ]);
  const supplementEdges = [...supplementNodeIds]
    .filter((targetNodeId) => stepAcc.nodes.has(targetNodeId))
    .map((targetNodeId) => createEdge({
      kind: 'references',
      from: stepNodeId,
      to: targetNodeId,
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
      payload: { source: 'supplement-ref' },
    }));

  const evidenceRefEdges = (binding?.evidenceIds ?? [])
    .filter((evidenceId) => stepAcc.nodes.has(graphIds.evidence(evidenceId)))
    .map((evidenceId) => createEdge({
      kind: 'references',
      from: stepNodeId,
      to: graphIds.evidence(evidenceId),
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
      payload: { source: 'evidence-ref' },
    }));

  const overlayRefEdges = (explanation?.overlayRefs ?? [])
    .filter((overlayRef) => stepAcc.nodes.has(graphIds.confidenceOverlay(overlayRef)))
    .map((overlayRef) => createEdge({
      kind: 'references',
      from: stepNodeId,
      to: graphIds.confidenceOverlay(overlayRef),
      provenance: { confidence: stepConfidence(stepContext), scenarioPath: artifactPath },
      payload: { source: 'approved-equivalent-overlay' },
    }));

  return withItems(stepAcc, {
    nodes: [],
    edges: [
      ...screenEdges,
      ...taskPacketScreenEdges,
      ...targetRefEdges,
      ...instrEdges,
      ...snapshotEdges,
      ...knowledgeRefEdges,
      ...supplementEdges,
      ...evidenceRefEdges,
      ...overlayRefEdges,
    ],
  });
}

function graphFromScenarios(
  acc: GraphAccumulator,
  scenarios: ReadonlyArray<ScenarioGraphArtifact>,
  lookups: GraphLookups,
  sharedPatternsArtifacts: ReadonlyArray<SharedPatternsArtifact>,
): GraphAccumulator {
  return scenarios.reduce<GraphAccumulator>(
    (outerAcc, scenarioArtifact) => {
      const { artifact: scenario, artifactPath, generatedSpecPath, generatedSpecExists, generatedTracePath, generatedTraceExists, generatedReviewPath, generatedReviewExists } = scenarioArtifact;
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
      const withScenarioNode = withNode(outerAcc, scenarioNode);

      const adoSnapshotId = graphIds.snapshot.ado(scenario.source.ado_id);
      const withDerivedEdge = withScenarioNode.nodes.has(adoSnapshotId)
        ? withEdge(withScenarioNode, createEdge({
            kind: 'derived-from',
            from: scenarioNodeId,
            to: adoSnapshotId,
            provenance: {
              contentHash: scenario.source.content_hash,
              scenarioPath: artifactPath,
              sourceRevision: scenario.source.revision,
            },
          }))
        : withScenarioNode;

      const generatedArtifacts = [
        { id: graphIds.generatedSpec(scenario.source.ado_id), kind: 'generated-spec' as const, label: basename(generatedSpecPath), artifactPath: generatedSpecPath, exists: generatedSpecExists },
        { id: graphIds.generatedTrace(scenario.source.ado_id), kind: 'generated-trace' as const, label: basename(generatedTracePath), artifactPath: generatedTracePath, exists: generatedTraceExists },
        { id: graphIds.generatedReview(scenario.source.ado_id), kind: 'generated-review' as const, label: basename(generatedReviewPath), artifactPath: generatedReviewPath, exists: generatedReviewExists },
      ];
      const generatedNodes = generatedArtifacts.map((ga) => createNode({
        id: ga.id,
        kind: ga.kind,
        label: ga.label,
        artifactPath: ga.artifactPath,
        provenance: { scenarioPath: artifactPath },
        payload: { exists: ga.exists },
      }));
      const generatedEdges = generatedArtifacts.map((ga) => createEdge({
        kind: 'emits',
        from: scenarioNodeId,
        to: ga.id,
        provenance: { scenarioPath: artifactPath },
      }));
      const withGenerated = withItems(withDerivedEdge, { nodes: generatedNodes, edges: generatedEdges });

      return scenario.steps.reduce<GraphAccumulator>(
        (stepAcc, step) => graphFromSingleStep(stepAcc, step, scenario, artifactPath, scenarioNodeId, lookups, sharedPatternsArtifacts),
        withGenerated,
      );
    },
    acc,
  );
}

function graphFromPolicyDecisions(
  acc: GraphAccumulator,
  policyDecisions: ReadonlyArray<PolicyDecisionArtifact>,
): GraphAccumulator {
  return policyDecisions.reduce<GraphAccumulator>(
    (phaseAcc, policyDecision) => {
      const decisionNodeId = graphIds.policyDecision(policyDecision.id);
      const nodeAcc = withNode(phaseAcc, createNode({
        id: decisionNodeId,
        kind: 'policy-decision',
        label: `${policyDecision.decision}: ${basename(policyDecision.artifactPath)}`,
        artifactPath: policyDecision.artifactPath,
        provenance: { knowledgePath: policyDecision.artifactPath },
        payload: { decision: policyDecision.decision, reasons: policyDecision.reasons },
      }));
      return nodeAcc.nodes.has(policyDecision.targetNodeId)
        ? withEdge(nodeAcc, createEdge({
            kind: 'governs',
            from: decisionNodeId,
            to: policyDecision.targetNodeId,
            provenance: { knowledgePath: policyDecision.artifactPath },
            payload: { decision: policyDecision.decision },
          }))
        : nodeAcc;
    },
    acc,
  );
}

function graphFromDrift(
  acc: GraphAccumulator,
  driftRecords: ReadonlyArray<ArtifactEnvelope<InterpretationDriftRecord>>,
): GraphAccumulator {
  return driftRecords.reduce<GraphAccumulator>(
    (outerAcc, { artifact: drift }) => {
      const changedSteps = drift.steps.filter((step) => step.changed);
      return changedSteps.reduce<GraphAccumulator>(
        (stepAcc, step) => {
          const stepNodeId = graphIds.step(drift.adoId, step.stepIndex);
          return stepAcc.nodes.has(stepNodeId)
            ? withEdge(stepAcc, createEdge({
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
              }))
            : stepAcc;
        },
        outerAcc,
      );
    },
    acc,
  );
}

function graphFromEvidence(
  acc: GraphAccumulator,
  evidence: ReadonlyArray<EvidenceArtifact>,
): GraphAccumulator {
  return evidence.reduce<GraphAccumulator>(
    (phaseAcc, evidenceArtifact) => {
      const evidenceNodeId = graphIds.evidence(evidenceArtifact.artifactPath);
      const nodeAcc = withNode(phaseAcc, createNode({
        id: evidenceNodeId,
        kind: 'evidence',
        label: basename(evidenceArtifact.artifactPath),
        artifactPath: evidenceArtifact.artifactPath,
        provenance: { knowledgePath: evidenceArtifact.artifactPath },
      }));
      return evidenceArtifact.targetNodeId && nodeAcc.nodes.has(evidenceArtifact.targetNodeId)
        ? withEdge(nodeAcc, createEdge({
            kind: 'proposed-change-for',
            from: evidenceNodeId,
            to: evidenceArtifact.targetNodeId,
            provenance: { knowledgePath: evidenceArtifact.artifactPath },
          }))
        : nodeAcc;
    },
    acc,
  );
}

function graphFromScreenElements(
  screenElementArtifacts: ReadonlyArray<ArtifactEnvelope<ScreenElements>>,
  surfaceGraphLookup: ReadonlyMap<ScreenId, SurfaceGraph>,
): GraphAccumulator {
  return screenElementArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: elements, artifactPath }) => {
      const elementsAcc = Object.entries(elements.elements).reduce<GraphAccumulator>(
        (a, [elementKey, element]) => {
          const elementId = createElementId(elementKey);
          const elementNodeId = graphIds.element(elements.screen, elementId);
          return withEdge(
            withNode(a, createNode({
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
            })),
            createEdge({
              kind: 'contains',
              from: graphIds.surface(elements.screen, element.surface),
              to: elementNodeId,
              provenance: { knowledgePath: artifactPath },
            }),
          );
        },
        acc,
      );

      const surfaceGraph = surfaceGraphLookup.get(elements.screen);
      return surfaceGraph
        ? deriveCapabilities(surfaceGraph, elements).reduce<GraphAccumulator>(
            (a, capability) =>
              withEdge(
                withNode(a, createNode({
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
                })),
                createEdge({
                  kind: 'contains',
                  from: capabilityTargetNodeId(elements.screen, capability),
                  to: capability.id,
                  provenance: capability.provenance,
                }),
              ),
            elementsAcc,
          )
        : elementsAcc;
    },
    EMPTY_GRAPH,
  );
}

function graphFromScreenPostures(
  acc: GraphAccumulator,
  screenPostureArtifacts: ReadonlyArray<ArtifactEnvelope<ScreenPostures>>,
  surfaceGraphLookup: ReadonlyMap<ScreenId, SurfaceGraph>,
): GraphAccumulator {
  return screenPostureArtifacts.reduce<GraphAccumulator>(
    (outerAcc, { artifact: postures, artifactPath }) => {
      const surfaceGraph = surfaceGraphLookup.get(postures.screen);
      return Object.entries(postures.postures).reduce<GraphAccumulator>(
        (elemAcc, [elementKey, postureSet]) => {
          const elementId = createElementId(elementKey);
          return Object.entries(postureSet).reduce<GraphAccumulator>(
            (postAcc, [postureKey, posture]) => {
              const postureId = createPostureId(postureKey);
              const postureNodeId = graphIds.posture(postures.screen, elementId, postureId);
              const withPosture = withEdge(
                withNode(postAcc, createNode({
                  id: postureNodeId,
                  kind: 'posture',
                  label: postureId,
                  artifactPath,
                  provenance: { knowledgePath: artifactPath },
                  payload: { values: posture.values },
                })),
                createEdge({
                  kind: 'contains',
                  from: graphIds.element(postures.screen, elementId),
                  to: postureNodeId,
                  provenance: { knowledgePath: artifactPath },
                }),
              );
              return posture.effects.reduce<GraphAccumulator>(
                (effAcc, effect) => {
                  if (effect.target === 'self' || effect.targetKind === 'self') {
                    return withEdge(effAcc, createEdge({
                      kind: 'affects',
                      from: postureNodeId,
                      to: graphIds.element(postures.screen, elementId),
                      provenance: { knowledgePath: artifactPath },
                      payload: { state: effect.state, message: effect.message ?? null },
                    }));
                  }
                  const targetKind = effect.targetKind ?? (surfaceGraph?.surfaces[effect.target] ? 'surface' : 'element');
                  const targetNodeId = targetKind === 'surface'
                    ? graphIds.surface(postures.screen, effect.target as ReturnType<typeof createSurfaceId>)
                    : graphIds.element(postures.screen, effect.target as ReturnType<typeof createElementId>);
                  return effAcc.nodes.has(targetNodeId)
                    ? withEdge(effAcc, createEdge({
                        kind: 'affects',
                        from: postureNodeId,
                        to: targetNodeId,
                        provenance: { knowledgePath: artifactPath },
                        payload: { state: effect.state, message: effect.message ?? null },
                      }))
                    : effAcc;
                },
                withPosture,
              );
            },
            elemAcc,
          );
        },
        outerAcc,
      );
    },
    acc,
  );
}

function graphFromSharedPatterns(sharedPatternsArtifacts: ReadonlyArray<SharedPatternsArtifact>): GraphAccumulator {
  return sharedPatternsArtifacts.reduce<GraphAccumulator>(
    (acc, { artifact: patterns, artifactPath }) => {
      const rootId = patternFileNodeId(artifactPath);
      const rootAcc = withNode(acc, createNode({
        id: rootId,
        kind: 'pattern',
        label: basename(artifactPath),
        artifactPath,
        provenance: { knowledgePath: artifactPath },
        payload: { category: 'registry', version: patterns.version },
      }));

      const actionAcc = Object.entries(patterns.actions ?? {}).reduce<GraphAccumulator>(
        (a, [actionKey, descriptor]) => {
          const actionNodeId = graphIds.pattern(descriptor.id);
          return withEdge(
            withNode(a, createNode({
              id: actionNodeId,
              kind: 'pattern',
              label: descriptor.id,
              artifactPath,
              provenance: { knowledgePath: artifactPath },
              payload: { category: 'action', action: actionKey, aliases: descriptor.aliases },
            })),
            createEdge({
              kind: 'contains',
              from: rootId,
              to: actionNodeId,
              provenance: { knowledgePath: artifactPath },
            }),
          );
        },
        rootAcc,
      );

      return Object.entries(patterns.postures ?? {}).reduce<GraphAccumulator>(
        (a, [postureKey, descriptor]) => {
          const posturePatternNodeId = graphIds.pattern(descriptor.id);
          return withEdge(
            withNode(a, createNode({
              id: posturePatternNodeId,
              kind: 'pattern',
              label: descriptor.id,
              artifactPath,
              provenance: { knowledgePath: artifactPath },
              payload: { category: 'posture', posture: postureKey, aliases: descriptor.aliases },
            })),
            createEdge({
              kind: 'contains',
              from: rootId,
              to: posturePatternNodeId,
              provenance: { knowledgePath: artifactPath },
            }),
          );
        },
        actionAcc,
      );
    },
    EMPTY_GRAPH,
  );
}

function buildLookups(input: GraphBuildInput): GraphLookups {
  return {
    interpretationSurfaces: new Map((input.interpretationSurfaces ?? []).map((entry) => [entry.artifact.payload.adoId, entry.artifact] as const)),
    runRecords: new Map(
      [...(input.runRecords ?? [])]
        .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))
        .map((entry) => [entry.artifact.adoId, entry.artifact] as const),
    ),
    surfaceGraphs: new Map(input.surfaceGraphs.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenElements: new Map(input.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    boundScenarios: new Map((input.boundScenarios ?? []).map((entry) => [entry.artifact.source.ado_id, entry.artifact] as const)),
  };
}

export function deriveGraph(input: GraphBuildInput): DerivedGraph {
  const lookups = buildLookups(input);
  const sharedPatternsArtifacts = input.sharedPatterns ?? [];
  const driftRecords = [...(input.interpretationDriftRecords ?? [])].sort((left, right) => right.artifact.comparedAt.localeCompare(left.artifact.comparedAt));

  // Independent phases — no nodes.has() dependencies
  const independent = [
    graphFromSnapshots(input.snapshots),
    graphFromSurfaceGraphs(input.surfaceGraphs),
    graphFromKnowledgeSnapshots(input.knowledgeSnapshots),
    graphFromScreenElements(input.screenElements, lookups.surfaceGraphs),
    graphFromSharedPatterns(sharedPatternsArtifacts),
    graphFromDatasets(input.datasets ?? []),
    graphFromResolutionControls(input.resolutionControls ?? []),
    graphFromRunbooks(input.runbooks ?? []),
  ].reduce(withAll, EMPTY_GRAPH);

  // Dependent phases — threaded sequentially for nodes.has() checks
  const withPostures = graphFromScreenPostures(independent, input.screenPostures, lookups.surfaceGraphs);
  const withHints = graphFromScreenHints(withPostures, input.screenHints ?? []);
  const withOverlays = graphFromConfidenceOverlays(withHints, input.confidenceOverlays ?? []);
  const withScenarios = graphFromScenarios(withOverlays, input.scenarios, lookups, sharedPatternsArtifacts);
  const withPolicy = graphFromPolicyDecisions(withScenarios, input.policyDecisions ?? []);
  const withDrift = graphFromDrift(withPolicy, driftRecords);
  const final = graphFromEvidence(withDrift, input.evidence);

  return sortGraph({
    version: 'v1',
    nodes: [...final.nodes.values()],
    edges: [...final.edges.values()],
    resources: createResources(),
    resourceTemplates: createResourceTemplates(),
  });
}
