import path from 'path';
import { Effect } from 'effect';
import { deriveGraph } from '../domain/derived-graph';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type {
  BoundScenarioGraphArtifact,
  EvidenceArtifact,
  KnowledgeSnapshotArtifact,
  PolicyDecisionArtifact,
  ScenarioGraphArtifact,
  ScreenHintsArtifact,
  SharedPatternsArtifact,
} from '../domain/derived-graph';
import type { ProposedChangeMetadata } from '../domain/types';
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
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  fingerprintProjectionArtifact,
  fingerprintProjectionOutput,
  parseProjectionManifest,
  type ProjectionBuildManifest,
  type ProjectionCacheInvalidationReason,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { evaluateArtifactPolicy, policyDecisionGraphTarget } from './trust-policy';

function graphManifestPath(paths: ProjectPaths): string {
  return path.join(paths.graphDir, 'build-manifest.json');
}

export function buildDerivedGraph(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
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
      ...catalog.scenarios.map((entry) => fingerprintProjectionArtifact('scenario', entry.artifactPath, entry.artifact)),
      ...catalog.boundScenarios.map((entry) => fingerprintProjectionArtifact('bound', entry.artifactPath, entry.artifact)),
      ...catalog.evidenceRecords.map((entry) => fingerprintProjectionArtifact('evidence', entry.artifactPath, entry.artifact)),
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
    const previousManifest = (yield* fs.exists(manifestPath))
      ? parseProjectionManifest(yield* fs.readJson(manifestPath), 'graph')
      : null;
    const inputSetFingerprint = computeProjectionInputSetFingerprint(inputFingerprints);
    const { sortedInputs, changedInputs, removedInputs } = diffProjectionInputs(inputFingerprints, previousManifest);

    let cacheInvalidationReason: ProjectionCacheInvalidationReason | null = null;
    if (previousManifest && previousManifest.inputSetFingerprint === inputSetFingerprint) {
      const cachedGraphExists = yield* fs.exists(options.paths.graphIndexPath);
      if (!cachedGraphExists) {
        cacheInvalidationReason = 'missing-output';
      } else {
        const cachedGraphRaw = yield* fs.readJson(options.paths.graphIndexPath);
        const outputFingerprint = fingerprintProjectionOutput(cachedGraphRaw);
        if (outputFingerprint !== previousManifest.outputFingerprint) {
          cacheInvalidationReason = 'invalid-output';
        } else {
          const parsedCachedGraph = yield* Effect.either(
            trySync(
              () => validateDerivedGraph(cachedGraphRaw),
              'derived-graph-validation-failed',
              'Derived graph failed validation',
            ),
          );
          if (parsedCachedGraph._tag === 'Left') {
            cacheInvalidationReason = 'invalid-output';
          } else {
            const cachedGraph = parsedCachedGraph.right;
            return {
              graph: cachedGraph,
              graphPath: options.paths.graphIndexPath,
              mcpCatalogPath: options.paths.mcpCatalogPath,
              nodeCount: cachedGraph.nodes.length,
              edgeCount: cachedGraph.edges.length,
              incremental: {
                status: 'cache-hit' as const,
                inputSetFingerprint,
                outputFingerprint,
                changedInputs,
                removedInputs,
                rewritten: [] as string[],
              },
            };
          }
        }
      }
    }

    const graph = deriveGraph({
      snapshots,
      surfaceGraphs,
      knowledgeSnapshots,
      screenElements,
      screenPostures,
      screenHints,
      sharedPatterns,
      scenarios,
      boundScenarios,
      evidence,
      policyDecisions,
    });

    yield* fs.writeJson(options.paths.graphIndexPath, graph);
    yield* fs.writeJson(options.paths.mcpCatalogPath, {
      resources: graph.resources,
      resourceTemplates: graph.resourceTemplates,
    });

    const outputFingerprint = fingerprintProjectionOutput(graph);
    const manifest: ProjectionBuildManifest = {
      version: 1,
      projection: 'graph',
      inputSetFingerprint,
      outputFingerprint,
      inputs: sortedInputs,
    };
    yield* fs.writeJson(manifestPath, manifest);

    return {
      graph,
      graphPath: options.paths.graphIndexPath,
      mcpCatalogPath: options.paths.mcpCatalogPath,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      incremental: {
        status: 'cache-miss' as const,
        inputSetFingerprint,
        outputFingerprint,
        cacheInvalidationReason,
        changedInputs,
        removedInputs,
        rewritten: [
          relativeProjectPath(options.paths, options.paths.graphIndexPath),
          relativeProjectPath(options.paths, options.paths.mcpCatalogPath),
          relativeProjectPath(options.paths, manifestPath),
        ],
      },
    };
  });
}

export function ensureDerivedGraph(options: { paths: ProjectPaths }) {
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
