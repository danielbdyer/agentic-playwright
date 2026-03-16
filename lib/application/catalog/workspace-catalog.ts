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
import { FileSystem } from '../ports';
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import { readJsonArtifact, readYamlArtifact } from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';

function loadAllYaml<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readYamlArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`));
}

function loadAllJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`));
}

function readDisposableJsonArtifact<T>(
  paths: ProjectPaths,
  absolutePath: string,
  validate: (value: unknown) => T,
  errorCode: string,
  errorMessage: string,
) {
  return Effect.gen(function* () {
    const result = yield* Effect.either(readJsonArtifact(
      paths,
      absolutePath,
      validate,
      errorCode,
      errorMessage,
    ));
    return result._tag === 'Right' ? result.right : null as ArtifactEnvelope<T> | null;
  });
}

function loadAllDisposableJson<T>(
  paths: ProjectPaths, files: readonly string[], validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return Effect.forEach(files, (filePath) =>
    readDisposableJsonArtifact(paths, filePath, validate, errorCode, `${label} ${filePath} failed validation`),
  ).pipe(Effect.map((results) => results.filter((entry): entry is ArtifactEnvelope<T> => entry !== null)));
}

function readDisposableSingleton<T>(
  paths: ProjectPaths, absolutePath: string, validate: (value: unknown) => T, errorCode: string, label: string,
) {
  return readDisposableJsonArtifact(paths, absolutePath, validate, errorCode, `${label} ${absolutePath} failed validation`);
}

