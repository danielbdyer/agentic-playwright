import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { compareStrings, uniqueSorted } from '../domain/collections';
import { loadWorkspaceCatalog } from './catalog';
import { findRunbook, runtimeControlsForScenario } from './controls';
import { buildOperatorInboxItems, operatorInboxItemsForScenario } from './operator';
import { generatedReviewPath, generatedTracePath, relativeProjectPath } from './paths';
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
    const latestRun = scenario
      ? catalog.runRecords
        .filter((entry) => entry.artifact.adoId === scenario.artifact.source.ado_id)
        .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))[0]?.artifact ?? null
      : null;
    const proposalBundle = scenario
      ? catalog.proposalBundles
        .filter((entry) => entry.artifact.adoId === scenario.artifact.source.ado_id)
        .sort((left, right) => right.artifact.runId.localeCompare(left.artifact.runId))[0]?.artifact ?? null
      : null;
    const taskPacketEntry = scenario
      ? catalog.taskPackets.find((entry) => entry.artifact.adoId === scenario.artifact.source.ado_id) ?? null
      : null;

    const sharedViews = scenario ? [
      {
        scenarioId: scenario.artifact.source.ado_id,
        runId: latestRun?.runId ?? proposalBundle?.runId ?? null,
        resolutionMode: latestRun?.steps[0]?.interpretation.resolutionMode ?? null,
        winningSource: latestRun?.steps[0]?.interpretation.winningSource ?? null,
        lineage: {
          sources: uniqueSorted([
            scenario.artifactPath,
            ...controls?.datasets.map((entry) => entry.artifactPath) ?? [],
            ...controls?.resolutionControls.map((entry) => entry.artifactPath) ?? [],
            ...controls?.runbooks.map((entry) => entry.artifactPath) ?? [],
          ]),
          parents: uniqueSorted([
            catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === scenario.artifact.source.ado_id)?.fingerprint ?? '',
            catalog.taskPackets.find((entry) => entry.artifact.adoId === scenario.artifact.source.ado_id)?.fingerprint ?? '',
            latestRun?.fingerprints.run ?? '',
          ].filter((value) => value.length > 0)),
          handshakes: uniqueSorted([
            ...(latestRun?.lineage.handshakes ?? ['preparation', 'resolution', 'execution', 'projection']),
            'proposal',
          ]),
        },
        governance: latestRun?.governance ?? proposalBundle?.governance ?? 'approved',
        nextActions: uniqueSorted([
          `tesseract trace --ado-id ${scenario.artifact.source.ado_id}`,
          `tesseract workflow --ado-id ${scenario.artifact.source.ado_id}`,
          `tesseract inbox --ado-id ${scenario.artifact.source.ado_id}`,
          ...(proposalBundle?.proposals.length
            ? proposalBundle.proposals.flatMap((proposal) => [
                `tesseract approve --proposal-id ${proposal.proposalId}`,
                `tesseract rerun-plan --proposal-id ${proposal.proposalId}`,
              ])
            : ['tesseract inbox']),
        ]),
      },
    ] : [];

    const hotspotNavigation = latestRun
      ? latestRun.steps
        .map((step) => {
          const stepProposal = proposalBundle?.proposals.find((proposal) => proposal.stepIndex === step.stepIndex) ?? null;
          return {
            stepIndex: step.stepIndex,
            resolutionMode: step.interpretation.resolutionMode,
            winningSource: step.interpretation.winningSource,
            governance: step.execution.governance,
            evidenceIds: step.evidenceIds,
            commands: uniqueSorted([
              `tesseract workflow --ado-id ${latestRun.adoId}`,
              `tesseract trace --ado-id ${latestRun.adoId}`,
              ...(stepProposal
                ? [
                    `tesseract approve --proposal-id ${stepProposal.proposalId}`,
                    `tesseract rerun-plan --proposal-id ${stepProposal.proposalId}`,
                  ]
                : []),
            ]),
          };
        })
        .sort((left, right) => left.stepIndex - right.stepIndex)
      : [];

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
      projections: scenario ? {
        workflow: {
          kind: 'workflow-view',
          version: 1,
          stage: 'projection',
          scope: 'scenario',
          ids: {
            adoId: scenario.artifact.source.ado_id,
            suite: scenario.artifact.metadata.suite,
            runId: latestRun?.runId ?? null,
          },
          fingerprints: {
            artifact: scenario.fingerprint,
            content: scenario.artifact.source.content_hash,
            knowledge: taskPacketEntry?.artifact.knowledgeFingerprint ?? null,
            controls: controls?.runbooks[0]?.name ?? null,
            task: taskPacketEntry?.fingerprint ?? null,
            run: latestRun?.fingerprints.run ?? null,
          },
          lineage: sharedViews[0]?.lineage ?? { sources: [], parents: [], handshakes: [] },
          governance: sharedViews[0]?.governance ?? 'approved',
          payload: {
            path: `command:tesseract workflow --ado-id ${scenario.artifact.source.ado_id}`,
            hotspotNavigation,
          },
        },
        trace: {
          kind: 'generated-trace',
          version: 1,
          stage: 'projection',
          scope: 'scenario',
          ids: {
            adoId: scenario.artifact.source.ado_id,
            suite: scenario.artifact.metadata.suite,
            runId: latestRun?.runId ?? null,
          },
          fingerprints: {
            artifact: catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === scenario.artifact.source.ado_id)?.fingerprint ?? scenario.fingerprint,
            content: scenario.artifact.source.content_hash,
            knowledge: taskPacketEntry?.artifact.knowledgeFingerprint ?? null,
            controls: controls?.runbooks[0]?.name ?? null,
            task: taskPacketEntry?.fingerprint ?? null,
            run: latestRun?.fingerprints.run ?? null,
          },
          lineage: sharedViews[0]?.lineage ?? { sources: [], parents: [], handshakes: [] },
          governance: latestRun?.governance ?? 'approved',
          payload: {
            path: relativeProjectPath(options.paths, generatedTracePath(options.paths, scenario.artifact.metadata.suite, scenario.artifact.source.ado_id)),
            command: `tesseract trace --ado-id ${scenario.artifact.source.ado_id}`,
          },
        },
        review: {
          kind: 'generated-review',
          version: 1,
          stage: 'projection',
          scope: 'scenario',
          ids: {
            adoId: scenario.artifact.source.ado_id,
            suite: scenario.artifact.metadata.suite,
            runId: latestRun?.runId ?? null,
          },
          fingerprints: {
            artifact: catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === scenario.artifact.source.ado_id)?.fingerprint ?? scenario.fingerprint,
            content: scenario.artifact.source.content_hash,
            knowledge: taskPacketEntry?.artifact.knowledgeFingerprint ?? null,
            controls: controls?.runbooks[0]?.name ?? null,
            task: taskPacketEntry?.fingerprint ?? null,
            run: latestRun?.fingerprints.run ?? null,
          },
          lineage: sharedViews[0]?.lineage ?? { sources: [], parents: [], handshakes: [] },
          governance: latestRun?.governance ?? proposalBundle?.governance ?? 'approved',
          payload: {
            path: relativeProjectPath(options.paths, generatedReviewPath(options.paths, scenario.artifact.metadata.suite, scenario.artifact.source.ado_id)),
          },
        },
        graph: {
          kind: 'derived-graph',
          version: 1,
          stage: 'projection',
          scope: 'workspace',
          ids: {
            adoId: scenario.artifact.source.ado_id,
            suite: scenario.artifact.metadata.suite,
            runId: latestRun?.runId ?? null,
          },
          fingerprints: {
            artifact: catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === scenario.artifact.source.ado_id)?.fingerprint ?? scenario.fingerprint,
            content: scenario.artifact.source.content_hash,
            knowledge: taskPacketEntry?.artifact.knowledgeFingerprint ?? null,
            controls: controls?.runbooks[0]?.name ?? null,
            task: taskPacketEntry?.fingerprint ?? null,
            run: latestRun?.fingerprints.run ?? null,
          },
          lineage: sharedViews[0]?.lineage ?? { sources: [], parents: [], handshakes: [] },
          governance: 'approved',
          payload: {
            path: relativeProjectPath(options.paths, options.paths.graphIndexPath),
            command: 'tesseract graph',
          },
        },
      } : null,
      navigation: scenario ? {
        flow: ['hotspot', 'evidence/trace', 'proposal approval', 'rerun plan'],
        recipes: {
          hotspot: `tesseract workflow --ado-id ${scenario.artifact.source.ado_id}`,
          trace: `tesseract trace --ado-id ${scenario.artifact.source.ado_id}`,
          approval: proposalBundle?.proposals[0]
            ? `tesseract approve --proposal-id ${proposalBundle.proposals[0].proposalId}`
            : `tesseract inbox --ado-id ${scenario.artifact.source.ado_id}`,
          rerun: proposalBundle?.proposals[0]
            ? `tesseract rerun-plan --proposal-id ${proposalBundle.proposals[0].proposalId}`
            : `tesseract inbox --ado-id ${scenario.artifact.source.ado_id}`,
        },
      } : null,
      sharedViews: sharedViews.sort((left, right) => compareStrings(left.scenarioId, right.scenarioId)),
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
        task: taskPacketEntry?.fingerprint ?? null,
      } : null,
    };
  });
}
