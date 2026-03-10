import path from 'path';
import { Effect } from 'effect';
import { proposalIdForEntry } from './operator';
import { projectConfidenceOverlayCatalog } from './confidence';
import { activeDatasetForRun, findRunbook, resolveRunSelection } from './controls';
import { evaluateArtifactPolicy } from './trust-policy';
import { buildDerivedGraph } from './graph';
import { emitScenario } from './emit';
import { emitOperatorInbox } from './inbox';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import {
  executionPath,
  generatedProposalsPath,
  interpretationPath,
  relativeProjectPath,
  runRecordPath,
} from './paths';
import { ExecutionContext, FileSystem, RuntimeScenarioRunner } from './ports';
import type { ExecutionPosture, ProposalBundle, RunRecord, StepTask } from '../domain/types';
import type { AdoId } from '../domain/identity';
import type { LoadedEvidenceRecord } from './trust-policy';

const fixtureReferencePattern = /^\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}$/;

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)) as T[];
}

function fixtureIdFromTemplateValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const match = value.match(fixtureReferencePattern);
  return match?.[1] ?? null;
}

function defaultFixtures(input: {
  fixtureIds: string[];
  dataRow: Record<string, string> | null;
  datasetFixtures?: Record<string, unknown> | undefined;
  generatedTokens?: Record<string, string> | undefined;
}) {
  const fixtures: Record<string, unknown> = {};
  for (const fixtureId of input.fixtureIds) {
    switch (fixtureId) {
      case 'demoSession':
        fixtures.demoSession = { baseURL: 'http://example.test' };
        break;
      case 'activePolicy':
        fixtures.activePolicy = { number: input.dataRow?.policyNumber ?? 'POL-001' };
        break;
      default:
        fixtures[fixtureId] = {};
        break;
    }
  }
  if (input.dataRow) {
    fixtures.dataRow = input.dataRow;
  }
  if (input.datasetFixtures) {
    Object.assign(fixtures, input.datasetFixtures);
  }
  fixtures.generatedTokens = {
    ...(fixtures.generatedTokens as Record<string, unknown> | undefined),
    ...(input.generatedTokens ?? {}),
  };
  return fixtures;
}

function evidencePath(paths: ProjectPaths, adoId: AdoId, runId: string, stepIndex: number, evidenceIndex: number): string {
  return path.join(paths.evidenceDir, 'runs', `${adoId}`, runId, `step-${stepIndex}-${evidenceIndex}.json`);
}

function taskStepsForRun(taskSteps: readonly StepTask[], resolutionControlName?: string | null): StepTask[] {
  return taskSteps.map((step) => ({
    ...step,
    controlResolution: resolutionControlName
      ? (step.runtimeKnowledge.controls.resolutionControls.find((entry) => entry.name === resolutionControlName && entry.stepIndex === step.index)?.resolution ?? step.controlResolution)
      : step.controlResolution,
  }));
}

