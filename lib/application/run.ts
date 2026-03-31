import { Effect, Either, Option } from 'effect';
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
import { ExecutionContext, FileSystem, RuntimeScenarioRunner, Dashboard } from './ports';
import type { ExecutionPosture, Confidence, ActorKind } from '../domain/types';
import { dashboardEvent } from '../domain/types/intervention-context';
import type { AdoId } from '../domain/identity';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from './execution/select-run-context';
import { runPipelineStage } from './pipeline';
import { interpretScenarioFromPlan } from './execution/interpret';
import { persistEvidence } from './execution/persist-evidence';
import { buildProposals } from './execution/build-proposals';
import { buildRunRecord } from './execution/build-run-record';
import { foldScenarioRun } from './execution/fold';
import { resolveEffectConcurrency } from './concurrency';
import { TesseractError } from '../domain/errors';

// ─── Dashboard probe helpers (pure) ───

const RUNG_ORDER: readonly string[] = [
  'explicit', 'control', 'approved-screen-knowledge',
  'shared-patterns', 'prior-evidence', 'approved-equivalent-overlay',
  'structured-translation', 'live-dom', 'agent-interpreted', 'needs-human',
];

const rungToNumber = (rung: string): number => {
  const idx = RUNG_ORDER.indexOf(rung);
  return idx >= 0 ? idx : RUNG_ORDER.length;
};

const confidenceToNumber = (c: Confidence | string): number => {
  switch (c) {
    case 'human': return 1.0;
    case 'compiler-derived': return 0.95;
    case 'agent-verified': return 0.85;
    case 'agent-proposed': return 0.6;
    case 'intent-only': return 0.3;
    case 'unbound': return 0.1;
    default: return 0.5;
  }
};

export const getRequiredCatalogEntry = <T>(
  entry: T | undefined,
  onMissing: () => TesseractError,
): Either.Either<T, TesseractError> => Either.fromNullable(entry, onMissing);

