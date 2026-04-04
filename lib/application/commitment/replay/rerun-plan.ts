import { Effect, Match, pipe } from 'effect';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from '../../catalog';
import { ensureDerivedGraph } from '../../graph/graph';
import { executeInterventionBatch } from '../../governance/intervention-kernel';
import { findProposalById } from '../../agency/operator';
import type { ProjectPaths } from '../../paths';
import { relativeProjectPath, rerunPlanPath } from '../../paths';
import { FileSystem } from '../../ports';
import { policyDecisionGraphTarget } from '../../governance/trust-policy';
import { TesseractError } from '../../../domain/kernel/errors';
import { sha256, stableStringify } from '../../../domain/kernel/hash';
import { graphIds, knowledgePaths } from '../../../domain/kernel/ids';
import type { AdoId } from '../../../domain/kernel/identity';
import { createAdoId } from '../../../domain/kernel/identity';
import type { Scenario } from '../../../domain/intent/types';
import type { GraphEdge, GraphNode } from '../../../domain/projection/types';
import type { RerunPlan, RunbookControl } from '../../../domain/resolution/types';
import { compareStrings, uniqueSorted } from '../../../domain/kernel/collections';
import type { ActionExecutionResult } from '../../governance/intervention-kernel';

interface SelectionExplanation {
  triggeringChange: string;
  dependencyPath: string[];
  requiredBecause: string;
  fingerprint: string;
}

function selectorMatchesScenario(
  selector: RunbookControl['selector'],
  scenario: Scenario,
): boolean {
  const matchesAdoId = selector.adoIds.length === 0 || selector.adoIds.includes(scenario.source.ado_id);
  const matchesSuite = selector.suites.length === 0 || selector.suites.some((suite) => scenario.metadata.suite.startsWith(suite));
  const matchesTags = selector.tags.length === 0 || selector.tags.some((tag) => scenario.metadata.tags.includes(tag));
  return matchesAdoId && matchesSuite && matchesTags;
}

function nodeLabel(node: GraphNode | undefined): string {
  if (!node) {
    return 'unknown-node';
  }
  return `${node.id} (${node.kind})`;
}

function scenarioNodeId(adoId: AdoId): string {
  return graphIds.scenario(adoId);
}

function overlayRecordIdFromNodeId(nodeId: string): string {
  return nodeId.replace(`${graphIds.confidenceOverlay('')}`, '').replace(/^:/, '');
}

const inwardKinds: ReadonlySet<string> = new Set(['derived-from', 'references', 'uses', 'learns-from', 'asserts', 'observed-by']);
const outwardKinds: ReadonlySet<string> = new Set(['emits', 'affects', 'proposed-change-for', 'governs']);

function dependentNodesForEdge(edge: GraphEdge, nodes: Map<string, GraphNode>, current: string): string[] {
  return pipe(
    Match.value(edge.kind as string),
    Match.when((k) => inwardKinds.has(k), () => edge.to === current ? [edge.from] : []),
    Match.when((k) => outwardKinds.has(k), () => edge.from === current ? [edge.to] : []),
    Match.when('contains', () => {
      const parent = nodes.get(edge.from);
      const child = nodes.get(edge.to);
      if (edge.to === current && parent?.kind === 'scenario' && child?.kind === 'step') {
        return [edge.from];
      }
      return [] as string[];
    }),
    Match.orElse(() => [] as string[]),
  );
}

/** Maximum nodes to visit during impact traversal to prevent runaway expansion. */
const MAX_IMPACT_NODES = 10_000;

/**
 * Build an adjacency index from edges for O(1) lookup of edges by node ID.
 * Avoids O(E) scan per frontier node during traversal.
 */
function buildEdgeIndex(edges: readonly GraphEdge[]): ReadonlyMap<string, readonly GraphEdge[]> {
  const index = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    // Index by both endpoints so dependentNodesForEdge can match on either
    for (const nodeId of [edge.from, edge.to]) {
      let list = index.get(nodeId);
      if (!list) {
        list = [];
        index.set(nodeId, list);
      }
      list.push(edge);
    }
  }
  return index;
}

function buildImpactPaths(graph: { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] }, sourceNodeId: string): Map<string, string[]> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const edgeIndex = buildEdgeIndex(graph.edges);

  // Iterative BFS with early termination at MAX_IMPACT_NODES
  const visited = new Map<string, string[]>([[sourceNodeId, [sourceNodeId]]]);
  const frontier: string[] = [sourceNodeId];

  while (frontier.length > 0 && visited.size < MAX_IMPACT_NODES) {
    const current = frontier.shift()!;
    const currentPath = visited.get(current);
    if (!currentPath) continue;

    // Use edge index for O(degree) lookup instead of O(E) full scan
    const relevantEdges = edgeIndex.get(current) ?? [];
    const dependents = uniqueSorted(
      relevantEdges.flatMap((edge) => dependentNodesForEdge(edge, nodesById, current)),
    );

    for (const dependent of dependents) {
      if (visited.has(dependent)) continue;
      visited.set(dependent, [...currentPath, dependent]);
      frontier.push(dependent);
    }
  }

  return visited;
}

