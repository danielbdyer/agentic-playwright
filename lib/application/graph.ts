import path from 'path';
import { Effect } from 'effect';
import { deriveGraph } from '../domain/derived-graph';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type {
  BoundScenarioGraphArtifact,
  ConfidenceOverlayArtifact,
  DatasetControlArtifact,
  EvidenceArtifact,
  KnowledgeSnapshotArtifact,
  PolicyDecisionArtifact,
  ResolutionControlArtifact,
  RunbookControlArtifact,
  ScenarioGraphArtifact,
  ScreenHintsArtifact,
  SharedPatternsArtifact,
} from '../domain/derived-graph';
import type { DerivedGraph, ProposedChangeMetadata } from '../domain/types';
import { validateDerivedGraph } from '../domain/validation';
import { trySync } from './effect';
import type { ProjectPaths } from './paths';
import {
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  relativeProjectPath,
} from './paths';
import { FileSystem } from './ports';
import {
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { type ProjectionIncremental } from './projections/runner';
import { runIncrementalStage } from './pipeline';
import { evaluateArtifactPolicy, policyDecisionGraphTarget } from './trust-policy';
import type { TesseractError } from '../domain/errors';

export interface DerivedGraphProjectionResult {
  graph: DerivedGraph;
  graphPath: string;
  mcpCatalogPath: string;
  nodeCount: number;
  edgeCount: number;
  incremental: ProjectionIncremental;
}

export interface LoadedDerivedGraphResult {
  graph: DerivedGraph;
  graphPath: string;
  mcpCatalogPath: string;
  nodeCount: number;
  edgeCount: number;
  incremental: {
    status: 'loaded-existing';
  };
}

export type EnsuredDerivedGraphResult = DerivedGraphProjectionResult | LoadedDerivedGraphResult;

export interface GraphBuildResult {
  graph: DerivedGraph;
  graphPath: string;
  mcpCatalogPath: string;
  nodeCount: number;
  edgeCount: number;
  incremental: ProjectionIncremental;
}

function graphManifestPath(paths: ProjectPaths): string {
  return path.join(paths.graphDir, 'build-manifest.json');
}

export function buildDerivedGraph(
  options: { paths: ProjectPaths; catalog?: WorkspaceCatalog },
): Effect.Effect<DerivedGraphProjectionResult, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const inputFingerprints: ProjectionInputFingerprint[] = [
      fingerprintProjectionArtifact('policy', catalog.trustPolicy.artifactPath, catalog.trustPolicy.artifact),
      ...catalog.snapshots.map((entry) => fingerprintProjectionArtifact('snapshot', entry.artifactPath, entry.artifact)),
      ...catalog.surfaces.map((entry) => fingerprintProjectionArtifact('surface', entry.artifactPath, entry.artifact)),
      ...catalog.screenElements.map((entry) => fingerprintProjectionArtifact('elements', entry.artifactPath, entry.artifact)),
      ...catalog.screenPostures.map((entry) => fingerprintProjectionArtifact('postures', entry.artifactPath, entry.artifact)),
      ...catalog.screenHints.map((entry) => fingerprintProjectionArtifact('hints', entry.artifactPath, entry.artifact)),
      ...catalog.patternDocuments.map((entry) => fingerprintProjectionArtifact('patterns', entry.artifactPath, entry.artifact)),
      ...catalog.datasets.map((entry) => fingerprintProjectionArtifact('dataset-control', entry.artifactPath, entry.artifact)),
      ...catalog.resolutionControls.map((entry) => fingerprintProjectionArtifact('resolution-control', entry.artifactPath, entry.artifact)),
      ...catalog.runbooks.map((entry) => fingerprintProjectionArtifact('runbook-control', entry.artifactPath, entry.artifact)),
      ...catalog.scenarios.map((entry) => fingerprintProjectionArtifact('scenario', entry.artifactPath, entry.artifact)),
      ...catalog.boundScenarios.map((entry) => fingerprintProjectionArtifact('bound', entry.artifactPath, entry.artifact)),
      ...catalog.taskPackets.map((entry) => fingerprintProjectionArtifact('task', entry.artifactPath, entry.artifact)),
      ...catalog.runRecords.map((entry) => fingerprintProjectionArtifact('run', entry.artifactPath, entry.artifact)),
      ...catalog.interpretationDriftRecords.map((entry) => fingerprintProjectionArtifact('interpretation-drift', entry.artifactPath, entry.artifact)),
      ...catalog.proposalBundles.map((entry) => fingerprintProjectionArtifact('proposal-bundle', entry.artifactPath, entry.artifact)),
      ...catalog.evidenceRecords.map((entry) => fingerprintProjectionArtifact('evidence', entry.artifactPath, entry.artifact)),
      ...(catalog.confidenceCatalog ? [fingerprintProjectionArtifact('confidence-overlay-catalog', catalog.confidenceCatalog.artifactPath, catalog.confidenceCatalog.artifact)] : []),
    ];

    const snapshots = catalog.snapshots.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const surfaceGraphs = catalog.surfaces.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const knowledgeSnapshots: KnowledgeSnapshotArtifact[] = catalog.knowledgeSnapshots.map(({ relativePath, artifactPath }) => ({
      relativePath,
      artifactPath,
    }));
    const screenElements = catalog.screenElements.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const screenPostures = catalog.screenPostures.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const screenHints: ScreenHintsArtifact[] = catalog.screenHints.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const sharedPatterns: SharedPatternsArtifact[] = catalog.patternDocuments.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const datasets: DatasetControlArtifact[] = catalog.datasets.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const resolutionControls: ResolutionControlArtifact[] = catalog.resolutionControls.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const runbooks: RunbookControlArtifact[] = catalog.runbooks.map(({ artifact, artifactPath }) => ({ artifact, artifactPath }));
    const confidenceOverlays: ConfidenceOverlayArtifact[] = catalog.confidenceCatalog
      ? [{ artifact: catalog.confidenceCatalog.artifact, artifactPath: catalog.confidenceCatalog.artifactPath }]
      : [];

    const scenarios: ScenarioGraphArtifact[] = [];
    for (const entry of catalog.scenarios) {
      const generatedPath = generatedSpecPath(options.paths, entry.artifact.metadata.suite, entry.artifact.source.ado_id);
      const tracePath = generatedTracePath(options.paths, entry.artifact.metadata.suite, entry.artifact.source.ado_id);
      const reviewPath = generatedReviewPath(options.paths, entry.artifact.metadata.suite, entry.artifact.source.ado_id);
      scenarios.push({
        artifact: entry.artifact,
        artifactPath: entry.artifactPath,
        generatedSpecPath: relativeProjectPath(options.paths, generatedPath),
        generatedSpecExists: yield* fs.exists(generatedPath),
        generatedTracePath: relativeProjectPath(options.paths, tracePath),
        generatedTraceExists: yield* fs.exists(tracePath),
        generatedReviewPath: relativeProjectPath(options.paths, reviewPath),
        generatedReviewExists: yield* fs.exists(reviewPath),
      });
    }

    const boundScenarios: BoundScenarioGraphArtifact[] = catalog.boundScenarios.map(({ artifact, artifactPath }) => ({
      artifact,
      artifactPath,
    }));
    const taskPackets = catalog.taskPackets.map(({ artifact, artifactPath }) => ({
      artifact,
      artifactPath,
    }));
    const runRecords = catalog.runRecords.map(({ artifact, artifactPath }) => ({
      artifact,
      artifactPath,
    }));
    const interpretationDriftRecords = catalog.interpretationDriftRecords.map(({ artifact, artifactPath }) => ({
      artifact,
      artifactPath,
    }));

    const evidence: EvidenceArtifact[] = catalog.evidenceRecords.map(({ artifact, artifactPath }) => ({
      artifactPath,
      targetNodeId: policyDecisionGraphTarget({
        artifactType: artifact.evidence.scope as ProposedChangeMetadata['artifactType'],
        artifactPath: artifact.evidence.proposal.file,
      }),
    }));

    const policyDecisions: PolicyDecisionArtifact[] = catalog.evidenceRecords.map(({ artifact, artifactPath }) => {
      const proposedChange: ProposedChangeMetadata = {
        artifactType: artifact.evidence.scope as ProposedChangeMetadata['artifactType'],
        confidence: artifact.evidence.confidence,
        autoHealClass: artifact.evidence.trigger,
      };
      const evaluation = evaluateArtifactPolicy({
        policy: catalog.trustPolicy.artifact,
        proposedChange,
        evidence: catalog.evidenceRecords.map((entry) => ({ artifactPath: entry.artifactPath, record: entry.artifact })),
      });
      const targetNodeId = policyDecisionGraphTarget({
        artifactType: proposedChange.artifactType,
        artifactPath: artifact.evidence.proposal.file,
      });
      return {
        id: `${artifactPath}:${evaluation.decision}`,
        decision: evaluation.decision,
        artifactPath,
        targetNodeId,
        reasons: evaluation.reasons.map((reason) => reason.message),
      };
    });

    const manifestPath = graphManifestPath(options.paths);
    let cachedGraphForHit: ReturnType<typeof validateDerivedGraph> | null = null;

    return yield* runIncrementalStage<
      Omit<GraphBuildResult, 'incremental'>,
      GraphBuildResult,
      GraphBuildResult,
      TesseractError
    >({
      name: 'graph',
      manifestPath,
      inputFingerprints,
      outputFingerprint: null,
      verifyPersistedOutput: (expectedOutputFingerprint) => Effect.gen(function* () {
        const cachedGraphExists = yield* fs.exists(options.paths.graphIndexPath);
        if (!cachedGraphExists) {
          return { status: 'missing-output' as const };
        }

        const cachedGraphRaw = yield* fs.readJson(options.paths.graphIndexPath);
        const persistedFingerprint = fingerprintProjectionOutput(cachedGraphRaw);
        if (persistedFingerprint !== expectedOutputFingerprint) {
          return { status: 'invalid-output' as const };
        }

        const parsedCachedGraph = yield* Effect.either(
          trySync(
            () => validateDerivedGraph(cachedGraphRaw),
            'derived-graph-validation-failed',
            'Derived graph failed validation',
          ),
        );
        if (parsedCachedGraph._tag === 'Left') {
          return { status: 'invalid-output' as const };
        }

        cachedGraphForHit = parsedCachedGraph.right;

        return {
          status: 'ok' as const,
          outputFingerprint: persistedFingerprint,
        };
      }),
      persist: () => Effect.gen(function* () {
        const graph = deriveGraph({
          snapshots,
          surfaceGraphs,
          knowledgeSnapshots,
          screenElements,
          screenPostures,
          screenHints,
          sharedPatterns,
          datasets,
          resolutionControls,
          runbooks,
          confidenceOverlays,
          scenarios,
          boundScenarios,
          taskPackets,
          runRecords,
          interpretationDriftRecords,
          evidence,
          policyDecisions,
        });

        yield* fs.writeJson(options.paths.graphIndexPath, graph);
        yield* fs.writeJson(options.paths.mcpCatalogPath, {
          resources: graph.resources,
          resourceTemplates: graph.resourceTemplates,
        });

        return {
          result: {
            graph,
            graphPath: options.paths.graphIndexPath,
            mcpCatalogPath: options.paths.mcpCatalogPath,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
          },
          outputFingerprint: fingerprintProjectionOutput(graph),
          rewritten: [
            relativeProjectPath(options.paths, options.paths.graphIndexPath),
            relativeProjectPath(options.paths, options.paths.mcpCatalogPath),
            relativeProjectPath(options.paths, manifestPath),
          ],
        };
      }),
      withCacheHit: (incremental): DerivedGraphProjectionResult => {
        const graph = cachedGraphForHit;
        if (!graph) {
          throw new Error('Cache hit requested without validated graph state');
        }
        return {
          graph,
          graphPath: options.paths.graphIndexPath,
          mcpCatalogPath: options.paths.mcpCatalogPath,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          incremental,
        };
      },
      withCacheMiss: (built, incremental): DerivedGraphProjectionResult => ({
        ...built,
        incremental,
      }),
    });
  });
}

export function ensureDerivedGraph(
  options: { paths: ProjectPaths },
): Effect.Effect<EnsuredDerivedGraphResult, TesseractError, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(options.paths.graphIndexPath);
    if (!exists) {
      return yield* buildDerivedGraph(options);
    }

    const raw = yield* fs.readJson(options.paths.graphIndexPath);
    const graph = yield* trySync(
      () => validateDerivedGraph(raw),
      'derived-graph-validation-failed',
      'Derived graph failed validation',
    );

    return {
      graph,
      graphPath: options.paths.graphIndexPath,
      mcpCatalogPath: options.paths.mcpCatalogPath,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      incremental: {
        status: 'loaded-existing' as const,
      },
    };
  });
}