export function runScenario(options: {
  adoId: AdoId;
  paths: ProjectPaths;
  interpreterMode?: 'dry-run' | 'diagnostic';
  runbookName?: string | undefined;
  posture?: ExecutionPosture | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const runtimeScenarioRunner = yield* RuntimeScenarioRunner;
    const executionContext = yield* ExecutionContext;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
    const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
    const taskPacket = catalog.taskPackets.find((entry) => entry.artifact.adoId === options.adoId);
    const snapshot = catalog.snapshots.find((entry) => entry.artifact.id === options.adoId);
    if (!scenario || !boundScenario || !taskPacket || !snapshot) {
      throw new Error(`Missing scenario, bound scenario, task packet, or snapshot for ${options.adoId}`);
    }

    const activeRunbook = findRunbook(catalog, {
      runbookName: options.runbookName ?? null,
      scenario: scenario.artifact,
    });
    const activeDataset = activeDatasetForRun(taskPacket.artifact.steps[0]?.runtimeKnowledge.controls ?? {
      datasets: [],
      resolutionControls: [],
      runbooks: [],
    }, activeRunbook);
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const posture = options.posture ?? executionContext.posture;
    const mode = options.interpreterMode ?? activeRunbook?.interpreterMode ?? posture.interpreterMode ?? 'diagnostic';
    const steps = taskStepsForRun(taskPacket.artifact.steps, activeRunbook?.resolutionControl ?? null);
    const fixtureIds = uniqueSorted([
      ...scenario.artifact.preconditions.map((precondition) => precondition.fixture),
      ...steps.flatMap((step) =>
        step.runtimeKnowledge.screens.flatMap((screen) =>
          screen.elements
            .map((element) => fixtureIdFromTemplateValue(element.defaultValueRef))
            .filter((value): value is string => value !== null),
        ),
      ),
    ]);
    const screenIds = uniqueSorted(
      steps.flatMap((step) => step.runtimeKnowledge.screens.map((screen) => screen.screen)),
    );
    const stepResults = yield* runtimeScenarioRunner.runSteps({
      rootDir: options.paths.rootDir,
      screenIds,
      controlSelection: {
        runbook: activeRunbook?.name ?? null,
        dataset: activeDataset?.name ?? null,
        resolutionControl: activeRunbook?.resolutionControl ?? null,
      },
      fixtures: defaultFixtures({
        fixtureIds,
        dataRow: snapshot.artifact.dataRows[0] ?? null,
        datasetFixtures: activeDataset?.fixtures,
        generatedTokens: activeDataset?.generatedTokens,
      }),
      mode,
      provider: 'deterministic-runtime-step-agent',
      steps,
      posture,
      context: {
        adoId: options.adoId,
        revision: scenario.artifact.source.revision,
        contentHash: scenario.artifact.source.content_hash,
      },
    });

    const interpretationOutput = {
      kind: 'scenario-interpretation-record',
      adoId: options.adoId,
      runId,
      steps: stepResults.map((step) => ({
        stepIndex: step.interpretation.stepIndex,
        interpretation: step.interpretation,
      })),
    };
    const executionOutput = {
      kind: 'scenario-execution-record',
      adoId: options.adoId,
      runId,
      steps: stepResults.map((step) => ({
        stepIndex: step.execution.stepIndex,
        execution: step.execution,
      })),
    };

    const evidenceWrites: Array<{ artifactPath: string; absolutePath: string }> = [];
    for (const step of stepResults) {
      for (const [index, draft] of step.interpretation.evidenceDrafts.entries()) {
        const absolutePath = evidencePath(options.paths, options.adoId, runId, step.interpretation.stepIndex, index);
        yield* fs.writeJson(absolutePath, {
          evidence: {
            ...draft,
            timestamp: step.interpretation.runAt,
          },
        });
        evidenceWrites.push({
          artifactPath: relativeProjectPath(options.paths, absolutePath),
          absolutePath,
        });
      }
    }

    const evidenceCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const loadedEvidence: LoadedEvidenceRecord[] = evidenceCatalog.evidenceRecords.map((entry) => ({
      artifactPath: entry.artifactPath,
      record: entry.artifact,
    })).concat(evidenceWrites.map((entry) => ({
      artifactPath: entry.artifactPath,
      record: {
        evidence: {
          type: 'runtime-resolution-gap',
          timestamp: stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
          trigger: 'live-dom-resolution',
          observation: {},
          proposal: {
            file: '',
            field: '',
            old_value: null,
            new_value: null,
          },
          confidence: 0.9,
          risk: 'low',
          scope: 'hints',
        },
      },
    })));
    const proposalBundleIdentity = {
      adoId: options.adoId,
      suite: scenario.artifact.metadata.suite,
    } as const;
    const proposalBundle: ProposalBundle = {
      kind: 'proposal-bundle',
      version: 1,
      stage: 'proposal',
      scope: 'scenario',
      ids: {
        adoId: options.adoId,
        suite: scenario.artifact.metadata.suite,
        runId,
        dataset: activeDataset?.name ?? null,
        runbook: activeRunbook?.name ?? null,
        resolutionControl: activeRunbook?.resolutionControl ?? null,
      },
      fingerprints: {
        artifact: runId,
        content: scenario.artifact.source.content_hash,
        knowledge: taskPacket.artifact.knowledgeFingerprint,
        controls: taskPacket.artifact.fingerprints.controls ?? null,
        task: taskPacket.artifact.taskFingerprint,
        run: runId,
      },
      lineage: {
        sources: [taskPacket.artifact.taskFingerprint, ...(activeRunbook ? [activeRunbook.artifactPath] : []), ...(activeDataset ? [activeDataset.artifactPath] : [])],
        parents: [taskPacket.artifact.taskFingerprint, runId],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: 'approved',
      payload: {
        adoId: options.adoId,
        runId,
        revision: scenario.artifact.source.revision,
        title: scenario.artifact.metadata.title,
        suite: scenario.artifact.metadata.suite,
        proposals: [],
      },
      adoId: options.adoId,
      runId,
      revision: scenario.artifact.source.revision,
      title: scenario.artifact.metadata.title,
      suite: scenario.artifact.metadata.suite,
      proposals: stepResults.flatMap((step) =>
        step.interpretation.proposalDrafts.map((proposal) => {
          const proposalEntry = {
            proposalId: '',
            stepIndex: step.interpretation.stepIndex,
            artifactType: proposal.artifactType,
            targetPath: proposal.targetPath,
            title: proposal.title,
            patch: proposal.patch,
            evidenceIds: evidenceWrites
              .filter((entry) => entry.artifactPath.includes(`step-${step.interpretation.stepIndex}-`))
              .map((entry) => entry.artifactPath),
            impactedSteps: [step.interpretation.stepIndex],
            trustPolicy: evaluateArtifactPolicy({
              policy: evidenceCatalog.trustPolicy.artifact,
              proposedChange: {
                artifactType: proposal.artifactType,
                confidence: 0.9,
                autoHealClass: 'runtime-intent-cutover',
              },
              evidence: loadedEvidence,
            }),
          };
          proposalEntry.proposalId = proposalIdForEntry(proposalBundleIdentity, proposalEntry);
          return proposalEntry;
        }),
      ),
    };
    proposalBundle.governance = proposalBundle.proposals.some((proposal) => proposal.trustPolicy.decision === 'deny')
      ? 'blocked'
      : proposalBundle.proposals.some((proposal) => proposal.trustPolicy.decision === 'review')
        ? 'review-required'
        : 'approved';
    proposalBundle.payload.proposals = proposalBundle.proposals;
    proposalBundle.fingerprints.artifact = `${runId}:proposal`;

    const runRecord: RunRecord = {
      kind: 'scenario-run-record',
      version: 1,
      stage: 'execution',
      scope: 'run',
      ids: {
        adoId: options.adoId,
        suite: scenario.artifact.metadata.suite,
        runId,
        dataset: activeDataset?.name ?? null,
        runbook: activeRunbook?.name ?? null,
        resolutionControl: activeRunbook?.resolutionControl ?? null,
      },
      fingerprints: {
        artifact: runId,
        content: scenario.artifact.source.content_hash,
        knowledge: taskPacket.artifact.knowledgeFingerprint,
        controls: taskPacket.artifact.fingerprints.controls ?? null,
        task: taskPacket.artifact.taskFingerprint,
        run: runId,
      },
      lineage: {
        sources: [taskPacket.artifact.taskFingerprint, ...(activeRunbook ? [activeRunbook.artifactPath] : []), ...(activeDataset ? [activeDataset.artifactPath] : [])],
        parents: [taskPacket.artifact.taskFingerprint],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
      },
      governance: 'approved',
      payload: {
        runId,
        adoId: options.adoId,
        revision: scenario.artifact.source.revision,
        title: scenario.artifact.metadata.title,
        suite: scenario.artifact.metadata.suite,
        taskFingerprint: taskPacket.artifact.taskFingerprint,
        knowledgeFingerprint: taskPacket.artifact.knowledgeFingerprint,
        provider: 'deterministic-runtime-step-agent',
        mode,
        startedAt: stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
        completedAt: stepResults[stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
        steps: [],
        evidenceIds: [],
      },
      runId,
      adoId: options.adoId,
      revision: scenario.artifact.source.revision,
      title: scenario.artifact.metadata.title,
      suite: scenario.artifact.metadata.suite,
      taskFingerprint: taskPacket.artifact.taskFingerprint,
      knowledgeFingerprint: taskPacket.artifact.knowledgeFingerprint,
      provider: 'deterministic-runtime-step-agent',
      mode,
      startedAt: stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
      completedAt: stepResults[stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
      steps: stepResults.map((step) => ({
        stepIndex: step.interpretation.stepIndex,
        interpretation: step.interpretation,
        execution: step.execution,
        evidenceIds: evidenceWrites
          .filter((entry) => entry.artifactPath.includes(`step-${step.interpretation.stepIndex}-`))
          .map((entry) => entry.artifactPath),
      })),
      evidenceIds: evidenceWrites.map((entry) => entry.artifactPath),
    };
    runRecord.governance = runRecord.steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed')
      ? 'blocked'
      : runRecord.steps.some((step) => step.interpretation.kind === 'resolved-with-proposals')
        ? 'review-required'
        : 'approved';
    runRecord.payload.steps = runRecord.steps;
    runRecord.payload.evidenceIds = runRecord.evidenceIds;

    const interpretationFile = interpretationPath(options.paths, options.adoId, runId);
    const executionFile = executionPath(options.paths, options.adoId, runId);
    const runFile = runRecordPath(options.paths, options.adoId, runId);
    const proposalsFile = generatedProposalsPath(options.paths, scenario.artifact.metadata.suite, options.adoId);

    yield* fs.writeJson(interpretationFile, interpretationOutput);
    yield* fs.writeJson(executionFile, executionOutput);
    yield* fs.writeJson(runFile, runRecord);
    yield* fs.writeJson(proposalsFile, proposalBundle);

    const confidence = yield* projectConfidenceOverlayCatalog({ paths: options.paths });
    const emitted = yield* emitScenario({ adoId: options.adoId, paths: options.paths });
    const graph = yield* buildDerivedGraph({ paths: options.paths });
    const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: options.adoId } });

    return {
      runId,
      runbook: activeRunbook?.name ?? null,
      dataset: activeDataset?.name ?? null,
      interpretationPath: interpretationFile,
      executionPath: executionFile,
      runPath: runFile,
      proposalsPath: proposalsFile,
      evidence: evidenceWrites.map((entry) => entry.absolutePath),
      confidence,
      emitted,
      graph,
      inbox,
      posture,
    };
  });
}

