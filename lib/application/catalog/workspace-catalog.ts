import path from 'path';
import { Effect } from 'effect';
import { createSnapshotTemplateId } from '../../domain/identity';
import { mergePatternDocuments } from '../../domain/knowledge/patterns';
import type {
  AdoSnapshot,
  ApprovalReceipt,
  BenchmarkContext,
  BoundScenario,
  ConfidenceOverlayCatalog,
  DatasetControl,
  EvidenceRecord,
  InterpretationDriftRecord,
  ResolutionGraphRecord,
  PatternDocument,
  ProposalBundle,
  ResolutionControl,
  RerunPlan,
  RunRecord,
  RunbookControl,
  Scenario,
  ScenarioTaskPacket,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from '../../domain/types';
import {
  validateAdoSnapshot,
  validateApprovalReceipt,
  validateBenchmarkContext,
  validateBoundScenario,
  validateConfidenceOverlayCatalog,
  validateDatasetControl,
  validatePatternDocument,
  validateProposalBundle,
  validateResolutionControl,
  validateRerunPlan,
  validateRunRecord,
  validateRunbookControl,
  validateScenario,
  validateScenarioTaskPacket,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSurfaceGraph,
  validateTrustPolicy,
  validateInterpretationDriftRecord,
  validateResolutionGraphRecord,
} from '../../domain/validation';
import { walkFiles } from '../artifacts';
import type { ProjectPaths } from '../paths';
import { boundPath, relativeProjectPath, snapshotPath } from '../paths';
import { FileSystem } from '../ports';
import { createArtifactEnvelope, upsertArtifactEnvelope } from './envelope';
import { readJsonArtifact, readYamlArtifact } from './loaders';
import { assembleScreenBundles } from './screen-bundles';
import type { ArtifactEnvelope, WorkspaceCatalog } from './types';

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

    const patternFiles = (yield* walkFiles(fs, options.paths.patternsDir)).filter((filePath) => filePath.endsWith('.yaml'));
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
    const taskPackets: ArtifactEnvelope<ScenarioTaskPacket>[] = [];
    for (const filePath of taskFiles) {
      taskPackets.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateScenarioTaskPacket,
        'task-packet-validation-failed',
        `Task packet ${filePath} failed validation`,
      ));
    }

    const runFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'run.json');
    const runRecords: ArtifactEnvelope<RunRecord>[] = [];
    for (const filePath of runFiles) {
      runRecords.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateRunRecord,
        'run-record-validation-failed',
        `Run record ${filePath} failed validation`,
      ));
    }



    const resolutionGraphFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'resolution-graph.json');
    const resolutionGraphRecords: ArtifactEnvelope<ResolutionGraphRecord>[] = [];
    for (const filePath of resolutionGraphFiles) {
      resolutionGraphRecords.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateResolutionGraphRecord,
        'resolution-graph-validation-failed',
        `Resolution graph ${filePath} failed validation`,
      ));
    }

    const interpretationDriftFiles = (yield* walkFiles(fs, options.paths.runsDir)).filter((filePath) => path.basename(filePath) === 'interpretation-drift.json');
    const interpretationDriftRecords: ArtifactEnvelope<InterpretationDriftRecord>[] = [];
    for (const filePath of interpretationDriftFiles) {
      interpretationDriftRecords.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateInterpretationDriftRecord,
        'interpretation-drift-validation-failed',
        `Interpretation drift ${filePath} failed validation`,
      ));
    }

    const proposalFiles = (yield* walkFiles(fs, options.paths.generatedDir)).filter((filePath) => filePath.endsWith('.proposals.json'));
    const proposalBundles: ArtifactEnvelope<ProposalBundle>[] = [];
    for (const filePath of proposalFiles) {
      proposalBundles.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateProposalBundle,
        'proposal-bundle-validation-failed',
        `Proposal bundle ${filePath} failed validation`,
      ));
    }


    const rerunPlanFiles = (yield* walkFiles(fs, options.paths.inboxDir)).filter((filePath) => filePath.endsWith('.rerun-plan.json'));
    const rerunPlans: ArtifactEnvelope<RerunPlan>[] = [];
    for (const filePath of rerunPlanFiles) {
      rerunPlans.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateRerunPlan,
        'rerun-plan-validation-failed',
        `Rerun plan ${filePath} failed validation`,
      ));
    }

    const approvalFiles = (yield* walkFiles(fs, options.paths.approvalsDir)).filter((filePath) => filePath.endsWith('.approval.json'));
    const approvalReceipts: ArtifactEnvelope<ApprovalReceipt>[] = [];
    for (const filePath of approvalFiles) {
      approvalReceipts.push(yield* readJsonArtifact(
        options.paths,
        filePath,
        validateApprovalReceipt,
        'approval-receipt-validation-failed',
        `Approval receipt ${filePath} failed validation`,
      ));
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
      taskPackets,
      runRecords,
      proposalBundles,
      approvalReceipts,
      rerunPlans,
      datasets,
      benchmarks,
      resolutionControls,
      runbooks,
      surfaces,
      screenElements,
      screenHints,
      screenPostures,
      screenBundles: assembleScreenBundles({ surfaces, screenElements, screenHints, screenPostures }),
      patternDocuments,
      mergedPatterns: mergePatternDocuments(patternDocuments.map((entry) => ({
        artifactPath: entry.artifactPath,
        artifact: entry.artifact,
      }))),
      knowledgeSnapshots,
      evidenceRecords,
      interpretationDriftRecords,
      resolutionGraphRecords,
      confidenceCatalog,
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
