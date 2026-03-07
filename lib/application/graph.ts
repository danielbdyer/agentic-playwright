import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { sha256, stableStringify } from '../domain/hash';
import { createSnapshotTemplateId } from '../domain/identity';
import { deriveGraph, EvidenceArtifact, ExpandedScenarioGraphArtifact, KnowledgeSnapshotArtifact, ScenarioGraphArtifact, ScenarioTemplateGraphArtifact } from '../domain/derived-graph';
import { AdoSnapshot, ExpandedScenarioSet, ScenarioTemplateArtifact, ScreenElements, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateAdoSnapshot, validateDerivedGraph, validateScenario, validateScenarioTemplateArtifact, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { FileSystem } from './ports';
import { generatedSpecPath, ProjectPaths, relativeProjectPath } from './paths';

interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
}

type FingerprintKind = 'snapshot' | 'surface' | 'elements' | 'postures' | 'scenario' | 'template' | 'expanded-scenario';

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
      (entry.kind !== 'snapshot' && entry.kind !== 'surface' && entry.kind !== 'elements' && entry.kind !== 'postures' && entry.kind !== 'scenario' && entry.kind !== 'template' && entry.kind !== 'expanded-scenario')
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
      snapshots.push({
        artifact: snapshot,
        artifactPath,
      });
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
      surfaceGraphs.push({
        artifact: surfaceGraph,
        artifactPath,
      });
      inputFingerprints.push(fingerprintArtifact('surface', artifactPath, surfaceGraph));
    }

    const knowledgeSnapshotFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'snapshots'))).filter((filePath) => filePath.endsWith('.yaml'));
    const knowledgeSnapshots: KnowledgeSnapshotArtifact[] = knowledgeSnapshotFiles.map((filePath) => ({
      relativePath: createSnapshotTemplateId(relativeProjectPath(options.paths, filePath).replace(/^knowledge\//, '')),
      artifactPath: relativeProjectPath(options.paths, filePath),
    }));

    const elementFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'))).filter((filePath) => filePath.endsWith('.elements.yaml'));
    const screenElements: ArtifactEnvelope<ScreenElements>[] = [];
    for (const filePath of elementFiles) {
      const raw = yield* fs.readText(filePath);
      const elements = yield* trySync(
        () => validateScreenElements(YAML.parse(raw)),
        'elements-validation-failed',
        `Elements file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      screenElements.push({
        artifact: elements,
        artifactPath,
      });
      inputFingerprints.push(fingerprintArtifact('elements', artifactPath, elements));
    }

    const postureFiles = (yield* walkFiles(fs, path.join(options.paths.knowledgeDir, 'screens'))).filter((filePath) => filePath.endsWith('.postures.yaml'));
    const screenPostures: ArtifactEnvelope<ScreenPostures>[] = [];
    for (const filePath of postureFiles) {
      const raw = yield* fs.readText(filePath);
      const postures = yield* trySync(
        () => validateScreenPostures(YAML.parse(raw)),
        'postures-validation-failed',
        `Postures file ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      screenPostures.push({
        artifact: postures,
        artifactPath,
      });
      inputFingerprints.push(fingerprintArtifact('postures', artifactPath, postures));
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
      const artifactPath = relativeProjectPath(options.paths, filePath);
      scenarios.push({
        artifact: scenario,
        artifactPath,
        generatedSpecPath: relativeProjectPath(options.paths, generatedPath),
        generatedSpecExists: yield* fs.exists(generatedPath),
      });
      inputFingerprints.push(fingerprintArtifact('scenario', artifactPath, scenario));
    }


    const templateFiles = (yield* walkFiles(fs, options.paths.scenarioTemplatesDir)).filter((filePath) => filePath.endsWith('.yaml'));
    const scenarioTemplates: ScenarioTemplateGraphArtifact[] = [];
    for (const filePath of templateFiles) {
      const raw = yield* fs.readText(filePath);
      const template = yield* trySync(
        () => validateScenarioTemplateArtifact(YAML.parse(raw)),
        'scenario-template-validation-failed',
        `Scenario template ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      scenarioTemplates.push({ artifact: template as ScenarioTemplateArtifact, artifactPath });
      inputFingerprints.push(fingerprintArtifact('template', artifactPath, template));
    }

    const expandedFiles = (yield* walkFiles(fs, path.join(options.paths.boundDir, 'expanded'))).filter((filePath) => filePath.endsWith('.expanded.json'));
    const expandedScenarios: ExpandedScenarioGraphArtifact[] = [];
    for (const filePath of expandedFiles) {
      const raw = yield* fs.readJson(filePath);
      const expanded = raw as ExpandedScenarioSet;
      const artifactPath = relativeProjectPath(options.paths, filePath);
      expandedScenarios.push({ artifact: expanded, artifactPath });
      inputFingerprints.push(fingerprintArtifact('expanded-scenario', artifactPath, expanded));
    }

    const evidenceFiles = (yield* walkFiles(fs, options.paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const evidence: EvidenceArtifact[] = evidenceFiles.map((filePath) => ({
      artifactPath: relativeProjectPath(options.paths, filePath),
    }));

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
      scenarios,
      scenarioTemplates,
      expandedScenarios,
      evidence,
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
