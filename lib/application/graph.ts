import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import type {
  BoundScenarioGraphArtifact,
  EvidenceArtifact,
  KnowledgeSnapshotArtifact,
  PolicyDecisionArtifact,
  ScenarioGraphArtifact,
  ScreenHintsArtifact,
  SharedPatternsArtifact} from '../domain/derived-graph';
import {
  deriveGraph
} from '../domain/derived-graph';
import type {
  AdoSnapshot,
  EvidenceRecord,
  ProposedChangeMetadata,
} from '../domain/types';
import {
  validateAdoSnapshot,
  validateBoundScenario,
  validateDerivedGraph,
  validateScenario,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSharedPatterns,
  validateSurfaceGraph,
} from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { listKnowledgeSnapshotArtifacts, listValidatedYamlArtifacts } from './knowledge';
import { FileSystem } from './ports';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  fingerprintProjectionInput,
  parseProjectionManifest,
  sortProjectionInputs,
  type ProjectionBuildManifest,
  type ProjectionInputFingerprint,
} from './projection-cache';
import type {
  ProjectPaths} from './paths';
import {
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  relativeProjectPath,
} from './paths';
import { evaluateArtifactPolicy, loadTrustPolicy, policyDecisionGraphTarget } from './trust-policy';

type FingerprintKind = 'snapshot' | 'surface' | 'elements' | 'postures' | 'hints' | 'patterns' | 'scenario' | 'bound' | 'evidence' | 'policy';
type InputFingerprint = ProjectionInputFingerprint<FingerprintKind>;
type GraphBuildManifest = ProjectionBuildManifest<'graph', FingerprintKind>;

type GraphCacheInvalidationReason = 'missing-output' | 'invalid-output';

interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
}

function graphManifestPath(paths: ProjectPaths): string {
  return path.join(paths.graphDir, 'build-manifest.json');
}

function isGraphFingerprintKind(value: unknown): value is FingerprintKind {
  return (
    value === 'snapshot'
    || value === 'surface'
    || value === 'elements'
    || value === 'postures'
    || value === 'hints'
    || value === 'patterns'
    || value === 'scenario'
    || value === 'bound'
    || value === 'evidence'
    || value === 'policy'
  );
}

