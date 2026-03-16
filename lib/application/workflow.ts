import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { loadWorkspaceCatalog } from './catalog';
import { findRunbook, runtimeControlsForScenario } from './controls';
import { buildOperatorInboxItems, operatorInboxItemsForScenario } from './operator';
import { buildWorkflowHotspots } from './hotspots';
import type { ProjectPaths } from './paths';

const laneMap = [
  {
    lane: 'intent',
    owns: ['.ado-sync/', 'scenarios/'],
    precedence: ['scenario explicit fields'],
  },
  {
    lane: 'knowledge',
    owns: ['knowledge/surfaces/', 'knowledge/screens/', 'knowledge/patterns/', 'knowledge/snapshots/'],
    precedence: ['approved knowledge priors', 'approved-equivalent overlays', 'locator ladders', 'widget affordances'],
  },
  {
    lane: 'control',
    owns: ['controls/datasets/', 'controls/resolution/', 'controls/runbooks/'],
    precedence: ['CLI selection', 'runbook selection', 'dataset defaults', 'resolution controls'],
  },
  {
    lane: 'resolution',
    owns: ['.tesseract/tasks/', '.tesseract/runs/*/interpretation.json'],
    precedence: ['scenario explicit', 'resolution control', 'approved knowledge priors', 'approved-equivalent overlays', 'structured translation', 'live DOM'],
  },
  {
    lane: 'execution',
    owns: ['.tesseract/runs/*/execution.json', '.tesseract/runs/*/run.json'],
    precedence: ['resolved program', 'runtime widget/locator strategy'],
  },
  {
    lane: 'governance/projection',
    owns: ['generated/', '.tesseract/graph/', '.tesseract/policy/'],
    precedence: ['trust policy', 'review-required proposals', 'projection fingerprints'],
  },
] as const;

export function inspectWorkflow(options: { paths: ProjectPaths; adoId?: AdoId | undefined; runbookName?: string | undefined }) {
  return Effect.gen(function* () {
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const scenario = options.adoId
      ? (catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId) ?? null)
      : null;
    const runbook = findRunbook(catalog, {
      runbookName: options.runbookName ?? null,
      scenario: scenario?.artifact ?? null,
    });
    const controls = scenario ? runtimeControlsForScenario(catalog, scenario.artifact) : null;
    const inboxItems = scenario ? operatorInboxItemsForScenario(buildOperatorInboxItems(catalog), scenario.artifact.source.ado_id) : [];

    const rerunPlans = catalog.rerunPlans
      .map((entry) => entry.artifact)
      .filter((plan) => !scenario || plan.impactedScenarioIds.includes(scenario.artifact.source.ado_id));

    const hotspots = buildWorkflowHotspots(
      catalog.runRecords.map((entry) => entry.artifact),
      catalog.interpretationDriftRecords.map((entry) => entry.artifact),
      catalog.resolutionGraphRecords.map((entry) => entry.artifact),
    )
      .filter((entry) => !scenario || entry.samples.some((sample) => sample.adoId === scenario.artifact.source.ado_id));

    return {
      lanes: laneMap,
      selection: {
        adoId: options.adoId ?? null,
        runbook: runbook?.name ?? null,
      },
      scenario: scenario ? {
        title: scenario.artifact.metadata.title,
        suite: scenario.artifact.metadata.suite,
        tags: scenario.artifact.metadata.tags,
        contentHash: scenario.artifact.source.content_hash,
      } : null,
      controls: controls ? {
        datasets: controls.datasets.map((entry) => ({
          name: entry.name,
          artifactPath: entry.artifactPath,
          isDefault: entry.isDefault,
          elementDefaultCount: Object.keys(entry.elementDefaults).length,
        })),
        resolutionControls: controls.resolutionControls.map((entry) => ({
          name: entry.name,
          artifactPath: entry.artifactPath,
          stepIndex: entry.stepIndex,
        })),
        runbooks: controls.runbooks.map((entry) => ({
          name: entry.name,
          artifactPath: entry.artifactPath,
          isDefault: entry.isDefault,
          dataset: entry.dataset ?? null,
          resolutionControl: entry.resolutionControl ?? null,
        })),
      } : {
        datasets: catalog.datasets.map((entry) => ({
          name: entry.artifact.name,
          artifactPath: entry.artifactPath,
          isDefault: Boolean(entry.artifact.default),
          elementDefaultCount: Object.keys(entry.artifact.defaults?.elements ?? {}).length,
        })),
        resolutionControls: catalog.resolutionControls.map((entry) => ({
          name: entry.artifact.name,
          artifactPath: entry.artifactPath,
          stepIndexCount: entry.artifact.steps.length,
        })),
        runbooks: catalog.runbooks.map((entry) => ({
          name: entry.artifact.name,
          artifactPath: entry.artifactPath,
          isDefault: Boolean(entry.artifact.default),
          dataset: entry.artifact.dataset ?? null,
          resolutionControl: entry.artifact.resolutionControl ?? null,
        })),
      },
      inbox: {
        itemCount: inboxItems.length,
        items: inboxItems.map((item) => ({
          id: item.id,
          kind: item.kind,
          status: item.status,
          proposalId: item.proposalId ?? null,
          winningConcern: item.winningConcern ?? null,
          winningSource: item.winningSource ?? null,
          nextCommands: item.nextCommands,
        })),
      },
      hotspots: hotspots.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        screen: entry.screen,
        family: entry.family,
        occurrenceCount: entry.occurrenceCount,
        suggestions: entry.suggestions,
      })),
      reruns: rerunPlans.map((plan) => ({
        planId: plan.planId,
        reason: plan.reason,
        sourceProposalId: plan.sourceProposalId ?? null,
        impactedScenarioIds: plan.impactedScenarioIds,
        impactedRunbooks: plan.impactedRunbooks,
        impactedProjections: plan.impactedProjections,
        impactedConfidenceRecords: plan.impactedConfidenceRecords ?? [],
        selection: plan.selection,
      })),
      benchmarks: catalog.benchmarks.map((entry) => ({
        name: entry.artifact.name,
        artifactPath: entry.artifactPath,
        fieldCount: entry.artifact.fieldCatalog.length,
        flowCount: entry.artifact.flows.length,
        driftEventCount: entry.artifact.driftEvents.length,
      })),
      confidence: catalog.confidenceCatalog ? {
        artifactPath: catalog.confidenceCatalog.artifactPath,
        total: catalog.confidenceCatalog.artifact.summary.total,
        approvedEquivalentCount: catalog.confidenceCatalog.artifact.summary.approvedEquivalentCount,
        needsReviewCount: catalog.confidenceCatalog.artifact.summary.needsReviewCount,
      } : {
        artifactPath: null,
        total: 0,
        approvedEquivalentCount: 0,
        needsReviewCount: 0,
      },
      precedence: {
        resolution: ['scenario explicit', 'resolution controls', 'approved knowledge priors', 'approved-equivalent overlays', 'structured translation', 'live DOM', 'needs-human'],
        data: ['scenario explicit override', 'runbook dataset binding', 'dataset default', 'hint default value', 'posture sample', 'generated token'],
        runSelection: ['CLI flags', 'runbook', 'repo defaults'],
        runtime: ['locator ladder', 'widget affordance', 'live DOM degraded fallback'],
      },
      fingerprints: scenario ? {
        scenario: scenario.fingerprint,
        bound: catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === scenario.artifact.source.ado_id)?.fingerprint ?? null,
        task: catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === scenario.artifact.source.ado_id)?.fingerprint ?? null,
      } : null,
    };
  });
}
