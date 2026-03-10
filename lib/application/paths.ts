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
  benchmarksDir: string;
  controlsDir: string;
  datasetsDir: string;
  resolutionControlsDir: string;
  runbooksDir: string;
  knowledgeDir: string;
  surfacesDir: string;
  patternsDir: string;
  generatedDir: string;
  generatedTypesDir: string;
  tesseractDir: string;
  discoveryDir: string;
  boundDir: string;
  tasksDir: string;
  runsDir: string;
  inboxDir: string;
  inboxIndexPath: string;
  inboxReportPath: string;
  benchmarkRunsDir: string;
  evidenceDir: string;
  confidenceDir: string;
  confidenceIndexPath: string;
  graphDir: string;
  graphIndexPath: string;
  mcpCatalogPath: string;
  policyDir: string;
  trustPolicyPath: string;
  approvalsDir: string;
}

export function createProjectPaths(rootDir: string): ProjectPaths {
  return {
    rootDir,
    adoSyncDir: path.join(rootDir, '.ado-sync'),
    snapshotDir: path.join(rootDir, '.ado-sync', 'snapshots'),
    archiveDir: path.join(rootDir, '.ado-sync', 'archive'),
    manifestPath: path.join(rootDir, '.ado-sync', 'manifest.json'),
    scenariosDir: path.join(rootDir, 'scenarios'),
    benchmarksDir: path.join(rootDir, 'benchmarks'),
    controlsDir: path.join(rootDir, 'controls'),
    datasetsDir: path.join(rootDir, 'controls', 'datasets'),
    resolutionControlsDir: path.join(rootDir, 'controls', 'resolution'),
    runbooksDir: path.join(rootDir, 'controls', 'runbooks'),
    knowledgeDir: path.join(rootDir, 'knowledge'),
    surfacesDir: path.join(rootDir, 'knowledge', 'surfaces'),
    patternsDir: path.join(rootDir, 'knowledge', 'patterns'),
    generatedDir: path.join(rootDir, 'generated'),
    generatedTypesDir: path.join(rootDir, 'lib', 'generated'),
    tesseractDir: path.join(rootDir, '.tesseract'),
    discoveryDir: path.join(rootDir, '.tesseract', 'discovery'),
    boundDir: path.join(rootDir, '.tesseract', 'bound'),
    tasksDir: path.join(rootDir, '.tesseract', 'tasks'),
    runsDir: path.join(rootDir, '.tesseract', 'runs'),
    inboxDir: path.join(rootDir, '.tesseract', 'inbox'),
    inboxIndexPath: path.join(rootDir, '.tesseract', 'inbox', 'index.json'),
    inboxReportPath: path.join(rootDir, 'generated', 'operator', 'inbox.md'),
    benchmarkRunsDir: path.join(rootDir, '.tesseract', 'benchmarks'),
    evidenceDir: path.join(rootDir, '.tesseract', 'evidence'),
    confidenceDir: path.join(rootDir, '.tesseract', 'confidence'),
    confidenceIndexPath: path.join(rootDir, '.tesseract', 'confidence', 'index.json'),
    graphDir: path.join(rootDir, '.tesseract', 'graph'),
    graphIndexPath: path.join(rootDir, '.tesseract', 'graph', 'index.json'),
    mcpCatalogPath: path.join(rootDir, '.tesseract', 'graph', 'mcp-catalog.json'),
    policyDir: path.join(rootDir, '.tesseract', 'policy'),
    trustPolicyPath: path.join(rootDir, '.tesseract', 'policy', 'trust-policy.yaml'),
    approvalsDir: path.join(rootDir, '.tesseract', 'policy', 'approvals'),
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

export function datasetControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.datasetsDir, `${name}.dataset.yaml`, 'name');
}

export function benchmarkDefinitionPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.benchmarksDir, `${name}.benchmark.yaml`, 'name');
}

export function resolutionControlPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.resolutionControlsDir, `${name}.resolution.yaml`, 'name');
}

export function runbookPath(paths: ProjectPaths, name: string): string {
  return resolvePathWithinRoot(paths.runbooksDir, `${name}.runbook.yaml`, 'name');
}

export function taskPacketPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.tasksDir, `${adoId}.resolution.json`);
}

export function runDirPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(paths.runsDir, `${adoId}`, runId);
}

export function interpretationPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'interpretation.json');
}

export function executionPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'execution.json');
}

export function runRecordPath(paths: ProjectPaths, adoId: AdoId, runId: string): string {
  return path.join(runDirPath(paths, adoId, runId), 'run.json');
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

export function generatedProposalsPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join(suitePath, `${adoId}.proposals.json`), 'suitePath');
}

export function emitManifestPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(path.join(paths.tesseractDir, 'emit'), path.join(suitePath, `${adoId}.manifest.json`), 'suitePath');
}

export function approvalReceiptPath(paths: ProjectPaths, proposalId: string): string {
  return resolvePathWithinRoot(paths.approvalsDir, `${proposalId}.approval.json`, 'proposalId');
}

export function rerunPlanPath(paths: ProjectPaths, planId: string): string {
  return resolvePathWithinRoot(paths.inboxDir, `${planId}.rerun-plan.json`, 'planId');
}

export function benchmarkRunDirPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.benchmarkRunsDir, benchmarkName, 'benchmarkName');
}

export function benchmarkDogfoodRunPath(paths: ProjectPaths, benchmarkName: string, runId: string): string {
  return resolvePathWithinRoot(benchmarkRunDirPath(paths, benchmarkName), `${runId}.dogfood-run.json`, 'runId');
}

export function benchmarkScorecardJsonPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.json`), 'benchmarkName');
}

export function benchmarkScorecardMarkdownPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.scorecard.md`), 'benchmarkName');
}

export function benchmarkVariantsSpecPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.spec.ts`), 'benchmarkName');
}

export function benchmarkVariantsTracePath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.trace.json`), 'benchmarkName');
}

export function benchmarkVariantsReviewPath(paths: ProjectPaths, benchmarkName: string): string {
  return resolvePathWithinRoot(paths.generatedDir, path.join('benchmarks', `${benchmarkName}.variants.review.md`), 'benchmarkName');
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

export function surfacePath(paths: ProjectPaths, screen: ScreenId): string {
  return path.join(paths.surfacesDir, `${screen}.surface.yaml`);
}

export function patternDocumentPath(paths: ProjectPaths, fileName: string): string {
  return path.join(paths.patternsDir, fileName);
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
