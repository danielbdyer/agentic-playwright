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
import type { RerunPlan, RunbookControl, Scenario } from '../domain/types';

function selectorMatchesScenario(
  selector: RunbookControl['selector'],
  scenario: Scenario,
): boolean {
  const matchesAdoId = selector.adoIds.length === 0 || selector.adoIds.includes(scenario.source.ado_id);
  const matchesSuite = selector.suites.length === 0 || selector.suites.some((suite) => scenario.metadata.suite.startsWith(suite));
  const matchesTags = selector.tags.length === 0 || selector.tags.some((tag) => scenario.metadata.tags.includes(tag));
  return matchesAdoId && matchesSuite && matchesTags;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
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
    const graph = yield* ensureDerivedGraph({ paths: options.paths });
    const subgraph = collectImpactSubgraph(graph.graph, targetNodeId);
    const graphImpactedScenarioIds = uniqueSorted(
      subgraph.nodes
        .filter((node) => node.kind === 'scenario')
        .map((node) => node.id.split(':').pop() ?? '')
        .filter((value) => value.length > 0),
    );
    const impactedScenarioIds = uniqueSorted([
      ...graphImpactedScenarioIds,
      ...scenariosReferencingArtifact(catalog, located.proposal.targetPath),
    ]);
    const impactedRunbooks = uniqueSorted(
      catalog.runbooks
        .filter((entry) => catalog.scenarios.some((scenarioEntry) =>
          impactedScenarioIds.includes(scenarioEntry.artifact.source.ado_id)
          && selectorMatchesScenario(entry.artifact.selector, scenarioEntry.artifact),
        ))
        .map((entry) => entry.artifact.name),
    );
    const impactedProjections = uniqueSorted([
      'emit',
      'graph',
      'types',
      ...(impactedScenarioIds.length > 0 ? ['run'] : []),
    ]) as RerunPlan['impactedProjections'];
    const planId = `rerun-${sha256(stableStringify({
      proposalId: options.proposalId,
      impactedScenarioIds,
      impactedRunbooks,
      impactedProjections,
    })).slice(0, 12)}`;
    const plan: RerunPlan = {
      kind: 'rerun-plan',
      version: 1,
      planId,
      createdAt: new Date().toISOString(),
      reason: options.reason ?? `Proposal ${options.proposalId} changes ${located.proposal.targetPath}`,
      sourceProposalId: options.proposalId,
      sourceNodeIds: [targetNodeId],
      impactedScenarioIds: impactedScenarioIds as RerunPlan['impactedScenarioIds'],
      impactedRunbooks,
      impactedProjections,
      reasons: [
        `${located.proposal.targetPath} maps to graph node ${targetNodeId}`,
        impactedScenarioIds.length > 0
          ? `Impacted scenarios: ${impactedScenarioIds.join(', ')}`
          : 'No impacted scenarios were found in the current graph.',
      ],
    };
    const outputPath = rerunPlanPath(options.paths, planId);
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