export function buildDerivedGraph(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const inputFingerprints: InputFingerprint[] = [];
    const trustPolicy = yield* loadTrustPolicy(options.paths);
    inputFingerprints.push(fingerprintProjectionInput('policy', relativeProjectPath(options.paths, options.paths.trustPolicyPath), trustPolicy));

    const snapshotFiles = (yield* walkFiles(fs, options.paths.snapshotDir)).filter((filePath) => filePath.endsWith('.json'));
    const snapshots: ArtifactEnvelope<AdoSnapshot>[] = [];
    for (const filePath of snapshotFiles) {
      const raw = yield* fs.readJson(filePath);
      const snapshot = yield* trySync(
        () => validateAdoSnapshot(raw),
        'snapshot-validation-failed',
        `Snapshot ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      snapshots.push({ artifact: snapshot, artifactPath });
      inputFingerprints.push(fingerprintProjectionInput('snapshot', artifactPath, snapshot));
    }

    const surfaceGraphs = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: options.paths.surfacesDir,
      suffix: '.surface.yaml',
      validate: validateSurfaceGraph,
      errorCode: 'surface-validation-failed',
      errorMessage: (artifactPath) => `Surface graph ${artifactPath} failed validation`,
    });
    for (const { artifact, artifactPath } of surfaceGraphs) {
      inputFingerprints.push(fingerprintProjectionInput('surface', artifactPath, artifact));
    }

    const knowledgeSnapshots: KnowledgeSnapshotArtifact[] = (yield* listKnowledgeSnapshotArtifacts({ paths: options.paths }))
      .map(({ relativePath, artifactPath }) => ({ relativePath, artifactPath }));

    const screenElements = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.elements.yaml',
      validate: validateScreenElements,
      errorCode: 'elements-validation-failed',
      errorMessage: (artifactPath) => `Elements file ${artifactPath} failed validation`,
    });
    for (const { artifact, artifactPath } of screenElements) {
      inputFingerprints.push(fingerprintProjectionInput('elements', artifactPath, artifact));
    }

    const screenPostures = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.postures.yaml',
      validate: validateScreenPostures,
      errorCode: 'postures-validation-failed',
      errorMessage: (artifactPath) => `Postures file ${artifactPath} failed validation`,
    });
    for (const { artifact, artifactPath } of screenPostures) {
      inputFingerprints.push(fingerprintProjectionInput('postures', artifactPath, artifact));
    }

    const screenHints: ScreenHintsArtifact[] = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.hints.yaml',
      validate: validateScreenHints,
      errorCode: 'screen-hints-validation-failed',
      errorMessage: (artifactPath) => `Screen hints file ${artifactPath} failed validation`,
    });
    for (const { artifact, artifactPath } of screenHints) {
      inputFingerprints.push(fingerprintProjectionInput('hints', artifactPath, artifact));
    }

    const sharedPatterns: SharedPatternsArtifact[] = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: options.paths.patternsDir,
      suffix: '.yaml',
      validate: validateSharedPatterns,
      errorCode: 'shared-patterns-validation-failed',
      errorMessage: (artifactPath) => `Shared patterns file ${artifactPath} failed validation`,
    });
    for (const { artifact, artifactPath } of sharedPatterns) {
      inputFingerprints.push(fingerprintProjectionInput('patterns', artifactPath, artifact));
    }

    const scenarioFiles = (yield* walkFiles(fs, options.paths.scenariosDir)).filter((filePath) => filePath.endsWith('.scenario.yaml'));
    const scenarios: ScenarioGraphArtifact[] = [];
    for (const filePath of scenarioFiles) {
      const raw = yield* fs.readText(filePath);
      const scenario = yield* trySync(
        () => validateScenario(YAML.parse(raw)),
        'scenario-validation-failed',
        `Scenario ${filePath} failed validation`,
      );
      const generatedPath = generatedSpecPath(options.paths, scenario.metadata.suite, scenario.source.ado_id);
      const tracePath = generatedTracePath(options.paths, scenario.metadata.suite, scenario.source.ado_id);
      const reviewPath = generatedReviewPath(options.paths, scenario.metadata.suite, scenario.source.ado_id);
      const artifactPath = relativeProjectPath(options.paths, filePath);
      scenarios.push({
        artifact: scenario,
        artifactPath,
        generatedSpecPath: relativeProjectPath(options.paths, generatedPath),
        generatedSpecExists: yield* fs.exists(generatedPath),
        generatedTracePath: relativeProjectPath(options.paths, tracePath),
        generatedTraceExists: yield* fs.exists(tracePath),
        generatedReviewPath: relativeProjectPath(options.paths, reviewPath),
        generatedReviewExists: yield* fs.exists(reviewPath),
      });
      inputFingerprints.push(fingerprintProjectionInput('scenario', artifactPath, scenario));
    }

    const boundFiles = (yield* walkFiles(fs, options.paths.boundDir)).filter((filePath) => filePath.endsWith('.json'));
    const boundScenarios: BoundScenarioGraphArtifact[] = [];
    for (const filePath of boundFiles) {
      const raw = yield* fs.readJson(filePath);
      const boundScenario = yield* trySync(
        () => validateBoundScenario(raw),
        'bound-scenario-validation-failed',
        `Bound scenario ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      boundScenarios.push({ artifact: boundScenario, artifactPath });
      inputFingerprints.push(fingerprintProjectionInput('bound', artifactPath, boundScenario));
    }

    const evidenceFiles = (yield* walkFiles(fs, options.paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const evidenceRecords: Array<{ artifactPath: string; record: EvidenceRecord }> = [];
    const evidence: EvidenceArtifact[] = [];
    for (const filePath of evidenceFiles) {
      const artifactPath = relativeProjectPath(options.paths, filePath);
      const record = (yield* fs.readJson(filePath)) as EvidenceRecord;
      const targetNodeId = policyDecisionGraphTarget({
        artifactType: record.evidence.scope as ProposedChangeMetadata['artifactType'],
        artifactPath: record.evidence.proposal.file,
      });
      evidence.push({ artifactPath, targetNodeId });
      evidenceRecords.push({ artifactPath, record });
      inputFingerprints.push(fingerprintProjectionInput('evidence', artifactPath, record));
    }

    const policyDecisions: PolicyDecisionArtifact[] = evidenceRecords.map(({ artifactPath, record }) => {
      const proposedChange: ProposedChangeMetadata = {
        artifactType: record.evidence.scope as ProposedChangeMetadata['artifactType'],
        confidence: record.evidence.confidence,
        autoHealClass: record.evidence.trigger,
      };
      const evaluation = evaluateArtifactPolicy({
        policy: trustPolicy,
        proposedChange,
        evidence: evidenceRecords.map((entry) => ({ artifactPath: entry.artifactPath, record: entry.record })),
      });
      const targetNodeId = policyDecisionGraphTarget({
        artifactType: proposedChange.artifactType,
        artifactPath: record.evidence.proposal.file,
      });
      const decisionId = `${artifactPath}:${evaluation.decision}`;
      return {
        id: decisionId,
        decision: evaluation.decision,
        artifactPath,
        targetNodeId,
        reasons: evaluation.reasons.map((reason) => reason.message),
      };
    });

    const inputs = sortProjectionInputs(inputFingerprints);
    const inputSetFingerprint = computeProjectionInputSetFingerprint(inputs);
    const manifestPath = graphManifestPath(options.paths);
    const manifestExists = yield* fs.exists(manifestPath);
    let previousManifest: GraphBuildManifest | null = null;
    if (manifestExists) {
      const rawManifest = yield* fs.readJson(manifestPath);
      previousManifest = parseProjectionManifest(rawManifest, {
        projection: 'graph',
        isKind: isGraphFingerprintKind,
      });
    }

    const { changedInputs, removedInputs: hasRemovedInputs } = diffProjectionInputs(inputs, previousManifest?.inputs);

    let cacheInvalidationReason: GraphCacheInvalidationReason | null = null;
    if (previousManifest && previousManifest.inputSetFingerprint === inputSetFingerprint) {
      const cachedGraphExists = yield* fs.exists(options.paths.graphIndexPath);
      if (!cachedGraphExists) {
        cacheInvalidationReason = 'missing-output';
      } else {
        const cachedGraphRaw = yield* fs.readJson(options.paths.graphIndexPath);
        const outputFingerprint = `sha256:${sha256(stableStringify(cachedGraphRaw))}`;

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
                removedInputs: hasRemovedInputs,
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

    const persistedGraph = JSON.parse(JSON.stringify(graph)) as unknown;
    const outputFingerprint = `sha256:${sha256(stableStringify(persistedGraph))}`;
    const manifest: GraphBuildManifest = {
      version: 1,
      projection: 'graph',
      inputSetFingerprint,
      outputFingerprint,
      inputs,
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
        removedInputs: hasRemovedInputs,
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

