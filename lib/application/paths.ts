import path from 'path';
import { AdoId, ScreenId } from '../domain/identity';

export interface ProjectPaths {
  rootDir: string;
  adoSyncDir: string;
  snapshotDir: string;
  archiveDir: string;
  manifestPath: string;
  scenariosDir: string;
  knowledgeDir: string;
  surfacesDir: string;
  generatedDir: string;
  generatedTypesDir: string;
  tesseractDir: string;
  boundDir: string;
  evidenceDir: string;
  graphDir: string;
  graphIndexPath: string;
  mcpCatalogPath: string;
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
    generatedDir: path.join(rootDir, 'generated'),
    generatedTypesDir: path.join(rootDir, 'lib', 'generated'),
    tesseractDir: path.join(rootDir, '.tesseract'),
    boundDir: path.join(rootDir, '.tesseract', 'bound'),
    evidenceDir: path.join(rootDir, '.tesseract', 'evidence'),
    graphDir: path.join(rootDir, '.tesseract', 'graph'),
    graphIndexPath: path.join(rootDir, '.tesseract', 'graph', 'index.json'),
    mcpCatalogPath: path.join(rootDir, '.tesseract', 'graph', 'mcp-catalog.json'),
  };
}

export function snapshotPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.snapshotDir, `${adoId}.json`);
}

export function archiveSnapshotPath(paths: ProjectPaths, adoId: AdoId, revision: number): string {
  return path.join(paths.archiveDir, adoId, `${revision}.json`);
}

export function scenarioPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return path.join(paths.scenariosDir, suitePath, `${adoId}.scenario.yaml`);
}

export function boundPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.boundDir, `${adoId}.json`);
}

export function generatedSpecPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return path.join(paths.generatedDir, suitePath, `${adoId}.spec.ts`);
}

export function elementsPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.elements.yaml`);
}

export function posturesPath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.knowledgeDir, 'screens', `${screen}.postures.yaml`);
}

export function surfacePath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.surfacesDir, `${screen}.surface.yaml`);
}

export function knowledgeArtifactPath(paths: ProjectPaths, relativeArtifactPath: string): string {
  const normalized = relativeArtifactPath.replace(/^knowledge[\\/]/, '');
  return path.join(paths.knowledgeDir, normalized);
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

