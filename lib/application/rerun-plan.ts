import { Effect } from 'effect';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import { ensureDerivedGraph } from './graph';
import { findProposalById } from './operator';
import type { ProjectPaths } from './paths';
import { relativeProjectPath, rerunPlanPath } from './paths';
import { FileSystem } from './ports';
import { policyDecisionGraphTarget } from './trust-policy';
import { sha256, stableStringify } from '../domain/hash';
import { collectImpactSubgraph } from '../domain/graph-query';
import { graphIds } from '../domain/ids';
import type { AdoId } from '../domain/identity';
import { createAdoId } from '../domain/identity';
import type { GraphNode, RerunPlan, RunbookControl, Scenario } from '../domain/types';
import { uniqueSorted } from '../domain/collections';

function selectorMatchesScenario(
  selector: RunbookControl['selector'],
  scenario: Scenario,
): boolean {
  const matchesAdoId = selector.adoIds.length === 0 || selector.adoIds.includes(scenario.source.ado_id);
  const matchesSuite = selector.suites.length === 0 || selector.suites.some((suite) => scenario.metadata.suite.startsWith(suite));
  const matchesTags = selector.tags.length === 0 || selector.tags.some((tag) => scenario.metadata.tags.includes(tag));
  return matchesAdoId && matchesSuite && matchesTags;
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

  for (const entry of catalog.taskPackets) {
    if (entry.artifact.steps.some((step) =>
      step.runtimeKnowledge.evidenceRefs.includes(artifactPath)
      || step.runtimeKnowledge.screens.some((screen) =>
        screen.knowledgeRefs.includes(artifactPath)
        || screen.supplementRefs.includes(artifactPath),
      ),
    )) {
      matches.add(entry.artifact.adoId);
    }
  }

  return uniqueSorted([...matches]);
}

function nodeLabel(node: GraphNode | undefined): string {
  if (!node) {
    return 'unknown-node';
  }
  return `${node.id} (${node.kind})`;
}

function scenarioIdsFromGraphNodes(nodes: readonly GraphNode[]): AdoId[] {
  return uniqueSorted(
    nodes
      .filter((node) => node.kind === 'scenario')
      .map((node) => node.id.split(':').pop() ?? '')
      .filter((value) => value.length > 0)
      .map((value) => createAdoId(value)),
  );
}

function planRerunSelection(options: {
  catalog: WorkspaceCatalog;
  sourceNodeIds: string[];
  changedArtifactPaths: string[];
  changedNodeReasons: string[];
  reason: string;
  sourceProposalId?: string | null | undefined;
}): Effect.Effect<RerunPlan, Error, FileSystem> {
  return Effect.gen(function* () {
    const graph = yield* ensureDerivedGraph({ paths: options.catalog.paths });
    const graphNodesById = new Map(graph.graph.nodes.map((node) => [node.id, node] as const));

    const impactedNodeIds = new Set<string>();
    const scenarioReasons = new Map<string, Set<string>>();
    const confidenceReasons = new Map<string, Set<string>>();

    for (const sourceNodeId of uniqueSorted(options.sourceNodeIds)) {
      const subgraph = collectImpactSubgraph(graph.graph, sourceNodeId);
      for (const node of subgraph.nodes) {
        impactedNodeIds.add(node.id);
      }

      const sourceLabel = nodeLabel(graphNodesById.get(sourceNodeId));
      for (const scenarioId of scenarioIdsFromGraphNodes(subgraph.nodes)) {
        const reasons = scenarioReasons.get(scenarioId) ?? new Set<string>();
        reasons.add(`graph-lineage from ${sourceLabel}`);
        scenarioReasons.set(scenarioId, reasons);
      }

      for (const node of subgraph.nodes) {
        if (node.kind === 'confidence-overlay') {
          const overlayId = node.id.replace(`${graphIds.confidenceOverlay('')}`, '').replace(/^:/, '');
          const reasons = confidenceReasons.get(overlayId) ?? new Set<string>();
          reasons.add(`graph-lineage from ${sourceLabel}`);
          confidenceReasons.set(overlayId, reasons);
        }
      }
    }

    for (const changedArtifactPath of uniqueSorted(options.changedArtifactPaths)) {
      for (const scenarioId of scenariosReferencingArtifact(options.catalog, changedArtifactPath)) {
        const reasons = scenarioReasons.get(scenarioId) ?? new Set<string>();
        reasons.add(`artifact-reference ${changedArtifactPath}`);
        scenarioReasons.set(scenarioId, reasons);
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

    const impactedScenarioIds = uniqueSorted([...scenarioReasons.keys()].map((id) => createAdoId(id)));
    const impactedRunbooks = uniqueSorted(
      options.catalog.runbooks
        .filter((entry) => options.catalog.scenarios.some((scenarioEntry) =>
          impactedScenarioIds.includes(scenarioEntry.artifact.source.ado_id)
          && selectorMatchesScenario(entry.artifact.selector, scenarioEntry.artifact),
        ))
        .map((entry) => entry.artifact.name),
    );
    const impactedConfidenceRecords = uniqueSorted([...confidenceReasons.keys()]);

    const impactedProjectionsSet = new Set<RerunPlan['impactedProjections'][number]>();
    if (options.sourceNodeIds.length > 0 || options.changedArtifactPaths.length > 0) {
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

    const planId = `rerun-${sha256(stableStringify({
      sourceNodeIds: uniqueSorted(options.sourceNodeIds),
      changedArtifactPaths: uniqueSorted(options.changedArtifactPaths),
      impactedScenarioIds,
      impactedRunbooks,
      impactedProjections,
      impactedConfidenceRecords,
    })).slice(0, 12)}`;

    const selection = {
      scenarios: impactedScenarioIds.map((adoId) => ({
        id: adoId,
        why: uniqueSorted([...(scenarioReasons.get(adoId) ?? new Set<string>())]),
      })),
      runbooks: impactedRunbooks.map((name) => ({
        name,
        why: uniqueSorted(
          options.catalog.scenarios
            .filter((entry) => impactedScenarioIds.includes(entry.artifact.source.ado_id))
            .filter((entry) => {
              const runbook = options.catalog.runbooks.find((candidate) => candidate.artifact.name === name);
              return runbook ? selectorMatchesScenario(runbook.artifact.selector, entry.artifact) : false;
            })
            .map((entry) => `selected-by-scenario ${entry.artifact.source.ado_id}`),
        ),
      })),
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

    return {
      kind: 'rerun-plan',
      version: 1,
      planId,
      createdAt: new Date().toISOString(),
      reason: options.reason,
      sourceProposalId: options.sourceProposalId ?? null,
      sourceNodeIds: uniqueSorted(options.sourceNodeIds),
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
    const located = findProposalById(catalog, options.proposalId);
    if (!located) {
      throw new Error(`Unknown proposal ${options.proposalId}`);
    }

    const targetNodeId = policyDecisionGraphTarget({
      artifactType: located.proposal.artifactType,
      artifactPath: located.proposal.targetPath,
    });

    const plan = yield* planRerunSelection({
      catalog,
      sourceNodeIds: [targetNodeId],
      changedArtifactPaths: [located.proposal.targetPath],
      changedNodeReasons: [`${located.proposal.targetPath} maps to graph node ${targetNodeId}`],
      reason: options.reason ?? `Proposal ${options.proposalId} changes ${located.proposal.targetPath}`,
      sourceProposalId: options.proposalId,
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

export const internalRerunPlan = {
  planRerunSelection,
};
