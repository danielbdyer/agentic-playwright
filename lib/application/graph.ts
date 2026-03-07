import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { createSnapshotTemplateId } from '../domain/identity';
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
  ScreenElements,
  ScreenPostures,
  SurfaceGraph} from '../domain/types';
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
import { FileSystem } from './ports';
import type {
  ProjectPaths} from './paths';
import {
  generatedReviewPath,
  generatedSpecPath,
  generatedTracePath,
  relativeProjectPath,
} from './paths';
import { evaluateArtifactPolicy, loadTrustPolicy, policyDecisionGraphTarget } from './trust-policy';

interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
}

type FingerprintKind = 'snapshot' | 'surface' | 'elements' | 'postures' | 'hints' | 'patterns' | 'scenario' | 'bound' | 'evidence' | 'policy';

interface InputFingerprint {
  kind: FingerprintKind;
  path: string;
  fingerprint: string;
}

interface GraphBuildManifest {
  version: 1;
  projection: 'graph';
  inputSetFingerprint: string;
  outputFingerprint: string;
  inputs: InputFingerprint[];
}

type GraphCacheInvalidationReason = 'missing-output' | 'invalid-output';

function graphManifestPath(paths: ProjectPaths): string {
  return path.join(paths.graphDir, 'build-manifest.json');
}

function fingerprintArtifact(kind: FingerprintKind, artifactPath: string, artifact: unknown): InputFingerprint {
  return {
    kind,
    path: artifactPath,
    fingerprint: `sha256:${sha256(stableStringify(artifact))}`,
  };
}

function sortFingerprints(values: InputFingerprint[]): InputFingerprint[] {
  return [...values].sort((left, right) => {
    const kindOrder = left.kind.localeCompare(right.kind);
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return left.path.localeCompare(right.path);
  });
}

function computeInputSetFingerprint(inputs: InputFingerprint[]): string {
  return `sha256:${sha256(stableStringify(sortFingerprints(inputs)))}`;
}

function parseGraphManifest(value: unknown): GraphBuildManifest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<GraphBuildManifest>;
  if (maybe.version !== 1 || maybe.projection !== 'graph' || typeof maybe.inputSetFingerprint !== 'string' || typeof maybe.outputFingerprint !== 'string') {
    return null;
  }
  if (!Array.isArray(maybe.inputs)) {
    return null;
  }
  for (const input of maybe.inputs) {
    if (!input || typeof input !== 'object') {
      return null;
    }
    const entry = input as Partial<InputFingerprint>;
    if (
      (
        entry.kind !== 'snapshot'
        && entry.kind !== 'surface'
        && entry.kind !== 'elements'
        && entry.kind !== 'postures'
        && entry.kind !== 'hints'
        && entry.kind !== 'patterns'
        && entry.kind !== 'scenario'
        && entry.kind !== 'bound'
        && entry.kind !== 'evidence'
        && entry.kind !== 'policy'
      )
      || typeof entry.path !== 'string'
      || typeof entry.fingerprint !== 'string'
    ) {
      return null;
    }
  }

  return {
    version: 1,
    projection: 'graph',
    inputSetFingerprint: maybe.inputSetFingerprint,
    outputFingerprint: maybe.outputFingerprint,
    inputs: sortFingerprints(maybe.inputs as InputFingerprint[]),
  };
}

