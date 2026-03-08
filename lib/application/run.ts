import path from 'path';
import { Effect } from 'effect';
import { evaluateArtifactPolicy } from './trust-policy';
import { buildDerivedGraph } from './graph';
import { emitScenario } from './emit';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import {
  executionPath,
  generatedProposalsPath,
  interpretationPath,
  relativeProjectPath,
  runRecordPath,
} from './paths';
import { FileSystem, RuntimeScenarioRunner } from './ports';
import type { ProposalBundle, RunRecord } from '../domain/types';
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
  return fixtures;
}

function evidencePath(paths: ProjectPaths, adoId: AdoId, runId: string, stepIndex: number, evidenceIndex: number): string {
  return path.join(paths.evidenceDir, 'runs', `${adoId}`, runId, `step-${stepIndex}-${evidenceIndex}.json`);
}

export function runScenario(options: { adoId: AdoId; paths: ProjectPaths; interpreterMode?: 'dry-run' | 'diagnostic' }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const runtimeScenarioRunner = yield* RuntimeScenarioRunner;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
    const boundScenario = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId);
    const taskPacket = catalog.taskPackets.find((entry) => entry.artifact.adoId === options.adoId);
    const snapshot = catalog.snapshots.find((entry) => entry.artifact.id === options.adoId);
    if (!scenario || !boundScenario || !taskPacket || !snapshot) {
      throw new Error(`Missing scenario, bound scenario, task packet, or snapshot for ${options.adoId}`);
    }

    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const mode = options.interpreterMode ?? 'diagnostic';
    const fixtureIds = uniqueSorted([
      ...scenario.artifact.preconditions.map((precondition) => precondition.fixture),
      ...taskPacket.artifact.steps.flatMap((step) =>
        step.runtimeKnowledge.screens.flatMap((screen) =>
          screen.elements
            .map((element) => fixtureIdFromTemplateValue(element.defaultValueRef))
            .filter((value): value is string => value !== null),
        ),
      ),
    ]);
    const screenIds = uniqueSorted(
      taskPacket.artifact.steps.flatMap((step) => step.runtimeKnowledge.screens.map((screen) => screen.screen)),
    );
    const stepResults = yield* runtimeScenarioRunner.runSteps({
      rootDir: options.paths.rootDir,
      screenIds,
      fixtures: defaultFixtures({ fixtureIds, dataRow: snapshot.artifact.dataRows[0] ?? null }),
      mode,
      provider: 'deterministic-runtime-step-agent',
      steps: taskPacket.artifact.steps,
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
    const proposalBundle: ProposalBundle = {
      kind: 'proposal-bundle',
      adoId: options.adoId,
      runId,
      revision: scenario.artifact.source.revision,
      title: scenario.artifact.metadata.title,
      suite: scenario.artifact.metadata.suite,
      proposals: stepResults.flatMap((step) =>
        step.interpretation.proposalDrafts.map((proposal) => ({
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
        })),
      ),
    };

    const runRecord: RunRecord = {
      kind: 'scenario-run-record',
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

    const interpretationFile = interpretationPath(options.paths, options.adoId, runId);
    const executionFile = executionPath(options.paths, options.adoId, runId);
    const runFile = runRecordPath(options.paths, options.adoId, runId);
    const proposalsFile = generatedProposalsPath(options.paths, scenario.artifact.metadata.suite, options.adoId);

    yield* fs.writeJson(interpretationFile, interpretationOutput);
    yield* fs.writeJson(executionFile, executionOutput);
    yield* fs.writeJson(runFile, runRecord);
    yield* fs.writeJson(proposalsFile, proposalBundle);

    const emitted = yield* emitScenario({ adoId: options.adoId, paths: options.paths });
    const graph = yield* buildDerivedGraph({ paths: options.paths });

    return {
      runId,
      interpretationPath: interpretationFile,
      executionPath: executionFile,
      runPath: runFile,
      proposalsPath: proposalsFile,
      evidence: evidenceWrites.map((entry) => entry.absolutePath),
      emitted,
      graph,
    };
  });
}
