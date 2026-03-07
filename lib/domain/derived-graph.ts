import path from 'path';
import { deriveCapabilities } from './grammar';
import { createElementId, createPostureId, createSurfaceId, ScreenId, SnapshotTemplateId } from './identity';
import { capabilityForInstruction, compileStepProgram, traceStepProgram } from './program';
import { sha256, stableStringify } from './hash';
import { graphIds, mcpUris } from './ids';
import {
  AdoSnapshot,
  DerivedCapability,
  DerivedGraph,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  MappedMcpResource,
  MappedMcpTemplate,
  Scenario,
  ScreenElements,
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
}

export interface KnowledgeSnapshotArtifact {
  relativePath: SnapshotTemplateId;
  artifactPath: string;
}

export interface EvidenceArtifact {
  artifactPath: string;
  kind?: string;
  baselineSnapshotTemplate?: string;
  screen?: ScreenId;
  driftClasses?: string[];
  driftFingerprint?: string;
}

export interface GraphBuildInput {
  snapshots: ArtifactEnvelope<AdoSnapshot>[];
  surfaceGraphs: ArtifactEnvelope<SurfaceGraph>[];
  knowledgeSnapshots: KnowledgeSnapshotArtifact[];
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenPostures: ArtifactEnvelope<ScreenPostures>[];
  scenarios: ScenarioGraphArtifact[];
  evidence: EvidenceArtifact[];
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

export function deriveGraph(input: GraphBuildInput): DerivedGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const surfaceGraphs = new Map(input.surfaceGraphs.map((entry) => [entry.artifact.screen, entry.artifact] as const));
  const screenElements = new Map(input.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const));

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
      label: path.basename(knowledgeSnapshot.artifactPath),
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

  for (const scenarioArtifact of input.scenarios) {
    const { artifact: scenario, artifactPath, generatedSpecPath, generatedSpecExists } = scenarioArtifact;
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

    const generatedSpecId = graphIds.generatedSpec(scenario.source.ado_id);
    addNode(nodes, createNode({
      id: generatedSpecId,
      kind: 'generated-spec',
      label: path.basename(generatedSpecPath),
      artifactPath: generatedSpecPath,
      provenance: {
        scenarioPath: artifactPath,
      },
      payload: {
        exists: generatedSpecExists,
      },
    }));
    addEdge(edges, createEdge({
      kind: 'emits',
      from: scenarioNodeId,
      to: generatedSpecId,
      provenance: {
        scenarioPath: artifactPath,
      },
    }));

    for (const step of scenario.steps) {
      const stepNodeId = graphIds.step(scenario.source.ado_id, step.index);
      const program = compileStepProgram(step);
      const trace = traceStepProgram(program);
      addNode(nodes, createNode({
        id: stepNodeId,
        kind: 'step',
        label: step.intent,
        artifactPath,
        provenance: {
          confidence: step.confidence,
          contentHash: scenario.source.content_hash,
          scenarioPath: artifactPath,
          sourceRevision: scenario.source.revision,
        },
        payload: {
          action: step.action,
          instructionKinds: trace.instructionKinds,
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
            confidence: step.confidence,
            scenarioPath: artifactPath,
          },
        }));
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
                confidence: step.confidence,
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
                  confidence: step.confidence,
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
                confidence: step.confidence,
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
              confidence: step.confidence,
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
            confidence: step.confidence,
            scenarioPath: artifactPath,
          },
        }));
      }
    }
  }

  for (const evidenceArtifact of input.evidence) {
    const evidenceNodeId = graphIds.evidence(evidenceArtifact.artifactPath);
    addNode(nodes, createNode({
      id: evidenceNodeId,
      kind: 'evidence',
      label: path.basename(evidenceArtifact.artifactPath),
      artifactPath: evidenceArtifact.artifactPath,
      provenance: {
        knowledgePath: evidenceArtifact.artifactPath,
      },
      payload: {
        kind: evidenceArtifact.kind ?? 'evidence',
        baselineSnapshotTemplate: evidenceArtifact.baselineSnapshotTemplate ?? null,
        driftClasses: evidenceArtifact.driftClasses ?? [],
      },
    }));
    if (evidenceArtifact.baselineSnapshotTemplate) {
      const snapshotNodeId = graphIds.snapshot.knowledge(evidenceArtifact.baselineSnapshotTemplate);
      if (nodes.has(snapshotNodeId)) {
        addEdge(edges, createEdge({
          kind: 'derived-from',
          from: evidenceNodeId,
          to: snapshotNodeId,
          provenance: {
            knowledgePath: evidenceArtifact.artifactPath,
          },
        }));
      }
    }

    if (evidenceArtifact.screen) {
      const screenNodeId = graphIds.screen(evidenceArtifact.screen);
      if (nodes.has(screenNodeId)) {
        addEdge(edges, createEdge({
          kind: 'references',
          from: evidenceNodeId,
          to: screenNodeId,
          provenance: {
            knowledgePath: evidenceArtifact.artifactPath,
          },
        }));
      }

      const screenElementsArtifact = screenElements.get(evidenceArtifact.screen);
      if (screenElementsArtifact) {
        for (const [elementKey] of Object.entries(screenElementsArtifact.elements)) {
          const elementNodeId = graphIds.element(evidenceArtifact.screen, createElementId(elementKey));
          if (nodes.has(elementNodeId)) {
            addEdge(edges, createEdge({
              kind: 'affects',
              from: evidenceNodeId,
              to: elementNodeId,
              provenance: {
                knowledgePath: evidenceArtifact.artifactPath,
              },
            }));
          }
        }
      }

      const surfaceGraph = surfaceGraphs.get(evidenceArtifact.screen);
      if (surfaceGraph) {
        for (const [surfaceKey] of Object.entries(surfaceGraph.surfaces)) {
          const surfaceNodeId = graphIds.surface(evidenceArtifact.screen, createSurfaceId(surfaceKey));
          if (nodes.has(surfaceNodeId)) {
            addEdge(edges, createEdge({
              kind: 'affects',
              from: evidenceNodeId,
              to: surfaceNodeId,
              provenance: {
                knowledgePath: evidenceArtifact.artifactPath,
              },
            }));
          }
        }
      }
    }

    if (evidenceArtifact.baselineSnapshotTemplate) {
      for (const scenarioArtifact of input.scenarios) {
        const referenced = scenarioArtifact.artifact.steps.some((step) => step.snapshot_template === evidenceArtifact.baselineSnapshotTemplate);
        if (referenced) {
          addEdge(edges, createEdge({
            kind: 'affects',
            from: evidenceNodeId,
            to: graphIds.scenario(scenarioArtifact.artifact.source.ado_id),
            provenance: {
              scenarioPath: scenarioArtifact.artifactPath,
              knowledgePath: evidenceArtifact.artifactPath,
            },
          }));
        }
      }
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