export function loadWorkspaceCatalog(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;

    const surfaceFiles = (yield* walkFiles(fs, options.paths.surfacesDir)).filter((filePath) => filePath.endsWith('.surface.yaml'));
    const surfaces = yield* loadAllYaml<SurfaceGraph>(options.paths, surfaceFiles, validateSurfaceGraph, 'surface-validation-failed', 'Surface graph');

    const screenKnowledgeFiles = yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'));

    const screenElements = yield* loadAllYaml<ScreenElements>(
      options.paths, screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.elements.yaml')),
      validateScreenElements, 'elements-validation-failed', 'Elements');

    const screenHints = yield* loadAllYaml<ScreenHints>(
      options.paths, screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.hints.yaml')),
      validateScreenHints, 'screen-hints-validation-failed', 'Hints');

    const screenPostures = yield* loadAllYaml<ScreenPostures>(
      options.paths, screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.postures.yaml')),
      validateScreenPostures, 'postures-validation-failed', 'Postures');

    const screenBehaviors = yield* loadAllYaml<ScreenBehavior>(
      options.paths, screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.behavior.yaml')),
      validateScreenBehavior, 'screen-behavior-validation-failed', 'Screen behavior');

    const patternFiles = (yield* walkFiles(fs, options.paths.patternsDir))
      .filter((filePath) => filePath.endsWith('.yaml') && !filePath.endsWith('.behavior.yaml'));
    const patternDocuments = yield* loadAllYaml<PatternDocument>(options.paths, patternFiles, validatePatternDocument, 'pattern-document-validation-failed', 'Pattern document');

    const behaviorPatternFiles = (yield* walkFiles(fs, options.paths.patternsDir)).filter((filePath) => filePath.endsWith('.behavior.yaml'));
    const behaviorPatterns = yield* loadAllYaml<BehaviorPatternDocument>(options.paths, behaviorPatternFiles, validateBehaviorPatternDocument, 'behavior-pattern-document-validation-failed', 'Behavior pattern');

    const datasetFiles = (yield* walkFiles(fs, options.paths.datasetsDir)).filter((filePath) => filePath.endsWith('.dataset.yaml'));
    const datasets = yield* loadAllYaml<DatasetControl>(options.paths, datasetFiles, validateDatasetControl, 'dataset-control-validation-failed', 'Dataset control');

    const benchmarkFiles = (yield* walkFiles(fs, options.paths.benchmarksDir)).filter((filePath) => filePath.endsWith('.benchmark.yaml'));
    const benchmarks = yield* loadAllYaml<BenchmarkContext>(options.paths, benchmarkFiles, validateBenchmarkContext, 'benchmark-context-validation-failed', 'Benchmark');

    const resolutionControlFiles = (yield* walkFiles(fs, options.paths.resolutionControlsDir)).filter((filePath) => filePath.endsWith('.resolution.yaml'));
    const resolutionControls = yield* loadAllYaml<ResolutionControl>(options.paths, resolutionControlFiles, validateResolutionControl, 'resolution-control-validation-failed', 'Resolution control');

    const runbookFiles = (yield* walkFiles(fs, options.paths.runbooksDir)).filter((filePath) => filePath.endsWith('.runbook.yaml'));
    const runbooks = yield* loadAllYaml<RunbookControl>(options.paths, runbookFiles, validateRunbookControl, 'runbook-control-validation-failed', 'Runbook');

    const knowledgeSnapshotFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'snapshots')))
      .filter((filePath) => filePath.endsWith('.yaml'));
    const knowledgeSnapshots = knowledgeSnapshotFiles.map((filePath) => ({
      relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
      artifactPath: relativeProjectPath(options.paths, filePath),
      absolutePath: filePath,
    }));

    const snapshotFiles = (yield* walkFiles(fs, options.paths.snapshotDir)).filter((filePath) => filePath.endsWith('.json'));
    const snapshots = yield* loadAllJson<AdoSnapshot>(options.paths, snapshotFiles, validateAdoSnapshot, 'snapshot-validation-failed', 'Snapshot');

    const scenarioFiles = (yield* walkFiles(fs, options.paths.scenariosDir)).filter((filePath) => filePath.endsWith('.scenario.yaml'));
    const scenarios = yield* loadAllYaml<Scenario>(options.paths, scenarioFiles, validateScenario, 'scenario-validation-failed', 'Scenario');

    const boundFiles = (yield* walkFiles(fs, options.paths.boundDir)).filter((filePath) => filePath.endsWith('.json'));
    const boundScenarios = yield* loadAllJson<BoundScenario>(options.paths, boundFiles, validateBoundScenario, 'bound-scenario-validation-failed', 'Bound scenario');

    const taskFiles = (yield* walkFiles(fs, options.paths.tasksDir)).filter((filePath) => filePath.endsWith('.resolution.json'));
    const interpretationSurfaces = yield* loadAllDisposableJson<ScenarioInterpretationSurface>(
      options.paths, taskFiles, validateScenarioInterpretationSurface, 'scenario-interpretation-surface-validation-failed', 'Scenario interpretation surface');

    const runFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'run.json');
    const runRecords = yield* loadAllDisposableJson<RunRecord>(options.paths, runFiles, validateRunRecord, 'run-record-validation-failed', 'Run record');

    const routeFiles = (yield* walkFiles(fs, options.paths.routesDir)).filter((filePath) => filePath.endsWith('.routes.yaml'));
    const routeManifests = yield* loadAllYaml<HarvestManifest>(options.paths, routeFiles, validateHarvestManifest, 'harvest-manifest-validation-failed', 'Harvest manifest');

    const discoveryFiles = (yield* walkFiles(fs, options.paths.discoveryDir)).filter((filePath) => path.basename(filePath) === 'crawl.json');
    const discoveryRuns = yield* loadAllJson<DiscoveryRun>(options.paths, discoveryFiles, validateDiscoveryRun, 'discovery-run-validation-failed', 'Discovery run');

    const resolutionGraphFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'resolution-graph.json');
    const resolutionGraphRecords = yield* loadAllDisposableJson<ResolutionGraphRecord>(
      options.paths, resolutionGraphFiles, validateResolutionGraphRecord, 'resolution-graph-validation-failed', 'Resolution graph');

    const interpretationDriftFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'interpretation-drift.json');
    const interpretationDriftRecords = yield* loadAllDisposableJson<InterpretationDriftRecord>(
      options.paths, interpretationDriftFiles, validateInterpretationDriftRecord, 'interpretation-drift-validation-failed', 'Interpretation drift');

    const proposalFiles = (yield* walkFiles(fs, options.paths.generatedDir)).filter((filePath) => filePath.endsWith('.proposals.json'));
    const proposalBundles = yield* loadAllDisposableJson<ProposalBundle>(options.paths, proposalFiles, validateProposalBundle, 'proposal-bundle-validation-failed', 'Proposal bundle');

    const rerunPlanFiles = (yield* walkFiles(fs, options.paths.inboxDir)).filter((filePath) => filePath.endsWith('.rerun-plan.json'));
    const rerunPlans = yield* loadAllDisposableJson<RerunPlan>(options.paths, rerunPlanFiles, validateRerunPlan, 'rerun-plan-validation-failed', 'Rerun plan');

    const approvalFiles = (yield* walkFiles(fs, options.paths.approvalsDir)).filter((filePath) => filePath.endsWith('.approval.json'));
    const approvalReceipts = yield* loadAllDisposableJson<ApprovalReceipt>(options.paths, approvalFiles, validateApprovalReceipt, 'approval-receipt-validation-failed', 'Approval receipt');

    const evidenceFiles = (yield* walkFiles(fs, options.paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const evidenceRecords = yield* loadAllJson<EvidenceRecord>(options.paths, evidenceFiles, (value) => value as EvidenceRecord, 'evidence-validation-failed', 'Evidence');

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

    const sessionFiles = (yield* walkFiles(fs, options.paths.sessionsDir)).filter((filePath) => path.basename(filePath) === 'session.json');
    const agentSessions = yield* loadAllJson<AgentSession>(options.paths, sessionFiles, validateAgentSession, 'agent-session-validation-failed', 'Agent session');

    const learningManifest = (yield* fs.exists(options.paths.learningManifestPath))
      ? yield* readJsonArtifact(
          options.paths,
          options.paths.learningManifestPath,
          validateTrainingCorpusManifest,
          'training-corpus-manifest-validation-failed',
          `Training corpus manifest ${options.paths.learningManifestPath} failed validation`,
        )
      : null as ArtifactEnvelope<TrainingCorpusManifest> | null;

    const replayFiles = (yield* walkFiles(fs, path.join(options.paths.learningDir, 'replays')))
      .filter((filePath) => filePath.endsWith('.json'));
    const replayExamples = yield* loadAllJson<ReplayExample>(options.paths, replayFiles, validateReplayExample, 'replay-example-validation-failed', 'Replay example');

    const trustPolicy = yield* readYamlArtifact(
      options.paths,
      options.paths.trustPolicyPath,
      validateTrustPolicy,
      'trust-policy-validation-failed',
      `Trust policy ${options.paths.trustPolicyPath} failed validation`,
    );

    return {
      paths: options.paths,
      snapshots,
      scenarios,
      boundScenarios,
      interpretationSurfaces,
      runRecords,
      proposalBundles,
      approvalReceipts,
      rerunPlans,
      datasets,
      benchmarks,
      routeManifests,
      resolutionControls,
      runbooks,
      surfaces,
      screenElements,
      screenHints,
      screenPostures,
      screenBehaviors,
      screenBundles: assembleScreenBundles({ surfaces, screenElements, screenHints, screenPostures }),
      patternDocuments,
      behaviorPatterns,
      mergedPatterns: mergePatternDocuments(patternDocuments.map((entry) => ({
        artifactPath: entry.artifactPath,
        artifact: entry.artifact,
      }))),
      knowledgeSnapshots,
      discoveryRuns,
      evidenceRecords,
      interpretationDriftRecords,
      resolutionGraphRecords,
      confidenceCatalog,
      interfaceGraph,
      selectorCanon,
      stateGraph,
      agentSessions,
      learningManifest,
      replayExamples,
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
