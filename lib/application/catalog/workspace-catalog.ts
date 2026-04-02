import path from 'path';
import { Effect } from 'effect';
import { resolveEffectConcurrency } from '../concurrency';
import { createSnapshotTemplateId } from '../../domain/kernel/identity';
import { mergePatternDocuments } from '../../domain/knowledge/patterns';
import type {
  AdoSnapshot,
  AgentSession,
  ApprovalReceipt,
  BenchmarkContext,
  BehaviorPatternDocument,
  BoundScenario,
  ApplicationInterfaceGraph,
  ConfidenceOverlayCatalog,
  DatasetControl,
  DiscoveryRun,
  EvidenceRecord,
  HarvestManifest,
  ImprovementRun,
  InterpretationDriftRecord,
  ReplayExample,
  ResolutionGraphRecord,
  PatternDocument,
  ProposalBundle,
  ResolutionControl,
  RerunPlan,
  RunRecord,
  RunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  SelectorCanon,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  StateTransitionGraph,
  SurfaceGraph,
  TrainingCorpusManifest,
} from '../../domain/types';
import {
  validateAdoSnapshot,
  validateAgentSession,
  validateApprovalReceipt,
  validateBenchmarkContext,
  validateBoundScenario,
  validateApplicationInterfaceGraph,
  validateConfidenceOverlayCatalog,
  validateDatasetControl,
  validateDiscoveryRun,
  validateHarvestManifest,
  validatePatternDocument,
  validateProposalBundle,
  validateReplayExample,
  validateResolutionControl,
  validateRerunPlan,
  validateRunRecord,
  validateRunbookControl,
  validateScenario,
  validateScenarioInterpretationSurface,
  validateScreenBehavior,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSelectorCanon,
  validateStateTransitionGraph,
  validateSurfaceGraph,
  validateTrainingCorpusManifest,
  validateTrustPolicy,
  validateInterpretationDriftRecord,
  validateResolutionGraphRecord,
  validateBehaviorPatternDocument,
} from '../../domain/validation';
import { walkFiles } from '../artifacts';
import type { ProjectPaths } from '../paths';
import { boundPath, relativeProjectPath, snapshotPath } from '../paths';
import { FileSystem, type FileSystemPort } from '../ports';
import { improvementLedgerPath, loadImprovementLedger } from '../improvement';
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import { readJsonArtifact, readYamlArtifact } from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';
import type { KnowledgePosture } from '../../domain/types';
import { postureIncludesKnowledge } from '../../domain/types';
import { parseSnapshotToScenario } from '../parse';
import { fingerprintArtifact } from './envelope';
import { projectScenarioToTier1 } from '../../domain/scenario/tier-projection';

/** Stable sort on artifactPath ensures deterministic fingerprinting regardless of load order. */
function sortByArtifactPath<T>(envelopes: ArtifactEnvelope<T>[]): ArtifactEnvelope<T>[] {
  return [...envelopes].sort((a, b) => a.artifactPath.localeCompare(b.artifactPath));
}

