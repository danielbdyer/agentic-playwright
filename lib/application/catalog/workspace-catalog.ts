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
  ScenarioTaskPacket,
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
  validateScenarioTaskPacket,
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
import { taskPacketFromSurface } from '../compat/surface-adapter';
import type { ProjectPaths } from '../paths';
import { boundPath, relativeProjectPath, snapshotPath } from '../paths';
import { FileSystem } from '../ports';
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import { readJsonArtifact, readYamlArtifact } from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';

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

export function loadWorkspaceCatalog(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;

    const surfaceFiles = (yield* walkFiles(fs, options.paths.surfacesDir)).filter((filePath) => filePath.endsWith('.surface.yaml'));
    const surfaces: ArtifactEnvelope<SurfaceGraph>[] = [];
    for (const filePath of surfaceFiles) {
      surfaces.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateSurfaceGraph,
        'surface-validation-failed',
        `Surface graph ${filePath} failed validation`,
      ));
    }

    const screenKnowledgeFiles = yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'));

    const elementFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.elements.yaml'));
    const screenElements: ArtifactEnvelope<ScreenElements>[] = [];
    for (const filePath of elementFiles) {
      screenElements.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateScreenElements,
        'elements-validation-failed',
        `Elements ${filePath} failed validation`,
      ));
    }

    const hintFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.hints.yaml'));
    const screenHints: ArtifactEnvelope<ScreenHints>[] = [];
    for (const filePath of hintFiles) {
      screenHints.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateScreenHints,
        'screen-hints-validation-failed',
        `Hints ${filePath} failed validation`,
      ));
    }

    const postureFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.postures.yaml'));
    const screenPostures: ArtifactEnvelope<ScreenPostures>[] = [];
    for (const filePath of postureFiles) {
      screenPostures.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateScreenPostures,
        'postures-validation-failed',
        `Postures ${filePath} failed validation`,
      ));
    }

    const behaviorFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.behavior.yaml'));
    const screenBehaviors: ArtifactEnvelope<ScreenBehavior>[] = [];
    for (const filePath of behaviorFiles) {
      screenBehaviors.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateScreenBehavior,
        'screen-behavior-validation-failed',
        `Screen behavior ${filePath} failed validation`,
      ));
    }

    const patternFiles = (yield* walkFiles(fs, options.paths.patternsDir))
      .filter((filePath) => filePath.endsWith('.yaml') && !filePath.endsWith('.behavior.yaml'));
    const patternDocuments: ArtifactEnvelope<PatternDocument>[] = [];
    for (const filePath of patternFiles) {
      patternDocuments.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validatePatternDocument,
        'pattern-document-validation-failed',
        `Pattern document ${filePath} failed validation`,
      ));
    }

    const behaviorPatternFiles = (yield* walkFiles(fs, options.paths.patternsDir)).filter((filePath) => filePath.endsWith('.behavior.yaml'));
    const behaviorPatterns: ArtifactEnvelope<BehaviorPatternDocument>[] = [];
    for (const filePath of behaviorPatternFiles) {
      behaviorPatterns.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateBehaviorPatternDocument,
        'behavior-pattern-document-validation-failed',
        `Behavior pattern ${filePath} failed validation`,
      ));
    }

    const datasetFiles = (yield* walkFiles(fs, options.paths.datasetsDir)).filter((filePath) => filePath.endsWith('.dataset.yaml'));
    const datasets: ArtifactEnvelope<DatasetControl>[] = [];
    for (const filePath of datasetFiles) {
      datasets.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateDatasetControl,
        'dataset-control-validation-failed',
        `Dataset control ${filePath} failed validation`,
      ));
    }

    const benchmarkFiles = (yield* walkFiles(fs, options.paths.benchmarksDir)).filter((filePath) => filePath.endsWith('.benchmark.yaml'));
    const benchmarks: ArtifactEnvelope<BenchmarkContext>[] = [];
    for (const filePath of benchmarkFiles) {
      benchmarks.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateBenchmarkContext,
        'benchmark-context-validation-failed',
        `Benchmark ${filePath} failed validation`,
      ));
    }

    const resolutionControlFiles = (yield* walkFiles(fs, options.paths.resolutionControlsDir)).filter((filePath) => filePath.endsWith('.resolution.yaml'));
    const resolutionControls: ArtifactEnvelope<ResolutionControl>[] = [];
    for (const filePath of resolutionControlFiles) {
      resolutionControls.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateResolutionControl,
        'resolution-control-validation-failed',
        `Resolution control ${filePath} failed validation`,
      ));
    }

    const runbookFiles = (yield* walkFiles(fs, options.paths.runbooksDir)).filter((filePath) => filePath.endsWith('.runbook.yaml'));
    const runbooks: ArtifactEnvelope<RunbookControl>[] = [];
    for (const filePath of runbookFiles) {
      runbooks.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateRunbookControl,
        'runbook-control-validation-failed',
        `Runbook ${filePath} failed validation`,
      ));
    }

    const knowledgeSnapshotFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'snapshots')))
      .filter((filePath) => filePath.endsWith('.yaml'));
    const knowledgeSnapshots = knowledgeSnapshotFiles.map((filePath) => ({
      relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
      artifactPath: relativeProjectPath(options.paths, filePath),
      absolutePath: filePath,
    }));

    const snapshotFiles = (yield* walkFiles(fs, options.paths.snapshotDir)).filter((filePath) => filePath.endsWith('.json'));
    const snapshots: ArtifactEnvelope<AdoSnapshot>[] = [];
    for (const filePath of snapshotFiles) {
      snapshots.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateAdoSnapshot,
        'snapshot-validation-failed',
        `Snapshot ${filePath} failed validation`,
      ));
    }

    const scenarioFiles = (yield* walkFiles(fs, options.paths.scenariosDir)).filter((filePath) => filePath.endsWith('.scenario.yaml'));
    const scenarios: ArtifactEnvelope<Scenario>[] = [];
    for (const filePath of scenarioFiles) {
      scenarios.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateScenario,
        'scenario-validation-failed',
        `Scenario ${filePath} failed validation`,
      ));
    }

    const boundFiles = (yield* walkFiles(fs, options.paths.boundDir)).filter((filePath) => filePath.endsWith('.json'));
    const boundScenarios: ArtifactEnvelope<BoundScenario>[] = [];
    for (const filePath of boundFiles) {
      boundScenarios.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateBoundScenario,
        'bound-scenario-validation-failed',
        `Bound scenario ${filePath} failed validation`,
      ));
    }

    const taskFiles = (yield* walkFiles(fs, options.paths.tasksDir)).filter((filePath) => filePath.endsWith('.resolution.json'));
    const interpretationSurfaces: ArtifactEnvelope<ScenarioInterpretationSurface>[] = [];
    const taskPackets: ArtifactEnvelope<ScenarioTaskPacket>[] = [];
    for (const filePath of taskFiles) {
      const surface = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateScenarioInterpretationSurface,
        'scenario-interpretation-surface-validation-failed',
        `Scenario interpretation surface ${filePath} failed validation`,
      );
      if (surface) {
        interpretationSurfaces.push(surface);
        taskPackets.push({
          ...surface,
          artifact: taskPacketFromSurface(surface.artifact),
          fingerprint: surface.fingerprint,
        });
        continue;
      }

      const taskPacket = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateScenarioTaskPacket,
        'task-packet-validation-failed',
        `Task packet ${filePath} failed validation`,
      );
      if (taskPacket) {
        taskPackets.push(taskPacket);
      }
    }

    const runFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'run.json');
    const runRecords: ArtifactEnvelope<RunRecord>[] = [];
    for (const filePath of runFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateRunRecord,
        'run-record-validation-failed',
        `Run record ${filePath} failed validation`,
      );
      if (artifact) runRecords.push(artifact);
    }

    const routeFiles = (yield* walkFiles(fs, options.paths.routesDir)).filter((filePath) => filePath.endsWith('.routes.yaml'));
    const routeManifests: ArtifactEnvelope<HarvestManifest>[] = [];
    for (const filePath of routeFiles) {
      routeManifests.push(yield* readYamlArtifact(
        options.paths,
        filePath,
        validateHarvestManifest,
        'harvest-manifest-validation-failed',
        `Harvest manifest ${filePath} failed validation`,
      ));
    }

    const discoveryFiles = (yield* walkFiles(fs, options.paths.discoveryDir)).filter((filePath) => path.basename(filePath) === 'crawl.json');
    const discoveryRuns: ArtifactEnvelope<DiscoveryRun>[] = [];
    for (const filePath of discoveryFiles) {
      discoveryRuns.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateDiscoveryRun,
        'discovery-run-validation-failed',
        `Discovery run ${filePath} failed validation`,
      ));
    }



    const resolutionGraphFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'resolution-graph.json');
    const resolutionGraphRecords: ArtifactEnvelope<ResolutionGraphRecord>[] = [];
    for (const filePath of resolutionGraphFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateResolutionGraphRecord,
        'resolution-graph-validation-failed',
        `Resolution graph ${filePath} failed validation`,
      );
      if (artifact) resolutionGraphRecords.push(artifact);
    }

    const interpretationDriftFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'interpretation-drift.json');
    const interpretationDriftRecords: ArtifactEnvelope<InterpretationDriftRecord>[] = [];
    for (const filePath of interpretationDriftFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateInterpretationDriftRecord,
        'interpretation-drift-validation-failed',
        `Interpretation drift ${filePath} failed validation`,
      );
      if (artifact) interpretationDriftRecords.push(artifact);
    }

    const proposalFiles = (yield* walkFiles(fs, options.paths.generatedDir)).filter((filePath) => filePath.endsWith('.proposals.json'));
    const proposalBundles: ArtifactEnvelope<ProposalBundle>[] = [];
    for (const filePath of proposalFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateProposalBundle,
        'proposal-bundle-validation-failed',
        `Proposal bundle ${filePath} failed validation`,
      );
      if (artifact) proposalBundles.push(artifact);
    }


    const rerunPlanFiles = (yield* walkFiles(fs, options.paths.inboxDir)).filter((filePath) => filePath.endsWith('.rerun-plan.json'));
    const rerunPlans: ArtifactEnvelope<RerunPlan>[] = [];
    for (const filePath of rerunPlanFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateRerunPlan,
        'rerun-plan-validation-failed',
        `Rerun plan ${filePath} failed validation`,
      );
      if (artifact) rerunPlans.push(artifact);
    }

    const approvalFiles = (yield* walkFiles(fs, options.paths.approvalsDir)).filter((filePath) => filePath.endsWith('.approval.json'));
    const approvalReceipts: ArtifactEnvelope<ApprovalReceipt>[] = [];
    for (const filePath of approvalFiles) {
      const artifact = yield* readDisposableJsonArtifact(
        options.paths,
        filePath,
        validateApprovalReceipt,
        'approval-receipt-validation-failed',
        `Approval receipt ${filePath} failed validation`,
      );
      if (artifact) approvalReceipts.push(artifact);
    }

    const evidenceFiles = (yield* walkFiles(fs, options.paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const evidenceRecords: ArtifactEnvelope<EvidenceRecord>[] = [];
    for (const filePath of evidenceFiles) {
      evidenceRecords.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        (value) => value as EvidenceRecord,
        'evidence-validation-failed',
        `Evidence ${filePath} failed validation`,
      ));
    }

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
      ? (() => Effect.gen(function* () {
          const result = yield* Effect.either(readJsonArtifact(
            options.paths,
            options.paths.interfaceGraphIndexPath,
            validateApplicationInterfaceGraph,
            'application-interface-graph-validation-failed',
            `Application interface graph ${options.paths.interfaceGraphIndexPath} failed validation`,
          ));
          return result._tag === 'Right' ? result.right : null;
        }))()
      : Effect.succeed(null as ArtifactEnvelope<ApplicationInterfaceGraph> | null);

    const selectorCanon = (yield* fs.exists(options.paths.selectorCanonPath))
      ? (() => Effect.gen(function* () {
          const result = yield* Effect.either(readJsonArtifact(
            options.paths,
            options.paths.selectorCanonPath,
            validateSelectorCanon,
            'selector-canon-validation-failed',
            `Selector canon ${options.paths.selectorCanonPath} failed validation`,
          ));
          return result._tag === 'Right' ? result.right : null;
        }))()
      : Effect.succeed(null as ArtifactEnvelope<SelectorCanon> | null);

    const stateGraph = (yield* fs.exists(options.paths.stateGraphPath))
      ? (() => Effect.gen(function* () {
          const result = yield* Effect.either(readJsonArtifact(
            options.paths,
            options.paths.stateGraphPath,
            validateStateTransitionGraph,
            'state-transition-graph-validation-failed',
            `State transition graph ${options.paths.stateGraphPath} failed validation`,
          ));
          return result._tag === 'Right' ? result.right : null;
        }))()
      : Effect.succeed(null as ArtifactEnvelope<StateTransitionGraph> | null);

    const sessionFiles = (yield* walkFiles(fs, options.paths.sessionsDir)).filter((filePath) => path.basename(filePath) === 'session.json');
    const agentSessions: ArtifactEnvelope<AgentSession>[] = [];
    for (const filePath of sessionFiles) {
      agentSessions.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateAgentSession,
        'agent-session-validation-failed',
        `Agent session ${filePath} failed validation`,
      ));
    }

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
    const replayExamples: ArtifactEnvelope<ReplayExample>[] = [];
    for (const filePath of replayFiles) {
      replayExamples.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateReplayExample,
        'replay-example-validation-failed',
        `Replay example ${filePath} failed validation`,
      ));
    }

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
      taskPackets,
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
      interfaceGraph: yield* interfaceGraph,
      selectorCanon: yield* selectorCanon,
      stateGraph: yield* stateGraph,
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
