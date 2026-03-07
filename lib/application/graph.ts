import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { createSnapshotTemplateId } from '../domain/identity';
import { deriveGraph, EvidenceArtifact, KnowledgeSnapshotArtifact, ScenarioGraphArtifact } from '../domain/derived-graph';
import { AdoSnapshot, ScreenElements, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateAdoSnapshot, validateDerivedGraph, validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { FileSystem } from './ports';
import { generatedSpecPath, ProjectPaths, relativeProjectPath } from './paths';

interface ArtifactEnvelope<T> {
  artifact: T;
  artifactPath: string;
}

export function buildDerivedGraph(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;

    const snapshotFiles = (yield* walkFiles(fs, options.paths.snapshotDir)).filter((filePath) => filePath.endsWith('.json'));
    const snapshots: ArtifactEnvelope<AdoSnapshot>[] = [];
    for (const filePath of snapshotFiles) {
      const raw = yield* fs.readJson(filePath);
      const snapshot = yield* trySync(
        () => validateAdoSnapshot(raw),
        'snapshot-validation-failed',
        `Snapshot ${filePath} failed validation`,
      );
      snapshots.push({
        artifact: snapshot,
        artifactPath: relativeProjectPath(options.paths, filePath),
      });
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
      surfaceGraphs.push({
        artifact: surfaceGraph,
        artifactPath: relativeProjectPath(options.paths, filePath),
      });
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
      screenElements.push({
        artifact: elements,
        artifactPath: relativeProjectPath(options.paths, filePath),
      });
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
      screenPostures.push({
        artifact: postures,
        artifactPath: relativeProjectPath(options.paths, filePath),
      });
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
      scenarios.push({
        artifact: scenario,
        artifactPath: relativeProjectPath(options.paths, filePath),
        generatedSpecPath: relativeProjectPath(options.paths, generatedPath),
        generatedSpecExists: yield* fs.exists(generatedPath),
      });
    }

    const evidenceFiles = (yield* walkFiles(fs, options.paths.evidenceDir)).filter((filePath) => filePath.endsWith('.json'));
    const evidence: EvidenceArtifact[] = evidenceFiles.map((filePath) => ({
      artifactPath: relativeProjectPath(options.paths, filePath),
    }));

    const graph = deriveGraph({
      snapshots,
      surfaceGraphs,
      knowledgeSnapshots,
      screenElements,
      screenPostures,
      scenarios,
      evidence,
    });

    yield* fs.writeJson(options.paths.graphIndexPath, graph);
    yield* fs.writeJson(options.paths.mcpCatalogPath, {
      resources: graph.resources,
      resourceTemplates: graph.resourceTemplates,
    });

    return {
      graph,
      graphPath: options.paths.graphIndexPath,
      mcpCatalogPath: options.paths.mcpCatalogPath,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
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
    };
  });
}