function scenariosReferencingArtifact(catalog: WorkspaceCatalog, artifactPath: string): string[] {
  const matches = new Set<string>();

  for (const entry of catalog.boundScenarios) {
    if (entry.artifact.steps.some((step) =>
      step.binding.knowledgeRefs.includes(artifactPath)
      || step.binding.supplementRefs.includes(artifactPath),
    )) {
      matches.add(entry.artifact.source.ado_id);
    }
  }

  for (const entry of catalog.interpretationSurfaces) {
    const payload = entry.artifact.payload;
    const referencesKnowledgeScreen = payload.knowledgeSlice.screenRefs.some((screen) =>
      artifactPath === knowledgePaths.surface(screen)
      || artifactPath === knowledgePaths.elements(screen)
      || artifactPath === knowledgePaths.postures(screen)
      || artifactPath === knowledgePaths.hints(screen),
    );
    if (payload.knowledgeSlice.evidenceRefs.includes(artifactPath)
      || payload.knowledgeSlice.controlRefs.includes(artifactPath)
      || referencesKnowledgeScreen) {
      matches.add(payload.adoId);
    }
  }

  return uniqueSorted([...matches]);
}

function explanationFingerprint(explanation: Omit<SelectionExplanation, 'fingerprint'>): string {
  return sha256(stableStringify(explanation));
}

function finalizeExplanations(explanations: readonly Omit<SelectionExplanation, 'fingerprint'>[]): SelectionExplanation[] {
  return [...explanations]
    .map((entry) => ({
      ...entry,
      dependencyPath: uniqueSorted(entry.dependencyPath),
      fingerprint: explanationFingerprint(entry),
    }))
    .sort((left, right) => compareStrings(left.fingerprint, right.fingerprint));
}