function normalizeRouteManifest(manifest: HarvestManifest): HarvestManifest {
  return {
    ...manifest,
    routes: [...manifest.routes]
      .map((route) => ({
        ...route,
        variants: [...route.variants]
          .map((variant) => ({
            ...variant,
            query: Object.fromEntries(Object.entries(variant.query ?? {}).sort((left, right) => left[0].localeCompare(right[0]))),
            state: Object.fromEntries(Object.entries(variant.state ?? {}).sort((left, right) => left[0].localeCompare(right[0]))),
            mappedScreens: [...new Set(variant.mappedScreens ?? [variant.screen])].sort((left, right) => left.localeCompare(right)),
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

const catalogIoConcurrency = resolveEffectConcurrency({ ceiling: 20 });

function loadAllYaml<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readYamlArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
    { concurrency: catalogIoConcurrency },
  ).pipe(Effect.map(sortByArtifactPath));
}

function loadAllJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
    { concurrency: catalogIoConcurrency },
  ).pipe(Effect.map(sortByArtifactPath));
}

function readDisposableJsonArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return readJsonArtifact(paths, absolutePath, validate, errorCode, errorMessage).pipe(
    Effect.map((envelope): ArtifactEnvelope<T> | null => envelope),
    Effect.catchAll(() => Effect.succeed(null as ArtifactEnvelope<T> | null)),
  );
}

function loadAllDisposableJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readDisposableJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
    { concurrency: catalogIoConcurrency },
  ).pipe(Effect.map((results) => sortByArtifactPath(results.filter((entry): entry is ArtifactEnvelope<T> => entry !== null))));
}

function readDisposableSingleton<T>(
  paths: ProjectPaths, absolutePath: string, validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return readDisposableJsonArtifact(paths, absolutePath, validate, errorCode, `${label} ${absolutePath} failed validation`);
}

/**
 * Controls how much of the workspace is loaded. Each scope is a strict
 * superset of the previous one, so callers that only need compilation
 * inputs avoid touching run records, sessions, evidence, or learning
 * artifacts — saving significant heap and I/O at scale.
 *
 * - `compile`:  scenarios + knowledge + controls + bound programs + trust policy.
 *               Skips: runs, sessions, evidence, proposals, learning, discovery,
 *               generated, inbox, approvals, replays.
 * - `post-run`: everything in compile + run records + proposal bundles +
 *               interpretation surfaces + resolution graph records + drift records.
 *               Skips: sessions, evidence, learning, discovery, replays.
 * - `full`:     current behavior — loads everything.
 */
export type CatalogScope = 'full' | 'compile' | 'post-run';

export interface LoadCatalogOptions {
  readonly paths: ProjectPaths;
  /**
   * Knowledge posture controls which tiers of content are loaded.
   *
   * - `cold-start`: Skip all pre-existing knowledge (screens, patterns, surfaces,
   *    snapshots, routes). The system must discover everything from scratch.
   * - `warm-start`: Load all canonical knowledge. Default for backward compatibility.
   * - `production`: Same as warm-start at runtime.
   */
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /**
   * Controls how much of the workspace to load. Defaults to `'full'`.
   * Use `'compile'` for pre-run catalog loads and `'post-run'` for
   * post-run loads in the dogfood loop to avoid loading unnecessary
   * artifacts and reduce memory pressure.
   */
  readonly scope?: CatalogScope | undefined;
}

/** Walk a directory if the posture includes knowledge; otherwise return empty. */
function walkKnowledgeDir(
  fs: FileSystemPort, dir: string, posture: KnowledgePosture,
) {
  return postureIncludesKnowledge(posture)
    ? walkFiles(fs, dir)
    : Effect.succeed([] as string[]);
}

const SCOPE_LEVEL: Record<CatalogScope, number> = { compile: 0, 'post-run': 1, full: 2 };

/** Walk a directory only when scope is at or above the required level. */
function walkScopedDir(
  fs: FileSystemPort, dir: string, scope: CatalogScope, requiredScope: CatalogScope,
): Effect.Effect<readonly string[], unknown, unknown> {
  return SCOPE_LEVEL[scope] >= SCOPE_LEVEL[requiredScope]
    ? walkFiles(fs, dir)
    : Effect.succeed([] as string[]);
}

/** Diagnostic counter: total loadWorkspaceCatalog calls since process start. */
let catalogLoadCount = 0;
/** Read the current catalog load count (for diagnostics/testing). */
export function getCatalogLoadCount(): number { return catalogLoadCount; }
/** Reset catalog load counter (for testing). */
export function resetCatalogLoadCount(): void { catalogLoadCount = 0; }

export function loadWorkspaceCatalog(options: LoadCatalogOptions) {
  const posture: KnowledgePosture = options.knowledgePosture ?? 'warm-start';
  const scope: CatalogScope = options.scope ?? 'full';

  return Effect.gen(function* () {
    catalogLoadCount += 1;
    const fs = yield* FileSystem;

    // Phase 1: Walk all independent directories in parallel.
    // Knowledge directories are gated by the knowledge posture —
    // cold-start returns empty arrays, forcing the system to learn from scratch.
    // Runtime-heavy directories (runs, sessions, evidence, etc.) are gated by scope
    // so that compile-only and post-run loads skip unnecessary I/O.
    const walks = yield* Effect.all({
      // Always loaded (compile-scope and above)
      surfaces: walkKnowledgeDir(fs, options.paths.surfacesDir, posture),
      screens: walkKnowledgeDir(fs, path.join(options.paths.knowledgeDir, 'screens'), posture),
      patterns: walkKnowledgeDir(fs, options.paths.patternsDir, posture),
      datasets: walkFiles(fs, options.paths.datasetsDir),
      benchmarks: walkFiles(fs, options.paths.benchmarksDir),
      resolutionControls: walkFiles(fs, options.paths.resolutionControlsDir),
      runbooks: walkFiles(fs, options.paths.runbooksDir),
      knowledgeSnapshots: walkKnowledgeDir(fs, path.join(options.paths.knowledgeDir, 'snapshots'), posture),
      snapshots: walkFiles(fs, options.paths.snapshotDir),
      scenarios: walkFiles(fs, options.paths.scenariosDir),
      bound: walkFiles(fs, options.paths.boundDir),
      tasks: walkFiles(fs, options.paths.tasksDir),
      routes: walkKnowledgeDir(fs, options.paths.routesDir, posture),

      // Post-run scope: run records, proposals, generated output, inbox, approvals
      runs: walkScopedDir(fs, options.paths.runsDir, scope, 'post-run'),
      generated: walkScopedDir(fs, options.paths.generatedDir, scope, 'post-run'),
      inbox: walkScopedDir(fs, options.paths.inboxDir, scope, 'post-run'),
      approvals: walkScopedDir(fs, options.paths.approvalsDir, scope, 'post-run'),

      // Full scope only: sessions, evidence, discovery, replays
      discovery: walkScopedDir(fs, options.paths.discoveryDir, scope, 'full'),
      evidence: walkScopedDir(fs, options.paths.evidenceDir, scope, 'full'),
      sessions: walkScopedDir(fs, options.paths.sessionsDir, scope, 'full'),
      replays: walkScopedDir(fs, path.join(options.paths.learningDir, 'replays'), scope, 'full'),
    }, { concurrency: 'unbounded' });

    // Phase 2: Load all artifact types in parallel (each group is independent)
    const loaded = yield* Effect.all({
      surfaces: loadAllYaml<SurfaceGraph>(options.paths,
        walks.surfaces.filter((f) => f.endsWith('.surface.yaml')),
        validateSurfaceGraph, 'surface-validation-failed', 'Surface graph'),
      screenElements: loadAllYaml<ScreenElements>(options.paths,
        walks.screens.filter((f) => f.endsWith('.elements.yaml')),
        validateScreenElements, 'elements-validation-failed', 'Elements'),
      screenHints: loadAllYaml<ScreenHints>(options.paths,
        walks.screens.filter((f) => f.endsWith('.hints.yaml')),
        validateScreenHints, 'screen-hints-validation-failed', 'Hints'),
      screenPostures: loadAllYaml<ScreenPostures>(options.paths,
        walks.screens.filter((f) => f.endsWith('.postures.yaml')),
        validateScreenPostures, 'postures-validation-failed', 'Postures'),
      screenBehaviors: loadAllYaml<ScreenBehavior>(options.paths,
        walks.screens.filter((f) => f.endsWith('.behavior.yaml')),
        validateScreenBehavior, 'screen-behavior-validation-failed', 'Screen behavior'),
      patternDocuments: loadAllYaml<PatternDocument>(options.paths,
        walks.patterns.filter((f) => f.endsWith('.yaml') && !f.endsWith('.behavior.yaml')),
        validatePatternDocument, 'pattern-document-validation-failed', 'Pattern document'),
      behaviorPatterns: loadAllYaml<BehaviorPatternDocument>(options.paths,
        walks.patterns.filter((f) => f.endsWith('.behavior.yaml')),
        validateBehaviorPatternDocument, 'behavior-pattern-document-validation-failed', 'Behavior pattern'),
      datasets: loadAllYaml<DatasetControl>(options.paths,
        walks.datasets.filter((f) => f.endsWith('.dataset.yaml')),
        validateDatasetControl, 'dataset-control-validation-failed', 'Dataset control'),
      benchmarks: loadAllYaml<BenchmarkContext>(options.paths,
        walks.benchmarks.filter((f) => f.endsWith('.benchmark.yaml')),
        validateBenchmarkContext, 'benchmark-context-validation-failed', 'Benchmark'),
      resolutionControls: loadAllYaml<ResolutionControl>(options.paths,
        walks.resolutionControls.filter((f) => f.endsWith('.resolution.yaml')),
        validateResolutionControl, 'resolution-control-validation-failed', 'Resolution control'),
      runbooks: loadAllYaml<RunbookControl>(options.paths,
        walks.runbooks.filter((f) => f.endsWith('.runbook.yaml')),
        validateRunbookControl, 'runbook-control-validation-failed', 'Runbook'),
      snapshots: loadAllJson<AdoSnapshot>(options.paths,
        walks.snapshots.filter((f) => f.endsWith('.json')),
        validateAdoSnapshot, 'snapshot-validation-failed', 'Snapshot'),
      scenarios: loadAllYaml<Scenario>(options.paths,
        walks.scenarios.filter((f) => f.endsWith('.scenario.yaml')),
        validateScenario, 'scenario-validation-failed', 'Scenario'),
      boundScenarios: loadAllJson<BoundScenario>(options.paths,
        walks.bound.filter((f) => f.endsWith('.json')),
        validateBoundScenario, 'bound-scenario-validation-failed', 'Bound scenario'),
      interpretationSurfaces: loadAllDisposableJson<ScenarioInterpretationSurface>(options.paths,
        walks.tasks.filter((f) => f.endsWith('.resolution.json')),
        validateScenarioInterpretationSurface, 'scenario-interpretation-surface-validation-failed', 'Scenario interpretation surface'),
      runRecords: loadAllDisposableJson<RunRecord>(options.paths,
        walks.runs.filter((f) => path.basename(f) === 'run.json'),
        validateRunRecord, 'run-record-validation-failed', 'Run record'),
      routeManifests: loadAllYaml<HarvestManifest>(options.paths,
        walks.routes.filter((f) => f.endsWith('.routes.yaml')),
        validateHarvestManifest, 'harvest-manifest-validation-failed', 'Harvest manifest'),
      discoveryRuns: loadAllJson<DiscoveryRun>(options.paths,
        walks.discovery.filter((f) => path.basename(f) === 'crawl.json'),
        validateDiscoveryRun, 'discovery-run-validation-failed', 'Discovery run'),
      resolutionGraphRecords: loadAllDisposableJson<ResolutionGraphRecord>(options.paths,
        walks.runs.filter((f) => path.basename(f) === 'resolution-graph.json'),
        validateResolutionGraphRecord, 'resolution-graph-validation-failed', 'Resolution graph'),
      interpretationDriftRecords: loadAllDisposableJson<InterpretationDriftRecord>(options.paths,
        walks.runs.filter((f) => path.basename(f) === 'interpretation-drift.json'),
        validateInterpretationDriftRecord, 'interpretation-drift-validation-failed', 'Interpretation drift'),
      proposalBundles: loadAllDisposableJson<ProposalBundle>(options.paths,
        walks.generated.filter((f) => f.endsWith('.proposals.json')),
        validateProposalBundle, 'proposal-bundle-validation-failed', 'Proposal bundle'),
      rerunPlans: loadAllDisposableJson<RerunPlan>(options.paths,
        walks.inbox.filter((f) => f.endsWith('.rerun-plan.json')),
        validateRerunPlan, 'rerun-plan-validation-failed', 'Rerun plan'),
      approvalReceipts: loadAllDisposableJson<ApprovalReceipt>(options.paths,
        walks.approvals.filter((f) => f.endsWith('.approval.json')),
        validateApprovalReceipt, 'approval-receipt-validation-failed', 'Approval receipt'),
      evidenceRecords: loadAllJson<EvidenceRecord>(options.paths,
        walks.evidence.filter((f) => f.endsWith('.json')),
        (value) => value as EvidenceRecord, 'evidence-validation-failed', 'Evidence'),
      agentSessions: loadAllDisposableJson<AgentSession>(options.paths,
        walks.sessions.filter((f) => path.basename(f) === 'session.json'),
        validateAgentSession, 'agent-session-validation-failed', 'Agent session'),
      replayExamples: loadAllJson<ReplayExample>(options.paths,
        walks.replays.filter((f) => f.endsWith('.json')),
        validateReplayExample, 'replay-example-validation-failed', 'Replay example'),
    }, { concurrency: 'unbounded' });

    const knowledgeSnapshots = walks.knowledgeSnapshots
      .flatMap((filePath) => filePath.endsWith('.yaml') ? [{
        relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
        artifactPath: relativeProjectPath(options.paths, filePath),
        absolutePath: filePath,
      }] : []);

    // Phase 3: Load optional singletons (conditional on existence)
    const confidenceCatalog = (yield* fs.exists(options.paths.confidenceIndexPath))
      ? yield* readJsonArtifact(
          options.paths,
          options.paths.confidenceIndexPath,
          validateConfidenceOverlayCatalog,
          'confidence-overlay-catalog-validation-failed',
          `Confidence overlay catalog ${options.paths.confidenceIndexPath} failed validation`,
        )
      : null as ArtifactEnvelope<ConfidenceOverlayCatalog> | null;

    const interfaceGraph = (yield* fs.exists(options.paths.interfaceGraphIndexPath))
      ? yield* readDisposableSingleton<ApplicationInterfaceGraph>(
          options.paths, options.paths.interfaceGraphIndexPath, validateApplicationInterfaceGraph,
          'application-interface-graph-validation-failed', 'Application interface graph')
      : null as ArtifactEnvelope<ApplicationInterfaceGraph> | null;

    const selectorCanon = (yield* fs.exists(options.paths.selectorCanonPath))
      ? yield* readDisposableSingleton<SelectorCanon>(
          options.paths, options.paths.selectorCanonPath, validateSelectorCanon,
          'selector-canon-validation-failed', 'Selector canon')
      : null as ArtifactEnvelope<SelectorCanon> | null;

    const stateGraph = (yield* fs.exists(options.paths.stateGraphPath))
      ? yield* readDisposableSingleton<StateTransitionGraph>(
          options.paths, options.paths.stateGraphPath, validateStateTransitionGraph,
          'state-transition-graph-validation-failed', 'State transition graph')
      : null as ArtifactEnvelope<StateTransitionGraph> | null;

    const learningManifest = (yield* fs.exists(options.paths.learningManifestPath))
      ? yield* readJsonArtifact(
          options.paths,
          options.paths.learningManifestPath,
          validateTrainingCorpusManifest,
          'training-corpus-manifest-validation-failed',
          `Training corpus manifest ${options.paths.learningManifestPath} failed validation`,
        )
      : null as ArtifactEnvelope<TrainingCorpusManifest> | null;

    const improvementRuns = (() => {
      const absolutePath = improvementLedgerPath(options.paths);
      return fs.exists(absolutePath).pipe(
        Effect.flatMap((exists) =>
          exists
            ? loadImprovementLedger(options.paths).pipe(
                Effect.map((ledger) =>
                  ledger.runs.map((run) => createArtifactEnvelope(options.paths, absolutePath, run)),
                ),
              )
            : Effect.succeed([] as ArtifactEnvelope<ImprovementRun>[]),
        ),
      );
    })();

    const trustPolicy = yield* readYamlArtifact(
      options.paths,
      options.paths.trustPolicyPath,
      validateTrustPolicy,
      'trust-policy-validation-failed',
      `Trust policy ${options.paths.trustPolicyPath} failed validation`,
    );

    // In cold-start mode, derive scenarios directly from ADO snapshots rather than
    // loading authored scenario files. The snapshot IS the Tier 1 source of truth —
    // there is no need to load a derivative and strip it back to intent-only.
    // In warm/production posture, use authored scenarios as-is. In cold-start,
    // derive from snapshots (Tier 1 by construction) and apply projectScenarioToTier1
    // as a guard to ensure no Tier 2 data leaks through authored scenarios.
    const scenarios: ArtifactEnvelope<Scenario>[] = postureIncludesKnowledge(posture)
      ? loaded.scenarios
      : loaded.snapshots.length > 0
        ? loaded.snapshots.map((snapshotEnvelope) => {
            const scenario = parseSnapshotToScenario(snapshotEnvelope.artifact);
            return {
              artifact: scenario,
              artifactPath: `derived://snapshot/${snapshotEnvelope.artifact.id}`,
              absolutePath: snapshotEnvelope.absolutePath,
              fingerprint: fingerprintArtifact(scenario),
            };
          })
        : loaded.scenarios.map((entry) => ({
            ...entry,
            artifact: projectScenarioToTier1(entry.artifact),
            fingerprint: fingerprintArtifact(projectScenarioToTier1(entry.artifact)),
          }));

    return {
      paths: options.paths,
      snapshots: loaded.snapshots,
      scenarios,
      boundScenarios: loaded.boundScenarios,
      interpretationSurfaces: loaded.interpretationSurfaces,
      runRecords: loaded.runRecords,
      proposalBundles: loaded.proposalBundles,
      approvalReceipts: loaded.approvalReceipts,
      rerunPlans: loaded.rerunPlans,
      datasets: loaded.datasets,
      benchmarks: loaded.benchmarks,
      routeManifests: loaded.routeManifests.map((entry) => {
        const normalized = normalizeRouteManifest(entry.artifact);
        return {
          ...entry,
          artifact: normalized,
          fingerprint: fingerprintArtifact(normalized),
        };
      }),
      resolutionControls: loaded.resolutionControls,
      runbooks: loaded.runbooks,
      surfaces: loaded.surfaces,
      screenElements: loaded.screenElements,
      screenHints: loaded.screenHints,
      screenPostures: loaded.screenPostures,
      screenBehaviors: loaded.screenBehaviors,
      screenBundles: assembleScreenBundles({
        surfaces: loaded.surfaces,
        screenElements: loaded.screenElements,
        screenHints: loaded.screenHints,
        screenPostures: loaded.screenPostures,
      }),
      patternDocuments: loaded.patternDocuments,
      behaviorPatterns: loaded.behaviorPatterns,
      mergedPatterns: mergePatternDocuments(loaded.patternDocuments.map((entry) => ({
        artifactPath: entry.artifactPath,
        artifact: entry.artifact,
      }))),
      knowledgeSnapshots,
      discoveryRuns: loaded.discoveryRuns,
      evidenceRecords: loaded.evidenceRecords,
      interpretationDriftRecords: loaded.interpretationDriftRecords,
      resolutionGraphRecords: loaded.resolutionGraphRecords,
      confidenceCatalog,
      interfaceGraph,
      selectorCanon,
      stateGraph,
      agentSessions: loaded.agentSessions,
      improvementRuns: yield* improvementRuns,
      learningManifest,
      replayExamples: loaded.replayExamples,
      trustPolicy,
    } satisfies WorkspaceCatalog;
  });
}

export function upsertWorkspaceCatalogScenario(
  catalog: WorkspaceCatalog,
  input: { scenario: Scenario; scenarioPath: string },
): WorkspaceCatalog {
  const entry = createArtifactEnvelope(catalog.paths, input.scenarioPath, input.scenario);
  return {
    ...catalog,
    scenarios: upsertArtifactEnvelope(
      catalog.scenarios,
      entry,
      (candidate) => candidate.artifact.source.ado_id === input.scenario.source.ado_id,
    ),
  };
}

export function upsertWorkspaceCatalogBoundScenario(
  catalog: WorkspaceCatalog,
  input: { boundScenario: BoundScenario; boundPath: string },
): WorkspaceCatalog {
  const entry = createArtifactEnvelope(catalog.paths, input.boundPath, input.boundScenario);
  return {
    ...catalog,
    boundScenarios: upsertArtifactEnvelope(
      catalog.boundScenarios,
      entry,
      (candidate) => candidate.artifact.source.ado_id === input.boundScenario.source.ado_id,
    ),
  };
}

export function loadScenarioArtifact(options: { paths: ProjectPaths; adoId: AdoSnapshot['id'] }) {
  return Effect.gen(function* () {
    const target = boundPath(options.paths, options.adoId);
    return yield* readJsonArtifact(
      options.paths,
      target,
      validateBoundScenario,
      'bound-scenario-validation-failed',
      `Bound scenario ${options.adoId} failed validation`,
    );
  });
}

/**
 * Delta-reload only proposals and run records into an existing catalog.
 *
 * After proposal activation in the improvement loop, the full catalog is
 * already loaded. Only proposals and run records change. This avoids
 * re-walking and re-parsing all scenarios, knowledge, controls, and other
 * stable artifacts, saving 30-40% of per-iteration catalog reload time.
 */
export function deltaReloadProposalsAndRuns(
  catalog: WorkspaceCatalog,
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const [generatedFiles, runFiles] = yield* Effect.all([
      walkFiles(fs, catalog.paths.generatedDir),
      walkFiles(fs, catalog.paths.runsDir),
    ], { concurrency: 'unbounded' });

    const [proposalBundles, runRecords, resolutionGraphRecords, interpretationDriftRecords] = yield* Effect.all([
      loadAllDisposableJson<ProposalBundle>(catalog.paths,
        generatedFiles.filter((f) => f.endsWith('.proposals.json')),
        validateProposalBundle, 'proposal-bundle-validation-failed', 'Proposal bundle'),
      loadAllDisposableJson<RunRecord>(catalog.paths,
        runFiles.filter((f) => path.basename(f) === 'run.json'),
        validateRunRecord, 'run-record-validation-failed', 'Run record'),
      loadAllDisposableJson<ResolutionGraphRecord>(catalog.paths,
        runFiles.filter((f) => path.basename(f) === 'resolution-graph.json'),
        validateResolutionGraphRecord, 'resolution-graph-validation-failed', 'Resolution graph'),
      loadAllDisposableJson<InterpretationDriftRecord>(catalog.paths,
        runFiles.filter((f) => path.basename(f) === 'interpretation-drift.json'),
        validateInterpretationDriftRecord, 'interpretation-drift-validation-failed', 'Interpretation drift'),
    ], { concurrency: 'unbounded' });

    return {
      ...catalog,
      proposalBundles,
      runRecords,
      resolutionGraphRecords,
      interpretationDriftRecords,
    } satisfies WorkspaceCatalog;
  });
}

export function loadSnapshotArtifact(options: { paths: ProjectPaths; adoId: AdoSnapshot['id'] }) {
  return readJsonArtifact(
    options.paths,
    snapshotPath(options.paths, options.adoId),
    validateAdoSnapshot,
    'snapshot-validation-failed',
    `Snapshot ${options.adoId} failed validation`,
  );
}