export function runScenarioSelection(options: {
  paths: ProjectPaths;
  adoId?: AdoId | undefined;
  runbookName?: string | undefined;
  tag?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic';
  posture?: ExecutionPosture | undefined;
}) {
  return Effect.gen(function* () {
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const selection = resolveRunSelection(catalog, {
      adoId: options.adoId ?? null,
      runbookName: options.runbookName ?? null,
      tag: options.tag ?? null,
    });
    const runs = [];

    for (const adoId of selection.adoIds) {
      const runOptions: {
        adoId: AdoId;
        paths: ProjectPaths;
        interpreterMode?: 'dry-run' | 'diagnostic';
        runbookName?: string;
        posture?: ExecutionPosture;
      } = {
        adoId: adoId as AdoId,
        paths: options.paths,
      };
      if (options.interpreterMode) {
        runOptions.interpreterMode = options.interpreterMode;
      }
      if (options.posture) {
        runOptions.posture = options.posture;
      }
      const runbookName = selection.runbook?.name ?? options.runbookName;
      if (runbookName) {
        runOptions.runbookName = runbookName;
      }
      runs.push(yield* runScenario(runOptions));
    }

    return {
      selection: {
        adoIds: selection.adoIds,
        runbook: selection.runbook?.name ?? null,
        tag: options.tag ?? null,
      },
      runs,
    };
  });
}