function planRerunSelection(options: {
  catalog: WorkspaceCatalog;
  sourceNodeIds: string[];
  changedArtifactPaths: string[];
  changedNodeReasons: string[];
  reason: string;
  sourceProposalId?: string | null | undefined;
  proposalLineagePaths?: string[] | undefined;
}) {
  return Effect.gen(function* () {
    const graph = yield* ensureDerivedGraph({ paths: options.catalog.paths });
    const graphNodesById = new Map(graph.graph.nodes.map((node) => [node.id, node] as const));
    const sourceNodeIds = uniqueSorted(options.sourceNodeIds);
    const changedArtifactPaths = uniqueSorted([...options.changedArtifactPaths, ...(options.proposalLineagePaths ?? [])]);

    const scenarioExplanations = new Map<string, Array<Omit<SelectionExplanation, 'fingerprint'>>>();
    const confidenceReasons = new Map<string, Set<string>>();
    const scenarioReasonSummary = new Map<string, Set<string>>();

    for (const sourceNodeId of sourceNodeIds) {
      const sourceLabel = nodeLabel(graphNodesById.get(sourceNodeId));
      const paths = buildImpactPaths(graph.graph, sourceNodeId);
      for (const [nodeId, dependencyPath] of paths.entries()) {
        const node = graphNodesById.get(nodeId);
        if (node?.kind === 'scenario') {
          const adoIdValue = node.id.split(':').at(-1) ?? '';
          if (adoIdValue.length === 0) {
            continue;
          }
          const adoId = createAdoId(adoIdValue);
          scenarioExplanations.set(adoId, [
            ...(scenarioExplanations.get(adoId) ?? []),
            {
              triggeringChange: `graph-node ${sourceLabel}`,
              dependencyPath,
              requiredBecause: 'Scenario is transitively dependent on changed lineage in .tesseract/graph/index.json.',
            },
          ]);

          const reasons = scenarioReasonSummary.get(adoId) ?? new Set<string>();
          reasons.add(`graph-lineage from ${sourceLabel}`);
          scenarioReasonSummary.set(adoId, reasons);
        }

        if (node?.kind === 'confidence-overlay') {
          const overlayId = overlayRecordIdFromNodeId(node.id);
          const reasons = confidenceReasons.get(overlayId) ?? new Set<string>();
          reasons.add(`graph-lineage from ${sourceLabel}`);
          confidenceReasons.set(overlayId, reasons);
        }
      }
    }

    for (const changedArtifactPath of changedArtifactPaths) {
      for (const scenarioId of scenariosReferencingArtifact(options.catalog, changedArtifactPath)) {
        scenarioExplanations.set(scenarioId, [
          ...(scenarioExplanations.get(scenarioId) ?? []),
          {
            triggeringChange: `artifact ${changedArtifactPath}`,
            dependencyPath: [changedArtifactPath, scenarioNodeId(createAdoId(scenarioId))],
            requiredBecause: 'Scenario runtime/binding references the changed artifact or proposal lineage source.',
          },
        ]);

        const reasons = scenarioReasonSummary.get(scenarioId) ?? new Set<string>();
        reasons.add(`artifact-reference ${changedArtifactPath}`);
        scenarioReasonSummary.set(scenarioId, reasons);
      }

      const confidenceRecords = options.catalog.confidenceCatalog?.artifact.records ?? [];
      for (const record of confidenceRecords) {
        if (
          changedArtifactPath === options.catalog.paths.confidenceIndexPath
          || record.artifactPath === changedArtifactPath
          || record.lineage.sourceArtifactPaths.includes(changedArtifactPath)
          || record.lineage.evidenceIds.some((evidenceId) => evidenceId.includes(changedArtifactPath))
        ) {
          const reasons = confidenceReasons.get(record.id) ?? new Set<string>();
          reasons.add(
            changedArtifactPath === options.catalog.paths.confidenceIndexPath
              ? `overlay-catalog threshold/config changed at ${changedArtifactPath}`
              : `overlay-lineage depends on ${changedArtifactPath}`,
          );
          confidenceReasons.set(record.id, reasons);
        }
      }
    }

    const impactedScenarioIds = uniqueSorted([...scenarioExplanations.keys()].map((id) => createAdoId(id)));
    const impactedRunbooks = uniqueSorted(
      options.catalog.runbooks
        .flatMap((entry) => options.catalog.scenarios.some((scenarioEntry) =>
          impactedScenarioIds.includes(scenarioEntry.artifact.source.ado_id)
          && selectorMatchesScenario(entry.artifact.selector, scenarioEntry.artifact),
        ) ? [entry.artifact.name] : []),
    );
    const impactedConfidenceRecords = uniqueSorted([...confidenceReasons.keys()]);

    const impactedProjectionsSet = new Set<RerunPlan['impactedProjections'][number]>();
    if (sourceNodeIds.length > 0 || changedArtifactPaths.length > 0) {
      impactedProjectionsSet.add('graph');
    }
    if (impactedScenarioIds.length > 0) {
      impactedProjectionsSet.add('emit');
      impactedProjectionsSet.add('run');
      impactedProjectionsSet.add('types');
    }
    if (impactedConfidenceRecords.length > 0) {
      impactedProjectionsSet.add('run');
      impactedProjectionsSet.add('graph');
    }
    const impactedProjections = uniqueSorted([...impactedProjectionsSet]) as RerunPlan['impactedProjections'];

    const selection = {
      scenarios: impactedScenarioIds.map((adoId) => ({
        id: adoId,
        why: uniqueSorted([...(scenarioReasonSummary.get(adoId) ?? new Set<string>())]),
        explanations: finalizeExplanations(scenarioExplanations.get(adoId) ?? []),
      })),
      runbooks: impactedRunbooks.map((name) => {
        const runbook = options.catalog.runbooks.find((entry) => entry.artifact.name === name);
        const matchingScenarios = options.catalog.scenarios
          .flatMap((entry) =>
            impactedScenarioIds.includes(entry.artifact.source.ado_id)
            && (runbook ? selectorMatchesScenario(runbook.artifact.selector, entry.artifact) : false)
              ? [entry.artifact.source.ado_id] : [],
          );
        return {
          name,
          why: uniqueSorted(matchingScenarios.map((adoId) => `selected-by-scenario ${adoId}`)),
          explanations: finalizeExplanations(matchingScenarios.map((adoId) => ({
            triggeringChange: `scenario ${adoId}`,
            dependencyPath: [scenarioNodeId(adoId), graphIds.runbook(name)],
            requiredBecause: 'Runbook selector includes at least one impacted scenario; rerunning preserves control-lane determinism.',
          }))),
        };
      }),
      projections: impactedProjections.map((name) => ({
        name,
        why: name === 'graph'
          ? ['graph lineage/provenance needs refresh']
          : name === 'emit'
            ? ['scenario selection changed generated artifacts']
            : name === 'types'
              ? ['scenario selection changed generated type surfaces']
              : ['scenario or confidence-overlay execution dependencies changed'],
      })),
      confidenceRecords: impactedConfidenceRecords.map((id) => ({
        id,
        why: uniqueSorted([...(confidenceReasons.get(id) ?? new Set<string>())]),
      })),
    };

    const explanationFingerprintValue = sha256(stableStringify({
      scenarios: selection.scenarios.map((entry) => ({ id: entry.id, explanations: entry.explanations })),
      runbooks: selection.runbooks.map((entry) => ({ name: entry.name, explanations: entry.explanations })),
    }));

    const planId = `rerun-${sha256(stableStringify({
      sourceNodeIds,
      changedArtifactPaths,
      impactedScenarioIds,
      impactedRunbooks,
      impactedProjections,
      impactedConfidenceRecords,
      explanationFingerprintValue,
    })).slice(0, 12)}`;

    return {
      kind: 'rerun-plan',
      version: 1,
      planId,
      createdAt: new Date().toISOString(),
      reason: options.reason,
      sourceProposalId: options.sourceProposalId ?? null,
      sourceNodeIds,
      impactedScenarioIds: impactedScenarioIds as RerunPlan['impactedScenarioIds'],
      impactedRunbooks,
      impactedProjections,
      impactedConfidenceRecords,
      reasons: uniqueSorted([
        ...options.changedNodeReasons,
        impactedScenarioIds.length > 0
          ? `Impacted scenarios: ${impactedScenarioIds.join(', ')}`
          : 'No impacted scenarios were found.',
        impactedConfidenceRecords.length > 0
          ? `Impacted confidence overlays: ${impactedConfidenceRecords.join(', ')}`
          : 'No confidence overlays were impacted.',
      ]),
      explanationFingerprint: explanationFingerprintValue,
      selection,
    };
  });
}