export const foldOptionalProjection = <T, A>(
  projection: Option.Option<T>,
  branches: {
    readonly onMissing: () => A;
    readonly onPresent: (value: T) => A;
  },
): A => Option.match(projection, { onNone: branches.onMissing, onSome: branches.onPresent });

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
        const scenarioEntryEither = getRequiredCatalogEntry(
          catalog.scenarios.find((entry) => entry.artifact.source.ado_id === options.adoId),
          () => new TesseractError('run-plan-missing-scenario', `Missing scenario for ${options.adoId}`),
        );
        if (Either.isLeft(scenarioEntryEither)) {
          return yield* Effect.fail(scenarioEntryEither.left);
        }
        const scenarioEntry = scenarioEntryEither.right;
        const boundScenarioEntryEither = getRequiredCatalogEntry(
          catalog.boundScenarios.find((entry) => entry.artifact.source.ado_id === options.adoId),
          () => new TesseractError('run-plan-missing-scenario', `Missing bound scenario for ${options.adoId}`),
        );
        if (Either.isLeft(boundScenarioEntryEither)) {
          return yield* Effect.fail(boundScenarioEntryEither.left);
        }
        const boundScenarioEntry = boundScenarioEntryEither.right;
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

        // Emit element-probed events for dashboard visualization.
        // Fire-and-forget — never gates the pipeline.
        const dashboard = yield* Dashboard;
        yield* Effect.forEach(
          executionStage.stepResults,
          (step, idx) => {
            const r = step.interpretation;
            const actor: ActorKind = r.resolutionMode === 'agentic' ? 'agent'
              : r.resolutionMode === 'translation' ? 'agent'
              : 'system';
            const target = 'target' in r ? (r as { target: { element?: string; screen?: string } }).target : null;
            return dashboard.emit(dashboardEvent('element-probed', {
              id: `${options.adoId}-${plan.runId}-${idx}`,
              element: target?.element ?? `step-${idx}`,
              screen: target?.screen ?? 'unknown',
              boundingBox: null,
              locatorRung: rungToNumber(r.resolutionGraph?.winner?.rung ?? 'explicit'),
              strategy: r.winningSource,
              found: r.kind !== 'needs-human',
              confidence: confidenceToNumber(r.confidence),
              actor,
              governance: r.governance,
              resolutionMode: r.resolutionMode,
            }));
          },
          { concurrency: 1 },
        );

        // Emit element-escalated for resolution mode transitions (system→agent handoffs)
        for (const [idx, result] of executionStage.stepResults.slice(1).entries()) {
          const prev = executionStage.stepResults[idx]!.interpretation;
          const curr = result.interpretation;
          if (prev.resolutionMode !== curr.resolutionMode) {
            const i = idx + 1;
            const fromActor: ActorKind = prev.resolutionMode === 'agentic' ? 'agent' : 'system';
            const toActor: ActorKind = curr.resolutionMode === 'agentic' ? 'agent' : 'system';
            const currTarget = 'target' in curr ? (curr as { target: { element?: string; screen?: string } }).target : null;
            yield* dashboard.emit(dashboardEvent('element-escalated', {
              id: `esc-${options.adoId}-${plan.runId}-${i}`,
              element: currTarget?.element ?? `step-${i}`,
              screen: currTarget?.screen ?? 'unknown',
              fromActor,
              toActor,
              reason: `Resolution mode shifted from ${prev.resolutionMode} to ${curr.resolutionMode}`,
              governance: curr.governance,
              boundingBox: null,
            }));
          }
        }

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
          interfaceGraph: foldOptionalProjection(Option.fromNullable(catalog.interfaceGraph), {
            onMissing: () => null,
            onPresent: (interfaceGraph) => interfaceGraph.artifact,
          }),
          selectorCanon: foldOptionalProjection(Option.fromNullable(catalog.selectorCanon), {
            onMissing: () => null,
            onPresent: (selectorCanon) => selectorCanon.artifact,
          }),
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
          interfaceGraph: foldOptionalProjection(Option.fromNullable(catalog.interfaceGraph), {
            onMissing: () => null,
            onPresent: (interfaceGraph) => interfaceGraph.artifact,
          }),
          selectorCanon: foldOptionalProjection(Option.fromNullable(catalog.selectorCanon), {
            onMissing: () => null,
            onPresent: (selectorCanon) => selectorCanon.artifact,
          }),
          proposalBundle: activationStage.proposalBundle,
          learningManifest: learning.manifest,
        });

        const interpretationFile = interpretationPath(options.paths, options.adoId, plan.runId);
        const executionFile = executionPath(options.paths, options.adoId, plan.runId);
        const resolutionGraphFile = resolutionGraphPath(options.paths, options.adoId, plan.runId);
        const runFile = runRecordPath(options.paths, options.adoId, plan.runId);
        const proposalsFile = generatedProposalsPath(options.paths, scenarioEntry.artifact.metadata.suite, options.adoId);

        const writtenFiles = [interpretationFile, executionFile, resolutionGraphFile, runFile, proposalsFile];
        yield* Effect.all([
          fs.writeJson(interpretationFile, executionStage.interpretationOutput),
          fs.writeJson(executionFile, executionStage.executionOutput),
          fs.writeJson(resolutionGraphFile, executionStage.resolutionGraphOutput),
          fs.writeJson(runFile, runRecordStage.runRecord),
          fs.writeJson(proposalsFile, activationStage.proposalBundle),
        ], { concurrency: 'unbounded' });

        // Layer 3: emit artifact-written for each persisted file
        yield* Effect.forEach(
          writtenFiles,
          (filePath) => dashboard.emit(dashboardEvent('artifact-written', {
            path: filePath,
            operation: 'write-json',
          })),
          { concurrency: 1 },
        );

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
export function runScenarioProjections(options: { adoId: AdoId; paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const postWriteCatalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' }));
    const projections = yield* Effect.all({
      confidence: projectConfidenceOverlayCatalog({ paths: options.paths, catalog: postWriteCatalog }),
      emitted: emitScenario({ adoId: options.adoId, paths: options.paths, catalog: postWriteCatalog }),
      graph: buildDerivedGraph({ paths: options.paths, catalog: postWriteCatalog }),
      inbox: emitOperatorInbox({ paths: options.paths, catalog: postWriteCatalog, filter: { adoId: options.adoId } }),
    }, { concurrency: 'unbounded' });
    return { ...projections, postRunCatalog: postWriteCatalog };
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
    const { postRunCatalog, ...projections } = yield* runScenarioProjections({ adoId: options.adoId, paths: options.paths });
    return {
      ...core,
      ...projections,
      postRunCatalog,
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

    const { runs, postRunCatalog } = isSingleScenario
      ? yield* Effect.gen(function* () {
          const scenarioRuns = yield* Effect.all(
            selection.adoIds.map((adoId) => runScenario(buildRunOptions(adoId as AdoId))),
          );
          // Grab the post-run catalog from the last scenario run (single-scenario path)
          const postRunCatalog = foldOptionalProjection(Option.fromNullable(scenarioRuns[0]), {
            onMissing: () => null,
            onPresent: (scenarioRun) => scenarioRun.postRunCatalog,
          });
          return { runs: scenarioRuns, postRunCatalog: postRunCatalog as WorkspaceCatalog | null };
        })
      : yield* Effect.gen(function* () {
          const concurrency = resolveEffectConcurrency();
          const coreRuns = yield* Effect.all(
            selection.adoIds.map((adoId) => runScenarioCore(buildRunOptions(adoId as AdoId))),
            { concurrency },
          );
          // Single catalog reload + global projections after all runs complete
          // post-run scope suffices: includes runs + proposals, skips sessions/evidence
          const postWriteCatalog = yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' });
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
          return {
            runs: coreRuns.map((core, index) => ({
              ...core,
              confidence,
              graph,
              ...perScenario[index]!,
            })),
            postRunCatalog: postWriteCatalog as WorkspaceCatalog | null,
          };
        });

    return {
      selection: {
        adoIds: selection.adoIds,
        runbook: selection.runbook?.name ?? null,
        tag: options.tag ?? null,
      },
      runs,
      postRunCatalog,
    };
  });
}
