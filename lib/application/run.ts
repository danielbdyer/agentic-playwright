import { Effect } from 'effect';
import { projectConfidenceOverlayCatalog } from './confidence';
import { resolveRunSelection } from './controls';
import { activateProposalBundle } from './activate-proposals';
import { buildDerivedGraph } from './graph';
import { writeAgentSessionLedger } from './agent-session-ledger';
import { emitScenario } from './emit';
import { emitOperatorInbox } from './inbox';
import { projectLearningArtifacts } from './learning';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
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
import { resolveEffectConcurrency } from './concurrency';

type RunScenarioOptions = {
  adoId: AdoId;
  paths: ProjectPaths;
  catalog?: WorkspaceCatalog | undefined;
  interpreterMode?: 'dry-run' | 'diagnostic';
  runbookName?: string | undefined;
  posture?: ExecutionPosture | undefined;
  disableTranslation?: boolean | undefined;
  disableTranslationCache?: boolean | undefined;
  providerId?: string | undefined;
};

/**
 * Core scenario run: execute, persist evidence, build proposals, write run
 * artifacts — but skip global projections (graph, confidence, emit, inbox).
 * Use this when running multiple scenarios concurrently; call the global
 * projections once afterward via `runScenarioProjections`.
 */
export function runScenarioCore(options: RunScenarioOptions) {
  return Effect.gen(function* () {
    const stage = yield* runPipelineStage({
      name: 'run',
      loadDependencies: () => Effect.gen(function* () {
        const fs = yield* FileSystem;
        const runtimeScenarioRunner = yield* RuntimeScenarioRunner;
        const executionContext = yield* ExecutionContext;
        const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
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
          suiteRoot: options.paths.suiteRoot,
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

        const proposalStage = buildProposals({
          adoId: options.adoId,
          runId: plan.runId,
          plan,
          surfaceArtifactPath: surfaceEntry.artifactPath,
          stepResults: executionStage.stepResults,
          evidenceWrites: evidenceStage.evidenceWrites,
          evidenceCatalog: catalog,
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

        yield* Effect.all([
          fs.writeJson(interpretationFile, executionStage.interpretationOutput),
          fs.writeJson(executionFile, executionStage.executionOutput),
          fs.writeJson(resolutionGraphFile, executionStage.resolutionGraphOutput),
          fs.writeJson(runFile, runRecordStage.runRecord),
          fs.writeJson(proposalsFile, activationStage.proposalBundle),
        ], { concurrency: 'unbounded' });

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
          posture: plan.posture,
        };
      }),
    });

    return stage.computed;
  }).pipe(Effect.withSpan('run-scenario-core', { attributes: { adoId: options.adoId } }));
}

/**
 * Run global projections after scenario execution: graph, confidence overlay,
 * emitted spec, and operator inbox. Call once after all scenario runs complete.
 */
export function runScenarioProjections(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const postWriteCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    return yield* Effect.all({
      confidence: projectConfidenceOverlayCatalog({ paths: options.paths, catalog: postWriteCatalog }),
      emitted: emitScenario({ adoId: options.adoId, paths: options.paths, catalog: postWriteCatalog }),
      graph: buildDerivedGraph({ paths: options.paths, catalog: postWriteCatalog }),
      inbox: emitOperatorInbox({ paths: options.paths, catalog: postWriteCatalog, filter: { adoId: options.adoId } }),
    }, { concurrency: 'unbounded' });
  });
}

/**
 * Full scenario run: core execution + global projections.
 * Use for single-scenario runs (tests, CLI). For batch runs,
 * prefer `runScenarioCore` + a single `runScenarioProjections` pass.
 */
export function runScenario(options: RunScenarioOptions) {
  return Effect.gen(function* () {
    const core = yield* runScenarioCore(options);
    const projections = yield* runScenarioProjections({ adoId: options.adoId, paths: options.paths });
    return {
      ...core,
      ...projections,
    };
  }).pipe(Effect.withSpan('run-scenario', { attributes: { adoId: options.adoId } }));
}

export function runScenarioSelection(options: {
  paths: ProjectPaths;
  catalog?: WorkspaceCatalog | undefined;
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
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const selection = resolveRunSelection(catalog, {
      adoId: options.adoId ?? null,
      runbookName: options.runbookName ?? null,
      tag: options.tag ?? null,
    });

    const runbookName = selection.runbook?.name ?? options.runbookName;
    const buildRunOptions = (adoId: AdoId): RunScenarioOptions => ({
      adoId,
      paths: options.paths,
      catalog,
      ...(options.interpreterMode ? { interpreterMode: options.interpreterMode } : {}),
      ...(options.posture ? { posture: options.posture } : {}),
      ...(runbookName ? { runbookName } : {}),
      ...(options.disableTranslation ? { disableTranslation: true } : {}),
      ...(options.disableTranslationCache ? { disableTranslationCache: true } : {}),
      ...(options.providerId ? { providerId: options.providerId } : {}),
    });

    // For a single scenario, run the full pipeline (core + projections).
    // For multiple scenarios, run cores concurrently then project once.
    const isSingleScenario = selection.adoIds.length <= 1;

    const runs = isSingleScenario
      ? yield* Effect.all(
          selection.adoIds.map((adoId) => runScenario(buildRunOptions(adoId as AdoId))),
        )
      : yield* Effect.gen(function* () {
          const concurrency = resolveEffectConcurrency();
          const coreRuns = yield* Effect.all(
            selection.adoIds.map((adoId) => runScenarioCore(buildRunOptions(adoId as AdoId))),
            { concurrency },
          );
          // Single catalog reload + global projections after all runs complete
          const postWriteCatalog = yield* loadWorkspaceCatalog({ paths: options.paths });
          const { confidence, graph } = yield* Effect.all({
            confidence: projectConfidenceOverlayCatalog({ paths: options.paths, catalog: postWriteCatalog }),
            graph: buildDerivedGraph({ paths: options.paths, catalog: postWriteCatalog }),
          }, { concurrency: 'unbounded' });
          // Per-scenario projections (emit + inbox) can run concurrently
          const perScenario = yield* Effect.all(
            selection.adoIds.map((adoId) => Effect.all({
              emitted: emitScenario({ adoId: adoId as AdoId, paths: options.paths, catalog: postWriteCatalog }),
              inbox: emitOperatorInbox({ paths: options.paths, catalog: postWriteCatalog, filter: { adoId: adoId as AdoId } }),
            }, { concurrency: 'unbounded' })),
            { concurrency: 'unbounded' },
          );
          return coreRuns.map((core, index) => ({
            ...core,
            confidence,
            graph,
            ...perScenario[index]!,
          }));
        });

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