export function buildRerunPlan(options: {
  paths: ProjectPaths;
  proposalId: string;
  reason?: string | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const located = yield* Effect.succeed(findProposalById(catalog, options.proposalId)).pipe(
      Effect.filterOrFail(
        (result): result is NonNullable<typeof result> => result != null,
        () => new TesseractError('proposal-not-found', `Unknown proposal ${options.proposalId}`),
      ),
    );

    const targetNodeId = policyDecisionGraphTarget({
      artifactType: located.proposal.artifactType,
      artifactPath: located.proposal.targetPath,
    });

    const proposalLineagePaths = uniqueSorted([
      ...located.bundle.lineage.sources,
      ...located.bundle.lineage.parents,
      ...located.proposal.evidenceIds,
    ]);

    const plan = yield* planRerunSelection({
      catalog,
      sourceNodeIds: [targetNodeId],
      changedArtifactPaths: [located.proposal.targetPath],
      changedNodeReasons: [`${located.proposal.targetPath} maps to graph node ${targetNodeId}`],
      reason: options.reason ?? `Proposal ${options.proposalId} changes ${located.proposal.targetPath}`,
      sourceProposalId: options.proposalId,
      proposalLineagePaths,
    });

    const outputPath = rerunPlanPath(options.paths, plan.planId);
    yield* fs.writeJson(outputPath, plan);

    return {
      plan,
      outputPath,
      proposal: located.proposal,
      artifactPath: located.artifactPath,
      relativeOutputPath: relativeProjectPath(options.paths, outputPath),
    };
  });
}

export function executeRerunScopeIntervention(options: {
  paths: ProjectPaths;
  proposalId: string;
  reason?: string | undefined;
}) {
  const now = () => new Date().toISOString();
  return executeInterventionBatch({
    batch: {
      batchId: `rerun-${options.proposalId}`,
      summary: `Build rerun plan for ${options.proposalId}.`,
      continueOnFailure: false,
      actions: [{
        actionId: `rerun:${options.proposalId}`,
        kind: 'rerun-scope',
        summary: `Build rerun plan for ${options.proposalId}`,
        governance: 'approved',
        target: { kind: 'run', ref: options.proposalId, label: `rerun-${options.proposalId}` },
        prerequisites: [],
        reversible: { reversible: false, rollbackCommand: null, rollbackRef: null },
        payload: { proposalId: options.proposalId },
      }],
    },
    paths: options.paths,
    now,
    kernel: {
      executeAction: () =>
        buildRerunPlan({
          paths: options.paths,
          proposalId: options.proposalId,
          reason: options.reason,
        }).pipe(
          Effect.map((result): ActionExecutionResult => ({
            summary: `Built rerun plan ${result.plan.planId}`,
            payload: { runOutcomes: [result.plan.planId] },
          })),
        ) as unknown as Effect.Effect<ActionExecutionResult, unknown>,
    },
  });
}

export const internalRerunPlan = {
  planRerunSelection,
};
