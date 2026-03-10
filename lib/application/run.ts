import { Effect } from 'effect';
import { projectConfidenceOverlayCatalog } from './confidence';
import { resolveRunSelection } from './controls';
import { buildDerivedGraph } from './graph';
import { emitScenario } from './emit';
import { emitOperatorInbox } from './inbox';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import {
  executionPath,
  generatedProposalsPath,
  interpretationPath,
  runRecordPath,
} from './paths';
import { ExecutionContext, FileSystem, RuntimeScenarioRunner } from './ports';
import type { ExecutionPosture } from '../domain/types';
import type { AdoId } from '../domain/identity';
import { selectRunContext } from './execution/select-run-context';
import { runPipelineStage } from './pipeline';
import { executeSteps } from './execution/execute-steps';
import { persistEvidence } from './execution/persist-evidence';
import { buildProposals } from './execution/build-proposals';
import { buildRunRecord } from './execution/build-run-record';

export function runScenario(options: {
  adoId: AdoId;
  paths: ProjectPaths;
  interpreterMode?: 'dry-run' | 'diagnostic';
  runbookName?: string | undefined;
  posture?: ExecutionPosture | undefined;
  disableTranslation?: boolean | undefined;
  disableTranslationCache?: boolean | undefined;
}) {
  return Effect.gen(function* () {
    const stage = yield* runPipelineStage({
      name: 'run',
      loadDependencies: () => Effect.gen(function* () {
        const fs = yield* FileSystem;
        const runtimeScenarioRunner = yield* RuntimeScenarioRunner;
        const executionContext = yield* ExecutionContext;
        const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
        return { fs, runtimeScenarioRunner, executionContext, catalog };
      }),
      compute: ({ fs, runtimeScenarioRunner, executionContext, catalog }) => Effect.gen(function* () {
        const selectedContext = selectRunContext({
          adoId: options.adoId,
          catalog,
          paths: options.paths,
          ...(options.runbookName ? { runbookName: options.runbookName } : {}),
          ...(options.interpreterMode ? { interpreterMode: options.interpreterMode } : {}),
          ...(options.posture ? { posture: options.posture } : {}),
          executionContextPosture: executionContext.posture,
        });

        const executionStage = yield* executeSteps({
          runtimeScenarioRunner,
          rootDir: options.paths.rootDir,
          adoId: options.adoId,
          selectedContext,
          translationOptions: {
            disableTranslation: options.disableTranslation ?? !selectedContext.translationEnabled,
            disableTranslationCache: options.disableTranslationCache ?? !selectedContext.translationCacheEnabled,
          },
        });

        const evidenceStage = yield* persistEvidence({
          fs,
          paths: options.paths,
          adoId: options.adoId,
          runId: selectedContext.runId,
          stepResults: executionStage.stepResults,
        });

        const evidenceCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
        const proposalStage = buildProposals({
          adoId: options.adoId,
          runId: selectedContext.runId,
          selectedContext,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
          evidenceCatalog,
        });
        const runRecordStage = buildRunRecord({
          adoId: options.adoId,
          runId: selectedContext.runId,
          selectedContext,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
        });

        const interpretationFile = interpretationPath(options.paths, options.adoId, selectedContext.runId);
        const executionFile = executionPath(options.paths, options.adoId, selectedContext.runId);
        const runFile = runRecordPath(options.paths, options.adoId, selectedContext.runId);
        const proposalsFile = generatedProposalsPath(options.paths, selectedContext.scenarioEntry.artifact.metadata.suite, options.adoId);

        yield* fs.writeJson(interpretationFile, executionStage.interpretationOutput);
        yield* fs.writeJson(executionFile, executionStage.executionOutput);
        yield* fs.writeJson(runFile, runRecordStage.runRecord);
        yield* fs.writeJson(proposalsFile, proposalStage.proposalBundle);

        const confidence = yield* projectConfidenceOverlayCatalog({ paths: options.paths });
        const emitted = yield* emitScenario({ adoId: options.adoId, paths: options.paths });
        const graph = yield* buildDerivedGraph({ paths: options.paths });
        const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: options.adoId } });

        return {
          runId: selectedContext.runId,
          runbook: selectedContext.activeRunbook?.name ?? null,
          dataset: selectedContext.activeDataset?.name ?? null,
          interpretationPath: interpretationFile,
          executionPath: executionFile,
          runPath: runFile,
          proposalsPath: proposalsFile,
          evidence: evidenceStage.evidenceWrites.map((entry) => entry.absolutePath),
          confidence,
          emitted,
          graph,
          inbox,
          posture: selectedContext.posture,
        };
      }),
    });

    return stage.computed;
  });
}

export function runScenarioSelection(options: {
  paths: ProjectPaths;
  adoId?: AdoId | undefined;
  runbookName?: string | undefined;
  tag?: string | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic';
  posture?: ExecutionPosture | undefined;
  disableTranslation?: boolean | undefined;
  disableTranslationCache?: boolean | undefined;
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
        disableTranslation?: boolean;
        disableTranslationCache?: boolean;
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
      if (options.disableTranslation) {
        runOptions.disableTranslation = true;
      }
      if (options.disableTranslationCache) {
        runOptions.disableTranslationCache = true;
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