export function buildDerivedGraph(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const inputFingerprints: InputFingerprint[] = [];
    const trustPolicy = yield* loadTrustPolicy(options.paths);
    inputFingerprints.push(fingerprintArtifact('policy', relativeProjectPath(options.paths, options.paths.trustPolicyPath), trustPolicy));

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
      inputFingerprints.push(fingerprintArtifact('snapshot', artifactPath, snapshot));
    }

    const surfaceFiles = (yield* walkFiles(fs, options.paths.surfacesDir)).filter((filePath) => filePath.endsWith('.surface.yaml'));
    const surfaceGraphs: ArtifactEnvelope<SurfaceGraph>[] = [];
    for (const filePath of surfaceFiles) {
      const raw = yield* fs.readText(filePath);
      const surfaceGraph = yield* trySync(
        () => validateSurfaceGraph(YAML.parse(raw)),
        'surface-validation-failed',
        `Surface graph ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      surfaceGraphs.push({ artifact: surfaceGraph, artifactPath });
      inputFingerprints.push(fingerprintArtifact('surface', artifactPath, surfaceGraph));
    }

    const knowledgeSnapshotFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'snapshots'))).filter((filePath) => filePath.endsWith('.yaml'));
    const knowledgeSnapshots: KnowledgeSnapshotArtifact[] = knowledgeSnapshotFiles.map((filePath) => ({
      relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
      artifactPath: relativeProjectPath(options.paths, filePath),
    }));

    const screenKnowledgeFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens')));

    const elementFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.elements.yaml'));
    const screenElements: ArtifactEnvelope<ScreenElements>[] = [];
    for (const filePath of elementFiles) {
      const raw = yield* fs.readText(filePath);
      const elements = yield* trySync(
        () => validateScreenElements(YAML.parse(raw)),
        'elements-validation-failed',
        `Elements file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      screenElements.push({ artifact: elements, artifactPath });
      inputFingerprints.push(fingerprintArtifact('elements', artifactPath, elements));
    }

    const postureFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.postures.yaml'));
    const screenPostures: ArtifactEnvelope<ScreenPostures>[] = [];
    for (const filePath of postureFiles) {
      const raw = yield* fs.readText(filePath);
      const postures = yield* trySync(
        () => validateScreenPostures(YAML.parse(raw)),
        'postures-validation-failed',
        `Postures file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      screenPostures.push({ artifact: postures, artifactPath });
      inputFingerprints.push(fingerprintArtifact('postures', artifactPath, postures));
    }

    const hintFiles = screenKnowledgeFiles.filter((filePath) => filePath.endsWith('.hints.yaml'));
    const screenHints: ScreenHintsArtifact[] = [];
    for (const filePath of hintFiles) {
      const raw = yield* fs.readText(filePath);
      const hints = yield* trySync(
        () => validateScreenHints(YAML.parse(raw)),
        'screen-hints-validation-failed',
        `Screen hints file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      screenHints.push({ artifact: hints, artifactPath });
      inputFingerprints.push(fingerprintArtifact('hints', artifactPath, hints));
    }

    const patternFiles = (yield* walkFiles(fs, options.paths.patternsDir)).filter((filePath) => filePath.endsWith('.yaml'));
    const sharedPatterns: SharedPatternsArtifact[] = [];
    for (const filePath of patternFiles) {
      const raw = yield* fs.readText(filePath);
      const patterns = yield* trySync(
        () => validateSharedPatterns(YAML.parse(raw)),
        'shared-patterns-validation-failed',
        `Shared patterns file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      sharedPatterns.push({ artifact: patterns, artifactPath });
      inputFingerprints.push(fingerprintArtifact('patterns', artifactPath, patterns));
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
      inputFingerprints.push(fingerprintArtifact('scenario', artifactPath, scenario));
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
      inputFingerprints.push(fingerprintArtifact('bound', artifactPath, boundScenario));
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
      inputFingerprints.push(fingerprintArtifact('evidence', artifactPath, record));
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

    const inputs = sortFingerprints(inputFingerprints);
    const inputSetFingerprint = computeInputSetFingerprint(inputs);
    const manifestPath = graphManifestPath(options.paths);
    const manifestExists = yield* fs.exists(manifestPath);
    let previousManifest: GraphBuildManifest | null = null;
    if (manifestExists) {
      const rawManifest = yield* fs.readJson(manifestPath);
      previousManifest = parseGraphManifest(rawManifest);
    }

    const changedInputs = inputs
      .filter((entry) => previousManifest?.inputs.find((candidate) => candidate.kind === entry.kind && candidate.path === entry.path)?.fingerprint !== entry.fingerprint)
      .map((entry) => `${entry.kind}:${entry.path}`);
    const hasRemovedInputs = (previousManifest?.inputs ?? []).some(
      (entry) => !inputs.some((candidate) => candidate.kind === entry.kind && candidate.path === entry.path),
    );

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

