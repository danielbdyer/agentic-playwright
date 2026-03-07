import path from 'path';
import { SchemaError } from '../domain/errors';
import type { AdoId, ScreenId } from '../domain/identity';

export interface ProjectPaths {
  rootDir: string;
  adoSyncDir: string;
  snapshotDir: string;
  archiveDir: string;
  manifestPath: string;
  scenariosDir: string;
  knowledgeDir: string;
  surfacesDir: string;
  patternsDir: string;
  generatedDir: string;
  generatedTypesDir: string;
  tesseractDir: string;
  boundDir: string;
  evidenceDir: string;
  graphDir: string;
  graphIndexPath: string;
  mcpCatalogPath: string;
  policyDir: string;
  trustPolicyPath: string;
}

export function createProjectPaths(rootDir: string): ProjectPaths {
  return {
    rootDir,
    adoSyncDir: path.join(rootDir, '.ado-sync'),
    snapshotDir: path.join(rootDir, '.ado-sync', 'snapshots'),
    archiveDir: path.join(rootDir, '.ado-sync', 'archive'),
    manifestPath: path.join(rootDir, '.ado-sync', 'manifest.json'),
    scenariosDir: path.join(rootDir, 'scenarios'),
    knowledgeDir: path.join(rootDir, 'knowledge'),
    surfacesDir: path.join(rootDir, 'knowledge', 'surfaces'),
    patternsDir: path.join(rootDir, 'knowledge', 'patterns'),
    generatedDir: path.join(rootDir, 'generated'),
    generatedTypesDir: path.join(rootDir, 'lib', 'generated'),
    tesseractDir: path.join(rootDir, '.tesseract'),
    boundDir: path.join(rootDir, '.tesseract', 'bound'),
    evidenceDir: path.join(rootDir, '.tesseract', 'evidence'),
    graphDir: path.join(rootDir, '.tesseract', 'graph'),
    graphIndexPath: path.join(rootDir, '.tesseract', 'graph', 'index.json'),
    mcpCatalogPath: path.join(rootDir, '.tesseract', 'graph', 'mcp-catalog.json'),
    policyDir: path.join(rootDir, '.tesseract', 'policy'),
    trustPolicyPath: path.join(rootDir, '.tesseract', 'policy', 'trust-policy.yaml'),
  };
}

function resolvePathWithinRoot(rootDir: string, pathLike: string, valuePath: string): string {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(resolvedRoot, pathLike);
  const relativeToRoot = path.relative(resolvedRoot, resolvedCandidate);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new SchemaError('resolved path escapes expected root', valuePath);
  }

  return resolvedCandidate;
}

export function snapshotPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.snapshotDir, `${adoId}.json`);
}

export function archiveSnapshotPath(paths: ProjectPaths, adoId: AdoId, revision: number): string {
  return path.join(paths.archiveDir, adoId, `${revision}.json`);
}

export function scenarioPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.scenariosDir, path.join(suitePath, `${adoId}.scenario.yaml`), 'suitePath');
}

export function boundPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.boundDir, `${adoId}.json`);
}

export function generatedSpecPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.spec.ts`), 'suitePath');
}

export function generatedTracePath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.trace.json`), 'suitePath');
}

export function generatedReviewPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.review.md`), 'suitePath');
}

export function elementsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.elements.yaml`);
}

export function posturesPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.postures.yaml`);
}

export function hintsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.hints.yaml`);
}

export function sharedPatternsPath(paths: ProjectPaths): string {
  return path.join(paths.patternsDir, 'core.patterns.yaml');
}

export function surfacePath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.surfacesDir, `${screen}.surface.yaml`);
}

export function knowledgeArtifactPath(paths: ProjectPaths, relativeArtifactPath: string): string {
  const normalized = relativeArtifactPath.replace(/^knowledge[\\/]/, '');
  return resolvePathWithinRoot(paths.knowledgeDir, normalized, 'relativeArtifactPath');
}

export function generatedKnowledgePath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'tesseract-knowledge.ts');
}

export function agentDslPath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'agent-dsl.ts');
}

export function relativeProjectPath(paths: ProjectPaths, absolutePath: string): string {
  return path.relative(paths.rootDir, absolutePath).replace(/\\/g, '/');
}
