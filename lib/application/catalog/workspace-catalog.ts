import path from 'path';
import { Effect } from 'effect';
import { createSnapshotTemplateId } from '../../domain/identity';
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
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import { readJsonArtifact, readYamlArtifact } from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';
import type { KnowledgePosture } from '../../domain/types';
import { postureIncludesKnowledge } from '../../domain/types';

/** Stable sort on artifactPath ensures deterministic fingerprinting regardless of load order. */
function sortByArtifactPath<T>(envelopes: ArtifactEnvelope<T>[]): ArtifactEnvelope<T>[] {
  return [...envelopes].sort((a, b) => a.artifactPath.localeCompare(b.artifactPath));
}

function loadAllYaml<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readYamlArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
  ).pipe(Effect.map(sortByArtifactPath));
}

function loadAllJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
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
    Effect.catchTag('TesseractError', () => Effect.succeed(null as ArtifactEnvelope<T> | null)),
  );
}

function loadAllDisposableJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readDisposableJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
  ).pipe(Effect.map((results) => sortByArtifactPath(results.filter((entry): entry is ArtifactEnvelope<T> => entry !== null))));
}

function readDisposableSingleton<T>(
  paths: ProjectPaths, absolutePath: string, validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return readDisposableJsonArtifact(paths, absolutePath, validate, errorCode, `${label} ${absolutePath} failed validation`);
}

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
}

/** Walk a directory if the posture includes knowledge; otherwise return empty. */
function walkKnowledgeDir(
  fs: FileSystemPort, dir: string, posture: KnowledgePosture,
) {
  return postureIncludesKnowledge(posture)
    ? walkFiles(fs, dir)
    : Effect.succeed([] as string[]);
}

export function loadWorkspaceCatalog(options: LoadCatalogOptions) {
  const posture: KnowledgePosture = options.knowledgePosture ?? 'warm-start';

  return Effect.gen(function* () {
    const fs = yield* FileSystem;

    // Phase 1: Walk all independent directories in parallel.
    // Knowledge directories are gated by the knowledge posture —
    // cold-start returns empty arrays, forcing the system to learn from scratch.
    const walks = yield* Effect.all({
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
      runs: walkFiles(fs, options.paths.runsDir),
      routes: walkKnowledgeDir(fs, options.paths.routesDir, posture),
      discovery: walkFiles(fs, options.paths.discoveryDir),
      generated: walkFiles(fs, options.paths.generatedDir),
      inbox: walkFiles(fs, options.paths.inboxDir),
      approvals: walkFiles(fs, options.paths.approvalsDir),
      evidence: walkFiles(fs, options.paths.evidenceDir),
      sessions: walkFiles(fs, options.paths.sessionsDir),
      replays: walkFiles(fs, path.join(options.paths.learningDir, 'replays')),
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
      agentSessions: loadAllJson<AgentSession>(options.paths,
        walks.sessions.filter((f) => path.basename(f) === 'session.json'),
        validateAgentSession, 'agent-session-validation-failed', 'Agent session'),
      replayExamples: loadAllJson<ReplayExample>(options.paths,
        walks.replays.filter((f) => f.endsWith('.json')),
        validateReplayExample, 'replay-example-validation-failed', 'Replay example'),
    }, { concurrency: 'unbounded' });

    const knowledgeSnapshots = walks.knowledgeSnapshots
      .filter((filePath) => filePath.endsWith('.yaml'))
      .map((filePath) => ({
        relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
        artifactPath: relativeProjectPath(options.paths, filePath),
        absolutePath: filePath,
      }));

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

    const trustPolicy = yield* readYamlArtifact(
      options.paths,
      options.paths.trustPolicyPath,
      validateTrustPolicy,
      'trust-policy-validation-failed',
      `Trust policy ${options.paths.trustPolicyPath} failed validation`,
    );

    return {
      paths: options.paths,
      snapshots: loaded.snapshots,
      scenarios: loaded.scenarios,
      boundScenarios: loaded.boundScenarios,
      interpretationSurfaces: loaded.interpretationSurfaces,
      runRecords: loaded.runRecords,
      proposalBundles: loaded.proposalBundles,
      approvalReceipts: loaded.approvalReceipts,
      rerunPlans: loaded.rerunPlans,
      datasets: loaded.datasets,
      benchmarks: loaded.benchmarks,
      routeManifests: loaded.routeManifests,
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

export function loadSnapshotArtifact(options: { paths: ProjectPaths; adoId: AdoSnapshot['id'] }) {
  return readJsonArtifact(
    options.paths,
    snapshotPath(options.paths, options.adoId),
    validateAdoSnapshot,
    'snapshot-validation-failed',
    `Snapshot ${options.adoId} failed validation`,
  );
}
