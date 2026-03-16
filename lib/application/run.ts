import { Effect } from 'effect';
import { projectConfidenceOverlayCatalog } from './confidence';
import { resolveRunSelection } from './controls';
import { activateProposalBundle } from './activate-proposals';
import { buildDerivedGraph } from './graph';
import { writeAgentSessionLedger } from './agent-session-ledger';
import { emitScenario } from './emit';
import { emitOperatorInbox } from './inbox';
import { projectLearningArtifacts } from './learning';
import { loadWorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import {
  executionPath,
  generatedProposalsPath,
  interpretationPath,
  resolutionGraphPath,
  runRecordPath,
} from './paths';
import { ExecutionContext, FileSystem, RuntimeScenarioRunner } from './ports';
import type { ExecutionPosture } from '../domain/types';
import type { AdoId } from '../domain/identity';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from './execution/select-run-context';
import { runPipelineStage } from './pipeline';
import { interpretScenarioFromPlan } from './execution/interpret';
import { persistEvidence } from './execution/persist-evidence';
import { buildProposals } from './execution/build-proposals';
import { buildRunRecord } from './execution/build-run-record';
import { foldScenarioRun } from './execution/fold';

export function runScenario(options: {
  adoId: AdoId;
  paths: ProjectPaths;
  interpreterMode?: 'dry-run' | 'diagnostic';
  runbookName?: string | undefined;
  posture?: ExecutionPosture | undefined;
  disableTranslation?: boolean | undefined;
  disableTranslationCache?: boolean | undefined;
  providerId?: string | undefined;
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
        const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(catalog, options.adoId);
        const plan = prepareScenarioRunPlan({
          surface: surfaceEntry.artifact,
          catalog,
          paths: options.paths,
          ...(options.runbookName ? { runbookName: options.runbookName } : {}),
          ...(options.interpreterMode ? { interpreterMode: options.interpreterMode } : {}),
          ...(options.posture ? { posture: options.posture } : {}),
          ...(options.providerId ? { providerId: options.providerId } : {}),
          executionContextPosture: executionContext.posture,
        });
        const scenarioEntry = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId)!;
        const boundScenarioEntry = catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId)!;
        const executionStage = yield* interpretScenarioFromPlan({
          runtimeScenarioRunner,
          rootDir: options.paths.rootDir,
          plan,
          knowledgeFingerprint: surfaceEntry.artifact.payload.knowledgeFingerprint,
          controlsFingerprint: surfaceEntry.artifact.fingerprints.controls ?? null,
          translationOptions: {
            disableTranslation: options.disableTranslation ?? !plan.translationEnabled,
            disableTranslationCache: options.disableTranslationCache ?? !plan.translationCacheEnabled,
          },
        });

        const evidenceStage = yield* persistEvidence({
          fs,
          paths: options.paths,
          adoId: options.adoId,
          runId: plan.runId,
          stepResults: executionStage.stepResults,
        });
        const fold = foldScenarioRun({
          plan,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
        });

        const evidenceCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
        const proposalStage = buildProposals({
          adoId: options.adoId,
          runId: plan.runId,
          plan,
          surfaceArtifactPath: surfaceEntry.artifactPath,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
          evidenceCatalog,
        });
        const activationStage = yield* activateProposalBundle({
          paths: options.paths,
          proposalBundle: proposalStage.proposalBundle,
        });
        const runRecordStage = buildRunRecord({
          plan,
          fold,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
        });
        const learning = yield* projectLearningArtifacts({
          paths: options.paths,
          boundScenario: boundScenarioEntry.artifact,
          surface: surfaceEntry.artifact,
          interfaceGraph: catalog.interfaceGraph?.artifact ?? null,
          selectorCanon: catalog.selectorCanon?.artifact ?? null,
          runRecord: runRecordStage.runRecord,
          proposalBundle: activationStage.proposalBundle,
        });
        const session = yield* writeAgentSessionLedger({
          paths: options.paths,
          adoId: options.adoId,
          runId: plan.runId,
          providerId: plan.providerId,
          executionProfile: plan.posture.executionProfile,
          startedAt: runRecordStage.runRecord.startedAt,
          completedAt: runRecordStage.runRecord.completedAt,
          surface: surfaceEntry.artifact,
          interfaceGraph: catalog.interfaceGraph?.artifact ?? null,
          selectorCanon: catalog.selectorCanon?.artifact ?? null,
          proposalBundle: activationStage.proposalBundle,
          learningManifest: learning.manifest,
        });

        const interpretationFile = interpretationPath(options.paths, options.adoId, plan.runId);
        const executionFile = executionPath(options.paths, options.adoId, plan.runId);
        const resolutionGraphFile = resolutionGraphPath(options.paths, options.adoId, plan.runId);
        const runFile = runRecordPath(options.paths, options.adoId, plan.runId);
        const proposalsFile = generatedProposalsPath(options.paths, scenarioEntry.artifact.metadata.suite, options.adoId);

        yield* fs.writeJson(interpretationFile, executionStage.interpretationOutput);
        yield* fs.writeJson(executionFile, executionStage.executionOutput);
        yield* fs.writeJson(resolutionGraphFile, executionStage.resolutionGraphOutput);
        yield* fs.writeJson(runFile, runRecordStage.runRecord);
        yield* fs.writeJson(proposalsFile, activationStage.proposalBundle);

        const confidence = yield* projectConfidenceOverlayCatalog({ paths: options.paths });
        const emitted = yield* emitScenario({ adoId: options.adoId, paths: options.paths });
        const graph = yield* buildDerivedGraph({ paths: options.paths });
        const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: options.adoId } });

        return {
          runId: plan.runId,
          runbook: plan.controlSelection.runbook ?? null,
          dataset: plan.controlSelection.dataset ?? null,
          interpretationPath: interpretationFile,
          executionPath: executionFile,
          resolutionGraphPath: resolutionGraphFile,
          runPath: runFile,
          proposalsPath: proposalsFile,
          evidence: evidenceStage.evidenceWrites.map((entry) => entry.absolutePath),
          activatedCanonPaths: activationStage.activatedPaths,
          blockedProposalIds: activationStage.blockedProposalIds,
          learning,
          session,
          confidence,
          emitted,
          graph,
          inbox,
          posture: plan.posture,
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
  providerId?: string | undefined;
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
        providerId?: string;
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
      if (options.providerId) {
        runOptions.providerId = options.providerId;
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
